/** Common utilities used for OT Delta realtime collaborative editing. */

import { DFSNode } from "@lexical/utils";
import { LexicalNode } from "lexical";
import { SomeVerseNode, $isSomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import {
  ImmutableUnmatchedNode,
  $isImmutableUnmatchedNode,
} from "shared/nodes/features/ImmutableUnmatchedNode";
import { $isBookNode, BookNode } from "shared/nodes/usj/BookNode";
import { MilestoneNode, $isMilestoneNode } from "shared/nodes/usj/MilestoneNode";
import {
  SomeChapterNode,
  $isSomeChapterNode,
  $isSomeParaNode,
  SomeParaNode,
} from "shared/nodes/usj/node.utils";
import { NoteNode, $isNoteNode } from "shared/nodes/usj/NoteNode";

export type EmbedNode =
  | SomeChapterNode
  | SomeVerseNode
  | MilestoneNode
  | NoteNode
  | ImmutableUnmatchedNode;

export type ParaLikeNode = SomeParaNode | BookNode;

/**
 * Type guard to check if a node is an embed. Embeds have an OT length of 1 and are self-contained
 * (no children to process).
 */
export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
  return (
    $isSomeChapterNode(node) ||
    $isSomeVerseNode(node) ||
    $isMilestoneNode(node) ||
    $isNoteNode(node) ||
    $isImmutableUnmatchedNode(node)
  );
}

/**
 * Type guard to check if a node is para-like. Para-like nodes have an OT length of 1 that is
 * counted on its close (rather than its open).
 */
export function $isParaLikeNode(node: LexicalNode | null | undefined): node is ParaLikeNode {
  return $isSomeParaNode(node) || $isBookNode(node);
}

/**
 * Check if a para-like node is being closed at this point in the DFS traversal.
 */
export function $isClosingParaLikeNode(
  node: ParaLikeNode,
  currentIndex: number,
  dfsNodes: DFSNode[],
): boolean {
  // A para-like node is closing if the next node in DFS is not a descendant.
  // In DFS, all descendants of a node appear consecutively after the node.
  // Look at the next node
  const nextDfsNode = dfsNodes[currentIndex + 1];

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
