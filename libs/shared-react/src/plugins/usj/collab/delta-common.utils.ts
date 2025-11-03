/** Common utilities used for OT Delta realtime collaborative editing. */

import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import { OTEmbedTypes, validOTEmbedTypes } from "./rich-text-ot.model";
import { $dfs, DFSNode } from "@lexical/utils";
import {
  $getNodeByKey,
  $isTextNode,
  EditorState,
  ElementNode,
  LexicalNode,
  NodeKey,
} from "lexical";
import { Op } from "quill-delta";
import {
  $isBookNode,
  $isDescendantOf,
  $isImmutableUnmatchedNode,
  $isMilestoneNode,
  $isNoteNode,
  $isSomeChapterNode,
  $isSomeParaNode,
  $isUnknownNode,
  BookNode,
  ImmutableUnmatchedNode,
  MilestoneNode,
  NoteNode,
  SomeChapterNode,
  SomeParaNode,
  UnknownNode,
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

interface OpenContentEmbed {
  node: NoteNode | UnknownNode;
  position: number;
}

/** Line Feed character used to close para-like nodes.*/
export const LF = "\n";

/**
 * Get the replace embed operations for a given embed node key.
 * @param embedNodeKey - The key of the embed node to replace.
 * @param insertEmbedOps - The operations to insert the new embed node.
 * @returns The replace embed operations, or `undefined` if the node is not found.
 */
export function $getReplaceEmbedOps(
  embedNodeKey: NodeKey,
  insertEmbedOps: DeltaOp[],
): DeltaOp[] | undefined {
  const node = $getNodeByKey(embedNodeKey);
  if (!$isEmbedNode(node)) return;

  const retain = $getOTPositionOfNode(node);
  if (retain === undefined) return;

  const ops: DeltaOp[] = [{ retain }, ...insertEmbedOps, { delete: 1 }];
  return ops;
}

/**
 * Calculate the OT (Operational Transform) position of a given node in the document.
 *
 * @remarks
 * - Text nodes return their start position
 * - Embed nodes (chapter, verse, milestone, note, unmatched) return their position (length 1)
 * - Para-like nodes (ParaNode, BookNode, ImpliedParaNode) return their closing position (length 1)
 * - CharNodes have no OT length contribution
 *
 * @param node - The Lexical node to find the position for.
 * @returns The OT position of the node, or `undefined` if the node is not found.
 */
export function $getOTPositionOfNode(node: LexicalNode | null | undefined): number | undefined {
  if (!node) return undefined;

  const dfsNodes = $dfs();
  let currentIndex = 0;
  const openParaLikeNodes: ParaLikeNode[] = [];
  const openContentEmbeds: OpenContentEmbed[] = [];
  const targetKey = node.getKey();
  let targetParaLikeNode: ParaLikeNode | undefined;

  for (const dfsNode of dfsNodes) {
    const currentNode = dfsNode.node;

    // Before processing the current node, check if any previously opened para-like nodes are
    // closing.
    for (let j = openParaLikeNodes.length - 1; j >= 0; j--) {
      if ($isElementNodeClosing(openParaLikeNodes[j], dfsNode)) {
        const closingPara = openParaLikeNodes[j];
        openParaLikeNodes.splice(j, 1);
        currentIndex += 1;

        // If this is the target para-like node closing, return its position
        if (targetParaLikeNode && closingPara.getKey() === targetParaLikeNode.getKey()) {
          return currentIndex - 1; // Return the position we just incremented
        }
      }
    }

    // Check if any open content embed nodes (note/unknown) are closing
    for (let j = openContentEmbeds.length - 1; j >= 0; j--) {
      if ($isElementNodeClosing(openContentEmbeds[j].node, dfsNode)) {
        openContentEmbeds.splice(j, 1);
      }
    }

    const activeContentEmbed = openContentEmbeds[openContentEmbeds.length - 1];
    if (activeContentEmbed) {
      if (currentNode.getKey() === targetKey) {
        return activeContentEmbed.position;
      }
      continue;
    }

    // Check if we've found the target node
    if (currentNode.getKey() === targetKey) {
      // For text nodes, return the start position
      if ($isTextNode(currentNode)) return currentIndex;

      // For embed nodes, return their position
      if ($isEmbedNode(currentNode)) return currentIndex;

      // For para-like nodes, mark it and continue to find its closing position
      if ($isParaLikeNode(currentNode)) {
        targetParaLikeNode = currentNode;
        // Continue processing to find where this para closes
      }
      // For CharNodes or other nodes that don't have OT positions, continue searching
      // (CharNodes don't have their own position, their text content does)
    }

    // Track opening of para-like nodes after checking for target
    if ($isParaLikeNode(currentNode)) {
      if (!openParaLikeNodes.includes(currentNode)) {
        openParaLikeNodes.push(currentNode);
      }
    }

    // Track when we enter a note or unknown node (treat contents as opaque)
    if ($isNoteNode(currentNode) || $isUnknownNode(currentNode)) {
      if (currentNode.getKey() === targetKey) return currentIndex;

      openContentEmbeds.push({ node: currentNode, position: currentIndex });
      currentIndex += 1; // Embeds contribute 1 to OT length
      continue; // Skip normal OT contribution calculation for embed contents
    }

    // Calculate OT length contribution of current node
    currentIndex += $getNodeOTContribution(currentNode);
  }

  // If we're looking for a para-like node that didn't close, return current position
  if (targetParaLikeNode) return currentIndex;

  // Node not found
  return undefined;
}

/**
 * Get the key of the inserted node from the OT delta operations.
 * @param ops - The OT delta operations with potential insertion.
 * @param editorState - The current editor state.
 * @returns The key of the inserted node if found, `undefined` otherwise.
 */
export function getInsertedNodeKey(ops: DeltaOp[], editorState: EditorState): NodeKey | undefined {
  if (ops.length < 2 || !isRetainOp(ops[0]) || !isInsertEmbedOp(ops[1])) return undefined;

  const retain = ops[0].retain;
  return editorState.read(() => {
    const node = $getNodeFromOTPosition(retain);
    return node?.getKey();
  });
}

/**
 * Get the Lexical node at a specific OT delta position.
 * @param otPosition - The OT delta position in the doc.
 * @returns The Lexical node if found, `undefined` otherwise.
 */
export function $getNodeFromOTPosition(otPosition: number): LexicalNode | undefined {
  const dfsNodes = $dfs();
  let currentIndex = 0;
  const openParaLikeNodes: ParaLikeNode[] = [];
  const openContentEmbeds: OpenContentEmbed[] = [];

  for (const dfsNode of dfsNodes) {
    const currentNode = dfsNode.node;

    // Before processing the current node, check if any previously opened para-like nodes are
    // closing.
    for (let j = openParaLikeNodes.length - 1; j >= 0; j--) {
      if ($isElementNodeClosing(openParaLikeNodes[j], dfsNode)) {
        const closingPara = openParaLikeNodes[j];
        openParaLikeNodes.splice(j, 1);

        // Check if this closing position matches our target
        if (currentIndex === otPosition) {
          return closingPara;
        }
        currentIndex += 1;
      }
    }

    // Check if any open content embed nodes (note/unknown) are closing
    for (let j = openContentEmbeds.length - 1; j >= 0; j--) {
      if ($isElementNodeClosing(openContentEmbeds[j].node, dfsNode)) {
        openContentEmbeds.splice(j, 1);
      }
    }

    const activeContentEmbed = openContentEmbeds[openContentEmbeds.length - 1];
    if (activeContentEmbed) {
      if (activeContentEmbed.position === otPosition) {
        return activeContentEmbed.node;
      }
      continue;
    }

    // Track opening of para-like nodes
    if ($isParaLikeNode(currentNode)) {
      if (!openParaLikeNodes.includes(currentNode)) {
        openParaLikeNodes.push(currentNode);
      }
    }

    // Track when we enter a note or unknown node (treat contents as opaque)
    if ($isNoteNode(currentNode) || $isUnknownNode(currentNode)) {
      if (currentIndex === otPosition) {
        return currentNode;
      }
      openContentEmbeds.push({ node: currentNode, position: currentIndex });
      currentIndex += 1;
      continue;
    }

    // Calculate OT length contribution of current node
    const contribution = $getNodeOTContribution(currentNode);

    // For text nodes, check if the position falls within this node's range
    if ($isTextNode(currentNode) && contribution > 0) {
      if (otPosition >= currentIndex && otPosition < currentIndex + contribution) {
        return currentNode;
      }
    }

    // For embed nodes (contribution === 1), check exact position
    if ($isEmbedNode(currentNode)) {
      if (currentIndex === otPosition) {
        return currentNode;
      }
    }

    currentIndex += contribution;
  }

  // Check if any remaining open para-like nodes close at the final position
  for (const paraNode of openParaLikeNodes) {
    if (currentIndex === otPosition) {
      return paraNode;
    }
    currentIndex += 1;
  }

  // Position not found or out of bounds
  return undefined;
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
  if (!nextDfsNode) {
    // End of traversal, so this node is closing
    return true;
  }

  // Check if the next node is a descendant of the current node
  return !$isDescendantOf(nextDfsNode.node, node.getKey());
}

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
    $isUnknownNode(node) ||
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
 * Type guard to check if the given insert embed operation is for the specified embed type.
 *
 * @param embedType - The type of embed to check for, e.g. "note".
 * @param op - The OT delta operation to check.
 * @returns `true` if the operation is for the specified embed type, `false` otherwise.
 *
 * @public
 */
export function isInsertEmbedOpOfType<T extends keyof OTEmbedTypes>(
  embedType: T,
  op: DeltaOp | undefined,
): op is DeltaOp & { insert: { [K in T]: OTEmbedTypes[K] | null } } {
  return op?.insert != null && typeof op.insert === "object" && embedType in op.insert;
}

/**
 * Type guard to check if the given insert embed operation is for an embed type.
 * @param op - The OT delta operation to check.
 * @returns `true` if the operation is for an embed type, `false` otherwise.
 */
function isInsertEmbedOp<T extends keyof OTEmbedTypes>(
  op: DeltaOp,
): op is DeltaOp & { insert: { [K in T]?: OTEmbedTypes[K] | null } } {
  if (op.insert == null || typeof op.insert !== "object") return false;

  const embedType = Object.keys(op.insert)[0] as T;
  return (
    op.insert != null &&
    typeof op.insert === "object" &&
    embedType in op.insert &&
    validOTEmbedTypes.includes(embedType as keyof OTEmbedTypes)
  );
}

/**
 * Type guard to check if the given operation is a retain operation.
 * @param op - The OT delta operation to check.
 * @returns `true` if it is a retain operation, `false` otherwise.
 */
function isRetainOp(op: DeltaOp): op is { retain: number } {
  return op.retain != null && typeof op.retain === "number";
}

/** Calculate the OT length contribution of a single node. */
function $getNodeOTContribution(node: LexicalNode): number {
  if ($isTextNode(node)) return node.getTextContentSize();

  if ($isEmbedNode(node)) return 1;

  // CharNodes and other nodes don't contribute to OT length
  return 0;
}
