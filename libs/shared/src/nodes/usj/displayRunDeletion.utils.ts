/**
 * Classifies a just-destroyed display-run piece (attribute text or a run glyph) back to the node
 * that owns the run it belonged to. Sibling of attributeDisplay.utils.ts: that module keeps a
 * live run in sync with its owner's state; this one recovers the owner from a piece that no
 * longer has live state to sync from, because it was just removed from the tree.
 */
import { $isCharNode } from "./CharNode.js";
import { $isMilestoneNode } from "./MilestoneNode.js";
import { $isVerseNode } from "./VerseNode.js";
import { $isMarkerNode } from "../features/MarkerNode.js";
import { $isUnknownNode } from "../features/UnknownNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $getState, $isTextNode, LexicalNode } from "lexical";

/**
 * Walk back over a chain of run pieces (glyphs and attribute text) to the `VerseNode` or
 * `MilestoneNode` the chain rides on as following siblings. Stops — and returns `undefined` — the
 * moment a sibling is neither the owner nor another run piece, since that means `piece` was never
 * actually part of a display run.
 */
function $runChainOwner(piece: LexicalNode): LexicalNode | undefined {
  for (let prev = piece.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isVerseNode(prev) || $isMilestoneNode(prev)) return prev;
    const isRunPiece =
      $isMarkerNode(prev) || ($isTextNode(prev) && $getState(prev, textTypeState) === "attribute");
    if (!isRunPiece) return undefined;
  }
  return undefined;
}

/**
 * The owner of a destroyed display-run piece — evaluated in the PREVIOUS editor state, where the
 * destroyed node still has its tree position (parent, siblings) to classify from. The deletion
 * driver pends this owner so the deletion settles on caret departure regardless of where the
 * caret landed: deletion intent is detected from the destruction itself, never from caret
 * geometry.
 *
 * Recognizes all four run shapes documented in attributeDisplay.utils.ts: a char span's `|…` run
 * (a direct TextNode child of a CharNode), a verse's `\va`/`\vp` triplet (following siblings), a
 * milestone's opening/attribute/self-closing run (following siblings), and an UnknownNode's
 * `optbreak` token (a direct TextNode child). Returns `undefined` for any other destroyed node —
 * ordinary content, not a display-run piece.
 *
 * @param piece - The destroyed node, read from `prevEditorState`.
 * @returns The CharNode / VerseNode / MilestoneNode / UnknownNode that owned the run `piece` rode
 *   in, or `undefined` if `piece` was not part of a display run.
 */
export function $ownerOfDestroyedRunPiece(piece: LexicalNode): LexicalNode | undefined {
  const parent = piece.getParent();
  if ($isUnknownNode(parent))
    return parent.getTag() === "optbreak" && $isTextNode(piece) ? parent : undefined;
  if ($isTextNode(piece) && $getState(piece, textTypeState) === "attribute")
    return $isCharNode(parent) ? parent : $runChainOwner(piece);
  if ($isMarkerNode(piece)) {
    const marker = piece.getMarker();
    if (marker === "va" || marker === "vp") return $runChainOwner(piece);
    if (piece.getMarkerSyntax() === "selfClosing") return $runChainOwner(piece);
    const previous = piece.getPreviousSibling();
    if ($isMilestoneNode(previous) && previous.getMarker() === marker) return previous;
  }
  return undefined;
}
