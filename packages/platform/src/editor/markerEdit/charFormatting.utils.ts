/**
 * Interrupting character-styled text at the caret: Ctrl+Space's unformatted space (PT9
 * `KeyPressEditHandler.HandleCtrlSpace` applies the blank character style), the marker menu's
 * close-tag entries, and the paragraph split. All three are the same close-and-reopen of the open
 * character-style stack (charStack.utils.ts in `shared`) with a different thing placed in the gap.
 */

import { $unwrapCharNode } from "./markerEditDeletion.utils";
import {
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $buildContinuationCharSpan,
  $charStackContainer,
  $continuationCharAttributes,
  $createCharNode,
  $innermostCharAncestor,
  $isCharNode,
  $isMarkerNode,
  $isSomeParaNode,
  $liftOutOfCharStack,
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
 *
 * Mutating: call inside `editor.update()`.
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

/**
 * The first plain-text content node at or after `node` in document order, descending into element
 * spans and skipping marker glyphs — "the next character the user can see", which is what PT9's
 * one-space-lookahead is asking about. Marker glyph text is presentation, so a reopened span's
 * `\nd` sits between the caret and the content without being a character ahead of it.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $firstContentTextFrom(node: LexicalNode | null): TextNode | undefined {
  if (!node) return undefined;
  if ($isMarkerNode(node)) return undefined;
  if ($isTextNode(node)) return node;
  if (!$isElementNode(node)) return undefined;
  for (const child of node.getChildren()) {
    const found = $firstContentTextFrom(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Strips character formatting from the current selection — the Ctrl+Space apply (PT9
 * `KeyPressEditHandler.HandleCtrlSpace`'s blank character style).
 *
 * A range selection unwraps fully covered char spans and splits partially covered ones at the
 * selection boundary (an interior range yields PT9's three segments: left styled, middle plain,
 * right styled) and inserts no space at all. A collapsed caret inside character-styled text emits
 * a genuinely UNFORMATTED space: the whole open character-style stack closes innermost-to-outermost
 * before it and reopens outermost-to-innermost after it, so the space belongs to no span — PT9's
 * insert-and-clear-a-space behavior, which is `StyleApplicator` applying the blank style to one
 * space. Returns `false` only when there is no range selection.
 *
 * Mutating: call inside `editor.update()` (dispatched from `MarkerEditPlugin`'s KEY_DOWN
 * command handler).
 */
export function $removeCharFormattingFromSelection(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  if (selection.isCollapsed()) {
    const anchorNode = selection.anchor.getNode();
    const offset = selection.anchor.offset;
    const innermostChar =
      $isTextNode(anchorNode) && !$isMarkerNode(anchorNode)
        ? $innermostCharAncestor(anchorNode)
        : undefined;
    if (innermostChar && $isTextNode(anchorNode)) {
      // Place the space at the caret INSIDE the innermost span, then lift it out of the whole
      // stack: each level closes before it and reopens after it, so what lands in the container
      // is a space belonging to no character style. Splitting only the innermost span left the
      // "unformatted" space still carrying every outer marker.
      const space = $createTextNode(" ");
      if (offset <= 0) anchorNode.insertBefore(space);
      else if (offset >= anchorNode.getTextContentSize()) anchorNode.insertAfter(space);
      else {
        const [left] = anchorNode.splitText(offset);
        left.insertAfter(space);
      }
      $liftOutOfCharStack(space, true);
      // PT9 (HandleCtrlSpace) inserts-and-clears exactly ONE space: when a space already sits
      // one character ahead it is REUSED as the unformatted separator rather than supplemented.
      // Looking forward only — a space BEHIND the caret is the previous word's, not this one's.
      const following = $firstContentTextFrom(space.getNextSibling());
      if (following) {
        const text = following.getTextContent();
        // The structural separator prefixes a reopened span's first text; the character ahead is
        // the one after it.
        const prefix = text.startsWith(NBSP) ? NBSP : "";
        const body = text.slice(prefix.length);
        if (body.startsWith(" ")) following.setTextContent(prefix + body.slice(1));
      }
      space.select(1, 1);
      return true;
    }
    // Outside any character style there is nothing to strip, so the key is a plain space —
    // reusing the next character when it is already one (the caret just moves past it).
    if ($isTextNode(anchorNode) && anchorNode.getTextContent()[offset] === " ") {
      anchorNode.select(offset + 1, offset + 1);
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
  // Always handled, even with nothing to strip. PT9 inserts no space on a range, so declining is
  // not "nothing happened" — it hands the keystroke to the browser, which types a literal space
  // OVER the selection and destroys it.
  return true;
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
 *
 * Mutating: call inside `editor.update()`.
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

/**
 * Splits the paragraph at a caret sitting inside character-styled text, closing the whole open
 * character-style stack on the left and reopening it in the new paragraph — the tail keeps its
 * markers, its attributes, and its nesting. Returns `false` (mutating nothing) when the caret is
 * not inside a char span whose container is a paragraph, leaving the generic split to run.
 *
 * Paratext 9 DROPS character styles across a paragraph split; reopening them is a deliberate
 * divergence. Lexical's generic inline split is not merely different, though — it is destructive:
 * `CharNode.insertNewAfter` builds a continuation with no opening glyph, no closing glyph, and no
 * attributes, so the deletion transform reads the continuation as opener-deleted and unwraps it,
 * and the left half loses its closer to the split and gets routed through a Tier-2 rebuild. At two
 * levels the unwrap cascade runs twice and both closers go.
 *
 * The break is made by parking an empty marker node at the caret, lifting it out of the stack
 * (`$liftOutOfCharStack` — each level closes before it and reopens after it), and then moving
 * everything past it into the new paragraph. The caret lands at the new paragraph's start, which
 * is where `$injectMarkerPrefix` expects it in order to place it on the content side of the marker
 * prefix the split transform is about to inject.
 *
 * Mutating: call inside `editor.update()` (dispatched from `MarkerEditPlugin`'s
 * INSERT_PARAGRAPH command handler, ahead of the generic rich-text split).
 */
export function $splitParagraphAtCharStack(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode) || $isMarkerNode(anchorNode)) return false;
  if (!$innermostCharAncestor(anchorNode)) return false;
  // Only paragraph-contained stacks. Inside a note the enclosing container is the NoteNode, and a
  // break there is an `\fp` (markerEditNote.utils.ts), never a paragraph split.
  const para = $charStackContainer(anchorNode);
  if (!$isSomeParaNode(para)) return false;

  // An empty text node, so it contributes no bytes to either half and nothing has to be cleaned up
  // beyond removing it. It never survives this function, so no transform ever sees it.
  const breakPoint = $createTextNode("");
  const offset = selection.anchor.offset;
  if (offset <= 0) anchorNode.insertBefore(breakPoint);
  else if (offset >= anchorNode.getTextContentSize()) anchorNode.insertAfter(breakPoint);
  else {
    const [, tail] = anchorNode.splitText(offset) as [TextNode, TextNode];
    tail.insertBefore(breakPoint);
  }
  $liftOutOfCharStack(breakPoint, true);

  const moving = breakPoint.getNextSiblings();
  breakPoint.remove();
  const newPara = para.insertNewAfter(selection, false);
  newPara.append(...moving);
  // An ELEMENT point at offset 0, the same shape `RangeSelection.insertParagraph` leaves behind:
  // the new paragraph has no marker prefix yet, and `$injectMarkerPrefix` recognizes exactly this
  // to move the caret to the content side once it splices one in.
  newPara.select(0, 0);
  return true;
}
