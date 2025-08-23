import { $isImmutableNoteCallerNode, ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import {
  $isImmutableVerseNode,
  ImmutableVerseNode,
  isSerializedImmutableVerseNode,
  SerializedImmutableVerseNode,
} from "./ImmutableVerseNode";
import {
  $getNodeByKey,
  $isElementNode,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  SerializedLexicalNode,
} from "lexical";
import {
  $isNodeWithMarker,
  $isParaNode,
  $isSomeChapterNode,
  $isTypedMarkNode,
  $isVerseNode,
  isSerializedVerseNode,
  isVerseInRange,
  NBSP,
  NodesWithMarker,
  SerializedVerseNode,
  VerseNode,
} from "shared";

/** Caller count is in an object so it can be manipulated by passing the object. */
export interface CallerData {
  count: number;
}

// If you want use these utils with your own verse node, add it to this list of types, then modify
// all the functions where this type is used in this file.
export type SomeVerseNode = VerseNode | ImmutableVerseNode;

/**
 * Find all ImmutableNoteCallerNodes in the given nodes tree.
 * @param nodes - Lexical node array to look in.
 * @returns an array of all ImmutableNoteCallerNodes in the tree.
 */
export function $findImmutableNoteCallerNodes(nodes: LexicalNode[]): ImmutableNoteCallerNode[] {
  const immutableNoteCallerNodes: ImmutableNoteCallerNode[] = [];

  function $traverse(node: LexicalNode) {
    if ($isImmutableNoteCallerNode(node)) immutableNoteCallerNodes.push(node);
    if (!$isElementNode(node)) return;

    const children = node.getChildren();
    children.forEach($traverse);
  }

  nodes.forEach($traverse);

  return immutableNoteCallerNodes;
}

/**
 * Checks if the given node is a VerseNode or ImmutableVerseNode.
 * @param node - The node to check.
 * @returns `true` if the node is a VerseNode or ImmutableVerseNode, `false` otherwise.
 */
export function $isSomeVerseNode(node: LexicalNode | null | undefined): node is SomeVerseNode {
  return $isVerseNode(node) || $isImmutableVerseNode(node);
}

/**
 * Checks if the given node is a SerializedVerseNode or SerializedImmutableVerseNode.
 * @param node - The serialized node to check.
 * @returns `true` if the node is a SerializedVerseNode or SerializedImmutableVerseNode, `false` otherwise.
 */
export function isSomeSerializedVerseNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedVerseNode | SerializedImmutableVerseNode {
  return isSerializedVerseNode(node) || isSerializedImmutableVerseNode(node);
}

/**
 * Finds the first paragraph that is not a book or chapter node.
 * @param nodes - Nodes to look in.
 * @returns the first paragraph node.
 */
export function $getFirstPara(nodes: LexicalNode[]) {
  return nodes.find((node) => $isParaNode(node));
}

/**
 * Find the given verse in the children of the node.
 * @param node - Node with potential verses in children.
 * @param verseNum - Verse number to look for.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findVerseInNode(node: LexicalNode, verseNum: number) {
  if (!$isElementNode(node)) return;

  const children = node.getChildren();
  const verseNode = children.find(
    (node) => $isSomeVerseNode(node) && isVerseInRange(verseNum, node.getNumber()),
  );
  return verseNode as SomeVerseNode | undefined;
}

/**
 * Finds the verse node with the given verse number amongst the children of nodes.
 * @param nodes - Nodes to look in.
 * @param verseNum - Verse number to look for.
 * @returns the verse node if found, or the first paragraph if verse 0, `undefined` otherwise.
 */
export function $findVerseOrPara(nodes: LexicalNode[], verseNum: number) {
  return verseNum === 0
    ? $getFirstPara(nodes)
    : nodes
        .map((node) => $findVerseInNode(node, verseNum))
        // remove any undefined results and take the first found
        .filter((verseNode) => verseNode)[0];
}

/**
 * Find the next verse in the children of the node.
 * @param node - Node with potential verses in children.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findNextVerseInNode(node: LexicalNode) {
  if (!$isElementNode(node)) return;
  const children = node.getChildren();
  const verseNode = children.find((node) => $isSomeVerseNode(node));
  return verseNode as SomeVerseNode | undefined;
}

/**
 * Finds the next verse node amongst the children of nodes.
 * @param nodes - Nodes to look in.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findNextVerse(nodes: LexicalNode[]) {
  return (
    nodes
      .map((node) => $findNextVerseInNode(node))
      // remove any undefined results and take the first found
      .filter((verseNode) => verseNode)[0]
  );
}

/**
 * Find the last verse in the children of the node.
 * @param node - Node with potential verses in children.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findLastVerseInNode(node: LexicalNode | null | undefined) {
  if (!node || !$isElementNode(node)) return;

  const children = node.getChildren();
  const verseNode = children.findLast((node) => $isSomeVerseNode(node));
  return verseNode as SomeVerseNode | undefined;
}

/**
 * Finds the last verse node amongst the children of nodes.
 * @param nodes - Nodes to look in.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findLastVerse(nodes: LexicalNode[]) {
  const verseNodes = nodes
    .map((node) => $findLastVerseInNode(node))
    // remove any undefined results
    .filter((verseNode) => verseNode);
  if (verseNodes.length <= 0) return;

  return verseNodes[verseNodes.length - 1];
}

/**
 * Find the verse that this node is in.
 * @param node - Node to find the verse it's in.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findThisVerse(node: LexicalNode | null | undefined) {
  if (!node || $isSomeChapterNode(node)) return;

  // is this node a verse
  if ($isSomeVerseNode(node)) return node;

  // is one of the previous sibling nodes a verse
  const isWrappedInMark = $isTypedMarkNode(node.getParent());
  let previousSibling = isWrappedInMark
    ? node.getParent()?.getPreviousSibling()
    : node.getPreviousSibling();
  while (
    previousSibling &&
    !$isSomeVerseNode(previousSibling) &&
    !$isSomeChapterNode(previousSibling)
  ) {
    previousSibling = previousSibling.getPreviousSibling();
  }
  if (previousSibling && $isSomeVerseNode(previousSibling)) return previousSibling;

  // is the verse in a previous parent sibling
  let previousParentSibling = node.getTopLevelElement()?.getPreviousSibling();
  let verseNode = $findLastVerseInNode(previousParentSibling);
  let nextVerseNode = verseNode;
  while (previousParentSibling && !verseNode && !$isSomeChapterNode(previousParentSibling)) {
    verseNode = nextVerseNode;
    previousParentSibling = previousParentSibling.getPreviousSibling();
    nextVerseNode = $findLastVerseInNode(previousParentSibling);
  }
  if (!verseNode && $isSomeChapterNode(previousParentSibling)) return;

  return verseNode;
}

/**
 * Checks if the node has a `getMarker` method. Includes all React nodes.
 * @param node - LexicalNode to check.
 * @returns `true` if the node has a `getMarker` method, `false` otherwise.
 */
export function $isReactNodeWithMarker(
  node: LexicalNode | null | undefined,
): node is NodesWithMarker | ImmutableVerseNode {
  return $isNodeWithMarker(node) || $isImmutableVerseNode(node);
}

/**
 * Add trailing space to a TextNode
 * @param node - Text node to add trailing space to.
 */
export function $addTrailingSpace(node: LexicalNode | null | undefined) {
  if ($isTextNode(node)) {
    const text = node.getTextContent();
    if (!text.endsWith(" ") && !text.endsWith(NBSP)) node.setTextContent(`${text} `);
  }
}

/**
 * Removes the any leading space from a TextNode.
 * @param node - Text node to remove leading space from.
 */
export function $removeLeadingSpace(node: LexicalNode | null | undefined) {
  if ($isTextNode(node)) {
    const text = node.getTextContent();
    if (text.startsWith(" ")) node.setTextContent(text.trimStart());
  }
}

/**
 * Checks if the node was created since the previous editor state.
 * @param editor - The lexical editor instance.
 * @param nodeKey - The key of the node.
 * @returns `true` if the node was created, and `false` otherwise.
 */
export function wasNodeCreated(editor: LexicalEditor, nodeKey: string) {
  return editor.getEditorState().read(() => !$getNodeByKey(nodeKey));
}
