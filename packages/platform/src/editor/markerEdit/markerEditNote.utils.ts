/**
 * PT9 SmartEnter: pressing Enter inside expanded note content does not
 * split the paragraph — a NoteNode is inline (`isInline()`, `canBeEmpty(): false`), so a
 * paragraph split there would be structurally invalid. PT9 instead starts a new `\fp`
 * (footnote-paragraph) char span at the caret.
 */

import { $createTextNode, $getSelection, $isRangeSelection, $isTextNode, TextNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $findFirstAncestorNoteNode,
  $isCharNode,
  $isMarkerNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  NBSP,
} from "shared";

/** Structural NBSP prefix convention for char-span content (mirrors `$splitCharNodeAt`). */
function withNbspPrefix(node: TextNode): void {
  const text = node.getTextContent();
  if (!text.startsWith(NBSP)) node.setTextContent(NBSP + text);
}

/**
 * PT9 SmartEnter: Enter inside expanded note content starts an `\fp` footnote-paragraph
 * span. Returns `false` (caller falls through to the existing paragraph-split behavior)
 * unless the collapsed-selection caret is inside an EXPANDED NoteNode's content.
 */
export function $handleEnterInNote(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const note = $findFirstAncestorNoteNode(anchorNode);
  // Only inline-expanded notes accept Enter (mirrors `$buildNoteFragment`'s note-content
  // rebuild gate); a collapsed note's content is not inline-editable. The caret must also
  // target actual note CONTENT, not the note element boundary itself.
  if (!note || note.getIsCollapsed() !== false || note.is(anchorNode)) return false;

  // The note's own direct child that contains the caret. Splicing must happen at THIS
  // level, never inside a nested char span: Lexical's generic `selection.insertNodes()`
  // would otherwise climb straight past the (inline, non-block) note to the enclosing
  // paragraph (`RangeSelection.insertNodes` -> `$removeTextAndSplitBlock` only treats true
  // "block" ancestors as split boundaries), splitting the note apart instead of adding to it.
  let noteChild = anchorNode;
  while (!note.is(noteChild.getParent())) {
    const parent = noteChild.getParent();
    if (!parent) return false; // defensive: note wasn't actually an ancestor (shouldn't happen)
    noteChild = parent;
  }

  const fp = $createCharNode("fp");
  // A visible opener glyph is required, not optional decoration: `$charNodeDeletionTransform`
  // treats any CharNode whose first child isn't an opening MarkerNode as "opener
  // deleted" and immediately unwraps it back to plain text in the same commit.
  fp.append($createMarkerNode("fp"));
  const textAnchor = $isTextNode(anchorNode) && !$isMarkerNode(anchorNode) ? anchorNode : undefined;
  const offset = selection.anchor.offset;
  const size = textAnchor?.getTextContentSize() ?? 0;

  if (textAnchor && offset === 0 && size > 0) {
    // Caret precedes all of this node's content: the whole content text moves into `\fp`
    // (mirrors an ordinary paragraph break at the very start of a line — nothing stays
    // "before").
    noteChild.insertBefore(fp);
    withNbspPrefix(textAnchor);
    fp.append(textAnchor);
    // A CharNode always retains its opening MarkerNode glyph, so `getChildrenSize()` is never
    // 0 after the content moved out — test emptiness EXCLUDING markers (mirrors
    // `$unwrapCharNode`'s `!$isMarkerNode` filter) so the now-content-less original span (e.g.
    // the emptied `\ft`) is actually removed instead of lingering as a marker-only `\ft\fp`.
    if ($isCharNode(noteChild) && noteChild.getChildren().every($isMarkerNode)) noteChild.remove();
  } else {
    if (textAnchor && offset > 0 && offset < size) {
      // Trailing text moves into the new `\fp` span; text before the caret stays put —
      // an ordinary mid-text paragraph break.
      const [, after] = textAnchor.splitText(offset) as [TextNode, TextNode];
      withNbspPrefix(after);
      fp.append(after);
    } else {
      fp.append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT));
    }
    noteChild.insertAfter(fp);
  }

  fp.selectEnd();
  return true;
}
