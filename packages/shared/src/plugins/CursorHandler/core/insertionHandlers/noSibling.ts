import { $isElementNode, $isTextNode, ElementNode, LexicalNode, TextNode } from "lexical";
import { CursorData, CursorPosition } from "../utils/CursorSelectionContext";
import { CharSelectionOffset } from "../utils/constants";
import {
  $findDescendantEligibleForPlaceholder,
  $getValidAncestor,
  $insertCursorPlaceholder,
} from "../utils";

export function $handleNoSibling(
  currentNode: LexicalNode,
  cursor: CursorData,
  editorUpdate: (update: (() => void) | (() => void), tag?: string) => void,
  canHavePlaceholder: (node: LexicalNode) => boolean,
): boolean {
  const $handle = () => {
    const { ancestor, ancestorSibling } = $getValidAncestor(
      currentNode,
      cursor,
      canHavePlaceholder,
    );

    if (!ancestor && !ancestorSibling) {
      return false;
    }

    if (!ancestorSibling) {
      return $handleAncestorWithoutSibling(ancestor, cursor);
    }

    if ($isTextNode(ancestorSibling)) {
      return $handleTextAncestorSibling(ancestorSibling, cursor);
    }

    if ($isElementNode(ancestorSibling)) {
      return $handleElementAncestorSibling(ancestor, ancestorSibling, cursor);
    }

    return false;
  };

  function $handleAncestorWithoutSibling(ancestor: ElementNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingLeft ? CursorPosition.Start : CursorPosition.End;
      const selectOffset = cursor.isMovingLeft
        ? CharSelectionOffset.BEFORE
        : CharSelectionOffset.AFTER;
      const cursorPlaceholderNode = $insertCursorPlaceholder(ancestor, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function $handleTextAncestorSibling(ancestorSibling: TextNode, cursor: CursorData): boolean {
    editorUpdate(() => {
      const cursorPosition = cursor.isMovingLeft ? CursorPosition.End : CursorPosition.Start;
      const selectOffset = cursor.isMovingLeft
        ? CharSelectionOffset.BEFORE
        : CharSelectionOffset.AFTER;
      const cursorPlaceholderNode = $insertCursorPlaceholder(ancestorSibling, cursorPosition);
      cursorPlaceholderNode.select(selectOffset, selectOffset);
    });
    return true;
  }

  function $handleElementAncestorSibling(
    ancestor: ElementNode,
    ancestorSibling: ElementNode,
    cursor: CursorData,
  ): boolean {
    const nodeParent = ancestorSibling.getParent();
    if (nodeParent && canHavePlaceholder(nodeParent)) {
      editorUpdate(() => {
        const cursorPosition = cursor.isMovingRight ? CursorPosition.End : CursorPosition.Start;
        const cursorPlaceholderNode = $insertCursorPlaceholder(ancestor, cursorPosition, false);
        cursorPlaceholderNode.select(1, 1);
      });
      return true;
    }

    const targetNode = $findDescendantEligibleForPlaceholder(
      ancestorSibling,
      cursor,
      canHavePlaceholder,
    );
    if (!targetNode) return false;

    editorUpdate(() => {
      const cursorPosition = cursor.isMovingRight ? CursorPosition.Start : CursorPosition.End;
      const placeholder = $insertCursorPlaceholder(targetNode, cursorPosition, false);
      placeholder.select(1, 1);
    });
    return true;
  }

  return $handle();
}
