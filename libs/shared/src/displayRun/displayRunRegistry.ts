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
  $chapterAltnumberRunPieces,
  $chapterCpAnchor,
  $chapterGlyphTextNode,
  $chapterPubnumberRunPieces,
  $charAttributeDisplayNode,
  $charClosingGlyph,
  $milestoneAttributeRunPieces,
  $noteCategoryRunPieces,
  $noteEditableCallerNode,
  $verseAttributeRunPieces,
  canonicalAttributeText,
  milestoneAttributes,
  VerseAttributeMarker,
} from "../nodes/usj/attributeDisplay.utils.js";
import { $isAttributeRunNode } from "../nodes/usj/AttributeRunNode.js";
import { $isChapterNode } from "../nodes/usj/ChapterNode.js";
import { $isCharNode } from "../nodes/usj/CharNode.js";
import { $isNoteNode } from "../nodes/usj/NoteNode.js";
import {
  DisplayRunDescriptor,
  DisplayRunKind,
  ExpectedRun,
  ScannedRun,
} from "../nodes/usj/displayRunDescriptor.js";
import { $hasCaretHeldSeparatorGap } from "../nodes/usj/markerSeparators.utils.js";
import { $isMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { $isVerseNode } from "../nodes/usj/VerseNode.js";
import { textTypeState } from "../nodes/collab/delta.state.js";
import { $isImmutableTypedTextNode } from "../nodes/features/ImmutableTypedTextNode.js";
import { $isMarkerNode } from "../nodes/features/MarkerNode.js";
import { $isUnknownNode } from "../nodes/features/UnknownNode.js";
import { unknownDisplayParts } from "../nodes/features/unknownUsfm.utils.js";
import {
  defaultMarkerAttribute,
  milestoneDefaultAttribute,
} from "../converters/usfm/usfmFragmentToUsj.js";
import {
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
} from "lexical";

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

/** The caret arm a run graces when NO piece survives: the run's insertion point is the end of
 * its anchor or the very start of the anchor's next sibling, where a range deletion collapses
 * the caret. An ELEMENT anchor (a chapter `\cp` run's anchor is the `\ca` run's WRAPPER) has no
 * text end of its own — the collapse point is the end of its last descendant text piece (the
 * `\ca` closer glyph), so that arm is checked too. The shared reporter already graces the
 * wrapper's subtree and the live value node. */
function $verseFlankGrace(anchor: LexicalNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (anchorNode.is(anchor) && selection.anchor.offset === anchor.getTextContentSize()) return true;
  if ($isElementNode(anchor)) {
    const last = anchor.getLastDescendant();
    if (
      last !== null &&
      anchorNode.is(last) &&
      selection.anchor.offset === last.getTextContentSize()
    )
      return true;
  }
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

/** The `va`/`vp` marker a loose piece belongs to: its own marker for a glyph, and for a value the
 * marker of the glyph immediately before it — the run pieces' fixed order puts a value's own opener
 * exactly one step back, even in the previous state where that opener is also being destroyed.
 *
 * The value arm requires the candidate to BE a run piece (an attribute-tagged TextNode), not merely
 * to sit behind one, mirroring the milestone side's `$isMilestoneRunPiece` rule. Position alone is
 * not enough: the ordinary verse text that follows a settled `\va …\va*` run also has that run's
 * closing glyph as its previous sibling, and claiming it would pend the verse — and run a settle
 * plus a whole-paragraph rebuild — for a deletion in unrelated content. */
function $loosePieceMarker(node: LexicalNode): VerseAttributeMarker | undefined {
  if ($isMarkerNode(node)) {
    const marker = node.getMarker();
    return marker === "va" || marker === "vp" ? marker : undefined;
  }
  if (!$isTextNode(node) || $getState(node, textTypeState) !== "attribute") return undefined;
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
      return $loosePieceMarker(node) === marker ? $verseOfRunChain(node) : undefined;
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

const separatorDescriptor: DisplayRunDescriptor = {
  kind: "separator",
  // The NBSP a char span shows after its opening glyph. Its "deletion" is a TEXT mutation (an NBSP
  // prefix edit), not node destruction, so it has no owner walk and no destruction pend — its
  // caret-grace path is what settles it, exactly as before joining the registry.
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: (owner) => $isCharNode(owner) && $hasCaretHeldSeparatorGap(owner),
  settleScope: "owner",
  deletionPolicy: "retokenize",
  byteFormat: { writer: "kind-owned", glyphs: "none" },
};

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

/** Whether `node` is a loose piece of a note's `\cat` run — a `cat` glyph, or an attribute-tagged
 * value whose own opener (one step back, the run pieces' fixed order) is a `cat` glyph. The value
 * arm requires the candidate to BE a run piece, mirroring `$loosePieceMarker`'s rule for verses:
 * position alone must not claim ordinary note content that happens to follow a settled run. */
function $isLooseCatPiece(node: LexicalNode): boolean {
  if ($isMarkerNode(node)) return node.getMarker() === "cat";
  if (!$isTextNode(node) || $getState(node, textTypeState) !== "attribute") return false;
  const previous = node.getPreviousSibling();
  return $isMarkerNode(previous) && previous.getMarker() === "cat";
}

/** Walk back from `start` over the cat run's own pieces to the editable caller anchor, and from
 * there to the NoteNode the run rides in. A piece's parent must BE the note (loose pieces are the
 * note's direct children); crossing anything that is not a cat piece ends the walk with no owner. */
function $noteOfCatChain(start: LexicalNode): LexicalNode | undefined {
  const parent = start.getParent();
  if (!$isNoteNode(parent)) return undefined;
  const anchor = $noteEditableCallerNode(parent);
  if (!anchor) return undefined;
  for (
    let previous = start.getPreviousSibling();
    previous;
    previous = previous.getPreviousSibling()
  ) {
    if (previous.is(anchor)) return parent;
    if (!$isLooseCatPiece(previous)) return undefined;
  }
  return undefined;
}

const catDescriptor: DisplayRunDescriptor = {
  kind: "cat",
  ownerPredicate: (node) => $isNoteNode(node),
  ownerOf: (node) => {
    // A note's run rides as its CHILDREN (a NoteNode is an ElementNode), so the wrapper's parent
    // IS the owner — no sibling chain to walk for the wrapped shape. Loose pieces walk back to
    // the caller anchor exactly like a verse's loose pieces walk back to their verse.
    if ($isAttributeRunNode(node))
      return node.getRunKind() === "cat" && $isNoteNode(node.getParent())
        ? (node.getParent() ?? undefined)
        : undefined;
    const parent = node.getParent();
    if ($isAttributeRunNode(parent))
      return parent.getRunKind() === "cat" && $isNoteNode(parent.getParent())
        ? (parent.getParent() ?? undefined)
        : undefined;
    return $isLooseCatPiece(node) ? $noteOfCatChain(node) : undefined;
  },
  expectedPieces: (owner) => {
    if (!$isNoteNode(owner)) return NO_RUN;
    // Collapsed notes deliberately do not display the category (their content is not inline
    // display text at all), and only the expanded editable shape carries the caller anchor the
    // run is positioned by.
    if (owner.getIsCollapsed() !== false) return NO_RUN;
    const category = owner.getCategory();
    if (category === undefined) return NO_RUN;
    return { wantsRun: true, valueText: NBSP + category };
  },
  scanPieces: (owner) => ($isNoteNode(owner) ? $noteCategoryRunPieces(owner) : NO_PIECES),
  graceSite: (owner, pieces) => {
    if (!$isNoteNode(owner)) return false;
    if (!pieces.opener && !pieces.closer) {
      const anchor = $noteEditableCallerNode(owner);
      return anchor !== undefined && $verseFlankGrace(anchor);
    }
    return $glyphDebrisGrace(pieces);
  },
  settleScope: "owner",
  deletionPolicy: "retokenize",
  byteFormat: {
    writer: "wrapper",
    runKind: "cat",
    glyphs: "with-value",
    glyphMarker: () => "cat",
    closerSyntax: "closing",
    insertRunAfter: (owner) => ($isNoteNode(owner) ? $noteEditableCallerNode(owner) : undefined),
  },
};

/** Whether `node` is a piece of a chapter's `\ca`/`\cp` runs — a whole wrapper of either kind
 * (crossed in one step, so a loose `\cp` piece's walk passes the `\ca` wrapper), a `ca`/`cp`
 * glyph riding loose, or a loose attribute-tagged value — the chapter twin of
 * `$isVerseRunPiece`. */
function $isChapterRunPiece(node: LexicalNode): boolean {
  if ($isAttributeRunNode(node)) return node.getRunKind() === "ca" || node.getRunKind() === "cp";
  if ($isMarkerNode(node)) return node.getMarker() === "ca" || node.getMarker() === "cp";
  return $isTextNode(node) && $getState(node, textTypeState) === "attribute";
}

/** The `ca`/`cp` marker a loose chapter piece belongs to — the chapter twin of
 * `$loosePieceMarker`, with the same value-arm rule (the candidate must BE a run piece whose own
 * opener sits one step back; position alone must not claim unrelated content). */
function $chapterLoosePieceMarker(node: LexicalNode): "ca" | "cp" | undefined {
  if ($isMarkerNode(node)) {
    const marker = node.getMarker();
    return marker === "ca" || marker === "cp" ? marker : undefined;
  }
  if (!$isTextNode(node) || $getState(node, textTypeState) !== "attribute") return undefined;
  const previous = node.getPreviousSibling();
  if (!$isMarkerNode(previous)) return undefined;
  const marker = previous.getMarker();
  return marker === "ca" || marker === "cp" ? marker : undefined;
}

/** Walk back from `start` over the chapter runs' own pieces (of EITHER kind — a `\cp` piece's
 * walk crosses the whole `\ca` wrapper in one step) to the chapter's `\c N` glyph anchor, and
 * from there to the ChapterNode the runs ride in — the chapter twin of `$verseOfRunChain`. */
function $chapterOfRunChain(start: LexicalNode): LexicalNode | undefined {
  const parent = start.getParent();
  if (!$isChapterNode(parent)) return undefined;
  const anchor = $chapterGlyphTextNode(parent);
  if (!anchor) return undefined;
  for (
    let previous = start.getPreviousSibling();
    previous;
    previous = previous.getPreviousSibling()
  ) {
    if (previous.is(anchor)) return parent;
    if (!$isChapterRunPiece(previous)) return undefined;
  }
  return undefined;
}

/** One chapter attribute-marker descriptor — `"ca"` (altnumber; opener + value + closer) or
 * `"cp"` (pubnumber; opener + value, NO closer: the span closes implicitly at the next block
 * boundary in the file, so its wrapper alone bounds the value). The runs ride as the editable
 * chapter's CHILDREN in document order — glyph text, then `\ca`'s wrapper, then `\cp`'s — the
 * same-line byte position the chapter fragment re-tokenizes and ParatextData's own chapter-path
 * folding accepts. */
function chapterDescriptor(marker: "ca" | "cp"): DisplayRunDescriptor {
  const $anchor = (chapter: LexicalNode) =>
    !$isChapterNode(chapter)
      ? undefined
      : marker === "ca"
        ? $chapterGlyphTextNode(chapter)
        : $chapterCpAnchor(chapter);
  return {
    kind: marker,
    ownerPredicate: (node) => $isChapterNode(node),
    ownerOf: (node) => {
      if ($isAttributeRunNode(node))
        return node.getRunKind() === marker && $isChapterNode(node.getParent())
          ? (node.getParent() ?? undefined)
          : undefined;
      const parent = node.getParent();
      if ($isAttributeRunNode(parent))
        return parent.getRunKind() === marker && $isChapterNode(parent.getParent())
          ? (parent.getParent() ?? undefined)
          : undefined;
      return $chapterLoosePieceMarker(node) === marker ? $chapterOfRunChain(node) : undefined;
    },
    expectedPieces: (owner) => {
      if (!$isChapterNode(owner)) return NO_RUN;
      const value = marker === "ca" ? owner.getAltnumber() : owner.getPubnumber();
      if (value === undefined) return NO_RUN;
      return { wantsRun: true, valueText: NBSP + value };
    },
    scanPieces: (owner) =>
      !$isChapterNode(owner)
        ? NO_PIECES
        : marker === "ca"
          ? $chapterAltnumberRunPieces(owner)
          : $chapterPubnumberRunPieces(owner),
    graceSite: (owner, pieces) => {
      if (!$isChapterNode(owner)) return false;
      if (!pieces.opener && !pieces.closer) {
        const anchor = $anchor(owner);
        return anchor !== undefined && $verseFlankGrace(anchor);
      }
      return $glyphDebrisGrace(pieces);
    },
    settleScope: "owner",
    deletionPolicy: "retokenize",
    byteFormat: {
      writer: "wrapper",
      runKind: marker,
      glyphs: "with-value",
      glyphMarker: () => marker,
      closerSyntax: marker === "ca" ? "closing" : "none",
      insertRunAfter: $anchor,
    },
  };
}

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

/** The optbreak's entire byte representation — the literal `//` token — derived from the ONE
 * renderer of unknown-kind bytes so the registry can never drift from what is actually drawn. */
const optbreakDisplayText = unknownDisplayParts("optbreak", undefined, undefined).opening;

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
  // `valueText` is the RENDERED BYTES the kind owes — so `$runDiverges`'s value-byte comparison
  // classifies the scanned token by what it actually spells: a canonical `//` is at rest, a
  // byte-damaged or deleted token diverges. With `valueText: undefined` (the pre-audit shape)
  // both answers were backwards: a canonical token's text never equalled `undefined`, so a
  // CANONICAL optbreak read as diverged while a GUTTED one read as at rest. Nothing ever WRITES
  // from this (the `"read-only"` writer returns before any sync write), so the value is purely
  // classificatory.
  expectedPieces: () => ({ wantsRun: true, valueText: optbreakDisplayText }),
  scanPieces: (owner) =>
    $isUnknownNode(owner) ? { value: owner.getFirstChild() ?? undefined } : NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "remove-owner",
  byteFormat: { writer: "read-only", glyphs: "none" },
};

const opaqueUnknownDescriptor: DisplayRunDescriptor = {
  kind: "opaqueUnknown",
  // Scope is every UnknownNode kind EXCEPT optbreak — `ownerPredicate` excludes it explicitly, so
  // `optbreakDescriptor` above is the sole owner of that kind. A non-optbreak UnknownNode is a
  // permanent Tier-2 sentinel whose bytes are read-only rendering, never re-tokenized: it owns no
  // display run, but is recognized so the settle reports it handled and the caller never routes one
  // through a rebuild that would bail. (A pended optbreak that does NOT match `optbreakDescriptor`'s
  // `remove-owner` shape — i.e. isn't entirely absent — falls through unhandled by either
  // descriptor instead; harmlessly inert, since `$settleScopeForNode` refuses every `UnknownNode`
  // outright, so the caller's `$requestTier2ForNode` fallback always bails on it too.)
  ownerPredicate: (node) => $isUnknownNode(node) && node.getTag() !== "optbreak",
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "none",
  byteFormat: { writer: "read-only", glyphs: "none" },
};

const nestedGlyphDescriptor: DisplayRunDescriptor = {
  kind: "nestedGlyph",
  // The `+` on a nested span's glyphs. Purely tree-derived and rewritten in place by its own sync;
  // there is no state a user edit can leave half-finished, so it owes no pend or deletion duty.
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: () => false,
  settleScope: "none",
  deletionPolicy: "none",
  byteFormat: { writer: "kind-owned", glyphs: "none" },
};

/** Every registered kind, in the order the pend/settle driver consults them. THREE descriptors
 * declare `ownerPredicate: $isCharNode` — `separator` (the NBSP gap after an opening glyph), `char`
 * (the span's own `|…` attribute run), and `nestedGlyph` (the `+` on a nested span's glyphs) — so a
 * `CharNode` matches all three. `separator` is listed before `char`, so its grace is checked first,
 * preserving the order the per-kind arms ran in. `cat`, `ca`, and `cp` are listed before `milestone` so their
 * loose glyphs are claimed by their own descriptors first — the milestone loose-piece test
 * accepts ANY opening glyph and only rejects it deeper in its chain walk. `nestedGlyph` never acts in the
 * settle loops at all: its `settleScope` is `"none"`, so those loops skip it outright — its `+` is
 * purely tree-derived and rewritten in place by its own sync, with no state a user edit can leave
 * half-finished. */
export const displayRunDescriptors: readonly DisplayRunDescriptor[] = [
  separatorDescriptor,
  charDescriptor,
  verseDescriptor("va"),
  verseDescriptor("vp"),
  catDescriptor,
  chapterDescriptor("ca"),
  chapterDescriptor("cp"),
  milestoneDescriptor,
  optbreakDescriptor,
  opaqueUnknownDescriptor,
  nestedGlyphDescriptor,
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
