/**
 * The ONE walk from a display-run piece back to its owner, for every kind.
 *
 * A piece can be a live node (an edit inside a run dirties the piece or its wrapper, never the
 * leaf owner, whose own transform would then not fire) or a node read from the PREVIOUS editor
 * state (a destroyed piece, which still has its tree position there). The walk is identical in
 * both cases — it reads only tree position — so one function serves the live re-sync path and the
 * destruction-pend path alike.
 *
 * The chain classification is keyed on MARKER IDENTITY, not on "is this a glyph": only pieces of
 * the same kind's run may sit between a piece and its owner. Anything else — a char span's own
 * opener riding beside a verse, a note glyph — ends the walk with no owner, so a deletion in
 * unrelated content can never pend a nearby verse or milestone.
 */

import { displayRunDescriptors } from "./displayRunRegistry.js";
import { DisplayRunOwnerRef } from "../nodes/usj/displayRunDescriptor.js";
import { LexicalNode } from "lexical";

/**
 * The owner whose run `piece` belongs to, and that run's kind — or `undefined` when `piece` is not
 * part of any registered display run. Descriptors are consulted in registry order and the first
 * match wins; each kind's `ownerOf` recognizes only its own pieces, so at most one can match.
 */
export function $ownerOfRunPiece(piece: LexicalNode): DisplayRunOwnerRef | undefined {
  for (const descriptor of displayRunDescriptors) {
    const owner = descriptor.ownerOf(piece);
    if (owner) return { owner, kind: descriptor.kind };
  }
  return undefined;
}

/**
 * True when `node` is a piece of ANY registered display run — a run glyph, an attribute value, or
 * anything riding inside a run wrapper. Engine-owned presentation, never content: it must not
 * enter OT content ops or the editor→USJ conversion.
 *
 * Keyed on the piece's KIND (via {@link $ownerOfRunPiece}) rather than on tree shape, so both the
 * wrapped shape the adaptor builds and the loose shape a mid-edit commit, an undo stack, or a
 * collab-materialized bare owner can leave behind are excluded by the same rule. A shape-only
 * check has to be re-broadened by hand each time a new shape becomes reachable.
 */
export function $isDisplayRunPiece(node: LexicalNode): boolean {
  return $ownerOfRunPiece(node) !== undefined;
}
