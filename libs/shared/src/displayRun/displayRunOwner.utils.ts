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
