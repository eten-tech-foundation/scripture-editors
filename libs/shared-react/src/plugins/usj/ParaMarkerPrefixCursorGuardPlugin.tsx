import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { useEffect } from "react";
import {
  $isMarkerNode,
  $isSomeParaNode,
  $isSynthesizedMarkerNode,
  NBSP,
  SomeParaNode,
} from "shared";
import { $isImmutableVerseNode, $isSomeVerseNode } from "../../nodes/usj";

/**
 * Intercepts clicks that land in para-marker prefix territory and nudges the cursor to the first
 * content position in the same update cycle. Only collapsed selections are adjusted; range
 * selections (multi-character) are left alone.
 *
 * Using `CLICK_COMMAND` instead of `registerUpdateListener` + `editor.update` ensures the
 * correction is committed in a single cycle — other listeners (e.g. `OnSelectionChangePlugin`)
 * see only the corrected cursor, never the intermediate prefix position.
 */
export function ParaMarkerPrefixCursorGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $guardCursorAtParaStart(selection);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}

/**
 * Advances the cursor past all structural prefix nodes at the start of `para`:
 * - Para-marker prefix (`MarkerNode` or `ImmutableTypedTextNode`) and its trailing NBSP.
 * - Leading verse nodes (`VerseNode` or `ImmutableVerseNode`).
 * - The `LineBreakNode` the adaptor emits before each verse when `hasSpacing` is false (Power
 *   mode's own setting), which otherwise stops the walk on the marker line, before the break.
 *
 * Places the cursor at the start of the first content `TextNode` that follows, or at the
 * element offset just after all skipped nodes when no content `TextNode` exists yet.
 *
 * Also called directly when programmatically navigating to a verse whose paragraph has a
 * non-text first child (e.g. in `ScriptureReferencePlugin`).
 */
export function $advancePastParaPrefixes(para: SomeParaNode): boolean {
  let child: LexicalNode | null = para.getFirstChild();
  let skipCount = 0;

  while (child !== null) {
    if ($isSynthesizedMarkerNode(child)) {
      skipCount++;
      child = child.getNextSibling();
      // In editable mode the para-marker prefix is followed by a NBSP TextNode (marker-trailing-space).
      if ($isTextNode(child) && child.getTextContent() === NBSP) {
        skipCount++;
        child = child.getNextSibling();
      }
    } else if ($isSomeVerseNode(child) || $isLineBreakNode(child)) {
      skipCount++;
      child = child.getNextSibling();
    } else {
      break;
    }
  }

  if (skipCount === 0) return false;

  if ($isTextNode(child)) {
    child.select(0, 0);
  } else {
    para.select(skipCount, skipCount);
  }
  return true;
}

/**
 * Corrects the cursor when it lands before or inside a para-marker prefix at the start of a
 * paragraph. Two bad positions are handled:
 *
 * 1. Element-typed anchor at offset 0 in a `ParaNode` whose first child is a para-marker prefix
 *    (`MarkerNode` or `ImmutableTypedTextNode`) or an `ImmutableVerseNode`. This happens when
 *    the user clicks in the hanging-indent gutter of any marker that sets a negative
 *    `text-indent` (e.g. `\li`, `\li1`, `\li2`, `\ili`, `\ili1`, `\ili2`, and poetry markers).
 *
 * 2. Text-typed anchor inside a `MarkerNode` that is the first child of a `ParaNode`. This
 *    happens in Power mode when the user clicks on the visible marker text.
 *
 * In both cases the cursor is advanced past all structural prefix nodes (para-marker prefix,
 * trailing NBSP, and leading verse nodes) to the first content `TextNode`, or to the element
 * offset just after all those structural nodes when no content `TextNode` follows yet.
 *
 * Returns `true` if the selection was corrected, `false` if no correction was needed.
 *
 * Exported only for direct unit testing; production callers reach it through
 * `ParaMarkerPrefixCursorGuardPlugin`.
 */
export function $guardCursorAtParaStart(selection: RangeSelection): boolean {
  if (!selection.isCollapsed()) return false;
  const { anchor } = selection;

  // Case 1: element anchor at offset 0 in a ParaNode whose first child blocks content insertion.
  if (anchor.type === "element" && anchor.offset === 0) {
    const para = $getNodeByKey(anchor.key);
    if (!$isSomeParaNode(para)) return false;
    const first = para.getFirstChild();
    if (!$isSynthesizedMarkerNode(first) && !$isImmutableVerseNode(first)) return false;
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
