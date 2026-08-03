import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { useEffect } from "react";
import { $isMarkerNode, $isParaMarkerPrefix, $isSomeParaNode, NBSP, SomeParaNode } from "shared";
import { $isSomeVerseNode } from "../../nodes/usj";

/**
 * Corrects the cursor when it lands before or inside the structural prefix at the start of a
 * paragraph. Two bad positions are handled:
 *
 * 1. Element-typed anchor at offset 0 in a `ParaNode` whose first child is a para-marker prefix
 *    (`MarkerNode` or `ImmutableTypedTextNode`) or a verse node (`VerseNode`/`ImmutableVerseNode`).
 *    A hanging-indent marker (negative `text-indent` — `\li`, `\q`, `\ili`, …) is the common
 *    trigger, since its gutter is left of the content; a leading verse is skipped too, so a click
 *    at the very start of a verse-initial paragraph lands on the content rather than before the
 *    verse number.
 *
 * 2. Text-typed anchor inside a `MarkerNode` that is the first child of a `ParaNode`. This
 *    happens in Power mode when the user clicks on the visible marker text.
 *
 * In both cases the cursor is advanced past all structural prefix nodes (para-marker prefix,
 * trailing NBSP, and leading verse nodes) to the first content `TextNode`, or to the element
 * offset just after those nodes when no content `TextNode` follows yet.
 *
 * Returns `true` if the selection was corrected, `false` if no correction was needed.
 */
export function $guardCursorAtParaStart(selection: RangeSelection): boolean {
  if (!selection.isCollapsed()) return false;
  const { anchor } = selection;

  // Case 1: element anchor at offset 0 in a ParaNode. $advancePastParaPrefixes no-ops (returns
  // false) when the first child isn't a prefix/verse, so it also serves as the "is this a bad
  // position?" test.
  if (anchor.type === "element" && anchor.offset === 0) {
    const para = $getNodeByKey(anchor.key);
    if (!$isSomeParaNode(para)) return false;
    return $advancePastParaPrefixes(para);
  }

  // Case 2: text anchor inside a MarkerNode that is the first child of a ParaNode.
  if (anchor.type === "text") {
    const anchorNode = $getNodeByKey(anchor.key);
    if (!$isMarkerNode(anchorNode)) return false;
    const para = anchorNode.getParent();
    if (!$isSomeParaNode(para)) return false;
    if (anchorNode !== para.getFirstChild()) return false;
    return $advancePastParaPrefixes(para);
  }

  return false;
}

/**
 * Advances the cursor past all structural prefix nodes at the start of `para`:
 * - Para-marker prefix (`MarkerNode` or `ImmutableTypedTextNode`) and its trailing NBSP.
 * - Leading verse nodes (`VerseNode` or `ImmutableVerseNode`).
 *
 * Places the cursor at the start of the first content `TextNode` that follows, or at the element
 * offset just after all skipped nodes when no content `TextNode` exists yet.
 *
 * Also called directly when programmatically navigating to a verse whose paragraph has a
 * non-text first child (e.g. in `ScriptureReferencePlugin`). Returns `true` if it moved the
 * cursor, `false` when there were no prefixes to skip.
 */
export function $advancePastParaPrefixes(para: SomeParaNode): boolean {
  let child: LexicalNode | null = para.getFirstChild();

  while (child !== null) {
    if ($isParaMarkerPrefix(child)) {
      const next = child.getNextSibling();
      // In editable mode the para-marker prefix is followed by a NBSP TextNode (marker-trailing-space).
      child = $isTextNode(next) && next.getTextContent() === NBSP ? next.getNextSibling() : next;
    } else if ($isSomeVerseNode(child)) {
      child = child.getNextSibling();
    } else {
      break;
    }
  }

  // `child` is the first non-prefix node (or null when the para is all prefixes). Its index within
  // the para equals the number of prefix children skipped, so offset 0 means nothing was skipped.
  const offset = child ? child.getIndexWithinParent() : para.getChildrenSize();
  if (offset === 0) return false;

  if ($isTextNode(child)) child.select(0, 0);
  else para.select(offset, offset);
  return true;
}

/**
 * Places the caret at a paragraph's first content position, skipping any para-marker/verse
 * prefix, and falls back to the node's start when there is no prefix (or the node isn't a
 * paragraph). Use this at every programmatic cursor-placement site instead of a bare
 * `selectStart()`, so a new call site can't reintroduce the land-inside-the-prefix bug.
 */
export function $selectParaContentStart(node: LexicalNode | null | undefined): void {
  if ($isSomeParaNode(node)) {
    if (!$advancePastParaPrefixes(node)) node.selectStart();
  } else if ($isElementNode(node)) {
    node.selectStart();
  }
}

/**
 * The `CLICK_COMMAND` handler that {@link ParaMarkerPrefixCursorGuardPlugin} registers. Exported
 * so tests exercise the real handler instead of a copy. Returns `false` so the click keeps
 * propagating to other handlers.
 */
export function $guardCursorAtParaStartOnClick(): boolean {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) $guardCursorAtParaStart(selection);
  return false;
}

/**
 * Corrects clicks that land in para-marker prefix territory, nudging the cursor to the first
 * content position in the same update cycle. Only collapsed selections are adjusted; range
 * selections (multi-character) are left alone.
 *
 * Handles only click-driven placement. Programmatic placement (verse navigation, paragraph
 * merges, marker insertion, arrow navigation past a note) calls {@link $selectParaContentStart}
 * or {@link $advancePastParaPrefixes} directly at each site.
 *
 * Using `CLICK_COMMAND` instead of `registerUpdateListener` + `editor.update` ensures the
 * correction is committed in a single cycle — other listeners (e.g. `OnSelectionChangePlugin`)
 * see only the corrected cursor, never the intermediate prefix position.
 *
 * Related but distinct: `ParaMarkerPrefixGuardPlugin` (platform) reverts a paragraph to `\p` when
 * its marker is deleted — a different concern that shares the "para marker prefix" vocabulary.
 */
export function ParaMarkerPrefixCursorGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      $guardCursorAtParaStartOnClick,
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
