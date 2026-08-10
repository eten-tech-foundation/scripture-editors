import {
  $createTextNode,
  $isElementNode,
  $isRootNode,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";
import { CURSOR_PLACEHOLDER_CHAR } from "./constants.js";
import { CursorData, CursorPosition } from "./CursorSelectionContext.js";

export function $createCursorPlaceholderNode() {
  return $createTextNode(CURSOR_PLACEHOLDER_CHAR);
}

export function $insertCursorPlaceholder(
  node: LexicalNode,
  position: CursorPosition.Start | CursorPosition.End,
  restoreSelection = false,
) {
  const cursorPlaceholderNode = $createCursorPlaceholderNode();
  if (position === CursorPosition.Start) node.insertBefore(cursorPlaceholderNode, restoreSelection);
  else node.insertAfter(cursorPlaceholderNode, restoreSelection);
  return cursorPlaceholderNode;
}

export function $removeCursorPlaceholder(node: TextNode) {
  const textContent = node.getTextContent();
  node.setTextContent(textContent.replaceAll(CURSOR_PLACEHOLDER_CHAR, ""));
}

/**
 * Whether `text` is a bare cursor host: non-empty but made up entirely of placeholder characters.
 * A zero-width space embedded in real text (e.g. a Thai/Khmer line break) is NOT placeholder-only,
 * so it is preserved. State consumers (serializers, OT positions, content indexes) use this to
 * treat a transient host as if it were not there.
 */
export function isCursorPlaceholderOnly(text: string): boolean {
  // Fast path: the common case (no placeholder at all) short-circuits before any allocation, so
  // this stays cheap when called per text node in serialization hot paths.
  return (
    text.length > 0 &&
    text.includes(CURSOR_PLACEHOLDER_CHAR) &&
    text.replaceAll(CURSOR_PLACEHOLDER_CHAR, "") === ""
  );
}

/** Whether `node` is a text node holding only cursor placeholder(s) — see {@link isCursorPlaceholderOnly}. */
export function $isCursorPlaceholderOnlyText(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return $isTextNode(node) && isCursorPlaceholderOnly(node.getTextContent());
}

export function $getValidAncestor(
  node: LexicalNode,
  cursor: CursorData,
  canHavePlaceholder: (node: LexicalNode) => boolean,
) {
  const ancestor = node.getParent();
  if (!ancestor || !$isElementNode(ancestor) || !ancestor.isInline()) {
    return { ancestor: null, ancestorSibling: null };
  }

  const ancestorParent = ancestor.getParent();
  if (!ancestorParent || $isRootNode(ancestorParent)) {
    return { ancestor: null, ancestorSibling: null };
  }

  const parentCanHavePlaceholder = canHavePlaceholder(ancestorParent);
  const canHavePlaceholderAsSibling = cursor.isMovingRight
    ? ancestor.canInsertTextAfter()
    : ancestor.canInsertTextBefore();

  const canInsert = parentCanHavePlaceholder && canHavePlaceholderAsSibling;

  const ancestorSibling = cursor.isMovingRight
    ? ancestor.getNextSibling()
    : ancestor.getPreviousSibling();

  if (!ancestorSibling && !canInsert) {
    return $getValidAncestor(ancestor, cursor, canHavePlaceholder);
  }

  if ($isTextNode(ancestorSibling) && !canInsert) {
    return { ancestor: null, ancestorSibling: null };
  }

  return { ancestor, ancestorSibling };
}

export function $findDescendantEligibleForPlaceholder(
  node: LexicalNode,
  cursor: CursorData,
  canHavePlaceholder: (node: LexicalNode) => boolean,
): LexicalNode | null {
  if (canHavePlaceholder(node)) {
    return node;
  }
  if ($isElementNode(node)) {
    const child = cursor.isMovingRight ? node.getFirstChild() : node.getLastChild();
    if (child) {
      return $findDescendantEligibleForPlaceholder(child, cursor, canHavePlaceholder);
    }
  }
  return null;
}
