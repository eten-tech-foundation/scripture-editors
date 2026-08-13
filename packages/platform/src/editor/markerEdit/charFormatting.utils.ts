/**
 * Ctrl+Space strips character formatting (PT9
 * KeyPressEditHandler.HandleCtrlSpace applies the blank character style).
 */

import { $unwrapCharNode } from "./markerEditDeletion.utils";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $buildContinuationCharSpan,
  $continuationCharAttributes,
  $createCharNode,
  $isCharNode,
  $isMarkerNode,
  CharNode,
  NBSP,
} from "shared";

/**
 * Split `char` before offset `offset` of its content text node `textNode`; returns the new
 * right-hand span (with fresh opener/closer glyphs). When nothing follows the offset — the
 * caret sits at the span's content end — nothing moves and the returned span is NOT attached
 * to the tree; check `isAttached()` before relying on it.
 *
 * Glyphs are emitted unconditionally, unlike `$liftOutOfChar`'s reopen: every path here is a
 * marker-EDIT operation (Ctrl+Space, the close-tag palette item), and those only run in
 * markerMode "editable" — `MarkerEditPlugin` gates on it and `Editor.tsx` builds the marker menu
 * only there. There is no non-editable caller to render glyph-free for.
 */
export function $splitCharNodeAt(char: CharNode, textNode: TextNode, offset: number): CharNode {
  // The right half is a CONTINUATION of `char`: it keeps `char`'s marker, its `closed` state (an
  // implicitly-closed span splits into two implicitly-closed spans, or the marker-edit engine reads
  // the right half's correct missing closer as deletion damage), and — since it stays in the same
  // parent (`char.insertAfter(right)` below) — its nesting, so its fresh glyphs carry the `+` when
  // `char`'s do. All of that shape is the shared continuation convention (charGlyphs.utils.ts in
  // `shared`); DISPLAY attributes (`|name="value"` bytes) are deliberately not among it, staying on
  // the left half so serialization can't double them.
  const right = $createCharNode(char.getMarker(), $continuationCharAttributes(char));
  const rightChildren: LexicalNode[] = [];

  let splitPoint: LexicalNode | undefined;
  if (offset > 0 && offset < textNode.getTextContentSize()) {
    const [, after] = textNode.splitText(offset) as [TextNode, TextNode];
    splitPoint = after;
  } else if (offset === 0) {
    splitPoint = textNode;
  } else if (offset === textNode.getTextContentSize()) {
    // Caret at this text node's END, but it isn't the span's last content node: the whole tail
    // (any following content sibling — a later text run OR a nested element span) moves to the
    // right span. When it IS the last content node, the next sibling is the closer glyph or
    // nothing, so splitPoint stays undefined and nothing moves — the span is already
    // effectively closed at the caret.
    const next = textNode.getNextSibling();
    if (next && !$isMarkerNode(next)) splitPoint = next;
  }
  // move splitPoint and everything after it (except the closer glyph) to the right span
  const children = char.getChildren();
  const startIndex = splitPoint ? children.findIndex((c) => c.is(splitPoint)) : -1;
  if (startIndex >= 0) {
    // Everything after the split point moves — nested element spans included. Collecting only
    // text nodes stranded a nested char span in the LEFT half while the text around it moved
    // right, scrambling the content's reading order. Only the span's own closer glyph stays
    // (the right span gets a fresh one below).
    for (const child of children.slice(startIndex)) {
      if ($isMarkerNode(child) && child.getMarkerSyntax() === "closing") continue;
      rightChildren.push(child);
    }
  }
  if (rightChildren.length > 0) {
    // `true`: glyphs (and their separator NBSP) unconditionally — see the note above about every
    // caller here being a marker-EDIT operation, which only runs in markerMode "editable".
    $buildContinuationCharSpan(right, char, rightChildren, true);
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
      // The caret counts as mid-span whenever content still follows it: mid-text, OR at this
      // text node's end with a later content sibling (a further text run or a nested element
      // span). PT9's flat USFM has no text-node boundaries, so both are the same "content
      // after the caret" case — the style closes at the caret and re-opens for the remainder
      // (StyleApplicator closes all char styles before the blank-styled space and re-opens
      // the still-active ones after it).
      const nextInSpan = anchorNode.getNextSibling();
      const hasContentAfterCaret =
        offset < content.length || (nextInSpan !== null && !$isMarkerNode(nextInSpan));
      if (hasContentAfterCaret) {
        const right = $splitCharNodeAt(char, anchorNode, offset);
        // If the split carried an existing space into the right span (as its
        // first content char, after the structural NBSP prefix), strip it
        // there — the plain space inserted below takes its place. Only a leading TEXT child
        // qualifies: when the right span starts with a nested element span, any space-leading
        // text after that element is not adjacent to the caret, so it keeps its space.
        const rightFirst = right.isAttached()
          ? right.getChildren().find((c) => !$isMarkerNode(c))
          : undefined;
        if (rightFirst && $isTextNode(rightFirst)) {
          const rightText = rightFirst.getTextContent();
          const prefix = rightText.startsWith(NBSP) ? NBSP : "";
          const body = rightText.slice(prefix.length);
          if (body.startsWith(" ")) rightFirst.setTextContent(prefix + body.slice(1));
        }
        const space = $createTextNode(" ");
        char.insertAfter(space);
        // Drop halves emptied by the split (only glyphs left). A nested element span counts
        // as content even though it contributes no direct text child — deleting such a half
        // would silently discard the nested span's text.
        [char, right].forEach((span) => {
          const isEmptied = span
            .getChildren()
            .filter((c) => !$isMarkerNode(c))
            .every((c) => $isTextNode(c) && c.getTextContent().replace(NBSP, "") === "");
          if (isEmptied) span.remove();
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

/** Nearest `CharNode` ancestor (including `node` itself) whose implied endmarker (its own
 * marker + `"*"`, the USFM convention — no `StyleInfo` is threaded through here) equals
 * `endMarker`, innermost first. */
function $findCharNodeByEndMarker(node: LexicalNode, endMarker: string): CharNode | undefined {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isCharNode(current) && `${current.getMarker()}*` === endMarker) return current;
    current = current.getParent();
  }
  return undefined;
}

/**
 * Whether `node` is the last content (non-marker) child of `char` — i.e. its content end.
 * Nested element spans count as content: with a trailing nested span after `node`, the span's
 * content does NOT end at `node`, so closing there must still split (the tokenizer would put
 * everything after the literal end marker — the nested span included — outside the style).
 */
function $isLastContentChild(char: CharNode, node: TextNode): boolean {
  const contentChildren = char.getChildren().filter((c) => !$isMarkerNode(c));
  const last = contentChildren[contentChildren.length - 1];
  return !!last && last.is(node);
}

/** Move the selection to just after `char` — into its next plain-text sibling when there is
 * one (the common case right after a split+unwrap), else an element-point selection. */
function $selectAfterCharNode(char: CharNode): void {
  const next = char.getNextSibling();
  if ($isTextNode(next)) {
    next.select(0, 0);
    return;
  }
  const parent = char.getParent();
  if (!parent) return;
  const index = char.getIndexWithinParent();
  parent.select(index + 1, index + 1);
}

/**
 * Closes the innermost open character span matching `endMarker` (e.g. `"nd*"`) at the caret —
 * the marker-menu `closeTag` apply (PT9 `MarkerDropdownControl`'s close-tag entries).
 *
 * Splits the span at the caret via `$splitCharNodeAt` and unwraps the right half (content after
 * the caret leaves the span, becoming plain text) — mirroring Ctrl+Space's split shape. When the
 * caret already sits at the span's content end, the span is already effectively closed: no split
 * is performed, the selection just moves past it. Returns `false` when there is no open span
 * matching `endMarker` at the caret, or the selection isn't a collapsed range selection.
 */
export function $closeCharSpanAtCaret(endMarker: string): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const char = $findCharNodeByEndMarker(anchorNode, endMarker);
  if (!char) return false;

  const offset = selection.anchor.offset;
  if ($isTextNode(anchorNode) && anchorNode.getParent()?.is(char)) {
    const isContentEnd =
      offset === anchorNode.getTextContentSize() && $isLastContentChild(char, anchorNode);
    if (!isContentEnd) {
      const right = $splitCharNodeAt(char, anchorNode, offset);
      $unwrapCharNode(right);
    }
  }
  // Else: the caret isn't directly inside the matched span's own text content (e.g. nested
  // deeper than one level below it) — degrade to moving the caret past the span.
  $selectAfterCharNode(char);
  return true;
}
