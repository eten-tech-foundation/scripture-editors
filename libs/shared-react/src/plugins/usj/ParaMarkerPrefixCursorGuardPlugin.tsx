import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { useEffect } from "react";
import { ViewOptions } from "../../views/view-options.utils";
import {
  $isMarkerNode,
  $isSomeParaNode,
  $isSynthesizedMarkerNode,
  $placeCaretAtBoundary,
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
export function ParaMarkerPrefixCursorGuardPlugin({
  viewOptions,
}: {
  viewOptions?: ViewOptions;
}): null {
  const [editor] = useLexicalComposerContext();
  // Whether a paragraph's marker renders INLINE, as editable text in the flow, rather than in the
  // gutter. That single fact decides whether the prefix is caret territory at all, so it has to
  // reach the guard — see `$guardCursorAtParaStart`.
  const markersAreInline = viewOptions?.markerMode === "editable";

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $guardCursorAtParaStart(selection, markersAreInline);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, markersAreInline]);

  return null;
}

/**
 * Advances the cursor past all structural prefix nodes at the start of `para`:
 * - Para-marker prefix (`MarkerNode` or `ImmutableTypedTextNode`) and its trailing NBSP.
 * - Leading verse nodes (`VerseNode` or `ImmutableVerseNode`).
 *
 * Places the cursor at the content boundary just past them, under the shared convention for what a
 * boundary's caret position is (`$placeCaretAtBoundary`): the start of the first content `TextNode`
 * that follows, or an element point at that boundary when no `TextNode` hosts it yet.
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
    } else if ($isSomeVerseNode(child)) {
      skipCount++;
      child = child.getNextSibling();
    } else {
      break;
    }
  }

  if (skipCount === 0) return false;

  $placeCaretAtBoundary(para, skipCount);
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
export function $guardCursorAtParaStart(
  selection: RangeSelection,
  markersAreInline: boolean,
): boolean {
  if (!selection.isCollapsed()) return false;
  // Inline markers (markerMode "editable", e.g. Standard view) are ordinary editable content: the
  // user clicks into them ON PURPOSE to edit the marker, and the arrow normalizer traverses them a
  // grapheme at a time. Correcting a click there would both fight that intent and make a position
  // the keyboard can reach unreachable by mouse. Only a marker rendered OUTSIDE the flow — the
  // gutter — is territory no caret should rest in.
  if (markersAreInline) return false;
  const { anchor } = selection;

  // Case 1: element anchor at offset 0 in a ParaNode whose first child blocks content insertion.
  if (anchor.type === "element" && anchor.offset === 0) {
    const para = $getNodeByKey(anchor.key);
    if (!$isSomeParaNode(para)) return false;
    const first = para.getFirstChild();
    if (!$isSynthesizedMarkerNode(first) && !$isImmutableVerseNode(first)) return false;
    return $advancePastParaPrefixes(para);
  }

  // Case 2: a text anchor inside the marker itself. Only reachable for the inline flavor, which
  // returns above — kept because a `MarkerNode` can still be the anchor when a mode change leaves
  // one in the tree while this guard is already scoped to non-inline rendering.
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
