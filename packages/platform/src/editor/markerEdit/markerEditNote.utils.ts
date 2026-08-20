/**
 * PT9 SmartEnter: pressing Enter inside expanded note content does not
 * split the paragraph — a NoteNode is inline (`isInline()`, `canBeEmpty(): false`), so a
 * paragraph split there would be structurally invalid. PT9 instead starts a new `\fp`
 * (footnote-paragraph) char span at the caret.
 */

import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
  LexicalEditor,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $findFirstAncestorNoteNode,
  $isMarkerNode,
  $liftOutOfCharStack,
  $withCharContentNbspPrefix,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  MarkerLookup,
  MarkerType,
  NBSP,
  NoteNode,
} from "shared";

/**
 * Outcome of the in-note break handlers (`$handleEnterInNote`, `$handlePasteLinesInNote`):
 *
 * - `"handled"` — the input was fully absorbed here (`\fp` break(s), possibly preceded by a
 *   selection removal); the caller only needs to claim the key/event.
 * - `"needs-plain-split"` — a selection touching an expanded note was removed, but the
 *   post-removal caret has no intact note at it, so the input must finish as the NORMAL
 *   paragraph-splitting behavior. The caller performs that: this module owns only the in-note
 *   behavior, and the split's bookkeeping (the `splitExpected` flag the paragraph transform
 *   consumes) lives with the plugin's INSERT_PARAGRAPH/PASTE handling.
 * - `"declined"` — nothing here applies and nothing was mutated; the caller falls through to
 *   the generic handling.
 */
export type NoteEnterOutcome = "handled" | "needs-plain-split" | "declined";

/**
 * PT9 SmartEnter: Enter inside expanded note content starts an `\fp` footnote-paragraph
 * span. A non-collapsed selection with at least one endpoint inside an expanded note first
 * removes the selected text (standard Enter-with-selection semantics), then breaks at the
 * resulting caret — an in-note `\fp` break when the caret's note survived intact, a normal
 * paragraph split (performed by the caller) otherwise. Declines when no endpoint touches an
 * EXPANDED NoteNode's content.
 *
 * Mutating: call inside `editor.update()` (dispatched from `MarkerEditPlugin`'s KEY_ENTER
 * command handler).
 */
export function $handleEnterInNote(): NoteEnterOutcome {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "declined";

  if (!selection.isCollapsed()) {
    const removal = $removeSelectionTouchingExpandedNote(selection);
    if (removal !== "removed") return removal;
    // The removal has already mutated this update, so the key stays claimed even if the
    // collapsed-caret step below declines (defensive): both falling through to the generic
    // paragraph split and splitting here would split the note the removal just edited.
    $startFpAtCaret();
    return "handled";
  }
  return $startFpAtCaret() ? "handled" : "declined";
}

/**
 * A pasted line's leading `\marker ` token, when it names a marker the effective stylesheet
 * types as PARAGRAPH. Only the marker-name shape USFM paragraph markers actually take
 * (lowercase letters then digits) is considered; `\c`/`\v` are excluded — sheets type `\c` as
 * "paragraph" but it is a structural marker, not a paragraph style to convert.
 */
const LINE_LEADING_MARKER_REGEX = /^\\([a-z][a-z0-9]*)( |$)/;

/**
 * Strips the leading paragraph-kind marker from one pasted line. Inside a note a paragraph
 * marker has no meaning — the pasted line break itself becomes the note's own paragraph form
 * (the `\fp` break) — so `\q1 something` contributes just `something`. Scoping: ONLY markers
 * the lookup types as paragraph are stripped; char-kind and stylesheet-unknown markers stay
 * literal text (the typed-literal Tier 2 machinery owns whatever happens to them next).
 */
function stripLeadingParagraphMarker(line: string, getMarker: MarkerLookup | undefined): string {
  if (!getMarker) return line;
  const match = LINE_LEADING_MARKER_REGEX.exec(line);
  if (!match) return line;
  const name = match[1];
  if (name === "c" || name === "v") return line;
  if (getMarker(name)?.type !== MarkerType.Paragraph) return line;
  return line.slice(match[0].length);
}

/**
 * PT9-consistent multi-line plain-text paste inside expanded note content: inside a note a
 * pasted line break is an `\fp` break — exactly what Enter does there — never a paragraph
 * split, which would tear the (inline, non-block) note apart and thread `\p` paragraphs
 * through it. The first line's text inserts at the caret; each later line starts on a fresh
 * `\fp` break, with the caret finishing after the last inserted text. Each line first sheds a
 * leading PARAGRAPH-kind marker (per `getMarker`): pasted USFM like `\q1 something` becomes
 * the line text `something` — the break already supplies the note's own paragraph form.
 * A non-collapsed selection is replaced first under the same rules as
 * Enter-with-selection; when the removal leaves no intact note at the caret this returns
 * `"needs-plain-split"` with the removal applied but NO lines inserted — the caller finishes
 * the paste as the ordinary paragraph-splitting insertion. Declines (mutating nothing) when
 * the selection does not touch expanded note content.
 *
 * Mutating: call inside `editor.update()` (dispatched from `MarkerEditPlugin`'s PASTE command
 * handler).
 */
export function $handlePasteLinesInNote(
  lines: string[],
  getMarker?: MarkerLookup,
): NoteEnterOutcome {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "declined";
  if (!selection.isCollapsed()) {
    const removal = $removeSelectionTouchingExpandedNote(selection);
    if (removal !== "removed") return removal;
  } else if (!$findExpandedNoteContentAtCaret()) {
    return "declined";
  }
  const [firstLine, ...breakLines] = lines.map((line) =>
    stripLeadingParagraphMarker(line, getMarker),
  );
  $insertLineTextAtCaret(firstLine ?? "");
  for (const line of breakLines) {
    // The same unified break Enter uses. If it defensively declines (the previous insertion
    // left the caret outside note content — shouldn't happen), the line continues at the
    // caret: text may run on, but the note is never split.
    $startFpAtCaret();
    $insertLineTextAtCaret(line);
  }
  return "handled";
}

/**
 * Re-anchors the Lexical selection at the DOM caret when the two have diverged and the DOM
 * caret sits inside an EXPANDED note's content — the paste-claim fallback. A live paste is
 * dispatched asynchronously (`ClipboardPlugin` intercepts Ctrl+V, reads the async clipboard,
 * then dispatches a synthesized event), and in that gap selection processing can park the
 * editor-state caret elsewhere (observed live/in-harness: on the wrapper paragraph's marker
 * glyph) while the user still SEES the caret inside the note. For a paste the user-visible
 * (DOM) caret is authoritative, so adopt it. Returns true when the selection was moved;
 * declines (false, nothing mutated) when there is no usable DOM caret, it is outside this
 * editor, it does not map into expanded note CONTENT, or it maps to a non-content node.
 *
 * Mutating (moves the selection): call inside `editor.update()`.
 */
export function $adoptDomCaretInExpandedNote(editor: LexicalEditor): boolean {
  const rootElement = editor.getRootElement();
  const domSelection = rootElement?.ownerDocument.getSelection();
  const anchorDomNode = domSelection?.anchorNode;
  if (!rootElement || !domSelection || !anchorDomNode) return false;
  if (!rootElement.contains(anchorDomNode)) return false;
  const lexicalNode = $getNearestNodeFromDOMNode(anchorDomNode);
  if (!lexicalNode) return false;
  const note = $findFirstAncestorNoteNode(lexicalNode);
  if (!note || note.getIsCollapsed() !== false || note.is(lexicalNode)) return false;
  // Only a plain content text caret is adopted (a marker-glyph DOM caret is not a paste
  // target); the DOM offset maps 1:1 onto the text node, clamped defensively.
  if (!$isTextNode(lexicalNode) || $isMarkerNode(lexicalNode)) return false;
  const offset = Math.min(domSelection.anchorOffset, lexicalNode.getTextContentSize());
  lexicalNode.select(offset, offset);
  return true;
}

/**
 * The replace-selection phase shared by Enter and multi-line paste. PT9 always replaces the
 * selection first, then breaks at the resulting caret. Claims any selection with at least one
 * endpoint inside an EXPANDED note — declining these handed the range to Lexical's generic
 * paragraph split, which CLONES the note at the split point (a duplicated `\f…\f*`). A
 * selection with BOTH endpoints outside stays generic (`"declined"`, nothing removed) even
 * when a whole note lies inside the range: the generic path deletes the covered note whole
 * and splits cleanly.
 */
function $removeSelectionTouchingExpandedNote(
  selection: RangeSelection,
): "removed" | "needs-plain-split" | "declined" {
  const anchorNote = $findFirstAncestorNoteNode(selection.anchor.getNode());
  const focusNote = $findFirstAncestorNoteNode(selection.focus.getNode());
  const anchorInExpandedNote = anchorNote?.getIsCollapsed() === false;
  const focusInExpandedNote = focusNote?.getIsCollapsed() === false;
  if (!anchorInExpandedNote && !focusInExpandedNote) return "declined";
  // Same removal semantics as pressing Delete over the selection; the deletion transforms
  // (`$noteDeletionTransform` and the char-span transform) repair glyph damage at commit.
  selection.removeText();
  // Decide the break from the POST-removal caret, checking the note structurally NOW —
  // the transform that unwraps opener-damaged notes runs later, at transform time. Only a
  // caret inside a note that still has its opening glyph takes the `\fp` break. Otherwise
  // — caret outside note content, or the removal destroyed the opener, which means there
  // is no longer a note there — the input does what it normally does: a plain paragraph
  // split (or splitting paste), performed by the caller.
  if (!$isCaretInNoteWithIntactOpener()) return "needs-plain-split";
  return "removed";
}

/** Insert one pasted line's text at the (possibly just-broken-to) caret. */
function $insertLineTextAtCaret(text: string): void {
  if (text === "") return;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) selection.insertText(text);
}

/**
 * Whether the collapsed post-removal caret sits at an expanded note whose opening `\f`
 * marker glyph survived the removal — the gate between an in-note `\fp` break and a normal
 * paragraph split after Enter-with-selection.
 */
function $isCaretInNoteWithIntactOpener(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const note = $findFirstAncestorNoteNode(selection.anchor.getNode());
  if (!note || note.getIsCollapsed() !== false) return false;
  return note
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "opening");
}

/**
 * The expanded note whose CONTENT the collapsed caret sits in, or undefined — the shared
 * entry gate for the in-note break paths. Only inline-expanded notes accept breaks (mirrors
 * `$buildNoteFragment`'s note-content rebuild gate); a collapsed note's content is not
 * inline-editable. The caret must also target actual note CONTENT, not the note element
 * boundary itself.
 */
function $findExpandedNoteContentAtCaret(): NoteNode | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const anchorNode = selection.anchor.getNode();
  const note = $findFirstAncestorNoteNode(anchorNode);
  if (!note || note.getIsCollapsed() !== false || note.is(anchorNode)) return undefined;
  return note;
}

/** The collapsed-caret `\fp` break itself; see `$handleEnterInNote` for the gate contract. */
function $startFpAtCaret(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const note = $findExpandedNoteContentAtCaret();
  if (!note) return false;

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

  // The break carries the note-content convention from creation: closed="false" (matching
  // `$createNoteContentChar` and real ParatextData — an \fp is genuinely unclosed; the next
  // marker or the note's end closes it). Closer-ness keys on this state, so without the flag
  // `$charNodeDeletionTransform` would read the (correct) missing closer as deletion damage and
  // route a spurious Tier-2 note-content rebuild on every Enter-in-note.
  const fp = $createCharNode("fp", { closed: "false" });
  // A visible opener glyph is required, not optional decoration: `$charNodeDeletionTransform`
  // treats any CharNode whose first child isn't an opening MarkerNode as "opener
  // deleted" and immediately unwraps it back to plain text in the same commit.
  fp.append($createMarkerNode("fp"));
  const textAnchor = $isTextNode(anchorNode) && !$isMarkerNode(anchorNode) ? anchorNode : undefined;
  const offset = selection.anchor.offset;
  const size = textAnchor?.getTextContentSize() ?? 0;
  const anchorIsNoteChild = textAnchor !== undefined && textAnchor.is(noteChild);

  // One shape for every caret position: EVERYTHING after the caret within the note's content
  // child ends up in the new `\fp`, in document order, still wearing its character styles.
  //
  // The break marker is parked at the caret INSIDE the innermost span and then lifted out of the
  // whole enclosing stack (`$liftOutOfCharStack`, the shared close-and-reopen). Explicitly-closed
  // spans nested along the way (`\+nd`) close before the break and reopen after it; the enclosing
  // NOTE-CONTENT span is closed implicitly by the `\fp` itself, so the lift ends it there and
  // hands its remaining content to the `\fp` rather than reopening an `\ft` nobody asked for.
  // Collecting only the ANCHOR's siblings instead saw just the innermost span's content, so an
  // outer span's text after a nested span stayed on the wrong side of the break and the nested
  // styles were dropped entirely.
  if (textAnchor && !anchorIsNoteChild) {
    if (offset <= 0) textAnchor.insertBefore(fp);
    else if (offset >= size) textAnchor.insertAfter(fp);
    else {
      const [, tail] = textAnchor.splitText(offset) as [TextNode, TextNode];
      tail.insertBefore(fp);
    }
    // No `closeImplicitSpans`: the `\fp` is itself what ends an implicitly-closed note-content
    // span, so no closing marker is emitted for it.
    $liftOutOfCharStack(fp, { renderGlyphs: true });
  } else {
    // The caret is on the note's OWN text (a spacer) or not on text at all, so there is no stack
    // to lift out of: splice the break in at the note's own level and take the anchor's tail with
    // it. Its following siblings are separate note children and stay where they are.
    const afterCaret =
      textAnchor && offset < size
        ? [offset === 0 ? textAnchor : textAnchor.splitText(offset)[1]]
        : [];
    noteChild.insertAfter(fp);
    const [firstMoved] = afterCaret;
    if (firstMoved) {
      $withCharContentNbspPrefix(firstMoved);
      fp.append(firstMoved);
    }
  }
  // Nothing after the caret anywhere: the break opens an empty `\fp`, which needs placeholder
  // content — a CharNode with no content is not selectable and would be reaped as empty.
  if (fp.getChildren().every($isMarkerNode))
    fp.append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT));

  $selectBreakPoint(fp);
  return true;
}

/**
 * Puts the caret at the BREAK POINT — the start of the span's content, immediately after the
 * structural NBSP separator — so typing continues where the user split (PT9/normal-editor
 * behavior; parking the caret at the span's END appended typed text after the moved tail
 * instead). Offset 0 would sit BEFORE the structural NBSP, splicing typed text between the
 * marker glyph and the separator. The empty-`\fp` placeholder is itself a lone structural
 * NBSP, so the same offset also puts typing exactly where the placeholder-consumption flow
 * expects new content (`NBSP` + typed text).
 */
function $selectBreakPoint(span: ElementNode): void {
  const first = span.getChildren().find((child) => !$isMarkerNode(child));
  if ($isTextNode(first)) {
    const offset = first.getTextContent().startsWith(NBSP) ? 1 : 0;
    first.select(offset, offset);
    return;
  }
  // A nested span leads the moved content: the break point is ITS first content.
  if ($isElementNode(first)) {
    $selectBreakPoint(first);
    return;
  }
  span.selectEnd(); // defensive: no content (cannot happen — a placeholder is always appended)
}
