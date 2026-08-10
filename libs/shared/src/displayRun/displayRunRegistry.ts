/**
 * The display-run registry: one {@link DisplayRunDescriptor} per engine-owned display kind.
 *
 * Assembled HERE rather than in `nodes/usj` because a descriptor's byte derivation needs the
 * converters (`defaultMarkerAttribute`, `milestoneDefaultAttribute`) and `nodes/usj` must not
 * import from `converters/usfm`, which already imports FROM `nodes/usj`. This module sits above
 * both, so it can hold the assembly without a cycle — the same layering `plugins/PerfOperations`
 * uses. The drivers that CONSUME descriptors take one as a parameter and stay in `nodes/usj`.
 */

import {
  $charAttributeDisplayNode,
  $charClosingGlyph,
  $milestoneAttributeRunPieces,
  $verseAttributeRunPieces,
  canonicalAttributeText,
  milestoneAttributes,
  VerseAttributeMarker,
} from "../nodes/usj/attributeDisplay.utils.js";
import { $isCharNode } from "../nodes/usj/CharNode.js";
import {
  DisplayRunDescriptor,
  DisplayRunKind,
  ExpectedRun,
  ScannedRun,
} from "../nodes/usj/displayRunDescriptor.js";
import { $isMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { $isVerseNode } from "../nodes/usj/VerseNode.js";
import {
  defaultMarkerAttribute,
  milestoneDefaultAttribute,
} from "../converters/usfm/usfmFragmentToUsj.js";
import { $getSelection, $isRangeSelection, LexicalNode } from "lexical";

/** No run wanted and no value — the answer for an owner whose state carries nothing to display,
 * and the safe answer when a descriptor is handed a node of the wrong type. */
const NO_RUN: ExpectedRun = { wantsRun: false, valueText: undefined };

/** No pieces found — the answer when a descriptor is handed a node of the wrong type. */
const NO_PIECES: ScannedRun = {};

/** The sibling a verse's run for `marker` is anchored after: the verse itself for `\va`, and
 * `\va`'s wrapper (or, while caret-grace defers the wrap, its loose closer) for `\vp`. Shared by
 * the scanner and the writer so the two can never disagree about where a run belongs. */
function $verseRunAnchor(verse: LexicalNode, marker: VerseAttributeMarker): LexicalNode {
  if (marker === "va") return verse;
  const va = $verseAttributeRunPieces(verse, "va");
  return va.wrapper ?? va.closer ?? verse;
}

/** The caret arm a verse run graces when NO piece survives: the run's insertion point is the end
 * of its anchor or the very start of the anchor's next sibling, where a range deletion collapses
 * the caret. The shared reporter already graces the wrapper's subtree and the live value node. */
function $verseFlankGrace(anchor: LexicalNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (anchorNode.is(anchor) && selection.anchor.offset === anchor.getTextContentSize()) return true;
  const next = anchor.getNextSibling();
  return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
}

/** The caret arm shared by verse and milestone runs when only the VALUE was deleted beside a
 * surviving opening glyph: the end of the opening glyph's own text, or the trailing glyph. */
function $glyphDebrisGrace(pieces: ScannedRun): boolean {
  const { opener, closer } = pieces;
  if (!opener) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  const atOpenerEnd =
    anchorNode.is(opener) && selection.anchor.offset === opener.getTextContentSize();
  if (closer) return atOpenerEnd || anchorNode.is(closer);
  return atOpenerEnd;
}

function verseDescriptor(marker: VerseAttributeMarker): DisplayRunDescriptor {
  return {
    kind: marker,
    ownerPredicate: (node) => $isVerseNode(node),
    // Filled in by the owner-walk task; a piece's owner is not derivable from the piece alone
    // until the tightened sibling walk lands.
    ownerOf: () => undefined,
    expectedPieces: (owner) => {
      if (!$isVerseNode(owner)) return NO_RUN;
      const value = marker === "va" ? owner.getAltnumber() : owner.getPubnumber();
      if (value === undefined) return NO_RUN;
      return { wantsRun: true, valueText: NBSP + value };
    },
    scanPieces: (owner) =>
      $isVerseNode(owner)
        ? $verseAttributeRunPieces($verseRunAnchor(owner, marker), marker)
        : NO_PIECES,
    graceSite: (owner, pieces) => {
      if (!$isVerseNode(owner)) return false;
      if (!pieces.opener && !pieces.closer) return $verseFlankGrace($verseRunAnchor(owner, marker));
      return $glyphDebrisGrace(pieces);
    },
    settleScope: "owner",
    deletionPolicy: "retokenize",
    byteFormat: {
      writer: "wrapper",
      runKind: marker,
      glyphs: "with-value",
      glyphMarker: () => marker,
      closerSyntax: "closing",
      insertRunAfter: (owner) => ($isVerseNode(owner) ? $verseRunAnchor(owner, marker) : undefined),
    },
  };
}

const charDescriptor: DisplayRunDescriptor = {
  kind: "char",
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: (owner) => {
    if (!$isCharNode(owner)) return NO_RUN;
    // A span with no closing glyph never carries a run regardless of its attributes: the adaptor
    // never builds one there, so the sync must not fabricate one either.
    if ($charClosingGlyph(owner) === undefined) return NO_RUN;
    const text = canonicalAttributeText(
      owner.getUnknownAttributes() ?? {},
      defaultMarkerAttribute(owner.getMarker()),
    );
    return text === "" ? NO_RUN : { wantsRun: true, valueText: text };
  },
  scanPieces: (owner) =>
    $isCharNode(owner) ? { value: $charAttributeDisplayNode(owner) } : NO_PIECES,
  graceSite: (owner, pieces) => {
    // The insertion-point arms for a run that is missing: the closing glyph the run would be
    // inserted before, or the text-end of the content immediately preceding that glyph.
    if (!$isCharNode(owner) || pieces.value) return false;
    const closingGlyph = $charClosingGlyph(owner);
    if (!closingGlyph) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const anchorNode = selection.anchor.getNode();
    if (anchorNode.is(closingGlyph)) return true;
    const lastContent = closingGlyph.getPreviousSibling();
    return (
      lastContent !== null &&
      anchorNode.is(lastContent) &&
      selection.anchor.offset === lastContent.getTextContentSize()
    );
  },
  settleScope: "owner",
  deletionPolicy: "retokenize",
  byteFormat: {
    writer: "owner-children",
    glyphs: "none",
    insertRunBefore: (owner) => ($isCharNode(owner) ? $charClosingGlyph(owner) : undefined),
  },
};

const milestoneDescriptor: DisplayRunDescriptor = {
  kind: "milestone",
  ownerPredicate: (node) => $isMilestoneNode(node),
  ownerOf: () => undefined,
  expectedPieces: (owner) => {
    if (!$isMilestoneNode(owner)) return NO_RUN;
    const attributes = milestoneAttributes(
      owner.getSid(),
      owner.getEid(),
      owner.getUnknownAttributes(),
    );
    const text = canonicalAttributeText(attributes, milestoneDefaultAttribute(owner.getMarker()));
    // The glyph pair is unconditional: a milestone always displays `\qt-s …\*`, so the run is
    // wanted even when no attribute text rides between the glyphs.
    return { wantsRun: true, valueText: text === "" ? undefined : NBSP + text };
  },
  scanPieces: (owner) => {
    if (!$isMilestoneNode(owner)) return NO_PIECES;
    // $milestoneAttributeRunPieces names its fields opening/attribute/closing (its own long-lived
    // vocabulary, shared with the Tier-2 rebuild); ScannedRun's fields are opener/value/closer —
    // the descriptor registry's cross-kind vocabulary. Translate rather than rename either side.
    const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(owner);
    return { opener: opening, value: attribute, closer: closing, wrapper };
  },
  graceSite: (owner, pieces) => {
    if (!$isMilestoneNode(owner)) return false;
    if (!pieces.opener && !pieces.closer) {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const anchorNode = selection.anchor.getNode();
      const previous = owner.getPreviousSibling();
      if (
        previous !== null &&
        anchorNode.is(previous) &&
        selection.anchor.offset === previous.getTextContentSize()
      )
        return true;
      const next = owner.getNextSibling();
      return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
    }
    return $glyphDebrisGrace(pieces);
  },
  settleScope: "owner",
  deletionPolicy: "remove-owner",
  byteFormat: {
    writer: "wrapper",
    runKind: "milestone",
    glyphs: "unconditional",
    glyphMarker: (owner) => ($isMilestoneNode(owner) ? owner.getMarker() : ""),
    closerSyntax: "selfClosing",
    insertRunAfter: (owner) => owner,
  },
};

/** Every registered kind, in the order the pend/settle driver consults them. A `CharNode` matches
 * more than one descriptor (its separator gap and its attribute run), and the separator's grace
 * is checked first, preserving the order the per-kind arms ran in. */
export const displayRunDescriptors: readonly DisplayRunDescriptor[] = [
  charDescriptor,
  verseDescriptor("va"),
  verseDescriptor("vp"),
  milestoneDescriptor,
];

const byKind = new Map<DisplayRunKind, DisplayRunDescriptor>(
  displayRunDescriptors.map((descriptor) => [descriptor.kind, descriptor]),
);

/** The descriptor for `kind`. Throws for an unregistered kind — a kind is only nameable once its
 * descriptor exists, so a miss is a wiring bug, never a runtime condition to handle. */
export function displayRunDescriptor(kind: DisplayRunKind): DisplayRunDescriptor {
  const descriptor = byKind.get(kind);
  if (!descriptor) throw new Error(`No display-run descriptor registered for kind "${kind}"`);
  return descriptor;
}
