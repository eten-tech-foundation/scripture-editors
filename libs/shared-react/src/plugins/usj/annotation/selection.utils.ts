import { $isParaLikeNode } from "../collab/delta-common.utils";
import { AnnotationRange, SelectionRange } from "./selection.model";
import {
  type PropertyJsonPath,
  type UsjClosingMarkerLocation,
  type UsjDocumentLocation,
  type UsjMarkerLocation,
  type UsjPropertyValueLocation,
  getUsjDocumentLocationTypeName,
  indexesFromUsjJsonPath,
  isUsjAttributeKeyLocation,
  isUsjAttributeMarkerLocation,
  isUsjClosingAttributeMarkerLocation,
  isUsjClosingMarkerLocation,
  isUsjMarkerLocation,
  isUsjPropertyValueLocation,
  isUsjTextContentLocation,
  usjJsonPathFromIndexes,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createPoint,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $isMarkerNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  ImmutableTypedTextNode,
  MarkerNode,
  textTypeState,
} from "shared";

/**
 * Converts a USJ SelectionRange or AnnotationRange to an editor RangeSelection.
 *
 * This function takes a USJ selection object and creates a corresponding editor RangeSelection.
 * It determines the start and end nodes based on the provided selection range and creates a new
 * RangeSelection with appropriate anchor and focus points.
 *
 * @param selection - The USJ selection range to convert. Can be either a SelectionRange or
 *   AnnotationRange.
 * @returns A new editor RangeSelection object if the conversion is successful, or `undefined` if
 *   the required nodes or offsets cannot be found.
 *
 * @remarks
 * - If the 'end' property of the selection is undefined (indicating this is a location rather than
 *   a range), it defaults to the 'start' value.
 * - If either the start or end node cannot be found, or if their offsets are undefined, the
 *   function returns undefined.
 */
export function $getRangeFromUsjSelection(
  selection: SelectionRange | AnnotationRange,
): RangeSelection | undefined {
  const { start } = selection;
  let { end } = selection;
  end ??= start;

  // Find the start and end nodes with offsets based on the location.
  let [startNode, startOffset] = $getNodeFromLocation(start);
  let [endNode, endOffset] = $getNodeFromLocation(end);
  if (!startNode || !endNode || startOffset === undefined || endOffset === undefined)
    return undefined;

  [startNode, startOffset] = $normalizeVisibleMarkerPoint(startNode, startOffset);
  [endNode, endOffset] = $normalizeVisibleMarkerPoint(endNode, endOffset);

  // Create selection range.
  const editorSelection = $createRangeSelection();
  editorSelection.anchor = $createPoint(startNode.getKey(), startOffset, $getPointType(startNode));
  editorSelection.focus = $createPoint(endNode.getKey(), endOffset, $getPointType(endNode));
  return editorSelection;
}

/**
 * Retrieves the current USJ selection range from the editor.
 *
 * This function extracts the selection range from the editor's current state. It handles both
 * forward and backward selections, as well as collapsed (single point) selections.
 *
 * @returns A USJ `SelectionRange` object containing the start and end positions of the selection,
 *   or `undefined` if there is no valid range selection.
 */
export function $getUsjSelectionFromEditor(): SelectionRange | undefined {
  const editorSelection = $getSelection();
  if (!editorSelection || !$isRangeSelection(editorSelection)) return;

  const startNode = editorSelection.isBackward()
    ? editorSelection.focus.getNode()
    : editorSelection.anchor.getNode();
  const startOffset = editorSelection.isBackward()
    ? editorSelection.focus.offset
    : editorSelection.anchor.offset;
  const start = $getLocationFromNode(startNode, startOffset);
  if (editorSelection.isCollapsed()) return { start };

  const endNode = editorSelection.isBackward()
    ? editorSelection.anchor.getNode()
    : editorSelection.focus.getNode();
  const endOffset = editorSelection.isBackward()
    ? editorSelection.anchor.offset
    : editorSelection.focus.offset;
  const end = $getLocationFromNode(endNode, endOffset);

  return { start, end };
}

function $getNodeFromLocation(
  location: UsjDocumentLocation,
): [LexicalNode | undefined, number | undefined] {
  // Handle UsjTextContentLocation first (most common case)
  if (isUsjTextContentLocation(location)) {
    const jsonPathIndexes = indexesFromUsjJsonPath(location.jsonPath);
    let currentNode: LexicalNode | undefined = $getRoot();
    for (const index of jsonPathIndexes) {
      if (!currentNode || !$isElementNode(currentNode)) return [undefined, undefined];

      currentNode = $getContentChildAtIndex(currentNode, index);
    }

    // If we landed on a TypedMarkNode (annotation wrapper), unwrap it to get the actual content
    if (currentNode && $isTypedMarkNode(currentNode)) {
      currentNode = currentNode.getFirstChild() ?? undefined;
    }

    // If the jsonPath resolves to an ElementNode (e.g. "$.content[0]"), interpret offset as a
    // content-based child boundary offset (what the editor can emit), and return an element point.
    if (currentNode && $isElementNode(currentNode)) {
      const elementOffset = $getElementOffsetFromContentOffset(currentNode, location.offset);
      return [currentNode, elementOffset];
    }

    return $findTextNodeInMarks(currentNode, location.offset);
  }

  // Handle UsjAttributeKeyLocation and UsjAttributeMarkerLocation BEFORE UsjMarkerLocation
  // because UsjAttributeMarkerLocation has keyName but no offsets, similar to UsjMarkerLocation.
  // Checking for keyName first ensures correct type narrowing.
  // Note: Attribute markers are not yet represented in the editor, so we position at the closest
  // available location (the end of the element's content, since attributes come after content).
  if (isUsjAttributeKeyLocation(location) || isUsjAttributeMarkerLocation(location)) {
    const node = $navigateToNode(location.jsonPath);
    if (!node) return [undefined, undefined];

    // For ElementNodes, position at end of last text child
    if ($isElementNode(node)) {
      const lastChild = node.getLastChild();
      if (lastChild && $isTextNode(lastChild))
        return [lastChild, lastChild.getTextContent().length];
    }

    // For decorator nodes (e.g., ImmutableChapterNode) or elements with no children,
    // position at the start of the next sibling
    const nextSibling = node.getNextSibling();
    if (nextSibling && $isElementNode(nextSibling)) return [nextSibling, 0];

    return [undefined, undefined];
  }

  // Handle UsjClosingAttributeMarkerLocation BEFORE UsjMarkerLocation/UsjClosingMarkerLocation.
  // Note: Attribute markers are not yet represented in the editor, so we position at the closest
  // available location (the end of the element's content).
  if (isUsjClosingAttributeMarkerLocation(location)) {
    const node = $navigateToNode(location.jsonPath);
    if (!node) return [undefined, undefined];

    // For ElementNodes, position at end of last text child if it exists
    if ($isElementNode(node)) {
      const lastChild = node.getLastChild();
      if (lastChild && $isTextNode(lastChild))
        return [lastChild, lastChild.getTextContent().length];
    }

    // For decorator nodes (e.g., ImmutableChapterNode) or elements with no children,
    // position at the start of the next sibling
    const nextSibling = node.getNextSibling();
    if (nextSibling && $isElementNode(nextSibling)) return [nextSibling, 0];

    return [undefined, undefined];
  }

  // Handle UsjMarkerLocation - position at the beginning of the opening marker
  if (isUsjMarkerLocation(location)) {
    const node = $navigateToNode(location.jsonPath);
    if (!node || !$isElementNode(node)) return [undefined, undefined];

    const markerNode = $findMarkerNode(node, "opening");
    if (markerNode) return [markerNode, 0];

    // Fallback: if no marker node, position at start of first child
    const firstChild = node.getFirstChild();
    if (firstChild && $isTextNode(firstChild)) return [firstChild, 0];

    return [undefined, undefined];
  }

  // Handle UsjClosingMarkerLocation - position within the closing marker
  if (isUsjClosingMarkerLocation(location)) {
    const node = $navigateToNode(location.jsonPath);
    if (!node || !$isElementNode(node)) return [undefined, undefined];

    const markerNode = $findMarkerNode(node, "closing");
    if (markerNode) {
      // Validate offset is within bounds
      const text = markerNode.getTextContent();
      const offset = Math.min(location.closingMarkerOffset, text.length);
      return [markerNode, offset];
    }
    // Fallback: if no closing marker, position at end of last text child
    const lastChild = node.getLastChild();
    if (lastChild && $isTextNode(lastChild)) return [lastChild, lastChild.getTextContent().length];

    return [undefined, undefined];
  }

  // Handle UsjPropertyValueLocation - position within a property value (e.g., marker name)
  if (isUsjPropertyValueLocation(location)) {
    // Extract the property name from the jsonPath (e.g., "$.content[0].marker" -> "marker")
    const propertyMatch = location.jsonPath.match(/\.(\w+)$|^\$\.(\w+)$|\['([^']+)'\]$/);
    const propertyName = propertyMatch?.[1] ?? propertyMatch?.[2] ?? propertyMatch?.[3];

    const node = $navigateToNode(location.jsonPath);
    if (!node || !$isElementNode(node)) return [undefined, undefined];

    if (propertyName === "marker") {
      // Position within the marker name in the opening MarkerNode
      const markerNode = $findMarkerNode(node, "opening");
      if (markerNode) {
        // The text is "\marker " - propertyOffset 0 maps to offset 1 (after backslash)
        const offset = location.propertyOffset + 1;
        const text = markerNode.getTextContent();
        return [markerNode, Math.min(offset, text.length)];
      }
    }

    // Fallback for other properties or if marker node not found
    const firstChild = node.getFirstChild();
    if (firstChild && $isTextNode(firstChild)) return [firstChild, 0];

    return [undefined, undefined];
  }

  // All UsjDocumentLocation subtypes should be handled above
  throw new Error(
    `Unsupported UsjDocumentLocation type: ${getUsjDocumentLocationTypeName(location)}. ` +
      "All UsjDocumentLocation subtypes should be supported: UsjMarkerLocation, " +
      "UsjClosingMarkerLocation, UsjTextContentLocation, UsjPropertyValueLocation, " +
      "UsjAttributeKeyLocation, UsjAttributeMarkerLocation, and" +
      `UsjClosingAttributeMarkerLocation. Received: ${JSON.stringify(location)}`,
  );
}

/**
 * Converts a content-based offset (skipping ignored nodes) into an element-based child offset.
 * This returns the earliest element offset that corresponds to the given content offset.
 */
function $getElementOffsetFromContentOffset(parent: ElementNode, contentOffset: number): number {
  const children = parent.getChildren();
  let currentContentOffset = 0;
  for (let elementOffset = 0; elementOffset <= children.length; elementOffset++) {
    if (currentContentOffset === contentOffset) return elementOffset;
    if (elementOffset >= children.length) break;
    if (!$shouldIgnoreNodeForContentIndexes(children[elementOffset])) currentContentOffset += 1;
  }
  return children.length;
}

function $normalizeVisibleMarkerPoint(node: LexicalNode, offset: number): [LexicalNode, number] {
  if (!$isVisibleMarkerNode(node)) return [node, offset];

  const textLength = node.getTextContent().length;
  // If selection resolves inside or at the beginning of a visible marker,
  // normalize to a parent ElementNode point at the marker's child index.
  if (offset < 0 || offset >= textLength) return [node, offset];

  const parent = node.getParent();
  if (!parent || !$isElementNode(parent)) return [node, offset];

  const indexWithinParent = node.getIndexWithinParent();
  if (indexWithinParent < 0) return [node, offset];

  return [parent, indexWithinParent];
}

function $getPointType(node: LexicalNode | undefined): "text" | "element" {
  return $isElementNode(node) ? "element" : "text";
}

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
  // If offset is within the text (not at the very end), return this node.
  // If offset equals text.length exactly, continue to next sibling to find the start of next content.
  if (offset >= 0 && offset < text.length) return [node, offset];

  let nextNode = node.getNextSibling();
  if (!nextNode) {
    const parent = node.getParent();
    if ($isTypedMarkNode(parent)) nextNode = parent.getNextSibling();
  }
  if (!nextNode || (!$isTypedMarkNode(nextNode) && !$isTextNode(nextNode))) {
    // No more siblings - if offset equals text.length, return end of current node
    if (offset === text.length) return [node, offset];
    return [undefined, undefined];
  }

  const nextOffset = offset - text.length;
  if (nextNode && $isTextNode(nextNode)) return $findTextNodeInMarks(nextNode, nextOffset);

  return $findTextNodeInMarks(nextNode.getFirstChild() ?? undefined, nextOffset);
}

/**
 * Finds a MarkerNode or ImmutableTypedTextNode marker child with the specified syntax.
 * @param parent - The parent element node to search in.
 * @param syntax - The marker syntax to find ("opening" or "closing").
 * @returns The MarkerNode or ImmutableTypedTextNode if found, undefined otherwise.
 */
function $findMarkerNode(
  parent: ElementNode,
  syntax: "opening" | "closing",
): MarkerNode | ImmutableTypedTextNode | undefined {
  const children = parent.getChildren();
  for (const child of children) {
    // Check for editable MarkerNode
    if ($isMarkerNode(child) && child.getMarkerSyntax() === syntax) return child;

    // Also check for selfClosing when looking for closing
    if (syntax === "closing" && $isMarkerNode(child) && child.getMarkerSyntax() === "selfClosing") {
      return child;
    }

    if ($isVisibleMarkerNode(child)) {
      const text = child.getTextContent();
      const isClosing = text.endsWith("*");
      if ((syntax === "opening" && !isClosing) || (syntax === "closing" && isClosing)) {
        return child;
      }
    }
  }
  return undefined;
}

/**
 * Navigates to a node using jsonPath indexes.
 * @param jsonPath - The jsonPath string to navigate.
 * @returns The node at the path, or undefined if not found.
 */
function $navigateToNode(jsonPath: string): LexicalNode | undefined {
  // Extract just the content path portion (strip property suffix if present)
  const contentPathMatch = new RegExp(/^(\$(?:\.content\[\d+\])*)(?:\.|$|\[)/).exec(jsonPath);
  const contentPath = contentPathMatch ? contentPathMatch[1] : jsonPath;

  const jsonPathIndexes = indexesFromUsjJsonPath(contentPath);
  let currentNode: LexicalNode | undefined = $getRoot();
  for (const index of jsonPathIndexes) {
    if (!currentNode || !$isElementNode(currentNode)) return undefined;

    currentNode = $getContentChildAtIndex(currentNode, index);
  }
  return currentNode;
}

function $getContentChildAtIndex(
  parent: ElementNode,
  contentIndex: number,
): LexicalNode | undefined {
  const children = parent.getChildren();
  let currentIndex = 0;
  for (const child of children) {
    if ($shouldIgnoreNodeForContentIndexes(child)) continue;
    if (currentIndex === contentIndex) return child;

    currentIndex += 1;
  }
  return undefined;
}

/**
 * Gets the location from a Lexical node and offset, emitting the appropriate UsjDocumentLocation
 * subtype based on the node type.
 *
 * - For MarkerNode with "opening" syntax at offset 0: UsjMarkerLocation
 * - For MarkerNode with "opening" syntax at offset > 0: UsjPropertyValueLocation (within marker name)
 * - For MarkerNode with "closing" syntax: UsjClosingMarkerLocation
 * - For regular TextNode: UsjTextContentLocation
 *
 * @param node - The Lexical node.
 * @param offset - The offset within the node's text content.
 * @returns The appropriate UsjDocumentLocation subtype.
 */
function $getLocationFromNode(node: LexicalNode, offset: number): UsjDocumentLocation {
  if ($isMarkerNode(node)) {
    const markerSyntax = node.getMarkerSyntax();

    // Prefer anchoring to the previous node if the marker is scaffolding for it.
    const anchorNode = $getMarkerAnchorNode(node);
    const anchorJsonPath = anchorNode
      ? usjJsonPathFromIndexes($getJsonPathIndexes(anchorNode))
      : usjJsonPathFromIndexes($getJsonPathIndexes(node));

    if (markerSyntax === "closing" || markerSyntax === "selfClosing") {
      // UsjClosingMarkerLocation: position within the closing marker (e.g., \nd*)
      return {
        jsonPath: anchorJsonPath,
        closingMarkerOffset: offset,
      } satisfies UsjClosingMarkerLocation;
    }

    // Opening marker
    if (offset === 0) {
      // UsjMarkerLocation: at the very beginning (the backslash)
      return {
        jsonPath: anchorJsonPath,
      } satisfies UsjMarkerLocation;
    }

    // Within the marker name text (after the backslash)
    // The text is "\marker " so offset 1 is the first char of the marker name
    // UsjPropertyValueLocation points to the marker property value
    const propertyJsonPath = `${anchorJsonPath}.marker` as PropertyJsonPath;
    // propertyOffset is the offset within the marker name itself (not including backslash)
    // Text is "\p " - offset 1 is 'p', so propertyOffset = offset - 1
    const propertyOffset = Math.max(0, offset - 1);

    return {
      jsonPath: propertyJsonPath,
      propertyOffset,
    } satisfies UsjPropertyValueLocation;
  }

  // Element selection - offset is a child index, convert to content-based offset
  if ($isElementNode(node)) {
    const childAtOffset = node.getChildAtIndex(offset);
    if ($isVisibleMarkerNode(childAtOffset)) {
      return {
        jsonPath: usjJsonPathFromIndexes($getJsonPathIndexes(node)),
      } satisfies UsjMarkerLocation;
    }

    const contentOffset = $getContentOffsetFromElementOffset(node, offset);
    return { jsonPath: usjJsonPathFromIndexes($getJsonPathIndexes(node)), offset: contentOffset };
  }

  // Regular text node - UsjTextContentLocation
  return { jsonPath: usjJsonPathFromIndexes($getJsonPathIndexes(node)), offset };
}

function $getMarkerAnchorNode(markerNode: MarkerNode): LexicalNode | undefined {
  const parent = markerNode.getParent();
  if (!parent || !$isElementNode(parent)) return undefined;

  const previousContentSibling = $getPreviousContentSibling(markerNode);
  if (
    previousContentSibling &&
    !$isParaLikeNode(previousContentSibling) &&
    !$isTextNode(previousContentSibling)
  ) {
    return previousContentSibling;
  }

  return parent;
}

function $getPreviousContentSibling(child: LexicalNode): LexicalNode | undefined {
  let sibling: LexicalNode | null = child.getPreviousSibling();
  while (sibling) {
    if (!$shouldIgnoreNodeForContentIndexes(sibling)) return sibling;
    sibling = sibling.getPreviousSibling();
  }
  return undefined;
}

/**
 * Gets the jsonPath indexes from a node by traversing up to the root.
 * @param node - The node to get the path for.
 * @returns An array of indexes representing the path from root to node.
 */
function $getJsonPathIndexes(node: LexicalNode): number[] {
  const jsonPathIndexes: number[] = [];
  let current: LexicalNode | null = node;
  while (current?.getParent()) {
    const parent: ElementNode | null = current.getParent();
    if (parent) {
      const index = $getContentIndexWithinParent(parent, current);
      if (index >= 0) jsonPathIndexes.unshift(index);
    }
    current = parent;
  }
  return jsonPathIndexes;
}

function $getContentIndexWithinParent(parent: ElementNode, child: LexicalNode): number {
  const children = parent.getChildren();
  let index = 0;
  for (const sibling of children) {
    if ($shouldIgnoreNodeForContentIndexes(sibling)) {
      if (sibling === child) return -1;

      continue;
    }
    if (sibling === child) return index;

    index += 1;
  }
  return -1;
}

/**
 * Converts an element-based child offset to a content-based offset.
 * Element offsets count all children, content offsets skip non-content nodes.
 * @param parent - The parent element node.
 * @param elementOffset - The element-based child offset.
 * @returns The content-based offset.
 */
function $getContentOffsetFromElementOffset(parent: ElementNode, elementOffset: number): number {
  const children = parent.getChildren();
  let contentOffset = 0;
  for (let i = 0; i < elementOffset && i < children.length; i++) {
    if (!$shouldIgnoreNodeForContentIndexes(children[i])) {
      contentOffset++;
    }
  }
  return contentOffset;
}

function $shouldIgnoreNodeForContentIndexes(node: LexicalNode | null | undefined): boolean {
  if (!node) return false;
  if ($isLineBreakNode(node)) return true;
  if ($isMarkerNode(node)) return true;
  if ($isVisibleMarkerNode(node)) return true;
  if ($isTextNode(node)) {
    const textType = $getState(node, textTypeState);
    if (textType === "marker-trailing-space" || textType === "attribute") return true;
  }
  return false;
}
