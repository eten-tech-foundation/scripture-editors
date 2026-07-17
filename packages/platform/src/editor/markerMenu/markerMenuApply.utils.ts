/**
 * Marker-menu apply — turns a `MarkerMenuItem` selection into an editor mutation.
 * Port of PT9's `MarkerDropdownEditHandler`/`KeyPressEditHandler` "apply" step
 * (`MarkerDropdownEditHandler.cs`), adapted to the Lexical tree:
 * - `applyMarkerMenuSelection` — character/note ("open") kinds run the existing
 *   structural-insert action (`getUsjMarkerAction`), first deleting a literal `\marker` trigger
 *   prefix typed before the caret when one landed (`MarkerDropdownControl.cs:216-219`);
 *   paragraph kinds retag the current paragraph at content start or split it mid-text (PT9
 *   reformat semantics — see `$applyParagraphSelection`); `closeTag` kind closes the matching
 *   open character span instead (`$closeCharSpanAtCaret`, `../markerEdit/charFormatting.utils`).
 * - `splitParagraphWithMarker` — the Enter-triggered marker menu's apply step: splits the
 *   paragraph at the caret and gives the new paragraph the chosen marker.
 *
 * Both are called from `EditorRef.applyMarkerMenuSelection`/`EditorRef.splitParagraphWithMarker`
 * (`Editor.tsx`) inside `editor.update(...)`.
 */
import { getUsjMarkerAction } from "../adaptors/usj-marker-action.utils";
import { $closeCharSpanAtCaret } from "../markerEdit/charFormatting.utils";
import {
  $injectMarkerPrefix,
  $selectParaContentStart,
} from "../markerEdit/markerEditDeletion.utils";
import { MarkerMenuItem } from "./markerItemSource";
import { $isAtParagraphContentStart } from "./markerMenuContext.utils";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $getEditor, $getSelection, $isRangeSelection, $isTextNode, LexicalNode } from "lexical";
import { $isMarkerNode, $isParaNode, LoggerBasic, openingMarkerText, ParaNode } from "shared";
import { UsjNodeOptions, ViewOptions } from "shared-react";
import { MutableRefObject } from "react";

/** PT9 marker characters typed after the `\` trigger (MarkerDropdownControl.cs:216-219). */
const LITERAL_TRIGGER_PREFIX_REGEX = /\\[a-z0-9+*]*$/i;

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

/** Nearest `ParaNode` ancestor of `node` (including `node` itself), or `undefined`. */
function $findNearestParaNode(node: LexicalNode): ParaNode | undefined {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isParaNode(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

/**
 * Retags `para` in place: marker state AND the visible prefix glyph text change together,
 * content untouched — the PT9 reformat outcome for typing `\q1 `-style at a paragraph's
 * content start (committing the marker retags the paragraph itself; it does not create one).
 */
function $retagParagraph(para: ParaNode, marker: string): void {
  para.setMarker(marker);
  const first = para.getFirstChild();
  if ($isMarkerNode(first)) {
    first.setMarker(marker);
    first.setTextContent(openingMarkerText(marker));
  }
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
function $applyParagraphSelection(marker: string, trigger: "backslash" | "enter"): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const anchorNode = selection.anchor.getNode();
  const para = $findNearestParaNode(anchorNode);
  if (
    trigger === "backslash" &&
    para &&
    $isAtParagraphContentStart(para, anchorNode, selection.anchor.offset)
  ) {
    $retagParagraph(para, marker);
    return;
  }
  $splitParagraphWithMarker(marker);
}

/** Dependencies threaded through from `Editor.tsx`'s closure — the same values `insertMarker`
 * reuses for its own `getUsjMarkerAction` call. */
export interface ApplyMarkerMenuSelectionDeps {
  expandedNoteKeyRef: MutableRefObject<string | undefined>;
  viewOptions?: ViewOptions;
  nodeOptions?: UsjNodeOptions;
  logger?: LoggerBasic;
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
): void {
  // Delete the literal `\marker` trigger prefix (when one landed) BEFORE any branch — including the
  // `closeTag` branch, so closing a char span via the passive `\` palette doesn't strand the trigger
  // `\` (and any typed filter chars) in the document. The wrap case (a non-collapsed selection)
  // arrives with `literalPrefixLanded: false`, so this stays a no-op there and `getUsjMarkerAction`'s
  // `$wrapTextSelectionInInlineNode` path still wraps the intact selection instead of a cleaned-up one.
  if (opts.literalPrefixLanded) $removeLiteralTriggerPrefix();

  if (item.kind === "closeTag") {
    $closeCharSpanAtCaret(item.marker.replace(/^\+/, ""));
    return;
  }

  // Paragraph-kind picks that are real ParaNode markers retag or split (PT9 reformat
  // semantics). The sheet also types some non-para structural markers as "paragraph" (`c` —
  // chapter); those keep the structural action below, which handles them specially.
  if (item.kind === "paragraph" && ParaNode.isValidMarker(item.marker)) {
    $applyParagraphSelection(item.marker, opts.trigger);
    return;
  }

  const markerAction = getUsjMarkerAction(
    item.marker,
    deps.expandedNoteKeyRef,
    deps.viewOptions,
    deps.nodeOptions,
    deps.logger,
  );
  markerAction.action({ editor: $getEditor(), reference });
}

/**
 * Splits the paragraph at the current caret, giving the NEW paragraph `marker` with its visible
 * prefix injected in the SAME update — the `EditorRef.splitParagraphWithMarker` implementation
 * (standard-view Enter-triggered marker menu apply step). Call inside `editor.update()`.
 *
 * `selection.insertParagraph()` is called directly here rather than dispatching
 * `INSERT_PARAGRAPH_COMMAND`, so `MarkerEditPlugin`'s command handler never runs and
 * `context.splitExpected` stays untouched. Setting the marker and injecting the visible prefix
 * before this update commits keeps `$paraMarkerDeletionTransform`'s no-prefix branches (which
 * would otherwise merge the new paragraph into the previous one, or reset it to `\p`) from
 * firing when the transform runs against the freshly split paragraph.
 */
export function $splitParagraphWithMarker(marker: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const newPara = selection.insertParagraph();
  if (!$isParaNode(newPara)) return;

  newPara.setMarker(marker);
  $injectMarkerPrefix(newPara);
}
