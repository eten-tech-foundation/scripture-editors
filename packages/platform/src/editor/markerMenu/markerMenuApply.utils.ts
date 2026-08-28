/**
 * Marker-menu apply — turns a `MarkerMenuItem` selection into an editor mutation.
 * Port of PT9's `MarkerDropdownEditHandler`/`KeyPressEditHandler` "apply" step
 * (`MarkerDropdownEditHandler.cs`), adapted to the Lexical tree:
 * - `applyMarkerMenuSelection` — character/note ("open") kinds run the existing
 *   structural-insert action (`getUsjMarkerAction`), first deleting a literal `\marker` trigger
 *   prefix typed before the caret when one landed (`MarkerDropdownControl.cs:216-219`);
 *   paragraph kinds retag the current paragraph at content start or split it mid-text (PT9
 *   reformat semantics — see `$applyParagraphSelection`); `closeTag` kind lands the literal
 *   `\marker*` bytes instead, through the same {@link $commitTypedCloser} the `*` key uses.
 *   One in-note special case: `fp` picked with the caret in expanded note content performs the
 *   footnote-paragraph BREAK (`$handleEnterInNote` — the same break Enter makes there), not a
 *   span insertion.
 * - `splitParagraphWithMarker` — the Enter-triggered marker menu's apply step: splits the
 *   paragraph at the caret and gives the new paragraph the chosen marker.
 *
 * Both are called from `EditorRef.applyMarkerMenuSelection`/`EditorRef.splitParagraphWithMarker`
 * (`Editor.tsx`) inside `editor.update(...)`.
 */
import { $insertNoteForMarker, getUsjMarkerAction } from "../adaptors/usj-marker-action.utils";
import { $applyParaMarker } from "../markerEdit/applyParaMarker.utils";
import { LITERAL_TRIGGER_PREFIX_REGEX } from "../markerEdit/markerName.pattern";
import { $splitParagraphAtCharStack } from "../markerEdit/charFormatting.utils";
import { $handleEnterInNote } from "../markerEdit/markerEditNote.utils";
import {
  $injectMarkerPrefix,
  $selectParaContentStart,
  $setParaMarkerWithPrefix,
} from "../markerEdit/markerEditDeletion.utils";
import { MarkerMenuItem } from "./markerItemSource";
import { $isAtParagraphContentStart } from "./markerMenuContext.utils";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $findMatchingParent } from "@lexical/utils";
import { $getEditor, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { $isMarkerNode, $isParaNode, LoggerBasic, NoteNode, ParaNode, StyleInfo } from "shared";
import { showParaMarkerPrefix, UsjNodeOptions, ViewOptions } from "shared-react";
import { MutableRefObject } from "react";

/**
 * Deletes the literal `\marker` trigger text (a backslash plus any USFM marker characters typed
 * so far) ending at the caret, when the anchor is a `TextNode`. No-op when there is no such
 * literal prefix, the anchor isn't a `TextNode`, or the selection isn't a collapsed range
 * selection.
 */
function $removeLiteralTriggerPrefix(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

  const anchorNode = selection.anchor.getNode();
  // A MarkerNode's own glyph text (`\q1`) matches the literal-prefix regex, and the scrRef
  // "yank" can park the caret on a glyph — splicing there deletes the paragraph's marker and
  // trips the marker-deletion transform's merge machinery. Only plain text holds a typed literal.
  if (!$isTextNode(anchorNode) || $isMarkerNode(anchorNode)) return;

  const offset = selection.anchor.offset;
  const textBeforeCaret = anchorNode.getTextContent().slice(0, offset);
  const match = LITERAL_TRIGGER_PREFIX_REGEX.exec(textBeforeCaret);
  if (!match) return;

  anchorNode.spliceText(offset - match[0].length, match[0].length, "", true);
}

/**
 * Retags `para` in place: marker state AND the visible prefix glyph text change together,
 * content untouched — the PT9 reformat outcome for typing `\q1 `-style at a paragraph's
 * content start (committing the marker retags the paragraph itself; it does not create one).
 * `$applyParaMarker` owns the state/glyph agreement (including healing a paragraph whose
 * prefix went missing, when the marker mode is known).
 */
function $retagParagraph(para: ParaNode, marker: string, viewOptions?: ViewOptions): void {
  $applyParaMarker(para, marker, viewOptions);
  // Place the caret at the content side of the retagged prefix. In editable marker mode a
  // paragraph's children are laid out as [0] the marker-glyph node, [1] the trailing NBSP space,
  // and [2] the first content node — so index 2 is the content (the same layout assumption as
  // `$injectMarkerPrefix`). Element content (e.g. a red-letter `\wj` span first) and the
  // no-content case get an element point at that boundary rather than jumping to paragraph end.
  $selectParaContentStart(para);
}

/**
 * Applies a PARAGRAPH-kind menu pick per PT9's two semantics:
 * - Caret at the current paragraph's CONTENT START (the same probe that made the menu offer
 *   the paragraph source in the first place): RETAG the paragraph in place — PT9's reformat
 *   outcome for committing `\q1 ` at paragraph start.
 * - Anywhere mid-text: a paragraph marker starts a NEW paragraph at that point in PT9, so
 *   split via `$splitParagraphWithMarker`.
 *
 * Never routes through `getUsjMarkerAction`'s paragraph branch (insertParagraph + replace):
 * that path assumes a caret inside plain content and corrupts the tree when the caret sits in
 * or next to the visible marker prefix (the two-bogus-paragraph splice).
 *
 * Enter-trigger menus are split-only (PT9 SmartEnter starts a new paragraph even at content
 * start); their primary entry point is `EditorRef.splitParagraphWithMarker`, but a paragraph
 * item arriving here with `trigger: "enter"` routes to the split for the same reason.
 */
function $applyParagraphSelection(
  marker: string,
  trigger: "backslash" | "enter",
  viewOptions?: ViewOptions,
): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  // The FOCUS point is "the node the caret is in" — the live cursor end, correct even for a
  // backward range selection. Reading the anchor made a forward selection whose anchor sat at
  // paragraph content start silently retag the paragraph instead of splitting at the cursor.
  const focusNode = selection.focus.getNode();
  const para = $findMatchingParent(focusNode, $isParaNode);
  if (
    trigger === "backslash" &&
    para &&
    $isAtParagraphContentStart(para, focusNode, selection.focus.offset)
  ) {
    $retagParagraph(para, marker, viewOptions);
    return;
  }
  $splitParagraphWithMarker(marker, viewOptions);
}

/** Dependencies threaded through from `Editor.tsx`'s closure — the same values `insertMarker`
 * reuses for its own `getUsjMarkerAction` call. */
export interface ApplyMarkerMenuSelectionDeps {
  expandedNoteKeyRef: MutableRefObject<string | undefined>;
  viewOptions?: ViewOptions;
  nodeOptions?: UsjNodeOptions;
  logger?: LoggerBasic;
  /** Project stylesheet; decides NEST membership for nest-vs-split. */
  styleInfo?: StyleInfo;
}

/**
 * Commits the OPENING marker the user typed into a marker palette — the `EditorRef.commitTypedMarker`
 * implementation, shared by the palette's two opening-commit keys so they cannot drift.
 *
 * Materializes the SAME literal bytes passive typing would have accumulated (`\` + typedMarker,
 * plus a terminating space) and lets the marker-edit engine resolve them within this update. The
 * Space end states therefore hold by construction rather than by re-implementation.
 *
 * `trailingSpace: false` is the `\` commit: the palette commits what was typed and immediately
 * reopens for the backslash the user just pressed, so the separator is unnecessary — a marker-name
 * scan terminates at the next `\` (and at end-of-text) exactly as it does at a space. Measured:
 * `\nd` and `\nd ` settle to the same open span at a caret. The one place the two byte shapes
 * differ is mid-text with marker-name characters immediately following, where the unseparated
 * literal glues (`\nd` + `world` reads as marker `ndworld`); the reopened session's own commit
 * supplies the terminating `\` and resolves it, and if the user escapes instead, what remains is
 * exactly the bytes they typed — governing invariant I.
 *
 * Mutating: call inside `editor.update()`. Returns `false` without mutating when the selection is
 * not a COLLAPSED range selection — over a selection the palette's opening commit is the item WRAP
 * (`$applyMarkerMenuSelection`), and materializing bytes here would replace the selected text.
 */
export function $commitTypedMarker(
  typedMarker: string,
  options?: { trailingSpace?: boolean },
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  selection.insertText(`\\${typedMarker}${options?.trailingSpace === false ? "" : " "}`);
  return true;
}

/**
 * Commits a CLOSING marker — the `EditorRef.commitTypedCloser` implementation, and the ONE closer
 * path in the editor. Every way a user can ask for a closing marker arrives here: the `*` key in
 * the in-editor palette and in host-rendered ones, and a PICKED `closeTag` menu entry
 * ({@link $applyMarkerMenuSelection}), at a collapsed caret and over a selection alike.
 *
 * Unlike the Space commit (`EditorRef.commitTypedMarker`) this inserts NO opening glyph and NO
 * terminating space: `\` + typedMarker + `*` is the whole of what it commits. The bytes LAND and
 * the marker-edit engine re-tokenizes them — governing invariant I, displayed bytes are the
 * document. The engine, not this function, decides what they mean: against a matching open span
 * they settle as that span's real closer (the span loses `closed="false"` and gains its closing
 * glyph); with nothing matching they settle as an unmatched closer, flagged as typed. Both are the
 * correct end states for a closing marker, and they are byte-identical to what typing `\nd*` by
 * hand produced before palettes existed.
 *
 * Over a NON-COLLAPSED selection the selected content is DELETED and the closer takes its place —
 * Paratext 9's behavior for typing `\nd*` with text selected. Lexical's `insertText` already
 * replaces a non-collapsed range, so the delete and the insert are the same call; the resulting
 * closer is unmatched unless an open `\marker` precedes it, and the engine flags it as such.
 *
 * A picked entry used to run a STRUCTURAL close instead (a split-and-unwrap at the caret) at a
 * collapsed caret. That is gone, owner-directed: it produced no closer bytes at any caret
 * position, so nothing reached the file. Measured on `\p \v 1 \nd stuff and things` with the span
 * open — at the span's content end and past the span it mutated nothing at all (its "already
 * effectively closed" and "no matching span" branches both return without touching the document,
 * and the apply discarded the `false`), and mid-content it truncated the span in the tree while
 * still writing no `\nd*` and leaving `closed="false"` in place. Landing the literal is the only
 * arm that puts the closer on screen and in the saved document.
 *
 * Mutating: call inside `editor.update()`. Returns `false` without mutating only when there is no
 * range selection at all.
 */
export function $commitTypedCloser(typedMarker: string): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  // Non-collapsed: `insertText` removes the selected content first, which is exactly the
  // delete-then-insert this needs — one implementation serves both selection shapes.
  selection.insertText(`\\${typedMarker}*`);
  return true;
}

/**
 * Applies a marker-menu selection at the current editor selection (standard-view `\`/Enter
 * marker menus) — the `EditorRef.applyMarkerMenuSelection` implementation. Call inside
 * `editor.update()`.
 */
export function $applyMarkerMenuSelection(
  item: MarkerMenuItem,
  opts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean },
  reference: SerializedVerseRef,
  deps: ApplyMarkerMenuSelectionDeps,
): string | undefined {
  // LOUD guard: without a range selection (e.g. the palette click blurred the editor and nulled
  // it), the literal cleanup AND the insert paths below all silently no-op — the typed literal
  // then strands in the document and reaches the host's save as data. Hosts should restore
  // focus/selection before applying; this warning names the failure when they don't.
  if (!$isRangeSelection($getSelection()))
    deps.logger?.warn(
      "$applyMarkerMenuSelection: no range selection — cleanup/insert will no-op (editor blurred?)",
    );

  // Delete the literal `\marker` trigger prefix (when one landed) BEFORE any branch — including the
  // `closeTag` branch, so closing a char span via the passive `\` palette doesn't strand the trigger
  // `\` (and any typed filter chars) in the document. The wrap case (a non-collapsed selection)
  // arrives with `literalPrefixLanded: false`, so this stays a no-op there and `getUsjMarkerAction`'s
  // `$wrapTextSelectionInInlineNode` path still wraps the intact selection instead of a cleaned-up one.
  if (opts.literalPrefixLanded) $removeLiteralTriggerPrefix();

  if (item.kind === "closeTag") {
    // ONE closer implementation, for every selection shape and every caret position: a picked
    // close-tag entry lands the same literal `\marker*` bytes a typed closer does, and the
    // marker-edit engine re-tokenizes them (governing invariant I). `item.marker` is already the
    // endmarker (`nd*`, `+wj*`), so the trailing `*` comes off before the primitive puts it back;
    // a leading `+` is part of a nested closer's bytes and stays.
    $commitTypedCloser(item.marker.replace(/\*$/, ""));
    return;
  }

  // Inside an expanded note, `fp` is the footnote-paragraph BREAK — the same thing Enter does
  // there — not "open an \fp span at the caret". Routing it through the generic char-span
  // insertion instead split the \ft into a [head, empty \fp, tail] sandwich with the tail
  // stranded on the wrong side of the break, and the empty span then degraded to literal
  // `\fp` text under the note-content re-tokenization (a visual no-op with the typed literal
  // left in the content). `fp` is the only offered in-note marker with break semantics.
  // Outside expanded note content the handler declines without mutating and the generic
  // insertion below still applies; after a selection removal that destroyed the note
  // ("needs-plain-split") there is no note left to break, so the apply stops there rather
  // than inserting an \fp span outside any note.
  if (item.marker === "fp" && $handleEnterInNote() !== "declined") return;

  // Paragraph-kind picks that are real ParaNode markers retag or split (PT9 reformat
  // semantics). The sheet also types some non-para structural markers as "paragraph" (`c` —
  // chapter); those keep the structural action below, which handles them specially.
  if (item.kind === "paragraph" && ParaNode.isValidMarker(item.marker)) {
    $applyParagraphSelection(item.marker, opts.trigger, deps.viewOptions);
    return;
  }

  // Note markers insert directly (we are already inside `editor.update()`, so the action
  // wrapper's nested update would be QUEUED and its inserted-note key unavailable). The returned
  // TRUE Lexical key feeds the host's popover editing session directly, rather than having the
  // host re-derive it from delta-doc coordinates (getInsertedNodeKey) — a wrong key there makes
  // replaceEmbedUpdate silently no-op. Same reason EditorRef.insertMarker returns it.
  if (NoteNode.isValidMarker(item.marker)) {
    return $insertNoteForMarker(
      item.marker,
      reference,
      deps.expandedNoteKeyRef,
      deps.viewOptions,
      deps.nodeOptions,
      deps.logger,
    );
  }

  const markerAction = getUsjMarkerAction(
    item.marker,
    deps.expandedNoteKeyRef,
    deps.viewOptions,
    deps.nodeOptions,
    deps.logger,
    undefined,
    deps.styleInfo,
  );
  markerAction.action({ editor: $getEditor(), reference });
  return undefined;
}

/**
 * Splits the paragraph at the current caret, giving the NEW paragraph `marker` with its visible
 * prefix injected in the SAME update — the `EditorRef.splitParagraphWithMarker` implementation
 * (standard-view Enter-triggered marker menu apply step). Call inside `editor.update()`.
 *
 * The split runs directly here rather than dispatching `INSERT_PARAGRAPH_COMMAND`, so
 * `MarkerEditPlugin`'s command handler never runs and `context.splitExpected` stays untouched.
 * Setting the marker and injecting the visible prefix before this update commits keeps
 * `$paraMarkerDeletionTransform`'s no-prefix branches (which would otherwise merge the new
 * paragraph into the previous one, or reset it to `\p`) from firing when the transform runs
 * against the freshly split paragraph.
 *
 * A caret inside a character-style stack splits through `$splitParagraphAtCharStack` — the same
 * close-and-reopen Enter's INSERT_PARAGRAPH claim uses — so the tail keeps its markers and
 * nesting instead of degrading to the glyph-less continuation the deletion transform unwraps.
 * The primitive parks the caret INSIDE the innermost reopened span (typing continues the
 * reopened style), so the retag here must not re-park it: `$injectMarkerPrefix` alone only moves
 * a caret sitting at the paragraph's start, whereas `$setParaMarkerWithPrefix` would drag it
 * back to the content boundary ahead of the whole stack.
 *
 * When the view opted out of paragraph marker prefixes (`showParaMarkerPrefixes: false`), the
 * new paragraph gets its marker state WITHOUT the visible prefix — the same stand-down as the
 * deletion transform and `$applyParaMarker`, so no flow re-materializes bytes the option
 * promises are never built.
 */
export function $splitParagraphWithMarker(marker: string, viewOptions?: ViewOptions): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const showPrefix = showParaMarkerPrefix(viewOptions);

  if ($splitParagraphAtCharStack()) {
    const after = $getSelection();
    if (!$isRangeSelection(after)) return;
    const newPara = $findMatchingParent(after.anchor.getNode(), $isParaNode);
    if (!newPara) return;
    newPara.setMarker(marker);
    if (showPrefix) $injectMarkerPrefix(newPara);
    return;
  }

  const newPara = selection.insertParagraph();
  if (!$isParaNode(newPara)) return;

  if (showPrefix) $setParaMarkerWithPrefix(newPara, marker);
  else newPara.setMarker(marker);
}
