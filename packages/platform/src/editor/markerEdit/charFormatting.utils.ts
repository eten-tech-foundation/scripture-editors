/**
 * Ctrl+Space strips character formatting (design spec §5.5; PT9
 * KeyPressEditHandler.HandleCtrlSpace applies the blank character style).
 */

import { $unwrapCharNode } from "./markerEditDeletion.utils";
import { $createTextNode, $getSelection, $isRangeSelection, $isTextNode, TextNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $isCharNode,
  $isMarkerNode,
  CharNode,
  NBSP,
} from "shared";

/**
 * Split `char` before offset `offset` of its content text node `textNode`;
 * returns the new right-hand span (with fresh opener/closer glyphs).
 */
function $splitCharNodeAt(char: CharNode, textNode: TextNode, offset: number): CharNode {
  const marker = char.getMarker();
  const right = $createCharNode(marker, char.getUnknownAttributes());
  const rightOpener = $createMarkerNode(marker);
  const rightChildren: TextNode[] = [];

  let splitPoint: TextNode | undefined;
  if (offset > 0 && offset < textNode.getTextContentSize()) {
    const [, after] = textNode.splitText(offset) as [TextNode, TextNode];
    splitPoint = after;
  } else if (offset === 0) {
    splitPoint = textNode;
  }
  // move splitPoint and everything after it (except the closer glyph) to the right span
  const children = char.getChildren();
  const startIndex = splitPoint ? children.findIndex((c) => c.is(splitPoint)) : -1;
  const hasCloser = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing");
  if (startIndex >= 0) {
    for (const child of children.slice(startIndex)) {
      if ($isMarkerNode(child) && child.getMarkerSyntax() === "closing") continue;
      if ($isTextNode(child)) rightChildren.push(child);
    }
  }
  if (rightChildren.length > 0) {
    // structural NBSP prefix for the right span's first text
    const first = rightChildren[0];
    if (!first.getTextContent().startsWith(NBSP))
      first.setTextContent(NBSP + first.getTextContent());
    right.append(rightOpener, ...rightChildren);
    if (hasCloser) right.append($createMarkerNode(marker, "closing"));
    char.insertAfter(right);
  }
  return right;
}

export function $removeCharFormattingFromSelection(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  if (selection.isCollapsed()) {
    const anchorNode = selection.anchor.getNode();
    const char = $isCharNode(anchorNode.getParent()) ? anchorNode.getParent() : undefined;
    if (char && $isCharNode(char) && $isTextNode(anchorNode) && !$isMarkerNode(anchorNode)) {
      const offset = selection.anchor.offset;
      const content = anchorNode.getTextContent();
      // PT9 (HandleCtrlSpace) never inserts a second space next to one that's
      // already there — the caret just moves past it. Checking this *before*
      // splitting matters: splitting always manufactures a fresh opener/closer
      // pair at the boundary, which would inject marker-glyph text between the
      // two halves even when nothing about the styling actually changed.
      if (offset < content.length) {
        if (content[offset] === " ") {
          anchorNode.select(offset + 1, offset + 1);
          return true;
        }
        const right = $splitCharNodeAt(char, anchorNode, offset);
        const space = $createTextNode(" ");
        char.insertAfter(space);
        // drop halves emptied by the split (only glyphs left)
        [char, right].forEach((span) => {
          const spanContent = span
            .getChildren()
            .filter((c) => $isTextNode(c) && !$isMarkerNode(c))
            .map((c) => c.getTextContent().replace(NBSP, ""))
            .join("");
          if (spanContent === "") span.remove();
        });
        space.select(1, 1);
        return true;
      }
      // Caret at the span's content end: no split needed (the right half would
      // be empty and get dropped anyway) — same next-space reuse check, this
      // time against the span's next sibling.
      const nextSibling = char.getNextSibling();
      if (
        $isTextNode(nextSibling) &&
        !$isMarkerNode(nextSibling) &&
        nextSibling.getTextContent().startsWith(" ")
      ) {
        nextSibling.select(1, 1);
        return true;
      }
      const space = $createTextNode(" ");
      char.insertAfter(space);
      space.select(1, 1);
      return true;
    }
    // PT9 inserts-and-clears exactly one space — reusing the next char when it
    // is already a space (caret just moves past it, nothing is inserted).
    if ($isTextNode(anchorNode) && anchorNode.getTextContent()[selection.anchor.offset] === " ") {
      anchorNode.select(selection.anchor.offset + 1, selection.anchor.offset + 1);
      return true;
    }
    selection.insertText(" ");
    return true;
  }

  // Range: unwrap fully covered spans; split partially covered ones at the boundary.
  const anchorPoint = selection.isBackward() ? selection.focus : selection.anchor;
  const focusPoint = selection.isBackward() ? selection.anchor : selection.focus;
  const selectedNodes = selection.getNodes();
  const chars = new Set<CharNode>();
  for (const node of selectedNodes) {
    const parent = node.getParent();
    if ($isCharNode(node)) chars.add(node);
    else if ($isCharNode(parent)) chars.add(parent);
  }
  for (const char of chars) {
    const startNode = anchorPoint.getNode();
    const endNode = focusPoint.getNode();
    if ($isTextNode(startNode) && startNode.getParent()?.is(char) && anchorPoint.offset > 0) {
      // selection starts mid-span: keep the left part styled, unwrap the right
      const right = $splitCharNodeAt(char, startNode, anchorPoint.offset);
      $unwrapCharNode(right);
      continue;
    }
    if (
      $isTextNode(endNode) &&
      endNode.getParent()?.is(char) &&
      endNode.getTextContentSize() > focusPoint.offset
    ) {
      // selection ends mid-span: unwrap the left part, keep the right styled
      const right = $splitCharNodeAt(char, endNode, focusPoint.offset);
      void right; // right keeps the style
      $unwrapCharNode(char);
      continue;
    }
    $unwrapCharNode(char);
  }
  return chars.size > 0;
}
