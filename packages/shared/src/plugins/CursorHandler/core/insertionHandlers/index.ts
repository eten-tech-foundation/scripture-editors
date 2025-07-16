import { mergeRegister } from "@lexical/utils";
import {
  $createRangeSelection,
  $getSelection,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $getCursorSelectionContext,
  CursorData,
  CursorPosition,
} from "../utils/CursorSelectionContext";
import { $insertCursorPlaceholder, $removeCursorPlaceholder } from "../utils";
import { CharSelectionOffset, CursorMovementDirection } from "../utils/constants";
import { $handleNoSibling } from "./noSibling";
import { $handleSiblingNode } from "./sibling";

export function registerCursorInsertion(
  editor: LexicalEditor,
  canHavePlaceholder: (node: LexicalNode) => boolean = () => true,
  editorUpdate: (update: (() => void) | (() => void), tag?: string) => void,
) {
  const unregisterInsertionHandlers = mergeRegister(
    registerCursorInsertOnArrowDown(CursorMovementDirection.RIGHT),
    registerCursorInsertOnArrowDown(CursorMovementDirection.LEFT),
  );

  function registerCursorInsertOnArrowDown(
    direction: CursorMovementDirection.LEFT | CursorMovementDirection.RIGHT,
  ): () => void {
    //TODO: Test for RTL direction
    const command =
      direction === CursorMovementDirection.LEFT ? KEY_ARROW_LEFT_COMMAND : KEY_ARROW_RIGHT_COMMAND;

    return editor.registerCommand(
      command,
      (event) => {
        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return false;
        }
        const result = $handleArrowCommand(direction);
        if (result) {
          event.preventDefault();
        }
        return result;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }

  function $handleArrowCommand(
    direction: CursorMovementDirection.LEFT | CursorMovementDirection.RIGHT,
  ): boolean {
    const selectionData = $getCursorSelectionContext($getSelection(), direction);
    if (!selectionData) return false;
    const { node: currentNode, cursor, content } = selectionData;

    if (!canHavePlaceholder(currentNode)) return false;

    if (cursor.isPlaceholder) {
      const isHandled = $handleExistingPlaceholder(currentNode, cursor, content);
      if (isHandled) return true;
    }

    if (cursor.position === CursorPosition.Middle || cursor.isMovingAwayFromEdge) {
      return false;
    }

    if (cursor.isMovingTowardsEdge) {
      return $handleMovingTowardsEdge(currentNode, cursor);
    }

    if (cursor.isSwitchingEdge) {
      return $handleSwitchingEdge(currentNode, cursor);
    }

    const siblingNode = getSiblingNode(currentNode, cursor);
    if (!siblingNode) {
      return $handleNoSibling(currentNode, cursor, editorUpdate, canHavePlaceholder);
    }

    return $handleSiblingNode(siblingNode, cursor, editorUpdate, canHavePlaceholder);
  }

  function $handleExistingPlaceholder(
    currentNode: TextNode,
    cursor: CursorData,
    content: { isEmpty: boolean },
  ): boolean {
    if (cursor.isMovingAwayFromEdge) {
      editorUpdate(() => {
        $removeCursorPlaceholder(currentNode);
        const newOffset = cursor.isMovingLeft ? cursor.offset - 1 : cursor.offset + 1;
        const selection = $createRangeSelection();
        selection.anchor.set(currentNode.getKey(), newOffset, "text");
        selection.focus.set(currentNode.getKey(), newOffset, "text");
        $setSelection(selection);
      });
      return true;
    }

    editorUpdate(() => {
      if (content.isEmpty) {
        currentNode.setTextContent("");
      } else {
        $removeCursorPlaceholder(currentNode);
      }
    });
    return false;
  }

  function $handleMovingTowardsEdge(currentNode: LexicalNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingLeft ? CursorPosition.Start : CursorPosition.End;
      const selectOffset = cursor.isMovingLeft
        ? CharSelectionOffset.AFTER
        : CharSelectionOffset.BEFORE;
      const cursorPlaceholderNode = $insertCursorPlaceholder(currentNode, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function $handleSwitchingEdge(currentNode: LexicalNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingRight ? CursorPosition.End : CursorPosition.Start;
      const selectOffset = cursor.isMovingRight
        ? CharSelectionOffset.BEFORE
        : CharSelectionOffset.AFTER;
      const cursorPlaceholderNode = $insertCursorPlaceholder(currentNode, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function getSiblingNode(currentNode: LexicalNode, cursor: CursorData): LexicalNode | null {
    return cursor.isMovingRight ? currentNode.getNextSibling() : currentNode.getPreviousSibling();
  }

  return unregisterInsertionHandlers;
}
