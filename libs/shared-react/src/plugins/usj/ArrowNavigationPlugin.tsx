import {
  $isImmutableNoteCallerNode,
  $isImmutableVerseNode,
  $isSomeVerseNode,
  $selectNextVerse,
  $selectPreviousVerse,
  ImmutableVerseNode,
} from "../../nodes/usj";
import { $advancePastParaPrefixes } from "./ParaMarkerPrefixCursorGuardPlugin";
import { ViewOptions } from "../../views/view-options.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  ElementNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  PointType,
  RangeSelection,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  $findFirstAncestorNoteNode,
  $getNextNode,
  $getPreviousNode,
  $isBookNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isSomeParaNode,
  $placeCaretAtBoundary,
  CharNode,
  ImmutableChapterNode,
  NoteNode,
} from "shared";

/** A minimal rectangle shape ({@link DOMRect}-compatible) for visual-line comparisons. */
interface LineRect {
  top: number;
  bottom: number;
  height: number;
}

/**
 * Is there a visual line beyond the caret in `direction`, among a set of candidate line rects?
 * Pure geometry, kept separate from the DOM so it is unit-testable ({@link $caretHasVisualLineBeyond}
 * supplies the rects). Returns `false` for a zero-height caret (e.g. jsdom has no layout) so callers
 * fall back to their default rather than act on a phantom line.
 *
 * A wrapped line sits clear of the caret's own line, so this compares the line gap (a rect that
 * starts below the caret / ends above it) rather than raw top/bottom — otherwise a taller inline on
 * the caret's *own* line (a verse number or note caller) would read as a wrapped line. The
 * tolerance scales with caret height so it holds across font sizes and zoom.
 *
 * @param caretRect - The collapsed caret's bounding rect.
 * @param lineRects - Candidate per-line rects to test (e.g. from `Range.getClientRects()`).
 * @param direction - `"down"` looks for a line below the caret; `"up"` a line above.
 */
export function hasVisualLineBeyondCaret(
  caretRect: LineRect,
  lineRects: LineRect[],
  direction: "up" | "down",
): boolean {
  if (caretRect.height === 0) return false;
  const tolerance = caretRect.height / 4; // sub-pixel slack, well under a full line gap.
  return lineRects.some((rect) =>
    direction === "down"
      ? rect.top >= caretRect.bottom - tolerance
      : rect.bottom <= caretRect.top + tolerance,
  );
}

/**
 * Whether the current verse's text has a wrapped line beyond the caret in `direction`. Custom
 * verse-to-verse navigation only fires from a verse's first visual line, so this stops ArrowDown
 * from skipping the rest of a wrapped verse and jumping to the next one (PT-4308).
 *
 * The verse's content is measured across blocks — bounded by the surrounding `[data-marker="v"]`
 * verse markers — because a verse can wrap across several `\q` poetry paragraphs; measuring only the
 * caret's own paragraph would miss those lines. Returns `false` when layout cannot be measured
 * (e.g. jsdom), so the caller keeps the existing verse-jump.
 */
function $caretHasVisualLineBeyond(editor: LexicalEditor, direction: "up" | "down"): boolean {
  if (typeof window === "undefined") return false;
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return false;
  const root = editor.getRootElement();
  if (!root) return false;

  try {
    const caretRange = domSelection.getRangeAt(0);
    // Only measure this editor's caret: ignore a selection that lives elsewhere on the page or in
    // another document (an iframe host), which would otherwise be measured against our markers.
    if (!root.contains(caretRange.startContainer)) return false;
    const caretRect = caretRange.getBoundingClientRect();
    const caretStart = caretRange.cloneRange();
    caretStart.collapse(true);

    // Bound the measurement to the current verse: the last marker strictly before the caret (so the
    // verse whose content the caret is in) and the first marker after it. The comparison is
    // position-based (a plain sibling walk can't handle element-point carets, e.g. a caret at an
    // element offset between decorator siblings), so it scans markers in document order. This runs
    // only on ArrowUp/ArrowDown at a verse boundary — not on every keystroke — over one editor's
    // worth of verses (a chapter), so the linear scan is not a hot path.
    const markers = Array.from(root.querySelectorAll('[data-marker="v"]'));
    let current: Element | undefined;
    let next: Element | undefined;
    for (const marker of markers) {
      const markerRange = document.createRange();
      markerRange.selectNode(marker);
      if (caretStart.compareBoundaryPoints(Range.START_TO_START, markerRange) > 0) {
        current = marker;
      } else {
        next = marker;
        break;
      }
    }
    if (!current) return false;

    const contentRange = document.createRange();
    contentRange.setStartAfter(current);
    if (next) contentRange.setEndBefore(next);
    else contentRange.setEnd(root, root.childNodes.length);
    return hasVisualLineBeyondCaret(
      caretRect,
      Array.from(contentRange.getClientRects()),
      direction,
    );
  } catch {
    // No layout engine (e.g. jsdom: Range has no getBoundingClientRect): cannot detect a wrapped
    // line, so fall back to the existing verse-jump rather than suppressing it.
    return false;
  }
}

/**
 * Handles an ArrowUp/ArrowDown press for verse-to-verse navigation. Intercepts only when the caret
 * is at a verse boundary and native movement would leave the verse; when the verse wraps onto
 * further lines it yields to the browser's visual-line movement instead (PT-4308).
 *
 * @returns `true` (and prevents default) when it moved the caret to an adjacent verse; otherwise
 *   `false` so Lexical/the browser handles the key.
 */
function $navigateVerseVertically(
  editor: LexicalEditor,
  selection: RangeSelection,
  direction: "up" | "down",
  event: KeyboardEvent,
): boolean {
  // Don't intercept when the caret isn't at a verse boundary, or when the verse wraps onto a
  // further line in this direction (let the browser move by visual line instead). `||` short-circuits
  // so the DOM measurement only runs once the cheap boundary check passes.
  if (
    !$shouldAttemptVerticalVerseNavigation(selection) ||
    $caretHasVisualLineBeyond(editor, direction)
  )
    return false;
  const isHandled =
    direction === "up" ? $selectPreviousVerse(selection) : $selectNextVerse(selection);
  if (isHandled) event.preventDefault();
  return isHandled;
}

/**
 * Registers arrow-key handling for USJ scripture: verse-to-verse vertical movement when needed,
 * and horizontal movement around notes and chapter boundaries. In editable-marker mode it also
 * normalizes horizontal traversal — plain arrows and shift-extensions alike — so every press
 * crosses exactly one piece of rendered content.
 *
 * TODO: When the caret is before an empty verse number in an otherwise empty para, pressing up or
 * down moves the caret to after the verse number in the para above/below rather than staying
 * before the verse number.
 *
 * @param viewOptions - View options (e.g. collapsed note mode) affecting backward navigation.
 * @returns Always `null`; this component has no UI.
 */
export function ArrowNavigationPlugin({
  viewOptions,
}: {
  viewOptions: ViewOptions | undefined;
}): null {
  const [editor] = useLexicalComposerContext();
  useArrowKeys(editor, viewOptions);
  return null;
}

/**
 * When moving with arrow keys, it handles navigation around adjacent verse and note nodes.
 * It also handles not moving if a chapter node is the only thing at the beginning.
 * @param editor - The LexicalEditor instance used to access the DOM.
 * @param viewOptions - The current view options, which may affect navigation behavior.
 */
function useArrowKeys(editor: LexicalEditor, viewOptions: ViewOptions | undefined) {
  useEffect(() => {
    if (!editor.hasNodes([ImmutableChapterNode, ImmutableVerseNode, NoteNode])) {
      throw new Error(
        "ArrowNavigationPlugin: ImmutableChapterNode, ImmutableVerseNode or NoteNode not registered on editor!",
      );
    }

    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;

      // Display runs and glyph text — the stacked invisible positions the normalizer exists for —
      // are built only in editable-marker mode; the other views keep the browser's own traversal.
      const normalizesStops = viewOptions?.markerMode === "editable";
      const rootElement = editor.getRootElement();

      // Shift+horizontal arrow grows the selection by the same visible stops the collapsed caret
      // walks: the FOCUS moves one rendered position, the anchor stays put. Without it, selecting
      // through a display run inherits the traversal the normalizer exists to replace — the focus
      // stalls on invisible stops, and at a run's left edge it could not move at all, because
      // Lexical hands an extend across a zero-width decorator to the browser exactly as it does a
      // collapsed move. Shift ONLY: ctrl/alt/meta arrows keep their own word and line granularity.
      if (
        normalizesStops &&
        rootElement &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const textDirection = rootElement.dir || "ltr";
        const isHandled = $extendOneVisibleStop(
          selection,
          isMovingForward(textDirection, event.key) ? "next" : "previous",
        );
        if (isHandled) event.preventDefault();
        return isHandled;
      }

      if (!selection.isCollapsed()) return false;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        const direction = event.key === "ArrowUp" ? "up" : "down";
        return $navigateVerseVertically(editor, selection, direction, event);
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      if (!rootElement) return false;

      const direction = rootElement.dir || "ltr";
      // The `\fp` boundary hops apply only to plain arrow moves: modified arrows (shift range
      // extension, word/line jumps) keep native semantics.
      const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
      let isHandled = false;
      if (isMovingForward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleForwardFpNavigation(selection)) ||
          $handleForwardNavigation(selection) ||
          (!hasModifier && normalizesStops && $moveOneVisibleStop(selection, "next"));
      } else if (isMovingBackward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleBackwardFpNavigation(selection)) ||
          $handleBackwardNavigation(selection, viewOptions) ||
          (!hasModifier && normalizesStops && $moveOneVisibleStop(selection, "previous"));
      }

      if (isHandled) event.preventDefault();
      return isHandled;
    };

    return editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH);
  }, [editor, viewOptions]);
}

// --- Helper functions for direction checking ---

function isMovingForward(direction: string, key: string): boolean {
  return (
    (direction === "ltr" && key === "ArrowRight") || (direction === "rtl" && key === "ArrowLeft")
  );
}

function isMovingBackward(direction: string, key: string): boolean {
  return (
    (direction === "ltr" && key === "ArrowLeft") || (direction === "rtl" && key === "ArrowRight")
  );
}

// --- Two caret stops around the `\fp` visual line break ---
//
// An expanded note's `\fp` (footnote paragraph) span renders with a CSS-generated line break
// before it (`.note.expanded .usfm_fp::before`). The pseudo content has no DOM position, so the
// browser collapses the caret positions on either side of the visual newline and skips one stop:
// moving forward it jumps from the end of the previous line straight past the start of the `\fp`
// span, and moving backward it can skip the span start on the way out. These handlers restore the
// two stops: end of the previous line, then the very start of the `\fp` span on the new line.

/** The given node if it is a `\fp` span whose leading line break renders (expanded note). */
function $getFpBoundaryCharNode(node: LexicalNode | null | undefined): CharNode | undefined {
  if (!$isCharNode(node) || node.getMarker() !== "fp") return undefined;
  const note = $findFirstAncestorNoteNode(node);
  if (!note || note.getIsCollapsed()) return undefined;
  return node;
}

/** Helper to handle the forward hop onto the start of a `\fp` span at its visual line break. */
function $handleForwardFpNavigation(selection: RangeSelection): boolean {
  const fpNode = $getFpBoundaryCharNode($getNextNode(selection));
  if (!fpNode) return false;

  // A text caret is only at the boundary when it sits at the very end of its text.
  const anchor = selection.anchor;
  if (anchor.type === "text" && anchor.offset !== anchor.getNode().getTextContentSize()) {
    return false;
  }

  // Land at the start of the new visual line: the span's first content boundary — offset 0 of its
  // first text (the editable marker glyph, or content text when glyphs are hidden), or an element
  // point when a non-text first child (the non-editable marker glyph) hosts no caret there.
  $placeCaretAtBoundary(fpNode, 0);
  return true;
}

/** Helper to handle backward hops at the start of a `\fp` span and its visual line break. */
function $handleBackwardFpNavigation(selection: RangeSelection): boolean {
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();

  if (anchor.type === "text") {
    const fpNode = $getFpBoundaryCharNode(anchorNode.getParent());
    if (!fpNode || !anchorNode.is(fpNode.getFirstChild())) return false;

    if (anchor.offset === 1) {
      // caret after first character of the span's first text → stop at the span start (start of
      // the new visual line) instead of letting the browser collapse the boundary and skip it
      anchorNode.select(0, 0);
      return true;
    }
    if (anchor.offset !== 0) return false;
    // caret at span start → hop over the visual newline to the end of the previous line
    return $selectBeforeFpSpan(fpNode);
  }

  // Element caret at the very start of the `\fp` span (before a non-text first child, e.g. the
  // non-editable marker glyph).
  if (anchor.offset === 0) {
    const fpNode = $getFpBoundaryCharNode(anchorNode);
    if (!fpNode) return false;
    return $selectBeforeFpSpan(fpNode);
  }
  return false;
}

/** Place the caret at the end of the content preceding the `\fp` span (end of the previous line). */
function $selectBeforeFpSpan(fpNode: CharNode): boolean {
  const prevNode = fpNode.getPreviousSibling();
  if (!prevNode) return false;

  if ($isTextNode(prevNode)) {
    prevNode.select();
    return true;
  }
  if ($isElementNode(prevNode)) {
    // end of the previous span's content (e.g. the `\ft` span, or a preceding `\fp`)
    const lastDescendant = prevNode.getLastDescendant();
    if ($isTextNode(lastDescendant)) lastDescendant.select();
    else prevNode.selectEnd();
    return true;
  }
  // Decorator sibling (e.g. the note caller): place the caret between it and the `\fp` span so
  // the existing note-boundary handling can take over from there on the next press.
  const parent = fpNode.getParent();
  if (!parent) return false;
  const fpIndex = fpNode.getIndexWithinParent();
  parent.select(fpIndex, fpIndex);
  return true;
}

// --- The visible-stop normalizer ---
//
// ONE rule for horizontal arrow traversal, replacing the per-shape hops that preceded it: an
// unmodified arrow press must cross exactly ONE piece of RENDERED content — a visible character, or
// a visible atom (a note caller, an immutable glyph, a collapsed note) crossed whole. Everything
// that renders nothing is stepped over, however many tree positions it contributes: element
// boundaries, wrapper seams, and zero-width decorators such as a `MilestoneNode`, whose `decorate()`
// returns "".
//
// Those invisible positions are the whole problem. A milestone anchor sits between the text before
// it and its own `\qt-s`…`\*` display run, so the run's leading seam alone stacks up to five tree
// positions at ONE screen location — end of the preceding text, before the anchor, after the anchor,
// the wrapper's own start, offset 0 of its first glyph. Lexical and the browser stop at several of
// them, so a press moved the caret without moving anything the eye could follow; a caret in a marker
// glyph merely changes colour, from the paragraph's black to the run's dim grey. Nested spans stack
// more seams (`\add word\add*\qt-s\*` measured three presses to cross `*`→`\`), and where the seam
// is a zero-width decorator with no text on the far side the browser refuses the move outright, so
// the caret could not leave a run leftward at all.
//
// Two halves make one press equal one visible crossing:
//   - MOVE: from the caret, walk in the press direction, skipping everything that renders nothing,
//     until the first rendered thing; cross exactly it. Crossing a visible text node means landing
//     one grapheme INTO it, not at its edge — the edge is the position the caret just left.
//   - CANONICALIZE: where several tree positions share one screen location, only ONE is a resting
//     place — the outermost, earliest in document order: the end of the nearest preceding visible
//     text. That is Lexical's own convention for a plain text/text seam
//     (`resolveSelectionPointOnBoundary`), extended across the invisible nodes it does not look
//     through. It keeps round trips exact — N presses one way and N back returns to the very same
//     tree position — and it keeps typing predictable, since the two positions flanking a run's
//     opening glyph put typed text in different nodes.
//
// Scope: unmodified ArrowLeft/ArrowRight, collapsed caret, editable-marker mode (where display runs
// and glyph text exist at all), and only within the caret's own block. At a block edge this declines
// and the existing paragraph/line handling runs — which means the FIRST press into a new paragraph
// is not normalized: a paragraph opening with a milestone still costs one invisible press on entry,
// since the press that arrives there crossed a block edge and was never this rule's to resolve.
//
// PRECEDENCE: this runs LAST in both chains, so the note, chapter, book and `\fp` handlers above get
// first refusal and keep their own contracts unchanged. Where one of them claims, one-crossing and
// canonicalization simply do not apply — `$selectBeforeFpSpan`, for instance, deliberately rests on
// element points this rule would never leave the caret on. That is the intended split: those
// handlers encode specific editorial behavior, and this one only decides what "one press" means
// wherever nothing else has an opinion.
//
// One seam is invisible to any classifier by construction: an expanded note's `\fp` line break is a
// CSS pseudo-element (`.note.expanded .usfm_fp::before`) with no node behind it, so no tree walk can
// see that a line ended. `$handleForwardFpNavigation`/`$handleBackwardFpNavigation` own that seam
// and run first — it must stay that way.
//
// Direction is LOGICAL — `isMovingForward` maps the physical key through the root's `dir`, so RTL
// mirrors for free. Claiming the key keeps Lexical's own `KEY_ARROW_*` handling from running at
// all, so `$moveCharacter` never double-applies and no native `Selection.modify` is consulted; the
// whole traversal is decided from the tree, which is also what makes press counts measurable
// without browser caret geometry.
//
// Clicks and programmatic selection are untouched — this is arrow traversal only, so a caret parked
// on a non-canonical position by other means is normalized by its next arrow press rather than
// underneath the user.
//
// KNOWN APPROXIMATIONS, both disclosed rather than silently smoothed:
//   - Moves that stay INSIDE one text node are declined, so the browser keeps applying its own
//     grapheme and bidi rules there — the cases a tree walk cannot see. The one exception is a
//     backward step off a text node's first character, which must be claimed because its landing
//     needs canonicalizing. A backward step that lands on offset 0 from further in (only possible
//     when the FIRST grapheme spans several code units) is left to the browser and so rests on a
//     non-canonical position until the next boundary press normalizes it.
//   - Visual bidi order inside mixed-direction text is not modelled; traversal is logical.

type TraversalDirection = "next" | "previous";

/** Where a resolved move lands: a text point, or an element point between two children. */
type CaretLanding =
  | { kind: "text"; node: TextNode; offset: number }
  | { kind: "element"; node: ElementNode; offset: number };

/**
 * Minimal shape of `Intl.Segmenter`, declared locally so this file does not depend on the ambient
 * lib target carrying it. Absent at runtime, the code-point fallbacks below still keep the caret off
 * the inside of a surrogate pair.
 */
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ index: number; segment: string }>;
}

const graphemeSegmenter: GraphemeSegmenter | undefined = (() => {
  const intl = Intl as unknown as {
    Segmenter?: new (
      locales?: string | undefined,
      options?: { granularity: string },
    ) => GraphemeSegmenter;
  };
  return intl.Segmenter ? new intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;
})();

/** The offset just past `text`'s first grapheme — where a forward crossing into it lands. */
function firstGraphemeEnd(text: string): number {
  if (graphemeSegmenter) {
    for (const { segment } of graphemeSegmenter.segment(text)) return segment.length;
  }
  const codePoint = text.codePointAt(0);
  return codePoint === undefined ? 0 : String.fromCodePoint(codePoint).length;
}

/**
 * The offset where `text`'s last grapheme begins — where a backward crossing into it lands.
 *
 * Scans the whole string: `Intl.Segmenter` only walks forward, and a bounded tail scan can be wrong,
 * because whether a trailing code point begins a grapheme depends on what precedes it. The strings
 * are marker glyphs and short attribute values, and one runs per boundary press.
 */
function lastGraphemeStart(text: string): number {
  if (graphemeSegmenter) {
    let start = 0;
    for (const { index } of graphemeSegmenter.segment(text)) start = index;
    return start;
  }
  const codePoint = text.codePointAt(Math.max(0, text.length - 2));
  const isSurrogatePair = codePoint !== undefined && codePoint > 0xffff;
  return Math.max(0, text.length - (isSurrogatePair ? 2 : 1));
}

/** The block the traversal is confined to — arrows leave a block through the handlers above. */
function $blockOf(node: LexicalNode): ElementNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isElementNode(current) && !current.isInline()) return current;
  }
  return undefined;
}

/** Text the caret walks through one character at a time. */
function $isTraversableText(node: LexicalNode | null | undefined): node is TextNode {
  return $isTextNode(node) && !node.isToken() && node.getTextContentSize() > 0;
}

/**
 * Occupies space on screen but holds no caret positions of its own: crossing it is a single stop,
 * and the caret never lands inside.
 *
 * The list is deliberately explicit, because a node wrongly called invisible is stepped over
 * silently — the caret sails past it and the press lands a stop too far. Anything new that takes up
 * room without offering caret positions belongs here.
 */
function $isVisibleAtom(node: LexicalNode): boolean {
  // A line break occupies the rest of its line and ends it. Its two sides are genuinely different
  // places, so it is crossed like any other glyph — never skipped. The unformatted view puts one
  // before every verse, so getting this wrong strands a whole view's line starts and ends.
  if ($isLineBreakNode(node)) return true;
  // A COLLAPSED note shows only its caller; its hidden content must not be walked into. The flag is
  // undefined until the note plugin settles it, and an unsettled note counts as expanded, matching
  // what is on screen before the collapse lands.
  if ($isNoteNode(node)) return node.getIsCollapsed() === true;
  // Token-mode text is indivisible by Lexical's own rule.
  if ($isTextNode(node)) return node.isToken() && node.getTextContentSize() > 0;
  // Every decorator renders SOMETHING — a note caller, an immutable glyph, a verse or chapter
  // number — except the zero-width anchors listed here, which render nothing at all. A new
  // zero-width decorator must join this list, or traversal will come to rest on it.
  if ($isDecoratorNode(node)) return !$isMilestoneNode(node);
  return false;
}

/** The next node in document order in `direction`, stepping out of ancestors, bounded by `block`. */
function $stepOver(
  from: LexicalNode,
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  for (let current: LexicalNode | null = from; current && !current.is(block); ) {
    const sibling = direction === "next" ? current.getNextSibling() : current.getPreviousSibling();
    if (sibling) return sibling;
    current = current.getParent();
  }
  return undefined;
}

/**
 * The first node rendering anything, starting AT `seed` and walking `direction` — descending into
 * elements that are not atoms, stepping over everything invisible.
 */
function $scanForRendered(
  seed: LexicalNode | undefined,
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  for (let cursor = seed; cursor; ) {
    if ($isVisibleAtom(cursor)) return cursor;
    if ($isElementNode(cursor)) {
      const child = direction === "next" ? cursor.getFirstChild() : cursor.getLastChild();
      cursor = child ?? $stepOver(cursor, direction, block);
      continue;
    }
    if ($isTraversableText(cursor)) return cursor;
    cursor = $stepOver(cursor, direction, block);
  }
  return undefined;
}

/** The node a scan should consider first when leaving the caret's position in `direction`. */
function $scanSeed(
  anchorNode: LexicalNode,
  anchorOffset: number,
  anchorType: "text" | "element",
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  if (anchorType === "element" && $isElementNode(anchorNode)) {
    const child = anchorNode.getChildAtIndex(
      direction === "next" ? anchorOffset : anchorOffset - 1,
    );
    return child ?? $stepOver(anchorNode, direction, block);
  }
  return $stepOver(anchorNode, direction, block);
}

/**
 * The single resting position for the screen location `landing` sits at.
 *
 * The preference is backward — the end of the nearest preceding visible text — and deliberately the
 * opposite of the forward one the content-boundary convention states (`$placeCaretAtBoundary`,
 * shared): what precedes an arrow landing is rendered content the caret has just walked over, so the
 * end of it is the outermost position at that location, whereas what precedes a content boundary is
 * structure that typed text must not merge into.
 */
function $canonicalize(landing: CaretLanding, block: ElementNode): CaretLanding {
  // A text point with a character before it in its own node is already the outermost position at
  // its location — nothing invisible separates it from rendered content on its left.
  if (landing.kind === "text" && landing.offset > 0) return landing;

  const seed = $scanSeed(landing.node, landing.offset, landing.kind, "previous", block);
  const rendered = $scanForRendered(seed, "previous", block);
  // Nothing rendered precedes it (the block's leading edge): the landing is already outermost.
  if (!rendered) return landing;
  if ($isTraversableText(rendered))
    return { kind: "text", node: rendered, offset: rendered.getTextContentSize() };

  const parent = rendered.getParent();
  if (!parent) return landing;
  return { kind: "element", node: parent, offset: rendered.getIndexWithinParent() + 1 };
}

/** Where a single press lands from `point`, or `undefined` when the block edge leaves nothing to cross. */
function $resolveOneVisibleStop(
  point: PointType,
  direction: TraversalDirection,
): CaretLanding | undefined {
  const anchorNode = point.getNode();
  const block = $blockOf(anchorNode);
  if (!block) return undefined;

  // Inside a text node the browser's own grapheme and bidi handling is better than a tree walk, so
  // those moves are declined — except a backward step off the first character, whose landing at
  // offset 0 is one of the stacked positions and has to be canonicalized.
  if (point.type === "text" && $isTraversableText(anchorNode)) {
    if (direction === "next" && point.offset < anchorNode.getTextContentSize()) return undefined;
    if (direction === "previous" && point.offset > 1) return undefined;
    if (direction === "previous" && point.offset === 1)
      return $canonicalize({ kind: "text", node: anchorNode, offset: 0 }, block);
  }

  const seed = $scanSeed(anchorNode, point.offset, point.type, direction, block);
  const rendered = $scanForRendered(seed, direction, block);
  if (!rendered) return undefined;

  if ($isTraversableText(rendered)) {
    const text = rendered.getTextContent();
    const offset = direction === "next" ? firstGraphemeEnd(text) : lastGraphemeStart(text);
    return $canonicalize({ kind: "text", node: rendered, offset }, block);
  }

  const parent = rendered.getParent();
  if (!parent) return undefined;
  const index = rendered.getIndexWithinParent();
  return $canonicalize(
    { kind: "element", node: parent, offset: direction === "next" ? index + 1 : index },
    block,
  );
}

/**
 * Applies one visible stop in `direction`. `collapse` walks the caret; `extend` moves only the
 * selection's focus, so a shift-arrow grows the range by the same stops. `false` leaves the press to
 * other handling.
 */
function $applyOneVisibleStop(
  selection: RangeSelection,
  direction: TraversalDirection,
  alter: "collapse" | "extend",
): boolean {
  // A collapsed move reads the anchor and an extend reads the focus — the live end of the range,
  // so it stays correct for a selection that was already extended backwards.
  const point = alter === "collapse" ? selection.anchor : selection.focus;
  const landing = $resolveOneVisibleStop(point, direction);
  if (!landing) return false;
  // Already there (a canonicalization that resolved back onto the point): report the press as
  // unhandled rather than claiming a keystroke that changes nothing.
  if (
    landing.node.is(point.getNode()) &&
    landing.offset === point.offset &&
    landing.kind === point.type
  ) {
    return false;
  }
  if (alter === "collapse") {
    landing.node.select(landing.offset, landing.offset);
    return true;
  }
  selection.focus.set(landing.node.getKey(), landing.offset, landing.kind);
  return true;
}

/** Moves the caret one visible stop in `direction`; `false` leaves the press to other handling. */
function $moveOneVisibleStop(selection: RangeSelection, direction: TraversalDirection): boolean {
  return $applyOneVisibleStop(selection, direction, "collapse");
}

/** Extends the selection's focus one visible stop, leaving its anchor where it is. */
function $extendOneVisibleStop(selection: RangeSelection, direction: TraversalDirection): boolean {
  return $applyOneVisibleStop(selection, direction, "extend");
}

/** Helper to handle forward arrow key navigation logic */
function $handleForwardNavigation(selection: RangeSelection): boolean {
  const node = selection.anchor.getNode();
  const nextNode = $getNextNode(selection);
  if ($isNoteNode(nextNode) && !$isMarkerNode(nextNode.getFirstChild())) {
    // note is next and markers are not editable
    if ($isSomeParaNode(node)) {
      const isSelectionAtParaEnd = selection.anchor.offset === node.getChildrenSize();
      if (isSelectionAtParaEnd) return false;
    } else {
      const isSelectionAtNodeEnd = selection.anchor.offset === node.getTextContentSize();
      if (!isSelectionAtNodeEnd) return false;
    }

    if (!nextNode.getIsCollapsed()) {
      // caret at end of node before expanded note → move past note caller
      if ($isImmutableTypedTextNode(nextNode.getFirstChild())) nextNode.select(2, 2);
      else nextNode.select(1, 1);
      return true;
    } else if (nextNode.is(nextNode.getParent()?.getLastChild())) {
      // caret at end of node before collapsed note at end of para → move past note
      const nextPara = nextNode.getParent()?.getNextSibling();
      if (nextPara && !($isSomeParaNode(nextPara) && $advancePastParaPrefixes(nextPara)))
        nextPara.selectStart();
      return true;
    }
  }

  if ($isSomeParaNode(node) && $isNoteNode(nextNode) && nextNode.getIsCollapsed()) {
    // caret between verse and collapsed note → move past note
    const nodeAfterNote = nextNode.getNextSibling();
    if (nodeAfterNote) nodeAfterNote.selectStart();
    // TODO: we probably need a space character after a note at the end of a para to allow caret
    // placement after the note. Currently typing will go into the note.
    else nextNode.selectEnd();
    return true;
  }

  const nextNodeParent = nextNode?.getParent();
  if (
    $isImmutableTypedTextNode(nextNode) &&
    $isNoteNode(nextNodeParent) &&
    nextNode.is(nextNodeParent?.getLastChild())
  ) {
    // caret before closing note marker → move past note
    const nodeAfterNote = nextNodeParent.getNextSibling();
    if (nodeAfterNote) nodeAfterNote.selectStart();
    // TODO: we probably need a space character after a note at the end of a para to allow caret
    // placement after the note. Currently typing will go into the note.
    else nextNodeParent.selectEnd();
    return true;
  }

  return false;
}

/** Helper to handle backward arrow key navigation logic */
function $handleBackwardNavigation(
  selection: RangeSelection,
  viewOptions: ViewOptions | undefined,
): boolean {
  const prevNode = $getPreviousNode(selection);
  // If a chapter node is the only thing at the beginning → don't move.
  if ($isImmutableChapterNode(prevNode) && !prevNode.getPreviousSibling()) return true;

  // If not at the beginning of node text → skip.
  const isSelectionAtNodeStart = selection.anchor.offset === 0;
  if (!isSelectionAtNodeStart) return false;

  // If at the beginning of book node text → don't move.
  const node = selection.anchor.getNode();
  if ($isBookNode(node.getParent())) return true;

  if ($isNoteNode(prevNode) && prevNode.getIsCollapsed()) {
    // caret at end of collapsed note preceded by verse → move to start of note in para
    const nodeBeforeNote = prevNode.getPreviousSibling();
    if (!$isImmutableVerseNode(nodeBeforeNote)) return false;

    const parent = prevNode.getParent();
    if (!parent) return false;

    const noteIndex = prevNode.getIndexWithinParent();
    parent.select(noteIndex, noteIndex);
    return true;
  }

  // Deliberately gated on the always-"collapsed" MODE, not just the note's own collapsed flag:
  // under "expandInline" the caret must instead land inside the note's end (Lexical's default
  // move), where the NoteNodePlugin expands it for inline editing — hopping over the note here
  // would defeat that enter-and-expand behavior.
  if ($isSomeParaNode(prevNode) && viewOptions?.noteMode === "collapsed") {
    // caret at beginning of para after collapsed note → move to start in previous para
    const lastChild = prevNode.getLastChild();
    if (!lastChild) return false;

    const note = $findMatchingParent(lastChild, (n: LexicalNode) => $isNoteNode(n));
    if ($isNoteNode(note) && note.getIsCollapsed()) {
      const parent = note.getParent();
      if (!parent) return false;

      const noteIndex = note.getIndexWithinParent();
      parent.select(noteIndex, noteIndex);
      return true;
    }
  }

  const noteNode = $findFirstAncestorNoteNode(node);
  if (!noteNode || noteNode.getIsCollapsed()) return false;

  if ($isImmutableNoteCallerNode(prevNode)) {
    // caret after caller in expanded note (markers hidden) → move to start of note in para
    const parent = noteNode.getParent();
    if (!parent) return false;

    const noteIndex = noteNode.getIndexWithinParent();
    parent.select(noteIndex, noteIndex);
    return true;
  }

  return false;
}

/**
 * Returns whether custom ArrowUp/ArrowDown verse navigation should run.
 *
 * Intercepts when the anchor is an element point (cursor between block nodes, including
 * positions adjacent to `ImmutableVerseNode`) or when the anchor is inside an editable
 * `VerseNode` (a `TextNode` subclass). Regular `TextNode` positions are left to Lexical's
 * default visual-line navigation.
 *
 * Lexical normalizes element points to text offset 0 when the next child is a `TextNode`;
 * the post-normalization position right after an `ImmutableVerseNode` marker is also
 * treated as a verse boundary.
 */
function $shouldAttemptVerticalVerseNavigation(selection: RangeSelection): boolean {
  if (selection.anchor.type === "element") return true;
  const anchorNode = selection.anchor.getNode();
  if ($isSomeVerseNode(anchorNode)) return true;
  if (selection.anchor.offset === 0 && $isSomeVerseNode(anchorNode.getPreviousSibling())) {
    return true;
  }
  return false;
}
