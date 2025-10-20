import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import {
  $isElementNodeClosing,
  $isParaLikeNode,
  DeltaOp,
  LF,
  ParaLikeNode,
} from "./delta-common.utils";
import {
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
  OTNoteEmbed,
  OTParaAttribute,
  OTUnmatchedEmbed,
  OTVerseEmbed,
} from "./rich-text-ot.model";
import { $dfs, DFSNode } from "@lexical/utils";
import { $getRoot, $getState, $isTextNode, EditorState, LexicalNode, TextNode } from "lexical";
import Delta from "quill-delta";
import {
  $isBookNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isImpliedParaNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  BOOK_MARKER,
  BookNode,
  CHAPTER_MARKER,
  charIdState,
  CharNode,
  ImmutableUnmatchedNode,
  MilestoneNode,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  NoteNode,
  ParaNode,
  segmentState,
  SomeChapterNode,
  VERSE_MARKER,
} from "shared";

interface OpenNote {
  children: LexicalNode[];
  contentsOps?: DeltaOp[];
}

export function $getTextOp(node: TextNode, openCharNodes?: CharNode[]): DeltaOp {
  const op: DeltaOp = { insert: node.__text };
  const segment = $getState(node, segmentState);
  if (segment) op.attributes = { segment };
  if (openCharNodes && openCharNodes.length > 0) {
    let char: OTCharAttribute = openCharNodes.map((charNode) => {
      const charItem: OTCharItem = { style: charNode.__marker };
      const cid = $getState(charNode, charIdState);
      if (cid) charItem.cid = cid;
      return charItem;
    });
    if (char.length === 1) {
      char = char[0];
    }

    op.attributes = {
      ...op.attributes,
      char,
    };
  }
  return op;
}

export function getEditorDelta(editorState: EditorState): Delta {
  const update = new Delta();
  if (editorState.isEmpty()) return update;

  editorState.read(() => {
    const root = $getRoot();
    if (!root || root.isEmpty()) return;

    // check for default empty implied-para node
    const rootChildren = root.getChildren();
    if (
      rootChildren.length === 1 &&
      $isImpliedParaNode(rootChildren[0]) &&
      (!rootChildren[0].getChildren() || rootChildren[0].getChildrenSize() === 0)
    ) {
      return;
    }

    const ops = $getAllNodeOps();
    for (const op of ops) update.push(op);
  });
  return update;
}

/**
 * Get the operational transform (OT) delta operations for a specific node or range of nodes.
 * Pass nothing to get all nodes.
 *
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the
 *   startingNode.
 * @returns An array of DeltaOp objects representing the OT operations for the specified nodes.
 */
export function $getParticularNodeOps(startNode?: LexicalNode, endNode?: LexicalNode) {
  const ops: DeltaOp[] = [];
  const dfsNodes = $dfs(startNode, endNode);
  const openParaLikeNodes: ParaLikeNode[] = [];
  const openCharNodes: CharNode[] = [];
  const openNote: OpenNote = { children: [], contentsOps: [] };
  for (let i = 0; i < dfsNodes.length; i++) {
    const currentNode = dfsNodes[i].node;
    ops.push(...$getNodeOps(currentNode, i, dfsNodes, openParaLikeNodes, openCharNodes, openNote));
  }
  // Close any remaining open nodes
  for (const openNode of openParaLikeNodes) {
    ops.push(
      ...$getNodeOps(
        openNode,
        dfsNodes.length,
        dfsNodes,
        openParaLikeNodes,
        openCharNodes,
        openNote,
      ),
    );
  }
  return ops;
}

function $getAllNodeOps() {
  return $getParticularNodeOps();
}

function $getNodeOps(
  currentNode: LexicalNode | undefined,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openParaLikeNodes: ParaLikeNode[],
  openCharNodes: CharNode[],
  openNote: OpenNote,
): DeltaOp[] {
  if (!currentNode) return [];

  const ops: DeltaOp[] = [];
  $handleBlockNodes(currentNode, ops, openParaLikeNodes);

  $handleTextNodes(currentNode, ops, openCharNodes, openNote);

  $handleCharNodes(currentNode, currentIndex, dfsNodes, openCharNodes);

  // is an EmbedNode
  if ($isSomeChapterNode(currentNode)) ops.push($getChapterOp(currentNode));
  if ($isSomeVerseNode(currentNode)) ops.push($getVerseOp(currentNode));
  if ($isMilestoneNode(currentNode)) ops.push($getMilestoneOp(currentNode));
  if ($isImmutableUnmatchedNode(currentNode)) ops.push($getImmutableUnmatchedOp(currentNode));
  $handleNoteNodes(currentNode, ops, openNote);

  return ops;
}

function $handleBlockNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openParaLikeNodes: ParaLikeNode[],
) {
  if (!currentNode.isInline()) {
    // Handle block nodes
    const openNode = openParaLikeNodes.pop();
    if ($isBookNode(openNode)) ops.push($getBookOp(openNode));
    else if ($isParaNode(openNode)) ops.push($getParaOp(openNode));
    else if ($isImpliedParaNode(openNode)) ops.push({ insert: LF });
  }

  if ($isParaLikeNode(currentNode)) {
    // Track when we open para-like nodes
    if (!openParaLikeNodes.includes(currentNode)) {
      openParaLikeNodes.push(currentNode);
    }
  }
}

function $handleTextNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openCharNodes: CharNode[],
  openNote: OpenNote,
) {
  if (!$isTextNode(currentNode)) return;
  // Remove (skip) editable caller text from note nodes.
  const parent = currentNode.getParent();
  if ($isNoteNode(parent) && parent.getFirstChild() === currentNode) return;

  const textOp = $getTextOp(currentNode, openCharNodes);
  if (openNote.children.includes(currentNode)) {
    const text = currentNode.getTextContent();
    if (!text || text === NBSP || text.startsWith(NODE_ATTRIBUTE_PREFIX)) return;
    openNote.contentsOps?.push(textOp);
  } else {
    ops.push(textOp);
  }
}

function $handleCharNodes(
  currentNode: LexicalNode,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openCharNodes: CharNode[],
): void {
  if ($isCharNode(currentNode) && !openCharNodes.includes(currentNode)) {
    openCharNodes.push(currentNode);
  }

  const nextDfsNode = dfsNodes[currentIndex + 1];
  for (const openCharNode of openCharNodes.toReversed()) {
    if ($isElementNodeClosing(openCharNode, nextDfsNode)) {
      openCharNodes.pop();
    }
  }
}

function $handleNoteNodes(currentNode: LexicalNode, ops: DeltaOp[], openNote: OpenNote) {
  if (!$isNoteNode(currentNode)) return;

  $dfs(currentNode).forEach((n) => openNote.children.push(n.node));
  const noteOp = $getNoteOp(currentNode);
  openNote.contentsOps = noteOp.insert.note.contents?.ops;
  ops.push(noteOp);
}

function $getBookOp(currentNode: BookNode): DeltaOp & { attributes: { book: OTBookAttribute } } {
  const book: OTBookAttribute = { style: BOOK_MARKER, code: currentNode.__code };
  return { insert: LF, attributes: { book } };
}

function $getChapterOp(
  currentNode: SomeChapterNode,
): DeltaOp & { insert: { chapter: OTChapterEmbed } } {
  const chapter: OTChapterEmbed = { style: CHAPTER_MARKER, number: currentNode.__number };
  if (currentNode.__sid) {
    chapter.sid = currentNode.__sid;
  }
  if (currentNode.__altnumber) {
    chapter.altnumber = currentNode.__altnumber;
  }
  if (currentNode.__pubnumber) {
    chapter.pubnumber = currentNode.__pubnumber;
  }
  return { insert: { chapter } };
}

export function $getParaOp(node: ParaNode): DeltaOp & { attributes: { para: OTParaAttribute } } {
  const para: OTParaAttribute = { style: node.__marker };
  return { insert: LF, attributes: { para } };
}

function $getVerseOp(currentNode: SomeVerseNode): DeltaOp & { insert: { verse: OTVerseEmbed } } {
  const verse: OTVerseEmbed = { style: VERSE_MARKER, number: currentNode.__number };
  if (currentNode.__sid) {
    verse.sid = currentNode.__sid;
  }
  if (currentNode.__altnumber) {
    verse.altnumber = currentNode.__altnumber;
  }
  if (currentNode.__pubnumber) {
    verse.pubnumber = currentNode.__pubnumber;
  }
  return { insert: { verse } };
}

function $getMilestoneOp(
  currentNode: MilestoneNode,
): DeltaOp & { insert: { milestone: OTMilestoneEmbed } } {
  const milestone: OTMilestoneEmbed = { style: currentNode.__marker };
  if (currentNode.__sid) {
    milestone.sid = currentNode.__sid;
  }
  if (currentNode.__eid) {
    milestone.eid = currentNode.__eid;
  }
  return { insert: { milestone } };
}

function $getImmutableUnmatchedOp(
  currentNode: ImmutableUnmatchedNode,
): DeltaOp & { insert: { unmatched: OTUnmatchedEmbed } } {
  return { insert: { unmatched: { marker: currentNode.__marker } } };
}

function $getNoteOp(currentNode: NoteNode): DeltaOp & { insert: { note: OTNoteEmbed } } {
  const note: OTNoteEmbed = {
    style: currentNode.__marker,
    caller: currentNode.__caller,
  };
  if (currentNode.__category) {
    note.category = currentNode.__category;
  }
  if (currentNode.getChildrenSize() > 1) {
    note.contents = { ops: [] };
  }
  return { insert: { note } };
}
