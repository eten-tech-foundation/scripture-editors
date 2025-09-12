import {
  $isImmutableNoteCallerNode,
  $isImmutableVerseNode,
  ImmutableVerseNode,
} from "../../nodes/usj";
import { ViewOptions } from "../../views/view-options.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  LexicalEditor,
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

/**
 * This plugin handles arrow key navigation in the editor, specifically for moving between chapter
 * and verse nodes. It ensures that when the user presses the arrow keys, the selection moves to the
 * next or previous chapter or verse node, depending on the direction of the arrow key pressed.
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
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

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

    const note = $findMatchingParent(lastChild, (n) => $isNoteNode(n));
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
