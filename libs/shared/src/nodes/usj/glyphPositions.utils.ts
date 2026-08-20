/**
 * Glyph text and document positions: the single place that owns WHICH rendered bytes are display
 * rather than document, and HOW a caret or selection point that names those bytes is re-expressed
 * so an edit never operates on them.
 *
 * ## The property, not a list of node types
 *
 * A glyph text node is a `TextNode` whose rendered text is a PICTURE OF ITS OWN STATE — the
 * document owns none of those bytes. A `MarkerNode`'s `__text` is a cache of (marker, syntax,
 * nested) that only its setters write ({@link $isCanonicalMarkerNode} exists because that cache can
 * drift). A `VerseNode`'s `__text` is a rendering of its `__number`. An attribute display run's
 * text is a rendering of the char span's attributes, and the marker-trailing separator is a
 * rendering of the `[glyph, separator, …content]` layout itself. Membership is decided by that
 * property, and {@link $isGlyphTextNode} is the one place it is decided — a kind wired in
 * separately somewhere else is the recurring defect this module exists to end.
 *
 * ## Two spellings of one place, and why each gesture picks a different one
 *
 * A glyph's bytes are visible, so the caret really can sit between two of them, and the arrow keys
 * really do walk through them one character at a time. Both of a glyph's ENDS, though, name a place
 * on screen that a neighbouring node also names, and nothing the user does can choose between the
 * two spellings. So an edit must pick the spelling under which the glyph is NOT one of its
 * operands, and which spelling that is depends on what the edit does with a point:
 *
 * - **A collapsed caret is an insertion point**, and it names no node as an operand. Its illegal
 *   region is a glyph's INTERIOR: a node inserted between two display bytes cuts the picture in
 *   half and hands the right-hand half to the document as content — a verse number arriving in the
 *   file as text, a closing glyph's tail stranded as literal paragraph bytes. An interior point
 *   therefore resolves to the glyph's TRAILING end, the end a caret that has already crossed the
 *   glyph's first byte is heading for. Both ends are ordinary positions and are left exactly as
 *   they are.
 * - **A range endpoint drags its own node into the range.** Its illegal region is the mirror image:
 *   a glyph's ENDS, where the endpoint takes the WHOLE glyph node as a wrap target even when it
 *   selects none of its bytes. A glyph is its span's identity, so moving one into another span
 *   deletes the span it came from — the marker vanishes from the file while its glyph is still on
 *   screen. An endpoint at an end is therefore re-spelled onto the neighbouring node, INWARD, so
 *   the glyph falls outside the range. An endpoint strictly inside a glyph is left alone: the user
 *   can see exactly which bytes are highlighted, and re-tokenizing them is Invariant I working as
 *   intended rather than a divergence.
 *
 * Stated once: express the point so the glyph is not an operand. The two arms differ in spelling
 * because insertion and range membership differ in what naming a node means, not because the
 * exclusion rule differs.
 *
 * ## Agreeing with arrow traversal
 *
 * `ArrowNavigationPlugin` walks glyph text one character at a time, so its idea of where a glyph
 * begins and ends is the same as this module's: the interior is inside, the two ends are the
 * boundary positions, and a caret at an end has crossed the glyph whole. Nothing here calls a
 * position outside a glyph that a press treats as inside it, or the reverse. The spelling agrees
 * too — the trailing end resolved to above is written as (glyph, its length), which is exactly the
 * spelling that plugin's canonicalizer prefers for that screen location (the end of the nearest
 * preceding visible text) over the neighbouring node's offset 0. The one thing this module does
 * NOT do is move the caret for traversal's sake: it re-expresses the point an EDIT acts at.
 *
 * ## What this module does NOT own
 *
 * - WHICH boundary an edit should prefer once the point is legal — `caretBoundaries.utils.ts` owns
 *   the content-boundary convention, and `ArrowNavigationPlugin` owns the traversal one.
 * - Which nodes are skipped when counting USJ content indexes
 *   (`$shouldIgnoreNodeForContentIndexes`, node.utils.ts). That question is broader: it also skips
 *   empty and NBSP-only text and line breaks, which are legal insertion hosts and must stay so.
 * - Whether a glyph's bytes are at rest or mid-edit ({@link $isCanonicalMarkerNode}), and what to do
 *   about it — the marker-edit engine owns healing and settling.
 */

import { $isCanonicalMarkerNode, $isMarkerNode } from "../features/MarkerNode.js";
import { MARKER_TRAILING_SPACE_TEXT_TYPE, textTypeState } from "../collab/delta.state.js";
import { $isCharNode } from "./CharNode.js";
import { $isVerseNode } from "./VerseNode.js";
import {
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  PointType,
  RangeSelection,
  TextNode,
} from "lexical";

/** The direction a range endpoint is nudged so the glyph it named falls outside the range. */
type StepDirection = "next" | "previous";

/** A point's addressable parts, so a rejected normalization can be put back exactly. */
interface PointSnapshot {
  key: string;
  offset: number;
  type: "text" | "element";
}

/**
 * Whether `node`'s rendered text is engine-owned DISPLAY bytes — a picture of the node's own state
 * — rather than document content. See the module doc for why this is one property and not four
 * unrelated node types; anything new whose text is derived from state belongs here, and nowhere
 * else.
 *
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
export function $isGlyphTextNode(node: LexicalNode | null | undefined): boolean {
  if (!$isTextNode(node)) return false;
  // A marker glyph (`\add`, `\add*`, a paragraph's `\p` prefix) and an editable verse marker
  // (`\v` + NBSP + number + space) both render their own state as text.
  if ($isMarkerNode(node) || $isVerseNode(node)) return true;
  // The attribute display run (`|gloss="x"`) renders the span's attributes; the marker-trailing
  // separator renders the prefix layout. Both are tagged rather than typed, so they are read off
  // the tag the engine writes when it builds them.
  const textType = $getState(node, textTypeState);
  return textType === "attribute" || textType === MARKER_TRAILING_SPACE_TEXT_TYPE;
}

/**
 * Whether a caret point (`node`, `offset`) sits INSIDE marker glyph text — as opposed to at the
 * TRAILING EDGE of a char span's canonical closing glyph, which is genuinely AFTER the span:
 * arrow traversal and clicks park the caret there at the end of a paragraph whose last child is
 * an inline span, and Enter there is a paragraph action (open the Enter menu), not a marker
 * edit. A NON-canonical (pended, mid-edit) closer keeps its trailing edge "inside": the caret is
 * there because the user is editing the glyph byte-by-byte, and Enter must keep settling that
 * edit instead of splitting. An OPENING glyph's trailing edge stays "inside" too — it is the
 * span's interior (the separator/content follows it). Deliberately scoped to CHAR-parented
 * closers: a display-run wrapper's closer (`\va*`, `\cat*`, a milestone's `\*`) keeps today's
 * swallow — a split at that caret would land inside the `AttributeRunNode`, a path with no
 * close-and-reopen story yet.
 *
 * This asks whether the caret is in a marker the user may be EDITING, which is why an opening
 * glyph's trailing edge counts. It is not the same question as whether the point is a legal
 * document POSITION ({@link $normalizeSelectionOutOfGlyphText}), where both of a glyph's ends are
 * ordinary places to stand. Keeping the two in one module is deliberate: they read the same bytes
 * and the difference between them is the thing that is easy to get wrong.
 *
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
export function $isPointInMarkerGlyphText(node: LexicalNode, offset: number): boolean {
  if (!$isMarkerNode(node)) return false;
  return !(
    offset === node.getTextContentSize() &&
    node.getMarkerSyntax() !== "opening" &&
    $isCanonicalMarkerNode(node) &&
    $isCharNode(node.getParent())
  );
}

/**
 * Whether a collapsed-or-not range selection's anchor sits inside marker glyph text — the guard
 * `MarkerEditPlugin` and `UsjNodesMenuPlugin` use to swallow Enter presses inside a marker. The
 * trailing edge of a canonical closer does NOT count (see {@link $isPointInMarkerGlyphText}).
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
export function $isSelectionInMarkerNode(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  return $isPointInMarkerGlyphText(selection.anchor.getNode(), selection.anchor.offset);
}

/** The glyph text node a point is expressed against, if it is expressed against one. */
function $glyphAtPoint(point: PointType): TextNode | undefined {
  if (point.type !== "text") return undefined;
  const node = point.getNode();
  return $isTextNode(node) && $isGlyphTextNode(node) ? node : undefined;
}

/** The glyph node a point sits strictly between two display bytes of, if it does. */
function $glyphAroundPoint(point: PointType): TextNode | undefined {
  const node = $glyphAtPoint(point);
  if (!node) return undefined;
  return point.offset > 0 && point.offset < node.getTextContentSize() ? node : undefined;
}

/** The glyph node a point names one of the ENDS of, if it does. */
function $glyphAtPointEnd(point: PointType): TextNode | undefined {
  const node = $glyphAtPoint(point);
  if (!node) return undefined;
  return point.offset === 0 || point.offset === node.getTextContentSize() ? node : undefined;
}

function snapshotPoint(point: PointType): PointSnapshot {
  return { key: point.key, offset: point.offset, type: point.type };
}

function restorePoint(point: PointType, snapshot: PointSnapshot): void {
  point.set(snapshot.key, snapshot.offset, snapshot.type);
}

/**
 * The position a range endpoint naming a glyph's end should move to, so the glyph stops being part
 * of the range — or `undefined` when it should not move.
 *
 * Walks siblings in `direction`, because glyphs sit next to each other (a paragraph's prefix is a
 * glyph followed by its separator) and one step would only move the problem along. The walk is
 * ALL-OR-NOTHING: it must reach a text node that is not itself a glyph, or the endpoint stays put.
 * Landing anywhere else would trade one glyph for another, and the next thing along is often an
 * element — a char span — where stepping in would change which span the range starts in. Deciding
 * span membership is not this module's call.
 */
function $landingPastGlyphs(
  point: PointType,
  direction: StepDirection,
): { node: TextNode; offset: number } | undefined {
  let cursor = $glyphAtPointEnd(point);
  while (cursor) {
    const sibling = direction === "next" ? cursor.getNextSibling() : cursor.getPreviousSibling();
    if (!$isTextNode(sibling)) return undefined;
    if (!$isGlyphTextNode(sibling))
      return { node: sibling, offset: direction === "next" ? 0 : sibling.getTextContentSize() };
    cursor = sibling;
  }
  return undefined;
}

/** Apply {@link $landingPastGlyphs} to `point`, reporting whether it moved. */
function $stepPointPastGlyphs(point: PointType, direction: StepDirection): boolean {
  const landing = $landingPastGlyphs(point, direction);
  if (!landing) return false;
  point.set(landing.node.getKey(), landing.offset, "text");
  return true;
}

/**
 * Re-express `selection` so no glyph is an operand of the edit about to run, and report whether
 * anything moved. The one exclusion point: every gesture that places a node at a caret or acts on a
 * selected range routes through this instead of testing for its own favourite glyph shape.
 *
 * A COLLAPSED selection is an insertion point: a point in a glyph's interior resolves to that
 * glyph's trailing end, and the ends are left alone. A RANGE has its two endpoints stepped inward
 * past any glyph they name an end of, and interior endpoints are left alone. The module doc carries
 * the reasoning for the asymmetry — it is one rule about operands, not two policies.
 *
 * Both range steps are all-or-nothing (see {@link $landingPastGlyphs}), and a trim that would
 * invert or collapse the selection is abandoned whole — that happens when both endpoints name the
 * same glyph, as a selection of exactly one glyph does. Leaving the range as the user made it beats
 * guessing at a position this module cannot justify.
 *
 * Mutating: call inside `editor.update()`, before the edit reads the selection.
 */
export function $normalizeSelectionOutOfGlyphText(selection: RangeSelection): boolean {
  if (selection.isCollapsed()) {
    const glyph = $glyphAroundPoint(selection.anchor);
    if (!glyph) return false;
    const trailingEnd = glyph.getTextContentSize();
    selection.anchor.set(glyph.getKey(), trailingEnd, "text");
    selection.focus.set(glyph.getKey(), trailingEnd, "text");
    return true;
  }

  const wasBackward = selection.isBackward();
  const start = wasBackward ? selection.focus : selection.anchor;
  const end = wasBackward ? selection.anchor : selection.focus;
  const before = [snapshotPoint(start), snapshotPoint(end)] as const;
  const movedStart = $stepPointPastGlyphs(start, "next");
  const movedEnd = $stepPointPastGlyphs(end, "previous");
  if (!movedStart && !movedEnd) return false;
  if (selection.isCollapsed() || selection.isBackward() !== wasBackward) {
    restorePoint(start, before[0]);
    restorePoint(end, before[1]);
    return false;
  }
  return true;
}
