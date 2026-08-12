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
  $getCollapsedCaretRange,
  $getSelection,
  $getSiblingCaret,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $normalizeCaret,
  $setSelectionFromCaretRange,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { useEffect } from "react";
import {
  $findFirstAncestorNoteNode,
  $getNextNode,
  $getPreviousNode,
  $isAttributeRunNode,
  $isBookNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  AttributeRunNode,
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
 * and horizontal movement around notes, chapter boundaries, and the leading edge of a
 * decorator-owned attribute display run.
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
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        const direction = event.key === "ArrowUp" ? "up" : "down";
        return $navigateVerseVertically(editor, selection, direction, event);
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      const inputDiv = editor.getRootElement();
      if (!inputDiv) return false;

      const direction = inputDiv.dir || "ltr";
      // The `\fp` boundary hops apply only to plain arrow moves: modified arrows (shift range
      // extension, word/line jumps) keep native semantics.
      const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
      let isHandled = false;
      if (isMovingForward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleForwardFpNavigation(selection)) ||
          $handleForwardNavigation(selection);
      } else if (isMovingBackward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleBackwardFpNavigation(selection)) ||
          (!hasModifier && $handleBackwardDisplayRunNavigation(selection)) ||
          $handleBackwardNavigation(selection, viewOptions);
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

  const firstChild = fpNode.getFirstChild();
  // Land at the start of the new visual line: offset 0 of the span's first text (the editable
  // marker glyph, or content text when glyphs are hidden). A non-text first child (the
  // non-editable marker glyph) takes an element point before it instead.
  if ($isTextNode(firstChild)) firstChild.select(0, 0);
  else fpNode.select(0, 0);
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

// --- The caret stop at a decorator-owned display run's leading edge ---
//
// A milestone's display run — its `\qt-s`…`\*` glyph pair and any attribute value — rides inside
// ONE inline `AttributeRunNode` immediately following the `MilestoneNode` that owns it, and that
// owner is a `DecoratorNode` that renders nothing: an empty `contenteditable="false"` span.
// Lexical hops a collapsed caret across a decorator on its own only while the decorator is a
// SIBLING of the caret's own node; the fallback scan that does walk out through ancestors claims
// only NON-inline decorators, and a milestone is inline. With the run's glyphs one level down
// inside the wrapper, the milestone is the WRAPPER's sibling rather than the glyph's, so Lexical
// declines and defers to the browser's native `Selection.modify` — which will not carry a caret
// backward across an empty non-editable span, leaving the caret unable to leave the run leftward
// at all. These handlers make the hop instead, landing exactly where Lexical's own decorator
// handling would: the position before the owner, normalized to the end of the preceding text when
// there is text there.
//
// Only the run's LEADING edge needs this. Moving forward off its trailing edge crosses into
// ordinary text, and a verse's `\va`/`\vp` wrapper is owned by a `VerseNode` — a `TextNode`, not a
// decorator — so the browser carries the caret over both boundaries natively.

/** The `AttributeRunNode` whose very start the collapsed caret sits at, if any. */
function $getAttributeRunAtStart(selection: RangeSelection): AttributeRunNode | undefined {
  const anchor = selection.anchor;
  if (anchor.offset !== 0) return undefined;

  const anchorNode = anchor.getNode();
  // Element point directly on the wrapper (e.g. an empty wrapper, or a click-placed caret).
  if (anchor.type === "element") return $isAttributeRunNode(anchorNode) ? anchorNode : undefined;

  // Text point at offset 0 of the run's first piece — the opening marker glyph.
  const parent = anchorNode.getParent();
  if (!$isAttributeRunNode(parent) || !anchorNode.is(parent.getFirstChild())) return undefined;
  return parent;
}

/** Helper to handle the backward hop out of a display run whose owner is a decorator. */
function $handleBackwardDisplayRunNavigation(selection: RangeSelection): boolean {
  const wrapper = $getAttributeRunAtStart(selection);
  if (!wrapper) return false;

  // Ownership is position-derived: a wrapper directly follows the leaf it belongs to.
  const owner = wrapper.getPreviousSibling();
  if (!$isDecoratorNode(owner) || owner.isIsolated()) return false;

  $setSelectionFromCaretRange(
    $getCollapsedCaretRange($normalizeCaret($getSiblingCaret(owner, "previous"))),
  );
  return true;
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
