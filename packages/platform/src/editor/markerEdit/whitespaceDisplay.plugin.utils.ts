/**
 * Standard-view whitespace display invariant and clipboard normalization — the LIVE-EDITING half
 * of the whitespace feature (typing/copy/cut/paste boundaries: `$`-prefixed tree and
 * clipboard-event code). The pure string half — the load/serialize mapping and the full
 * architecture map of the feature — is `whitespaceDisplay.utils.ts` beside this file.
 *
 * While typing, spaces in a run are kept visible as display-NBSP (the same mapping
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
import {
  $getEditor,
  $getSelection,
  $getState,
  $isRangeSelection,
  INSERT_PARAGRAPH_COMMAND,
  LexicalEditor,
  PasteCommandType,
  TextNode,
} from "lexical";
import {
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isUnknownNode,
  MARKER_TRAILING_SPACE_TEXT_TYPE,
  NBSP,
  textTypeState,
} from "shared";

/** Spaces in runs display as NBSP so they are visible while typing. */
export function $displayWhitespaceTransform(node: TextNode): void {
  const text = node.getTextContent();
  if (!text.includes(" ")) return;
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === MARKER_TRAILING_SPACE_TEXT_TYPE) return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content displays space runs as NBSP like any other content;
    // books/chapters/unknowns keep literal text (degradation property) — same skip-list
    // as Tier 2.
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return;
  }
  // A char span's text children carry a STRUCTURAL leading NBSP (the glyph separator the
  // adaptor/materializer glues onto content). It is not a display space-run member, so it must
  // not act as left context for the mapping: a genuine content-leading single space stays plain
  // in the clean-loaded shape, and mapping it here would make edited (dirty) nodes emit
  // different collab ops than clean-loaded ones for identical content.
  const hasStructuralPrefix = text.startsWith(NBSP) && $isCharNode(node.getParent());
  const body = hasStructuralPrefix ? text.slice(1) : text;
  const mapped =
    (hasStructuralPrefix ? NBSP : "") +
    body
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
 * general html-to-text conversion. Exported because {@link getPastePayload} hands this decoding
 * to every paste claim as its fallback for a clipboard that carries `text/html` without any
 * `text/plain`.
 */
export function htmlPasteText(html: string): string {
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

/** The text of a paste, read the one way every `PASTE_COMMAND` claim in this editor reads it. */
export interface PastePayload {
  /** `text/plain`, line endings normalized. */
  plainText: string;
  /** `text/html` as the clipboard carries it — markup, not text; an NBSP may be a `&nbsp;` here. */
  html: string;
  /** `text/html` decoded to text ({@link htmlPasteText}), line endings normalized. */
  htmlText: string;
  /**
   * What a claim replays: `text/plain` when it carries anything, else the decoded `text/html`.
   * Some sources (word processors, intermediaries) ship html alone, and those pastes otherwise
   * reach the generic handling this editor's claims exist to pre-empt.
   */
  text: string;
  /**
   * Whether the clipboard carries this editor's own rich payload
   * (`application/x-lexical-editor`), whose real nodes a line-by-line replay would flatten.
   * Deliberately NOT acted on here: the claims disagree about it on purpose — the in-note `\fp`
   * claim covers internal pastes (an internal multi-paragraph copy is exactly the split it
   * prevents), while the char-stack and NBSP claims decline them — so each one applies its own
   * rule, in view, at its own site.
   */
  isInternal: boolean;
}

/**
 * Pull the pasted text out of a `PASTE_COMMAND` payload. `undefined` when the payload carries no
 * clipboard at all (a KeyboardEvent-shaped dispatch, or an event whose data store is
 * inaccessible), which every claim reads as "not mine".
 *
 * Three handlers race on `PASTE_COMMAND` — the in-note `\fp` claim at CRITICAL, the NBSP display
 * normalization and the char-stack replay at HIGH — and they must agree byte-for-byte on what was
 * pasted, or the same clipboard is one thing to one of them and another to the next. So the
 * extraction lives here once: the jsdom-safe duck-check for the clipboard (jsdom implements no
 * `ClipboardEvent`, so `instanceof` against the undefined global throws), the plain-then-decoded-
 * html preference, and line-ending normalization BEFORE any caller tests for a line break — so
 * `\r\n` and bare-`\r` clipboards break correctly and no `\r` ever reaches content on any path.
 */
export function getPastePayload(
  event: PasteCommandType | null | undefined,
): PastePayload | undefined {
  const clipboardData =
    event && typeof event === "object" && "clipboardData" in event
      ? event.clipboardData
      : undefined;
  if (!clipboardData) return undefined;
  const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, "\n");
  const plainText = normalizeLineEndings(clipboardData.getData("text/plain"));
  const html = clipboardData.getData("text/html");
  const htmlText = html ? normalizeLineEndings(htmlPasteText(html)) : "";
  return {
    plainText,
    html,
    htmlText,
    text: plainText || htmlText,
    isInternal: !!clipboardData.getData("application/x-lexical-editor"),
  };
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
 *
 * A MULTI-LINE payload is replayed line by line with an `INSERT_PARAGRAPH_COMMAND` dispatch
 * between lines, because no USFM line can carry a newline: inserting the whole payload at once
 * left literal `\n` bytes sitting inside a text node, a byte on screen the file cannot represent.
 * This claim runs at HIGH ahead of every other paste claim, so an NBSP-carrying paste never
 * reaches the multi-line claims that would otherwise split it — the split has to happen here.
 * Going through the COMMAND (rather than `selection.insertParagraph()`) is what makes a paste
 * into a character-style stack close and reopen that stack per line, the same way Enter does.
 * Line endings are already normalized by {@link getPastePayload}, so `\r\n` and bare-`\r`
 * clipboards break correctly and no `\r` ever lands in content. A single-line payload keeps the
 * exact one-`insertText` behavior it always had.
 *
 * Mutating: call inside `editor.update()` — dispatched from `MarkerEditPlugin`'s
 * `PASTE_COMMAND` registration.
 */
export function $handlePasteForStandardView(event: ClipboardEvent | null | undefined): boolean {
  const payload = getPastePayload(event);
  if (!payload || payload.isInternal) return false;
  const { plainText, html, htmlText } = payload;
  // Which source to replay is decided by where the NBSP survived, not by the usual
  // plain-then-html preference: a browser-generated `text/plain` may have collapsed the
  // `&nbsp;` to a plain space, losing the very thing this claim exists to preserve.
  const text = plainText.includes(NBSP)
    ? plainText
    : html.includes(NBSP) || htmlText.includes(NBSP)
      ? htmlText
      : undefined;
  if (!text) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  event?.preventDefault();
  const displayText = text.replaceAll(NBSP, "~");
  const lines = displayText.split("\n");
  if (lines.length < 2) {
    selection.insertText(displayText);
    return true;
  }
  // Replayed as the two steps the user would have performed by hand: text, then the command.
  // The selection is removed up front rather than relying on the first `insertText` to replace
  // it, since a payload whose first line is empty (a leading newline) inserts no text at all
  // and would otherwise split a still-selected range.
  if (!selection.isCollapsed()) selection.removeText();
  const editor = $getEditor();
  lines.forEach((line, index) => {
    if (index > 0) editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    if (line === "") return;
    const lineSelection = $getSelection();
    if ($isRangeSelection(lineSelection)) lineSelection.insertText(line);
  });
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
