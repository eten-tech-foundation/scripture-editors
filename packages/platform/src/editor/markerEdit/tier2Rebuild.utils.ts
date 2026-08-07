/**
 * Tier 2 paragraph-scoped re-tokenization. Runs INSIDE the
 * triggering update (transform or command listener), so the rebuild and the
 * user's edit are one history entry. Blast radius is paragraph-local.
 *
 * Sentinel classification and the paragraph guard (`$buildParaFragment`) are
 * lookup-driven: both take a `MarkerLookup` (the `getMarker` seam) via
 * `Tier2Context.getMarker`, so a project's custom.sty markers are classified —
 * and rebuild — exactly like standard usfm.sty markers whenever a project
 * `StyleInfo` is active, with the bundled table only as the no-project default.
 */

import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { MarkerContent, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $parseSerializedNode,
  ElementNode,
  LexicalNode,
  SerializedLexicalNode,
  TextNode,
} from "lexical";
import {
  $hasUnrecoverableAttributes,
  $isAttributeRunNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  $milestoneAttributeRunPieces,
  getEditableCallerText,
  isMilestoneHeuristicName,
  LoggerBasic,
  MarkerLookup,
  MarkerType,
  NBSP,
  NoteNode,
  ParaNode,
  textTypeState,
  usfmFragmentToUsjContent,
  VerseNode,
} from "shared";
import { $isImmutableNoteCallerNode, ViewOptions } from "shared-react";

export interface Tier2Context {
  viewOptions: ViewOptions;
  getMarker: MarkerLookup;
  logger?: LoggerBasic;
}

export const ATOMIC_SENTINEL = "￼";

export interface FragmentSpan {
  key: string;
  start: number;
  end: number;
  isSentinel: boolean;
}

export interface FragmentAccumulator {
  text: string;
  spans: FragmentSpan[];
  /** One entry per U+FFFC, in fragment order; each entry is a node RUN to re-insert. */
  sentinels: LexicalNode[][];
}

function pushText(out: FragmentAccumulator, node: LexicalNode, text: string): void {
  out.spans.push({
    key: node.getKey(),
    start: out.text.length,
    end: out.text.length + text.length,
    isSentinel: false,
  });
  out.text += text;
}

/** Fragment tail that is an unterminated marker token (`\wj`, `\+`, or a bare `\`): the
 * tokenizer's name scan stops only at `\`, `|`, whitespace, or `*`, so ANY other character —
 * the U+FFFC placeholder included — would extend the marker name. */
const UNTERMINATED_MARKER_TAIL = /\\\+?[\w-]*$/;

function pushSentinel(out: FragmentAccumulator, nodes: LexicalNode[]): void {
  // A placeholder glued to an unterminated marker token would be absorbed into the marker NAME
  // (`\wj` + U+FFFC scans as unknown marker "wj￼"), vanishing from the tokenized text and
  // tripping the sentinel-count abort — so a deleted separator before a preserved node (a note,
  // milestone, or attribute span right after an opener) could never settle. Emit the separator
  // the tokenizer expects after an opening marker; it is structural there (consumed by the
  // opener's separator scan), and mid-word placements (`wa` + note + `tta`) are unaffected.
  if (UNTERMINATED_MARKER_TAIL.test(out.text)) out.text += " ";
  out.spans.push({
    key: nodes[0].getKey(),
    start: out.text.length,
    end: out.text.length + 1,
    isSentinel: true,
  });
  out.sentinels.push(nodes);
  out.text += ATOMIC_SENTINEL;
}

/** Display text → USFM fragment text: structural NBSP separators become plain spaces. */
function toFragmentText(text: string): string {
  return text.replaceAll(NBSP, " ");
}

/**
 * A TextNode's contribution to the rebuild fragment. The para-prefix trailing-space node is
 * structurally a single display separator, so it normally contributes a plain " " regardless of
 * its NBSP content — but when the user has TYPED INTO it (the content-start caret position lands
 * inside it), it carries a literal run that must reach the tokenizer (e.g. `\zz `
 * typed at content start was dropped here, so the rebuild reproduced the paragraph unchanged and
 * the literal never settled). Substitute the separator only while the node is pure whitespace.
 */
function $textNodeFragmentText(node: TextNode): string {
  const text = node.getTextContent();
  if ($getState(node, textTypeState) !== "marker-trailing-space") return text;
  return /^[\s\u00A0]*$/.test(text) ? " " : text;
}

/**
 * Display siblings after a MilestoneNode that belong to its run: opening
 * MarkerNode, optional attribute TextNode, self-closing MarkerNode. They ride
 * inside the milestone's sentinel so the visible glyphs survive the rebuild.
 *
 * Delegates to the shared {@link $milestoneAttributeRunPieces} — the single definition of "a
 * milestone's run" — so the rebuild and the self-healing sync (attributeDisplay.utils.ts) can
 * never disagree about which siblings make up the run. The rebuild consumes a CONTIGUOUS run
 * starting at the opening glyph (it advances the loop index past `run.length`), so a milestone
 * with no opening glyph contributes no run here; the tolerant scanner can also surface a detached
 * attribute/closer with no opening, but that partial shape never reaches a settled rebuild.
 *
 * When the pieces were found inside an `AttributeRunNode` wrapper, the returned run is
 * `[wrapper]` — ONE element, not the wrapper's unpacked children — so the caller's `index +=
 * run.length` advances past the ONE sibling slot the wrapper occupies. `$appendNodesFragment`'s
 * generic ElementNode branch already flattens a transparent wrapper's children into the fragment
 * (the same branch TypedMarkNode relies on), so the fragment bytes come out byte-identical to the
 * loose shape without any special-casing there. An attached-but-EMPTY wrapper (no opening glyph
 * found inside it) still returns `[]`, exactly like a bare milestone with no run at all — the
 * `run.length > 0` re-tokenizable gate below must see "no run", not a 1-length run that
 * contributes zero bytes, or a bare-but-wrapped milestone would be silently spliced away.
 */
function $milestoneDisplayRun(children: LexicalNode[], index: number): LexicalNode[] {
  const milestone = children[index];
  if (!$isMilestoneNode(milestone)) return [];
  const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(milestone);
  if (wrapper) return opening ? [wrapper] : [];
  // Loose-sibling arm — removable once nothing builds loose runs: the pieces ride as bare
  // siblings, unpacked individually rather than as a single wrapper node.
  if (!opening) return [];
  const run: LexicalNode[] = [opening];
  if (attribute) run.push(attribute);
  if (closing) run.push(closing);
  return run;
}

/**
 * Display siblings after a VerseNode that belong to its \va/\vp display triplets: an opening
 * MarkerNode, an attribute TextNode, and a closing MarkerNode for `\va`, then the same shape for
 * `\vp` (attributeDisplay.utils.ts's `$syncVerseAttributeDisplay`/usj-editor.adaptor's
 * `addVerseAttributes`). A verse that re-tokenizes (the common case — see `verseNeedsSentinel`)
 * flows the run as ordinary fragment content right after the verse's own glyph text, so the
 * tokenizer's attrCapture folds `\va`/`\vp` back onto the freshly re-derived verse exactly as it
 * would for literal typed text. Only a still-sentinel verse (`unknownAttributes`) absorbs the run
 * into its OWN sentinel — see `$milestoneDisplayRun`'s non-re-tokenizable branch for the same
 * shape — so the tokenizer never sees `\va`/`\vp` immediately after an opaque U+FFFC placeholder
 * with no verse to fold onto (which would degrade them into unrelated standalone markers).
 *
 * For either marker, when the next sibling slot is a matching `AttributeRunNode`
 * wrapper, that ONE node is pushed instead of its unpacked pieces (mirrors `$milestoneDisplayRun`
 * — the generic ElementNode branch in `$appendNodesFragment` flattens it for the fragment builder
 * without any further special-casing). An attached-but-EMPTY wrapper is treated as "no run for
 * this marker" and stops the scan — the same outcome the loose-piece scan already has for a
 * verse with no `\va` at all (a missing/invalid piece for the CURRENT marker breaks the loop
 * before the OTHER marker is even attempted), so a degenerate wrapper is no less tolerant than
 * the pre-existing loose-shape behavior.
 */
function $verseAttributeRun(children: LexicalNode[], index: number): LexicalNode[] {
  const run: LexicalNode[] = [];
  for (const marker of ["va", "vp"] as const) {
    const next = children[index + run.length + 1];
    if ($isAttributeRunNode(next) && next.getRunKind() === marker) {
      if (next.getChildrenSize() === 0) break;
      run.push(next);
      continue;
    }
    // Loose-sibling arm — removable once nothing builds loose runs: the pieces ride as bare
    // siblings, matched individually rather than as a single wrapper node.
    const opening = next;
    if (
      !$isMarkerNode(opening) ||
      opening.getMarkerSyntax() !== "opening" ||
      opening.getMarker() !== marker
    )
      break;
    const value = children[index + run.length + 2];
    if (!$isTextNode(value) || $getState(value, textTypeState) !== "attribute") break;
    const closing = children[index + run.length + 3];
    if (
      !$isMarkerNode(closing) ||
      closing.getMarkerSyntax() !== "closing" ||
      closing.getMarker() !== marker
    )
      break;
    run.push(opening, value, closing);
  }
  return run;
}

/**
 * A verse whose state is not fully recoverable from its visible text stays atomic.
 * altnumber/pubnumber round-trip through the \va/\vp display run
 * (attributeDisplay.utils.ts's `$syncVerseAttributeDisplay`, usj-editor.adaptor's
 * `addVerseAttributes`), and `sid` is reconciled separately by carry-over in `$rebuildParas`
 * (pairing old and new verses by position/number) rather than kept alive by atomicity — only
 * `unknownAttributes`, which has no display representation at all, forces the sentinel.
 */
function verseNeedsSentinel(node: VerseNode): boolean {
  return Boolean(node.getUnknownAttributes());
}

/**
 * Whether `marker` re-tokenizes as a milestone, mirroring the tokenizer's OWN classification
 * (`usfmFragmentToUsjContent`) exactly: stylesheet-declared `MarkerType.Milestone`, or — when the
 * effective stylesheet doesn't know the marker at all (the bundled table has no milestone
 * entries; a project `StyleInfo` might) — the same stylesheet-family name heuristic the tokenizer
 * falls back to. A name the heuristic deliberately excludes (a heuristic-gap name like bare `ts`,
 * valid per `MilestoneNode.isValidMarker` but not a stylesheet-declared milestone name) would
 * tokenize back as something else entirely — such a marker must stay atomic.
 */
function $isReTokenizableMilestone(marker: string, getMarkerFn: MarkerLookup): boolean {
  const kind = getMarkerFn(marker)?.type;
  return kind === MarkerType.Milestone || (kind === undefined && isMilestoneHeuristicName(marker));
}

/**
 * Mirrors `$appendChildrenFragment`'s "preserve this node atomically" classification. A milestone
 * re-tokenizes exactly when its marker classifies as one (`$isReTokenizableMilestone`): its
 * display run (opening glyph, optional attribute text, self-closing glyph) is ordinary text among
 * its paragraph siblings, and the tokenizer's `scanMilestone` re-derives sid/eid/unknownAttributes
 * from it — a genuine round trip, not a preserved blob. A char span's attribute bytes are
 * similarly no longer classified wholesale: a span WITH a closing glyph renders its attributes as
 * an ordinary `|…` display run among its children (attributeDisplay.utils.ts), so the fragment
 * builder re-tokenizes it like any other char content and `extractAttributes` re-derives the
 * attribute set. A span with NO closing glyph (implicitly-closed footnote/cross-reference content,
 * or explicit `closed="false"`) never gets a display run at all, so any OTHER attribute it carries
 * (`link-href` on an auto-closed `\xt`, say) has no visible bytes to re-derive from —
 * `$hasUnrecoverableAttributes` keeps exactly that shape atomic. A verse is classified the same
 * way (`verseNeedsSentinel`): its \va/\vp display run is ordinary content among its paragraph
 * siblings when the verse re-tokenizes, and only `unknownAttributes` — which has no visible
 * representation at all — forces the sentinel. `sid` plays no part in this classification: it is
 * derived data, invisible in display bytes, reconciled by carry-over in `$rebuildParas` after the
 * rebuild rather than by atomicity.
 */
function $isRebuildSentinel(node: LexicalNode, getMarkerFn: MarkerLookup): boolean {
  if ($isMilestoneNode(node)) return !$isReTokenizableMilestone(node.getMarker(), getMarkerFn);
  if ($isNoteNode(node) || $isUnknownNode(node)) return true;
  if ($isVerseNode(node)) return verseNeedsSentinel(node);
  if ($isCharNode(node))
    return $hasUnrecoverableAttributes(node) || getMarkerFn(node.getMarker()) === undefined;
  return false;
}

// Delimiters (never present in scripture text) that wrap a structural element's
// signature span so a structural change is always visible in the signature string.
const SIGNATURE_OPEN = String.fromCharCode(1);
const SIGNATURE_CLOSE = String.fromCharCode(2);

/**
 * Flattens any `AttributeRunNode`(s) in `run` into their own children, so a wrapped run's
 * signature is structurally IDENTICAL to the loose equivalent's — no extra "attribute-run"
 * type-tagged span the generic `$isElementNode` branch below would otherwise add. Unlike the
 * fragment builder (whose generic ElementNode branch already flattens a transparent wrapper's
 * bytes for free, since fragment text carries no structural tagging), the SIGNATURE tags every
 * element's type, so the wrapper itself must be skipped explicitly here, not just its bytes.
 */
function $flattenAttributeRuns(run: LexicalNode[]): LexicalNode[] {
  return run.flatMap((node) => ($isAttributeRunNode(node) ? node.getChildren() : [node]));
}

/**
 * Structure-aware, sentinel-normalized signature of a node list, used ONLY to detect
 * a `$rebuildParas` no-op (fixed point). Marker glyphs and text contribute their
 * fragment text; every structural element (paragraph, CharNode span, verse-as-text,
 * transparent wrapper) contributes a delimited, type-tagged span — so any structural
 * change a real rebuild makes (e.g. flat `\nd x\nd*` literal text becoming a CharNode)
 * yields a different signature and is never mistaken for a no-op. Preserved (sentinel)
 * nodes and the U+FFFC placeholders that stand in for them until `$replaceSentinels`
 * both collapse to `ATOMIC_SENTINEL`, so a pre-splice rebuild output and the paragraphs
 * it was derived from compare equal IFF the rebuild changed nothing that matters.
 */
function $appendSignature(children: LexicalNode[], out: string[], getMarkerFn: MarkerLookup): void {
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMilestoneNode(node)) {
      // Mirror `$appendChildrenFragment`: a re-tokenizable milestone's display run (opening
      // MarkerNode, optional attribute text, self-closing MarkerNode) is ordinary signature
      // content. The run text ALONE is not enough, though — like a char span's display run
      // (see the char branch below), it is a derived cache that can lag the node's true
      // attribute state: an in-place value edit (the leading NBSP kept, only the value bytes
      // changed) produces run text byte-identical to what re-tokenizing it would regenerate,
      // so both comparison sides render the same bytes and only the milestone's own STALE
      // sid/eid/unknownAttributes reveal that the rebuild is not a no-op. Fold that state in
      // alongside the recursed run, or the fixed-point refusal silently discards the edit. A
      // non-re-tokenizable milestone's run is instead absorbed into the SAME single sentinel
      // the fragment builder produces for it — the post-splice NEW side's sentinel already
      // stands in for the whole run, so the pre-splice OLD side must collapse the run the
      // same way or the signatures never compare equal and the refusal never fires.
      const run = $milestoneDisplayRun(children, index);
      // An empty run (the collab materializer builds bare MilestoneNodes with no display-run
      // siblings) has NO displayable bytes to re-tokenize, so it must collapse to the same single
      // sentinel `$appendNodesFragment` produces for it — else this side would fold in the
      // milestone's state while the fragment side dropped it, and the fixed-point check would
      // spuriously diverge (mirror the fragment builder's `run.length > 0` gate below).
      if ($isReTokenizableMilestone(node.getMarker(), getMarkerFn) && run.length > 0) {
        out.push(
          SIGNATURE_OPEN,
          "ms",
          JSON.stringify({
            sid: node.getSid() ?? null,
            eid: node.getEid() ?? null,
            unknownAttributes: node.getUnknownAttributes() ?? null,
          }),
        );
        $appendSignature($flattenAttributeRuns(run), out, getMarkerFn);
        out.push(SIGNATURE_CLOSE);
      } else out.push(ATOMIC_SENTINEL);
      index += run.length;
    } else if ($isVerseNode(node)) {
      // A sentinel verse's \va/\vp display run (if any) is absorbed into the SAME single
      // sentinel `$appendNodesFragment` produces for it — same reasoning as the non-re-
      // tokenizable milestone case above: the post-splice NEW side's sentinel already stands in
      // for verse + run together, so the pre-splice OLD side must collapse them the same way.
      const run = $verseAttributeRun(children, index);
      if (verseNeedsSentinel(node)) out.push(ATOMIC_SENTINEL);
      else {
        // The run text is a DERIVED CACHE ($syncVerseAttributeDisplay, attributeDisplay.utils.ts)
        // that can lag the verse's own altnumber/pubnumber state — an in-place value edit that
        // keeps the triplet's structural NBSP and changes only the value bytes produces run text
        // byte-identical on both sides of this comparison (it was edited directly on the live OLD
        // node, and re-tokenizing that same edited text regenerates the identical NEW run), so
        // only the verse's own STALE field reveals the rebuild is not a no-op — the same reason
        // a re-tokenizable milestone folds its own sid/eid/unknownAttributes in alongside its
        // recursed run above. Fold number/altnumber/pubnumber in alongside the recursed run.
        // `unknownAttributes` is omitted: this branch runs only when `verseNeedsSentinel` is
        // false, so it is always undefined here by construction.
        //
        // `sid` is DELIBERATELY excluded. This comparison runs on the OLD side (still carrying
        // its sid) against the freshly re-tokenized NEW side, which never has one — sid
        // carry-over (`$rebuildParas`, after the splice) runs strictly AFTER this fixed-point
        // check has already decided whether a rebuild happens at all. Folding raw sid in here
        // would make every sid-bearing verse compare unequal forever (a real value vs. an
        // always-absent one), forcing an endless splice-then-refuse rebuild on every unrelated
        // edit anywhere else in the same paragraph.
        //
        // The verse's own GLYPH TEXT is folded in (fragment-normalized, so its NBSP separator
        // matches the re-tokenized NEW side's): a VerseNode is a TextNode, and this branch
        // shortcuts the generic TextNode case below, so without this a whitespace-only glyph edit
        // (`\v 2 ` → `\v 2  `) that leaves number/altnumber/pubnumber unchanged would compare equal
        // to its canonical re-tokenization and refuse forever — a permanent non-settling state.
        out.push(
          SIGNATURE_OPEN,
          "verse",
          toFragmentText(node.getTextContent()),
          JSON.stringify({
            number: node.getNumber(),
            altnumber: node.getAltnumber() ?? null,
            pubnumber: node.getPubnumber() ?? null,
          }),
        );
        $appendSignature($flattenAttributeRuns(run), out, getMarkerFn);
        out.push(SIGNATURE_CLOSE);
      }
      index += run.length;
    } else if ($isMarkerNode(node)) {
      // Delimited and tagged (not bare glyph text) so text moving across the
      // glyph/content boundary — e.g. glyph "\q extra" vs. glyph "\q" + content
      // "extra" — changes the signature instead of silently canceling out.
      out.push(SIGNATURE_OPEN, "marker", toFragmentText(node.getTextContent()), SIGNATURE_CLOSE);
    } else if ($isRebuildSentinel(node, getMarkerFn)) {
      out.push(ATOMIC_SENTINEL);
    } else if ($isLineBreakNode(node)) {
      out.push(" ");
    } else if ($isTextNode(node)) {
      out.push(toFragmentText($textNodeFragmentText(node)));
    } else if ($isCharNode(node)) {
      // A known-marker span that reaches here is NOT a sentinel ($isRebuildSentinel already
      // filtered unknown markers) — fold its own stored `unknownAttributes` into the signature
      // alongside its recursed children. The attribute display run is a DERIVED CACHE
      // (attributeDisplay.utils.ts) that can lag the node's true attribute state — e.g. the run
      // was deleted but the field is still stale — so comparing children text alone could
      // mistake a genuine attribute change for a fixed point.
      out.push(SIGNATURE_OPEN, "char", JSON.stringify(node.getUnknownAttributes() ?? null));
      $appendSignature(node.getChildren(), out, getMarkerFn);
      out.push(SIGNATURE_CLOSE);
    } else if ($isElementNode(node)) {
      out.push(SIGNATURE_OPEN, node.getType());
      $appendSignature(node.getChildren(), out, getMarkerFn);
      out.push(SIGNATURE_CLOSE);
    } else {
      out.push(ATOMIC_SENTINEL);
    }
  }
}

function $signatureOf(nodes: LexicalNode[], getMarkerFn: MarkerLookup): string {
  const out: string[] = [];
  $appendSignature(nodes, out, getMarkerFn);
  return out.join("");
}

function $appendChildrenFragment(
  element: ElementNode,
  out: FragmentAccumulator,
  getMarkerFn: MarkerLookup,
): void {
  $appendNodesFragment(element.getChildren(), out, getMarkerFn);
}

function $appendNodesFragment(
  children: LexicalNode[],
  out: FragmentAccumulator,
  getMarkerFn: MarkerLookup,
): void {
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMarkerNode(node)) {
      pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isMilestoneNode(node)) {
      // The MilestoneNode itself contributes no bytes (an invisible decorator); its display
      // run is the marker's actual USFM representation. A re-tokenizable milestone's run flows
      // into the fragment as ordinary text — `scanMilestone` re-derives sid/eid/unknownAttributes
      // from it on tokenize, closing the loop that let an edited attribute value settle. A
      // milestone the tokenizer would not re-derive as one (`$isReTokenizableMilestone`) stays a
      // preserved sentinel, node and run together, exactly as before.
      const run = $milestoneDisplayRun(children, index);
      // Require a non-empty run for the re-tokenizable path: a bare MilestoneNode (the collab
      // materializer `$createMilestone` builds these with no display-run siblings) would
      // contribute ZERO bytes here, so the rebuild would splice it away entirely — a silent
      // deletion. With no displayable bytes it degrades to an atomic sentinel and survives
      // (the spec's "state not recoverable from displayed bytes → atomic" self-protection).
      if ($isReTokenizableMilestone(node.getMarker(), getMarkerFn) && run.length > 0)
        $appendNodesFragment(run, out, getMarkerFn);
      else pushSentinel(out, [node, ...run]);
      index += run.length;
    } else if ($isNoteNode(node) || $isUnknownNode(node)) {
      pushSentinel(out, [node]);
    } else if ($isVerseNode(node)) {
      // A sentinel verse's \va/\vp display run (attributeDisplay.utils.ts) rides inside its
      // sentinel, node and run together — exactly like a non-re-tokenizable milestone's run
      // above. Re-tokenizing the run's bytes on their own (after the verse's own opaque
      // placeholder) would hand the tokenizer `\va`/`\vp` with no verse to fold onto, degrading
      // them into unrelated standalone markers instead of leaving the paragraph untouched.
      // Otherwise (the common case) the verse's own glyph text flows into the fragment like any
      // other content, immediately followed by its run's bytes as ordinary siblings — the
      // tokenizer's attrCapture folds `\va`/`\vp` right back onto the freshly re-derived verse.
      const run = $verseAttributeRun(children, index);
      if (verseNeedsSentinel(node)) {
        pushSentinel(out, [node, ...run]);
      } else {
        pushText(out, node, toFragmentText($textNodeFragmentText(node)));
        $appendNodesFragment(run, out, getMarkerFn);
      }
      index += run.length;
    } else if ($isCharNode(node)) {
      // Unknown-marker spans (custom.sty) are not text-recoverable: the tokenizer would degrade
      // them to literal text (preserve-or-refuse). Likewise a span whose attributes have no
      // closing glyph to anchor a display run (`$hasUnrecoverableAttributes`) carries bytes with
      // no visible representation to re-derive from. Otherwise a KNOWN marker's attribute display
      // run (if any) is ordinary text among its children — it re-tokenizes and re-derives via
      // `extractAttributes` like the rest of the span's content.
      if ($hasUnrecoverableAttributes(node) || getMarkerFn(node.getMarker()) === undefined)
        pushSentinel(out, [node]);
      else $appendChildrenFragment(node, out, getMarkerFn);
    } else if ($isLineBreakNode(node)) {
      pushText(out, node, " ");
    } else if ($isTextNode(node)) {
      pushText(out, node, toFragmentText($textNodeFragmentText(node)));
    } else if ($isElementNode(node)) {
      // TypedMarkNode and other transparent wrappers: annotation marks are
      // host-reapplied overlays; their text content is rebuilt as plain content.
      $appendChildrenFragment(node, out, getMarkerFn);
    } else {
      pushSentinel(out, [node]);
    }
  }
}

/**
 * Exported so a test can compare a loose-shape paragraph's fragment `.text` against its
 * hand-built wrapped-shape equivalent for byte-for-byte equality (`tier2Rebuild.utils.test.tsx`)
 * — the direct evidence that wrapping a run changes nothing about what gets tokenized. Every
 * other caller in this module still reaches it only through `$rebuildParas`/`$rebuildNoteContent`.
 */
export function $buildParaFragment(
  para: ParaNode,
  getMarkerFn: MarkerLookup,
): FragmentAccumulator | undefined {
  // Guard rails (preserve-or-refuse): a paragraph the engine cannot fully
  // re-derive from its text is never rebuilt — edits inside it stay literal text.
  if (para.getUnknownAttributes()) return undefined;
  // Known non-paragraph kinds can't be re-derived as paragraphs. Unknown markers
  // now round-trip: the tokenizer emits them as paragraphs in body context (PT9
  // DetermineUnknownTokenType), so they no longer refuse.
  const paraKind = getMarkerFn(para.getMarker())?.type;
  if (
    paraKind !== undefined &&
    paraKind !== MarkerType.Unknown &&
    paraKind !== MarkerType.Paragraph
  )
    return undefined;
  // Paragraphs inside opaque blocks (sidebars, periph, …) stay untouched.
  for (let parent = para.getParent(); parent !== null; parent = parent.getParent())
    if ($isUnknownNode(parent)) return undefined;
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendChildrenFragment(para, out, getMarkerFn);
  return out;
}

/** Replace each U+FFFC in the rebuilt tree with the next preserved node run. */
function $replaceSentinels(roots: LexicalNode[], originals: LexicalNode[][]): void {
  let queueIndex = 0;
  const visit = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      let current: TextNode | undefined = node;
      while (current) {
        const text: string = current.getTextContent();
        const at = text.indexOf(ATOMIC_SENTINEL);
        if (at < 0) break;
        let sentinelNode: TextNode = current;
        let after: TextNode | undefined;
        if (at > 0) [, sentinelNode] = current.splitText(at) as [TextNode, TextNode];
        if (sentinelNode.getTextContent().length > 1)
          [sentinelNode, after] = sentinelNode.splitText(1) as [TextNode, TextNode];
        const run = originals[queueIndex++];
        if (run && run.length > 0) {
          let previous: LexicalNode = sentinelNode;
          for (const original of run) {
            previous.insertAfter(original); // moves it out of the old paragraph
            previous = original;
          }
        }
        sentinelNode.remove();
        current = after;
      }
    } else if ($isElementNode(node)) {
      // copy: children may be replaced while visiting
      [...node.getChildren()].forEach(visit);
    }
  };
  roots.forEach(visit);
}

/**
 * Every VerseNode under `nodes`, depth-first in document order (including a verse nested inside
 * a char span that crosses it, per USFM ≤3.0 — see the tier2Rebuild.utils.test.tsx D5 fixed-point
 * test). Backs sid carry-over in `$rebuildParas`: the OLD side is read into plain data before the
 * splice moves or destroys anything; the NEW side is read once the splice has settled.
 */
function $collectVerseNodes(nodes: LexicalNode[], out: VerseNode[] = []): VerseNode[] {
  for (const node of nodes) {
    if ($isVerseNode(node)) out.push(node);
    else if ($isElementNode(node)) $collectVerseNodes(node.getChildren(), out);
  }
  return out;
}

/** U+FFFC occurrences across a parsed node tree — must equal the preserved-run count. */
function countSentinelNodes(nodes: LexicalNode[]): number {
  let count = 0;
  const visit = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      for (const ch of node.getTextContent()) if (ch === ATOMIC_SENTINEL) count++;
    } else if ($isElementNode(node)) {
      node.getChildren().forEach(visit);
    }
  };
  nodes.forEach(visit);
  return count;
}

/** U+FFFC occurrences across tokenized content — must equal the preserved-run count. */
function countSentinels(content: MarkerContent[]): number {
  let count = 0;
  for (const item of content) {
    if (typeof item === "string") {
      for (const ch of item) if (ch === ATOMIC_SENTINEL) count++;
    } else if (item.content) {
      count += countSentinels(item.content);
    }
  }
  return count;
}

function $spansForNodes(nodes: LexicalNode[], getMarkerFn: MarkerLookup): FragmentSpan[] {
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const node of nodes) {
    if (out.text.length > 0) out.text += " ";
    if ($isElementNode(node)) $appendChildrenFragment(node, out, getMarkerFn);
  }
  return out.spans;
}

/**
 * The caret as a CUMULATIVE span-text offset: the summed length of the spans before the
 * anchor's span, plus the in-span offset (a sentinel span counts as its single placeholder
 * char). Cumulative — rather than raw `span.start` fragment-string — coordinates exclude
 * the non-span filler between spans (the inter-paragraph " " joiners), which a rebuild can
 * add or remove (e.g. a mid-paragraph marker splitting off its own paragraph). Span TEXT
 * itself is preserved by the tokenizer (the degradation property), so a cumulative offset
 * captured over the old spans lands on the same character over the new spans; a raw offset
 * would shift past every added joiner (leaving the caret restored INSIDE the new glyph,
 * scrambling subsequent keystrokes).
 */
function caretSpanTextOffset(
  spans: FragmentSpan[],
  anchorKey: string,
  anchorOffset: number,
): number | undefined {
  let cumulative = 0;
  for (const span of spans) {
    const length = span.end - span.start;
    if (span.key === anchorKey)
      return cumulative + Math.min(span.isSentinel ? 1 : anchorOffset, length);
    cumulative += length;
  }
  return undefined;
}

/**
 * Whether a span is a CLOSING (or self-closing) marker glyph. The caret never lands on such a
 * glyph: a completed closer (`\nd*`) has the caret belong on the content AFTER it, not inside the
 * glyph where continued typing would edit the marker. An OPENING glyph is deliberately NOT matched
 * here — a half-typed opener keeps the caret in the glyph so the user can extend the marker name.
 */
function $isClosingMarkerSpan(span: FragmentSpan): boolean {
  if (span.isSentinel) return false;
  const node = $getNodeByKey(span.key);
  return $isMarkerNode(node) && node.getMarkerSyntax() !== "opening";
}

/**
 * Place the caret AFTER a closing marker glyph's enclosing span — the append position in the
 * paragraph, PAST the whole char span — for a typed closer (`\nd*`) at paragraph END with nothing
 * after it. The forward scan skips closing glyphs to land on the following content; when there IS no
 * following content (para end), the caret still belongs after the closer, not at the end of the
 * span's inner text (which is the closer glyph's start-of-glyph boundary, i.e. INSIDE the span,
 * where continued typing edits within the marker). `selectNext` off the span, whose closer is its
 * last child, resolves to the paragraph point just after it. Returns whether it placed the caret.
 *
 * Only a genuine char-span closer has an enclosing span to escape from this way. A verse's
 * `\va`/`\vp` closer and a milestone's self-closing `\*` are never wrapped in a char span — they
 * ride as ordinary PARAGRAPH siblings (`$verseAttributeRun`/`$milestoneDisplayRun`), so the
 * glyph's parent is the paragraph itself. `selectNext` on the PARAGRAPH would move the point past
 * the whole paragraph (into the next block, or off the end of the document), not just past the
 * closer within it, so a paragraph-direct closer falls through to the caller's other fallback
 * instead.
 */
function $selectAfterClosingSpan(span: FragmentSpan): boolean {
  const glyph = $getNodeByKey(span.key);
  if (!$isMarkerNode(glyph)) return false;
  const enclosingSpan = glyph.getParent();
  if (!$isCharNode(enclosingSpan)) return false;
  enclosingSpan.selectNext(0, 0);
  return true;
}

/** Place the collapsed caret at cumulative span-text `offset` (see `caretSpanTextOffset`)
 * within `spans`, falling back to the first element. */
function $selectAtFragmentOffset(
  spans: FragmentSpan[],
  offset: number,
  newNodes: LexicalNode[],
): void {
  let best: { key: string; offset: number } | undefined;
  let cumulative = 0;
  for (const span of spans) {
    const length = span.end - span.start;
    // Skip sentinels (their inner text is not addressable) and closing marker glyphs (see
    // $isClosingMarkerSpan); an offset that fell on either resolves to the start of the next
    // addressable span. Both still advance `cumulative` so the offset stays aligned with the
    // captured text offset.
    if (!span.isSentinel && !$isClosingMarkerSpan(span) && offset <= cumulative + length) {
      best = { key: span.key, offset: Math.max(offset - cumulative, 0) };
      break;
    }
    cumulative += length;
  }
  if (!best) {
    // The offset ran past every addressable span. When the LAST span is a completed closer glyph
    // (a typed `\nd*` at paragraph end, nothing after), the caret belongs AFTER the whole span —
    // an append position in the paragraph — so continued typing is unstyled. The reverse-find
    // fallback below would instead park it at the end of the preceding text, i.e. INSIDE the span.
    const lastSpan = spans[spans.length - 1];
    if (lastSpan && $isClosingMarkerSpan(lastSpan) && $selectAfterClosingSpan(lastSpan)) return;
    const last = [...spans]
      .reverse()
      .find((span) => !span.isSentinel && !$isClosingMarkerSpan(span));
    if (last) best = { key: last.key, offset: last.end - last.start };
  }
  if (best) {
    const node = $getNodeByKey<TextNode>(best.key);
    if (node && $isTextNode(node)) {
      node.select(best.offset, best.offset);
      return;
    }
  }
  newNodes.find($isElementNode)?.selectStart();
}

function $restoreSelectionAtOffset(
  newNodes: LexicalNode[],
  offset: number | undefined,
  anchorInParas: boolean,
  getMarkerFn: MarkerLookup,
): void {
  // The caret was somewhere else entirely (the primary completion flow: the user
  // typed a mid-edit marker, then clicked/arrowed into another paragraph, which is
  // what triggered this rebuild). The rebuilt paragraphs are not where the caret
  // lives, so leave the selection strictly untouched rather than yanking it back in.
  if (!anchorInParas) return;
  if (offset === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  $selectAtFragmentOffset($spansForNodes(newNodes, getMarkerFn), offset, newNodes);
}

/**
 * Restore the caret inside rebuilt NOTE content. Unlike `$restoreSelectionAtOffset`, the
 * content nodes form one contiguous region, so spans are computed with `$appendNodesFragment`
 * (no inter-node separators) to match the offset captured over `$buildNoteFragment`'s text.
 */
function $restoreSelectionInNoteContent(
  newNodes: LexicalNode[],
  offset: number | undefined,
  anchorInNote: boolean,
  getMarkerFn: MarkerLookup,
): void {
  if (!anchorInNote) return;
  if (offset === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(newNodes, out, getMarkerFn);
  $selectAtFragmentOffset(out.spans, offset, newNodes);
}

export function $rebuildParas(paras: ParaNode[], context: Tier2Context): boolean {
  if (paras.length === 0) return false;
  const { viewOptions, getMarker: getMarkerFn, logger } = context;

  const combined: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const para of paras) {
    const fragment = $buildParaFragment(para, getMarkerFn);
    if (!fragment) {
      logger?.debug("[MarkerEdit] Tier 2 skipped: paragraph excluded by guard rails");
      return false;
    }
    if (combined.text.length > 0) combined.text += " ";
    const base = combined.text.length;
    fragment.spans.forEach((span) =>
      combined.spans.push({ ...span, start: span.start + base, end: span.end + base }),
    );
    combined.sentinels.push(...fragment.sentinels);
    combined.text += fragment.text;
  }

  // Capture the caret as a fragment offset before mutating anything, and note whether
  // the anchor was actually inside the paragraphs being rebuilt (vs. parked elsewhere).
  let caretOffset: number | undefined;
  let anchorInParas = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (paras.some((para) => para.is(node))) {
        anchorInParas = true;
        break;
      }
    if (selection.isCollapsed())
      caretOffset = caretSpanTextOffset(
        combined.spans,
        selection.anchor.key,
        selection.anchor.offset,
      );
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(combined.text, {
    getMarker: getMarkerFn,
  });
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  // Symmetry bail-out: every preserved node run must have exactly one placeholder
  // in the output, or the rebuild aborts with the paragraph untouched. A tokenizer
  // bug must fail as "nothing happened", never as a silently dropped node.
  if (countSentinels(content) !== combined.sentinels.length) {
    logger?.warn("[MarkerEdit] Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  );
  const newNodes = serialized.root.children.map((child) => $parseSerializedNode(child));

  // Second sentinel check, now on the SERIALIZED->PARSED tree: the tokenizer-level count above
  // guards the MarkerContent, but the serialize/parse round trip is a separate place a U+FFFC
  // placeholder can vanish. If the parsed tree has fewer (or more) than the preserved-run count,
  // $replaceSentinels would silently drop or mis-pair a preserved node. Abort untouched instead.
  if (countSentinelNodes(newNodes) !== combined.sentinels.length) {
    logger?.warn("[MarkerEdit] Tier 2 aborted: serialized sentinel/preserved-node count mismatch");
    return false;
  }

  // Fixed-point refusal (preserve-or-refuse). If the freshly-tokenized output is
  // structurally identical to the paragraphs it was derived from, this rebuild is a
  // no-op: splicing it in would reproduce the same unresolved literal text (a bare
  // `\`, non-attribute content before a milestone's `\*`, or an unterminated milestone
  // run — the tokenizer's remaining literal-degradation cases; a stray `\*` and most
  // unknown markers now resolve structurally instead, see usfmFragmentToUsjContent's
  // doc comment), re-arm the TextNode catch-all
  // transform, and — via the caret-departure/Enter completion path — drive an endless
  // resolve→rebuild→resolve cascade that hangs the main thread. Compare BEFORE any
  // mutation and bail. The signature normalizes preserved nodes and their U+FFFC
  // placeholders to the same token, so this is a structure+text comparison, not node
  // identity; a rebuild that actually restructures anything (literal `\nd x\nd*` → a
  // CharNode span, or an unknown opener splitting off its own paragraph) has a
  // different signature and is never mistaken for a no-op.
  if ($signatureOf(newNodes, getMarkerFn) === $signatureOf(paras, getMarkerFn)) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  // Snapshot the old paragraphs' verse number/sid pairs, in document order, as plain data —
  // BEFORE the splice below moves or destroys the old paragraphs (a removed node's fields are
  // not safe to read afterward). Sid carry-over (below) pairs this against the freshly
  // re-tokenized tree's verses once the splice has settled.
  const oldVerseSids = $collectVerseNodes(paras).map((verse) => ({
    number: verse.getNumber(),
    sid: verse.getSid(),
  }));

  const firstPara = paras[0];
  newNodes.forEach((node) => firstPara.insertBefore(node));
  // Move originals BEFORE removing the old paragraphs (removal destroys leftovers).
  $replaceSentinels(newNodes, combined.sentinels);
  paras.forEach((para) => para.remove());
  // Sid carry-over: a freshly re-tokenized verse never has a sid — the tokenizer cannot derive
  // one from visible bytes — so pair the old and new
  // verses positionally in document order and copy the old sid onto its partner wherever the
  // verse NUMBER is unchanged. A renumbered verse (the pair's numbers disagree) gets no sid
  // synthesized; a sentinel verse (unknownAttributes) is the SAME instance on both sides of the
  // pairing, so this is a harmless no-op for it. Runs strictly AFTER the fixed-point check above,
  // which deliberately never looks at sid (see the `$appendSignature` verse branch) — sid is
  // reconciled here, once, only when a rebuild is already happening for some other reason.
  const newVerses = $collectVerseNodes(newNodes);
  for (let i = 0; i < oldVerseSids.length && i < newVerses.length; i++) {
    if (newVerses[i].getNumber() === oldVerseSids[i].number)
      newVerses[i].setSid(oldVerseSids[i].sid);
  }
  $restoreSelectionAtOffset(newNodes, caretOffset, anchorInParas, getMarkerFn);
  return true;
}

/**
 * Build the re-tokenizable fragment for a note's CONTENT children — everything strictly
 * between the note's opening MarkerNode(s) + caller prefix and its trailing closing
 * MarkerNode(s). Preserve-or-refuse (returns undefined) when the note is collapsed, has
 * unknown attributes, an unrecoverable marker, or an unexpected caller/prefix shape: a
 * note the engine cannot cleanly re-derive is never rebuilt.
 */
function $buildNoteFragment(
  note: NoteNode,
  getMarkerFn: MarkerLookup,
): { out: FragmentAccumulator; contentNodes: LexicalNode[] } | undefined {
  // Only inline-expanded notes are re-tokenizable: a collapsed note's content is not
  // inline-editable and its display layout (interspersed spacing) is not text-recoverable.
  if (note.getIsCollapsed() !== false) return undefined;
  // The note node itself (marker, caller, and any unknown attributes such as the
  // unclosed-note `closed="false"`) is PRESERVED across the rebuild, so its own
  // attributes never disqualify a content re-tokenization; only a marker the engine
  // cannot recognize is refused as a sanity guard.
  if (!NoteNode.isValidMarker(note.getMarker())) return undefined;

  const children = note.getChildren();
  // Skip the leading opening-marker(s) prefix.
  let start = 0;
  while (start < children.length) {
    const node = children[start];
    if (!$isMarkerNode(node) || node.getMarkerSyntax() !== "opening") break;
    start++;
  }
  // Skip the caller node (an ImmutableNoteCallerNode, or the expanded editable caller
  // TextNode); anything else in this slot is an unexpected shape, so refuse.
  const callerNode = children[start];
  if (!callerNode) return undefined;
  const isCaller =
    $isImmutableNoteCallerNode(callerNode) ||
    ($isTextNode(callerNode) &&
      callerNode.getTextContent() === getEditableCallerText(note.getCaller()));
  if (!isCaller) return undefined;
  start++;
  // Skip the trailing closing-marker(s).
  let end = children.length;
  while (end > start) {
    const node = children[end - 1];
    if (!$isMarkerNode(node) || node.getMarkerSyntax() !== "closing") break;
    end--;
  }

  const contentNodes = children.slice(start, end);
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(contentNodes, out, getMarkerFn);
  return { out, contentNodes };
}

/**
 * Note-scoped Tier 2 re-tokenization. Mirrors `$rebuildParas` but
 * operates on a single note's CONTENT children. The note node identity, its opening
 * marker(s), its caller, and its closing marker(s) are PRESERVED; only the content is
 * re-tokenized. Preserve-or-refuse: any guard-rail failure returns false with the note
 * untouched (never a partial mutation, never an infinite loop). A NoteNode inside a
 * PARAGRAPH rebuild stays an atomic sentinel; only this path descends into its content.
 */
export function $rebuildNoteContent(note: NoteNode, context: Tier2Context): boolean {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn);
  if (!built) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: note excluded by guard rails");
    return false;
  }
  const { out, contentNodes } = built;

  // Capture the caret as a fragment offset before mutating, noting whether the anchor
  // was actually inside this note (vs. parked elsewhere) — mirror `$rebuildParas`.
  let caretOffset: number | undefined;
  let anchorInNote = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (note.is(node)) {
        anchorInNote = true;
        break;
      }
    if (selection.isCollapsed())
      caretOffset = caretSpanTextOffset(out.spans, selection.anchor.key, selection.anchor.offset);
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text, {
    getMarker: getMarkerFn,
    isNoteContext: true,
  });
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  // Symmetry bail-out (see `$rebuildParas`): a preserved-run/placeholder mismatch aborts
  // the rebuild with the note untouched rather than silently dropping a node.
  if (countSentinels(content) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  // Serialize note content with noteMode:"expanded" so char spans render editable inline,
  // then UNWRAP the tokenizer's default \p wrapper (root -> para -> content).
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    noteViewOptions,
  );
  const topLevel = serialized.root.children;
  const wrapper = topLevel[0] as { children?: SerializedLexicalNode[] } | undefined;
  const wrapperChildren = wrapper?.children;
  if (topLevel.length !== 1 || !wrapperChildren) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: unexpected serialized shape");
    return false;
  }
  // The editable \p wrapper prepends a visible para MarkerNode + marker-trailing-space
  // that must NOT enter the note content; drop ONLY that leading prefix pair on unwrap. Other
  // MarkerNodes among the unwrapped children are real display glyphs — e.g. a freshly tokenized
  // milestone's opening `\ts-s` and self-closing `\*` glyphs are SIBLINGS of the MilestoneNode —
  // and a strip-every-MarkerNode filter ate them, leaving the milestone glyph-less until reload.
  const parsed = wrapperChildren.map((child) => $parseSerializedNode(child));
  let contentStart = 0;
  if ($isMarkerNode(parsed[0]) && parsed[0].getMarkerSyntax() === "opening") {
    contentStart = 1;
    const second = parsed[1];
    if (
      $isTextNode(second) &&
      !$isMarkerNode(second) &&
      $getState(second, textTypeState) === "marker-trailing-space"
    )
      contentStart = 2;
  }
  const newNodes = parsed.slice(contentStart);
  if (newNodes.length === 0) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: no content nodes after unwrap");
    return false;
  }

  // Fixed-point refusal (preserve-or-refuse) on the CONTENT nodes only: if the freshly
  // tokenized content is structurally identical to what it was derived from, splicing it
  // would re-arm the trigger and loop. Compare BEFORE any mutation and bail.
  if ($signatureOf(newNodes, getMarkerFn) === $signatureOf(contentNodes, getMarkerFn)) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  // Splice: insert the new content before the first old content node (or before the
  // closing marker / at the note end when the note had no prior content), move preserved
  // sentinel runs into place, then remove the originals.
  const firstContent = contentNodes[0];
  if (firstContent) {
    newNodes.forEach((node) => firstContent.insertBefore(node));
  } else {
    const closing = note
      .getChildren()
      .find((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
    newNodes.forEach((node) => (closing ? closing.insertBefore(node) : note.append(node)));
  }
  $replaceSentinels(newNodes, out.sentinels);
  // Unlike `$rebuildParas` (which removes container PARAGRAPHS the preserved nodes were
  // already moved out of), the old content list here contains the preserved sentinel nodes
  // THEMSELVES — `$replaceSentinels` just moved them into the rebuilt content, so removing
  // them here would silently delete them from their new home. Skip them.
  const preservedKeys = new Set(out.sentinels.flat().map((node) => node.getKey()));
  contentNodes.forEach((node) => {
    if (!preservedKeys.has(node.getKey())) node.remove();
  });
  $restoreSelectionInNoteContent(newNodes, caretOffset, anchorInNote, getMarkerFn);
  return true;
}

/** Route a Tier 1-unexpressible edit to Tier 2 via the node's paragraph or note. Returns whether
 * the routed rebuild actually SPLICED — a guard-rail or fixed-point refusal mutates nothing, and
 * the deferred-resolution history bookkeeping ($resolvePendingMarkers callers) needs to tell the
 * two apart. */
export function $requestTier2ForNode(node: LexicalNode, context: Tier2Context): boolean {
  let current: LexicalNode | null = node;
  while (current) {
    // Note content is its own re-tokenization scope: route to the note-scoped
    // rebuild, which preserves the note node, its marker(s), and its caller.
    if ($isNoteNode(current)) return $rebuildNoteContent(current, context);
    // Opaque-block interior (sidebars, periph, …): stay literal.
    if ($isUnknownNode(current)) return false;
    if ($isParaNode(current)) return $rebuildParas([current], context);
    current = current.getParent();
  }
  return false;
}
