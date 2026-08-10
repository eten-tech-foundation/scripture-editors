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
  $isRangeSelection,
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
  $isBookNode,
  $isImmutableChapterNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
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
    // verse whose content the caret is in) and the first marker after it.
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
  if (!$shouldAttemptVerticalVerseNavigation(selection)) return false;
  if ($caretHasVisualLineBeyond(editor, direction)) return false;
  const isHandled =
    direction === "up" ? $selectPreviousVerse(selection) : $selectNextVerse(selection);
  if (isHandled) event.preventDefault();
  return isHandled;
}

/**
 * Registers arrow-key handling for USJ scripture: verse-to-verse vertical movement when needed,
 * and horizontal movement around notes and chapter boundaries.
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
      let isHandled = false;
      if (isMovingForward(direction, event.key)) {
        isHandled = $handleForwardNavigation(selection);
      } else if (isMovingBackward(direction, event.key)) {
        isHandled = $handleBackwardNavigation(selection, viewOptions);
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
