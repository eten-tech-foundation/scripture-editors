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
 * True when `node` is a piece — a run glyph or an attribute value — of a display run whose kind
 * implements an owner walk (currently `va`/`vp`, `milestone`, `char`, and `optbreak`; see each
 * descriptor's `ownerOf` in displayRunRegistry.ts). A kind with no owner walk (`separator`,
 * `opaqueUnknown`, `nestedGlyph` — their `ownerOf` always returns `undefined`) never reports true
 * here, regardless of what `node` is. Engine-owned presentation, never content, for the kinds it
 * does cover: it must not enter OT content ops or the editor→USJ conversion.
 *
 * Keyed on the piece's KIND (via {@link $ownerOfRunPiece}) rather than on tree shape, so both the
 * wrapped shape the adaptor builds and the loose shape a mid-edit commit, an undo stack, or a
 * collab-materialized bare owner can leave behind are recognized by the same rule — WHEN the
 * piece is directly adjacent to (or one wrapper-hop from) its owner, which is what each `ownerOf`
 * walk requires. It is therefore NOT a full ancestor check: a wrapped piece separated from its
 * owner by an intervening node, or nested more than one level below its wrapper, reports false
 * here even though it is still presentation — callers that also need that shape covered pair this
 * with an ancestry check (see `editor-delta.adaptor.ts`'s glyph gate).
 */
export function $isDisplayRunPiece(node: LexicalNode): boolean {
  return $ownerOfRunPiece(node) !== undefined;
}
