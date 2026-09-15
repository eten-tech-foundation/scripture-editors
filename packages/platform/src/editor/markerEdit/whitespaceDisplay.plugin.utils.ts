/**
 * Standard-view whitespace display invariant and clipboard normalization — the LIVE-EDITING half
 * of the whitespace feature (typing/copy/cut/paste boundaries: `$`-prefixed tree and
 * clipboard-event code). The pure string half — the load/serialize mapping and the full
 * architecture map of the feature — is `whitespaceDisplay.utils.ts` beside this file.
 *
 * While typing, spaces in a run are kept visible as display-NBSP (the same mapping
 * `usjTextToDisplay` applies at load time, applied incrementally as the user types); copying
 * or cutting selected text inverts display-NBSP back to plain spaces — wholesale for
 * `text/plain`, collapse-aware for `text/html` ({@link invertDisplayNbspInHtml}) — so pasted
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
  $getEditor,
  $getSelection,
  $getState,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  INSERT_PARAGRAPH_COMMAND,
  LexicalEditor,
  LexicalNode,
  PasteCommandType,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $isAttributeRunNode,
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isNoteNode,
  $isUnknownNode,
  GENERATOR_NOTE_CALLER,
  MARKER_TRAILING_SPACE_TEXT_TYPE,
  NBSP,
  textTypeState,
} from "shared";
import {
  $hasCopyableSelection,
  $isImmutableNoteCallerNode,
  $opaqueBlockAncestor,
} from "shared-react";
import { ENGINE_MARKER_NAME_BYTES } from "./markerName.pattern";

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
  // DOMParser yields an inert document: parsing never executes scripts or loads subresources,
  // and no node from the parsed document is ever adopted into the live DOM — only text content
  // is read out of it.
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
  /**
   * What a claim replays: `text/plain` when it carries anything, else the decoded `text/html`.
   * Some sources (word processors, intermediaries) ship html alone, and those pastes otherwise
   * reach the generic handling this editor's claims exist to pre-empt.
   *
   * The unresolved carriers (`text/plain`, the raw `text/html`, and its decoded text) are
   * deliberately not exposed alongside it: every claim must replay the SAME bytes, and a second
   * carrier within reach is an invitation for one of them to pick differently. A claim that ever
   * genuinely needs one can read the clipboard for it, at its own site, with its own reason.
   */
  text: string;
  /**
   * Whether the clipboard carries this editor's own rich payload
   * (`application/x-lexical-editor`), whose real nodes a line-by-line replay would flatten.
   * Deliberately NOT acted on here: the claims disagree about it on purpose — the in-note `\fp`
   * claim covers internal pastes (an internal multi-paragraph copy is exactly the split it
   * prevents), the char-stack claim declines them outright, and the Standard-view claim declines
   * them EXCEPT when the selection touches an attribute display run, where plain-text insertion
   * is the only safe shape whatever else the clipboard carries — so each one applies its own
   * rule, in view, at its own site.
   */
  isInternal: boolean;
}

/**
 * Pull the pasted text out of a `PASTE_COMMAND` payload. `undefined` when the payload carries no
 * clipboard at all (a KeyboardEvent-shaped dispatch, or an event whose data store is
 * inaccessible), which every claim reads as "not mine".
 *
 * THREE handlers replay the pasted bytes and so must agree on them byte-for-byte, or the same
 * clipboard is one thing to one of them and another to the next: the in-note `\fp` claim at
 * CRITICAL, and the Standard-view external-paste claim and the char-stack line replay at HIGH
 * (`MarkerEditPlugin.tsx`). All three read the clipboard only through here: the jsdom-safe
 * duck-check (jsdom implements no `ClipboardEvent`, so `instanceof` against the undefined global
 * throws), the carrier choice below, and line-ending normalization BEFORE any caller tests for a
 * line break — so `\r\n` and bare-`\r` clipboards break correctly and no `\r` ever reaches content
 * on any path.
 *
 * Other handlers race on the same command without going through this, correctly: the LOW
 * paragraph-split arm (`MarkerEditPlugin.tsx`) only sets a flag and never looks at the payload,
 * and shared-react's `StructureKeyboardPlugin` (HIGH) and `CommandMenuPlugin` (NORMAL) read the
 * clipboard directly for their own decisions — sanitizing and gating, not replaying — so they have
 * nothing to agree with the three about.
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
  // The carrier is chosen by PRESENCE — plain text whenever the clipboard carries any — and not
  // by which carrier an NBSP survived in. The stronger rule is genuinely better for a foreign
  // clipboard: a source whose `text/plain` collapsed `&nbsp;` to a plain space still has the real
  // NBSP in its `text/html`, and preferring html there would keep a data-NBSP this loses. But it
  // is not usable here, because it inverts on this editor's OWN copy: Standard view's `text/plain`
  // deliberately carries no NBSP at all (display ones invert to spaces, a data NBSP displays and
  // copies as `~`), while its `text/html` still ships NBSPs wherever a plain space would not
  // survive a rich consumer ({@link invertDisplayNbspInHtml}) — so "the plain text has no NBSP" is
  // TRUE of every P10 copy, and an NBSP-presence test would route P10's own round trip through
  // html, whose decoded text drops a collapsed note's caller entirely (it rides as a `data-caller`
  // attribute, never as text). A lost note caller on the editor's own copy is a worse, far likelier
  // loss than a foreign clipboard's data-NBSP.
  return {
    text: plainText || htmlText,
    isInternal: !!clipboardData.getData("application/x-lexical-editor"),
  };
}

/**
 * A marker token this handler recognizes for positional NBSP normalization: a plain or
 * nested-char marker (`\nd`, `\+nd`), either one's closer (`\nd*`, `\+nd*`), or a milestone's
 * anonymous self-closer (`\*`).
 *
 * Built from the engine's liberal name class, not the canonical one: this is RECOGNIZING a
 * marker-shaped byte run in arbitrary pasted text, which is exactly the job that class exists for,
 * and a name the tokenizer will read as a marker has to be read as one here too — otherwise its
 * separator NBSP survives into content as a data `~`.
 */
const MARKER_TOKEN = String.raw`\\(?:\+?[${ENGINE_MARKER_NAME_BYTES}]+\*?|\*)`;
const AFTER_MARKER_NBSP = new RegExp(String.raw`(${MARKER_TOKEN})\u00A0`, "g");
const BEFORE_MARKER_NBSP = new RegExp(String.raw`\u00A0(?=${MARKER_TOKEN})`, "g");

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
export function normalizePastedNbsp(text: string): string {
  return text
    .replace(/^\u00A0/gm, " ")
    .replace(AFTER_MARKER_NBSP, "$1 ")
    .replace(BEFORE_MARKER_NBSP, "")
    .replaceAll(NBSP, "~");
}

/** A `\c` chapter token ANYWHERE in a line: the marker, its separator, and the ONE
 * whitespace-delimited word the tokenizer reads as the chapter number (`getNextWord`,
 * usfmFragmentToUsj.ts) — and nothing more, because everything past that word is ordinary content
 * the paste must keep. Stops at a backslash too, so `\c\nd x` strips the bare `\c` and leaves
 * `\nd x` whole. Not anchored to the line's start: a chapter token can sit mid-line (`x \c 5 y`,
 * a paste landing mid-sentence), and an anchor there would silently miss it. Global so more than
 * one occurrence on the same line is fully swept, not just the first. */
const CHAPTER_TOKEN = new RegExp(
  String.raw`\\c(?![${ENGINE_MARKER_NAME_BYTES}])[ \u00A0]*[^\s\\]*`,
  "g",
);

/** A `\id` book-id token ANYWHERE in a line, capturing its payload up to — but not including —
 * the next marker or line end. Wider than {@link CHAPTER_TOKEN} on purpose: an `\id` line's whole
 * remainder IS the token's payload (book code plus an optional free-text description), so there is
 * no trailing content to preserve the way there is after a chapter number. */
const BOOK_ID_TOKEN = new RegExp(String.raw`\\id(?![${ENGINE_MARKER_NAME_BYTES}])[^\n\\]*`, "g");

/**
 * Drops every pasted `\c`/`\id` token and its payload (the chapter number / book code, up to the
 * next marker or newline) before insertion. Both create a document-structural node PT9 allows
 * only once per book (a `ChapterNode`/`BookNode`, materialized from the marker name alone —
 * `usj-editor.adaptor.ts` — same as a real load), and Standard view has no per-paste "am I the
 * only one" check the way an initial document load does. A pasted bare `\c 2` mid-chapter would
 * otherwise create a second chapter node in the editor, and every subsequent save would then fail
 * with the PDP's "Multiple chapter markers present" (an error that surfaces only in the renderer
 * log — disk and other editors would silently stop updating). `\id` is the book-level twin of the
 * same hazard and is stripped identically. A token need not be its own line — `x \c 5 y`
 * mid-paragraph reaches the same tokenizer branch (chapter/book-id tokens are recognized wherever
 * they occur, not just at a fragment's start) and left unstripped produces the identical poisoned
 * shape: a second chapter node PLUS the trailing bytes (`y`) stranding as a bare top-level USJ
 * string outside any paragraph, since a chapter token closes the enclosing paragraph the same way
 * it does on a real load.
 *
 * Only the token's OWN bytes go: `\c` plus the one word the tokenizer reads as the chapter
 * number. Content that merely follows it on the same line is the user's and survives — `x \c 5 y`
 * strips to `x  y`, not to `x `. Removing more would trade one silent corruption for another, and
 * the poisoning this exists to prevent is fully undone once the marker and its number are gone.
 * A token sharing a line with a LATER marker — `\c 5\v 1 In the beginning` — likewise only loses
 * its own bytes: both token regexes stop at the next `\`.
 *
 * Splits on lines and strips per line (not one global pass over the whole text) so a token that
 * consumes an ENTIRE line can cleanly take that line's own newline with it too (no stray empty
 * paragraph left behind). A line that already carried no other content becomes empty after
 * stripping and is dropped from the output entirely, rather than surviving as a blank paragraph;
 * a line that was ALREADY blank in the source paste (nothing to do with `\c`/`\id`) is left
 * alone.
 *
 * Exported for the in-note CRITICAL multi-line paste claim (`MarkerEditPlugin.tsx`), which shares
 * this strip the same way it shares `normalizePastedNbsp` — a `\c`/`\id` token pasted into note
 * content is just as reachable (the note-content Tier 2 rebuild tokenizes literal text the same
 * way a paragraph rebuild does) and just as harmful there.
 */
export function stripPastedChapterAndBookId(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const stripped = line.replace(CHAPTER_TOKEN, "").replace(BOOK_ID_TOKEN, "");
      return stripped === "" && line !== "" ? undefined : stripped;
    })
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

/**
 * True when `node` is part of an attribute display run: a TextNode tagged textType "attribute"
 * (a char span's bare `|…` run, a verse's `\va`/`\vp` value, or a milestone's attribute text — all
 * three share this one tag), or `node` itself / one of its ancestors is an `AttributeRunNode` — the
 * structural wrapper a verse/milestone run rides in, reachable by an element-point selection even
 * when no value text exists yet (an empty `\qt-s \*` run with nothing typed between the glyphs). A
 * char span's run has no such wrapper (it rides as a bare child of the `CharNode`), so the
 * textType tag alone covers it.
 *
 * The `AttributeRunNode`-ancestor branch also matches a selection landing on the wrapper's OWN
 * opening/self-closing `MarkerNode` glyphs (`\va`, `\va*`, a milestone's `\*`), not only its
 * textType-"attribute" value text — deliberately: a `MarkerNode` is itself an ordinary `TextNode`,
 * so `selection.insertText` at a glyph point behaves exactly as it would for typing there (the
 * same paste-≡-typing guarantee this whole file exists to uphold), and it is harmless the same way
 * inserting into any other plain text is.
 */
function $isNodeInAttributeContext(node: LexicalNode): boolean {
  if ($isTextNode(node) && $getState(node, textTypeState) === "attribute") return true;
  for (let ancestor: LexicalNode | null = node; ancestor; ancestor = ancestor.getParent())
    if ($isAttributeRunNode(ancestor)) return true;
  return false;
}

/**
 * True when `selection` touches attribute-display text at EITHER end — its anchor OR its focus
 * satisfies {@link $isNodeInAttributeContext}. A collapsed caret trivially qualifies when its one
 * point does. A real (non-collapsed) selection qualifies even when only ONE end is inside an
 * attribute run and the other reaches into ordinary content: under the paste-≡-typing principle, a
 * user typing a character over such a mixed selection gets exactly `selection.insertText`'s own
 * behavior — remove the whole selected range (whatever nodes it spans, attribute or not), then
 * insert at the resulting collapsed point — so paste must take the identical path rather than
 * declining into a branch (Lexical's rich-node paste, or this file's own newline-splitting
 * external-paste pipeline) that can corrupt the attribute-run end of the range. See
 * `$handlePasteForStandardView`'s doc comment for the two corruption shapes this closes.
 */
function $isSelectionInAttributeContext(selection: RangeSelection): boolean {
  return (
    $isNodeInAttributeContext(selection.anchor.getNode()) ||
    $isNodeInAttributeContext(selection.focus.getNode())
  );
}

/**
 * True when the WHOLE of `selection` stays inside ONE attribute-display node — a collapsed caret in
 * attribute context, or a range whose anchor and focus are the same node and that node is in
 * attribute context.
 *
 * This is the only shape whose pasted bytes are genuinely attribute VALUE bytes, and therefore the
 * only one whose value-byte carve-outs ({@link $insertPastedTextIntoAttributeContext}) are earned.
 * What earns them is paste ≡ TYPING: the bytes land where the same keystrokes would land, and this
 * editor's whole attribute-context contract is that a paste in a value behaves as typing there
 * does. The bytes DO still re-tokenize: the `"attribute"` tag survives the insertion, but the
 * caret-departure settle re-tokenizes the paragraph, so a pasted `\c 5` in a value becomes a
 * chapter marker. It becomes one identically when TYPED, so this is the typed-`\c` hole, reached
 * through a different door — not something paste introduces. Extending the strip to cover it would eat bytes out of an attribute value that were
 * never a chapter token — the very regression the carve-out exists to prevent — and would break the
 * equivalence. Both halves are pinned settled, on concrete USJ, in
 * `attributeContextPasteFidelity.test.tsx`.
 *
 * A selection that merely TOUCHES attribute context does not land in a value at all. Removing the
 * range takes the bytes out of the run, and when the range covers a char span's closing glyph it
 * deletes the closer too, so what arrives is ordinary paragraph content. That holds both ways
 * round: a range starting in body text and reaching INTO the run, and a range starting inside the
 * run and reaching PAST the closer. Those bytes get body content's rules, which is a divergence from typing
 * in exactly the two places body paste always diverges from it.
 */
function $isSelectionWithinOneAttributeNode(selection: RangeSelection): boolean {
  const { anchor, focus } = selection;
  return anchor.key === focus.key && $isNodeInAttributeContext(anchor.getNode());
}

/**
 * Paste normalization for a selection touching attribute-display text — the binding design
 * principle: paste ≡ typing the same characters at the same caret. Each `\n` in `text` becomes a
 * single space (a PER-NEWLINE replacement, not a run-collapsing one: `"a\n\nb"` becomes `"a  b"`,
 * two spaces, matching what two individual Enter-less keystrokes over an attribute run would
 * produce — attribute values are single-line, so there is no multi-line attribute byte shape to
 * collapse INTO). `text` arrives with bare `\n` line endings ({@link getPastePayload} normalizes
 * them for every paste claim) — no `\r` reaches this function. For a non-collapsed (mixed or
 * fully-inside) selection, `selection.insertText` removes the selected range before inserting, the
 * same as it does for a typed keystroke over that selection — no separate removal step is needed
 * here. The existing attribute pend/settle machinery (`$textNodeTier2Transform`'s attribute-tagged
 * early return, `$resolvePendingMarkers`) takes over identically whether the text arrived by typing
 * or this call.
 *
 * The two BODY-content paste rules — the `\c`/`\id` strip and the positional NBSP mapping, the only
 * two places a paste deliberately diverges from typing the same bytes — are skipped only for a
 * selection that stays wholly inside one attribute node ({@link $isSelectionWithinOneAttributeNode}).
 * There the bytes go where the same keystrokes would put them, and paste must not diverge: a pasted
 * `\c 5` is inserted literally exactly as a typed one is, and a pasted NBSP passes through exactly
 * as a typed one does (`$displayWhitespaceTransform`, this file, skips textType "attribute" nodes
 * outright). What the SETTLE then makes of those bytes is the same for both — a `\c 5` in a value
 * re-tokenizes into a chapter marker whether it was typed or pasted, which is the deferred typed-`\c`
 * hole rather than a paste defect; see {@link $isSelectionWithinOneAttributeNode}. A selection that
 * only TOUCHES an attribute run does not qualify: its bytes end up as ordinary paragraph content, so
 * they get body content's rules. What does NOT
 * change with them is the insertion MECHANISM — one `insertText`, never the paragraph-splitting
 * line replay and never Lexical's rich-paste node insertion, both of which corrupt the
 * attribute-run end of the range. A multi-line payload landing in body content this way therefore
 * still collapses per newline instead of splitting the paragraph; splitting a paragraph the removal
 * has just cut a char span in half in is the corruption this path exists to avoid.
 */
function $insertPastedTextIntoAttributeContext(selection: RangeSelection, text: string): void {
  const valueBytes = $isSelectionWithinOneAttributeNode(selection);
  const resolved = valueBytes ? text : normalizePastedNbsp(stripPastedChapterAndBookId(text));
  selection.insertText(resolved.replace(/\n/g, " "));
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
 * copy — therefore always rides `text/html`/`text/plain` like any external source. A BLANKET
 * NBSP→`~` mapping would corrupt a same-editor paste of its own copy: every display-NBSP (the
 * separator after `\f`/`\fr`/`\ft`) would become a literal `~`, turning recognized markers into
 * unknown-marker soup, and a browser-hop `\nd …\nd*` paste would come back with an unmatched
 * closer. `normalizePastedNbsp` above uses a positional rule instead, so only genuine data-NBSPs
 * become `~`.
 *
 * A MULTI-LINE payload is replayed line by line with an `INSERT_PARAGRAPH_COMMAND` dispatch
 * between lines, because no USFM line can carry a newline. Going through the COMMAND (rather than
 * `selection.insertParagraph()`) is what makes a paste into a character-style stack close and
 * reopen that stack per line, the same way Enter does. This claim runs at HIGH ahead of every
 * other paste claim, so an external paste never reaches the multi-line claims that would
 * otherwise split it — the split has to happen here. A single-line payload is one `insertText`.
 *
 * Declines (returns `false`, lets Lexical's own paste handling run) when: the payload carries a
 * same-namespace Lexical flavor (the sync `ClipboardEvent` path — a null-payload dispatch or a
 * live native paste event that still has it — keeps the exact node-tree fast path); the document
 * is structure-protected (`StructureKeyboardPlugin` must sanitize the HTML payload instead —
 * this handler runs at the same `COMMAND_PRIORITY_HIGH` but registers earlier, so without this
 * check it would claim the paste first and starve that sanitizer — a recorded trade-off: a
 * protected editor's plain-text pastes get NO NBSP normalization at all, since this handler
 * never runs for them); or no text can be resolved.
 *
 * The same-namespace-flavor decline is SUSPENDED whenever the selection TOUCHES attribute-display
 * text at either end ({@link $isSelectionInAttributeContext}). Lexical's default rich-paste node
 * insertion has no notion that an attribute run's text must stay inside its one tagged TextNode,
 * and (see `attributeContextPasteFidelity.test.tsx`'s "root cause" describe) merges the run, the
 * closing glyph, and even the FOLLOWING paragraph's own sibling text into one plain node: the
 * attribute display and the closing marker both vanish, and the pasted bytes end up loose in body
 * content. The suspension covers: (1) a live native paste event that still carries a
 * same-namespace `application/x-lexical-editor` flavor, which unlike the
 * reconstructed-`DataTransfer` path can still reach a handler; (2) a
 * multi-line plain-text payload, which the ordinary external-paste pipeline below would split into
 * real paragraphs via `INSERT_PARAGRAPH_COMMAND` — inside an attribute run that is exactly as
 * destructive as the rich-paste shape; (3) a marker-bearing payload (`\c 5`) landing wholly INSIDE
 * one attribute node, where the ordinary pipeline's `stripPastedChapterAndBookId` would eat bytes
 * out of an attribute VALUE that were never a chapter token to begin with — bytes merely TOUCHING
 * a run get that strip, since they end up as re-tokenizing paragraph content
 * ({@link $insertPastedTextIntoAttributeContext}); (4) a MIXED selection (one end inside the run,
 * one end outside) combined with either (1) or (2) above — the selection touches attribute
 * context, so it must not be allowed to reach either risky branch merely because its OTHER end
 * sits outside. Attribute value bytes are never rich content — a user cannot "type formatting"
 * into one either — so this handler must always claim a paste touching one and insert it as plain
 * text ({@link $insertPastedTextIntoAttributeContext}), regardless of what other MIME flavors the
 * clipboard also carries. Structure protection still takes precedence (checked first, below): an
 * attribute run inside a protected document defers to the same protection contract as everything
 * else. One further precedence is unaffected by this suspension: the CRITICAL-priority in-note
 * multi-line `PASTE_COMMAND` claim (`MarkerEditPlugin.tsx`) still runs BEFORE this handler and
 * still wins for a multi-line payload whose selection touches EXPANDED note content — an attribute
 * run that happens to sit inside an expanded note's content is reached by this handler (and this
 * suspension) only when that in-note claim itself declines.
 *
 * Mutating: call inside `editor.update()`. It inserts text, removes the selected range, and
 * dispatches `INSERT_PARAGRAPH_COMMAND` against the editor it reads from `$getEditor()` — none of
 * which has an editor state to act on outside an update.
 */
export function $handlePasteForStandardView(
  event: ClipboardEvent | null | undefined,
  isStructureProtected = false,
  armSplitExpected: () => void = () => undefined,
  armPasteRebuildDedup: () => void = () => undefined,
): boolean {
  const payload = getPastePayload(event);
  if (!payload) return false;
  const selection = $getSelection();
  const inAttributeContext =
    $isRangeSelection(selection) && $isSelectionInAttributeContext(selection);
  if (!inAttributeContext && payload.isInternal) return false;
  if (isStructureProtected) return false;
  // `text` is `text/plain` when the clipboard carries any, else the decoded `text/html` — the one
  // preference every paste claim in this editor shares, with line endings already normalized to
  // bare `\n` ({@link getPastePayload}), so no `\r` ever reaches content and a `\r\n` clipboard
  // breaks into lines correctly.
  const { text } = payload;
  if (!text) return false;
  if (!$isRangeSelection(selection)) return false;
  event?.preventDefault();
  if (inAttributeContext) {
    $insertPastedTextIntoAttributeContext(selection, text);
    return true;
  }
  // Arms `Tier2Context.pasteRebuildArmed` for this paste's own update, BEFORE inserting —
  // unconditionally, unlike `armSplitExpected` below, because a SINGLE-line paste (no newline at
  // all) can just as easily trigger the immediate own-marker-prefix dedup rebuild (`\p one` pasted
  // right after an existing `\p` host's prefix) as a multi-line one can.
  armPasteRebuildDedup();
  const normalized = normalizePastedNbsp(stripPastedChapterAndBookId(text));
  const lines = normalized.split("\n");
  if (lines.length < 2) {
    selection.insertText(normalized);
    return true;
  }
  // The engine's own INSERT_PARAGRAPH_COMMAND handler arms `splitExpected` for each dispatch
  // below, but the FIRST line is inserted before any of them run, so the flag is armed up front
  // too: every fresh prefix-less paragraph this paste creates needs its marker prefix injected
  // rather than being read as marker-deleted and merged back into the paragraph above. The
  // LOW-priority PASTE_COMMAND arm that covers the pastes reaching it never runs once this
  // HIGH-priority claim consumes the command.
  armSplitExpected();
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

/**
 * The `\cat …\cat*` bytes a COLLAPSED note's category needs, contributed by the one display node
 * that sits where those bytes belong: the separator directly after the caller. `""` for every
 * other node, and for a note with no category.
 *
 * A collapsed note deliberately displays no category at all — `createNote` (`usj-editor.adaptor.ts`)
 * builds the `\cat` run only for the editable EXPANDED layout, mirroring `\va`/`\vp`. That is a
 * view decision, and it is not a licence for the copy to drop the attribute: this is the same rule
 * that already recovers a collapsed note's caller from an `ImmutableNoteCallerNode` that renders as
 * an empty glyph — what you COPY is the note's bytes, not the note's pixels.
 *
 * Scoped to the collapsed layout by construction: only that layout puts an
 * `ImmutableNoteCallerNode` before this separator (the expanded one uses a plain caller TextNode
 * and carries the real `\cat` run among its children), so an expanded note can never double-emit.
 * Placed AFTER the separator's own space and with none of its own, which is where the file has the
 * span: `\f + \cat People\cat*\fr 1:1 …` — a trailing space here would re-tokenize into a stray
 * text child inside the note.
 *
 * `isLast` is what keeps it inside the selection. These bytes stand for the region AFTER the
 * separator, so a selection that STOPS there covers none of them: emitting anyway put
 * `\cat People\cat*` on the clipboard for a range the user never selected, with no `\f` opener in
 * front of the run that followed (`\f -\cat People\cat*`). The sibling caller rule
 * guards its own boundary the same way.
 */
function $collapsedNoteCategoryBytes(node: TextNode, isLast: boolean): string {
  if (isLast) return "";
  if (node.getTextContent() !== NBSP) return "";
  const note = node.getParent();
  if (!$isNoteNode(note)) return "";
  if (!$isImmutableNoteCallerNode(node.getPreviousSibling())) return "";
  const category = note.getCategory();
  return category ? `\\cat ${category}\\cat*` : "";
}

/** The nearest enclosing `NoteNode`'s USJ caller value, falling back to the auto-generated-caller
 * marker (`+`) when the note has none set. */
function $noteCallerText(callerNode: LexicalNode): string {
  const noteNode = callerNode.getParent();
  const caller = $isNoteNode(noteNode) ? noteNode.getCaller() : undefined;
  return caller || GENERATOR_NOTE_CALLER;
}

/**
 * Whether this block-level element opens a new LINE of copied USFM, or is engine-internal to an
 * opaque construct and must stay on the construct's own line.
 *
 * A sidebar's nested `\p` and a table's rows and cells are real block-level nodes, so the walk's
 * "one `\n` per non-inline boundary" rule would spread ONE construct over several lines. A paste of
 * that text replays every `\n` as a paragraph split, and Tier 2 re-tokenizes strictly one paragraph
 * at a time (`$requestTier2ForNode` always rebuilds a single-element array), so the `\esb`/`\esbe`
 * and `\tr`/`\th`/`\tc` assembly `usfmFragmentToUsj.ts` already implements never sees the whole
 * construct in one pass: the sidebar comes back unclosed with its paragraph hoisted out, and the
 * table comes back as empty row wrappers with the cells stranded as sibling paragraphs.
 *
 * Keeping the construct byte-contiguous is what lets a single-paragraph rebuild reassemble it. USFM
 * markers self-delimit, so the one-line form is valid USFM of the same document — just not the
 * line-per-marker layout a USFM writer would emit, which is a deliberate trade for a paste that
 * survives.
 *
 * The construct's own outermost node still starts its own line: only a block boundary with an
 * opaque ancestor ABOVE it is suppressed, so a table stays separated from the prose around it.
 */
function $startsBlockLine(node: LexicalNode): boolean {
  const parent = node.getParent();
  return !parent || $opaqueBlockAncestor(parent) === undefined;
}

/**
 * Source-faithful USFM text of `selection` — the `text/plain` leg of Standard-view copy/cut. Walks
 * `selection.getNodes()` the same way `RangeSelection.getTextContent()` does — mirrored from
 * lexical 0.43.0, so a Lexical upgrade should re-read that walk and confirm it still matches
 * before trusting this one — (single `\n` between
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
 * 3. A block boundary INSIDE an opaque construct contributes no line break, so the construct
 *    copies out on ONE line (see {@link $startsBlockLine}).
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
      if (!prevWasElement && $startsBlockLine(node)) text += "\n";
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
      text += $isNoteInternalDisplaySeparator(node)
        ? ""
        : nodeText.replaceAll(NBSP, " ") + $collapsedNoteCategoryBytes(node, node === lastNode);
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
 * Collapse-aware display-NBSP inversion for the `text/html` clipboard flavor. Every display-NBSP
 * stands for a PLAIN space in the document data (marker-trailing separator spaces, char spans'
 * structural separators, paragraph-leading spaces, and every space in a run of 2+ — the display
 * mapping in whitespaceDisplay.utils.ts), so shipping them to a rich-text paste target as real
 * NBSPs breaks line wrapping and text search there, while `text/plain` already inverts them all.
 * But a plain space does not always survive HTML: consumers collapse space runs and drop
 * fragment-edge whitespace. So this inversion keeps NBSP exactly where the plain space it stands
 * for would be destroyed:
 *
 * - a run of 2+ NBSPs stays all-NBSP — the form the display already carries (byte-stable; the
 *   conventional space/NBSP alternation would survive collapsing too, but changes bytes for no
 *   gain);
 * - a single NBSP at the very start or end of the fragment's text stays NBSP — HTML consumers
 *   drop a leading/trailing plain space, and edge whitespace is in the fragment only because the
 *   user deliberately selected it;
 * - every other single NBSP becomes the plain space it stands for.
 *
 * A genuine data NBSP takes no part here: Standard view displays it as a literal `~` (the USFM
 * byte form PT9 also shows and copies), so it is ordinary text to this inversion and ships as `~`
 * in BOTH flavors — the same display-vs-data line the `text/plain` inversion draws by replacing
 * only NBSP, never `~`. Either way both flavors decode to the same document text.
 *
 * Runs and edges are judged on the fragment's CONCATENATED text, not per markup span — a
 * marker-trailing NBSP separator and a paragraph-leading NBSP sit in different spans but form one
 * run a consumer would collapse if either became plain. The mapping is length-preserving, so the
 * result writes straight back to each text node as a slice.
 */
export function invertDisplayNbspInHtml(html: string): string {
  // Same inert-DOMParser guarantee as htmlPasteText above: no script execution, no subresource
  // loads, nothing adopted into the live DOM — the mutated fragment only ever becomes a string.
  const { body } = new DOMParser().parseFromString(html, "text/html");
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);
  const text = textNodes.map((node) => node.nodeValue ?? "").join("");
  const inverted = text.replace(/\u00A0+/g, (run, offset: number) =>
    run.length >= 2 || offset === 0 || offset + run.length === text.length ? run : " ",
  );
  if (inverted === text) return html;
  let offset = 0;
  for (const node of textNodes) {
    const length = (node.nodeValue ?? "").length;
    node.nodeValue = inverted.slice(offset, offset + length);
    offset += length;
  }
  return body.innerHTML;
}

/**
 * Payload builder: the currently-selected content, normalized per flavor. `text/plain` is the
 * source-faithful USFM of the selection ({@link $selectionToUsfmText}), which carries plain spaces
 * where the display shows NBSP. `text/html` keeps NBSP only where a plain space would not survive
 * a rich-text consumer ({@link invertDisplayNbspInHtml}). The internal
 * `application/x-lexical-editor` flavor keeps the display form untouched so a paste back into a
 * Standard-view editor round-trips exactly. Shared by both the real-event and null-event
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
  if (html) data["text/html"] = invertDisplayNbspInHtml(html);
  if (lexical) data["application/x-lexical-editor"] = lexical;
  return data;
}

/**
 * Clipboard text carries plain spaces where the display shows NBSP.
 *
 * Also the last line of defense for an EMPTY copy. A dispatch with no clipboard event of its own
 * cannot simply be declined: `@lexical/rich-text` picks it up and has `@lexical/clipboard`
 * synthesize an event — a hidden placeholder element is appended to the editor, the DOM selection
 * pointed at it, and `document.execCommand("copy")` run to provoke a real clipboard event to fill
 * in. With nothing selected, the filling step bails BEFORE it suppresses the browser's own copy,
 * and the browser copies the placeholder, replacing the clipboard's real contents with a character
 * that was never in the document. Standard view is where a caret most often has nothing copyable
 * around it — a click on a read-only construct (a figure, a table) leaves the caret beside it
 * rather than inside — so a null-payload dispatch with no content behind it is CLAIMED here and
 * does nothing, which is what copying an empty selection means. shared-react's
 * `registerEmptyCopyGuard` states the same rule for every view, one priority lower; claiming here
 * too keeps the rule from depending on which plugins a host happens to mount.
 *
 * A selection that is merely not a RANGE (a node selection) is still declined: it has real content,
 * and the synthesized-event path copies it correctly.
 */
export function $handleCopyForStandardView(
  event: ClipboardEvent | null | undefined,
  editor: LexicalEditor,
  isCut: boolean,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    const isNullPayloadDispatch = !event || !("clipboardData" in event);
    // The same predicate shared-react's guard uses, not a second spelling of it: the two layers
    // have to agree on what "nothing to copy" means — including that a node selection has real
    // content and is therefore declined here — and one shared function is what keeps them agreeing.
    return isNullPayloadDispatch && !$hasCopyableSelection();
  }
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
