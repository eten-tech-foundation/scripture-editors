/**
 * Standard-view whitespace display invariant and clipboard normalization (design spec §4,
 * §5.6). While typing, spaces in a run are kept visible as display-NBSP (the same mapping
 * `usjTextToDisplay` applies at load time, applied incrementally as the user types); copying
 * or cutting selected text inverts display-NBSP back to plain spaces for `text/plain` so pasted
 * text elsewhere isn't polluted with NBSP. Both pieces are gated to Standard view only by the
 * caller (`MarkerEditPlugin.tsx`) — they must not run in other view modes (§4).
 */

import { $getHtmlContent, $getLexicalContent } from "@lexical/clipboard";
import { $getSelection, $getState, $isRangeSelection, LexicalEditor, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isUnknownNode, NBSP, textTypeState } from "shared";

/** §4: spaces in runs display as NBSP so they are visible while typing. */
export function $displayWhitespaceTransform(node: TextNode): void {
  const text = node.getTextContent();
  if (!text.includes(" ")) return;
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === "marker-trailing-space") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content displays space runs as NBSP like any other content (Phase 3);
    // books/chapters/unknowns keep literal text (degradation property) — same skip-list
    // as Tier 2.
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return;
  }
  const mapped = text
    .replace(/ (?=[ \u00A0])/g, NBSP) // space followed by space/NBSP
    .replace(/(?<=\u00A0) /g, NBSP); // space preceded by NBSP
  if (mapped !== text) node.setTextContent(mapped); // length-preserving: caret stays valid
}

/** §5.6: clipboard text carries plain spaces where the display shows NBSP. */
export function $handleCopyForStandardView(
  event: ClipboardEvent | null | undefined,
  editor: LexicalEditor,
  isCut: boolean,
): boolean {
  if (!event || !("clipboardData" in event) || event.clipboardData == null) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const plain = selection.getTextContent().replaceAll(NBSP, " ");
  const html = $getHtmlContent(editor);
  const lexical = $getLexicalContent(editor);
  event.preventDefault();
  event.clipboardData.setData("text/plain", plain);
  if (html) event.clipboardData.setData("text/html", html);
  if (lexical) event.clipboardData.setData("application/x-lexical-editor", lexical);
  if (isCut) selection.removeText();
  return true;
}
