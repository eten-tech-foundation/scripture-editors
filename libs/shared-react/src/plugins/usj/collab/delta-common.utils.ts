/** Common utilities used for OT Delta realtime collaborative editing. */

import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import { OTEmbedTypes, validOTEmbedTypes } from "./rich-text-ot.model";
import { $dfs, DFSNode } from "@lexical/utils";
import {
  $getNodeByKey,
  $getState,
  $isElementNode,
  $isTextNode,
  EditorState,
  ElementNode,
  LexicalNode,
  NodeKey,
  TextNode,
} from "lexical";
import { Op } from "quill-delta";
import {
  $isAttributeRunNode,
  $isCursorPlaceholderOnlyText,
  $isDescendantOf,
  $isImmutableUnmatchedNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaLikeNode,
  $isParaMarkerPrefix,
  $isParaNode,
  $isSomeChapterNode,
  $isUnknownNode,
  ImmutableUnmatchedNode,
  MilestoneNode,
  NoteNode,
  ParaLikeNode,
  SomeChapterNode,
  textTypeState,
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

/**
 * The OT coordinate system in which positions are counted.
 *
 * @remarks
 * The editor has TWO OT coordinate systems. They differ only in editable marker mode
 * (`markerMode: "editable"`), where an embed carries presentation glyph text — an editable
 * `ChapterNode`'s glyph text child (e.g. `"\c 1 "`, 5 chars). In every other marker mode
 * embeds have no glyph text and the systems coincide.
 *
 * An editable `VerseNode` also carries glyph text (`VerseNode` extends TextNode; its `__text`
 * IS the glyph, e.g. `"\v 1 "`), but a verse counts as ONE opaque OT unit in BOTH systems: its
 * glyph is engine-owned display, excluded from content ops, so the doc delta emits only the
 * verse embed op, this file's position helpers classify it via {@link $isEmbedNode} (see
 * {@link $isOTTextNode}), and `$applyUpdate`'s traversals treat it as a 1-unit embed too. Only
 * the editable chapter's glyph text is counted differently between the systems.
 *
 * - `"delta-doc"` — the counting that matches the doc delta `getEditorDelta` serializes for
 *   chapters: the chapter embed contributes 1 AND its glyph text child is counted as body text
 *   (editable chapter = 6). This is the coordinate system of the diff op stream
 *   `DeltaOnChangePlugin` emits to the host, and therefore of retains found in locally produced
 *   ops (e.g. `getInsertedNodeKey` over `onChange` ops).
 *
 * - `"apply"` — the counting `$applyUpdate`'s insert/delete traversals use: every ELEMENT embed
 *   is opaque (1 unit; children never descended into; editable chapter = 1). Positions used in
 *   host-local produce→apply round trips (`$getReplaceEmbedOps`, and reverse lookups of where
 *   `$applyUpdate` actually placed a node) MUST use this system, or every op lands offset by
 *   the glyph text length of each preceding editable chapter.
 *
 * The remaining editable-chapter divergence is ACCEPTED: the OT collab path was never fully
 * completed, and no live flow currently routes ops across an editable chapter into
 * `$applyUpdate`.
 */
export type OTCoordinateSystem = "delta-doc" | "apply";

interface OpenContentEmbed {
  node: ElementNode;
  position: number;
}

/** Line Feed character used to close para-like nodes.*/
export const LF = "\n";

/**
 * Get the replace embed operations for a given embed node key.
 *
 * @remarks
 * The returned ops are host-local: they are meant to be fed straight to `$applyUpdate`, so
 * the retain is computed in `"apply"` coordinates (see {@link OTCoordinateSystem}) to agree
 * with `$applyUpdate`'s insert/delete traversals.
 *
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

  const retain = $getOTPositionOfNode(node, "apply");
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
 * @param coordinates - The OT coordinate system to count in (see {@link OTCoordinateSystem}).
 *   Defaults to the legacy `"delta-doc"` counting; pass `"apply"` for positions consumed by
 *   `$applyUpdate`.
 * @returns The OT position of the node, or `undefined` if the node is not found.
 */
export function $getOTPositionOfNode(
  node: LexicalNode | null | undefined,
  coordinates: OTCoordinateSystem = "delta-doc",
): number | undefined {
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
      // For text nodes, return the start position (an editable verse is an embed, not text —
      // see $isOTTextNode — so it falls to the embed check below)
      if ($isOTTextNode(currentNode)) return currentIndex;

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

    // Track when we enter an opaque content container (note/unknown always; any element
    // embed such as an editable chapter in "apply" coordinates)
    if ($isOpaqueContentNode(currentNode, coordinates)) {
      if (currentNode.getKey() === targetKey) return currentIndex;

      openContentEmbeds.push({ node: currentNode, position: currentIndex });
      currentIndex += 1; // Embeds contribute 1 to OT length
      continue; // Skip normal OT contribution calculation for embed contents
    }

    // Calculate OT length contribution of current node
    currentIndex += $getNodeOTContribution(currentNode, coordinates);
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
 * @param coordinates - The OT coordinate system the retain in `ops` is expressed in (see
 *   {@link OTCoordinateSystem}). Use `"apply"` when the ops were applied by `$applyUpdate`
 *   (the node was placed at the retain in apply coordinates); use the default `"delta-doc"`
 *   for retains produced by doc-delta diffs (e.g. `DeltaOnChangePlugin` local-edit ops).
 * @returns The key of the inserted node if found, `undefined` otherwise.
 */
export function getInsertedNodeKey(
  ops: DeltaOp[],
  editorState: EditorState,
  coordinates: OTCoordinateSystem = "delta-doc",
): NodeKey | undefined {
  if (ops.length < 2 || !isRetainOp(ops[0]) || !isInsertEmbedOp(ops[1])) return undefined;

  const retain = ops[0].retain;
  return editorState.read(() => {
    const node = $getNodeFromOTPosition(retain, coordinates);
    return node?.getKey();
  });
}

/**
 * Get the Lexical node at a specific OT delta position.
 *
 * @remarks
 * This is the reverse of {@link $getOTPositionOfNode}: both must count in the SAME
 * coordinate system for round trips to resolve to the same node.
 *
 * @param otPosition - The OT delta position in the doc.
 * @param coordinates - The OT coordinate system to count in (see {@link OTCoordinateSystem}).
 * @returns The Lexical node if found, `undefined` otherwise.
 */
export function $getNodeFromOTPosition(
  otPosition: number,
  coordinates: OTCoordinateSystem = "delta-doc",
): LexicalNode | undefined {
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

    // Track when we enter an opaque content container (note/unknown always; any element
    // embed such as an editable chapter in "apply" coordinates)
    if ($isOpaqueContentNode(currentNode, coordinates)) {
      if (currentIndex === otPosition) {
        return currentNode;
      }
      openContentEmbeds.push({ node: currentNode, position: currentIndex });
      currentIndex += 1;
      continue;
    }

    // Calculate OT length contribution of current node
    const contribution = $getNodeOTContribution(currentNode, coordinates);

    // For text nodes, check if the position falls within this node's range (an editable verse is
    // an embed, not text — see $isOTTextNode — so it is matched by the embed check below instead)
    if ($isOTTextNode(currentNode) && contribution > 0) {
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
 * Type guard for a node that contributes its glyph TEXT to OT length — a genuine text node, and
 * NOT an embed that merely subclasses `TextNode`.
 *
 * The only embed that is also a `TextNode` is an editable `VerseNode` (its `__text` IS the
 * `"\v 1 "` glyph). Like every embed it counts as ONE opaque OT unit, so OT-counting traversals
 * must classify it via {@link $isEmbedNode} and never measure or split its glyph text. Use this
 * in place of `$isTextNode` wherever a text branch precedes an embed branch, so an editable
 * verse falls through to the embed branch. See {@link OTCoordinateSystem}.
 */
export function $isOTTextNode(node: LexicalNode | null | undefined): node is TextNode {
  return $isTextNode(node) && !$isEmbedNode(node);
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

/**
 * Whether the node is an opaque content container in the given coordinate system: it
 * contributes exactly 1 OT unit and its descendants are skipped.
 *
 * Note and unknown contents are opaque in BOTH systems (their contents ops nest inside the
 * embed insert op in the doc delta). Other element-based embeds with presentation glyph
 * children — an editable `ChapterNode` — are opaque only in `"apply"` coordinates:
 * `$applyUpdate`'s traversals never descend into ANY embed, while the doc delta serializes
 * a chapter's glyph text child as a body text op. See {@link OTCoordinateSystem}.
 */
function $isOpaqueContentNode(
  node: LexicalNode,
  coordinates: OTCoordinateSystem,
): node is ElementNode {
  if ($isNoteNode(node) || $isUnknownNode(node)) return true;

  return coordinates === "apply" && $isElementNode(node) && $isEmbedNode(node);
}

/**
 * True when `node` is a paragraph's own marker-prefix glyph — the `\p`-style MarkerNode a
 * ParaNode carries as its first child in editable marker mode ($createMarkerPrefix,
 * markerEditDeletion.utils.ts). Mirrors `editor-delta.adaptor.ts`'s `$isOwnParaPrefixGlyph`: the
 * position check (first child of a ParaNode) is load-bearing, since {@link $isParaMarkerPrefix}
 * identifies the node SHAPE, which is reused for every other glyph in the tree too (a char
 * span's own opener/closer, a note's glyphs, a milestone's or verse's bare attribute glyph) —
 * only a MarkerNode sitting in the paragraph's own prefix slot is presentation scaffolding.
 */
function $isOwnParaPrefixGlyph(node: LexicalNode): boolean {
  const parent = node.getParent();
  return $isParaMarkerPrefix(node) && $isParaNode(parent) && parent.getFirstChild() === node;
}

/**
 * True when `node` sits inside an `AttributeRunNode` wrapper (a verse's/milestone's display run,
 * once wrapped — see `AttributeRunNode.ts`). The wrapper is pure presentation scaffolding — its
 * children are the SAME run pieces (glyphs, attribute text) that already ride as loose siblings
 * pre-Task-14 — so this is the wrapped-shape counterpart of `$isOwnParaPrefixGlyph` below: an
 * ANCESTRY check rather than a sibling-adjacency one, so it also catches shapes the loose-piece
 * exclusions in `editor-delta.adaptor.ts` can miss by adjacency alone (e.g. a milestone's glyph
 * pair with no attribute text between them, where neither glyph has an attribute-tagged sibling
 * to key off of).
 */
export function $hasAttributeRunAncestor(node: LexicalNode): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent())
    if ($isAttributeRunNode(parent)) return true;
  return false;
}

/**
 * Calculate the OT length contribution of a single node.
 *
 * @param coordinates - The OT coordinate system to count in (see {@link OTCoordinateSystem}).
 *   A paragraph's own marker-prefix glyph and its NBSP separator are presentation scaffolding
 *   that `editor-delta.adaptor.ts`'s `$handleTextNodes` excludes from content ops — but ONLY in
 *   `"delta-doc"` coordinates, which must agree with that ops stream. `"apply"` coordinates are
 *   DEFINED as whatever `$applyUpdate`'s own insert/delete/attribute traversals do
 *   (delta-apply-update.utils.ts), and none of them skip these nodes — every one counts an OT
 *   text node's raw `getTextContentSize()` unconditionally. So `"apply"` coordinates must keep
 *   counting the prefix and separator too, or a replace-embed retain computed here would
 *   disagree with where `$applyUpdate` actually walks to (a note "replace" landing one-plus-
 *   prefix-length short of the note it meant to delete, deleting the wrong node and leaving the
 *   replacement appended instead). If `$applyUpdate`'s traversals are ever taught to skip these
 *   nodes too, this exclusion should extend to `"apply"` at the same time — not before.
 *
 *   The SAME reasoning governs the new `$hasAttributeRunAncestor` exclusion below: `$applyUpdate`
 *   does not know about `AttributeRunNode` at all yet (the adaptor never builds one — Task 14),
 *   so its traversals would treat a wrapper as an ordinary, un-special-cased `ElementNode` (zero
 *   contribution of its own, descend into children) and count each child's raw text length
 *   exactly as it already does for today's LOOSE run pieces — i.e. wrapping changes nothing about
 *   what `$applyUpdate` would do. `"apply"` coordinates must therefore keep counting a wrapped
 *   piece's text too, matching that (unchanged) traversal; only `"delta-doc"` excludes it, mirroring
 *   `editor-delta.adaptor.ts`'s existing loose-piece ops exclusion for the identical bytes.
 */
function $getNodeOTContribution(node: LexicalNode, coordinates: OTCoordinateSystem): number {
  // A bare cursor host (EmptyVerseCaretGuardPlugin) is a transient, collab-invisible node: its
  // insertion is never emitted, so it must contribute nothing to OT positions or the local doc
  // would drift one position ahead of every peer while a host rests.
  if ($isCursorPlaceholderOnlyText(node)) return 0;

  // Embeds are checked FIRST: an editable VerseNode is a TextNode subclass but counts as one
  // opaque OT unit (its glyph text is engine-owned display, excluded from content ops), the same
  // as it counts in the doc delta and in `$applyUpdate`'s traversals. See {@link $isOTTextNode}.
  if ($isEmbedNode(node)) return 1;

  if ($isTextNode(node)) {
    if (
      coordinates === "delta-doc" &&
      ($isOwnParaPrefixGlyph(node) ||
        $getState(node, textTypeState) === "marker-trailing-space" ||
        $hasAttributeRunAncestor(node))
    )
      return 0;
    return node.getTextContentSize();
  }

  // CharNodes and other nodes don't contribute to OT length
  return 0;
}
