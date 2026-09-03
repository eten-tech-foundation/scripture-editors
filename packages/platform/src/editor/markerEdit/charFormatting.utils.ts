/**
 * Interrupting character-styled text at the caret: Ctrl+Space's unformatted space (PT9
 * `KeyPressEditHandler.HandleCtrlSpace` applies the blank character style) and the paragraph
 * split. Both are the same close-and-reopen of the open character-style stack (charStack.utils.ts
 * in `shared`) with a different thing placed in the gap.
 *
 * The marker menu's close-tag entries used to be a third: a structural split-and-unwrap at the
 * caret (`$closeCharSpanAtCaret`, with `$splitCharNodeAt` under it). Both are gone, owner-directed
 * — the structural close wrote no closing-marker bytes, so nothing it did reached the saved
 * document. A picked close-tag entry now lands the literal `\marker*` through `$commitTypedCloser`
 * (markerMenu/markerMenuApply.utils.ts), the same primitive the `*` key uses, and the marker-edit
 * engine re-tokenizes those bytes.
 */

import {
  $createTextNode,
  $getCharacterOffsets,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $charStackContainer,
  $innermostCharAncestor,
  $isCharNode,
  $isMarkerNode,
  $isPointInMarkerGlyphText,
  $isSomeParaNode,
  $liftOutOfCharStack,
  $selectCharContentStart,
  NBSP,
  textTypeState,
} from "shared";

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
      $liftOutOfCharStack(space, { renderGlyphs: true, closeImplicitSpans: true });
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

  // Range: unformat the covered text at EVERY level of the stack. Splitting the boundary text
  // nodes at the selection edges first leaves the covered text as whole nodes; lifting each out of
  // its entire enclosing stack then closes every level before it and reopens whatever of that
  // level still has content after it. A level the run covered completely is left with nothing and
  // is dropped, which is why clearing all of `\wj \+nd holy\+nd*\wj*` leaves a bare `holy` — both
  // spans are nothing without it — while a level that extends past the selection keeps its text on
  // both sides. An interior range still yields PT9's three segments (left styled, middle plain,
  // right styled); that is this same shape at depth one.
  for (const target of $coveredTextNodes(selection)) {
    if (!$innermostCharAncestor(target)) continue;
    $liftOutOfCharStack(target, { renderGlyphs: true, closeImplicitSpans: true });
    // Plain text now, so it sheds the structural separator it carried as a span's first content.
    // Shed on the LATEST instance: an earlier iteration's reopen may have prefixed the separator
    // onto this very node through a writable clone (a later covered node rides along in the
    // reopened span until its own turn), leaving `target` stale — and `setTextContent` compares
    // the new text against the STALE instance's own, so the shed would silently no-op exactly
    // when the pre-prefix text equals the post-shed text, leaving the separator byte in the file.
    const latest = target.getLatest();
    const text = latest.getTextContent();
    if (text.startsWith(NBSP)) latest.setTextContent(text.slice(NBSP.length));
  }
  // Always handled, even with nothing to strip. PT9 inserts no space on a range, so declining is
  // not "nothing happened" — it hands the keystroke to the browser, which types a literal space
  // OVER the selection and destroys it.
  return true;
}

/**
 * The text the selection covers, as whole nodes: each boundary node is split at the selection edge
 * so nothing partly-covered survives. Marker glyphs and display runs are excluded — they are
 * engine-owned presentation, not text the user selected.
 *
 * Shared with the non-NEST marker apply (`$applyNonNestAcrossNodes`,
 * adaptors/usj-marker-action.utils.ts), whose multi-node close-and-reopen is this same
 * split-then-lift shape with the new span wrapped around the lifted run.
 *
 * Mutating (splits the boundary text nodes): call inside `editor.update()`.
 */
export function $coveredTextNodes(selection: RangeSelection): TextNode[] {
  // Through Lexical's own `$getCharacterOffsets`, never raw `.offset`: an ELEMENT point's
  // offset is a CHILD INDEX (the shape `$placeCaretAtBoundary` produces whenever the boundary
  // child is not a TextNode), and using it as a character offset left the first `offset`
  // characters of the boundary node formatted — or, with the offsets crossed, skipped the node
  // entirely while the caller still claimed the keystroke as handled. The helper clamps an
  // element point to the real character extent.
  const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);
  const [startOffset, endOffset] = selection.isBackward()
    ? [focusOffset, anchorOffset]
    : [anchorOffset, focusOffset];
  const nodes = selection.getNodes();
  const covered: TextNode[] = [];
  nodes.forEach((node, index) => {
    if (!$isTextNode(node) || $isMarkerNode(node)) return;
    if ($getState(node, textTypeState) === "attribute") return;
    const size = node.getTextContentSize();
    const start = index === 0 ? startOffset : 0;
    // The element-point clamp above is PARENT-scoped: a boundary at the end of a multi-child
    // parent resolves to the parent's total text length, which can exceed this node's own size.
    // Clamp to the node, or the `end === size` piece pick below reads "not at the node's end"
    // and returns the text BEFORE the selection instead of the covered piece.
    const end = index === nodes.length - 1 ? Math.min(endOffset, size) : size;
    if (start >= end) return;
    // splitText returns 1, 2, or 3 pieces depending on where the cuts land; the covered one is the
    // middle of three, the last of two when the range runs to the node's end, else the first.
    const parts = node.splitText(start, end);
    const piece = parts.length === 3 ? parts[1] : end === size ? parts[parts.length - 1] : parts[0];
    if (piece) covered.push(piece);
  });
  return covered;
}

/**
 * Whether the selection sits inside a character-style stack that a PARAGRAPH split would tear —
 * the gate for routing an input that splits paragraphs through {@link $splitParagraphAtCharStack}
 * instead of the generic rich-text split.
 *
 * Read from the focus, the live end of the selection, so a range about to be replaced is judged by
 * where the replacement will land. A stack inside a NOTE is excluded: a break there is an `\fp`,
 * not a paragraph split.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $isSelectionInParagraphCharStack(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const node = selection.focus.getNode();
  if (!$innermostCharAncestor(node)) return false;
  return $isSomeParaNode($charStackContainer(node));
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
  let selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  let anchorNode = selection.anchor.getNode();
  // A caret at the TRAILING EDGE of a canonical closing glyph is genuinely AFTER the span (see
  // $isPointInMarkerGlyphText), so the split belongs past the WHOLE enclosing char — never inside
  // the glyph or the span. Normalize the caret out of the span before deciding: after a top-level
  // span the stack guard below then declines and the split runs at the span boundary; after a
  // NESTED closer the caret lands in the outer span's content and the close-and-reopen split
  // proceeds from there.
  if (
    $isMarkerNode(anchorNode) &&
    !$isPointInMarkerGlyphText(anchorNode, selection.anchor.offset)
  ) {
    const enclosing = anchorNode.getParent();
    if ($isCharNode(enclosing) && anchorNode.is(enclosing.getLastChild())) {
      enclosing.selectNext(0, 0);
      selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      anchorNode = selection.anchor.getNode();
    }
  }
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
  $liftOutOfCharStack(breakPoint, { renderGlyphs: true });

  const moving = breakPoint.getNextSiblings();
  breakPoint.remove();
  const newPara = para.insertNewAfter(selection, false);
  newPara.append(...moving);
  const [firstMoved] = moving;
  if ($isCharNode(firstMoved)) {
    // Typing continues the reopened style: the caret goes to the start of its content, past the
    // separator, exactly where the user interrupted the run. `$injectMarkerPrefix` leaves a caret
    // that is not at the paragraph's start alone, so the prefix splices in around it.
    $selectCharContentStart(firstMoved);
  } else {
    // Nothing reopened, so there is no run to continue. An ELEMENT point at offset 0 is the shape
    // `RangeSelection.insertParagraph` leaves behind, and the shape `$injectMarkerPrefix`
    // recognizes to move the caret to the content side once it splices the prefix in.
    newPara.select(0, 0);
  }
  return true;
}
