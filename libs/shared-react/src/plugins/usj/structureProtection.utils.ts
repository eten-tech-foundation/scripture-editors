import { $isSomeVerseNode, SomeVerseNode } from "../../nodes/usj";
import { $findMatchingParent } from "@lexical/utils";
import {
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  BaseSelection,
  ElementNode,
  LexicalNode,
  NodeKey,
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
  return paraKeys.size > 1;
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

/**
 * The verse marker immediately before/after a collapsed caret, or undefined.
 * Node-returning sibling of `$caretAdjacentToVerseMarker`.
 */
export function $adjacentVerseMarker(
  selection: BaseSelection,
  direction: "backward" | "forward",
): SomeVerseNode | undefined {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const { anchor } = selection;
  const node = anchor.getNode();
  if (anchor.type === "element" && $isElementNode(node)) {
    const children = node.getChildren();
    const idx = direction === "backward" ? anchor.offset - 1 : anchor.offset;
    if (idx < 0) return undefined;
    const candidate = children[idx];
    return $isSomeVerseNode(candidate) ? candidate : undefined;
  }
  if (direction === "backward") {
    if (anchor.offset !== 0) return undefined;
    const prev = node.getPreviousSibling();
    return $isSomeVerseNode(prev) ? prev : undefined;
  }
  if (anchor.offset !== node.getTextContentSize()) return undefined;
  const next = node.getNextSibling();
  return $isSomeVerseNode(next) ? next : undefined;
}

/** True when the paragraph holding the caret has a preceding block sibling. */
function $hasNeighborBlock(selection: BaseSelection, direction: "backward" | "forward"): boolean {
  if (!$isRangeSelection(selection)) return false;
  const para = $getParaAncestor(selection.anchor.getNode());
  if (!para) return false;
  return !!(direction === "backward" ? para.getPreviousSibling() : para.getNextSibling());
}

/**
 * Rule 1 (all input vectors): block when the given selection spans a block boundary or
 * touches a verse marker. Used by paste/cut/drop/IME guards.
 */
export function $shouldBlockSelectionReplacement(selection: BaseSelection): boolean {
  return $selectionContainsVerseMarker(selection) || $selectionSpansBlockBoundary(selection);
}

/** Full keyboard decision: combines Rule 1 with collapsed-caret structural rules. */
export function $shouldBlockStructuralEdit(selection: BaseSelection, intent: EditIntent): boolean {
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

/** What a structural delete keystroke would act on. */
export type DeleteTarget =
  | { kind: "verse"; node: SomeVerseNode }
  | { kind: "para"; node: ElementNode };

/**
 * The marker/section a delete keystroke would remove at a structural boundary, or undefined
 * when the keystroke is ordinary editing. Mirror of `$shouldBlockStructuralEdit`'s boundary
 * conditions, but resolves the target node instead of returning a boolean.
 *
 * Backward: the adjacent verse, else the current paragraph (when a previous block exists).
 * Forward: the adjacent verse, else the NEXT paragraph (when a next block exists) — the block
 * whose marker the merge removes.
 */
export function $structuralDeleteTarget(
  selection: BaseSelection,
  intent: EditIntent,
): DeleteTarget | undefined {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  if (intent === "deleteBackward") {
    const verse = $adjacentVerseMarker(selection, "backward");
    if (verse) return { kind: "verse", node: verse };
    if ($caretAtParaStart(selection) && $hasNeighborBlock(selection, "backward")) {
      const para = $getParaAncestor(selection.anchor.getNode());
      if (para) return { kind: "para", node: para as ElementNode };
    }
    return undefined;
  }
  if (intent === "deleteForward") {
    const verse = $adjacentVerseMarker(selection, "forward");
    if (verse) return { kind: "verse", node: verse };
    if ($caretAtParaEnd(selection) && $hasNeighborBlock(selection, "forward")) {
      const para = $getParaAncestor(selection.anchor.getNode());
      const next = para?.getNextSibling();
      if ($isElementNode(next)) return { kind: "para", node: next };
    }
    return undefined;
  }
  return undefined;
}

/** A pending two-step delete: the armed target's key, kind, and the intent that armed it. */
export interface ArmedDelete {
  key: NodeKey;
  kind: "verse" | "para";
  intent: "deleteBackward" | "deleteForward";
}

/** True when the live selection still encodes the armed target. */
export function $isArmedSelection(selection: BaseSelection | null, armed: ArmedDelete): boolean {
  if (!selection) return false;
  if (armed.kind === "verse") {
    return $isNodeSelection(selection) && selection.has(armed.key);
  }
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const anchorPara = $getParaAncestor(selection.anchor.getNode());
  const focusPara = $getParaAncestor(selection.focus.getNode());
  return (
    !!anchorPara &&
    anchorPara.getKey() === armed.key &&
    !!focusPara &&
    focusPara.getKey() === armed.key
  );
}

/** Collapses the caret to the end of `node` (end of its text for a TextNode). */
export function $placeCaretAtEnd(node: LexicalNode): void {
  if ($isTextNode(node)) {
    const size = node.getTextContentSize();
    node.select(size, size);
  } else if ($isElementNode(node)) {
    node.selectEnd();
  } else {
    node.selectNext(0, 0);
  }
}

/**
 * Merge-into-previous semantics for a paragraph delete: move `para`'s children into its
 * previous element sibling (which keeps ITS marker), remove `para` (dropping its marker),
 * and place the caret at the junction. Text is never lost. Caller guarantees a previous
 * element sibling exists (checked via `$hasNeighborBlock` when the target was resolved).
 */
export function $mergeParaIntoPrevious(para: ElementNode): void {
  const prev = para.getPreviousSibling();
  if (!$isElementNode(prev)) return;
  const junction = prev.getLastChild();
  const moved = para.getChildren();
  prev.append(...moved);
  para.remove();
  if (junction) $placeCaretAtEnd(junction);
  else if (moved.length > 0) $placeCaretAtEnd(prev);
  else prev.selectStart();
}
