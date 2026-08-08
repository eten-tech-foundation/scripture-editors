/**
 * The READ-ONLY settle. `EditorRef.getUsj()` must hand consumers the canonical document — the one a
 * Tier-2 settle would produce — while the user's pending edits stay pending on screen. Settling is
 * re-tokenization of displayed bytes, which is a pure computation, so this recomputes it into the
 * OUTPUT instead of mutating the editor: it runs the SAME fragment build + tokenize + serialize
 * pipeline `$rebuildParas`/`$rebuildNoteContent` run, over a throwaway JSON copy of the editor
 * state.
 *
 * The one half that cannot be literally shared with the mutating rebuild is materialization: a real
 * settle parses the tokenizer's output into live nodes and splices them into the tree, and Lexical
 * forbids creating nodes inside a `read()`. So the splice happens in the SERIALIZED domain here —
 * the same `usjEditorAdaptor.serializeEditorState` output the mutating path parses, spliced as JSON
 * — and one `deserializeSerializedEditorState` (editor-usj.adaptor.ts) over the patched document produces
 * the result, so text coalescing, implied-para flattening, and every display-byte exclusion gate
 * behave exactly as they do for an unsettled read. That divergence is the wave's named risk, and
 * `settledGetUsj.test.tsx`'s equivalence property is what holds the two halves together.
 *
 * Uniform by design: there is NO caret-held exception. A half-typed `|stuf` settles to literal
 * content in the output, because that is what those bytes mean to anything downstream that parses
 * them; the mutating settle's caret grace exists to avoid re-tokenizing under a live caret, which a
 * computation that never touches the tree cannot do.
 */

// `deserializeSerializedEditorState` is a plain named export, not part of the default-exported
// `editorUsjAdaptor` object (whose `EditorUsjAdaptor` interface lists only `initialize` and
// `deserializeEditorState`) — every other caller in this codebase reaches it the same way.
import { deserializeSerializedEditorState } from "../adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import {
  $buildParaFragment,
  $settleScopeForNode,
  ATOMIC_SENTINEL,
  countSentinels,
  FragmentAccumulator,
  Tier2Context,
} from "./tier2Rebuild.utils";
import {
  MarkerContent,
  USJ_TYPE,
  USJ_VERSION,
  Usj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  LexicalNode,
  NodeKey,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import { $isNoteNode, NoteNode, ParaNode, usfmFragmentToUsjContent } from "shared";

/** Where a live node's serialized counterpart sits: the JSON node itself, plus the children array
 * holding it (the array a splice must target — its index is re-read at splice time, since earlier
 * splices into the same array shift positions). */
interface SerializedSite {
  readonly node: SerializedLexicalNode;
  readonly siblings: SerializedLexicalNode[];
}

/** A serialized element's children, or `undefined` for a leaf. */
function serializedChildren(node: SerializedLexicalNode): SerializedLexicalNode[] | undefined {
  const { children } = node as { children?: SerializedLexicalNode[] };
  return Array.isArray(children) ? children : undefined;
}

/** A serialized TextNode's text, or `undefined` for anything else. */
function serializedText(node: SerializedLexicalNode): string | undefined {
  const { text } = node as { text?: string };
  return typeof text === "string" ? text : undefined;
}

/**
 * Pair every live node with its serialized counterpart. `EditorState.toJSON()` exports children in
 * tree order, so a parallel walk is exact — and it is the only way to make the pairing, since
 * serialized nodes carry no keys.
 */
function $mapSerializedSites(
  liveNodes: LexicalNode[],
  serializedNodes: SerializedLexicalNode[],
  out: Map<NodeKey, SerializedSite>,
): void {
  const count = Math.min(liveNodes.length, serializedNodes.length);
  for (let index = 0; index < count; index++) {
    const live = liveNodes[index];
    const json = serializedNodes[index];
    out.set(live.getKey(), { node: json, siblings: serializedNodes });
    const children = serializedChildren(json);
    if (children && $isElementNode(live)) $mapSerializedSites(live.getChildren(), children, out);
  }
}

/** U+FFFC occurrences across a serialized tree — the serialize-side half of the symmetry bail-out
 * (`$rebuildParas` counts them on its parsed tree; there is no parsed tree here). */
function countSerializedSentinels(nodes: SerializedLexicalNode[]): number {
  let count = 0;
  for (const node of nodes) {
    const children = serializedChildren(node);
    if (children) {
      count += countSerializedSentinels(children);
      continue;
    }
    const text = serializedText(node);
    if (text !== undefined)
      for (const character of text) if (character === ATOMIC_SENTINEL) count++;
  }
  return count;
}

/**
 * Replace each U+FFFC in a freshly serialized rebuild tree with the serialized form of the
 * preserved node run it stands for, in fragment order — the JSON analogue of `$replaceSentinels`.
 * A placeholder's own text node is split around it, so a preserved node lands exactly where its
 * placeholder stood and never migrates to a block boundary.
 */
function replaceSerializedSentinels(
  roots: SerializedLexicalNode[],
  runs: SerializedLexicalNode[][],
): void {
  let queueIndex = 0;
  const visitList = (list: SerializedLexicalNode[]): void => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      const children = serializedChildren(node);
      if (children) {
        visitList(children);
        continue;
      }
      const text = serializedText(node);
      if (text === undefined || !text.includes(ATOMIC_SENTINEL)) continue;
      const pieces = text.split(ATOMIC_SENTINEL);
      const replacement: SerializedLexicalNode[] = [];
      // A plain `for` loop rather than `pieces.forEach(...)`: a closure here would capture
      // `queueIndex`, `replacement`, and `node` from the ENCLOSING `for` loop over `list` — ESLint's
      // `no-loop-func` flags exactly that shape, since a function re-created every outer iteration
      // capturing outer-loop state is a common source of stale-closure bugs. No closure, no risk.
      for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
        const piece = pieces[pieceIndex];
        if (pieceIndex > 0) replacement.push(...(runs[queueIndex++] ?? []));
        // Spread the placeholder's own node so a split piece keeps its format and node state
        // (a text run's textType tag rides there). The cast is safe: `serializedText` already
        // confirmed `node` carries a string `text` field before this branch runs, but
        // `SerializedLexicalNode` itself declares no such field (only concrete leaf subtypes do).
        // Assigned to an untyped local first: pushed straight as an object literal, the spread
        // would trip excess-property checking against the array's `SerializedLexicalNode` element
        // type even though the `text` field it carries is real and already type-narrowed above.
        if (piece.length > 0) {
          const piecePlaceholder = {
            ...(node as SerializedLexicalNode & { text: string }),
            text: piece,
          };
          replacement.push(piecePlaceholder);
        }
      }
      list.splice(index, 1, ...replacement);
      index += replacement.length - 1;
    }
  };
  visitList(roots);
}

/** The serialized counterparts of one fragment's preserved runs, or `undefined` when any node in
 * them has none (a shape the parallel walk could not pair — abort rather than drop a node). */
function serializedRunsOf(
  fragment: FragmentAccumulator,
  sites: Map<NodeKey, SerializedSite>,
): SerializedLexicalNode[][] | undefined {
  const runs: SerializedLexicalNode[][] = [];
  for (const run of fragment.sentinels) {
    const serializedRun: SerializedLexicalNode[] = [];
    for (const node of run) {
      const site = sites.get(node.getKey());
      if (!site) return undefined;
      serializedRun.push(site.node);
    }
    runs.push(serializedRun);
  }
  return runs;
}

/**
 * The serialized nodes a settled `para` becomes, or `undefined` when the settle refuses. Mirrors
 * `$rebuildParas`' guard sequence — guard rails, empty tokenizer output, sentinel symmetry — so a
 * paragraph the mutating rebuild would leave alone is left alone here too. The fixed-point
 * signature check is deliberately absent: refusing a no-op matters only when a splice would re-arm
 * a transform and loop, and nothing here mutates the editor, so splicing an identical result into
 * the output is simply the identity.
 */
function $settledParaNodes(
  para: ParaNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
): SerializedLexicalNode[] | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const fragment = $buildParaFragment(para, getMarkerFn);
  if (!fragment) return undefined;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragment.text, {
    getMarker: getMarkerFn,
  });
  if (content.length === 0) return undefined;
  if (countSentinels(content) !== fragment.sentinels.length) {
    logger?.warn("[MarkerEdit] Settled USJ skipped: sentinel/preserved-node count mismatch");
    return undefined;
  }
  const rebuilt = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  ).root.children;
  if (countSerializedSentinels(rebuilt) !== fragment.sentinels.length) {
    logger?.warn(
      "[MarkerEdit] Settled USJ skipped: serialized sentinel/preserved-node count mismatch",
    );
    return undefined;
  }
  const runs = serializedRunsOf(fragment, sites);
  if (!runs) {
    logger?.warn("[MarkerEdit] Settled USJ skipped: a preserved node had no serialized form");
    return undefined;
  }
  replaceSerializedSentinels(rebuilt, runs);
  return rebuilt;
}

/**
 * The settled USJ for the editor state `serializedState` was exported from, or `undefined` when
 * nothing settleable is pending (the caller keeps whatever it already has). Call INSIDE a
 * `read()` of that same state. `serializedState` is mutated in place and must therefore be a fresh
 * `toJSON()` result the caller does not otherwise hold.
 */
export function $settledUsj(
  serializedState: SerializedEditorState,
  pendedKeys: ReadonlySet<NodeKey>,
  context: Tier2Context,
): Usj | undefined {
  if (pendedKeys.size === 0) return undefined;

  const paraScopes = new Map<NodeKey, ParaNode>();
  const noteScopes = new Map<NodeKey, NoteNode>();
  for (const key of pendedKeys) {
    const node = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    const scope = $settleScopeForNode(node);
    if (!scope) continue;
    if ($isNoteNode(scope)) noteScopes.set(scope.getKey(), scope);
    else paraScopes.set(scope.getKey(), scope);
  }
  if (paraScopes.size === 0 && noteScopes.size === 0) return undefined;

  const sites = new Map<NodeKey, SerializedSite>();
  $mapSerializedSites($getRoot().getChildren(), serializedState.root.children, sites);

  for (const para of paraScopes.values()) {
    const site = sites.get(para.getKey());
    if (!site) continue;
    const rebuilt = $settledParaNodes(para, sites, context);
    if (!rebuilt) continue;
    const index = site.siblings.indexOf(site.node);
    if (index < 0) continue;
    site.siblings.splice(index, 1, ...rebuilt);
  }

  return deserializeSerializedEditorState(serializedState, context.viewOptions);
}
