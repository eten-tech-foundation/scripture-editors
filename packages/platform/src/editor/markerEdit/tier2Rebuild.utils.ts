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
import { UNTERMINATED_MARKER_TAIL } from "./markerName.pattern";
import {
  $serializeExpandedNoteContent,
  ATOMIC_SENTINEL,
  charOwnChildSignatureText,
} from "./settleShared.utils";
import {
  MarkerContent,
  MarkerObject,
  USJ_TYPE,
  USJ_VERSION,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
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
  $isChapterNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isImpliedParaNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  $isMarkerTrailingSeparator,
  $milestoneAttributeRunPieces,
  $verseAttributeRunPieces,
  closingMarkerText,
  getEditableCallerText,
  getMarker as bundledGetMarker,
  isAttributeMarker,
  isMilestoneHeuristicName,
  openingMarkerText,
  ChapterNode,
  CharNode,
  ImpliedParaNode,
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
import { $isImmutableNoteCallerNode, hasStandardViewWhitespace, ViewOptions } from "shared-react";

/**
 * Everything a Tier-2 rebuild needs that is not the nodes themselves: the active view options
 * (which decide the display scaffolding a rebuild re-materializes) and the `getMarker` seam (the
 * stylesheet lookup driving sentinel classification and kind checks — a project `StyleInfo` when
 * one is active, the bundled table otherwise). The engine's transforms extend this as
 * `MarkerEditContext` (markerEditTier1.utils.ts); read-only consumers (the settle mirror, test
 * harnesses) build it directly.
 */
export interface Tier2Context {
  viewOptions: ViewOptions;
  getMarker: MarkerLookup;
  logger?: LoggerBasic;
}

/**
 * One contiguous byte range `[start, end)` of a fragment's text and the node key it came from —
 * the map that lets a rebuild carry the caret across re-tokenization by BYTE position
 * (`$selectAtFragmentByteAnchor`) and lets the read-only mirror attribute settled bytes back to
 * serialized nodes. `isSentinel` marks the one-byte U+FFFC stand-ins for atomically-preserved
 * nodes.
 */
export interface FragmentSpan {
  key: string;
  start: number;
  end: number;
  isSentinel: boolean;
}

/**
 * A settle scope's displayed bytes flattened for the tokenizer: the fragment `text` (with each
 * atomically-preserved node as a one-byte U+FFFC placeholder), the {@link FragmentSpan} map back
 * to the contributing nodes, and the preserved node runs to re-insert where each placeholder
 * lands. Built by the fragment builders (`$buildParaFragment` and kin); consumed by the rebuild's
 * tokenize-and-splice and by caret restoration.
 */
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

/** Display text → USFM fragment text: structural NBSP separators become plain spaces. Applied to
 * GLYPH text, attribute runs, and the para-prefix separator in every view, and to content text
 * under standard-view whitespace (see {@link contentFragmentText} for why content differs by
 * view). Also the normalization both signature builders apply to every text field — deliberately
 * view-independent there: the signature only ever compares the live scope against its own fresh
 * rebuild, so as long as BOTH sides flatten identically the comparison is exact, and a
 * view-dependent signature would buy nothing while opening a mirror-drift surface. */
export function toFragmentText(text: string): string {
  return text.replaceAll(NBSP, " ");
}

/**
 * Display text → USFM fragment text for a CONTENT run — plain text that is not glyph bytes, not
 * an attribute run, and not the para-prefix separator. What an NBSP byte in such a run MEANS
 * depends on the view, so the flattening must too:
 *
 * - Standard-view whitespace: a data NBSP displays as `~` (usjTextToDisplay), so an NBSP byte in
 *   display text is always a display artifact — a space-run member or a structural separator —
 *   and flattens to " " ({@link toFragmentText}).
 * - Unformatted (editable without the standard whitespace mapping): a content NBSP IS the data
 *   byte. It is spelled `~` — the tokenizer's input convention (`usjText` maps `~` back to NBSP,
 *   PT9 UsfmParser) — so a settle that rewrites the paragraph round-trips it instead of
 *   corrupting it to a plain space. Two structural shapes still flatten to " " even here:
 *   a node that is EXACTLY one NBSP (the engine-owned spacer / empty-char placeholder shape,
 *   which serialization also treats as structural — the lone-NBSP byte test in
 *   editor-usj.adaptor.ts), and the one structural leading NBSP fused onto a char span's first
 *   content child (`structuralLead` — the positional twin of `createCharMarker`'s non-standard
 *   first-string strip in editor-usj.adaptor.ts).
 *
 * ONE definition for every fragment producer: the mutating rebuilds and the read-only settle both
 * build their fragments through `$appendNodesFragment` below, so the mirror can never flatten a
 * content NBSP differently from the live path (a disagreement there is a fixed-point refusal —
 * the editor refusing to settle).
 */
export function contentFragmentText(
  text: string,
  viewOptions: ViewOptions | undefined,
  structuralLead = false,
): string {
  if (hasStandardViewWhitespace(viewOptions)) return toFragmentText(text);
  if (text === NBSP) return " ";
  const hasLead = structuralLead && text.startsWith(NBSP);
  const body = hasLead ? text.slice(1) : text;
  return (hasLead ? " " : "") + body.replaceAll(NBSP, "~");
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
  if (!$isMarkerTrailingSeparator(node)) return text;
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
 * loose shape without any special-casing there.
 *
 * This is SLOT accounting, so it deliberately does NOT require the run's glyphs to still be
 * canonical, even though `$milestoneAttributeRunPieces` reports a byte-damaged glyph as absent
 * (correct for the self-healing sync, which needs the damage to read as divergence). Skipping the
 * run because a byte is pending in its opening glyph leaves the run's bytes behind as an
 * unconsumed sibling: the milestone degrades to a preserved sentinel AND its own bytes flow into
 * the fragment as ordinary text, so the tokenizer re-derives a SECOND milestone from them while
 * the sentinel restores the first — one milestone on screen, two in the file.
 *
 * An attached-but-EMPTY wrapper still occupies its slot and is still returned; what protects a
 * bare-but-wrapped milestone from being silently spliced away is the callers' byte gate
 * ({@link milestoneRunRendersBytes}), not a zero-length run.
 */
function $milestoneDisplayRun(children: LexicalNode[], index: number): LexicalNode[] {
  const milestone = children[index];
  if (!$isMilestoneNode(milestone)) return [];
  const { attribute, closing, wrapper } = $milestoneAttributeRunPieces(milestone);
  if (wrapper) return [wrapper];
  // No wrapper found: the shared scanner above can still surface a genuinely LOOSE run (a
  // pre-flip editor state, an undo stack, or a collab-materialized bare milestone that hasn't
  // gone through heal-forward yet) — unpacked as individual pieces here, rather than one wrapper
  // node, since that is how they actually ride in the tree. Reporting nothing for a loose-but-
  // present run would misclassify a re-tokenizable milestone as content-less (see the byte gate
  // at both call sites below), stranding its bytes as ordinary text right next to the milestone's
  // own now-empty sentinel instead of flowing them as its run. The opening SLOT is claimed from
  // the sibling directly, for the same canonicality reason as the wrapper above; the trailing
  // pieces come from the shared scanner, and a damaged opening simply leaves them to flow as the
  // adjacent text they already are (the same bytes, in the same order).
  const next = milestone.getNextSibling();
  if (
    !$isMarkerNode(next) ||
    next.getMarkerSyntax() !== "opening" ||
    next.getMarker() !== milestone.getMarker()
  )
    return [];
  const run: LexicalNode[] = [next];
  if (attribute) run.push(attribute);
  if (closing) run.push(closing);
  return run;
}

/**
 * Whether a milestone's display run actually RENDERS bytes — the gate deciding whether the
 * milestone can re-tokenize from its run (it can only be re-derived from bytes that exist) or
 * must ride through the rebuild as a preserved sentinel together with its run.
 *
 * Byte-valued rather than length-valued on purpose: a run's slot can be occupied by an empty
 * `AttributeRunNode` wrapper, or by a bare milestone with no run at all (the collab materializer
 * `$createMilestone` builds these), and both contribute ZERO bytes — so re-tokenizing would
 * splice the milestone away entirely, a silent deletion. The spec's "state not recoverable from
 * displayed bytes → atomic" self-protection.
 */
function milestoneRunRendersBytes(run: LexicalNode[]): boolean {
  return run.some((node) => node.getTextContent().length > 0);
}

/**
 * Display siblings after a VerseNode that belong to its \va/\vp display triplets: an opening
 * MarkerNode, an attribute TextNode, and a closing MarkerNode for `\va`, then the same shape for
 * `\vp` (displayRunSync.utils.ts's `$syncDisplayRun`, parameterized by the `va`/`vp` descriptors in
 * displayRunRegistry.ts; usj-editor.adaptor's
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
 * without any further special-casing) — even an attached-but-EMPTY wrapper is pushed: it occupies
 * exactly one slot in `children` regardless of emptiness, and contributes zero bytes/signature
 * entries downstream (flattening an empty element yields nothing), so including it keeps the
 * per-marker slot accounting exact without changing what either caller sees.
 *
 * `\va` and `\vp` are each attempted INDEPENDENTLY at their own position: a marker with no piece
 * there AT ALL — the common "this verse has no `\va`" case, or a `\vp`-only verse (a real,
 * permanent shape the sync builds, not just mid-edit debris) — contributes nothing and leaves the
 * slot for the OTHER marker to claim, rather than aborting the whole scan. Only a PARTIAL match
 * (an opener found but its value/closer missing or wrong) stops the scan entirely: such debris'
 * true extent can't be inferred from here, so continuing risks misreading the OTHER marker's own
 * content as part of it.
 *
 * Delegates each marker's scan to the shared {@link $verseAttributeRunPieces} — the single
 * definition of "a verse marker's run pieces", also used by the self-healing sync
 * (attributeDisplay.utils.ts) — rather than re-walking siblings independently here, so the two can
 * never disagree about which shape (wrapped, loose, or partial) is present at a given position.
 * That scanner already tolerates a genuinely LOOSE run too (a pre-flip editor state, an undo
 * stack, or a collab-materialized bare verse mid-heal-forward), so its pieces are still reported
 * here as individual nodes when found unwrapped — dropping them would misread a re-tokenizable
 * `\va`/`\vp` as absent, stranding its bytes as ordinary text beside the verse instead of flowing
 * them as its run.
 */
function $verseAttributeRun(children: LexicalNode[], index: number): LexicalNode[] {
  const run: LexicalNode[] = [];
  let anchor: LexicalNode = children[index];
  for (const marker of ["va", "vp"] as const) {
    const { opener, value, closer, wrapper } = $verseAttributeRunPieces(anchor, marker);
    if (wrapper) {
      run.push(wrapper);
      anchor = wrapper;
    } else if (opener && value && closer) {
      run.push(opener, value, closer);
      anchor = closer;
    } else if (opener || value || closer) {
      break; // partial match — true extent can't be inferred from here, so stop the scan
    }
  }
  return run;
}

/**
 * A verse whose state is not fully recoverable from its visible text stays atomic.
 * altnumber/pubnumber round-trip through the \va/\vp display run
 * (displayRunSync.utils.ts's `$syncDisplayRun`, usj-editor.adaptor's
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
// Exported for the read-only settle's serialized-side signature mirror (virtualSettle.utils.ts) —
// classifying a freshly-tokenized milestone's re-tokenizability must use the exact same rule on
// both the live and the JSON side.
export function $isReTokenizableMilestone(marker: string, getMarkerFn: MarkerLookup): boolean {
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
 *
 * Exported for the read-only settle's own live-side structural-marker walk
 * (virtualSettle.utils.ts's `$liveStructuralMarkers`), which must treat a node as opaque under
 * the EXACT SAME rule `$appendSignature` does — that walk collects a live ParaNode's/CharNode's
 * own `marker` field to compensate for a blind spot in the signature comparison, and a sentinel
 * node's nested markers are not a blind spot at all: `$appendSignature` already collapses the
 * WHOLE sentinel to one opaque character before ever reaching a CharNode/generic-element branch
 * that would recurse into it, so the live walk must stop at exactly the same boundary or it
 * collects markers the JSON side (built from a tree where the sentinel is already just one
 * character inside a text node, with nothing to recurse into) can never have a counterpart for.
 */
export function $isRebuildSentinel(node: LexicalNode, getMarkerFn: MarkerLookup): boolean {
  if ($isMilestoneNode(node)) return !$isReTokenizableMilestone(node.getMarker(), getMarkerFn);
  if ($isNoteNode(node) || $isUnknownNode(node)) return true;
  if ($isVerseNode(node)) return verseNeedsSentinel(node);
  if ($isCharNode(node)) return $charNeedsSentinel(node, getMarkerFn);
  return false;
}

/**
 * Whether a char span must be preserved whole rather than re-tokenized — the one authority for
 * that question, shared with the fragment builder's own CharNode branch. The two decide the same
 * thing about the same node and MUST agree: the builder replaces a sentinel span with a single
 * placeholder character, and {@link $isRebuildSentinel} is what tells the signature and the
 * read-only settle's live walk to stop at exactly that boundary.
 *
 * Two shapes are not text-recoverable. A span carrying attribute bytes with nowhere visible to
 * re-derive them from ({@link $hasUnrecoverableAttributes}), and a span whose marker the
 * stylesheet does not declare — a custom.sty marker the tokenizer would degrade to literal text.
 *
 * An ATTRIBUTE marker is exempt from the stylesheet test, because for those the stylesheet is
 * not the authority: the tokenizer's own table folds them onto their host, so the round trip is
 * defined without a stylesheet entry. `\cat` is the case this exists for — the only attribute
 * marker usfm.sty omits, and so the only one a stylesheet-keyed test mistakes for a custom
 * marker. Preserved as a sentinel it can never settle: its bytes stop reaching the tokenizer, the
 * category fold never fires, and every later pass reports a fixed point, so a typed `\cat` run
 * becomes a category only by round-tripping through the file.
 */
function $charNeedsSentinel(char: CharNode, getMarkerFn: MarkerLookup): boolean {
  if ($hasUnrecoverableAttributes(char)) return true;
  const marker = char.getMarker();
  return !isAttributeMarker(marker) && getMarkerFn(marker) === undefined;
}

/**
 * Delimiter (never present in scripture text) opening a structural element's span inside a
 * signature string ({@link $signatureOf}), so a structural change is always visible in the
 * signature even when the flattened text is unchanged. Exported for the read-only settle's
 * serialized-side signature mirror (virtualSettle.utils.ts), which must compose signatures
 * byte-identically or the two fixed-point refusal checks would disagree.
 */
export const SIGNATURE_OPEN = String.fromCharCode(1);
/** Closing counterpart of {@link SIGNATURE_OPEN}. */
export const SIGNATURE_CLOSE = String.fromCharCode(2);

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
 *
 * `insideCharChildren` is true only while appending a CharNode's OWN direct children (set by this
 * function's own CharNode branch below) — mirrors `editor-usj.adaptor.ts`'s `recurseNodes`'s
 * `isCharChild` parameter exactly, including how it resets for anything nested one level deeper
 * that is not itself another CharNode (which gets its own fresh `true` at its own branch). See
 * `charOwnChildSignatureText`'s doc comment (settleShared.utils.ts) for what it gates.
 */
function $appendSignature(
  children: LexicalNode[],
  out: string[],
  getMarkerFn: MarkerLookup,
  insideCharChildren = false,
): void {
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
      // A run with no displayable bytes (the collab materializer builds bare MilestoneNodes with
      // no display-run siblings) has nothing to re-tokenize, so it must collapse to the same
      // single sentinel `$appendNodesFragment` produces for it — else this side would fold in the
      // milestone's state while the fragment side dropped it, and the fixed-point check would
      // spuriously diverge (mirror the fragment builder's byte gate below).
      if (
        $isReTokenizableMilestone(node.getMarker(), getMarkerFn) &&
        milestoneRunRendersBytes(run)
      ) {
        out.push(
          SIGNATURE_OPEN,
          "ms",
          // `marker` is part of the state for the same reason the attributes below are, and it is
          // the one the SAVE leg reads: `createMilestoneMarker` (editor-usj.adaptor.ts) emits the
          // milestone's own `marker` field, never the glyph bytes. Renaming the opening glyph
          // (`\qt-s` → `\qt1-s`) leaves those bytes identical on both sides of this comparison —
          // the OLD side shows the user's edit, and re-tokenizing that same text regenerates the
          // identical glyph — so only the milestone's STALE `marker` reveals the rebuild is not a
          // no-op. Without this fold the fixed-point refusal fires, the rename never reaches node
          // state, and the file keeps the old name while the screen shows the new one.
          //
          // `attributeOrder` is part of the state: the serialized key order follows it, so a
          // USER EDIT that only REORDERS the run's attributes (values unchanged, displayed
          // bytes identical to their own re-tokenization) is a real document change — without
          // this fold both sides compare equal, the fixed-point refusal fires, and the stale
          // order silently survives the settle. An unedited non-canonical load stays a fixed
          // point: the fresh side re-derives the same authored order from the same bytes.
          JSON.stringify({
            marker: node.getMarker(),
            sid: node.getSid() ?? null,
            eid: node.getEid() ?? null,
            unknownAttributes: node.getUnknownAttributes() ?? null,
            attributeOrder: node.getAttributeOrder() ?? null,
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
        // The run text is a DERIVED CACHE ($syncDisplayRun, displayRunSync.utils.ts)
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
    } else if ($isImmutableUnmatchedNode(node)) {
      // Tagged for the same reason as marker glyphs: an unmatched element's BYTES are identical
      // to the literal text it resolves from (`\*` typed as text vs the flagged element), so a
      // bare-text contribution would make that resolution signature-invisible and the
      // fixed-point refusal would block it forever.
      out.push(SIGNATURE_OPEN, "unmatched", toFragmentText(node.getTextContent()), SIGNATURE_CLOSE);
    } else if ($isRebuildSentinel(node, getMarkerFn)) {
      out.push(ATOMIC_SENTINEL);
    } else if ($isLineBreakNode(node)) {
      out.push(" ");
    } else if ($isTextNode(node)) {
      out.push(
        toFragmentText(
          insideCharChildren
            ? charOwnChildSignatureText($textNodeFragmentText(node))
            : $textNodeFragmentText(node),
        ),
      );
    } else if ($isCharNode(node)) {
      // A known-marker span that reaches here is NOT a sentinel ($isRebuildSentinel already
      // filtered unknown markers) — fold its own stored `unknownAttributes` into the signature
      // alongside its recursed children. The attribute display run is a DERIVED CACHE
      // (attributeDisplay.utils.ts) that can lag the node's true attribute state — e.g. the run
      // was deleted but the field is still stale — so comparing children text alone could
      // mistake a genuine attribute change for a fixed point.
      out.push(SIGNATURE_OPEN, "char", JSON.stringify(node.getUnknownAttributes() ?? null));
      $appendSignature(node.getChildren(), out, getMarkerFn, true);
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

/**
 * Exported for the read-only settle (virtualSettle.utils.ts): it computes this SAME signature for
 * the CURRENT live paragraph, to compare against a JSON-side mirror of this function run over the
 * freshly-rebuilt (but not yet materialized into live nodes) output — the fixed-point refusal
 * `$rebuildParas` applies below must not silently become optional just because the read-only path
 * cannot create nodes to run this live-node version on both sides.
 */
export function $signatureOf(nodes: LexicalNode[], getMarkerFn: MarkerLookup): string {
  const out: string[] = [];
  $appendSignature(nodes, out, getMarkerFn);
  return out.join("");
}

/** A serialized element's children, or `undefined` for a leaf. */
export function serializedChildren(
  node: SerializedLexicalNode,
): SerializedLexicalNode[] | undefined {
  const { children } = node as { children?: SerializedLexicalNode[] };
  return Array.isArray(children) ? children : undefined;
}

/** A serialized TextNode's text, or `undefined` for anything else. */
export function serializedText(node: SerializedLexicalNode): string | undefined {
  const { text } = node as { text?: string };
  return typeof text === "string" ? text : undefined;
}

/** A serialized node's own `type` tag, or `""` for a shape with none. */
export function serializedType(node: SerializedLexicalNode): string {
  return (node as { type?: string }).type ?? "";
}

/** A serialized MarkerNode's canonical glyph text, re-derived from `marker`/`markerSyntax`/
 * `nested` — the exact mirror of `MarkerNode.ts`'s own (unexported) `getMarkerText`. */
export function serializedMarkerGlyphText(
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
export function serializedRunWrapperChildren(
  nodes: SerializedLexicalNode[],
  index: number,
): SerializedLexicalNode[] | undefined {
  const sibling = nodes[index];
  if (!sibling || serializedType(sibling) !== "attribute-run") return undefined;
  return serializedChildren(sibling) ?? [];
}

/**
 * JSON-serialized mirror of `$appendSignature`/`$signatureOf` above, for a FRESHLY-SERIALIZED
 * rebuild tree — never arbitrary live-tree debris, since that is the only tree this ever runs
 * over. This is the JSON side of the ONE fixed-point comparison BOTH settles make against
 * `$signatureOf` of the live scope, and both make it for their own load-bearing reason:
 *
 * - The MUTATING settle (`$rebuildParas` and its note/chapter siblings below) computes it on the
 *   serialized rebuild BEFORE `$parseSerializedNode`, so a refusal materializes NO live nodes.
 *   That is what makes a refused re-settle a true no-op: parse orphans count as dirty leaves,
 *   which turn a refusal into a real commit — reconciliation, a DOM selection round trip, and a
 *   follow-on caret-normalization commit that can displace the caret out from under an active
 *   gesture (observed: a caret parked in span content yanked to the paragraph glyph, so the next
 *   keystrokes landed outside the span).
 * - The READ-ONLY settle cannot parse at all (Lexical forbids creating nodes inside a `read()`),
 *   and without the refusal a rebuild the mutating settle would refuse as a no-op (its own
 *   displayed bytes are already what re-tokenizing them produces, once normalized — e.g. a
 *   structural NBSP separator and a user's own typed space both collapse to the same plain
 *   space) would get spliced into its OUTPUT, silently replacing the user's own
 *   currently-displayed bytes with a DIFFERENT-looking (though equivalent-by-signature) rebuild.
 *
 * One computation feeding both is also what keeps the two settles' refusal decisions from ever
 * drifting apart — a drift here is a fixed-point disagreement, i.e. the editor refusing to
 * converge.
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
export function serializedSignatureOf(
  nodes: SerializedLexicalNode[],
  getMarkerFn: MarkerLookup,
): string {
  const out: string[] = [];
  appendSerializedSignature(nodes, out, getMarkerFn);
  return out.join("");
}

/**
 * `insideCharChildren` is true only while appending a "char" node's OWN direct children (set by
 * this function's own "char" branch below) — the JSON-side mirror of `$appendSignature`'s own
 * `insideCharChildren` parameter above, including how it resets for anything nested one level
 * deeper that is not itself another "char" node.
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
        attributeOrder?: unknown;
      };
      const runChildren = serializedRunWrapperChildren(children, index + 1);
      if (runChildren && $isReTokenizableMilestone(milestone.marker ?? "", getMarkerFn)) {
        out.push(
          SIGNATURE_OPEN,
          "ms",
          // `marker` mirrored from `$appendSignature`'s fold: a glyph RENAME leaves the displayed
          // bytes identical on both sides, so only the milestone's own stale `marker` reveals the
          // rebuild is not a no-op — and `marker` is exactly what the save leg serializes.
          // `attributeOrder` mirrored from `$appendSignature`'s fold: an attribute REORDER
          // (values unchanged) is a real document change — serialized key order follows it.
          JSON.stringify({
            marker: milestone.marker ?? "",
            sid: milestone.sid ?? null,
            eid: milestone.eid ?? null,
            unknownAttributes: milestone.unknownAttributes ?? null,
            attributeOrder: milestone.attributeOrder ?? null,
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
    if (type === "unmatched") {
      // Tagged, mirroring `$appendSignature`'s unmatched branch — the bare-text fallback below
      // would otherwise match this node's `.text` field and make the literal→flagged-element
      // resolution signature-invisible on the JSON side.
      out.push(SIGNATURE_OPEN, "unmatched", toFragmentText(serializedText(node) ?? ""));
      out.push(SIGNATURE_CLOSE);
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

/** U+FFFC occurrences across a serialized tree — the serialize-side half of the symmetry
 * bail-out, for comparisons made before (or without) a parsed tree. */
export function countSerializedSentinels(nodes: SerializedLexicalNode[]): number {
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

function $appendChildrenFragment(
  element: ElementNode,
  out: FragmentAccumulator,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
  charLead?: { pending: boolean },
): void {
  $appendNodesFragment(element.getChildren(), out, getMarkerFn, viewOptions, charLead);
}

/**
 * `charLead`, when given, tracks a char span's ONE structural leading NBSP (see
 * {@link contentFragmentText}): it starts pending at the span's first child and is consumed by
 * the first content-position node — glyphs excluded — whether or not that node is the text that
 * carries the fused prefix (element-first content puts a pure spacer there instead, and any text
 * AFTER an element's slot has a data leading NBSP, never the structural one).
 */
function $appendNodesFragment(
  children: LexicalNode[],
  out: FragmentAccumulator,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
  charLead?: { pending: boolean },
): void {
  // Reads-and-clears the char span's pending structural-lead flag. Called from every
  // content-position branch below; glyphs (MarkerNode) never consume it, and the transparent
  // wrapper branch passes it through instead — a mark wrapper's children sit in the SAME content
  // positions the wrapper occupies.
  const consumeCharLead = (): boolean => {
    const pending = charLead?.pending === true;
    if (charLead) charLead.pending = false;
    return pending;
  };
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMarkerNode(node)) {
      pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isMilestoneNode(node)) {
      consumeCharLead();
      // The MilestoneNode itself contributes no bytes (an invisible decorator); its display
      // run is the marker's actual USFM representation. A re-tokenizable milestone's run flows
      // into the fragment as ordinary text — `scanMilestone` re-derives sid/eid/unknownAttributes
      // from it on tokenize, closing the loop that let an edited attribute value settle. A
      // milestone the tokenizer would not re-derive as one (`$isReTokenizableMilestone`) stays a
      // preserved sentinel, node and run together, exactly as before.
      const run = $milestoneDisplayRun(children, index);
      // Require a BYTE-BEARING run for the re-tokenizable path: a bare MilestoneNode (the collab
      // materializer `$createMilestone` builds these with no display-run siblings) would
      // contribute ZERO bytes here, so the rebuild would splice it away entirely — a silent
      // deletion. With no displayable bytes it degrades to an atomic sentinel and survives
      // (the spec's "state not recoverable from displayed bytes → atomic" self-protection).
      if ($isReTokenizableMilestone(node.getMarker(), getMarkerFn) && milestoneRunRendersBytes(run))
        $appendNodesFragment(run, out, getMarkerFn, viewOptions);
      else pushSentinel(out, [node, ...run]);
      index += run.length;
    } else if ($isNoteNode(node) || $isUnknownNode(node)) {
      consumeCharLead();
      pushSentinel(out, [node]);
    } else if ($isVerseNode(node)) {
      consumeCharLead();
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
        $appendNodesFragment(run, out, getMarkerFn, viewOptions);
      }
      index += run.length;
    } else if ($isCharNode(node)) {
      consumeCharLead();
      // Unknown-marker spans (custom.sty) are not text-recoverable: the tokenizer would degrade
      // them to literal text (preserve-or-refuse). Likewise a span whose attributes have no
      // closing glyph to anchor a display run (`$hasUnrecoverableAttributes`) carries bytes with
      // no visible representation to re-derive from. Otherwise a KNOWN marker's attribute display
      // run (if any) is ordinary text among its children — it re-tokenizes and re-derives via
      // `extractAttributes` like the rest of the span's content. `$charNeedsSentinel` is the
      // shared authority, so this branch and `$isRebuildSentinel` cannot drift apart.
      if ($charNeedsSentinel(node, getMarkerFn)) pushSentinel(out, [node]);
      else $appendChildrenFragment(node, out, getMarkerFn, viewOptions, { pending: true });
    } else if ($isLineBreakNode(node)) {
      consumeCharLead();
      pushText(out, node, " ");
    } else if ($isTextNode(node)) {
      // Glyph-adjacent structural text (the para-prefix separator, attribute runs — whose own
      // leading NBSP is the file's real separator byte before `|…`) keeps the blanket
      // NBSP-to-space flattening in every view; everything else is a content run, where the
      // flattening is view-dependent (see `contentFragmentText`).
      const isStructuralRun =
        $isMarkerTrailingSeparator(node) || $getState(node, textTypeState) === "attribute";
      const structuralLead = consumeCharLead() && !isStructuralRun;
      pushText(
        out,
        node,
        isStructuralRun
          ? toFragmentText($textNodeFragmentText(node))
          : contentFragmentText($textNodeFragmentText(node), viewOptions, structuralLead),
      );
    } else if ($isElementNode(node)) {
      // TypedMarkNode and other transparent wrappers: annotation marks are
      // host-reapplied overlays; their text content is rebuilt as plain content — in the SAME
      // content positions the wrapper occupies, so a char span's pending structural lead passes
      // through to the wrapper's children instead of being consumed by the wrapper itself.
      $appendChildrenFragment(node, out, getMarkerFn, viewOptions, charLead);
    } else {
      consumeCharLead();
      pushSentinel(out, [node]);
    }
  }
}

/**
 * Exported for two callers outside this module's own rebuild path. The read-only settle
 * (virtualSettle.utils.ts) builds the SAME fragment a mutating rebuild would, which is what makes
 * the settled USJ a consumer reads and the structure a later real settle produces one computation
 * rather than two implementations. A test also compares a loose-shape paragraph's fragment `.text`
 * against its hand-built wrapped-shape equivalent for byte-for-byte equality
 * (`tier2Rebuild.utils.test.tsx`) — the direct evidence that wrapping a run changes nothing about
 * what gets tokenized.
 */
export function $buildParaFragment(
  para: ParaNode,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
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
  $appendChildrenFragment(para, out, getMarkerFn, viewOptions);
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
 * a char span that crosses it, per USFM ≤3.0 — see the crossing-span fixed-point test in
 * tier2Rebuild.utils.test.tsx). Backs sid carry-over in `$rebuildParas`: the OLD side is read into plain data before the
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

/** U+FFFC occurrences across tokenized content — must equal the preserved-run count. Exported for
 * the read-only settle (virtualSettle.utils.ts), which runs the same symmetry bail-out before it
 * splices anything into its output. */
export function countSentinels(content: MarkerContent[]): number {
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

function $spansForNodes(
  nodes: LexicalNode[],
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
): { text: string; spans: FragmentSpan[] } {
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const node of nodes) {
    if (out.text.length > 0) out.text += " ";
    if ($isElementNode(node)) $appendChildrenFragment(node, out, getMarkerFn, viewOptions);
  }
  return { text: out.text, spans: out.spans };
}

/** Whitespace for caret byte-anchoring: everything the fragment/display layer may add, move, or
 * flatten across a rebuild (the NBSP separators arrive here already flattened to spaces by
 * `toFragmentText`). The U+FFFC sentinel placeholder is deliberately NOT whitespace — it stands
 * for a preserved node and anchors like a document byte. */
const FRAGMENT_WS = /\s/;

/**
 * The caret as a BYTE anchor over the span text: how many non-whitespace characters precede it
 * (`nonWsBefore`), plus how many consecutive whitespace characters sit between the last of those
 * and the caret (`wsRun`, usually 0). Anchoring on non-whitespace characters — rather than a raw
 * cumulative character offset — keeps the caret attached to its BYTE across a rebuild that adds,
 * removes, or moves display whitespace around it: the engine's NBSP separators are inserted by
 * the canonical rebuild (a typed `|` that re-tokenizes from a glyph into span content gains a
 * separator BEFORE it, which shifted a cumulative offset to the wrong side of the byte), and the
 * inter-paragraph " " joiners come and go with paragraph splits. Span text is otherwise preserved
 * by the tokenizer (the degradation property), so the N-th non-whitespace character over the old
 * spans is the same byte over the new ones. A sentinel span counts as its single placeholder char.
 */
interface CaretByteAnchor {
  nonWsBefore: number;
  wsRun: number;
  /**
   * The same caret in DOCUMENT coordinates — attribute display runs stepped over rather than
   * counted (see {@link $isAttributeRunSpan}). Undefined when the caret sits inside a display-run
   * piece, where only full-byte coordinates can express the position at all.
   *
   * Used by the restore ONLY when the rebuild left the attribute-run population unchanged; see
   * {@link CaretByteAnchor.attributeRunSpans}.
   */
  documentCoords?: { nonWsBefore: number; wsRun: number };
  /**
   * How many attribute-run spans the fragment this anchor was captured from held. The restore
   * compares it against the REBUILT fragment's count, because the capture and the restore walk
   * two different trees: stepping over attribute runs is only symmetric while the same runs exist
   * on both sides. A rebuild that CREATES a run (bytes migrating out of typed literal text — a
   * `\va 3\va*` typed as plain text becoming a real verse attribute run) or destroys one makes the
   * two walks disagree, so the restore falls back to full-byte coordinates there.
   */
  attributeRunSpans: number;
}

/** How many spans in `spans` are attribute display runs.
 *
 * Read-only: resolves node keys, so call inside `editor.update()` or an editor-state read — the
 * Tier-2 rebuild's caret capture and restore, which are both already in one. */
function $countAttributeRunSpans(spans: FragmentSpan[]): number {
  return spans.filter($isAttributeRunSpan).length;
}

/**
 * Whether a span is an engine-owned ATTRIBUTE display run (`|who="stuff"`, `|sid="q1"`) rather
 * than ordinary document content.
 *
 * These bytes are the one part of the fragment the settle re-SPELLS without the user touching
 * them: a lone default attribute renders bare (`|stuff`) while any other set renders explicit
 * (`|who="stuff" sid="q1"`), so re-tokenizing an attribute run legitimately changes its LENGTH.
 * A caret anchored by a raw byte count over the whole fragment therefore drifts by that length
 * difference whenever it sits AFTER a run that re-spelled — which is the caret-jump this
 * predicate exists to prevent (Invariant II: display bytes are excluded from document positions).
 *
 * Read-only: resolves the span's node key, so call inside `editor.update()` or an editor-state read.
 */
function $isAttributeRunSpan(span: FragmentSpan): boolean {
  if (span.isSentinel) return false;
  const node = $getNodeByKey(span.key);
  return (
    $isTextNode(node) && !$isMarkerNode(node) && $getState(node, textTypeState) === "attribute"
  );
}

/**
 * Whether the caret's own span is part of an engine-owned display run — a marker GLYPH or an
 * attribute run's text. Such a caret is mid-edit INSIDE the construct being settled, and its byte
 * legitimately migrates as the settle re-tokenizes (a `|x="y"` typed into a milestone's opening
 * glyph moves out of the glyph and into a freshly built attribute run). Those carets must keep
 * counting every byte, or the restore cannot follow the byte into its new home.
 *
 * A caret anywhere else is ordinary document content that the settle is not editing, so it gets
 * the attribute-run-skipping coordinate system instead.
 *
 * Read-only: resolves the span's node key, so call inside `editor.update()` or an editor-state read.
 */
function $isDisplayRunPieceSpan(span: FragmentSpan): boolean {
  if (span.isSentinel) return false;
  const node = $getNodeByKey(span.key);
  return $isMarkerNode(node) || $isAttributeRunSpan(span);
}

/** One walk over `fragment` up to the caret, either counting attribute-run bytes or stepping over
 * them. Returns undefined when the anchor span is not in the fragment. */
function $walkToCaret(
  fragment: { text: string; spans: FragmentSpan[] },
  anchorKey: string,
  anchorOffset: number,
  skipAttributeRuns: boolean,
): { nonWsBefore: number; wsRun: number } | undefined {
  let nonWsBefore = 0;
  let wsRun = 0;
  for (const span of fragment.spans) {
    const spanLength = span.end - span.start;
    const isAnchorSpan = span.key === anchorKey;
    if (!isAnchorSpan && skipAttributeRuns && $isAttributeRunSpan(span)) continue;
    const limit = isAnchorSpan
      ? Math.min(span.isSentinel ? 1 : anchorOffset, spanLength)
      : spanLength;
    for (let i = 0; i < limit; i++) {
      if (FRAGMENT_WS.test(fragment.text[span.start + i])) wsRun++;
      else {
        nonWsBefore++;
        wsRun = 0;
      }
    }
    if (isAnchorSpan) return { nonWsBefore, wsRun };
  }
  return undefined;
}

function $caretSpanByteAnchor(
  fragment: { text: string; spans: FragmentSpan[] },
  anchorKey: string,
  anchorOffset: number,
): CaretByteAnchor | undefined {
  const full = $walkToCaret(fragment, anchorKey, anchorOffset, false);
  if (!full) return undefined;
  // A caret inside a display-run piece has to be anchored in every byte — that is the mid-edit
  // case the byte anchor was built for (a typed `|x="y"` keeps the caret on the byte the user just
  // typed, even as that byte migrates from the glyph into a new attribute run). Only a caret in
  // ordinary document content gets a document-coordinate twin.
  const anchorSpan = fragment.spans.find((span) => span.key === anchorKey);
  const documentCoords =
    anchorSpan && !$isDisplayRunPieceSpan(anchorSpan)
      ? $walkToCaret(fragment, anchorKey, anchorOffset, true)
      : undefined;
  return { ...full, documentCoords, attributeRunSpans: $countAttributeRunSpans(fragment.spans) };
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

/**
 * Place the caret AFTER a preserved node run the caret cannot enter — the append position past the
 * whole opaque construct — for an offset that ran off the end of a fragment whose last span is a
 * sentinel. The sibling of {@link $selectAfterClosingSpan}, for the other span kind the forward
 * scan skips: without it the caller's reverse-find walks BACKWARD past the construct and parks the
 * caret at the end of the preceding text, so a figure completed at the end of a paragraph leaves
 * everything typed next on the WRONG SIDE of it (`hello \fig …\fig*` + ` world` became
 * `hello  world\fig …\fig*`, doubled space included).
 *
 * A sentinel span records only the run's FIRST node, and a verse or milestone rides in its
 * sentinel together with its display run (`$appendNodesFragment`), so the append position is past
 * that run's LAST node — `selectNext` off the first would land inside the run. Every other
 * sentinel kind (unknown blocks, notes, unrecoverable char spans) is a one-node run and skips the
 * lookup. Returns whether it placed the caret.
 */
function $selectAfterSentinelRun(span: FragmentSpan): boolean {
  const first = $getNodeByKey(span.key);
  const siblings = first?.getParent()?.getChildren();
  if (!first || !siblings) return false;
  const index = siblings.findIndex((sibling) => sibling.is(first));
  if (index < 0) return false;
  const run = $isVerseNode(first)
    ? $verseAttributeRun(siblings, index)
    : $isMilestoneNode(first)
      ? $milestoneDisplayRun(siblings, index)
      : [];
  (run[run.length - 1] ?? first).selectNext(0, 0);
  return true;
}

/** Place the collapsed caret at the position `anchor` describes (see `$caretSpanByteAnchor`)
 * within the freshly-built spans, falling back to the first element. */
function $selectAtFragmentByteAnchor(
  fragment: { text: string; spans: FragmentSpan[] },
  anchor: CaretByteAnchor,
  newNodes: LexicalNode[],
): void {
  const { text, spans } = fragment;
  // Pick the coordinate system. Document coordinates (attribute runs stepped over) keep a caret in
  // ordinary content from being dragged when a run RE-SPELLS beside it — `|who="stuff"` settling to
  // its equivalent `|stuff` must not move the caret in the text after it. They are only valid when
  // the rebuild left the attribute-run population unchanged, because capture and restore walk two
  // different trees: a rebuild that CREATES or destroys a run makes the two walks disagree, so
  // those fall back to full-byte coordinates — which is also exactly what the byte-migration cases
  // need (typed literal bytes becoming a real run, with the caret following its byte into it).
  const documentCoords =
    $countAttributeRunSpans(spans) === anchor.attributeRunSpans ? anchor.documentCoords : undefined;
  const skipAttributeRuns = documentCoords !== undefined;
  let best: { key: string; offset: number } | undefined;
  let remainingNonWs = (documentCoords ?? anchor).nonWsBefore;
  let remainingWs = (documentCoords ?? anchor).wsRun;
  // Whether the anchor position resolved INSIDE a span the caret cannot rest in — a sentinel
  // (inner text not addressable) or a closing marker glyph (see $isClosingMarkerSpan) — in which
  // case the caret belongs at the start of the NEXT addressable span, exactly as the previous
  // cumulative-offset walk resolved it.
  let needNextAddressable = false;
  outer: for (const span of spans) {
    const spanLength = span.end - span.start;
    const addressable = !span.isSentinel && !$isClosingMarkerSpan(span);
    // Mirror the capture's coordinate system exactly: when the anchor was taken in document
    // bytes, the restore must step over attribute runs too, or the two walks disagree and the
    // caret lands off by the run's re-spelled length.
    if (skipAttributeRuns && $isAttributeRunSpan(span)) continue;
    if (needNextAddressable) {
      if (!addressable) continue;
      best = { key: span.key, offset: 0 };
      break;
    }
    for (let i = 0; i < spanLength; i++) {
      const ch = text[span.start + i];
      if (remainingNonWs === 0 && (remainingWs === 0 || !FRAGMENT_WS.test(ch))) {
        // The anchor's bytes are all behind us (any unconsumed ws run is clamped to the ws
        // actually present here): the caret belongs immediately BEFORE this character.
        if (addressable) {
          best = { key: span.key, offset: i };
          break outer;
        }
        needNextAddressable = true;
        continue outer;
      }
      if (remainingNonWs > 0) {
        if (!FRAGMENT_WS.test(ch)) remainingNonWs--;
      } else remainingWs--;
    }
    if (remainingNonWs === 0 && remainingWs === 0) {
      // Satisfied exactly at this span's end — prefer the end of the span the walk finished in
      // over the start of the next, matching the previous walk's first-covering-span behavior.
      if (addressable) {
        best = { key: span.key, offset: spanLength };
        break;
      }
      needNextAddressable = true;
    }
  }
  if (!best) {
    // The offset ran past every addressable span. Both span kinds the forward scan skips can be
    // the last thing in the fragment, and for both the caret belongs AFTER them — an append
    // position in the paragraph — rather than at the end of the preceding text, which is where the
    // reverse-find fallback below would park it: a completed closer glyph (a typed `\nd*` at
    // paragraph end, nothing after), so continued typing is unstyled; or a sentinel, so continued
    // typing lands past the opaque construct instead of in front of it.
    const lastSpan = spans[spans.length - 1];
    if (lastSpan && $isClosingMarkerSpan(lastSpan) && $selectAfterClosingSpan(lastSpan)) return;
    if (lastSpan?.isSentinel && $selectAfterSentinelRun(lastSpan)) return;
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
  anchor: CaretByteAnchor | undefined,
  anchorInParas: boolean,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
): void {
  // The caret was somewhere else entirely (the primary completion flow: the user
  // typed a mid-edit marker, then clicked/arrowed into another paragraph, which is
  // what triggered this rebuild). The rebuilt paragraphs are not where the caret
  // lives, so leave the selection strictly untouched rather than yanking it back in.
  if (!anchorInParas) return;
  if (anchor === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  $selectAtFragmentByteAnchor($spansForNodes(newNodes, getMarkerFn, viewOptions), anchor, newNodes);
}

/**
 * Restore the caret inside rebuilt NOTE content. Unlike `$restoreSelectionAtOffset`, the
 * content nodes form one contiguous region, so spans are computed with `$appendNodesFragment`
 * (no inter-node separators) to match the offset captured over `$buildNoteFragment`'s text.
 */
function $restoreSelectionInNoteContent(
  newNodes: LexicalNode[],
  anchor: CaretByteAnchor | undefined,
  anchorInNote: boolean,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
): void {
  if (!anchorInNote) return;
  if (anchor === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(newNodes, out, getMarkerFn, viewOptions);
  $selectAtFragmentByteAnchor({ text: out.text, spans: out.spans }, anchor, newNodes);
}

/**
 * The mutating Tier-2 settle for a paragraph scope: serializes the displayed bytes of `paras`
 * (one settle scope — usually a single paragraph) into fragment text, re-tokenizes that text
 * through the USFM fragment tokenizer, and splices the resulting nodes in place — the settle IS
 * re-tokenization, never a hand-patched tree. Restores the caret afterwards by byte anchor, so a
 * settle under a live caret leaves it at the same displayed byte.
 *
 * Returns `true` when the document changed. `false` is a REFUSAL and a true no-op: serialized
 * signatures are compared BEFORE any mutation, so a scope already at its tokenized fixed point
 * changes nothing — which is also the acceptance for settled output (re-load it and every scope
 * must refuse; see settledGetUsj.test-helpers.tsx's `expectTier2FixedPoint`).
 *
 * Invariant: the read-only settle mirror (`$settledUsj`, virtualSettle.utils.ts) recomputes this
 * function's outcome over serialized JSON without mutating the editor, and the two must agree on
 * the resulting USJ byte-for-byte (pinned by settledGetUsj.test.tsx and
 * settleDifferential.test.tsx).
 *
 * Mutating: call inside `editor.update()` (dispatched from the Tier-2 trigger transform, the
 * caret-departure and commit paths in MarkerEditPlugin.tsx, and `$requestTier2ForNode`).
 */
export function $rebuildParas(paras: ParaNode[], context: Tier2Context): boolean {
  if (paras.length === 0) return false;
  const { viewOptions, getMarker: getMarkerFn, logger } = context;

  const combined: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const para of paras) {
    const fragment = $buildParaFragment(para, getMarkerFn, viewOptions);
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

  // Capture the caret as a fragment byte anchor before mutating anything, and note whether
  // the anchor was actually inside the paragraphs being rebuilt (vs. parked elsewhere).
  let caretAnchor: CaretByteAnchor | undefined;
  let anchorInParas = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (paras.some((para) => para.is(node))) {
        anchorInParas = true;
        break;
      }
    if (selection.isCollapsed())
      caretAnchor = $caretSpanByteAnchor(combined, selection.anchor.key, selection.anchor.offset);
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

  // Fixed-point refusal (preserve-or-refuse). If the freshly-tokenized output is
  // structurally identical to the paragraphs it was derived from, this rebuild is a
  // no-op: splicing it in would reproduce the same unresolved literal text (a bare
  // `\` or an unterminated milestone run — the tokenizer's remaining
  // literal-degradation cases; a stray `\*`, most unknown markers, and non-attribute
  // content before a milestone's `\*` now resolve structurally instead, see
  // usfmFragmentToUsjContent's doc comment), re-arm the TextNode catch-all
  // transform, and — via the caret-departure/Enter completion path — drive an endless
  // resolve→rebuild→resolve cascade that hangs the main thread. Compare BEFORE any
  // mutation and bail. The signature normalizes preserved nodes and their U+FFFC
  // placeholders to the same token, so this is a structure+text comparison, not node
  // identity; a rebuild that actually restructures anything (literal `\nd x\nd*` → a
  // CharNode span, or an unknown opener splitting off its own paragraph) has a
  // different signature and is never mistaken for a no-op.
  //
  // Compared on the SERIALIZED rebuild (`serializedSignatureOf`, the same JSON-side computation
  // the read-only settle makes) rather than on parsed nodes, so a refusal materializes NO live
  // nodes at all. Parse orphans count as dirty leaves: they turned a refused (no-op) settle into
  // a real commit — reconciliation, a DOM selection round trip, and a follow-on
  // caret-normalization commit that could displace the caret out from under an active gesture
  // (observed: a caret parked in span content yanked to the paragraph's marker glyph, so the
  // next keystrokes landed outside the span). A refused re-settle must be a TRUE no-op.
  if (
    serializedSignatureOf(serialized.root.children, getMarkerFn) ===
    $signatureOf(paras, getMarkerFn)
  ) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  const newNodes = serialized.root.children.map((child) => $parseSerializedNode(child));

  // Second sentinel check, now on the SERIALIZED->PARSED tree: the tokenizer-level count above
  // guards the MarkerContent, but the serialize/parse round trip is a separate place a U+FFFC
  // placeholder can vanish. If the parsed tree has fewer (or more) than the preserved-run count,
  // $replaceSentinels would silently drop or mis-pair a preserved node. Abort untouched instead.
  if (countSentinelNodes(newNodes) !== combined.sentinels.length) {
    logger?.warn("[MarkerEdit] Tier 2 aborted: serialized sentinel/preserved-node count mismatch");
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
  $restoreSelectionAtOffset(newNodes, caretAnchor, anchorInParas, getMarkerFn, viewOptions);
  return true;
}

/**
 * Build the re-tokenizable fragment for a note's CONTENT children — everything strictly
 * between the note's opening MarkerNode(s) + caller prefix and its trailing closing
 * MarkerNode(s). Preserve-or-refuse (returns undefined) when the note is collapsed, has
 * unknown attributes, an unrecoverable marker, or an unexpected caller/prefix shape: a
 * note the engine cannot cleanly re-derive is never rebuilt.
 *
 * Exported for the read-only settle (virtualSettle.utils.ts): note content is its own settle scope,
 * and the settled output a consumer reads must be built from the SAME fragment the mutating rebuild
 * below would build. Every other caller in this module still reaches it through
 * `$rebuildNoteContent`.
 */
export function $buildNoteFragment(
  note: NoteNode,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
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
  $appendNodesFragment(contentNodes, out, getMarkerFn, viewOptions);
  return { out, contentNodes };
}

/**
 * A foldable leading `\cat` span's category value, REMOVED from `content` — or `undefined` with
 * `content` untouched. Foldable mirrors ParatextData's note-category parse: explicitly closed
 * (no `closed` metadata and no other attributes riding the span), exactly one plain-text content
 * item, non-whitespace after the trim ParatextData applies, and no preserved-node placeholder
 * inside. Position zero of the note-content fragment IS "directly after the caller" — the only
 * place the fold ever happens.
 */
export function extractLeadingCategoryFold(content: MarkerContent[]): string | undefined {
  const first = content[0];
  if (typeof first !== "object" || first.type !== "char" || first.marker !== "cat")
    return undefined;
  const keys = Object.keys(first);
  if (!keys.every((key) => key === "type" || key === "marker" || key === "content"))
    return undefined;
  if (!first.content || first.content.length !== 1) return undefined;
  const text = first.content[0];
  if (typeof text !== "string" || text.includes(ATOMIC_SENTINEL)) return undefined;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  content.shift();
  return trimmed;
}

/**
 * Note-scoped Tier 2 re-tokenization. Mirrors `$rebuildParas` but
 * operates on a single note's CONTENT children. The note node identity, its opening
 * marker(s), its caller, and its closing marker(s) are PRESERVED; only the content is
 * re-tokenized — with the note's `category` DERIVED from it each pass (the leading `\cat`
 * fold), so the displayed run bytes win exactly like every other settled byte. Preserve-or-
 * refuse: any guard-rail failure returns false with the note
 * untouched (never a partial mutation, never an infinite loop). A NoteNode inside a
 * PARAGRAPH rebuild stays an atomic sentinel; only this path descends into its content.
 *
 * Deliberately a parallel algorithm rather than a shared core with `$rebuildParas`: the two
 * differ in exactly the load-bearing parts — the rebuild scope (note content vs whole
 * paragraphs), what is preserved (the note shell vs nothing), the tokenizer options (note
 * context, expanded notes), and the splice shape (unwrap the tokenizer's default `\p` wrapper vs
 * replace paragraphs). Parameterizing those out would obscure both.
 */
export function $rebuildNoteContent(note: NoteNode, context: Tier2Context): boolean {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn, viewOptions);
  if (!built) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: note excluded by guard rails");
    return false;
  }
  const { out, contentNodes } = built;

  // Capture the caret as a fragment byte anchor before mutating, noting whether the anchor
  // was actually inside this note (vs. parked elsewhere) — mirror `$rebuildParas`.
  let caretAnchor: CaretByteAnchor | undefined;
  let anchorInNote = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (note.is(node)) {
        anchorInNote = true;
        break;
      }
    if (selection.isCollapsed())
      caretAnchor = $caretSpanByteAnchor(out, selection.anchor.key, selection.anchor.offset);
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

  // The tokenizer wraps a note-content fragment in its default `\p` — unwrap it here (the
  // USJ-side twin of the serialized-side unwrap this function used to do), refusing any other
  // top-level shape.
  const [tokenizedWrapper] = content;
  if (
    content.length !== 1 ||
    typeof tokenizedWrapper !== "object" ||
    tokenizedWrapper.type !== "para"
  ) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: unexpected tokenized shape");
    return false;
  }
  const noteContent = tokenizedWrapper.content ?? [];

  // The category fold, mirrored from ParatextData's parse: a `\cat` span DIRECTLY after the
  // note's caller — which is position zero of this content fragment, since the fragment starts
  // right after the caller — folds onto the note as its `category` iff it is explicitly closed
  // with non-empty plain-text content. Anything else (markup inside, an empty span, an unclosed
  // span, a preserved-node placeholder, text before it) is NOT foldable and stays first-class
  // content, exactly as ParatextData keeps it. The note's category is then whatever folded — or
  // cleared when nothing did, so deleting the displayed run genuinely deletes the category
  // instead of the sync resurrecting it from stale state.
  const foldedCategory = extractLeadingCategoryFold(noteContent);

  // The fresh content children come from serializing the WHOLE note expanded and unwrapping its
  // shell; `$serializeExpandedNoteContent` (settleShared.utils.ts) states why, and is shared with
  // the read-only settle so the two can never unwrap the same shell differently. Parse the
  // returned children into live nodes here — that materialization is the one half a read-only
  // settle cannot share.
  const unwrapped = $serializeExpandedNoteContent(note, noteContent, foldedCategory, viewOptions);
  if (unwrapped.failure !== undefined) {
    if (unwrapped.failure === "empty")
      logger?.debug("[MarkerEdit] Note Tier 2 skipped: no content nodes after unwrap");
    else
      logger?.warn(
        unwrapped.failure === "caller"
          ? "[MarkerEdit] Note Tier 2 aborted: serialized note lacks the editable caller"
          : "[MarkerEdit] Note Tier 2 aborted: unexpected serialized shape",
      );
    return false;
  }
  // Second sentinel check, now on the SERIALIZED tree (the mirror of `$rebuildParas`' recount and
  // of the read-only settle's own): the tokenizer-level count above guards the MarkerContent, but
  // serialization is a separate place a U+FFFC placeholder can vanish. If the unwrapped content
  // has fewer (or more) than the preserved-run count, `$replaceSentinels` would silently drop or
  // mis-pair a preserved node. Abort untouched — before the category write below, which is also
  // derived from this rebuild's output — instead.
  if (countSerializedSentinels(unwrapped.children) !== out.sentinels.length) {
    logger?.warn(
      "[MarkerEdit] Note Tier 2 aborted: serialized sentinel/preserved-node count mismatch",
    );
    return false;
  }

  // The category write happens whether or not the content splice below is refused: an EDITED
  // `\cat` value serializes to the same canonical bytes the live tree already displays (the
  // user's edit IS those bytes), so the structural comparison legitimately reports a fixed point
  // — but the note's `category` state still lags the displayed value and must catch up here.
  // Idempotent (`setCategory` no-ops on equality), so an unchanged category adds nothing.
  const categoryChanged = note.getCategory() !== foldedCategory;
  if (categoryChanged) note.setCategory(foldedCategory);

  // Fixed-point refusal (preserve-or-refuse) on the CONTENT nodes only: if the freshly
  // tokenized content is structurally identical to what it was derived from, splicing it
  // would re-arm the trigger and loop. Compare BEFORE any mutation and bail — reporting the
  // category catch-up (a real mutation) when one happened. Compared on the SERIALIZED rebuild
  // (`serializedSignatureOf`), before any nodes are parsed, so a refusal materializes no live
  // nodes — see `$rebuildParas`' fixed-point comment for why orphan-free refusal is load-bearing.
  if (
    serializedSignatureOf(unwrapped.children, getMarkerFn) ===
    $signatureOf(contentNodes, getMarkerFn)
  ) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: rebuild is a no-op (fixed point)");
    return categoryChanged;
  }

  const newNodes = unwrapped.children.map((child) => $parseSerializedNode(child));

  // Parse-leg recount: the serialized-level count above cleared serialization, but the parse into
  // live nodes is one more place a placeholder could in principle vanish. Abort the splice; the
  // category catch-up above already happened and is reported truthfully.
  if (countSentinelNodes(newNodes) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: parsed sentinel/preserved-node count mismatch");
    return categoryChanged;
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
  $restoreSelectionInNoteContent(newNodes, caretAnchor, anchorInNote, getMarkerFn, viewOptions);
  return true;
}

/** The markers whose FIRST-CLASS char form, sitting at document root directly after a chapter,
 * ParatextData folds back onto the chapter on parse — the chapter's attribute markers. A root
 * `\ca`/`\cp` char is the transient pre-fold shape (an unclosed/empty/markup-bearing span the
 * fold refused, or a mid-edit literal), so its edits settle through the CHAPTER scope. */
const CHAPTER_ATTRIBUTE_CHAR_MARKERS: ReadonlySet<string> = new Set(["ca", "cp"]);

/** The one chapter attribute marker whose first-class form is a PARAGRAPH, not a char span: `cp`
 * has no closing marker, so its span ends at the next block boundary and the tokenizer emits a
 * real `\cp` para for it (`ATTRIBUTE_MARKERS`, shape `"para"`). It takes that form when the fold
 * refuses — markup in the value, or an emptied one. */
const CHAPTER_ATTRIBUTE_PARA_MARKER = "cp";

/**
 * Whether `node` is an IMPLIED paragraph whose content re-tokenizes to ONLY chapter-attribute
 * (`\ca`/`\cp`) material — the settle-artifact shape a typed literal takes right after a
 * chapter: `$rebuildChapter`'s tokenized output strands non-chapter residue as a root-level
 * STRING, which the adaptor wraps in an `ImpliedParaNode`. That wrapper carries NO paragraph
 * marker byte (the file has no `\p` there), so its bytes and the chapter's legitimately
 * re-tokenize TOGETHER — which is exactly what the fold needs. It joins the chapter settle
 * region on the same terms as a first-class `\ca`/`\cp` char.
 *
 * The membership test is the tokenizer itself — never a byte regex — so the region's meaning
 * cannot drift from the fold authority: tokenize the implied paragraph's own fragment bytes,
 * unwrap the tokenizer's fabricated default `\p` (body-context fragments wrap leading inline
 * material in one; bytes that literally START with `\p` are NOT unwrapped — a typed `\p` is
 * real paragraph material, not an artifact wrapper), and require every item to be a `\ca`/`\cp`
 * char or para, or insignificant whitespace. Anything else — plain words, other markers, a
 * preserved-node sentinel — keeps the implied paragraph OUTSIDE the region: real content never
 * settles through the chapter, so a `\nd` literal cannot be restructured into a fabricated
 * root char, and an implied paragraph of ordinary text keeps its (deliberate) no-scope rest.
 *
 * Classified with the BUNDLED marker table on both the fragment walk and the tokenize: region
 * membership must be identical for every caller — the mutating settle, the read-only settle,
 * and the scope resolver, some of which have no `MarkerLookup` in reach ($settleScopeForNode) —
 * and `ca`/`cp` folding is ParatextData parse behavior, not a stylesheet-configurable property
 * (the same reason CHAPTER_ATTRIBUTE_CHAR_MARKERS is a literal set).
 *
 * Cost: the tokenize runs only for an `ImpliedParaNode` sitting in a chapter-adjacency probe —
 * a rare, transient shape whose content is a keystroke-sized literal. Every other node fails
 * the instanceof check first.
 *
 * Read-only: safe inside `editor.getEditorState().read(...)` or an update.
 */
function $isChapterAttributeImpliedPara(node: LexicalNode): node is ImpliedParaNode {
  if (!$isImpliedParaNode(node)) return false;
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  // View-independent classification probe: NBSP mapping cannot change whether the text
  // tokenizes as a chapter-attribute literal, so no view options are threaded here.
  $appendChildrenFragment(node, out, bundledGetMarker, undefined);
  if (out.sentinels.length > 0) return false;
  const text = out.text;
  if (text.trim() === "") return false;
  const content = usfmFragmentToUsjContent(text, { getMarker: bundledGetMarker });
  const [first] = content;
  const items =
    content.length === 1 &&
    typeof first === "object" &&
    first.type === "para" &&
    first.marker === "p" &&
    !/^\s*\\p\s/.test(text)
      ? (first.content ?? [])
      : content;
  if (items.length === 0) return false;
  return items.every((item) =>
    typeof item === "string"
      ? item.trim() === ""
      : (item.type === "char" || item.type === "para") &&
        (item.marker === "ca" || item.marker === CHAPTER_ATTRIBUTE_PARA_MARKER),
  );
}

/**
 * The chapter settle REGION beyond `chapter`'s own children: the contiguous run of first-class
 * `\ca`/`\cp` char spans sitting at document root directly after it, plus — closing the run — a
 * real `\cp` PARAGRAPH. Their bytes re-tokenize together with the chapter's (`\c 1 \ca 3\ca*`
 * folds; the capture-pinned post-`\ca` whitespace skip applies), so a foldable span or paragraph
 * folds onto the chapter on settle instead of waiting for a reload, while an unfoldable one
 * (empty, unclosed, markup-bearing) re-tokenizes to the identical first-class shape — a fixed
 * point, refused without churn. The tokenizer stays the single fold authority either way.
 *
 * A `\cp` paragraph CLOSES the region because that is what it does in the file: with no closing
 * marker its span runs to the next block boundary, so nothing past it is still the chapter's.
 *
 * An IMPLIED paragraph holding only `\ca`/`\cp` material ({@link $isChapterAttributeImpliedPara}
 * — the typed-literal settle artifact) is a continuing member like the chars: its bytes carry no
 * paragraph marker, so nothing about it bounds the chapter's span in the file.
 *
 * Exported for the read-only settle (virtualSettle.utils.ts), which must splice the SAME region
 * out of its serialized output that `$rebuildChapter` replaces in the live tree.
 *
 * Read-only: safe inside `editor.getEditorState().read(...)` or an update.
 */
export function $chapterAdjacentAttributeNodes(chapter: ChapterNode): LexicalNode[] {
  const region: LexicalNode[] = [];
  for (let sibling = chapter.getNextSibling(); sibling; sibling = sibling.getNextSibling()) {
    if (
      ($isCharNode(sibling) && CHAPTER_ATTRIBUTE_CHAR_MARKERS.has(sibling.getMarker())) ||
      $isChapterAttributeImpliedPara(sibling)
    ) {
      region.push(sibling);
      continue;
    }
    if ($isParaNode(sibling) && sibling.getMarker() === CHAPTER_ATTRIBUTE_PARA_MARKER)
      region.push(sibling);
    break;
  }
  return region;
}

/**
 * The chapter that `rootChild` — a node sitting directly under the document root — is an
 * attribute marker of, reached through only other chapter attribute chars (or attribute-material
 * implied paragraphs); `undefined` when it is not one, or when anything but a chapter precedes
 * it. The inverse of {@link $chapterAdjacentAttributeNodes}: a root child is in a chapter's
 * region exactly when that chapter is the one this returns.
 *
 * Read-only: safe inside `editor.getEditorState().read(...)` or an update.
 */
function $chapterOfAdjacentAttributeNode(rootChild: LexicalNode): ChapterNode | undefined {
  const isContinuingMember = (node: LexicalNode): boolean =>
    ($isCharNode(node) && CHAPTER_ATTRIBUTE_CHAR_MARKERS.has(node.getMarker())) ||
    $isChapterAttributeImpliedPara(node);
  const isAttributeNode =
    isContinuingMember(rootChild) ||
    ($isParaNode(rootChild) && rootChild.getMarker() === CHAPTER_ATTRIBUTE_PARA_MARKER);
  if (!isAttributeNode) return undefined;
  for (
    let sibling: LexicalNode | null = rootChild.getPreviousSibling();
    sibling;
    sibling = sibling.getPreviousSibling()
  ) {
    if ($isChapterNode(sibling)) return sibling;
    if (!isContinuingMember(sibling)) return undefined;
  }
  return undefined;
}

/**
 * Build the re-tokenizable fragment for an editable chapter's OWN displayed bytes — its `\c N`
 * glyph text plus (when displayed) its `\ca` run's bytes — plus the bytes of the adjacent
 * first-class `\ca`/`\cp` spans and `\cp` paragraph ({@link $chapterAdjacentAttributeNodes}: the
 * settle region is the chapter AND those nodes, so a foldable one re-tokenizes onto the chapter).
 * Preserve-or-refuse (returns undefined) when the chapter carries unknown attributes (bytes
 * cannot re-derive them), when an adjacent `\cp` paragraph carries them (the same rule
 * `$buildParaFragment` applies to any paragraph), or when anything in the region degrades to a
 * preserved-node sentinel (nothing the adaptor builds in the chapter ever should; an adjacent
 * span or paragraph holding an unrecoverable construct refuses the same way).
 *
 * Exported for the read-only settle (virtualSettle.utils.ts), the same sharing contract
 * `$buildNoteFragment` has.
 */
export function $buildChapterFragment(
  chapter: ChapterNode,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
): FragmentAccumulator | undefined {
  if (Object.keys(chapter.getUnknownAttributes() ?? {}).length > 0) return undefined;
  const adjacent = $chapterAdjacentAttributeNodes(chapter);
  if (adjacent.some((node) => $isParaNode(node) && node.getUnknownAttributes())) return undefined;
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(chapter.getChildren(), out, getMarkerFn, viewOptions);
  $appendNodesFragment(adjacent, out, getMarkerFn, viewOptions);
  if (out.sentinels.length > 0) return undefined;
  return out;
}

/**
 * Chapter-scoped Tier 2 re-tokenization — the third settle scope, beside `$rebuildParas` and
 * `$rebuildNoteContent`. The whole chapter node re-serializes from its re-tokenized bytes:
 * `number`, `altnumber`, and `pubnumber` come from the bytes (the tokenizer's chapter-path
 * attrCapture folds well-formed `\ca`/`\cp` spans back onto the chapter), while `sid` — never
 * derivable from visible bytes — is carried over.
 *
 * Preserve-or-refuse: the re-tokenized output must BE a chapter — an edit that would change the
 * node's KIND (the `\c` bytes rewritten into some other marker, or deleted) refuses and stays a
 * pending literal rather than restructuring the document from a chapter-scoped settle. Deleting
 * a chapter outright is `$chapterNodeTransform`'s existing empty-children path, not this one.
 */
export function $rebuildChapter(chapter: ChapterNode, context: Tier2Context): boolean {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  // The settle REGION: the chapter plus the adjacent first-class `\ca`/`\cp` spans and `\cp`
  // paragraph at root — captured BEFORE the splice below detaches them, and the same region
  // `$buildChapterFragment` reads its bytes from.
  const region: LexicalNode[] = [chapter, ...$chapterAdjacentAttributeNodes(chapter)];
  const out = $buildChapterFragment(chapter, getMarkerFn, viewOptions);
  if (!out) {
    logger?.debug("[MarkerEdit] Chapter Tier 2 skipped: chapter excluded by guard rails");
    return false;
  }

  // Capture the caret as a fragment byte anchor before mutating — mirror `$rebuildParas`. The
  // anchor check spans the whole region: an edit inside an adjacent first-class char (the fold's
  // primary trigger) holds its caret in the CHAR, not the chapter, and must be restored into
  // the rebuilt output the same way.
  let caretAnchor: CaretByteAnchor | undefined;
  let anchorInRegion = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (region.some((member) => member.is(node))) {
        anchorInRegion = true;
        break;
      }
    if (selection.isCollapsed())
      caretAnchor = $caretSpanByteAnchor(out, selection.anchor.key, selection.anchor.offset);
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text, { getMarker: getMarkerFn });
  const [freshChapter] = content;
  if (content.length === 0 || typeof freshChapter !== "object" || freshChapter.type !== "chapter") {
    logger?.debug("[MarkerEdit] Chapter Tier 2 skipped: bytes no longer tokenize as a chapter");
    return false;
  }
  if (countSentinels(content) !== 0) {
    logger?.warn("[MarkerEdit] Chapter Tier 2 aborted: unexpected preserved-node placeholder");
    return false;
  }

  // Sid carry-over BEFORE serialization — never derivable from visible bytes. `altnumber` and
  // `pubnumber` both come from the bytes now that both runs display: absent bytes mean deleted.
  if (chapter.getSid() !== undefined) freshChapter.sid = chapter.getSid();

  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  );

  // Fixed-point refusal (preserve-or-refuse), the same comparison the other two scopes make —
  // but with the STATE catch-up the note scope's category write also needs: an edited (or
  // deleted) run's fresh serialization is byte-identical to what the live tree already displays
  // (the user's edit IS those bytes), so the structural comparison legitimately reports a fixed
  // point while `number`/`altnumber`/`pubnumber` still lag the displayed bytes. Reconcile them
  // here; the splice path below needs none of this (the fresh nodes replace the region, state
  // and all). Compared over the whole REGION: an adjacent unfoldable first-class char that
  // re-tokenizes to its identical self is part of the fixed point, not a difference. Compared on
  // the SERIALIZED rebuild (`serializedSignatureOf`), before any nodes are parsed, so a refusal
  // materializes no live nodes — see `$rebuildParas`' fixed-point comment for why orphan-free
  // refusal is load-bearing.
  if (
    serializedSignatureOf(serialized.root.children, getMarkerFn) ===
    $signatureOf(region, getMarkerFn)
  ) {
    let reconciled = false;
    if (chapter.getNumber() !== (freshChapter.number ?? "")) {
      chapter.setNumber(freshChapter.number ?? "");
      reconciled = true;
    }
    if (chapter.getAltnumber() !== freshChapter.altnumber) {
      chapter.setAltnumber(freshChapter.altnumber);
      reconciled = true;
    }
    if (chapter.getPubnumber() !== freshChapter.pubnumber) {
      chapter.setPubnumber(freshChapter.pubnumber);
      reconciled = true;
    }
    if (!reconciled)
      logger?.debug("[MarkerEdit] Chapter Tier 2 skipped: rebuild is a no-op (fixed point)");
    return reconciled;
  }

  const newNodes = serialized.root.children.map((child) => $parseSerializedNode(child));
  if (!$isChapterNode(newNodes[0])) {
    logger?.warn("[MarkerEdit] Chapter Tier 2 aborted: serialized output is not a chapter");
    return false;
  }

  newNodes.forEach((node) => chapter.insertBefore(node));
  region.forEach((node) => node.remove());
  $restoreSelectionAtOffset(newNodes, caretAnchor, anchorInRegion, getMarkerFn, viewOptions);
  return true;
}

/**
 * The re-tokenization SCOPE a node belongs to: the expanded note whose content contains it, the
 * editable chapter whose display bytes contain it, or
 * the paragraph that contains it — or `undefined` when it has neither (an opaque block interior,
 * where the bytes stay literal, or a detached node). The nearest Note or Para wins — a note inside
 * a paragraph is its own scope: the note node, its marker glyphs, and its caller are preserved
 * across a rebuild while only its content re-tokenizes.
 *
 * The walk runs to the DOCUMENT ROOT, not just to the first Note/Para match: a paragraph can itself
 * be nested inside an opaque block (a sidebar's own paragraphs — see `$buildParaFragment`'s matching
 * ancestor guard), so an `UnknownNode` anywhere between `node` and the root — even above the nearest
 * Note/Para — still means "opaque block interior", overriding whatever scope was found closer in.
 * The override applies just the same when the nearest scope found is a NOTE, not only a paragraph:
 * a well-formed, expanded note can itself live inside a sidebar, and an `UnknownNode` further out
 * still wins over it — matching the pend path's own full-chain literal-only guard
 * (`$inLiteralOnlyBlock`, markerEditTier2Trigger.utils.ts), which never pends a key whose divergence
 * could never settle in the first place.
 *
 * One scope is not an ancestor: a chapter's attribute markers sitting at DOCUMENT ROOT directly
 * adjacent to it (through only other such spans) settle through that CHAPTER's scope, because
 * only a re-tokenize that sees the `\c` and the `\ca`/`\cp` bytes TOGETHER can fold them back
 * onto it ({@link $chapterAdjacentAttributeNodes}, whose region `$rebuildChapter` rebuilds).
 * Without this arm the fold waited for a reload. Two shapes reach it:
 *
 * - a first-class `\ca`/`\cp` CHAR, which has no Note/Para/Chapter ancestor at all;
 * - a real `\cp` PARAGRAPH, which does have one — itself. Its own paragraph scope is what a
 *   `\cp` paragraph must NOT settle through: re-tokenizing `\cp 1` alone can only ever produce a
 *   `\cp` paragraph, so the chapter has to be in the fragment for the fold to be expressible at
 *   all. The chapter therefore OVERRIDES a paragraph scope that is the root child itself, while
 *   any scope found deeper in (a note inside that paragraph) still wins — it is the nearer
 *   scope, and its own rebuild is the right one.
 *
 * The single definition of scope, shared by the mutating settle below and the read-only settle in
 * virtualSettle.utils.ts. Both must route a given pending key to the SAME scope, or the settled USJ
 * a consumer reads and the structure a later real settle produces would be derived from different
 * regions of the document.
 */
export function $settleScopeForNode(
  node: LexicalNode,
): ParaNode | NoteNode | ChapterNode | undefined {
  let scope: ParaNode | NoteNode | ChapterNode | undefined;
  let rootChild: LexicalNode | undefined;
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isUnknownNode(current)) return undefined;
    if (!scope && ($isNoteNode(current) || $isParaNode(current) || $isChapterNode(current)))
      scope = current;
    if ($isRootNode(current.getParent())) rootChild = current;
  }
  // A scope found DEEPER than the root child is the nearer one and wins outright; only the root
  // child itself can be a chapter's attribute marker.
  if (scope && !scope.is(rootChild)) return scope;
  return (rootChild ? $chapterOfAdjacentAttributeNode(rootChild) : undefined) ?? scope;
}

/** Route a Tier-1-unexpressible edit to Tier 2 via its scope ({@link $settleScopeForNode}).
 * Returns whether the routed rebuild actually SPLICED — a guard-rail or fixed-point refusal mutates
 * nothing, and the deferred-resolution history bookkeeping ($resolvePendingMarkers callers) needs to
 * tell the two apart. */
export function $requestTier2ForNode(node: LexicalNode, context: Tier2Context): boolean {
  const scope = $settleScopeForNode(node);
  if (!scope) return false;
  if ($isNoteNode(scope)) return $rebuildNoteContent(scope, context);
  if ($isChapterNode(scope)) return $rebuildChapter(scope, context);
  return $rebuildParas([scope], context);
}

/** USJ marker-object keys that are never attribute-list display bytes. `closed` is a USJ key but
 * is excluded from rendered attribute text (ATTRIBUTE_EXCLUDED_KEYS in the display layer), so
 * folding it would let its letters mask a genuine loss of the same characters. */
const CONTENT_BYTE_BASE_KEYS = new Set(["type", "marker", "content", "closed"]);

function appendAttributeListBytes(item: MarkerObject, out: string[]): void {
  const entries = Object.entries(item).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && !CONTENT_BYTE_BASE_KEYS.has(entry[0]),
  );
  if (entries.length === 0) return;
  out.push("|");
  for (const [key, value] of entries) out.push(`${key}="${value}"`);
}

/**
 * Fold tokenized content back into an approximation of its USFM display bytes, for the
 * byte-preservation comparison in {@link $idleSettleWouldDiscardCaretHeldBytes}. Whitespace is
 * irrelevant to the comparison (the counter ignores it), and ADDED bytes are harmless — only a
 * byte the fold FAILS to re-emit can misreport a loss, which merely defers that settle to caret
 * departure. So the fold favors emitting too much over too little (e.g. a default attribute the
 * canonical display would render bare is folded as `name="value"`), and unknown shapes fall to a
 * marker-plus-content default.
 */
function appendContentBytes(content: MarkerContent[] | undefined, out: string[]): void {
  if (!content) return;
  for (const item of content) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    const marker = item.marker ?? "";
    const closed = (item as { closed?: string }).closed;
    switch (item.type) {
      case "verse":
        out.push(`\\${marker} ${item.number ?? ""}`);
        if (item.altnumber !== undefined) out.push(`\\va ${item.altnumber}\\va*`);
        if (item.pubnumber !== undefined) out.push(`\\vp ${item.pubnumber}\\vp*`);
        break;
      case "chapter":
        out.push(`\\${marker} ${item.number ?? ""}`);
        if (item.altnumber !== undefined) out.push(`\\ca ${item.altnumber}\\ca*`);
        if (item.pubnumber !== undefined) out.push(`\\cp ${item.pubnumber}`);
        break;
      case "ms":
        out.push(`\\${marker}`);
        appendAttributeListBytes(item, out);
        out.push("\\*");
        break;
      case "unmatched":
        out.push(`\\${marker}`);
        break;
      case "char":
        out.push(`\\${marker} `);
        appendContentBytes(item.content, out);
        appendAttributeListBytes(item, out);
        if (closed !== "false") out.push(`\\${marker}*`);
        break;
      case "note": {
        const caller = (item as { caller?: string }).caller;
        const category = (item as { category?: string }).category;
        out.push(`\\${marker} ${caller ?? ""}`);
        if (category !== undefined) out.push(`\\cat ${category}\\cat*`);
        appendContentBytes(item.content, out);
        if (closed !== "false") out.push(`\\${marker}*`);
        break;
      }
      default:
        // Paragraphs and anything else block-shaped: the marker plus its content. Attribute-ish
        // keys (a para's vid/sid) are not display bytes, so they are deliberately NOT folded —
        // emitting them could mask a loss of the same characters.
        out.push(`\\${marker} `);
        appendContentBytes(item.content, out);
    }
  }
}

/**
 * Whether settling `node`'s scope on the IDLE clock would DISCARD displayed non-whitespace bytes
 * out from under the collapsed caret holding that scope. The one shape this is true for is a
 * typed byte the re-tokenization legitimately drops — e.g. a lone `|` in a milestone run:
 * `\qt-s|\*` tokenizes to a milestone with NO attributes, so the canonical rebuild has no `|`
 * left for the caret to sit after. Settling that mid-composition is accept-then-discard (the
 * no-silent-no-ops rule's exact forbidden shape) AND destroys the caret's byte position, so the
 * idle caller re-pends instead and the site settles on genuine caret departure, where the
 * tokenizer's meaning wins with no held caret to betray.
 *
 * The comparison is a non-whitespace character count: every non-whitespace character of the
 * scope's displayed fragment must be re-emitted by folding the tokenized output back to bytes
 * ({@link appendContentBytes}). Whitespace is excluded because the engine legitimately adds,
 * moves, and flattens display whitespace (NBSP separators, joiners). A false positive (the fold
 * under-emitting an exotic shape, a typographic quote the tokenizer regularizes) only defers
 * that settle to caret departure — the pre-idle-clock behavior.
 *
 * Paragraph scopes only: the chapter and note scopes fold values byte-preservingly (an
 * unparseable value lands in altnumber/category verbatim), so no byte-dropping shape is known
 * there; their idle settles are not second-guessed.
 *
 * Read-only (reads the live selection and tree, never mutates): call inside `editor.update()`,
 * where the settle passes already run.
 */
export function $idleSettleWouldDiscardCaretHeldBytes(
  node: LexicalNode,
  getMarkerFn: MarkerLookup,
  viewOptions: ViewOptions | undefined,
): boolean {
  const scope = $settleScopeForNode(node);
  if (!$isParaNode(scope)) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  let caretInScope = false;
  for (
    let current: LexicalNode | null = selection.anchor.getNode();
    current;
    current = current.getParent()
  )
    if (scope.is(current)) {
      caretInScope = true;
      break;
    }
  if (!caretInScope) return false;
  const fragment = $buildParaFragment(scope, getMarkerFn, viewOptions);
  if (!fragment) return false;
  const content = usfmFragmentToUsjContent(fragment.text, { getMarker: getMarkerFn });
  if (content.length === 0) return false;
  const counts = new Map<string, number>();
  for (const ch of fragment.text)
    if (!FRAGMENT_WS.test(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const folded: string[] = [];
  appendContentBytes(content, folded);
  // Fragment text spells a data NBSP as `~` (in every view: the standard-view display already
  // shows `~`, and `contentFragmentText` spells unformatted content NBSPs the same way), while
  // the fold emits the real NBSP byte — which `\s` matches, so it would silently vanish from
  // this count and report every caret-held data NBSP as a discard. Count it as the fragment
  // spells it.
  for (const ch of folded.join("").replaceAll(NBSP, "~")) {
    if (FRAGMENT_WS.test(ch)) continue;
    const remaining = counts.get(ch);
    if (remaining !== undefined && remaining > 0) counts.set(ch, remaining - 1);
  }
  for (const remaining of counts.values()) if (remaining > 0) return true;
  return false;
}
