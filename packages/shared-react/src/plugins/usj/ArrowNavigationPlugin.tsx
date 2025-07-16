import { $isImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
  $isImmutableChapterNode,
  ImmutableChapterNode,
} from "shared/nodes/usj/ImmutableChapterNode";
import { $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $getNextNode, $getPreviousNode } from "shared/nodes/usj/node.utils";
import { $isNoteNode, NoteNode } from "shared/nodes/usj/NoteNode";
import { $isParaNode } from "shared/nodes/usj/ParaNode";

/**
 * This plugin handles arrow key navigation in the editor, specifically for moving between chapter
 * and verse nodes. It ensures that when the user presses the arrow keys, the selection moves to the
 * next or previous chapter or verse node, depending on the direction of the arrow key pressed.
 */
export function ArrowNavigationPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useArrowKeys(editor);
  return null;
}

/**
 * When moving with arrow keys, it handles navigation around adjacent verse and note nodes.
 * It also handles not moving if a chapter node is the only thing at the beginning.
 * @param editor - The LexicalEditor instance used to access the DOM.
 */
function useArrowKeys(editor: LexicalEditor) {
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
        isHandled = $handleBackwardNavigation(selection);
      }

      if (isHandled) event.preventDefault();
      return isHandled;
    };

    return editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH);
  }, [editor]);
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

// Helper to handle forward arrow key navigation logic
function $handleForwardNavigation(selection: RangeSelection): boolean {
  const nextNode = $getNextNode(selection);
  if (!$isImmutableChapterNode(nextNode) && !$isImmutableVerseNode(nextNode)) return false;

  const anchorNode = selection.anchor.getNode();
  if ($isParaNode(anchorNode) || $isImpliedParaNode(anchorNode)) {
    const isSelectionAtParaEnd = selection.anchor.offset === anchorNode.getChildrenSize();
    if (isSelectionAtParaEnd) return false;
  } else {
    const isSelectionAtNodeEnd = selection.anchor.offset === anchorNode.getTextContentSize();
    if (!isSelectionAtNodeEnd) return false;
  }

  const nodeAfterChapterOrVerse = nextNode.getNextSibling();
  if (!$isNoteNode(nodeAfterChapterOrVerse)) return false;

  const nodeAfterNote = nodeAfterChapterOrVerse.getNextSibling();
  if (nodeAfterNote) nodeAfterNote.selectStart();
  else nodeAfterChapterOrVerse.selectEnd();
  return true;
}

// Helper to handle backward arrow key navigation logic
function $handleBackwardNavigation(selection: RangeSelection): boolean {
  const prevNode = $getPreviousNode(selection);
  // If a chapter node is the only thing at the beginning then don't move.
  if ($isImmutableChapterNode(prevNode) && !prevNode.getPreviousSibling()) return true;

  if (!$isNoteNode(prevNode)) return false;

  const isSelectionAtNodeStart = selection.anchor.offset === 0;
  const nodeBeforeNote = prevNode.getPreviousSibling();
  if (!$isImmutableVerseNode(nodeBeforeNote) || !isSelectionAtNodeStart) return false;

  nodeBeforeNote.selectStart();
  return true;
}
