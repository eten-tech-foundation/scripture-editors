/** Utility functions for editor nodes */

import { MARKER_OBJECT_PROPS, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $getCommonAncestor,
  $getState,
  $isElementNode,
  $isTextNode,
  BaseSelection,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  RangeSelection,
  SerializedLexicalNode,
  SerializedTextNode,
  TextNode,
} from "lexical";
import { charIdState } from "../collab/delta.state.js";
import {
  $isImmutableTypedTextNode,
  ImmutableTypedTextNode,
  isSerializedImmutableTypedTextNode,
} from "../features/ImmutableTypedTextNode.js";
import { $isMarkerNode, isSerializedMarkerNode } from "../features/MarkerNode.js";
import { $isUnknownNode, UnknownNode } from "../features/UnknownNode.js";
import { $isBookNode, BookNode } from "./BookNode.js";
import {
  $isChapterNode,
  ChapterNode,
  isSerializedChapterNode,
  SerializedChapterNode,
} from "./ChapterNode.js";
import { $isCharNode, CharNode, isSerializedCharNode } from "./CharNode.js";
import {
  $isImmutableChapterNode,
  ImmutableChapterNode,
  isSerializedImmutableChapterNode,
  SerializedImmutableChapterNode,
} from "./ImmutableChapterNode.js";
import { $isImpliedParaNode, ImpliedParaNode } from "./ImpliedParaNode.js";
import { $isMilestoneNode, MilestoneNode } from "./MilestoneNode.js";
import { $isNoteNode, NoteNode } from "./NoteNode.js";
import { $isParaNode, ParaNode } from "./ParaNode.js";
import { $isVerseNode, VerseNode } from "./VerseNode.js";
import { EMPTY_CHAR_PLACEHOLDER_TEXT, NBSP, UnknownAttributes } from "./node-constants.js";

export type NodesWithMarker =
  | BookNode
  | ChapterNode
  | CharNode
  | ImmutableChapterNode
  | ImpliedParaNode
  | MilestoneNode
  | ParaNode
  | NoteNode
  | VerseNode
  | UnknownNode;

// If you want use these utils with your own chapter node, add it to this list of types.
export type SomeChapterNode = ChapterNode | ImmutableChapterNode;
export type SomeParaNode = ParaNode | ImpliedParaNode;

/** RegEx to test for a string only containing digits. */
const ONLY_DIGITS_TEST = /^\d+$/;

/**
 * Check if the marker is valid and numbered.
 * @param marker - Marker to check.
 * @param numberedMarkers - List of valid numbered markers ('#' removed).
 * @returns true if the marker is a valid numbered marker, false otherwise.
 */
export function isValidNumberedMarker(
  marker: string | undefined,
  numberedMarkers: string[],
): boolean {
  if (!marker) return false;

  // Starts with a valid numbered marker.
  const numberedMarker = numberedMarkers.find((markerNumbered) =>
    marker.startsWith(markerNumbered),
  );
  if (!numberedMarker) return false;

  // Ends with a number.
  const maybeNumber = marker.slice(numberedMarker.length);
  return ONLY_DIGITS_TEST.test(maybeNumber);
}

/**
 * Checks if the given node is a SerializedChapterNode or SerializedImmutableChapterNode.
 * @param node - The serialized node to check.
 * @returns `true` if the node is a SerializedChapterNode or SerializedImmutableChapterNode, `false` otherwise.
 */
export function isSomeSerializedChapterNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedChapterNode | SerializedImmutableChapterNode {
  return isSerializedChapterNode(node) || isSerializedImmutableChapterNode(node);
}

/**
 * Checks if the given node is a ChapterNode or ImmutableChapterNode.
 * @param node - The node to check.
 * @returns `true` if the node is a ChapterNode or ImmutableChapterNode, `false` otherwise.
 */
export function $isSomeChapterNode(node: LexicalNode | null | undefined): node is SomeChapterNode {
  return $isChapterNode(node) || $isImmutableChapterNode(node);
}

/**
 * Finds the chapter node with the given chapter number amongst the nodes.
 * @param nodes - Nodes to look in.
 * @param chapterNum - Chapter number to look for.
 * @returns the chapter node if found, `undefined` otherwise.
 */
export function $findChapter(nodes: LexicalNode[], chapterNum: number) {
  return nodes.find(
    (node) => $isSomeChapterNode(node) && node.getNumber() === chapterNum.toString(),
  ) as SomeChapterNode | undefined;
}

/**
 * Finds the next chapter.
 * @param nodes - Nodes to look in.
 * @param isCurrentChapterAtFirstNode - If `true` ignore the first node.
 * @returns the next chapter node if found, `undefined` otherwise.
 */
export function $findNextChapter(nodes: LexicalNode[], isCurrentChapterAtFirstNode = false) {
  return nodes.find(
    (node, index) => (!isCurrentChapterAtFirstNode || index > 0) && $isSomeChapterNode(node),
  ) as SomeChapterNode | undefined;
}

/**
 * Find the chapter that this node is in.
 * @param node - Node to find the chapter it's in.
 * @returns the chapter node if found, `undefined` otherwise.
 */
export function $findThisChapter(node: LexicalNode | null | undefined) {
  if (!node) return undefined;

  // is this node a chapter
  if ($isSomeChapterNode(node)) return node;

  // is the chapter a previous top level sibling
  let previousSibling = node.getTopLevelElement()?.getPreviousSibling();
  while (previousSibling && !$isSomeChapterNode(previousSibling)) {
    previousSibling = previousSibling.getPreviousSibling();
  }
  if (previousSibling && $isSomeChapterNode(previousSibling)) return previousSibling;

  return undefined;
}

/**
 * Traverses up the node tree from startNode to find the first ancestor NoteNode.
 * @param startNode - The node to start the upward search from.
 * @returns The first ancestor NoteNode found, or `undefined` if none exists before the root.
 */
export function $findFirstAncestorNoteNode(startNode: LexicalNode): NoteNode | undefined {
  let currentNode: LexicalNode | null = startNode;

  while (currentNode !== null) {
    if ($isNoteNode(currentNode)) return currentNode;
    currentNode = currentNode.getParent();
  }

  // Reached the root without finding a NoteNode
  return undefined;
}

/**
 * Checks if the node has a `getMarker` method. Excludes React nodes - consider using
 * `$isReactNodeWithMarker` instead.
 * @param node - LexicalNode to check.
 * @returns `true` if the node has a `getMarker` method, `false` otherwise.
 */
export function $isNodeWithMarker(node: LexicalNode | null | undefined): node is NodesWithMarker {
  return (
    $isBookNode(node) ||
    $isChapterNode(node) ||
    $isCharNode(node) ||
    $isImmutableChapterNode(node) ||
    $isImpliedParaNode(node) ||
    $isMilestoneNode(node) ||
    $isParaNode(node) ||
    $isNoteNode(node) ||
    $isVerseNode(node) ||
    $isUnknownNode(node)
    // ImmutableUnmatchedNode & MarkerNode also have the `getMarker` method but they left out for
    // now until we know we need them.
  );
}

/**
 * Get the next node in the document tree.
 * @param selection - The current selection to get the next node from.
 * @returns The next node or null if there is no next node.
 */
export function $getNextNode(selection: RangeSelection): LexicalNode | null {
  if (selection.anchor.type === "element") {
    const anchorNode = selection.anchor.getNode();
    const offset = selection.anchor.offset;
    if (offset < anchorNode.getChildrenSize()) return anchorNode.getChildAtIndex(offset);
  }

  const anchorNode = selection.anchor.getNode();
  return anchorNode.getNextSibling() ?? anchorNode.getParent()?.getNextSibling() ?? null;
}

/**
 * Get the previous node in the document tree.
 * @param selection - The current selection to get the previous node from.
 * @returns The previous node or null if there is no previous node.
 */
export function $getPreviousNode(selection: RangeSelection): LexicalNode | null {
  const offset = selection.anchor.offset;
  if (selection.anchor.type === "element" && offset > 0) {
    const anchorNode = selection.anchor.getNode();
    return anchorNode.getChildAtIndex(offset - 1);
  }

  const anchorNode = selection.anchor.getNode();
  return anchorNode.getPreviousSibling() ?? anchorNode.getParent()?.getPreviousSibling() ?? null;
}

/**
 * Checks if the given node is a ParaNode or ImpliedParaNode.
 * @param node - The node to check.
 * @returns `true` if the node is a ParaNode or ImpliedParaNode, `false` otherwise.
 */
export function $isSomeParaNode(node: LexicalNode | null | undefined): node is SomeParaNode {
  return $isParaNode(node) || $isImpliedParaNode(node);
}

/**
 * Check if a node is a descendant of a potential ancestor node.
 *
 * @param node - The node to check.
 * @param ancestorKey - The key of the potential ancestor node.
 * @returns `true` if the node is a descendant of the ancestor, `false` otherwise.
 */
export function $isDescendantOf(node: LexicalNode, ancestorKey: NodeKey): boolean {
  let parent = node.getParent();
  while (parent) {
    if (parent.getKey() === ancestorKey) return true;

    parent = parent.getParent();
  }
  return false;
}

/**
 * Check if the given char attributes are the same as the ones in the CharNode.
 * @param charAttributes - The char attributes to compare.
 * @param charNode - The character node to compare against.
 * @returns `true` if the attributes are the same, `false` otherwise.
 */
export function $hasSameCharAttributes(
  charAttributes: { style: string; cid?: string },
  charNode: CharNode,
): boolean {
  const charNodeCid = $getState(charNode, charIdState);
  const bothHaveCid = !!(charAttributes.cid && charNodeCid);
  const bothHaveNoCid = !charAttributes.cid && !charNodeCid;
  return (
    charAttributes.style === charNode.getMarker() &&
    (bothHaveNoCid || (bothHaveCid && charAttributes.cid === charNodeCid))
  );
}

/**
 * Find a common ancestor of a and b and return the common ancestor,
 * or undefined if there is no common ancestor between the two nodes.
 *
 * This function is compatible with the deprecated `LexicalNode.getCommonAncestor` function but
 * uses the new (as of Lexical v0.26.0) NodeCaret APIs.
 *
 * @param a A LexicalNode
 * @param b A LexicalNode
 * @returns The common ancestor between the two nodes or undefined if they have no common ancestor
 */
export function $getCommonAncestorCompatible(
  a: LexicalNode,
  b: LexicalNode,
): LexicalNode | undefined {
  const a1 = $isElementNode(a) ? a : a.getParent();
  const b1 = $isElementNode(b) ? b : b.getParent();
  const result = a1 && b1 ? $getCommonAncestor(a1, b1) : undefined;
  return result ? result.commonAncestor : undefined;
}

/**
 * Moves the selection to the end of the current range, accounting for backward selections.
 * @param selection - The range selection to move to the end.
 */
export function $moveSelectionToEnd(selection: RangeSelection) {
  const startEndPoints = selection.getStartEndPoints();
  if (!startEndPoints) return undefined;

  const [start, end] = startEndPoints;
  const actualEnd = selection.isBackward() ? start : end;
  selection.focus.set(actualEnd.key, actualEnd.offset, actualEnd.type);
  selection.anchor.set(actualEnd.key, actualEnd.offset, actualEnd.type);
}

/**
 * Checks if the given node is a SerializedTextNode.
 * @param node - The node to check.
 * @returns `true` if the node is a SerializedTextNode, `false` otherwise.
 */
export function isSerializedTextNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTextNode {
  return node?.type === TextNode.getType();
}

/**
 * Remove the given node and all the nodes after.
 * @param nodes - Nodes to prune.
 * @param pruneNode - Node to prune and all nodes after.
 */
export function removeNodeAndAfter(nodes: LexicalNode[], pruneNode: LexicalNode | undefined) {
  if (!pruneNode) return;

  const pruneNodeIndex = nodes.findIndex((node) => node === pruneNode);
  // prune node and after
  if (pruneNodeIndex) nodes.length = pruneNodeIndex;
}

/**
 * Removes all the nodes that proceed the given node.
 * @param nodes - Nodes to prune.
 * @param firstNode - Node to prune before.
 * @returns the nodes from the node and after.
 */
export function removeNodesBeforeNode(
  nodes: LexicalNode[],
  firstNode: LexicalNode | undefined,
): LexicalNode[] {
  if (!firstNode) return nodes;

  const firstNodeIndex = firstNode.getIndexWithinParent();
  return nodes.splice(firstNodeIndex + 1, nodes.length - firstNodeIndex - 1);
}

/**
 * Gets the opening marker text.
 * @param marker - The USFM marker.
 * @returns the opening marker text.
 */
export function openingMarkerText(marker: string): string {
  return `\\${marker}`;
}

/**
 * Gets the closing marker text.
 * @param marker - The USFM marker.
 * @returns the closing marker text.
 */
export function closingMarkerText(marker: string): string {
  return `\\${marker}*`;
}

/**
 * Parse number from marker text.
 * @param marker - Chapter or verse marker.
 * @param text - Text to parse.
 * @param number - Default number to use if none is found.
 * @returns the parsed number or the default value as a string.
 */
export function parseNumberFromMarkerText(
  marker: string,
  text: string | undefined,
  number: string,
): string {
  const openMarkerText = openingMarkerText(marker);
  if (text?.startsWith(openMarkerText)) {
    const numberText = parseInt(text.slice(openMarkerText.length), 10);
    if (!isNaN(numberText)) number = numberText.toString();
  }
  return number;
}

/**
 * Gets the open marker text with the marker visible.
 * @param marker - Verse marker.
 * @param content - Content such as chapter or verse number.
 * @returns the marker text with the open marker visible.
 */
export function getVisibleOpenMarkerText(marker: string, content: string | undefined): string {
  let text = openingMarkerText(marker);
  if (content) text += `${NBSP}${content}`;
  text += " ";
  return text;
}

/**
 * Recursively extracts text content from a serialized Lexical node and its descendants.
 * Excludes marker nodes (both MarkerNode and ImmutableTypedTextNode with type "marker").
 * @param node - The serialized node to process.
 * @returns The concatenated text content.
 */
// Keep this function in sync with `$getTextContentExcludingMarkers`.
function extractTextFromNode(node: SerializedLexicalNode): string {
  // Skip marker nodes - they're structural/formatting elements, not content
  if (isSerializedMarkerNode(node)) return "";
  if (isSerializedImmutableTypedTextNode(node) && node.textType === "marker") return "";

  if (isSerializedTextNode(node) && node.text !== NBSP) return node.text;

  if (isSerializedCharNode(node)) {
    // If it's an ElementNode, process its children recursively and join their text
    // We join with '' here because spacing is usually handled by spaces within TextNodes
    // or potentially by joining results from the top-level nodes with spaces later.
    return node.children.map((child) => extractTextFromNode(child)).join("");
  }

  // Ignore other node types (e.g., LineBreakNode, custom nodes without text/children)
  return "";
}

/**
 * Gets the preview text from an array of serialized Lexical nodes,
 * handling nested elements like the modified CharNode.
 * @param childNodes - Child nodes (e.g., from a NoteNode or ParagraphNode).
 * @returns The preview text.
 */
export function getPreviewTextFromSerializedNodes(childNodes: SerializedLexicalNode[]): string {
  const previewText = childNodes
    .map((node) => extractTextFromNode(node))
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();

  return previewText;
}

/**
 * Get editable note caller text.
 * @param noteCaller - Note caller.
 * @returns caller text.
 */
export function getEditableCallerText(noteCaller: string): string {
  return " " + noteCaller + NBSP;
}

/**
 * Gets the preview text for a note caller.
 * Excludes marker nodes from the text content.
 * @param childNodes - Child nodes of the NoteNode.
 * @returns the preview text.
 */
export function $getNoteCallerPreviewText(childNodes: LexicalNode[]): string {
  const parts: string[] = [];

  for (const node of childNodes) {
    if (!$isCharNode(node)) continue;

    const textContent = $getTextContentExcludingMarkers(node);
    if (textContent === EMPTY_CHAR_PLACEHOLDER_TEXT) continue;

    if (textContent.length > 0) parts.push(textContent);
  }

  return parts.join(" ").trim();
}

/**
 * Recursively gets text content from a node, excluding marker nodes.
 * @param node - The node to extract text from.
 * @returns The text content without markers.
 */
// Keep this function in sync with `extractTextFromNode`.
function $getTextContentExcludingMarkers(node: LexicalNode): string {
  // Skip marker nodes
  if ($isMarkerNode(node)) return "";
  if ($isVisibleMarkerNode(node)) return "";

  // For text nodes, return the text
  if ($isTextNode(node)) return node.getTextContent();

  // For element nodes, recursively process children
  if ($isElementNode(node)) {
    return node
      .getChildren()
      .map((child) => $getTextContentExcludingMarkers(child))
      .join("");
  }

  return "";
}

/**
 * Checks whether a node is a visible marker node.
 *
 * Visible marker nodes are immutable typed text nodes whose text type is "marker".
 *
 * @param node - The node to check.
 * @returns `true` if the node is an ImmutableTypedTextNode with text type "marker".
 */
export function $isVisibleMarkerNode(
  node: LexicalNode | null | undefined,
): node is ImmutableTypedTextNode {
  return $isImmutableTypedTextNode(node) && node.getTextType() === "marker";
}

/**
 * Remove all known properties of the `markerObject`.
 * @param markerObject - Scripture marker and its contents.
 * @param markerObjectProps - List of known properties to remove. Defaults to `MARKER_OBJECT_PROPS`.
 * @returns all the unknown properties or `undefined` if all are known.
 */
export function getUnknownAttributes<T extends object = MarkerObject>(
  markerObject: T,
  markerObjectProps: (keyof T)[] = MARKER_OBJECT_PROPS as (keyof T)[],
): UnknownAttributes | undefined {
  const attributes: Partial<T> = { ...markerObject };
  markerObjectProps.forEach((property) => {
    Reflect.deleteProperty(attributes, property);
  });
  return Object.keys(attributes).length === 0 ? undefined : (attributes as UnknownAttributes);
}

/**
 * Retrieves the lowercase tag name of the DOM element associated with a LexicalNode.
 * @param node - The LexicalNode for which to find the corresponding DOM element's tag name.
 * @param editor - The LexicalEditor instance used to access the DOM.
 * @returns The lowercase tag name of the DOM element if found, or `undefined` if no corresponding
 *   DOM element exists.
 * @deprecated Not used anymore.
 */
export function getNodeElementTagName(
  node: LexicalNode,
  editor: LexicalEditor,
): string | undefined {
  const domElement = editor.getElementByKey(node.getKey());
  return domElement ? domElement.tagName.toLowerCase() : undefined;
}

/**
 * Removes properties with undefined values from an object.
 *
 * @param obj - The object to remove undefined properties from.
 * @returns A new object with the same type as the input, but with undefined properties removed.
 *
 * @example
 * const input = { a: 1, b: undefined, c: 'hello' };
 * const result = removeUndefinedProperties(input);
 * // result: { a: 1, c: 'hello' }
 *
 * @remarks
 * This function creates a new object and does not modify the original input object.
 */
export function removeUndefinedProperties<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Partial<T>).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Get the start node of the selection.
 * @param selection - The selection to get the start node from.
 * @returns The start node of the selection or `undefined` if no selection is provided.
 */
export function getSelectionStartNode(selection: BaseSelection | null): LexicalNode | undefined {
  if (!selection) return undefined;

  const nodes = selection.getNodes();
  if (nodes.length > 0) {
    return selection.isBackward() ? nodes[nodes.length - 1] : nodes[0];
  }

  return undefined;
}

/**
 * Get the next verse number or segment.
 *
 * A verse range increments the end of the range (even if the range includes segments), and a verse
 * segment increments the segment character. This is intentional to simplify the UX.
 * @param verseNum - The current verse number.
 * @param verse - The current verse string, which can be a single verse, a range, or a segment.
 * @returns The next verse number or segment as a string.
 */

export function getNextVerse(verseNum: number, verse: string | undefined): string {
  if (!verse) return (verseNum + 1).toString();

  const verseParts = verse.split("-");
  if (verseParts.length === 2)
    return parseInt(verseParts[1])
      ? `${parseInt(verseParts[1]) + 1}`
      : `${parseInt(verseParts[0]) + 1}`;

  // Don't increment beyond 'z' or 'Z'.
  const verseSegment = RegExp(/^(\d+)([a-yA-Y]{1,3})$/).exec(verse);
  if (!verseSegment) return (parseInt(verse) + 1).toString();

  const nextSegmentChar = String.fromCharCode(verseSegment[2].charCodeAt(0) + 1);
  return `${verseSegment[1]}${nextSegmentChar}`;
}

/**
 * Determines if the verse number is in the given verse range. Verse segments are accounted for.
 * @param verseNum - The current verse number.
 * @param verseRange - The verse range including segments.
 * @returns `true` if the verse number is in the range, `false` otherwise.
 * @example
 *   verseRange "1-2" - verseNum 1 and 2 are `true`
 *   verseRange "1a-2b" - verseNum 1 and 2 are `true`
 *   verseRange "1-3" -  verseNum 1, 2, and 3 are `true`
 */
export function isVerseInRange(verseNum: number, verseRange: string | undefined): boolean {
  if (!verseRange) return false;

  const verseNumParts = verseRange.split("-").map((v) => parseInt(v));
  if (verseNumParts.length < 1 || verseNumParts.length > 2 || verseNumParts[0] > verseNumParts[1])
    throw new Error("isVerseInRange: invalid range");

  if (verseNumParts.length === 1) return verseNum === verseNumParts[0];
  if (verseNumParts.length === 2 && isNaN(verseNumParts[1])) return verseNum >= verseNumParts[0];
  if (verseNumParts.length === 2 && isNaN(verseNumParts[0])) return verseNum <= verseNumParts[1];
  return verseNum >= verseNumParts[0] && verseNum <= verseNumParts[1];
}

/**
 * Checks if the given verse range is a range (i.e. contains a dash).
 * @param verseRange - The verse range to check.
 * @returns `true` if the verse range is a range, `false` otherwise.
 */
export function isVerseRange(verseRange: string | undefined): boolean {
  return !!verseRange && verseRange.includes("-");
}
