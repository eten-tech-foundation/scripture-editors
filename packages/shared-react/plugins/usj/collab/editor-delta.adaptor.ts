import { ParaLikeNode, $isParaLikeNode, $isClosingParaLikeNode, LF } from "./delta-common.utils";
import {
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
  OTNoteEmbed,
  OTParaAttribute,
  OTVerseEmbed,
} from "./rich-text-ot.model";
import { $dfs, DFSNode } from "@lexical/utils";
import { $getRoot, $getState, $isTextNode, EditorState, LexicalNode, TextNode } from "lexical";
import Delta, { Op } from "quill-delta";
import { $isSomeVerseNode, SomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import { charIdState, segmentState } from "shared/nodes/collab/delta.state";
import { $isBookNode, BOOK_MARKER, BookNode } from "shared/nodes/usj/BookNode";
import { CHAPTER_MARKER } from "shared/nodes/usj/ChapterNode";
import { $isCharNode, CharNode } from "shared/nodes/usj/CharNode";
import { $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $isMilestoneNode, MilestoneNode } from "shared/nodes/usj/MilestoneNode";
import { $isSomeChapterNode, SomeChapterNode } from "shared/nodes/usj/node.utils";
import { $isNoteNode, NoteNode } from "shared/nodes/usj/NoteNode";
import { $isParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { VERSE_MARKER } from "shared/nodes/usj/VerseNode";

type OpenNote = {
  children: LexicalNode[];
  contentsOps?: Op[];
};

export function getEditorDelta(editorState: EditorState): Delta {
  let update = new Delta();
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

export function $getTextOp(node: TextNode, openCharNodes?: CharNode[]): Op {
  const op: Op = { insert: node.__text };
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

function $getAllNodeOps() {
  const ops: Op[] = [];
  const dfsNodes = $dfs();
  const openParaLikeNodes: ParaLikeNode[] = [];
  const openCharNodes: CharNode[] = [];
  const openNote: OpenNote = { children: [], contentsOps: [] };
  for (let i = 0; i < dfsNodes.length; i++) {
    const currentNode = dfsNodes[i].node;
    ops.push(...$getNodeOps(currentNode, i, dfsNodes, openParaLikeNodes, openCharNodes, openNote));
  }
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

function $getNodeOps(
  currentNode: LexicalNode | undefined,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openParaLikeNodes: ParaLikeNode[],
  openCharNodes: CharNode[],
  openNote: OpenNote,
): Op[] {
  if (!currentNode) return [];

  const ops: Op[] = [];
  if (!currentNode.isInline()) {
    // Handle block nodes
    const openNode = openParaLikeNodes.pop();
    if ($isBookNode(openNode)) ops.push($getBookOp(openNode));
    else if ($isParaNode(openNode)) ops.push($getParaOp(openNode));
    else if ($isImpliedParaNode(openNode)) ops.push({ insert: LF });
    if (openNode === currentNode) {
      // If the open node is the same as the current node, we are closing it
      return ops;
    }
  }

  if ($isParaLikeNode(currentNode)) {
    const op = $getParaLikeNodeOp(currentNode, currentIndex, dfsNodes, openParaLikeNodes);
    if (op) ops.push(op);
  }

  $handleTextNodes(currentNode, ops, openCharNodes, openNote);

  $handleCharNodes(currentNode, currentIndex, dfsNodes, openCharNodes);

  // is an EmbedNode
  if ($isSomeChapterNode(currentNode)) ops.push($getChapterOp(currentNode));
  if ($isSomeVerseNode(currentNode)) ops.push($getVerseOp(currentNode));
  if ($isMilestoneNode(currentNode)) ops.push($getMilestoneOp(currentNode));
  $handleNoteNodes(currentNode, ops, openNote);

  return ops;
}

/**
 * Calculate the OT length contribution of para-like nodes which have OT length 1 on close.
 */
function $getParaLikeNodeOp(
  currentNode: ParaLikeNode,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openParaLikeNodes: LexicalNode[],
): Op | undefined {
  // Track when we open para-like nodes
  if (!openParaLikeNodes.includes(currentNode)) {
    openParaLikeNodes.push(currentNode);
  }

  if ($isClosingParaLikeNode(currentNode, currentIndex, dfsNodes)) {
    // Remove from open nodes
    const index = openParaLikeNodes.indexOf(currentNode);
    if (index > -1) {
      openParaLikeNodes.splice(index, 1);
    }

    if ($isBookNode(currentNode)) return $getBookOp(currentNode);
    else if ($isParaNode(currentNode)) return $getParaOp(currentNode);
    else if ($isImpliedParaNode(currentNode)) return { insert: LF };
  }
}

function $handleTextNodes(
  currentNode: LexicalNode,
  ops: Op[],
  openCharNodes: CharNode[],
  openNote: OpenNote,
) {
  if (!$isTextNode(currentNode)) return;
  // Remove (skip) editable caller text from note nodes.
  const parent = currentNode.getParent();
  if ($isNoteNode(parent) && parent.getFirstChild() === currentNode) return;

  const textOp = $getTextOp(currentNode, openCharNodes);
  if (openNote.children.includes(currentNode)) {
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
    if ($isClosingCharNode(openCharNode, nextDfsNode)) {
      openCharNodes.pop();
    }
  }
}

/**
 * Check if a char node is being closed at this point in the DFS traversal.
 */
export function $isClosingCharNode(
  node: CharNode | undefined,
  nextDfsNode: DFSNode | undefined,
): boolean {
  if (!node) return false;

  // A char node is closing if the next node in DFS is not a descendant.
  // In DFS, all descendants of a node appear consecutively after the node.
  // Look at the next node
  if (!nextDfsNode) {
    // End of traversal, so this node is closing
    return true;
  }

  // Check if the next node is a descendant of the current node
  const nextNode = nextDfsNode.node;
  let parent = nextNode.getParent();

  while (parent) {
    if (parent === node) {
      // Next node is a descendant, so we're not closing yet
      return false;
    }
    parent = parent.getParent();
  }

  // Next node is not a descendant, so we're closing this node
  return true;
}

function $handleNoteNodes(currentNode: LexicalNode, ops: Op[], openNote: OpenNote) {
  if (!$isNoteNode(currentNode)) return;

  $dfs(currentNode).forEach((n) => openNote.children.push(n.node));
  const noteOp = $getNoteOp(currentNode);
  openNote.contentsOps = noteOp.insert.note.contents?.ops;
  ops.push(noteOp);
}

function $getBookOp(currentNode: BookNode): Op & { attributes: { book: OTBookAttribute } } {
  const book: OTBookAttribute = { style: BOOK_MARKER, code: currentNode.__code };
  return { insert: LF, attributes: { book } };
}

function $getChapterOp(currentNode: SomeChapterNode): Op & { insert: { chapter: OTChapterEmbed } } {
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

export function $getParaOp(node: ParaNode): Op & { attributes: { para: OTParaAttribute } } {
  const para: OTParaAttribute = { style: node.__marker };
  return { insert: LF, attributes: { para } };
}

function $getVerseOp(currentNode: SomeVerseNode): Op & { insert: { verse: OTVerseEmbed } } {
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
): Op & { insert: { milestone: OTMilestoneEmbed } } {
  const milestone: OTMilestoneEmbed = { style: currentNode.__marker };
  if (currentNode.__sid) {
    milestone.sid = currentNode.__sid;
  }
  if (currentNode.__eid) {
    milestone.eid = currentNode.__eid;
  }
  return { insert: { milestone } };
}

function $getNoteOp(currentNode: NoteNode): Op & { insert: { note: OTNoteEmbed } } {
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
