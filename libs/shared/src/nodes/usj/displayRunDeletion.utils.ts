/**
 * Classifies a just-destroyed display-run piece (attribute text or a run glyph) back to the node
 * that owns the run it belonged to. Sibling of attributeDisplay.utils.ts: that module keeps a
 * live run in sync with its owner's state; this one recovers the owner from a piece that no
 * longer has live state to sync from, because it was just removed from the tree.
 */
import { $isAttributeRunNode } from "./AttributeRunNode.js";
import { $isCharNode } from "./CharNode.js";
import { $isMilestoneNode } from "./MilestoneNode.js";
import { $isVerseNode } from "./VerseNode.js";
import { $isImmutableTypedTextNode } from "../features/ImmutableTypedTextNode.js";
import { $isMarkerNode } from "../features/MarkerNode.js";
import { $isUnknownNode } from "../features/UnknownNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $getState, $isTextNode, LexicalNode } from "lexical";

/**
 * Walk back over a chain of run pieces (glyphs, attribute text, and a whole `AttributeRunNode`
 * wrapper crossed in one step) to the `VerseNode` or `MilestoneNode` the chain rides on as
 * following siblings. A wrapper counts as a single run piece here regardless of
 * runKind: a `\vp` wrapper's owner sits BEHIND its own `\va` wrapper (or `\va`'s loose pieces, in
 * a mid-migration tree that has one marker wrapped and the other still loose), so the walk must
 * cross it without stopping. Stops — and returns `undefined` — the moment a sibling is neither the
 * owner nor another run piece/wrapper, since that means `piece` was never actually part of a
 * display run.
 */
function $runChainOwner(piece: LexicalNode): LexicalNode | undefined {
  for (let prev = piece.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isVerseNode(prev) || $isMilestoneNode(prev)) return prev;
    const isRunPiece =
      // Loose-sibling arm — removable once nothing builds loose runs: a bare glyph or
      // attribute-tagged text riding directly as a sibling, rather than inside a wrapper.
      $isMarkerNode(prev) ||
      ($isTextNode(prev) && $getState(prev, textTypeState) === "attribute") ||
      $isAttributeRunNode(prev);
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
 * `optbreak` token — a direct child that is either a plain TextNode or an ImmutableTypedTextNode:
 * the adaptor (usj-editor.adaptor.ts's `createUnknown`) always renders the `//` token as the
 * latter (a read-only, token-mode DecoratorNode, invisible to Lexical's `TextNode` mutation
 * listener), so both node kinds must be recognized or a real deletion would go unclassified.
 * Returns `undefined` for any other destroyed node — ordinary content, not a display-run piece.
 *
 * Two more shapes reach the SAME verse/milestone owner, when a run rides inside an
 * `AttributeRunNode` wrapper rather than as loose siblings —
 * - `piece` IS a destroyed wrapper (the user deleted the whole run at once, or a structural edit
 *   removed it outright): its owner is found by walking back from the WRAPPER's own position.
 * - `piece`'s PREVIOUS-STATE parent is a wrapper (only one piece inside it was destroyed, the
 *   wrapper itself survives): `piece`'s own previous sibling is only meaningful relative to
 *   OTHER pieces inside the wrapper, so the walk starts from the wrapper's position instead.
 * Both delegate to {@link $runChainOwner} — the loose-siblings walk already crosses a whole
 * wrapper in one step, so starting from a wrapper directly is the same walk, one level up.
 *
 * @param piece - The destroyed node, read from `prevEditorState`.
 * @returns The CharNode / VerseNode / MilestoneNode / UnknownNode that owned the run `piece` rode
 *   in, or `undefined` if `piece` was not part of a display run.
 */
export function $ownerOfDestroyedRunPiece(piece: LexicalNode): LexicalNode | undefined {
  if ($isAttributeRunNode(piece)) return $runChainOwner(piece);
  const parent = piece.getParent();
  if ($isAttributeRunNode(parent)) return $runChainOwner(parent);
  if ($isUnknownNode(parent))
    return parent.getTag() === "optbreak" &&
      ($isTextNode(piece) || $isImmutableTypedTextNode(piece))
      ? parent
      : undefined;
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
