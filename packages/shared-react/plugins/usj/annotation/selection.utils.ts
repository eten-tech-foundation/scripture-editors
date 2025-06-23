import {
  indexesFromUsjJsonPath,
  usjJsonPathFromIndexes,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createPoint,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import { AnnotationRange, SelectionRange, UsjLocation } from "./selection.model";
import { $isTypedMarkNode } from "shared/nodes/features/TypedMarkNode";

/**
 * Find the text node that contains the location offset. Check if the offset fits within the current
 * text node, if it doesn't check in the next nodes ignoring the TypedMarkNodes but looking inside
 * as if the text was contiguous.
 * @param node - Current text node.
 * @param offset - Annotation location offset.
 * @returns the text node and offset where the offset was found in.
 */
function $findTextNodeInMarks(
  node: LexicalNode | undefined,
  offset: number,
): [TextNode | undefined, number | undefined] {
  if (!node || !$isTextNode(node)) return [undefined, undefined];

  const text = node.getTextContent();
  if (offset >= 0 && offset < text.length) return [node, offset];

  let nextNode = node.getNextSibling();
  if (!nextNode) {
    const parent = node.getParent();
    if ($isTypedMarkNode(parent)) nextNode = parent.getNextSibling();
  }
  if (!nextNode || (!$isTypedMarkNode(nextNode) && !$isTextNode(nextNode)))
    return [undefined, undefined];

  const nextOffset = offset - text.length;
  if (nextNode && $isTextNode(nextNode)) return $findTextNodeInMarks(nextNode, nextOffset);

  return $findTextNodeInMarks(nextNode.getFirstChild() ?? undefined, nextOffset);
}

function $getNodeFromLocation(
  location: UsjLocation,
): [LexicalNode | undefined, number | undefined] {
  const jsonPathIndexes = indexesFromUsjJsonPath(location.jsonPath);
  let currentNode: LexicalNode | undefined = $getRoot();
  for (const index of jsonPathIndexes) {
    if (!currentNode || !$isElementNode(currentNode)) return [undefined, undefined];

    currentNode = currentNode.getChildAtIndex(index) ?? undefined;
  }

  return $findTextNodeInMarks(currentNode, location.offset);
}

function $getPointType(node: LexicalNode | undefined): "text" | "element" {
  return $isElementNode(node) ? "element" : "text";
}

/**
 * Converts a SelectionRange or AnnotationRange to a RangeSelection.
 *
 * This function takes a selection object and creates a corresponding RangeSelection in the Lexical
 * editor. It determines the start and end nodes based on the provided selection range and creates
 * a new RangeSelection with appropriate anchor and focus points.
 *
 * @param selection - The selection range to convert. Can be either a SelectionRange or
 *   AnnotationRange.
 * @returns A new RangeSelection object if the conversion is successful, or `undefined` if the
 *   required nodes or offsets cannot be found.
 *
 * @remarks
 * - If the 'end' property of the selection is undefined (indicating this is a location rather than
 *   a range), it defaults to the 'start' value.
 * - If either the start or end node cannot be found, or if their offsets are undefined, the
 *   function returns undefined.
 */
export function $getRangeFromSelection(
  selection: SelectionRange | AnnotationRange,
): RangeSelection | undefined {
  const { start } = selection;
  let { end } = selection;
  if (end === undefined) end = start;

  // Find the start and end nodes with offsets based on the location.
  const [startNode, startOffset] = $getNodeFromLocation(start);
  const [endNode, endOffset] = $getNodeFromLocation(end);
  if (!startNode || !endNode || startOffset === undefined || endOffset === undefined)
    return undefined;

  // Create selection range.
  const rangeSelection = $createRangeSelection();
  rangeSelection.anchor = $createPoint(startNode.getKey(), startOffset, $getPointType(startNode));
  rangeSelection.focus = $createPoint(endNode.getKey(), endOffset, $getPointType(endNode));
  return rangeSelection;
}

function getLocationFromNode(node: LexicalNode, offset: number): UsjLocation {
  const jsonPathIndexes: number[] = [];
  let current: LexicalNode | null = node;
  while (current?.getParent()) {
    const parent: ElementNode | null = current.getParent();
    if (parent) {
      const index = parent?.getChildren().indexOf(current);
      if (index >= 0) jsonPathIndexes.unshift(index);
    }
    current = parent;
  }
  return { jsonPath: usjJsonPathFromIndexes(jsonPathIndexes), offset };
}

/**
 * Retrieves the current selection range from the editor.
 *
 * This function extracts the selection range from the editor's current state. It handles both
 * forward and backward selections, as well as collapsed (single point) selections.
 *
 * @returns A `SelectionRange` object containing the start and end positions of the selection, or
 *   `undefined` if there is no valid range selection.
 */
export function $getRangeFromEditor(): SelectionRange | undefined {
  const editorSelection = $getSelection();
  if (!editorSelection || !$isRangeSelection(editorSelection)) return;

  const startNode = editorSelection.isBackward()
    ? editorSelection.focus.getNode()
    : editorSelection.anchor.getNode();
  const startOffset = editorSelection.isBackward()
    ? editorSelection.focus.offset
    : editorSelection.anchor.offset;
  const start = getLocationFromNode(startNode, startOffset);
  if (editorSelection.isCollapsed()) return { start };

  const endNode = editorSelection.isBackward()
    ? editorSelection.anchor.getNode()
    : editorSelection.focus.getNode();
  const endOffset = editorSelection.isBackward()
    ? editorSelection.anchor.offset
    : editorSelection.focus.offset;
  const end = getLocationFromNode(endNode, endOffset);

  return { start, end };
}
