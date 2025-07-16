import type { ElementNode, LexicalNode, TextNode } from "lexical";
import { $isElementNode, $isTextNode } from "lexical";
import { CursorData, CursorPosition } from "../utils/CursorSelectionContext";
import {
  $createCursorPlaceholderNode,
  $findDescendantEligibleForPlaceholder,
  $insertCursorPlaceholder,
} from "../utils";
import { CharSelectionOffset } from "../utils/constants";

export function $handleSiblingNode(
  siblingNode: LexicalNode,
  cursor: CursorData,
  editorUpdate: (update: (() => void) | (() => void), tag?: string) => void,
  canHavePlaceholder: (node: LexicalNode) => boolean = () => true,
): boolean {
  const $handle = () => {
    if (!canHavePlaceholder(siblingNode)) {
      return $handleNonPlaceholderSibling(siblingNode, cursor);
    }

    if ($isTextNode(siblingNode) && cursor.isMovingOutwards) {
      return $handleTextSibling(siblingNode, cursor);
    }

    if ($isElementNode(siblingNode)) {
      return $handleElementSibling(siblingNode, cursor);
    }

    console.warn("UNHANDLED CURSOR HELPER CASE");
    return false;
  };

  function $handleNonPlaceholderSibling(siblingNode: LexicalNode, cursor: CursorData): boolean {
    const eligibleDescendant = $findDescendantEligibleForPlaceholder(
      siblingNode,
      cursor,
      canHavePlaceholder,
    );
    if (!eligibleDescendant) return false;

    if ($isTextNode(eligibleDescendant) && cursor.isMovingOutwards) {
      return $handleTextDescendant(eligibleDescendant, cursor);
    }

    if ($isElementNode(eligibleDescendant)) {
      return $handleElementSibling(eligibleDescendant, cursor);
    }

    return true;
  }

  function $handleTextSibling(siblingNode: TextNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingToNextNode ? CursorPosition.Start : CursorPosition.End;
      const selectOffset = cursor.isMovingToNextNode
        ? CharSelectionOffset.AFTER
        : CharSelectionOffset.BEFORE;
      const cursorPlaceholderNode = $insertCursorPlaceholder(siblingNode, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function $handleTextDescendant(descendant: TextNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingToNextNode ? CursorPosition.Start : CursorPosition.End;
      const selectOffset = cursor.isMovingToNextNode
        ? CharSelectionOffset.AFTER
        : CharSelectionOffset.BEFORE;
      const cursorPlaceholderNode = $insertCursorPlaceholder(descendant, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function $handleElementSibling(siblingNode: ElementNode, cursor: CursorData): boolean {
    if (siblingNode.isInline()) {
      if (siblingNode.isEmpty()) {
        editorUpdate(() => {
          const cursorPlaceholderNode = $createCursorPlaceholderNode();
          siblingNode.append(cursorPlaceholderNode);
          cursorPlaceholderNode.select(1, 1);
        });
        return true;
      } else {
        editorUpdate(() => {
          const targetChild = cursor.isMovingRight
            ? siblingNode.getFirstChild()
            : siblingNode.getLastChild();
          if (!targetChild) return;

          const cursorPosition = cursor.isMovingRight ? CursorPosition.Start : CursorPosition.End;
          const selectOffset = cursor.isMovingRight
            ? CharSelectionOffset.AFTER
            : CharSelectionOffset.BEFORE;
          const cursorPlaceholderNode = $insertCursorPlaceholder(targetChild, cursorPosition);
          cursorPlaceholderNode.select(selectOffset, selectOffset);
        });
      }
      return true;
    } else {
      //SIBLING IS BLOCK
      return false;
    }
  }

  return $handle();
}
