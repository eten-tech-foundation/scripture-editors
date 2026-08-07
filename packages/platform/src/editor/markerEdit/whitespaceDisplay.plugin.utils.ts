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
import {
  $getCharacterOffsets,
  $getSelection,
  $getState,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isNoteNode,
  $isUnknownNode,
  GENERATOR_NOTE_CALLER,
  NBSP,
  textTypeState,
} from "shared";
import { $isImmutableNoteCallerNode } from "shared-react";

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
 * general html-to-text conversion. Exported for the in-note paste claim
 * (`MarkerEditPlugin`), which falls back to this decoding when a clipboard carries `text/html`
 * without any `text/plain`.
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
 * Whether `node` is a collapsed note's internal display separator: a bare single-NBSP text node
 * `createNote` (`usj-editor.adaptor.ts`) inserts purely so a caller/content children render apart
 * on screen. USFM never needs a byte to separate a closing marker from the next `\marker` token,
 * so only ONE placement of this family has a real source counterpart — the separator directly
 * after the caller, which is the mandatory space between a note's caller and its first content
 * marker (`\f + \fr …`). Every other placement (between content children, before the note's own
 * closing marker) has nothing in the source USFM to reproduce and must contribute nothing.
 */
function $isNoteInternalDisplaySeparator(node: TextNode): boolean {
  if (node.getTextContent() !== NBSP) return false;
  const parent = node.getParent();
  if (!$isNoteNode(parent)) return false;
  return !$isImmutableNoteCallerNode(node.getPreviousSibling());
}

/** The nearest enclosing `NoteNode`'s USJ caller value, falling back to the auto-generated-caller
 * marker (`+`) when the note has none set. */
function $noteCallerText(callerNode: LexicalNode): string {
  const noteNode = callerNode.getParent();
  const caller = $isNoteNode(noteNode) ? noteNode.getCaller() : undefined;
  return caller || GENERATOR_NOTE_CALLER;
}

/**
 * Source-faithful USFM text of `selection` — the `text/plain` leg of Standard-view copy/cut. Walks
 * `selection.getNodes()` the same way `RangeSelection.getTextContent()` does (single `\n` between
 * non-inline block boundaries, anchor/focus offsets respected on the boundary text nodes,
 * `DecoratorNode`s contributing their own text; an inline element like `AttributeRunNode` or
 * `NoteNode` contributes nothing itself, its children being walked as their own list entries), with
 * two USFM-specific corrections:
 *
 * 1. An `ImmutableNoteCallerNode` — which renders as `""` on screen for a collapsed note with an
 *    auto-generated caller — contributes the enclosing note's real USJ caller (`+`, `-`, or a
 *    literal) plus its own leading separating space (the mandatory space after `\f`/`\x`). The node
 *    itself is left untouched (`getTextContent()` still returns `""`): it serves every view mode,
 *    and formatted-view prose copy depends on staying caller-free.
 * 2. NBSP inverts to a plain space per node instead of via a blanket `replaceAll` — a note's
 *    internal display-only separators (`$isNoteInternalDisplaySeparator`) contribute nothing
 *    instead of becoming phantom spaces; every other NBSP (marker-trailing spaces, a char span's
 *    structural leading separator, a verse's own marker-to-number gap) represents a real source
 *    space and still maps to one. Data-NBSP (displayed as `~`) is untouched either way.
 */
export function $selectionToUsfmText(selection: RangeSelection): string {
  const nodes = selection.getNodes();
  if (nodes.length === 0) return "";
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const { anchor, focus } = selection;
  const isBefore = anchor.isBefore(focus);
  const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);
  let text = "";
  let prevWasElement = true;
  for (const node of nodes) {
    if ($isElementNode(node) && !node.isInline()) {
      if (!prevWasElement) text += "\n";
      prevWasElement = !node.isEmpty();
      continue;
    }
    prevWasElement = false;
    if ($isImmutableNoteCallerNode(node)) {
      if (node !== lastNode || !selection.isCollapsed()) text += ` ${$noteCallerText(node)}`;
    } else if ($isTextNode(node)) {
      let nodeText = node.getTextContent();
      if (node === firstNode) {
        if (node === lastNode) {
          if (
            anchor.type !== "element" ||
            focus.type !== "element" ||
            focus.offset === anchor.offset
          )
            nodeText =
              anchorOffset < focusOffset
                ? nodeText.slice(anchorOffset, focusOffset)
                : nodeText.slice(focusOffset, anchorOffset);
        } else nodeText = isBefore ? nodeText.slice(anchorOffset) : nodeText.slice(focusOffset);
      } else if (node === lastNode) {
        nodeText = isBefore ? nodeText.slice(0, focusOffset) : nodeText.slice(0, anchorOffset);
      }
      text += $isNoteInternalDisplaySeparator(node) ? "" : nodeText.replaceAll(NBSP, " ");
    } else if (
      ($isDecoratorNode(node) || $isLineBreakNode(node)) &&
      (node !== lastNode || !selection.isCollapsed())
    ) {
      text += node.getTextContent();
    }
  }
  return text;
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
    "text/plain": $selectionToUsfmText(selection),
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
