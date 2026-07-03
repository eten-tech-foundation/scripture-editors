import { $isImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import {
  $getCharacterOffsets,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { $isMarkerNode, $isNoteNode, $isVerseNode } from "shared";

/**
 * Returns `true` when `node` is inside a NoteNode (i.e. an existing footnote/cross-reference
 * embedded in the selected body text) — its entire content, markers included, must be dropped.
 * `selection.getNodes()` flattens a NoteNode's descendants into the returned list alongside the
 * note itself, so skipping just the NoteNode entry is not enough; every descendant must also be
 * excluded by walking its ancestor chain.
 */
function $isInsideNote(node: LexicalNode): boolean {
  let parent = node.getParent();
  while (parent) {
    if ($isNoteNode(parent)) return true;
    parent = parent.getParent();
  }
  return false;
}

/**
 * TS port of PT9 `RemoveMarkersAndFootnotes(text, isFootnote=true)`
 * (`UsfmSnippetInserter.cs:444-489`): builds a footnote/cross-reference quotation (`\fq`/`\xq`)
 * from a selection over body text — plain text only, with USFM markers and any nested
 * notes stripped, and embedded verse numbers converted to `\+fv <number>\+fv*`.
 *
 * Endpoint handling: Lexical's `RangeSelection.getNodes()` returns whole boundary nodes even for
 * a partial selection, so the first/last selected plain TextNode is sliced to the
 * anchor/focus offset here — reusing Lexical's own `$getCharacterOffsets` (which normalizes
 * "element"-type points, e.g. a whole-paragraph `select(0, childrenSize)`, to real character
 * offsets) and the same anchor/focus-order slicing Lexical's `RangeSelection.getTextContent()`
 * uses internally, rather than raw `.offset` values (a raw element-point offset is a child
 * index, not a character offset, and slicing with it truncates the last node's text).
 *
 * @param selection - The selection to build the quotation from.
 * @returns The stripped, trimmed quotation text.
 */
export function $stripSelectionToQuotation(selection: RangeSelection): string {
  if (!$isRangeSelection(selection)) return "";

  const nodes = selection.getNodes();
  if (nodes.length === 0) return "";

  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const isBefore = selection.anchor.isBefore(selection.focus);
  const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);

  let result = "";
  for (const node of nodes) {
    if ($isNoteNode(node) || $isImmutableNoteCallerNode(node) || $isInsideNote(node)) continue;
    if ($isMarkerNode(node)) continue;

    // Check VerseNode before TextNode: in editable markerMode a VerseNode IS a TextNode
    // subclass, so a TextNode-first check would emit its raw glyph text instead of `\+fv`.
    if ($isVerseNode(node)) {
      result += `\\+fv ${node.getNumber()}\\+fv*`;
      continue;
    }

    if ($isTextNode(node)) {
      let text = node.getTextContent();
      if (node === firstNode && node === lastNode) {
        text =
          anchorOffset < focusOffset
            ? text.slice(anchorOffset, focusOffset)
            : text.slice(focusOffset, anchorOffset);
      } else if (node === firstNode) {
        text = isBefore ? text.slice(anchorOffset) : text.slice(focusOffset);
      } else if (node === lastNode) {
        text = isBefore ? text.slice(0, focusOffset) : text.slice(0, anchorOffset);
      }
      result += text;
    }
  }

  return result.replace(/\s+/g, " ").trim();
}
