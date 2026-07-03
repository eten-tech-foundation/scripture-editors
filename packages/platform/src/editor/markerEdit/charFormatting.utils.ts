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
  // Keep any unknown attributes on the LEFT half only (`char`); duplicating them into
  // both halves would double the `|name="value"` bytes on serialization.
  const right = $createCharNode(marker);
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
      // PT9 (HandleCtrlSpace) always splits at the caret, even when a space
      // already sits right there — it just REUSES that space as the plain
      // separator (moved out of the span) instead of inserting a second one.
      if (offset < content.length) {
        const right = $splitCharNodeAt(char, anchorNode, offset);
        // If the split carried an existing space into the right span (as its
        // first content char, after the structural NBSP prefix), strip it
        // there — the plain space inserted below takes its place.
        const rightFirst = right.isAttached()
          ? right.getChildren().find((c) => $isTextNode(c) && !$isMarkerNode(c))
          : undefined;
        if (rightFirst && $isTextNode(rightFirst)) {
          const rightText = rightFirst.getTextContent();
          const prefix = rightText.startsWith(NBSP) ? NBSP : "";
          const body = rightText.slice(prefix.length);
          if (body.startsWith(" ")) rightFirst.setTextContent(prefix + body.slice(1));
        }
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
    const startsMidSpan =
      $isTextNode(startNode) && startNode.getParent()?.is(char) && anchorPoint.offset > 0;
    const endsMidSpan =
      $isTextNode(endNode) &&
      endNode.getParent()?.is(char) &&
      endNode.getTextContentSize() > focusPoint.offset;
    if (startsMidSpan && endsMidSpan) {
      // selection starts and ends mid-span, both inside this same char: PT9
      // (StyleApplicator blank-style on an interior range) yields three segments —
      // left styled, middle plain, right (tail) styled. Split the END boundary
      // first: that leaves the START boundary's (node, offset) — which may be the
      // very same text node as the end's — still valid for the second split.
      const tail = $splitCharNodeAt(char, endNode, focusPoint.offset);
      void tail; // tail keeps the style
      const middle = $splitCharNodeAt(char, startNode, anchorPoint.offset);
      $unwrapCharNode(middle);
      continue;
    }
    if (startsMidSpan) {
      // selection starts mid-span: keep the left part styled, unwrap the right
      const right = $splitCharNodeAt(char, startNode, anchorPoint.offset);
      $unwrapCharNode(right);
      continue;
    }
    if (endsMidSpan) {
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
