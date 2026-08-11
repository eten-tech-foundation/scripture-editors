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
import { TransientInput } from "../editor.model";
import { $markerCanonicalText, BARE_OPENER_REGEX } from "./markerEditTier1.utils";
import {
  $buildNoteFragment,
  $buildParaFragment,
  $isRebuildSentinel,
  $isReTokenizableMilestone,
  $settleScopeForNode,
  $signatureOf,
  ATOMIC_SENTINEL,
  countSentinels,
  FragmentAccumulator,
  FragmentSpan,
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
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  NodeKey,
  SerializedEditorState,
  SerializedLexicalNode,
  TextNode,
} from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  closingMarkerText,
  MarkerLookup,
  MarkerNode,
  NBSP,
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
 * Never needs `$isRebuildSentinel`'s node-kind classification — NOT because a sentinel-class kind
 * (a note, an opaque block, a non-re-tokenizable milestone, a char span with unrecoverable
 * attributes) can never appear FRESH here: it can. An unknown marker typed inside note content,
 * for instance, tokenizes into a genuinely fresh "char" entry carrying `unknownAttributes`, which
 * this function's own "char" branch below walks structurally rather than collapsing to one
 * opaque character the way `$appendSignature` collapses its LIVE counterpart. The mirror stays
 * safe anyway: a freshly-emitted sentinel-class node is, by definition, content that was NOT
 * already sitting in the OLD live tree in that same opaque form, so `$signatureOf` of the old
 * content can never equal what this function produces for it — the comparison this function feeds
 * comes out UNEQUAL either way, which is exactly what correctly drives a splice instead of a
 * mistaken no-op refusal. A matching signature is the only outcome that would need this function
 * to classify a node identically to `$appendSignature`, and a fresh sentinel-class node can never
 * produce one against content that didn't already contain it.
 */
function serializedSignatureOf(nodes: SerializedLexicalNode[], getMarkerFn: MarkerLookup): string {
  const out: string[] = [];
  appendSerializedSignature(nodes, out, getMarkerFn);
  return out.join("");
}

/**
 * A direct "text"-typed child of a "char" node, for signature purposes — the JSON-side mirror of
 * `tier2Rebuild.utils.ts`'s `$charOwnChildSignatureText`. See that function's doc comment for the
 * full mechanics: two SEPARATE structural-NBSP shapes `editor-usj.adaptor.ts` treats differently
 * (a MIXED node — structural NBSP prepended onto real content — has just its leading NBSP sliced
 * off; a PURE spacer node — nothing but that one NBSP, built for element-first content — is instead
 * dropped wholesale by extraction, but must stay UNSTRIPPED here so the signature can still tell
 * "a separator is present" apart from "no separator at all"), and why the check additionally
 * excludes a leading NBSP immediately followed by `ATOMIC_SENTINEL`: this runs BEFORE
 * `replaceSerializedSentinels` splices anything (both call sites' own doc comments), so a fresh
 * rebuild's would-be pure-spacer node is still fused, in the SAME string, with the raw placeholder
 * character standing in for whatever preserved node follows — stripping by length alone would
 * misread that as the mixed case the moment content follows the placeholder inline.
 */
function charOwnChildSignatureText(text: string): string {
  const isMixedRealContent =
    text.length > 1 && text.startsWith(NBSP) && text.charAt(1) !== ATOMIC_SENTINEL;
  return isMixedRealContent ? text.slice(1) : text;
}

/**
 * `insideCharChildren` is true only while appending a "char" node's OWN direct children (set by
 * this function's own "char" branch below) — the JSON-side mirror of `$appendSignature`'s own
 * `insideCharChildren` parameter (tier2Rebuild.utils.ts), including how it resets for anything
 * nested one level deeper that is not itself another "char" node.
 */
function appendSerializedSignature(
  children: SerializedLexicalNode[],
  out: string[],
  getMarkerFn: MarkerLookup,
  insideCharChildren = false,
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
      appendSerializedSignature(serializedChildren(node) ?? [], out, getMarkerFn, true);
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
      out.push(toFragmentText(insideCharChildren ? charOwnChildSignatureText(text) : text));
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
 * LIVE tree — ignoring everything else (text, glyphs, attribute-run wrappers, …), and NEVER
 * descending into a node `$isRebuildSentinel` (tier2Rebuild.utils.ts) classifies as opaque — a
 * note, an unknown block, a non-re-tokenizable milestone, or a char span with unrecoverable
 * attributes. That gate is load-bearing, not defensive: `$appendSignature` checks
 * `$isRebuildSentinel` BEFORE its own CharNode/generic-element branches, so a sentinel's entire
 * subtree — including any char/para markers nested inside it — collapses to ONE opaque character
 * in the signature and is NEVER walked. `rebuilt` mirrors this exactly: a sentinel is a single
 * U+FFFC character embedded in a JSON text node at this point (pre-`replaceSerializedSentinels`,
 * see both call sites), with no structure at all to recurse into. Descending into a sentinel HERE
 * — e.g. an unrelated, unedited note that happens to contain its own nested char span — would
 * collect markers the JSON side can never have a counterpart for (nothing on that side to compare
 * them against), producing a spurious length mismatch that makes a genuine fixed point look like
 * a structural change and forces a needless (and data-lossy, since it splices a fresh rebuild over
 * a still-pending edit elsewhere in the SAME scope) rebuild. Otherwise descends into EVERY
 * ElementNode regardless of whether it matched, since a char span can itself nest another char
 * span.
 */
function $liveStructuralMarkers(nodes: LexicalNode[], getMarkerFn: MarkerLookup): string[] {
  const markers: string[] = [];
  for (const node of nodes) {
    if ($isRebuildSentinel(node, getMarkerFn)) continue;
    if ($isParaNode(node) || $isCharNode(node)) markers.push(node.getMarker());
    if ($isElementNode(node))
      markers.push(...$liveStructuralMarkers(node.getChildren(), getMarkerFn));
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
 * siblings.
 *
 * Safe to trust a mismatched sequence LENGTH as "not a fixed point" (rather than an error) for
 * the same reason a genuine structural difference is already safe here at all: the signature
 * string comparison this function is gated behind already guarantees the same COUNT and nesting
 * of "char"-tagged spans among NON-OPAQUE content on both sides. It says nothing about markers
 * INSIDE an opaque sentinel (a note, an unknown block, …), which the signature collapses to one
 * character without ever looking inside — which is exactly why `$liveStructuralMarkers` must
 * ALSO refuse to look inside one (see its own doc comment): without that gate, an unrelated
 * sentinel's own nested char/para markers would inflate the live sequence with entries the JSON
 * side, and the signature, both have no way to represent — a spurious length mismatch on a
 * paragraph that IS a genuine fixed point, forcing a needless, data-lossy rebuild.
 */
function $structuralMarkersAgree(
  liveNodes: LexicalNode[],
  jsonNodes: SerializedLexicalNode[],
  getMarkerFn: MarkerLookup,
): boolean {
  const liveMarkers = $liveStructuralMarkers(liveNodes, getMarkerFn);
  const jsonMarkers = serializedStructuralMarkers(jsonNodes);
  return (
    liveMarkers.length === jsonMarkers.length &&
    liveMarkers.every((marker, index) => marker === jsonMarkers[index])
  );
}

/** A declaration that VERIFIED against the live tree: the node holding the bytes, the caret offset
 * they end at, and the bytes themselves. */
interface TransientLiteral {
  readonly node: TextNode;
  readonly caretOffset: number;
  readonly run: string;
}

/** The last collapsed text-caret the editor observed — a text node's key plus the caret's offset
 * into it. Tracked by `Editor.tsx` the same way MarkerEditPlugin's own BLUR_COMMAND handler tracks
 * its `lastAnchorKey` (MarkerEditPlugin.tsx), and consumed only by
 * {@link $verifiedTransientLiteral}'s fallback below. */
export interface LastKnownCaret {
  readonly key: NodeKey;
  readonly offset: number;
}

/**
 * Resolve a declaration against the live caret, or `undefined` when it does not hold. Every check
 * is a fail-safe: an unverifiable declaration must degrade to "settle normally", because the cost
 * of ignoring a live declaration is one visible phantom marker while the cost of honoring a stale
 * one is silently deleting bytes the user typed.
 *
 * The bytes are located by the CARET, not by the end of the node's text: a palette opened
 * mid-paragraph leaves the trigger literal with the rest of the sentence still after it, so
 * "the node's text ends with `run`" would be false in the ordinary mid-sentence case. Requiring the
 * text ENDING AT THE CARET to end with `run` is the same exact-match check, correct in both
 * positions. A collapsed selection is required for the same reason the surfaces that declare only
 * exist for one: a range selection means the surface claimed the keystrokes and nothing landed.
 *
 * `lastKnownCaret` is the fallback source when the live selection is not a `RangeSelection` at all
 * (most commonly `null`) — a real cross-frame blur (clicking a renderer-overlay palette item, which
 * lives OUTSIDE this editor's iframe) can null Lexical's live selection before this read runs,
 * exactly the race MarkerEditPlugin's own BLUR_COMMAND handler documents and guards against with
 * its `lastAnchorKey` fallback (see that handler's comments, MarkerEditPlugin.tsx). Live-verified
 * before the WAVE-4 corruption case was reproduced live: a click that only blurs the window without
 * consuming the pending literal degrades this check to "no live selection" while `pendedKeys` still
 * carries the declared node, and a stale-selection read used to settle those bytes normally,
 * producing a saved phantom marker — this fallback is what closes that gap. It does NOT apply when
 * the live selection IS a `RangeSelection` but not collapsed: an extended range is concrete evidence
 * the caret story genuinely changed, which must not be second-guessed with remembered data. The
 * fallback reuses the SAME byte-exact check below, so a stale remembered caret degrades no
 * differently than a stale declaration already does — at most one visible phantom marker, never
 * silently dropped content.
 */
function $verifiedTransientLiteral(
  input: TransientInput | undefined,
  lastKnownCaret: LastKnownCaret | undefined,
): TransientLiteral | undefined {
  if (!input || input.run.length === 0) return undefined;
  const selection = $getSelection();
  let node: LexicalNode | null;
  let caretOffset: number;
  if ($isRangeSelection(selection)) {
    if (!selection.isCollapsed()) return undefined;
    node = selection.focus.getNode();
    caretOffset = selection.focus.offset;
  } else if (lastKnownCaret) {
    node = $getNodeByKey(lastKnownCaret.key);
    caretOffset = lastKnownCaret.offset;
  } else {
    return undefined;
  }
  if (!$isTextNode(node) || !node.isAttached()) return undefined;
  if (!node.getTextContent().slice(0, caretOffset).endsWith(input.run)) return undefined;
  return { node, caretOffset, run: input.run };
}

/**
 * `fragment.text` with the declared bytes cut out, or the text UNTOUCHED when this fragment does
 * not carry them (the declaration names a node in some other scope) or when the cut cannot be made
 * exactly. The cut is located through the fragment's own spans, so the shared fragment builder is
 * not forked and the real settle is unaffected; the span-length check rejects the one case where a
 * node's fragment contribution is not length-preserving (a whitespace-only para-prefix separator
 * substituted for a plain space), rather than cutting at a shifted offset.
 *
 * Spans go stale after the cut. Nothing downstream reads them — the sentinel substitution walks the
 * tokenized output's placeholders in ORDER, not by offset — and the cut can never remove a
 * placeholder, since the removed bytes were verified equal to `run`.
 *
 * A sentinel's own structural separator space (`pushSentinel`'s `UNTERMINATED_MARKER_TAIL`
 * insertion, tier2Rebuild.utils.ts) is not part of any span, so it can survive this cut even when it
 * immediately follows the removed bytes — the fail-safe direction (an extra space the tokenizer
 * normalizes away, never a dropped sentinel placeholder), and it disappears on its own the next time
 * the declaration clears and a real settle re-derives the fragment from scratch.
 */
function $fragmentTextWithoutTransient(
  fragment: FragmentAccumulator,
  transient: TransientLiteral,
): string {
  const key = transient.node.getKey();
  const span: FragmentSpan | undefined = fragment.spans.find(
    (candidate) => !candidate.isSentinel && candidate.key === key,
  );
  if (!span) return fragment.text;
  if (span.end - span.start !== transient.node.getTextContentSize()) return fragment.text;
  const cutEnd = span.start + transient.caretOffset;
  const cutStart = cutEnd - transient.run.length;
  if (cutStart < span.start) return fragment.text;
  if (fragment.text.slice(cutStart, cutEnd) !== transient.run) return fragment.text;
  return fragment.text.slice(0, cutStart) + fragment.text.slice(cutEnd);
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
 *
 * `transient`, when it resolves to bytes inside THIS paragraph's own fragment
 * ({@link $fragmentTextWithoutTransient}), is cut out before tokenizing — the declared bytes never
 * reach the tokenizer, so they can never turn into a phantom structural marker in the output. A
 * `transient` naming some other scope leaves the fragment text untouched, same as no declaration at
 * all.
 *
 * A scope carrying a resolved `transient` necessarily forgoes the fixed-point refusal below while
 * the declaration is live: the comparison is always against `$signatureOf([para], ...)`, the
 * UNMODIFIED live signature, which by construction differs from a rebuild of the reduced text
 * whenever the cut actually removed anything. That is inherent, not a gap — a subtraction and a
 * "refuse because nothing changed" check cannot both fire on the same bytes — and the direction is
 * safe: the paragraph only ever normalizes TOWARD excluding the declared run, never toward
 * reintroducing an unrelated stale rebuild.
 */
function $settledParaNodes(
  para: ParaNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  huskKeys: ReadonlySet<NodeKey>,
  transient: TransientLiteral | undefined,
): SerializedLexicalNode[] | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const fragment = $buildParaFragment(para, getMarkerFn);
  if (!fragment) return undefined;
  const fragmentText = transient
    ? $fragmentTextWithoutTransient(fragment, transient)
    : fragment.text;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragmentText, {
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
    $structuralMarkersAgree([para], rebuilt, getMarkerFn);
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
 *
 * `transient` is cut out of the note's own fragment text the same way `$settledParaNodes` cuts it
 * out of a paragraph's — see {@link $fragmentTextWithoutTransient}'s doc comment; a declaration
 * naming a node outside this note's content leaves `out.text` untouched.
 */
function $settledNoteContent(
  note: NoteNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  huskKeys: ReadonlySet<NodeKey>,
  transient: TransientLiteral | undefined,
): { rebuilt: SerializedLexicalNode[]; contentNodes: LexicalNode[] } | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn);
  if (!built) return undefined;
  const { out, contentNodes } = built;
  if (contentNodes.length === 0) return undefined;
  const fragmentText = transient ? $fragmentTextWithoutTransient(out, transient) : out.text;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragmentText, {
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
  //
  // The paragraph-scope analogue of `$liveStructuralMarkers`'s opacity gate (an unrelated,
  // un-edited co-resident note whose own nested char span inflates the live marker sequence, see
  // that function's doc comment) has NO reachable note-content counterpart here: three attempts to
  // construct "an un-edited sentinel span co-resident inside note content, alongside a genuine
  // fixed-point elsewhere in that same content" all failed on mount — the note tokenizer re-parses
  // its ENTIRE content on load whenever it sees a sentinel-shaped span at all, dissolving the
  // separator-less marker+text shape the fixed-point pin needs before this call site is ever
  // reached. The mechanism is still covered: `$structuralMarkersAgree` is the SAME function,
  // exercised at this call site by the ordinary note-content settle tests, and the opacity gate
  // inside `$liveStructuralMarkers` applies unconditionally regardless of which caller reached it.
  if (
    serializedSignatureOf(rebuilt, getMarkerFn) === $signatureOf(contentNodes, getMarkerFn) &&
    $structuralMarkersAgree(contentNodes, rebuilt, getMarkerFn)
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
 * `$settlePendedDisplayOwner`'s (markerEditTier1.utils.ts) registry dispatch loop:
 * `optbreakDescriptor`'s `remove-owner` deletion policy over its `read-only` byte format. An
 * optbreak's `//` token IS its entire USFM byte representation, so once the (Lexical-token) child
 * holding that token is gone there is nothing left to re-derive, and the mutating settle removes
 * the husk directly — `node.remove()` — rather than routing it through
 * `$settleScopeForNode`/a fragment rebuild.
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
 * The note-marker rename a pended key represents, or `undefined` when `node` is not a note's own
 * OPENING glyph, or its typed text is not (yet) that shape. Mirrors `$applyOpenerRename`'s
 * (markerEditTier1.utils.ts) `$isNoteNode(parent)` branch decision surface EXACTLY — same
 * `BARE_OPENER_REGEX` (imported, not re-derived, so the two can never silently drift apart), same
 * "+"-prefix nest-instruction early-out (a typed `+` is a NEST instruction, never a rename —
 * `$applyOpenerRename` checks this BEFORE it ever dispatches on parent kind), same tree-shape
 * sanity guard (the glyph's own stored marker and its parent's must still agree, or the simple
 * opener-owns-parent assumption doesn't hold and the real path refuses too) — so this settle
 * recognizes a given pend the identical way the real one does.
 *
 * Deliberately silent on VALIDITY (`NoteNode.isValidMarker`): the caller checks that separately.
 * Even an INVALID target still needs to be recognized as "a note-glyph rename was attempted" for
 * this function's own contract, even though it settles differently — an invalid target routes
 * `$applyOpenerRename` to `$requestTier2ForNode` -> `$rebuildNoteContent`, which only ever rebuilds
 * a note's CONTENT (`$buildNoteFragment` trims the glyphs out of `contentNodes` before tokenizing),
 * never the note's own marker or glyph text — so the existing, generic note-scope settle this
 * module already performs is already the correct (no-op-on-the-glyph) mirror for that case.
 */
function $noteGlyphRenameTarget(
  node: LexicalNode,
): { glyph: MarkerNode; note: NoteNode; oldMarker: string; newMarker: string } | undefined {
  if (!$isMarkerNode(node) || node.getMarkerSyntax() !== "opening") return undefined;
  const parent = node.getParent();
  if (!$isNoteNode(parent)) return undefined;
  const text = node.getTextContent();
  if (text === $markerCanonicalText(node)) return undefined;
  const bare = BARE_OPENER_REGEX.exec(text);
  if (!bare) return undefined;
  const newMarker = bare[1];
  if (newMarker.startsWith("+")) return undefined;
  const oldMarker = node.getMarker();
  if (parent.getMarker() !== oldMarker) return undefined;
  return { glyph: node, note: parent, oldMarker, newMarker };
}

/** Rewrites one serialized MarkerNode glyph's own `marker` field, and its derived `text` (mirroring
 * `MarkerNode.setMarker`'s own `__text` recomputation via `getMarkerText`), in place. */
function rewriteSettledGlyphMarker(json: SerializedLexicalNode, marker: string): void {
  const glyph = json as SerializedLexicalNode & {
    marker?: string;
    markerSyntax?: string;
    nested?: boolean;
    text?: string;
  };
  glyph.marker = marker;
  glyph.text = serializedMarkerGlyphText(marker, glyph.markerSyntax, glyph.nested);
}

/**
 * Patches a settled note's own `marker` JSON field for a bare, pending opening-glyph rename to a
 * VALID note marker ({@link $noteGlyphRenameTarget}) — the read-only mirror of
 * `$applyOpenerRename`'s `$isNoteNode(parent)` branch (markerEditTier1.utils.ts):
 * `parent.setMarker(clean)`. An INVALID target is left untouched: see
 * `$noteGlyphRenameTarget`'s own doc comment for why the existing, generic note-content settle is
 * already the correct mirror for that case.
 *
 * Runs independently of, and composes safely with, a co-resident content settle
 * ({@link $settledNoteContent}) in the SAME note: this patches only the note's own top-level
 * `marker` field (and its glyph/closer siblings, both OUTSIDE the content range —
 * `$buildNoteFragment` trims the glyphs out of `contentNodes` before ever building a fragment);
 * the content settle only ever replaces the CONTENT slice of `noteChildren`. Disjoint JSON
 * regions of the same note, so the two never race or clobber each other regardless of which runs
 * first.
 *
 * Also mirrors the glyph's own text and, if present, the closer's — `node.setMarker(clean)` and
 * `closer.setMarker(clean)` in the real branch — even though NEITHER ever reaches the settled USJ
 * output (`MarkerNode.getType()` is presentation-only and contributes nothing to
 * `deserializeSerializedEditorState`'s output, editor-usj.adaptor.ts): keeping the serialized copy
 * a faithful mirror of the live mutation, not just the slice of it this settle's own OUTPUT
 * happens to expose today.
 */
function $applySettledNoteGlyphRename(
  rename: { glyph: MarkerNode; note: NoteNode; oldMarker: string; newMarker: string },
  sites: Map<NodeKey, SerializedSite>,
): void {
  const { glyph, note, oldMarker, newMarker } = rename;
  if (!NoteNode.isValidMarker(newMarker)) return;

  const noteSite = sites.get(note.getKey());
  if (noteSite) (noteSite.node as SerializedLexicalNode & { marker?: string }).marker = newMarker;

  const glyphSite = sites.get(glyph.getKey());
  if (glyphSite) rewriteSettledGlyphMarker(glyphSite.node, newMarker);

  // Mirrors $applyOpenerRename's own closer lookup exactly: the LAST closing-syntax MarkerNode
  // child whose marker still matches the opener's OLD marker. An unclosed note (no closing glyph
  // at all) simply has no match here, same as the real branch's own `if (closer)` no-op.
  const closer = note
    .getChildren()
    .filter($isMarkerNode)
    .filter((child) => child.getMarkerSyntax() === "closing" && child.getMarker() === oldMarker)
    .at(-1);
  const closerSite = closer && sites.get(closer.getKey());
  if (closerSite) rewriteSettledGlyphMarker(closerSite.node, newMarker);
}

/**
 * The settled USJ for the editor state `serializedState` was exported from, or `undefined` when
 * nothing settleable is pending (the caller keeps whatever it already has). Call INSIDE a
 * `read()` of that same state. `serializedState` is mutated in place and must therefore be a fresh
 * `toJSON()` result the caller does not otherwise hold.
 *
 * `transientInput` is the advisory declaration from `EditorRef.setTransientInput` — re-verified
 * here, against the live caret, every call ({@link $verifiedTransientLiteral}). A verified
 * declaration settles its own scope even when `pendedKeys` is empty: the whole point is that the
 * declared bytes never reach a consumer, and the paragraph or note they sit in may otherwise be
 * perfectly settled already, with nothing else pending there to trigger a settle at all.
 *
 * `lastKnownCaret` is `Editor.tsx`'s remembered last-observed collapsed caret, used only as
 * `$verifiedTransientLiteral`'s fallback when the live selection is absent (see its own doc
 * comment for the exact race this closes).
 */
export function $settledUsj(
  serializedState: SerializedEditorState,
  pendedKeys: ReadonlySet<NodeKey>,
  context: Tier2Context,
  transientInput?: TransientInput,
  lastKnownCaret?: LastKnownCaret,
): Usj | undefined {
  const transient = $verifiedTransientLiteral(transientInput, lastKnownCaret);
  if (pendedKeys.size === 0 && !transient) return undefined;

  const paraScopes = new Map<NodeKey, ParaNode>();
  const noteScopes = new Map<NodeKey, NoteNode>();
  const noteGlyphRenames = new Map<
    NodeKey,
    { glyph: MarkerNode; note: NoteNode; oldMarker: string; newMarker: string }
  >();
  for (const key of pendedKeys) {
    const node = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    const scope = $settleScopeForNode(node);
    if (!scope) continue;
    if ($isNoteNode(scope)) {
      noteScopes.set(scope.getKey(), scope);
      const rename = $noteGlyphRenameTarget(node);
      if (rename) noteGlyphRenames.set(scope.getKey(), rename);
    } else paraScopes.set(scope.getKey(), scope);
  }
  if (transient) {
    // No note-glyph-rename lookup for this scope: a transient declaration is plain typed text, not
    // a bare-opener rename Tier 1 would route to `$applyOpenerRename` — see
    // `$noteGlyphRenameTarget`'s own doc comment for what that shape looks like.
    const scope = $settleScopeForNode(transient.node);
    if (scope) {
      if ($isNoteNode(scope)) noteScopes.set(scope.getKey(), scope);
      else paraScopes.set(scope.getKey(), scope);
    }
  }
  const husks = $emptiedOptbreakHusksOf(pendedKeys);
  if (paraScopes.size === 0 && noteScopes.size === 0 && husks.length === 0) return undefined;
  const huskKeys = new Set(husks.map((husk) => husk.getKey()));

  const sites = new Map<NodeKey, SerializedSite>();
  $mapSerializedSites($getRoot().getChildren(), serializedState.root.children, sites);

  // Note-own-glyph renames: independent of, and safely composable with, the notes/para content
  // passes below — see `$applySettledNoteGlyphRename`'s own doc comment for why the two never
  // conflict (disjoint JSON regions of the same note).
  for (const rename of noteGlyphRenames.values()) $applySettledNoteGlyphRename(rename, sites);

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
    const built = $settledNoteContent(note, sites, context, huskKeys, transient);
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
    const rebuilt = $settledParaNodes(para, sites, context, huskKeys, transient);
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
