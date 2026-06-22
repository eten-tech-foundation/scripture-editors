import { $isSomeVerseNode } from "../../nodes/usj";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  BaseSelection,
  LexicalNode,
} from "lexical";
import { $isSomeParaNode } from "shared";

/** Editing operations that can alter block structure. */
export type EditIntent = "insertParagraph" | "deleteBackward" | "deleteForward" | "insertText";

/**
 * Maps a keydown to the structural edit it would cause, or undefined for non-editing keys.
 * Deliberately does NOT early-return on Alt/Ctrl/Meta for Backspace/Delete — Alt/Cmd+Backspace
 * (delete-word / delete-line) are destructive and must be classified as deletions (spec B1).
 */
export function keyDownToIntent(event: KeyboardEvent): EditIntent | undefined {
  if (event.key === "Enter" && !event.shiftKey) return "insertParagraph";
  if (event.key === "Backspace") return "deleteBackward";
  if (event.key === "Delete") return "deleteForward";
  // Printable character with no command modifier. Alt allowed (special chars on some layouts).
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) return "insertText";
  return undefined;
}

/** Returns the paragraph (ParaNode or ImpliedParaNode) that contains `node`, if any. */
function $getParaAncestor(node: LexicalNode | null | undefined): LexicalNode | undefined {
  if (!node) return undefined;
  if ($isSomeParaNode(node)) return node;
  const para = $findMatchingParent(node, (n: LexicalNode) => $isSomeParaNode(n));
  return para ?? undefined;
}

/** True when the selection covers more than one paragraph block. */
export function $selectionSpansBlockBoundary(selection: BaseSelection): boolean {
  if (!$isRangeSelection(selection)) return false;
  const paraKeys = new Set<string>();
  for (const node of selection.getNodes()) {
    const para = $getParaAncestor(node);
    if (para) paraKeys.add(para.getKey());
  }
  if (paraKeys.size > 1) return true;
  // Fall back to the endpoints in case getNodes() collapsed to a single inline node.
  const anchorPara = $getParaAncestor(selection.anchor.getNode());
  const focusPara = $getParaAncestor(selection.focus.getNode());
  return !!anchorPara && !!focusPara && anchorPara.getKey() !== focusPara.getKey();
}

/** True when the selection includes any verse marker node. */
export function $selectionContainsVerseMarker(selection: BaseSelection): boolean {
  if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) return false;
  return selection.getNodes().some((n) => $isSomeVerseNode(n));
}

/** True when a collapsed caret sits at the very start of its paragraph. */
export function $caretAtParaStart(selection: BaseSelection): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const { anchor } = selection;
  const node = anchor.getNode();
  const para = $getParaAncestor(node);
  if (!para) return false;
  if (anchor.offset !== 0) return false;
  // No content between the caret and the paragraph start.
  let current: LexicalNode | null = node;
  while (current && current.getKey() !== para.getKey()) {
    if (current.getPreviousSibling()) return false;
    current = current.getParent();
  }
  return true;
}

/** True when a collapsed caret sits at the very end of its paragraph. */
export function $caretAtParaEnd(selection: BaseSelection): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const { anchor } = selection;
  const node = anchor.getNode();
  const para = $getParaAncestor(node);
  if (!para) return false;
  if ($isElementNode(node)) {
    if (anchor.offset !== node.getChildrenSize()) return false;
  } else if (anchor.offset !== node.getTextContentSize()) {
    return false;
  }
  let current: LexicalNode | null = node;
  while (current && current.getKey() !== para.getKey()) {
    if (current.getNextSibling()) return false;
    current = current.getParent();
  }
  return true;
}

/** True when the node immediately before/after a collapsed caret is a verse marker. */
export function $caretAdjacentToVerseMarker(
  selection: BaseSelection,
  direction: "backward" | "forward",
): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const { anchor } = selection;
  const node = anchor.getNode();
  if (anchor.type === "element" && $isElementNode(node)) {
    const children = node.getChildren();
    const idx = direction === "backward" ? anchor.offset - 1 : anchor.offset;
    if (idx < 0) return false;
    return $isSomeVerseNode(children[idx]);
  }
  if (direction === "backward") {
    if (anchor.offset !== 0) return false;
    return $isSomeVerseNode(node.getPreviousSibling());
  }
  if (anchor.offset !== node.getTextContentSize()) return false;
  return $isSomeVerseNode(node.getNextSibling());
}

/** True when the paragraph holding the caret has a preceding block sibling. */
function $hasNeighborBlock(selection: BaseSelection, direction: "backward" | "forward"): boolean {
  if (!$isRangeSelection(selection)) return false;
  const para = $getParaAncestor(selection.anchor.getNode());
  if (!para) return false;
  return !!(direction === "backward" ? para.getPreviousSibling() : para.getNextSibling());
}

/**
 * Rule 1 (all input vectors): block when the current selection spans a block boundary or
 * touches a verse marker. Used by paste/cut/drop/IME guards.
 */
export function $shouldBlockSelectionReplacement(): boolean {
  const selection = $getSelection();
  if (!selection) return false;
  return $selectionContainsVerseMarker(selection) || $selectionSpansBlockBoundary(selection);
}

/** Full keyboard decision: combines Rule 1 with collapsed-caret structural rules. */
export function $shouldBlockStructuralEdit(intent: EditIntent): boolean {
  const selection = $getSelection();
  if (!selection) return false;
  if ($selectionContainsVerseMarker(selection) || $selectionSpansBlockBoundary(selection)) {
    return true;
  }
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  switch (intent) {
    case "insertParagraph":
      return true;
    case "deleteBackward":
      return (
        ($caretAtParaStart(selection) && $hasNeighborBlock(selection, "backward")) ||
        $caretAdjacentToVerseMarker(selection, "backward")
      );
    case "deleteForward":
      return (
        ($caretAtParaEnd(selection) && $hasNeighborBlock(selection, "forward")) ||
        $caretAdjacentToVerseMarker(selection, "forward")
      );
    case "insertText":
      return false;
  }
}
