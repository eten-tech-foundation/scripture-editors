import {
  $isImmutableNoteCallerNode,
  $isImmutableVerseNode,
  $isSomeVerseNode,
  $resolveVerseNode,
  $selectNextVerse,
  $selectPreviousVerse,
  ImmutableVerseNode,
} from "../../nodes/usj";
import { ViewOptions } from "../../views/view-options.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { createDOMRange } from "@lexical/selection";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
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

/**
 * Pixel tolerance when comparing caret position to the first/last visual line of verse content
 * (DOM rects). Slightly larger than zero to absorb subpixel rounding and layout quirks.
 */
const LINE_TOLERANCE_PX = 3;

/**
 * Returns whether custom ArrowUp/ArrowDown verse navigation should run.
 *
 * Vertical verse jumps are only needed when Lexical's default move would leave the caret on the
 * wrong line for verse/BCV resolution (e.g. element selection on a paragraph), or when crossing
 * to the next/previous verse. If we always intercept ArrowUp/Down, we steal normal line-by-line
 * movement inside a verse. So we only run custom verse navigation when the caret is on the first or
 * last visual line of the current verse's block content, or when the anchor is an element point
 * (WEB-style verse paragraphs). If layout is unavailable, returns `true` so verse navigation can
 * still be attempted.
 *
 * @param editor - Editor used to map Lexical nodes to DOM ranges.
 * @param selection - The current collapsed range selection.
 * @param direction - `"up"` checks the first line of the verse; `"down"` checks the last line.
 * @returns `true` if verse navigation should be attempted; `false` to let Lexical handle the key.
 */
function $shouldAttemptVerticalVerseNavigation(
  editor: LexicalEditor,
  selection: RangeSelection,
  direction: "up" | "down",
): boolean {
  if (selection.anchor.type === "element") {
    return true;
  }

  const currentVerse = $resolveVerseNode(selection.anchor.getNode(), selection);
  if (!currentVerse) {
    return true;
  }

  const verseNode = currentVerse as LexicalNode;
  const parent = verseNode.getParent();
  if (!parent || !$isElementNode(parent)) {
    return true;
  }

  const contentNodes: LexicalNode[] = [];
  const startIdx = verseNode.getIndexWithinParent();
  const children = parent.getChildren();
  for (let i = startIdx; i < children.length; i++) {
    const c = children[i];
    if (i > startIdx && $isSomeVerseNode(c)) {
      break;
    }
    contentNodes.push(c);
  }

  const verseDomRange = $createDomRangeForVerseContent(editor, contentNodes);
  if (!verseDomRange) {
    return true;
  }

  const rects =
    typeof verseDomRange.getClientRects === "function"
      ? Array.from(verseDomRange.getClientRects())
      : [];
  if (rects.length === 0) {
    return true;
  }

  const caretDomRange = createDOMRange(
    editor,
    selection.anchor.getNode(),
    selection.anchor.offset,
    selection.focus.getNode(),
    selection.focus.offset,
  );
  if (!caretDomRange) {
    return true;
  }

  if (typeof caretDomRange.getBoundingClientRect !== "function") {
    return true;
  }
  const caretRect = caretDomRange.getBoundingClientRect();

  if (direction === "down") {
    let maxBottom = rects[0].bottom;
    for (let i = 1; i < rects.length; i++) {
      if (rects[i].bottom > maxBottom) maxBottom = rects[i].bottom;
    }
    return caretRect.bottom >= maxBottom - LINE_TOLERANCE_PX;
  }

  let minTop = rects[0].top;
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].top < minTop) minTop = rects[i].top;
  }
  return caretRect.top <= minTop + LINE_TOLERANCE_PX;
}

/** DFS text nodes under `node` only (not past its subtree; unlike `$dfs(node)` alone). */
function $collectTextNodesInSubtree(node: LexicalNode, out: TextNode[]): void {
  if ($isTextNode(node)) {
    out.push(node);
    return;
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectTextNodesInSubtree(child, out);
    }
  }
}

/**
 * Builds a DOM range spanning the verse's in-paragraph content in document order, for
 * `Range.prototype.getClientRects()` line-boundary checks.
 *
 * Prefers a range from the first to the last text node under the given nodes (in DFS order). If
 * there are no text nodes, falls back to a range from the first to the last supplied node using
 * text length or element child count for the end offset.
 *
 * @param editor - Editor used to resolve Lexical nodes to DOM.
 * @param nodes - Sibling nodes from the current verse through the next verse marker (exclusive).
 * @returns A DOM `Range`, or `null` if a range cannot be constructed.
 */
function $createDomRangeForVerseContent(editor: LexicalEditor, nodes: LexicalNode[]): Range | null {
  if (nodes.length === 0) {
    return null;
  }

  const textNodes: TextNode[] = [];
  for (const n of nodes) {
    $collectTextNodesInSubtree(n, textNodes);
  }

  if (textNodes.length > 0) {
    const first = textNodes[0];
    const last = textNodes[textNodes.length - 1];
    return createDOMRange(editor, first, 0, last, last.getTextContentSize());
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  let endOffset = 0;
  if ($isTextNode(last)) {
    endOffset = last.getTextContentSize();
  } else if ($isElementNode(last)) {
    endOffset = last.getChildrenSize();
  }
  return createDOMRange(editor, first, 0, last, endOffset);
}

/**
 * Registers arrow-key handling for USJ scripture: verse-to-verse vertical movement when needed,
 * and horizontal movement around notes and chapter boundaries.
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

      if (event.key === "ArrowUp") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        if (!$shouldAttemptVerticalVerseNavigation(editor, selection, "up")) return false;
        const isHandled = $selectPreviousVerse(selection);
        if (isHandled) event.preventDefault();
        return isHandled;
      }
      if (event.key === "ArrowDown") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        if (!$shouldAttemptVerticalVerseNavigation(editor, selection, "down")) return false;
        const isHandled = $selectNextVerse(selection);
        if (isHandled) event.preventDefault();
        return isHandled;
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
      nextNode.getParent()?.getNextSibling()?.selectStart();
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
