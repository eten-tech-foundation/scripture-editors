/**
 * §5.5 marker-menu apply — turns a `MarkerMenuItem` (Task 1) selection into an editor mutation.
 * Port of PT9's `MarkerDropdownEditHandler`/`KeyPressEditHandler` "apply" step
 * (`MarkerDropdownEditHandler.cs`), adapted to the Lexical tree:
 * - `applyMarkerMenuSelection` — paragraph/character/note ("open") kinds run the existing
 *   structural-insert action (`getUsjMarkerAction`), first deleting a literal `\marker` trigger
 *   prefix typed before the caret when one landed (`MarkerDropdownControl.cs:216-219`);
 *   `closeTag` kind closes the matching open character span instead
 *   (`$closeCharSpanAtCaret`, `../markerEdit/charFormatting.utils`).
 * - `splitParagraphWithMarker` — the Enter-triggered marker menu's apply step: splits the
 *   paragraph at the caret and gives the new paragraph the chosen marker.
 *
 * Both are called from `EditorRef.applyMarkerMenuSelection`/`EditorRef.splitParagraphWithMarker`
 * (`Editor.tsx`) inside `editor.update(...)`.
 */
import { getUsjMarkerAction } from "../adaptors/usj-marker-action.utils";
import { $closeCharSpanAtCaret } from "../markerEdit/charFormatting.utils";
import { $injectMarkerPrefix } from "../markerEdit/markerEditDeletion.utils";
import { MarkerMenuItem } from "./markerItemSource";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $getEditor, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { $isParaNode, LoggerBasic } from "shared";
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
  if (!$isTextNode(anchorNode)) return;

  const offset = selection.anchor.offset;
  const textBeforeCaret = anchorNode.getTextContent().slice(0, offset);
  const match = LITERAL_TRIGGER_PREFIX_REGEX.exec(textBeforeCaret);
  if (!match) return;

  anchorNode.spliceText(offset - match[0].length, match[0].length, "", true);
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
  if (item.kind === "closeTag") {
    $closeCharSpanAtCaret(item.marker.replace(/^\+/, ""));
    return;
  }

  // Wrap case (a non-collapsed selection lands here with `literalPrefixLanded: false`): skip
  // cleanup so `getUsjMarkerAction`'s `$wrapTextSelectionInInlineNode` path wraps the intact
  // selection instead of a post-cleanup one.
  if (opts.literalPrefixLanded) $removeLiteralTriggerPrefix();

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
