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
 * behave exactly as they do for an unsettled read. That divergence is the wave's named risk: the
 * mutating and read-only halves must always agree on what a given scope settles to, which is why
 * every guard rail, sentinel-symmetry check, and splice order here is a direct mirror of
 * `$rebuildParas`/`$rebuildNoteContent` rather than an independent re-derivation — an equivalence
 * property this module's own tests hold the two halves to, scope by scope.
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
  $buildNoteFragment,
  $buildParaFragment,
  $isReTokenizableMilestone,
  $settleScopeForNode,
  $signatureOf,
  ATOMIC_SENTINEL,
  countSentinels,
  FragmentAccumulator,
  SIGNATURE_CLOSE,
  SIGNATURE_OPEN,
  Tier2Context,
  toFragmentText,
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
import {
  $isCharNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  closingMarkerText,
  MarkerLookup,
  NoteNode,
  openingMarkerText,
  ParaNode,
  UnknownNode,
  usfmFragmentToUsjContent,
} from "shared";
import { ViewOptions } from "shared-react";

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

/** A serialized node's own `type` tag, or `""` for a shape with none. */
function serializedType(node: SerializedLexicalNode): string {
  return (node as { type?: string }).type ?? "";
}

/** A serialized MarkerNode's canonical glyph text, re-derived from `marker`/`markerSyntax`/
 * `nested` — the exact mirror of `MarkerNode.ts`'s own (unexported) `getMarkerText`. */
function serializedMarkerGlyphText(
  marker: string,
  markerSyntax: string | undefined,
  nested: boolean | undefined,
): string {
  if (markerSyntax === "closing") return closingMarkerText(marker, nested);
  if (markerSyntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(marker, nested);
}

/**
 * The children of an `attribute-run` wrapper sibling at `nodes[index]`, or `undefined` when that
 * slot is not one. `usjEditorAdaptor.serializeEditorState` (usj-editor.adaptor.ts, editable mode)
 * always wraps a fresh verse's `\va`/`\vp` triplet or a milestone's display run this way
 * (`addVerseAttributeRun`/`addMilestoneAttributeRun`) — `rebuilt` below is exactly that adaptor's
 * own canonical output, so a loose, unwrapped run never appears in it.
 */
function serializedRunWrapperChildren(
  nodes: SerializedLexicalNode[],
  index: number,
): SerializedLexicalNode[] | undefined {
  const sibling = nodes[index];
  if (!sibling || serializedType(sibling) !== "attribute-run") return undefined;
  return serializedChildren(sibling) ?? [];
}

/**
 * JSON-serialized mirror of `$appendSignature`/`$signatureOf` (tier2Rebuild.utils.ts), for the
 * FRESHLY-SERIALIZED `rebuilt` tree below — never arbitrary live-tree debris, since that is the
 * only tree this ever runs over. This is the JSON-side half of the SAME fixed-point comparison
 * `$rebuildParas` applies before splicing: without it, a rebuild the mutating settle would REFUSE
 * as a no-op (its own displayed bytes are already what re-tokenizing them produces, once
 * normalized — e.g. a structural NBSP separator and a user's own typed space both collapse to the
 * same plain space) instead gets spliced into the read-only settle's OUTPUT, silently replacing
 * the user's own currently-displayed bytes with a DIFFERENT-looking (through equivalent-by-
 * signature) rebuild — exactly the divergence this module's own equivalence tests exist to catch.
 * Lexical forbids creating nodes inside a `read()`, so `rebuilt` cannot be parsed into live nodes
 * to reuse `$signatureOf` on both sides the way the mutating settle does; this computes the exact
 * same signature directly from the JSON instead.
 *
 * Never needs `$isRebuildSentinel`'s node-kind classification: every node kind that check would
 * collapse to `ATOMIC_SENTINEL` on the live side (a note, an opaque block, a non-re-tokenizable
 * milestone, a char span with unrecoverable attributes) is, by construction, never produced FRESH
 * by the tokenizer — `$buildParaFragment` already replaced each one with a single ATOMIC_SENTINEL
 * character in the fragment text before tokenizing, so it rides through `rebuilt` as an ordinary
 * character inside a plain text node, not as a node of its own kind.
 */
function serializedSignatureOf(nodes: SerializedLexicalNode[], getMarkerFn: MarkerLookup): string {
  const out: string[] = [];
  appendSerializedSignature(nodes, out, getMarkerFn);
  return out.join("");
}

function appendSerializedSignature(
  children: SerializedLexicalNode[],
  out: string[],
  getMarkerFn: MarkerLookup,
): void {
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    const type = serializedType(node);
    if (type === "ms") {
      // Mirrors `$appendSignature`'s milestone branch: fold sid/eid/unknownAttributes in
      // alongside the recursed run, since the run's OWN text alone cannot distinguish a
      // re-tokenization from a stale display cache. Every fresh "ms" entry here IS
      // re-tokenizable by construction (see this function's own doc comment), so the
      // `$isReTokenizableMilestone` check is a defensive mirror, not a load-bearing gate.
      const milestone = node as {
        marker?: string;
        sid?: string;
        eid?: string;
        unknownAttributes?: unknown;
      };
      const runChildren = serializedRunWrapperChildren(children, index + 1);
      if (runChildren && $isReTokenizableMilestone(milestone.marker ?? "", getMarkerFn)) {
        out.push(
          SIGNATURE_OPEN,
          "ms",
          JSON.stringify({
            sid: milestone.sid ?? null,
            eid: milestone.eid ?? null,
            unknownAttributes: milestone.unknownAttributes ?? null,
          }),
        );
        appendSerializedSignature(runChildren, out, getMarkerFn);
        out.push(SIGNATURE_CLOSE);
        index += 1;
      } else {
        out.push(ATOMIC_SENTINEL);
      }
      continue;
    }
    if (type === "verse") {
      // Mirrors `$appendSignature`'s verse branch. `unknownAttributes` has no display
      // representation at all, so a verse carrying it stays a sentinel on the live side
      // (`verseNeedsSentinel`) and can never appear fresh here either — this branch is a
      // defensive mirror of that, not a load-bearing gate (see this function's doc comment).
      const verse = node as {
        text?: string;
        number?: string;
        altnumber?: string;
        pubnumber?: string;
        unknownAttributes?: unknown;
      };
      if (verse.unknownAttributes) {
        out.push(ATOMIC_SENTINEL);
        continue;
      }
      out.push(
        SIGNATURE_OPEN,
        "verse",
        toFragmentText(verse.text ?? ""),
        JSON.stringify({
          number: verse.number ?? null,
          altnumber: verse.altnumber ?? null,
          pubnumber: verse.pubnumber ?? null,
        }),
      );
      // A verse can carry up to two independent wrapped runs (`\va` then `\vp`), each its own
      // immediately-following `attribute-run` sibling — mirrors `$verseAttributeRun`'s wrapped
      // case, the only shape a fresh, canonical rebuild ever produces.
      let consumed = 0;
      let runChildren = serializedRunWrapperChildren(children, index + 1 + consumed);
      while (runChildren) {
        appendSerializedSignature(runChildren, out, getMarkerFn);
        consumed++;
        runChildren = serializedRunWrapperChildren(children, index + 1 + consumed);
      }
      out.push(SIGNATURE_CLOSE);
      index += consumed;
      continue;
    }
    if (type === "marker") {
      // Delimited and tagged, mirroring `$appendSignature`'s marker branch — not the generic text
      // fallback below, which a bare `.text` field would otherwise match first. The glyph's own
      // `.text` field is NOT read: `usjEditorAdaptor.serializeEditorState`'s `createMarker` helper
      // builds this JSON directly (never through a live `MarkerNode`, whose `getTextContent()` is
      // itself computed from `marker`/`markerSyntax`/`nested`, never stored independently — see
      // `MarkerNode.ts`'s `getMarkerText`), and leaves `.text` empty; re-derive the SAME canonical
      // glyph text here instead, exactly as `MarkerNode`'s own `getMarkerText` would.
      const marker = node as { marker?: string; markerSyntax?: string; nested?: boolean };
      out.push(
        SIGNATURE_OPEN,
        "marker",
        toFragmentText(
          serializedMarkerGlyphText(marker.marker ?? "", marker.markerSyntax, marker.nested),
        ),
        SIGNATURE_CLOSE,
      );
      continue;
    }
    if (type === "linebreak") {
      out.push(" ");
      continue;
    }
    if (type === "char") {
      const char = node as { unknownAttributes?: unknown };
      out.push(SIGNATURE_OPEN, "char", JSON.stringify(char.unknownAttributes ?? null));
      appendSerializedSignature(serializedChildren(node) ?? [], out, getMarkerFn);
      out.push(SIGNATURE_CLOSE);
      continue;
    }
    // Note/UnknownNode: defensive mirror of `$isRebuildSentinel`'s unconditional sentinel for
    // these kinds — unreachable in practice (see this function's doc comment), never load-bearing.
    if (type === "note" || type === "unknown") {
      out.push(ATOMIC_SENTINEL);
      continue;
    }
    const text = serializedText(node);
    if (text !== undefined) {
      out.push(toFragmentText(text));
      continue;
    }
    const nodeChildren = serializedChildren(node);
    if (nodeChildren) {
      out.push(SIGNATURE_OPEN, type);
      appendSerializedSignature(nodeChildren, out, getMarkerFn);
      out.push(SIGNATURE_CLOSE);
    } else {
      out.push(ATOMIC_SENTINEL);
    }
  }
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

/** The serialized counterparts of one fragment's preserved runs, or `undefined` when any
 * non-husk node in them has none (a shape the parallel walk could not pair — abort rather than
 * drop a node). A node whose key is in `huskKeys` contributes NOTHING to its run: the standalone
 * husk-removal pass in `$settledUsj` already spliced it out of the serialized tree, but
 * `fragment`/`out` (built from the LIVE tree, which the read-only settle never mutates) still
 * lists it as a preserved node — substituting its own JSON back in here, via
 * `replaceSerializedSentinels`, would resurrect it wherever this run's placeholder lands,
 * silently undoing that removal whenever the husk's own paragraph/note ALSO settles for an
 * unrelated pend in the same scope. */
function serializedRunsOf(
  fragment: FragmentAccumulator,
  sites: Map<NodeKey, SerializedSite>,
  huskKeys: ReadonlySet<NodeKey>,
): SerializedLexicalNode[][] | undefined {
  const runs: SerializedLexicalNode[][] = [];
  for (const run of fragment.sentinels) {
    const serializedRun: SerializedLexicalNode[] = [];
    for (const node of run) {
      if (huskKeys.has(node.getKey())) continue;
      const site = sites.get(node.getKey());
      if (!site) return undefined;
      serializedRun.push(site.node);
    }
    runs.push(serializedRun);
  }
  return runs;
}

/**
 * Every ParaNode's and CharNode's own `marker` field, in depth-first visiting order, over the
 * LIVE tree — ignoring everything else (text, glyphs, notes, unknown blocks, attribute-run
 * wrappers, …). Descends into EVERY ElementNode regardless of whether it matched, since a char
 * span can itself nest another char span.
 */
function $liveStructuralMarkers(nodes: LexicalNode[]): string[] {
  const markers: string[] = [];
  for (const node of nodes) {
    if ($isParaNode(node) || $isCharNode(node)) markers.push(node.getMarker());
    if ($isElementNode(node)) markers.push(...$liveStructuralMarkers(node.getChildren()));
  }
  return markers;
}

/** The JSON-side mirror of `$liveStructuralMarkers`, over a freshly-rebuilt serialized tree. */
function serializedStructuralMarkers(nodes: SerializedLexicalNode[]): string[] {
  const markers: string[] = [];
  for (const node of nodes) {
    const type = serializedType(node);
    if (type === "para" || type === "char")
      markers.push((node as { marker?: string }).marker ?? "");
    const children = serializedChildren(node);
    if (children) markers.push(...serializedStructuralMarkers(children));
  }
  return markers;
}

/**
 * Whether every ParaNode's and CharNode's own `marker` field agrees between `liveNodes` (a
 * scope's OLD content — `[para]`, or a note's `contentNodes`) and `jsonNodes` (the freshly
 * rebuilt content). Meaningful only once `serializedSignatureOf(jsonNodes) ===
 * $signatureOf(liveNodes)` has ALREADY held (see both call sites): `$appendSignature`
 * (tier2Rebuild.utils.ts) never folds a ParaNode's or CharNode's own `marker` field into the
 * signature at all — a ParaNode falls to the generic ElementNode case (tagging only its constant
 * node TYPE), and a CharNode's branch tags only its `unknownAttributes` before recursing into
 * children. That is CORRECT for `$rebuildParas`/`$rebuildNoteContent`'s OWN use of the signature
 * check: a BARE opener rename on EITHER kind never reaches them at all —
 * `$resolvePendingMarkers` (markerEditTier1.utils.ts) routes it to `$applyOpenerRename` instead,
 * a direct, unconditional `setMarker(...)` update with no fixed-point check of its own, for a
 * paragraph prefix glyph AND a char span's opening glyph alike. This settle unifies both real
 * paths into one tokenize-rebuild, so it must independently confirm every such marker actually
 * agrees too — the signature comparison alone would otherwise refuse a rename
 * `$applyOpenerRename` would have applied unconditionally (a paragraph's own prefix, or ANY char
 * span nested anywhere in its — or a note's — content), which is exactly the divergence this
 * module's own equivalence tests exist to catch.
 *
 * Compares the two SEQUENCES of collected markers (`$liveStructuralMarkers`/
 * `serializedStructuralMarkers`), not a raw index-into-full-child-list walk — deliberately NOT
 * positional over the full node lists. `rebuilt` is read PRE-`replaceSerializedSentinels` (see
 * both call sites), where a preserved run (e.g. a note sitting between two plain-text runs)
 * collapses into ONE JSON text node carrying the sentinel character inline, while the live side
 * still has the run as its own separate node(s) — a raw positional walk bounded by the shorter
 * array would silently stop short of comparing anything after that point, including an unrelated
 * char span's own pending rename further along in the SAME scope (both halves of the fixed-point
 * check would then pass on a genuinely un-settled paragraph, silently reverting the rename in the
 * output — the exact inverse of the divergence this check exists to catch). Comparing filtered,
 * order-preserving SEQUENCES instead sidesteps the array-length mismatch entirely: only the
 * RELATIVE ORDER of Para/CharNode markers matters, never their raw position among unrelated
 * siblings. Safe to trust a mismatched sequence LENGTH as "not a fixed point" (rather than an
 * error) for the same reason a genuine structural difference is already safe here at all: the
 * signature string comparison this function is gated behind already guarantees the same COUNT
 * and nesting of "char"-tagged spans on both sides, so the sequences are expected to be the same
 * length whenever this function is reached.
 */
function $structuralMarkersAgree(
  liveNodes: LexicalNode[],
  jsonNodes: SerializedLexicalNode[],
): boolean {
  const liveMarkers = $liveStructuralMarkers(liveNodes);
  const jsonMarkers = serializedStructuralMarkers(jsonNodes);
  return (
    liveMarkers.length === jsonMarkers.length &&
    liveMarkers.every((marker, index) => marker === jsonMarkers[index])
  );
}

/**
 * The serialized nodes a settled `para` becomes, or `undefined` when the settle refuses. Mirrors
 * `$rebuildParas`' guard sequence — guard rails, empty tokenizer output, sentinel symmetry, AND the
 * fixed-point signature check — so a paragraph the mutating rebuild would leave alone is left alone
 * here too.
 *
 * The fixed-point check is NOT here for `$rebuildParas`'s own reason (loop prevention — nothing
 * here mutates the editor, so there is no transform to re-arm). It is here because "signature-
 * equivalent" is not "byte-identical": a structural NBSP separator and a user's own literal typed
 * space both collapse to the same plain space once normalized, so a genuinely no-op-by-signature
 * rebuild can still look TEXTUALLY different from what is currently displayed. Splicing such a
 * rebuild into the output would silently replace the user's own current bytes with a different-
 * looking rebuild the mutating settle would never have produced (it would have refused, leaving
 * the display untouched) — see `serializedSignatureOf`'s own doc comment for the full mechanics.
 */
function $settledParaNodes(
  para: ParaNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  huskKeys: ReadonlySet<NodeKey>,
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
  const runs = serializedRunsOf(fragment, sites, huskKeys);
  if (!runs) {
    logger?.warn("[MarkerEdit] Settled USJ skipped: a preserved node had no serialized form");
    return undefined;
  }
  // Fixed-point refusal (preserve-or-refuse) — computed BEFORE `replaceSerializedSentinels` below,
  // while `rebuilt` still carries the raw ATOMIC_SENTINEL characters the tokenizer produced: that
  // is exactly the shape `serializedSignatureOf` expects, matching how `$signatureOf` collapses a
  // live preserved node to the same single sentinel character on the other side of this
  // comparison. `$structuralMarkersAgree` (see its own doc comment) additionally confirms the
  // paragraph's OWN marker field, and any CharNode's marker anywhere in its content, actually
  // agree too — the signature alone is blind to both, which is correct for `$rebuildParas`'s own
  // use of it (a bare opener rename on either kind never reaches `$rebuildParas`,
  // `$resolvePendingMarkers` routes it to `$applyOpenerRename` instead) but wrong for this settle,
  // which unifies both real paths into one rebuild. Short-circuited behind the signature check: a
  // genuine structural change (not just a marker) has already made the signature strings unequal.
  const isFixedPoint =
    serializedSignatureOf(rebuilt, getMarkerFn) === $signatureOf([para], getMarkerFn) &&
    $structuralMarkersAgree([para], rebuilt);
  if (isFixedPoint) {
    logger?.debug("[MarkerEdit] Settled USJ skipped: rebuild is a no-op (fixed point)");
    return undefined;
  }
  replaceSerializedSentinels(rebuilt, runs);
  return rebuilt;
}

/**
 * The serialized nodes a settled note's CONTENT becomes, paired with the live content nodes they
 * replace — or `undefined` when the settle refuses. Mirrors `$rebuildNoteContent`: content is
 * tokenized in note context, re-serialized with expanded notes so char spans come back inline, the
 * tokenizer's default `\p` wrapper (plus the visible para prefix glyph and its trailing space) is
 * unwrapped, since none of that belongs inside a note, and a fixed-point rebuild refuses — same
 * reasoning as `$settledParaNodes`'s own check, see its doc comment.
 */
function $settledNoteContent(
  note: NoteNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  huskKeys: ReadonlySet<NodeKey>,
): { rebuilt: SerializedLexicalNode[]; contentNodes: LexicalNode[] } | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn);
  if (!built) return undefined;
  const { out, contentNodes } = built;
  if (contentNodes.length === 0) return undefined;
  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text, {
    getMarker: getMarkerFn,
    isNoteContext: true,
  });
  if (content.length === 0) return undefined;
  if (countSentinels(content) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: sentinel/preserved-node count mismatch");
    return undefined;
  }
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const topLevel = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    noteViewOptions,
  ).root.children;
  const wrapperChildren = topLevel.length === 1 ? serializedChildren(topLevel[0]) : undefined;
  if (!wrapperChildren) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: unexpected serialized shape");
    return undefined;
  }
  let contentStart = 0;
  const first = wrapperChildren[0] as { type?: string; markerSyntax?: string } | undefined;
  // Mirrors `$rebuildNoteContent`'s own `markerSyntax === "opening"` check exactly: the ONLY
  // marker this unwrap may ever drop is the editable `\p` wrapper's own visible prefix glyph — a
  // "marker"-typed sibling that is NOT an opening glyph (a stray closing/self-closing marker,
  // which the tokenizer never emits in this slot but which this check must not silently eat
  // regardless) must fall through and stay in the content instead.
  if (first?.type === "marker" && first.markerSyntax === "opening") {
    contentStart = 1;
    const second = wrapperChildren[1];
    const secondState = second as { type?: string; $?: { textType?: string } } | undefined;
    if (
      secondState &&
      secondState.type !== "marker" &&
      secondState.$?.textType === "marker-trailing-space"
    )
      contentStart = 2;
  }
  const rebuilt = wrapperChildren.slice(contentStart);
  if (rebuilt.length === 0) return undefined;
  if (countSerializedSentinels(rebuilt) !== out.sentinels.length) {
    logger?.warn(
      "[MarkerEdit] Settled note USJ skipped: serialized sentinel/preserved-node count mismatch",
    );
    return undefined;
  }
  const runs = serializedRunsOf(out, sites, huskKeys);
  if (!runs) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: a preserved node had no serialized form");
    return undefined;
  }
  // Fixed-point refusal (preserve-or-refuse), mirroring `$rebuildNoteContent`'s own check exactly
  // (tier2Rebuild.utils.ts, line ~1047: `$signatureOf(newNodes, ...) === $signatureOf(contentNodes,
  // ...)`) — computed BEFORE `replaceSerializedSentinels` below, while `rebuilt` still carries the
  // raw ATOMIC_SENTINEL characters the tokenizer produced, same reason as `$settledParaNodes`'s
  // check. Compares CONTENT nodes only, not `[note]` itself: the note's own marker/caller/closing
  // glyphs are preserved verbatim across this rebuild and never re-derived from content bytes, so
  // they need no equivalent of the paragraph case's own top-level marker check. But a note's
  // CONTENT can itself carry char spans, and `$structuralMarkersAgree` (see its own doc comment)
  // is exactly as necessary here as it is for `$settledParaNodes`: a bare rename on a char span
  // nested in note content never reaches `$rebuildNoteContent` either (`$applyOpenerRename`
  // handles a char span's opening glyph identically whether its parent paragraph is a plain
  // paragraph or a note), so the signature comparison alone is blind to it. Without both checks, a
  // half-typed attribute run OR a bare char-span rename inside an expanded note would either get
  // silently dropped or silently refused — the same signature-equivalent-but-textually-different
  // divergence `$settledParaNodes` guards against.
  if (
    serializedSignatureOf(rebuilt, getMarkerFn) === $signatureOf(contentNodes, getMarkerFn) &&
    $structuralMarkersAgree(contentNodes, rebuilt)
  ) {
    logger?.debug("[MarkerEdit] Settled note USJ skipped: rebuild is a no-op (fixed point)");
    return undefined;
  }
  replaceSerializedSentinels(rebuilt, runs);
  return { rebuilt, contentNodes };
}

/** The custom node-state a serialized text node carries under Lexical's `$` state key, or
 * `undefined` for a plain node with none — this codebase's own `textTypeState` (the one custom
 * state field text nodes carry) rides there. */
function serializedTextTypeState(node: SerializedLexicalNode): unknown {
  return (node as { $?: { textType?: unknown } }).$?.textType;
}

/**
 * Whether two adjacent serialized nodes are both plain TextNodes (not a MarkerNode or other
 * TextNode subclass — Lexical's `type` field distinguishes them) with identical format, style,
 * mode, detail, and custom node state — the JSON-level mirror of Lexical's own (private)
 * `$canSimpleTextNodesBeMerged`, which the live reconciler applies automatically to two such
 * siblings on every commit. Needed because a husk-removal splice below can leave two plain text
 * siblings adjacent that the LIVE tree would have coalesced into one node already; without
 * mirroring that coalesce here, `normalizeSpaceRuns` (editor-usj.adaptor.ts) — which only
 * collapses a run of 2+ spaces WITHIN one serialized node's own string — never sees the combined
 * run spanning the two separate JSON entries.
 */
function canMergeSerializedText(a: SerializedLexicalNode, b: SerializedLexicalNode): boolean {
  const aNode = a as {
    type?: string;
    format?: unknown;
    style?: unknown;
    mode?: unknown;
    detail?: unknown;
  };
  const bNode = b as {
    type?: string;
    format?: unknown;
    style?: unknown;
    mode?: unknown;
    detail?: unknown;
  };
  return (
    aNode.type === "text" &&
    bNode.type === "text" &&
    aNode.format === bNode.format &&
    aNode.style === bNode.style &&
    aNode.mode === bNode.mode &&
    aNode.detail === bNode.detail &&
    serializedTextTypeState(a) === serializedTextTypeState(b)
  );
}

/**
 * A pended, currently-attached, emptied optbreak husk — the read-only mirror of
 * `$settlePendedDisplayOwner`'s FIRST branch (markerEditTier1.utils.ts): an optbreak's `//` token
 * IS its entire USFM byte representation, so once the (Lexical-token) child holding that token is
 * gone there is nothing left to re-derive, and the mutating settle removes the husk directly —
 * `node.remove()` — rather than routing it through `$settleScopeForNode`/a fragment rebuild.
 * `$settleScopeForNode` deliberately refuses EVERY `UnknownNode` (opaque blocks stay literal by
 * design), so a pended husk's own key never resolves to a para/note scope at all; without this
 * separate pass the read-only settle would silently leave the dead husk in the output while the
 * real settle removes it, which is exactly the divergence this module's own equivalence tests
 * catch.
 */
function $emptiedOptbreakHusksOf(pendedKeys: ReadonlySet<NodeKey>): UnknownNode[] {
  const husks: UnknownNode[] = [];
  for (const key of pendedKeys) {
    const node = $getNodeByKey(key);
    if (
      node?.isAttached() &&
      $isUnknownNode(node) &&
      node.getTag() === "optbreak" &&
      node.getChildrenSize() === 0
    )
      husks.push(node);
  }
  return husks;
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
  const husks = $emptiedOptbreakHusksOf(pendedKeys);
  if (paraScopes.size === 0 && noteScopes.size === 0 && husks.length === 0) return undefined;
  const huskKeys = new Set(husks.map((husk) => husk.getKey()));

  const sites = new Map<NodeKey, SerializedSite>();
  $mapSerializedSites($getRoot().getChildren(), serializedState.root.children, sites);

  // Notes FIRST: a settled note that also rides inside a settling paragraph is preserved there as
  // a sentinel, and the paragraph pass substitutes the very serialized subtree this pass has just
  // rewritten in place — so the paragraph's output carries the settled note, not the pending one.
  // `huskKeys` (threaded into `serializedRunsOf` inside `$settledNoteContent`) already keeps a
  // co-settling note's own rebuild from resurrecting a husk living in its content — see
  // `serializedRunsOf`'s own doc comment.
  for (const note of noteScopes.values()) {
    const site = sites.get(note.getKey());
    const noteChildren = site ? serializedChildren(site.node) : undefined;
    if (!noteChildren) continue;
    const built = $settledNoteContent(note, sites, context, huskKeys);
    if (!built) continue;
    const firstSite = sites.get(built.contentNodes[0].getKey());
    if (!firstSite) continue;
    const start = noteChildren.indexOf(firstSite.node);
    if (start < 0) continue;
    noteChildren.splice(start, built.contentNodes.length, ...built.rebuilt);
  }

  for (const para of paraScopes.values()) {
    const site = sites.get(para.getKey());
    if (!site) continue;
    const rebuilt = $settledParaNodes(para, sites, context, huskKeys);
    if (!rebuilt) continue;
    const index = site.siblings.indexOf(site.node);
    if (index < 0) continue;
    site.siblings.splice(index, 1, ...rebuilt);
  }

  // Husks LAST, deliberately AFTER the notes/para passes above, not before: a husk pended ALONE
  // (its own paragraph/note never lands in paraScopes/noteScopes at all, since
  // $settleScopeForNode always refuses an UnknownNode) is untouched by anything else, so this
  // splice is the ONLY thing that removes it from the output, and running it here still finds it
  // exactly where it started.
  //
  // A husk whose own paragraph/note is ALSO settling for an unrelated pend was already resolved
  // above, but the two scopes get there by DIFFERENT mechanisms — this loop below is a genuine
  // no-op for both, just not for the identical reason:
  //  - NOTE: the notes pass's splice (`noteChildren.splice(start, ..., ...built.rebuilt)`)
  //    mutates `noteChildren` IN PLACE — the SAME array object this loop's own `site.siblings`
  //    points to for the husk (both were recorded from the SAME note-children array by
  //    `$mapSerializedSites`). `built.rebuilt` already excludes the husk (via `huskKeys`), so by
  //    the time this loop runs, the husk's own JSON node genuinely no longer exists anywhere in
  //    that array; `indexOf` returns -1 and `continue` is a real no-op.
  //  - PARAGRAPH: `$settledParaNodes` returns a WHOLLY FRESH top-level node, and the para pass's
  //    splice (`site.siblings.splice(index, 1, ...rebuilt)`, keyed on the PARAGRAPH's own site)
  //    replaces the paragraph's OWN SLOT in its PARENT's children array — it never touches the
  //    OLD paragraph's own children array (where the husk's site.siblings still points). That old
  //    array is simply orphaned, disconnected from the document the moment the paragraph's slot is
  //    replaced, but it is NOT mutated, so `indexOf` still FINDS the husk there and the splice
  //    below still runs — harmlessly, since removing a node from an array nothing reads anymore
  //    has no observable effect on the final output either way.
  //
  // Running this pass FIRST (as an earlier version of this settle did) breaks a different way: the
  // notes pass anchors its splice on `built.contentNodes[0]`'s serialized site — if a husk is a
  // note's (or paragraph's) OWN first content node, an earlier husk-first splice has already
  // spliced that exact JSON node out of `noteChildren`, so `noteChildren.indexOf(firstSite.node)`
  // can no longer find it, `start < 0` fires, and the ENTIRE co-settling rebuild for that scope is
  // silently skipped — not just the husk, but the unrelated pend riding alongside it too.
  for (const husk of husks) {
    const site = sites.get(husk.getKey());
    if (!site) continue;
    const index = site.siblings.indexOf(site.node);
    if (index < 0) continue;
    site.siblings.splice(index, 1);
    // Merge the now-adjacent flanking text, mirroring the live reconciler's own coalesce of two
    // simple-mergeable TextNode siblings (see `canMergeSerializedText`'s doc comment) — the
    // mutating settle leaves the flanking significant spaces untouched at removal time
    // ($settlePendedDisplayOwner's own doc comment) and relies on exactly this coalesce, followed
    // by `normalizeSpaceRuns`, to collapse a run split across the removed husk. Only reachable for
    // a husk pended alone (see this loop's own doc comment above) — a co-settling rebuild already
    // produces correctly normalized text on its own, via the full tokenize+serialize pipeline.
    const before = site.siblings[index - 1];
    const after = site.siblings[index];
    const beforeText = before && serializedText(before);
    const afterText = after && serializedText(after);
    if (
      before &&
      after &&
      beforeText !== undefined &&
      afterText !== undefined &&
      canMergeSerializedText(before, after)
    ) {
      (before as SerializedLexicalNode & { text: string }).text = beforeText + afterText;
      site.siblings.splice(index, 1);
    }
  }

  return deserializeSerializedEditorState(serializedState, context.viewOptions);
}
