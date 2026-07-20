/**
 * Standard-view whitespace display invariant and clipboard normalization. While typing, spaces
 * in a run are kept visible as display-NBSP (the same mapping
 * `usjTextToDisplay` applies at load time, applied incrementally as the user types); copying
 * or cutting selected text inverts display-NBSP back to plain spaces for `text/plain` so pasted
 * text elsewhere isn't polluted with NBSP. Both pieces are gated to Standard view only by the
 * caller (`MarkerEditPlugin.tsx`) — they must not run in other view modes.
 */

import {
  $getHtmlContent,
  $getLexicalContent,
  copyToClipboard,
  LexicalClipboardData,
} from "@lexical/clipboard";
import { $getSelection, $getState, $isRangeSelection, LexicalEditor, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isUnknownNode, NBSP, textTypeState } from "shared";

/** Spaces in runs display as NBSP so they are visible while typing. */
export function $displayWhitespaceTransform(node: TextNode): void {
  const text = node.getTextContent();
  if (!text.includes(" ")) return;
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === "marker-trailing-space") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content displays space runs as NBSP like any other content;
    // books/chapters/unknowns keep literal text (degradation property) — same skip-list
    // as Tier 2.
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return;
  }
  const mapped = text
    .replace(/ (?=[ \u00A0])/g, NBSP) // space followed by space/NBSP
    .replace(/(?<=\u00A0) /g, NBSP); // space preceded by NBSP
  if (mapped !== text) node.setTextContent(mapped); // length-preserving: caret stays valid
}

/**
 * Pasted text of a `text/html` clipboard payload. A bare `body.textContent` read is not enough:
 * it merges the last word of one block into the first word of the next (`<p>a</p><p>b</p>` →
 * "ab"), and a body-level `<script>`/`<style>` would contribute its source text as pasted
 * content. So: script/style/template text is dropped (code, not content), and block boundaries
 * plus `<br>` become newlines — the same newline-joined shape a multi-line `text/plain` paste
 * hands to `insertText` in `$handlePasteForStandardView` below. Deliberately minimal — not a
 * general html-to-text conversion.
 */
function htmlPasteText(html: string): string {
  const { body } = new DOMParser().parseFromString(html, "text/html");
  body.querySelectorAll("script,style,template").forEach((element) => element.remove());
  body.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  body
    .querySelectorAll("p,div,li,td,th,tr,h1,h2,h3,h4,h5,h6,blockquote,pre")
    .forEach((element) => element.after("\n"));
  // Collapse boundary-newline runs (nested blocks, source formatting) and trim the outermost
  // ones; only `\n` is touched — an NBSP at either end must survive (String.trim would eat it).
  return (body.textContent ?? "").replace(/\n+/g, "\n").replace(/^\n|\n$/g, "");
}

/**
 * Standard-view PASTE normalization: a pasted data-NBSP must appear on screen as `~` (the
 * display form; serialization inverts `~` back to a real NBSP, so the DATA stays an NBSP).
 * Without this, a pasted NBSP landed as a raw NBSP — indistinguishable from a display-NBSP
 * (which represents a plain space inside a run) — so nothing showed on screen live, and
 * serialization then corrupted it into a plain space; the `~` only appeared after an app
 * reload re-ran the load-time mapping. Internal pastes (application/x-lexical-editor payload)
 * are already in display form and pass through untouched. For the rare NBSP-bearing external
 * paste this inserts the normalized PLAIN text (foreign `text/html` formatting is dropped —
 * preserving the NBSP data beats preserving formatting the sanitizer would mostly strip
 * anyway). The same NBSP-bearing check also covers `text/html` (word-processor copies carry the
 * space as a literal `&nbsp;`): some sources omit `text/plain` entirely, or their browser-
 * generated `text/plain` has already collapsed `&nbsp;` to a plain space, losing the marker
 * before it ever reaches this handler — so `text/html`, and the pasted text it decodes to
 * (`htmlPasteText` above), are checked too, falling back to that decoded text when it's the
 * only place the NBSP survives.
 */
export function $handlePasteForStandardView(event: ClipboardEvent | null | undefined): boolean {
  if (!event || !("clipboardData" in event) || !event.clipboardData) return false;
  if (event.clipboardData.getData("application/x-lexical-editor")) return false;
  const plain = event.clipboardData.getData("text/plain");
  const html = event.clipboardData.getData("text/html");
  const htmlText = html ? htmlPasteText(html) : "";
  const text = plain.includes(NBSP)
    ? plain
    : html.includes(NBSP) || htmlText.includes(NBSP)
      ? htmlText
      : undefined;
  if (!text) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  event.preventDefault();
  selection.insertText(text.replaceAll(NBSP, "~"));
  return true;
}

/**
 * Payload builder: the currently-selected content, normalized so `text/plain` carries
 * plain spaces where the display shows NBSP. Shared by both the real-event and null-event
 * branches of `$handleCopyForStandardView` below so they stay byte-for-byte consistent.
 */
export function $getStandardViewClipboardData(
  editor: LexicalEditor,
): LexicalClipboardData | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return undefined;
  const data: LexicalClipboardData = {
    "text/plain": selection.getTextContent().replaceAll(NBSP, " "),
  };
  const html = $getHtmlContent(editor);
  const lexical = $getLexicalContent(editor);
  if (html) data["text/html"] = html;
  if (lexical) data["application/x-lexical-editor"] = lexical;
  return data;
}

/** Clipboard text carries plain spaces where the display shows NBSP. */
export function $handleCopyForStandardView(
  event: ClipboardEvent | null | undefined,
  editor: LexicalEditor,
  isCut: boolean,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const data = $getStandardViewClipboardData(editor);
  if (!data) return false;
  if (!event || !("clipboardData" in event)) {
    // Null-payload dispatch (ClipboardPlugin / ContextMenuPlugin / EditorRef): write via
    // Lexical's execCommand mechanism with OUR pre-normalized payload. copyToClipboard(null)
    // without `data` would intercept its own synthesized event at COMMAND_PRIORITY_CRITICAL
    // and write the stock payload — which is why this branch must pass `data`.
    void copyToClipboard(editor, null, data);
    if (isCut) selection.removeText();
    return true;
  }
  // Event-shaped payload whose clipboardData is null/absent: decline outright, exactly as the
  // pre-null-leg code did. This is an in-flight native clipboard event whose data store isn't
  // accessible — routing it into the null-dispatch leg above would re-enter
  // document.execCommand from inside that dispatch and never preventDefault the original event.
  if (event.clipboardData == null) return false;
  event.preventDefault();
  for (const [mime, value] of Object.entries(data)) event.clipboardData.setData(mime, value);
  if (isCut) selection.removeText();
  return true;
}
