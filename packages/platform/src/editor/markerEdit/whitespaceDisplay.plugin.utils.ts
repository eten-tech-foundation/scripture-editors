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
  $createTabNode,
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
 * A marker token this handler recognizes for positional NBSP normalization: a plain or
 * nested-char marker (`\nd`, `\+nd`), either one's closer (`\nd*`, `\+nd*`), or a milestone's
 * anonymous self-closer (`\*`).
 */
const AFTER_MARKER_NBSP = /(\\(?:\+?[a-z0-9-]+\*?|\*))\u00A0/gi;
const BEFORE_MARKER_NBSP = /\u00A0(?=\\(?:\+?[a-z0-9-]+\*?|\*))/gi;

/**
 * Positional NBSP normalization for an external paste's resolved text. Standard view has no
 * `text/html` fidelity carrier for foreign sources (`$handlePasteForStandardView` below drops
 * formatting entirely and re-tokenizes the plain text), so a `text/html` payload's NBSPs are the
 * only clue to which spaces were meaningful markup vs. plain content — and the browser's own
 * clipboard round-trip (and a same-editor paste, whose private Lexical flavor does not survive
 * `navigator.clipboard.read()` — see `$handlePasteForStandardView`'s doc comment) both carry a
 * DISPLAY-NBSP (a Standard-view run space, a marker's own trailing separator, or a note's
 * internal spacer — `createNote` in `usj-editor.adaptor.ts` appends one after EVERY child, not
 * just the first, so one sits directly before `\ft`/`\f*` and every other child after the caller)
 * as a real NBSP, indistinguishable at this point from a genuine data-NBSP (PT9's `~` glyph).
 *
 * The two are told apart POSITIONALLY, mirroring PT9's `PostprocessUsfm`, in three passes:
 *
 * 1. A leading NBSP — at the very start of the text, or right after a newline (a later paragraph
 *    of a multi-line paste can itself start mid-span) — reads as a structural separator with
 *    nothing in front of it to match against (a partial selection starting exactly at a char
 *    span's structural leading NBSP) and becomes a plain space.
 * 2. An NBSP immediately FOLLOWING a marker token is the required opener/closer separator and
 *    becomes a plain space (e.g. the mandatory space after `\f`/`\fr`, or a char span's own
 *    leading separator when the marker literal IS present in the pasted text).
 * 3. An NBSP immediately PRECEDING a marker token is a structural spacer with no source
 *    counterpart — `createNote`'s inter-child spacer sits exactly here — and is DROPPED entirely
 *    (neither spaced nor kept as data): `\nd Lord\u00A0\nd*` settles to `\nd Lord\nd*`, matching
 *    the source USFM, which needs no byte there at all.
 *
 * Passes 2 and 3 both match against the SAME `AFTER_MARKER_NBSP`/`BEFORE_MARKER_NBSP` token set,
 * so a marker recognized by one is recognized by the other. Every remaining NBSP is genuine data
 * and is preserved as `~`, the same display form typed data-NBSP takes, so serialization
 * round-trips it to a real NBSP instead of silently collapsing it to a plain space or dropping it.
 */
export function $normalizePastedNbsp(text: string): string {
  return text
    .replace(/^\u00A0/gm, " ")
    .replace(AFTER_MARKER_NBSP, "$1 ")
    .replace(BEFORE_MARKER_NBSP, "")
    .replaceAll(NBSP, "~");
}

/** A `\c`/`\id` marker token ANYWHERE in a line, capturing its payload up to — but not including —
 * the next marker or line end. Not anchored to the line's start: a chapter/book-id token can sit
 * mid-line (`x \c 5 y`, a paste landing mid-sentence), and an anchor there would silently miss it
 * — the exact live-repro shape (see `$stripPastedChapterAndBookId`'s doc comment). Global so more
 * than one occurrence on the same line is fully swept, not just the first. */
const CHAPTER_OR_BOOK_ID_TOKEN = /\\(?:c|id)(?![\w-])[^\n\\]*/g;

/**
 * Drops every pasted `\c`/`\id` token and its payload (the chapter number / book code, up to the
 * next marker or newline) before insertion. Both create a document-structural node PT9 allows
 * only once per book (a `ChapterNode`/`BookNode`, materialized from the marker name alone —
 * `usj-editor.adaptor.ts` — same as a real load), and Standard view has no per-paste "am I the
 * only one" check the way an initial document load does. Live repro (2026-08-07): pasting a bare
 * `\c 2` mid-chapter created a second chapter node in the editor; every subsequent save then
 * failed with the PDP's "Multiple chapter markers present" (the error surfaces only in the
 * renderer log — disk and other editors silently stop updating). `\id` is the book-level twin of
 * the same hazard and is stripped identically. A token need not be its own line — `x \c 5 y`
 * mid-paragraph reaches the same tokenizer branch (chapter/book-id tokens are recognized wherever
 * they occur, not just at a fragment's start) and left unstripped produces the identical poisoned
 * shape: a second chapter node PLUS the trailing bytes (`y`) stranding as a bare top-level USJ
 * string outside any paragraph, since a chapter token closes the enclosing paragraph the same way
 * it does on a real load.
 *
 * Splits on lines and strips per line (not one global pass over the whole text) so a token that
 * consumes an ENTIRE line can cleanly take that line's own newline with it too (no stray empty
 * paragraph left behind). A token sharing a line with a LATER marker — `\c 5\v 1 In the
 * beginning` — only loses its own bytes: the token regex stops at the next `\`, leaving `\v 1 In
 * the beginning` to paste normally. But `[^\n\\]*` has no such stop when nothing marker-shaped
 * follows on the line: the mid-line `x \c 5 y` shape above loses the token's trailing payload TOO,
 * all the way to the newline — `x \c 5 y` strips down to `x ` alone, the trailing `y` dropped
 * along with the marker (pinned in `markerPasteFidelity.test.tsx`). A line that already carried no
 * other content becomes empty after stripping and is dropped from the output entirely, rather than
 * surviving as a blank paragraph; a line that was ALREADY blank in the source paste (nothing to do
 * with `\c`/`\id`) is left alone.
 *
 * Exported for the in-note CRITICAL multi-line paste claim (`MarkerEditPlugin.tsx`), which shares
 * this strip the same way it shares `$normalizePastedNbsp` — a `\c`/`\id` token pasted into note
 * content is just as reachable (the note-content Tier 2 rebuild tokenizes literal text the same
 * way a paragraph rebuild does) and just as harmful there.
 */
export function $stripPastedChapterAndBookId(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const stripped = line.replace(CHAPTER_OR_BOOK_ID_TOKEN, "");
      return stripped === "" && line !== "" ? undefined : stripped;
    })
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

/**
 * Inserts external paste text at the current selection, splitting on newlines into separate
 * paragraphs and tabs into `TabNode`s — reproducing `@lexical/clipboard`'s own text/plain
 * fallback (`$insertDataTransferForRichText`'s non-HTML branch) directly here instead of calling
 * it, so a `text/html` payload never reaches Lexical's HTML import path (the whole point of
 * `$handlePasteForStandardView` claiming external pastes: Standard view re-tokenizes markers
 * from plain text, it does not import foreign markup). `text` is assumed already normalized to
 * bare `\n` line endings by the caller — no `\r` reaches this function.
 */
function $insertPastedText(text: string): void {
  const parts = text.split(/(\n|\t)/);
  if (parts[parts.length - 1] === "") parts.pop();
  for (const part of parts) {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (part === "\n") selection.insertParagraph();
    else if (part === "\t") selection.insertNodes([$createTabNode()]);
    else selection.insertText(part);
  }
}

/**
 * Standard-view PASTE normalization: every external paste (no same-namespace
 * `application/x-lexical-editor` payload) is routed through the plain-text USFM carrier instead
 * of Lexical's HTML import — Standard view has markers as real text, so re-tokenizing pasted
 * text is the SAME mechanism that recognizes typed markers, and it is the only carrier that
 * survives `navigator.clipboard.read()` at all: Chromium's async clipboard-read API exposes only
 * a fixed sanctioned MIME allow-list (`text/plain`, `text/html`, and a short list of others) —
 * the private `application/x-lexical-editor` flavor Lexical writes on copy is not one of them, so
 * the `DataTransfer` `pasteSelection` (`clipboard.utils.ts`) rebuilds from `navigator.clipboard.
 * read()` can never contain it. A real Ctrl+V — even a same-editor paste of the editor's own
 * copy — therefore always rides `text/html`/`text/plain` like any external source. Previously
 * this only claimed NBSP-bearing pastes and inserted the text with a BLANKET NBSP→`~` mapping;
 * live repro (2026-08-07) showed that corrupts a same-editor paste of its own copy — every
 * display-NBSP (the separator after `\f`/`\fr`/`\ft`) became a literal `~`, turning recognized
 * markers into unknown-marker soup — and a browser-hop `\nd …\nd*` paste came back with an
 * unmatched closer. `$normalizePastedNbsp` above replaces that blanket mapping with the
 * positional rule.
 *
 * Declines (returns `false`, lets Lexical's own paste handling run) when: the payload carries a
 * same-namespace Lexical flavor (the sync `ClipboardEvent` path — a null-payload dispatch or a
 * live native paste event that still has it — keeps the exact node-tree fast path); the document
 * is structure-protected (`StructureProtectionPlugin` must sanitize the HTML payload instead —
 * this handler runs at the same `COMMAND_PRIORITY_HIGH` but registers earlier, so without this
 * check it would claim the paste first and starve that sanitizer — a recorded trade-off: a
 * protected editor's plain-text pastes get NO NBSP normalization at all, since this handler
 * never runs for them); or no text can be resolved.
 */
export function $handlePasteForStandardView(
  event: ClipboardEvent | null | undefined,
  isStructureProtected = false,
  armSplitExpected: () => void = () => undefined,
  armPasteRebuildDedup: () => void = () => undefined,
): boolean {
  if (!event || !("clipboardData" in event) || !event.clipboardData) return false;
  if (event.clipboardData.getData("application/x-lexical-editor")) return false;
  if (isStructureProtected) return false;
  const plain = event.clipboardData.getData("text/plain");
  const html = event.clipboardData.getData("text/html");
  // Line endings normalize to bare `\n` before anything else — matching the in-note CRITICAL
  // PASTE_COMMAND claim (MarkerEditPlugin.tsx) — so a `\r\n` (or bare `\r`) clipboard breaks
  // correctly instead of inserting a literal `\r` control character into the document.
  const text = (plain || (html ? htmlPasteText(html) : "")).replace(/\r\n?/g, "\n");
  if (!text) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  event.preventDefault();
  // Arms `Tier2Context.pasteRebuildArmed` for this paste's own update, BEFORE inserting —
  // unconditionally, unlike `armSplitExpected` below, because a SINGLE-line paste (no newline at
  // all) can just as easily trigger the immediate own-marker-prefix dedup rebuild (`\p one` pasted
  // right after an existing `\p` host's prefix) as a multi-line one can.
  armPasteRebuildDedup();
  const normalized = $normalizePastedNbsp($stripPastedChapterAndBookId(text));
  // @lexical/clipboard's own text/plain handling calls `selection.insertParagraph()` directly
  // per newline (never INSERT_PARAGRAPH_COMMAND), so the engine's INSERT_PARAGRAPH_COMMAND
  // handler can't arm `splitExpected` for it, and the LOW-priority PASTE_COMMAND handler that
  // used to arm it for every paste never runs once this HIGH-priority handler claims the
  // command — so it must be armed here, before inserting, for any paste that will split.
  if (normalized.includes("\n")) armSplitExpected();
  $insertPastedText(normalized);
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
