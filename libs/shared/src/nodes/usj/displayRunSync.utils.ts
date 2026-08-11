/**
 * The shared display-run drivers: ONE self-healing sync transform and ONE caret-held reporter,
 * both parameterized by a {@link DisplayRunDescriptor}. Every engine-owned display kind runs
 * through these, so the four duties (construct, self-heal-with-grace, pend-on-edit/delete,
 * settle-on-departure) cannot diverge per kind.
 *
 * Descriptor INSTANCES live one layer up (displayRun/displayRunRegistry.ts) because they need the
 * converters; taking a descriptor as a parameter keeps these drivers importable from anywhere in
 * `nodes/usj`.
 */

import { $createAttributeRunNode, AttributeRunNode } from "./AttributeRunNode.js";
import { DisplayRunDescriptor, ExpectedRun, ScannedRun } from "./displayRunDescriptor.js";
import { DELTA_CHANGE_TAG } from "./node-constants.js";
import { $isDescendantOf } from "./node.utils.js";
import {
  $isDisplayOwnerPended,
  $reportDestroyedDisplayOwner,
} from "./pendedDisplayOwners.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import {
  $createTextNode,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $hasUpdateTag,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalNode,
} from "lexical";

/** Whether any piece of the run is currently in the tree. */
function runHasPieces(pieces: ScannedRun): boolean {
  return Boolean(pieces.opener || pieces.value || pieces.closer || pieces.wrapper);
}

/**
 * Whether `pieces` diverge from `expected`.
 *
 * A run that should not exist diverges the moment any piece survives. A run that should exist
 * diverges when its value's bytes differ, when either glyph of a glyph-bearing kind is missing,
 * or — for a wrapper-written kind — when the pieces are still riding LOOSE: the wrap migration is
 * itself a divergence to heal, and treating it as one here is what lets the caret grace it and the
 * settle finish it, instead of the migration being deferred forever with nothing pending it.
 */
export function $runDiverges(
  descriptor: DisplayRunDescriptor,
  pieces: ScannedRun,
  expected: ExpectedRun,
): boolean {
  if (!expected.wantsRun) return runHasPieces(pieces);
  if (pieces.value?.getTextContent() !== expected.valueText) return true;
  if (descriptor.byteFormat.glyphs !== "none" && (!pieces.opener || !pieces.closer)) return true;
  return descriptor.byteFormat.writer === "wrapper" && pieces.wrapper === undefined;
}

/** True when NO piece of `owner`'s run remains — the run was deleted outright, as opposed to a
 * partial mangle that still leaves debris to repair around. */
export function $runEntirelyAbsent(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean {
  const pieces = descriptor.scanPieces(owner);
  return !pieces.opener && !pieces.value && !pieces.closer;
}

/**
 * True when `owner`'s run diverges from what its state calls for but the collapsed caret holds the
 * run's SITE, so the sync must leave it alone and the marker-edit engine settle it on departure.
 *
 * Two arms are shared by every kind: the caret anywhere inside the run's wrapper subtree (an
 * element point can land on the wrapper itself, which no piece-specific arm recognizes), and the
 * caret inside a live value node. Everything else is the descriptor's own `graceSite` — the
 * insertion-point and glyph-debris anchors that differ by tree shape.
 */
export function $caretHoldsRunSite(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean {
  if (!owner.isAttached()) return false;
  const expected = descriptor.expectedPieces(owner);
  const pieces = descriptor.scanPieces(owner);
  if (!$runDiverges(descriptor, pieces, expected)) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  const { wrapper, value } = pieces;
  if (wrapper && (anchorNode.is(wrapper) || $isDescendantOf(anchorNode, wrapper.getKey())))
    return true;
  // A live value node is the mid-edit case: the caret is IN the bytes, so nothing else matters.
  if (value) return anchorNode.is(value);
  return descriptor.graceSite(owner, pieces);
}

/**
 * Whether `owner`'s run was destroyed by something other than this sync since the last committed
 * state. Gated on `wantsRun` so a call can never react to its own heal-removal: the writer below
 * only removes pieces when the run is NOT wanted, the opposite of this condition.
 *
 * Detecting the destruction from the last-committed state, inside the sync's own decision path,
 * keeps the result independent of which plugin's transforms happen to run first on a shared dirty
 * node — mount order varies across hosts. A remote collab apply is excluded: it clears owner state
 * directly, so the run is already unwanted before this sync next runs.
 */
function $runDestroyedSinceLastCommit(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  expected: ExpectedRun,
  pieces: ScannedRun,
): boolean {
  if (!expected.wantsRun) return false;
  if (runHasPieces(pieces)) return false;
  if ($hasUpdateTag(DELTA_CHANGE_TAG)) return false;
  return $getEditor()
    .getEditorState()
    .read(() => {
      const previous = $getNodeByKey(owner.getKey());
      if (!previous || !descriptor.ownerPredicate(previous)) return false;
      return runHasPieces(descriptor.scanPieces(previous));
    });
}

/** Remove every surviving piece — the "no run wanted" path. An emptied wrapper is left in place:
 * it is a transient husk the marker-edit engine's settle removes, so the removal and the owner's
 * own deletion policy stay in one place. */
function $clearRun(pieces: ScannedRun): void {
  pieces.opener?.remove();
  pieces.value?.remove();
  pieces.closer?.remove();
}

function $createValueNode(text: string) {
  const value = $createTextNode(text);
  $setState(value, textTypeState, "attribute");
  return value;
}

/** Ensure the run's wrapper exists, healing any loose survivors forward into a freshly created one
 * inserted where the run belongs. This is the one migration path from loose to wrapped. */
function $ensureWrapper(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  pieces: ScannedRun,
): AttributeRunNode | undefined {
  if (pieces.wrapper) return pieces.wrapper;
  const { runKind, insertRunAfter } = descriptor.byteFormat;
  const anchor = insertRunAfter?.(owner);
  if (!runKind || !anchor) return undefined;
  const created = $createAttributeRunNode(runKind);
  anchor.insertAfter(created);
  if (pieces.opener) created.append(pieces.opener);
  if (pieces.value) created.append(pieces.value);
  if (pieces.closer) created.append(pieces.closer);
  return created;
}

/** Build or repair the run AROUND whatever pieces survive, in their fixed order. A found piece
 * already sits in its correct position (the scan reads them in order), so a missing one is
 * inserted into its gap and a leftover is reused in place, never duplicated. */
function $writeRun(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  pieces: ScannedRun,
  expected: ExpectedRun,
): void {
  const { writer, glyphs, glyphMarker, closerSyntax, insertRunBefore } = descriptor.byteFormat;
  if (writer === "owner-children") {
    const anchor = insertRunBefore?.(owner);
    if (!anchor || expected.valueText === undefined) return;
    if ($isTextNode(pieces.value)) pieces.value.setTextContent(expected.valueText);
    else anchor.insertBefore($createValueNode(expected.valueText));
    return;
  }
  const wrapper = $ensureWrapper(descriptor, owner, pieces);
  if (!wrapper || glyphs === "none" || !glyphMarker || !closerSyntax) return;
  const opener =
    pieces.opener ??
    (() => {
      const created = $createMarkerNode(glyphMarker(owner), "opening");
      const first = wrapper.getFirstChild();
      if (first) first.insertBefore(created);
      else wrapper.append(created);
      return created;
    })();
  let value = pieces.value;
  if (expected.valueText === undefined) {
    value?.remove();
    value = undefined;
  } else if ($isTextNode(value)) {
    if (value.getTextContent() !== expected.valueText) value.setTextContent(expected.valueText);
  } else {
    value = $createValueNode(expected.valueText);
    opener.insertAfter(value);
  }
  if (!pieces.closer)
    (value ?? opener).insertAfter(
      $createMarkerNode(closerSyntax === "selfClosing" ? "" : glyphMarker(owner), closerSyntax),
    );
}

/**
 * Heal `owner`'s display run to what its own state calls for: insert a missing run, rewrite a
 * stale one, migrate a loose one into its wrapper, or remove one that is no longer wanted —
 * except while the engine holds the owner pended, while the run was just destroyed by something
 * else (reported so the engine settles it), or while the caret holds the run's site. Idempotent —
 * writes only on change, so the registering transform converges.
 *
 * Kinds whose pieces the driver does not write (`"kind-owned"` and `"read-only"` byte formats)
 * return immediately: they join the registry for their pend/settle duties only.
 *
 * @param descriptor - The kind's descriptor.
 * @param owner - The owner whose run to sync. Must be called inside `editor.update()`.
 */
export function $syncDisplayRun(descriptor: DisplayRunDescriptor, owner: LexicalNode): void {
  const { writer } = descriptor.byteFormat;
  if (writer === "kind-owned" || writer === "read-only") return;
  // An earlier transform in the same pass may have merged or removed the owner; a detached node
  // has no tree position to derive from.
  if (!owner.isAttached()) return;
  const expected = descriptor.expectedPieces(owner);
  const pieces = descriptor.scanPieces(owner);
  if (!$runDiverges(descriptor, pieces, expected)) return;
  if ($isDisplayOwnerPended(owner)) return;
  if ($runDestroyedSinceLastCommit(descriptor, owner, expected, pieces)) {
    $reportDestroyedDisplayOwner(owner);
    return;
  }
  if ($caretHoldsRunSite(descriptor, owner)) return;
  if (!expected.wantsRun) {
    $clearRun(pieces);
    return;
  }
  $writeRun(descriptor, owner, pieces, expected);
}
