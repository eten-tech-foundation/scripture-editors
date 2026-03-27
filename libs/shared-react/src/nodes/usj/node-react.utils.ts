import { SelectionRange } from "../../plugins/usj/annotation/selection.model";
import { $getRangeFromUsjSelection } from "../../plugins/usj/annotation/selection.utils";
import { ViewOptions } from "../../views/view-options.utils";
import {
  $createImmutableNoteCallerNode,
  $isImmutableNoteCallerNode,
  ImmutableNoteCallerNode,
  NoteCallerOnClick,
} from "./ImmutableNoteCallerNode";
import {
  $isImmutableVerseNode,
  ImmutableVerseNode,
  isSerializedImmutableVerseNode,
  SerializedImmutableVerseNode,
} from "./ImmutableVerseNode";
import { UsjNodeOptions } from "./usj-node-options.model";
import { $dfs } from "@lexical/utils";
import {
  BaseSelection,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  SerializedLexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createNoteNode,
  $findNearestPreviousNode,
  $getNoteCallerPreviewText,
  $isCharNode,
  $isImmutableTypedTextNode,
  $isNodeWithMarker,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  $isVerseNode,
  $moveSelectionToEnd,
  closingMarkerText,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getEditableCallerText,
  ImmutableTypedTextNode,
  isSerializedVerseNode,
  isVerseInRange,
  LoggerBasic,
  MarkerNode,
  NBSP,
  NodesWithMarker,
  NoteNode,
  openingMarkerText,
  ScriptureReference,
  segmentState,
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
 * Inserts a note at the specified selection, e.g. footnote, cross-reference, endnote.
 * @param marker - The marker type for the note.
 * @param caller - Optional note caller to override the default for the given marker.
 * @param selectionRange - Optional selection range where the note should be inserted. By default it will
 *   use the current selection in the editor.
 * @param scriptureReference - Scripture reference for the note.
 * @param viewOptions - The current editor view options.
 * @param nodeOptions - The current editor node options.
 * @param logger - Logger instance.
 * @returns The inserted note node, or `undefined` if insertion failed.
 * @throws Will throw an error if the marker is not a valid note marker.
 */
export function $insertNote(
  marker: string,
  caller: string | undefined,
  selectionRange: SelectionRange | undefined,
  scriptureReference: ScriptureReference | undefined,
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): NoteNode | undefined {
  if (!NoteNode.isValidMarker(marker))
    throw new Error(`$insertNote: Invalid note marker '${marker}'`);

  const selection = selectionRange ? $getRangeFromUsjSelection(selectionRange) : $getSelection();
  if (!$isRangeSelection(selection)) return undefined;

  const children = $createNoteChildren(selection, marker, scriptureReference, logger);
  if (children === undefined) return undefined;

  const noteNode = $createWholeNote(marker, caller, children, viewOptions, nodeOptions);
  $insertNoteWithSelect(noteNode, selection, viewOptions);
  return noteNode;
}

/**
 * Insert note node at the given selection, and select the note content if expanded.
 * @param noteNode - The note node to insert.
 * @param selection - The selection where to insert the note.
 * @param viewOptions - The current editor view options.
 */
export function $insertNoteWithSelect(
  noteNode: NoteNode,
  selection: RangeSelection,
  viewOptions: ViewOptions | undefined,
) {
  const isCollapsed = viewOptions?.noteMode === "collapsed";
  noteNode.setIsCollapsed(isCollapsed);

  if (!selection.isCollapsed()) $moveSelectionToEnd(selection);

  selection.insertNodes([noteNode]);
  if (!isCollapsed) {
    const lastCharChild = noteNode.getChildren().reverse().find($isCharNode);
    lastCharChild?.selectEnd();
  }
}

export function $createNoteChildren(
  selection: RangeSelection,
  marker: string,
  scriptureReference: ScriptureReference | undefined,
  logger: LoggerBasic | undefined,
): LexicalNode[] | undefined {
  const children: LexicalNode[] = [];
  const { chapterNum, verseNum } = scriptureReference ?? {};
  switch (marker) {
    case "f":
    case "fe":
    case "ef":
    case "efe":
      if (chapterNum !== undefined && verseNum !== undefined) {
        children.push($createCharNode("fr").append($createTextNode(`${chapterNum}:${verseNum} `)));
      }
      if (!selection.isCollapsed()) {
        const selectedText = selection.getTextContent().trim();
        if (selectedText.length > 0) {
          const fq = $createCharNode("fq").append($createTextNode(selectedText));
          children.push(fq);
        }
      }
      children.push($createCharNode("ft").append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT)));
      break;
    case "x":
    case "ex":
      if (chapterNum !== undefined && verseNum !== undefined) {
        children.push($createCharNode("xo").append($createTextNode(`${chapterNum}:${verseNum} `)));
      }
      if (!selection.isCollapsed()) {
        const selectedText = selection.getTextContent().trim();
        if (selectedText.length > 0) {
          const xq = $createCharNode("xq").append($createTextNode(selectedText));
          children.push(xq);
        }
      }
      children.push($createCharNode("xt").append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT)));
      break;
    default:
      logger?.warn(`$createNoteChildren: Unsupported note marker '${marker}'`);
      return undefined;
  }

  return children;
}

/**
 * Creates a note node including children with the given parameters.
 * @param marker - The marker for the note.
 * @param caller - The caller for the note.
 * @param contentNodes - The content nodes for the note.
 * @param viewOptions - The view options for the note.
 * @param nodeOptions - The node options for the note.
 * @param segment - The segment for the note.
 * @returns The created note node.
 */
// Keep this function updated with logic from
// `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` > `createNote`
export function $createWholeNote(
  marker: string,
  caller: string | undefined,
  contentNodes: LexicalNode[],
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  segment?: string,
) {
  const isCollapsed = viewOptions?.noteMode !== "expanded";
  const note = $createNoteNode(marker, caller, isCollapsed);
  if (segment) $setState(note, segmentState, () => segment);

  let openingMarkerNode: MarkerNode | ImmutableTypedTextNode | undefined;
  let closingMarkerNode: MarkerNode | ImmutableTypedTextNode | undefined;
  if (viewOptions?.markerMode === "editable") {
    openingMarkerNode = $createMarkerNode(marker);
    closingMarkerNode = $createMarkerNode(marker, "closing");
  } else if (viewOptions?.markerMode === "visible") {
    openingMarkerNode = $createImmutableTypedTextNode("marker", openingMarkerText(marker) + NBSP);
    closingMarkerNode = $createImmutableTypedTextNode("marker", closingMarkerText(marker) + NBSP);
  }

  let callerNode: ImmutableNoteCallerNode | TextNode;
  if (openingMarkerNode) note.append(openingMarkerNode);
  if (viewOptions?.markerMode === "editable") {
    if (caller === "") note.append(...contentNodes);
    else {
      callerNode = $createTextNode(getEditableCallerText(note.__caller));
      note.append(callerNode, ...contentNodes);
    }
  } else {
    const $createSpaceNodeFn = () => $createTextNode(NBSP);
    const spacedContentNodes = contentNodes.flatMap($addSpaceNodes($createSpaceNodeFn));
    if (caller === "") note.append(...spacedContentNodes);
    else {
      const previewText = $getNoteCallerPreviewText(contentNodes);
      let onClick: NoteCallerOnClick = () => undefined;
      if (nodeOptions?.noteCallerOnClick) {
        onClick = nodeOptions.noteCallerOnClick;
      }
      callerNode = $createImmutableNoteCallerNode(note.__caller, previewText, onClick);
      note.append(callerNode, $createSpaceNodeFn(), ...spacedContentNodes);
    }
  }
  if (closingMarkerNode) note.append(closingMarkerNode);

  return note;
}

/**
 * Gets the note using the editor key or at the specified note index.
 * @param noteKeyOrIndex - The note key or index, e.g. 1 would select the second note in the editor.
 * @returns The note at the specified index, or `undefined` if not found.
 */
export function $getNoteByKeyOrIndex(noteKeyOrIndex: string | number): NoteNode | undefined {
  if (typeof noteKeyOrIndex === "string") {
    const node = $getNodeByKey(noteKeyOrIndex);
    if (!$isNoteNode(node)) return;
    return node;
  }

  const dfsNodes = $dfs();
  if (dfsNodes.length <= 0) return;

  const dfsNotes = dfsNodes.filter((dfsNode) => $isNoteNode(dfsNode.node));
  const note = dfsNotes[noteKeyOrIndex]?.node;
  if (!$isNoteNode(note)) return;

  return note;
}

/**
 * Selects the given note node, expanding or collapsing it based on the current view options.
 * @param noteNode - The note node to select.
 * @param viewOptions - The current editor view options.
 */
export function $selectNote(noteNode: NoteNode, viewOptions: ViewOptions | undefined) {
  const isCollapsed = viewOptions?.noteMode === "collapsed";
  noteNode.setIsCollapsed(isCollapsed);
  if (isCollapsed) {
    const nodeBefore = noteNode.getPreviousSibling();
    if ($isImmutableVerseNode(nodeBefore) || !nodeBefore) {
      const parent = noteNode.getParent();
      if (parent) {
        const nodeIndex = noteNode.getIndexWithinParent();
        parent.select(nodeIndex, nodeIndex);
      }
    } else nodeBefore.selectEnd();
  } else {
    const lastCharChild = noteNode.getChildren().reverse().find($isCharNode);
    lastCharChild?.selectEnd();
  }
}

/** Add the given space node after each child node */
function $addSpaceNodes(
  $createSpaceNodeFn: () => TextNode,
): (
  this: undefined,
  value: LexicalNode,
  index: number,
  array: LexicalNode[],
) => LexicalNode | readonly LexicalNode[] {
  return (node) => {
    if ($isImmutableTypedTextNode(node)) return [node];
    return [node, $createSpaceNodeFn()];
  };
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
    if ($isSomeVerseNode(child)) return child as SomeVerseNode;
  }
  return undefined;
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
 * @param selection - The current range selection.
 * @returns `true` if the selection was moved, `false` otherwise.
 */
export function $selectNextVerse(selection: RangeSelection): boolean {
  const anchorNode = selection.anchor.getNode();
  const currentVerse = $findThisVerse(anchorNode);

  let nextVerse: SomeVerseNode | undefined;

  if (currentVerse) {
    const parent = currentVerse.getParent();
    if (parent && $isElementNode(parent)) {
      const children = parent.getChildren();
      const currentIndex = currentVerse.getIndexWithinParent();
      for (let i = currentIndex + 1; i < children.length; i++) {
        const child = children[i];
        if ($isSomeVerseNode(child)) {
          nextVerse = child as SomeVerseNode;
          break;
        }
      }
    }
    if (!nextVerse && parent) {
      let nextPara = parent.getNextSibling();
      while (nextPara && !$isSomeChapterNode(nextPara)) {
        const verse = $findNextVerseInNode(nextPara);
        if (verse) {
          nextVerse = verse;
          break;
        }
        nextPara = nextPara.getNextSibling();
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
 * @param selection - The current range selection.
 * @returns `true` if the selection was moved, `false` otherwise.
 */
export function $selectPreviousVerse(selection: RangeSelection): boolean {
  const anchorNode = selection.anchor.getNode();
  const currentVerse = $findThisVerse(anchorNode);

  let prevVerse: SomeVerseNode | undefined;

  if (currentVerse) {
    const parent = currentVerse.getParent();
    if (parent && $isElementNode(parent)) {
      prevVerse = $findPreviousVerseInSiblings(parent, currentVerse.getIndexWithinParent());
    }
    if (!prevVerse && parent) {
      let prevPara = parent.getPreviousSibling();
      while (prevPara && !$isSomeChapterNode(prevPara)) {
        const verse = $findLastVerseInNode(prevPara);
        if (verse) {
          prevVerse = verse;
          break;
        }
        prevPara = prevPara.getPreviousSibling();
      }
    }
  } else {
    const topLevel = anchorNode.getTopLevelElement();
    const prevPara = topLevel?.getPreviousSibling();
    if (prevPara && !$isSomeChapterNode(prevPara)) {
      prevVerse = $findLastVerseInNode(prevPara);
    }
  }

  if (!prevVerse) return false;
  prevVerse.selectNext(0, 0);
  return true;
}
