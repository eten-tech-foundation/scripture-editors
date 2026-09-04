import {
  $isImmutableVerseNode,
  ImmutableVerseNode,
  isSerializedImmutableVerseNode,
  SerializedImmutableVerseNode,
} from "./ImmutableVerseNode";
import {
  BaseSelection,
  $getNodeByKey,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  SerializedLexicalNode,
} from "lexical";
import {
  $findNearestPreviousNode,
  $isNodeWithMarker,
  $isParaNode,
  $isSomeChapterNode,
  $isVerseBlockNode,
  $isVerseNode,
  isSerializedVerseNode,
  isVerseInRange,
  NBSP,
  NodesWithMarker,
  SerializedVerseNode,
  VerseNode,
} from "shared";

// If you want use these utils with your own verse node, add it to this list of types, then modify
// all the functions where this type is used in this file.
export type SomeVerseNode = VerseNode | ImmutableVerseNode;

/**
 * Checks if the given node is a VerseNode or ImmutableVerseNode.
 * @param node - The node to check.
 * @returns `true` if the node is a VerseNode or ImmutableVerseNode, `false` otherwise.
 */
export function $isSomeVerseNode(node: LexicalNode | null | undefined): node is SomeVerseNode {
  return $isVerseNode(node) || $isImmutableVerseNode(node);
}

/** Serialized form of {@link SomeVerseNode}. */
export type SomeSerializedVerseNode = SerializedVerseNode | SerializedImmutableVerseNode;

/**
 * Checks if the given node is a SerializedVerseNode or SerializedImmutableVerseNode.
 * @param node - The serialized node to check.
 * @returns `true` if the node is a SerializedVerseNode or SerializedImmutableVerseNode, `false` otherwise.
 */
export function isSomeSerializedVerseNode(
  node: SerializedLexicalNode | null | undefined,
): node is SomeSerializedVerseNode {
  return isSerializedVerseNode(node) || isSerializedImmutableVerseNode(node);
}

/**
 * Finds the first paragraph that is not a book or chapter node.
 * @param nodes - Nodes to look in.
 * @returns the first paragraph node.
 */
export function $getFirstPara(nodes: LexicalNode[]) {
  return $expandVerseBlocks(nodes).find((node) => $isParaNode(node));
}

/**
 * The given nodes with any `VerseBlockNode` replaced by its own paragraphs.
 *
 * In the block verse layout a verse sits two levels below the root - `VerseBlockNode > ParaNode >
 * verse` - so anything searching for verses or paragraphs has to see through the block. Returns
 * the input unchanged when there are no verse blocks, leaving the inline layouts untouched.
 */
function $expandVerseBlocks(nodes: LexicalNode[]): LexicalNode[] {
  if (!nodes.some($isVerseBlockNode)) return nodes;

  return nodes.flatMap((node) => ($isVerseBlockNode(node) ? node.getChildren() : node));
}

/**
 * The nodes among which a verse marker would sit, for a container that might hold one.
 *
 * For a paragraph that is its own children. For a verse block it is the children of each of its
 * paragraphs, in document order, since the block holds paragraphs and the markers live inside
 * those. Callers can then treat both the same way.
 */
function $getVerseSiblings(node: LexicalNode | null | undefined): LexicalNode[] {
  if (!$isElementNode(node)) return [];
  if ($isVerseBlockNode(node)) return node.getChildren().flatMap($getVerseSiblings);

  return node.getChildren();
}

/**
 * Find the given verse in the children of the node.
 * @param node - Node with potential verses in children.
 * @param verseNum - Verse number to look for.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findVerseInNode(node: LexicalNode, verseNum: number): SomeVerseNode | undefined {
  const children = $getVerseSiblings(node);
  const verseNode = children.find(
    (child) => $isSomeVerseNode(child) && isVerseInRange(verseNum, child.getNumber()),
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
export function $findNextVerseInNode(node: LexicalNode): SomeVerseNode | undefined {
  const verseNode = $getVerseSiblings(node).find((child) => $isSomeVerseNode(child));
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
 * Find the previous verse node in a parent's children, walking backward from the given index.
 * @param parent - Element node whose children to search.
 * @param fromIndex - Start index (exclusive); search from fromIndex - 1 down to 0.
 * @returns The verse node if found, `undefined` otherwise.
 */
export function $findPreviousVerseInSiblings(
  parent: LexicalNode | null | undefined,
  fromIndex: number,
): SomeVerseNode | undefined {
  if (!$isElementNode(parent) || fromIndex <= 0) return;
  const children = parent.getChildren();
  for (let i = fromIndex - 1; i >= 0; i--) {
    const child = children[i];
    if ($isSomeVerseNode(child)) return child;
  }
  return undefined;
}

/**
 * Find the next verse node after `verseNode` in document order, stopping at the next chapter
 * boundary (or the end of the document). Forward counterpart to `$findPreviousVerseInSiblings` /
 * the backward walk in `$findThisVerse`.
 * @param verseNode - The verse node to search forward from.
 * @returns The next verse node, or `undefined` if none exists before the next chapter/document end.
 */
export function $findNextVerseAfter(verseNode: SomeVerseNode): SomeVerseNode | undefined {
  const parent = verseNode.getParent();
  if (parent && $isElementNode(parent)) {
    const children = parent.getChildren();
    for (let i = verseNode.getIndexWithinParent() + 1; i < children.length; i++) {
      const child = children[i];
      if ($isSomeVerseNode(child)) return child;
    }
  }

  let nextPara = parent?.getNextSibling();
  while (nextPara && !$isSomeChapterNode(nextPara)) {
    const verse = $findNextVerseInNode(nextPara);
    if (verse) return verse;
    nextPara = nextPara.getNextSibling();
  }
  return undefined;
}

/**
 * Find the last verse in the children of the node.
 * @param node - Node with potential verses in children.
 * @returns the verse node if found, `undefined` otherwise.
 */
export function $findLastVerseInNode(
  node: LexicalNode | null | undefined,
): SomeVerseNode | undefined {
  return $getVerseSiblings(node).findLast((child): child is SomeVerseNode =>
    $isSomeVerseNode(child),
  );
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
 * Length of verse number prefix in verse text for BCV "before vs after" check.
 * If text doesn't start with the verse number (e.g. $createVerseNode("1", " verse one")
 * or node is non-VerseNode (e.g. ImmutableVerseNode), returns 0 — treats all positions
 * as "after" and shows the current verse.
 */
function getVerseNumberPrefixLength(verseNode: SomeVerseNode): number {
  if (!$isVerseNode(verseNode)) return 0;
  const verseNumber = verseNode.getNumber();
  const text = verseNode.getTextContent();
  return text.startsWith(verseNumber) ? verseNumber.length : 0;
}

/**
 * Returns true when the selection anchor is positioned before the given verse node in document
 * order. Handles: (1) cursor inside the verse's parent with offset before this verse's index,
 * (2) cursor in the verse's previous sibling.
 */
function $isSelectionBeforeVerseNode(
  selection: RangeSelection,
  verseNode: SomeVerseNode,
  anchorNode: LexicalNode | null,
): boolean {
  if (!anchorNode) return false;
  const parent = verseNode.getParent();
  if (anchorNode === parent && $isElementNode(anchorNode)) {
    const verseIndex = verseNode.getIndexWithinParent();
    const anchorOffset = selection.anchor.offset;
    return anchorOffset <= verseIndex;
  }
  if (anchorNode.getNextSibling() === verseNode) return true;
  return false;
}

/**
 * Returns true when BCV should show the previous verse (cursor is before the verse number).
 * Encapsulates: anchor in parent/previous sibling before verse; anchor in verse node before
 * verse number (TextNode) or on whole node (DecoratorNode).
 */
function $shouldShowPreviousVerseForBcv(
  verseNode: SomeVerseNode,
  selection: RangeSelection,
): boolean {
  const anchorNode = selection.anchor.getNode();

  // Anchor not on verse node: check if cursor is before verse (parent offset or previous sibling)
  if (anchorNode !== verseNode) {
    return $isSelectionBeforeVerseNode(selection, verseNode, anchorNode);
  }

  // Anchor on verse node: show previous if cursor is before verse number
  if ($isTextNode(verseNode)) {
    const prefixLength = getVerseNumberPrefixLength(verseNode);
    return selection.anchor.offset < prefixLength;
  }
  // ImmutableVerseNode (DecoratorNode): whole node is verse number; show previous
  return true;
}

/** Build result for current verse (no selection or cursor after verse number). */
function currentVerseResult(verseNode: SomeVerseNode): { verseNum: number; verse?: string } {
  const verse = verseNode.getNumber();
  const selectedVerseNum = Number.parseInt(verse ?? "0", 10);
  return {
    verseNum: selectedVerseNum,
    verse: verse != null && selectedVerseNum.toString() !== verse ? verse : undefined,
  };
}

/**
 * Returns the verse number (and optional verse range) for BCV display. When the cursor is
 * before the verse number, returns the previous verse so BCV only updates after the number.
 * For "previous" verse, only `verseNum` is set (no `verse` range); e.g. cursor before "2-3" → `{ verseNum: 1 }`.
 *
 * @param verseNode - The verse node that contains or precedes the cursor.
 * @param selection - The current editor selection.
 * @returns Effective verse number and optional verse range string for BCV display.
 */
export function $getEffectiveVerseForBcv(
  verseNode: SomeVerseNode | undefined,
  selection: BaseSelection | null,
): { verseNum: number; verse?: string } {
  if (!verseNode) return { verseNum: 0 };

  // No selection or not range: use verse node as-is
  if (!$isRangeSelection(selection)) {
    return currentVerseResult(verseNode);
  }

  const selectedVerseNum = Number.parseInt(verseNode.getNumber() ?? "0", 10);
  const prevNum = selectedVerseNum <= 1 ? 0 : selectedVerseNum - 1;

  // Anchor before verse number: show previous verse
  if ($shouldShowPreviousVerseForBcv(verseNode, selection)) return { verseNum: prevNum };

  return currentVerseResult(verseNode);
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

/**
 * Moves the selection to the start of the next verse's content (after the verse marker).
 * Used for ArrowDown navigation so the cursor lands on a position that ScriptureReferencePlugin
 * can resolve for BCV display.
 * @param selection - The current range selection (must be collapsed).
 * @returns `true` if the selection was moved, `false` if not collapsed or no next verse.
 */
export function $selectNextVerse(selection: RangeSelection): boolean {
  if (!selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const currentVerse = $resolveVerseNode(anchorNode, selection);

  let nextVerse: SomeVerseNode | undefined;

  if (currentVerse) {
    const parent = currentVerse.getParent();
    // When the cursor is on a block (e.g. para) before the first verse in that block,
    // $resolveVerseNode falls back to the first verse in the paragraph. That verse is
    // ahead of the caret — it should be the ArrowDown target, not skipped as "current".
    if (
      parent &&
      $isElementNode(parent) &&
      $isElementNode(anchorNode) &&
      anchorNode === parent &&
      selection.anchor.offset < currentVerse.getIndexWithinParent()
    ) {
      nextVerse = currentVerse;
    }
    if (!nextVerse && parent && $isElementNode(parent)) {
      const children = parent.getChildren();
      const currentIndex = currentVerse.getIndexWithinParent();
      for (let i = currentIndex + 1; i < children.length; i++) {
        const child = children[i];
        if ($isSomeVerseNode(child)) {
          nextVerse = child;
          break;
        }
      }
    }
    if (!nextVerse && parent) {
      let nextPara = $getNextSearchSibling(parent);
      while (nextPara && !$isSomeChapterNode(nextPara)) {
        const verse = $findNextVerseInNode(nextPara);
        if (verse) {
          nextVerse = verse;
          break;
        }
        nextPara = $getNextSearchSibling(nextPara);
      }
    }
  } else {
    const topLevel = anchorNode.getTopLevelElement();
    let para: LexicalNode | null = topLevel ?? anchorNode;
    while (para) {
      const verse = $findNextVerseInNode(para);
      if (verse) {
        nextVerse = verse;
        break;
      }
      para = para.getNextSibling();
      if (para && $isSomeChapterNode(para)) break;
    }
  }

  if (!nextVerse) return false;
  nextVerse.selectNext(0, 0);
  return true;
}

/**
 * Moves the selection to the start of the previous verse's content (after the verse marker).
 * Used for ArrowUp navigation so the cursor lands on a position that ScriptureReferencePlugin
 * can resolve for BCV display.
 * @param selection - The current range selection (must be collapsed).
 * @returns `true` if the selection was moved, `false` if not collapsed or no previous verse.
 */
export function $selectPreviousVerse(selection: RangeSelection): boolean {
  if (!selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const currentVerse = $resolveVerseNode(anchorNode, selection);

  let prevVerse: SomeVerseNode | undefined;

  if (currentVerse) {
    const parent = currentVerse.getParent();
    // When the cursor is in a different (later) paragraph than currentVerse's parent,
    // $resolveVerseNode found the verse via backward traversal across paragraphs.
    // That verse is behind the caret — it should be the ArrowUp target directly.
    const topLevel = anchorNode.getTopLevelElement();
    // Compare the caret's block against the verse's own block. Everywhere but the block verse
    // layout a paragraph is its own top-level element - including inside a table, whose cells are
    // shadow roots - so this is the same test as comparing against the paragraph. In block verse
    // the paragraph's top-level element is its verse block, which is what makes it correct there.
    if (parent && topLevel && topLevel !== parent.getTopLevelElement()) {
      prevVerse = currentVerse;
    }
    if (!prevVerse && parent && $isElementNode(parent)) {
      prevVerse = $findPreviousVerseInSiblings(parent, currentVerse.getIndexWithinParent());
    }
    if (!prevVerse && parent) {
      let prevPara = $getPreviousSearchSibling(parent);
      while (prevPara && !$isSomeChapterNode(prevPara)) {
        const verse = $findLastVerseInNode(prevPara);
        if (verse) {
          prevVerse = verse;
          break;
        }
        prevPara = $getPreviousSearchSibling(prevPara);
      }
    }
  } else {
    const topLevel = anchorNode.getTopLevelElement();
    let prevPara = topLevel?.getPreviousSibling() ?? null;
    while (prevPara && !$isSomeChapterNode(prevPara)) {
      const verse = $findLastVerseInNode(prevPara);
      if (verse) {
        prevVerse = verse;
        break;
      }
      prevPara = prevPara.getPreviousSibling();
    }
  }

  if (!prevVerse) return false;
  prevVerse.selectNext(0, 0);
  return true;
}

/**
 * The next node to search when walking forward looking for a verse.
 *
 * Normally the node's next sibling. In the block verse layout a paragraph's siblings run out at
 * the end of its verse block, so the walk continues from the block's own next sibling rather than
 * stopping inside it. Behaves exactly like `getNextSibling` for a top-level node.
 */
function $getNextSearchSibling(node: LexicalNode): LexicalNode | null {
  const nextSibling = node.getNextSibling();
  if (nextSibling) return nextSibling;

  const topLevel = node.getTopLevelElement();
  return topLevel && topLevel !== node ? topLevel.getNextSibling() : null;
}

/** Mirror of {@link $getNextSearchSibling} for a backward walk. */
function $getPreviousSearchSibling(node: LexicalNode): LexicalNode | null {
  const previousSibling = node.getPreviousSibling();
  if (previousSibling) return previousSibling;

  const topLevel = node.getTopLevelElement();
  return topLevel && topLevel !== node ? topLevel.getPreviousSibling() : null;
}

/**
 * Resolves the verse node for the given start node. When the cursor is on an element
 * (e.g. para) rather than inside a verse, looks at the child at offset or walks backward
 * within that element before falling back to $findThisVerse (which may walk to prior paras).
 */
export function $resolveVerseNode(
  startNode: LexicalNode,
  selection: BaseSelection | null,
): SomeVerseNode | undefined {
  const isCursorOnElement =
    $isElementNode(startNode) &&
    $isRangeSelection(selection) &&
    selection.anchor.key === startNode.getKey();

  if (isCursorOnElement) {
    const childAtOffset = startNode.getChildAtIndex(selection.anchor.offset);
    if (childAtOffset && $isSomeVerseNode(childAtOffset)) return childAtOffset;
    const prev = $findPreviousVerseInSiblings(startNode, selection.anchor.offset);
    if (prev) return prev;
    const firstVerseInPara = $findNextVerseInNode(startNode);
    if (firstVerseInPara) return firstVerseInPara;
  }

  return $findThisVerse(startNode);
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

  let previousSiblingOrParent = $findNearestPreviousNode(node);
  while (previousSiblingOrParent) {
    // If this node is a chapter node, stop searching as we've reached the start of this chapter
    if ($isSomeChapterNode(previousSiblingOrParent)) return;

    // If this node is a verse node, return it
    if ($isSomeVerseNode(previousSiblingOrParent)) return previousSiblingOrParent;

    // If this node contains a verse node, return that
    const verseNode = $findLastVerseInNode(previousSiblingOrParent);
    if (verseNode) return verseNode;

    previousSiblingOrParent = $findNearestPreviousNode(previousSiblingOrParent);
  }

  return undefined;
}
