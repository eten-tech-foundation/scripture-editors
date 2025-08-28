/** Common utilities used for OT Delta realtime collaborative editing. */

import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import { DFSNode } from "@lexical/utils";
import { ElementNode, LexicalNode } from "lexical";
import { Op } from "quill-delta";
import {
  ImmutableUnmatchedNode,
  $isImmutableUnmatchedNode,
  $isBookNode,
  $isMilestoneNode,
  $isNoteNode,
  $isSomeChapterNode,
  $isSomeParaNode,
  BookNode,
  MilestoneNode,
  NoteNode,
  SomeChapterNode,
  SomeParaNode,
} from "shared";

/**
 * Represents a Delta Operation in a collaborative editing environment.
 *
 * @remarks
 * This type is used for collaborative editing operations in the USJ (Unified Scripture JSON)
 * format for Scripture editing functionality. It can also be used to make a change to the editor
 * without reloading the editor (which would happen if the change was made by modifying the USJ).
 *
 * @public
 */
export type DeltaOp = Op;

/**
 * Represents the source of Delta Operations in a collaborative editing environment.
 *
 * @remarks
 * This type is used to distinguish between operations that originate from the local client
 * versus those that come from remote collaborators in a real-time editing session.
 *
 * @public
 */
export type DeltaSource = "local" | "remote";

export type EmbedNode =
  | SomeChapterNode
  | SomeVerseNode
  | MilestoneNode
  | NoteNode
  | ImmutableUnmatchedNode;

export type ParaLikeNode = SomeParaNode | BookNode;

/** Line Feed character used to close para-like nodes.*/
export const LF = "\n";

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
 * Check if an element node is being closed at this point in the DFS traversal.
 */
export function $isElementNodeClosing(
  node: ElementNode | undefined,
  nextDfsNode: DFSNode | undefined,
): boolean {
  if (!node) return false;

  // An element node is closing if the next node in DFS is not a descendant.
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
