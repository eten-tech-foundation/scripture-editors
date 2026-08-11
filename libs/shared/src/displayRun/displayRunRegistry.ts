/**
 * The display-run registry: one {@link DisplayRunDescriptor} per engine-owned display kind.
 *
 * Assembled HERE rather than in `nodes/usj` because a descriptor's byte derivation needs the
 * converters (`defaultMarkerAttribute`, `milestoneDefaultAttribute`) and `nodes/usj` must not
 * import from `converters/usfm`, which already imports FROM `nodes/usj`. This module sits above
 * both, so it can hold the assembly without a cycle — the same layering `plugins/PerfOperations`
 * uses. The drivers that CONSUME descriptors take one as a parameter and stay in `nodes/usj`.
 *
 * Each descriptor's `ownerOf` implements the ONE owner walk for its kind, keyed on marker
 * identity: only pieces of that same kind's run may sit between a candidate piece and its owner,
 * so a foreign glyph or unrelated content ends the walk with no owner. `$ownerOfRunPiece`
 * (displayRunOwner.utils.ts) is the single classifier that consults every descriptor in order.
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
import { $isAttributeRunNode } from "../nodes/usj/AttributeRunNode.js";
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
import { textTypeState } from "../nodes/collab/delta.state.js";
import { $isImmutableTypedTextNode } from "../nodes/features/ImmutableTypedTextNode.js";
import { $isMarkerNode } from "../nodes/features/MarkerNode.js";
import { $isUnknownNode } from "../nodes/features/UnknownNode.js";
import {
  defaultMarkerAttribute,
  milestoneDefaultAttribute,
} from "../converters/usfm/usfmFragmentToUsj.js";
import { $getSelection, $getState, $isRangeSelection, $isTextNode, LexicalNode } from "lexical";

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

/** Whether `node` is a piece of a verse's `\va`/`\vp` run — a whole wrapper (crossed in one step,
 * so a `\vp` piece's walk passes its own `\va` wrapper), a `va`/`vp` glyph riding loose, or a
 * loose attribute-tagged value. Loose shapes are transient (an undo stack, a collab-materialized
 * bare verse, a mid-edit tree with one marker wrapped and the other not) but real for a commit. */
function $isVerseRunPiece(node: LexicalNode): boolean {
  if ($isAttributeRunNode(node)) return node.getRunKind() === "va" || node.getRunKind() === "vp";
  if ($isMarkerNode(node)) return node.getMarker() === "va" || node.getMarker() === "vp";
  return $isTextNode(node) && $getState(node, textTypeState) === "attribute";
}

/** The `va`/`vp` marker a loose value belongs to, read from the glyph immediately before it — the
 * run pieces' fixed order puts a value's own opener exactly one step back, even in the previous
 * state where that opener is also being destroyed. */
function loosePieceMarker(node: LexicalNode): VerseAttributeMarker | undefined {
  if ($isMarkerNode(node)) {
    const marker = node.getMarker();
    return marker === "va" || marker === "vp" ? marker : undefined;
  }
  const previous = node.getPreviousSibling();
  if (!$isMarkerNode(previous)) return undefined;
  const marker = previous.getMarker();
  return marker === "va" || marker === "vp" ? marker : undefined;
}

/** Walk back from `start` over `marker`'s own run pieces to the VerseNode the run rides on. */
function $verseOfRunChain(start: LexicalNode): LexicalNode | undefined {
  for (
    let previous = start.getPreviousSibling();
    previous;
    previous = previous.getPreviousSibling()
  ) {
    if ($isVerseNode(previous)) return previous;
    if (!$isVerseRunPiece(previous)) return undefined;
  }
  return undefined;
}

function verseDescriptor(marker: VerseAttributeMarker): DisplayRunDescriptor {
  return {
    kind: marker,
    ownerPredicate: (node) => $isVerseNode(node),
    ownerOf: (node) => {
      // A wrapper of this marker is its own walk start; a piece INSIDE one is only positioned
      // relative to its siblings within the wrapper, so the walk starts from the wrapper instead.
      if ($isAttributeRunNode(node))
        return node.getRunKind() === marker ? $verseOfRunChain(node) : undefined;
      const parent = node.getParent();
      if ($isAttributeRunNode(parent))
        return parent.getRunKind() === marker ? $verseOfRunChain(parent) : undefined;
      return loosePieceMarker(node) === marker ? $verseOfRunChain(node) : undefined;
    },
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
  ownerOf: (node) => {
    // A char span's run is a direct TextNode child, never wrapped and never a glyph.
    if (!$isTextNode(node) || $getState(node, textTypeState) !== "attribute") return undefined;
    const parent = node.getParent();
    return $isCharNode(parent) ? parent : undefined;
  },
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

/** Whether `node` is a loose piece of a milestone's run — an opening glyph, a self-closing glyph,
 * or an attribute-tagged value. A milestone's opening glyph carries the milestone's OWN marker,
 * which the chain walk re-checks against the candidate owner. */
function $isMilestoneRunPiece(node: LexicalNode): boolean {
  if ($isMarkerNode(node)) {
    const syntax = node.getMarkerSyntax();
    return syntax === "selfClosing" || syntax === "opening";
  }
  return $isTextNode(node) && $getState(node, textTypeState) === "attribute";
}

/** Walk back from a LOOSE milestone run piece over the run's other loose pieces to the milestone,
 * requiring a matching marker on any opening glyph crossed. */
function $milestoneOfLooseChain(start: LexicalNode): LexicalNode | undefined {
  for (
    let previous = start.getPreviousSibling();
    previous;
    previous = previous.getPreviousSibling()
  ) {
    if ($isMilestoneNode(previous)) {
      const opening =
        $isMarkerNode(start) && start.getMarkerSyntax() === "opening" ? start : undefined;
      return !opening || opening.getMarker() === previous.getMarker() ? previous : undefined;
    }
    if (!$isMilestoneRunPiece(previous)) return undefined;
  }
  return undefined;
}

const milestoneDescriptor: DisplayRunDescriptor = {
  kind: "milestone",
  ownerPredicate: (node) => $isMilestoneNode(node),
  ownerOf: (node) => {
    const start = $isAttributeRunNode(node)
      ? node.getRunKind() === "milestone"
        ? node
        : undefined
      : $isAttributeRunNode(node.getParent())
        ? node.getParent()
        : $isMilestoneRunPiece(node)
          ? node
          : undefined;
    if (!start) return undefined;
    if ($isAttributeRunNode(start) && start.getRunKind() !== "milestone") return undefined;
    const previous = start.getPreviousSibling();
    // A milestone's run is a SINGLE wrapper (or one contiguous loose group) directly following its
    // milestone — there is no second marker to cross, unlike a verse's `\va`/`\vp` pair. A WRAPPER
    // requires direct adjacency to the milestone (the builder always creates/heals it immediately
    // after — never behind intervening debris), so it gets no chain walk of its own; a LOOSE piece
    // delegates entirely to $milestoneOfLooseChain, which both walks the chain AND re-checks marker
    // identity against any opening glyph it crosses — the check the retired sibling walk lacked, so
    // a foreign opening glyph (any marker) adjacent to a milestone must not classify it as owner.
    if ($isAttributeRunNode(start)) return $isMilestoneNode(previous) ? previous : undefined;
    return $milestoneOfLooseChain(start);
  },
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
    //
    // This translation is NOT enforced by the compiler: MilestoneRunPieces's fields
    // (opening/attribute/closing/wrapper) and ScannedRun's fields (opener/value/closer/wrapper)
    // are ALL optional on both sides, so returning $milestoneAttributeRunPieces(owner) directly —
    // the untranslated shape — type-checks with zero errors (verified directly: `tsc --build`
    // reports nothing). Excess-property checking only fires on fresh object literals, not on a
    // value flowing through a function call, and an all-optional target type has no required
    // field whose absence would fail assignability either. The wrong shape compiles clean and
    // then reads as permanently empty at runtime (opener/value/closer come back undefined
    // forever) — displayRunRegistry.test.ts's scanPieces suite is what actually catches this.
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

const optbreakDescriptor: DisplayRunDescriptor = {
  kind: "optbreak",
  ownerPredicate: (node) => $isUnknownNode(node) && node.getTag() === "optbreak",
  ownerOf: (node) => {
    // The adaptor renders the `//` token as an ImmutableTypedTextNode (a read-only DecoratorNode),
    // but an edited optbreak can hold a plain TextNode instead, so both are recognized.
    const parent = node.getParent();
    if (!$isUnknownNode(parent) || parent.getTag() !== "optbreak") return undefined;
    return $isTextNode(node) || $isImmutableTypedTextNode(node) ? parent : undefined;
  },
  expectedPieces: () => ({ wantsRun: true, valueText: undefined }),
  scanPieces: (owner) =>
    $isUnknownNode(owner) ? { value: owner.getFirstChild() ?? undefined } : NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "remove-owner",
  byteFormat: { writer: "read-only", glyphs: "none" },
};

const opaqueUnknownDescriptor: DisplayRunDescriptor = {
  kind: "opaqueUnknown",
  // Every UnknownNode kind other than an optbreak is a permanent Tier-2 sentinel whose bytes are
  // read-only rendering, never re-tokenized. It owns no display run, but is recognized so the
  // settle reports it handled and the caller never routes one through a rebuild that would bail.
  ownerPredicate: (node) => $isUnknownNode(node) && node.getTag() !== "optbreak",
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "none",
  byteFormat: { writer: "read-only", glyphs: "none" },
};

/** Every registered kind, in the order the pend/settle driver consults them. A `CharNode` matches
 * more than one descriptor (its separator gap and its attribute run), and the separator's grace
 * is checked first, preserving the order the per-kind arms ran in. */
export const displayRunDescriptors: readonly DisplayRunDescriptor[] = [
  charDescriptor,
  verseDescriptor("va"),
  verseDescriptor("vp"),
  milestoneDescriptor,
  optbreakDescriptor,
  opaqueUnknownDescriptor,
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
