/**
 * Attribute display runs: the single place that owns HOW a node's USFM attribute bytes
 * (`|lemma="grace" strong="G5485"`, `|gloss`) are rendered as engine-owned display text and kept
 * in sync. Sibling of nestedGlyphs.utils.ts (glyph `+`) and markerSeparators.utils.ts (opener
 * separators), following the same owning-module shape.
 *
 * ## The representations (who owns what)
 *
 * - **Node state is the truth.** Char-span attributes live in `CharNode.__unknownAttributes`;
 *   milestone attributes in `MilestoneNode` props + `__unknownAttributes`; a verse's `\va`/`\vp`
 *   values in `VerseNode.__altnumber`/`__pubnumber`. The display run is a derived cache, never a
 *   second store.
 * - **The display run** is a TextNode tagged textType "attribute" holding the canonical PT9 byte
 *   form produced by {@link canonicalAttributeText}: a lone default attribute collapses to
 *   `|value`; anything else is `|name="value" …` (double quotes, single spaces, insertion
 *   order). `closed` is derived metadata, never displayed. Char runs are bare `|…` directly
 *   before the closing glyph (PT9's shape; an NBSP prefix would flatten to a space and leak
 *   into span content on a Tier-2 rebuild). Milestone runs keep the NBSP+`|` prefix — that NBSP
 *   flattens to the space genuinely in the file (`\qt-s |sid="…"\*`). A verse's `\va`/`\vp`
 *   values aren't `name="value"` attribute bytes at all — PT9 displays them as their own
 *   `MarkerNode` open + NBSP-prefixed value TextNode + `MarkerNode` close triplet, riding as the
 *   verse's FOLLOWING SIBLINGS (a `VerseNode` is itself a TextNode, not a container). A
 *   milestone's run is shaped the same way — opening `MarkerNode` + optional NBSP-prefixed
 *   attribute TextNode + self-closing `MarkerNode` `\*`, riding as the `MilestoneNode`'s
 *   FOLLOWING SIBLINGS (a `MilestoneNode` is a `DecoratorNode`, so it cannot hold children
 *   either) — except the glyphs themselves are unconditional: a milestone always shows its
 *   opening/self-closing pair, with only the middle attribute text coming and going.
 * - **Excluded from data paths**: textType "attribute" text never enters OT content ops or the
 *   editor→USJ conversion; the Tier-2 fragment is the one place it DOES flow, so edited bytes
 *   re-tokenize back into node state (extractAttributes / scanMilestone).
 *
 * ## Keeping the cache honest
 *
 * Builders construct the run (usj-editor.adaptor's `createChar`/`addAttributes`/
 * `addVerseAttributes`; transforms do not run on `setEditorState`), and
 * {@link $syncMilestoneDisplayRun} — registered as a MilestoneNode transform — re-derives it
 * whenever a milestone is dirtied, healing remote collab updates (the collab materializer's
 * `$createMilestone` builds a BARE `MilestoneNode` with no run at all —
 * delta-apply-update.utils.ts) and structure surgery. A char span's own run and a verse's
 * `\va`/`\vp` runs follow the identical contract through the shared `$syncDisplayRun` driver
 * (displayRunSync.utils.ts), parameterized by each kind's own descriptor rather than defined in
 * this module. While the collapsed caret sits inside the run the sync leaves it alone (mid-edit
 * grace); the marker-edit engine settles it on caret departure by pending the edited run into its
 * Tier-2 completion path — the displayed bytes re-tokenize back into node state (last-write-wins,
 * uniformly across chars, verses, and milestones), and a milestone whose run was deleted OUTRIGHT
 * ({@link $milestoneRunEntirelyAbsent}) is itself removed, since the run is its entire byte
 * representation. `MilestoneNode` is the SAME type in every mode — unlike the char/verse
 * EDITABLE node types, which never appear outside editable mode — so its sync is registered only
 * in `MarkerEditPlugin.tsx`, which is itself markerMode-"editable"-gated, to keep visible/hidden
 * mode's `ImmutableTypedTextNode`-based milestone runs (built by the adaptor, never edited)
 * untouched.
 */

import { $createMarkerNode, $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import {
  $createAttributeRunNode,
  $isAttributeRunNode,
  AttributeRunNode,
} from "./AttributeRunNode.js";
import { $isCharNode, CharNode } from "./CharNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { UnknownAttributes } from "./node-constants.js";
import { $isDescendantOf } from "./node.utils.js";
import { $isDisplayOwnerPended } from "./pendedDisplayOwners.utils.js";
import { $isVerseNode, VerseNode } from "./VerseNode.js";
import {
  $createTextNode,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalNode,
  TextNode,
} from "lexical";

/** USJ artifacts that are not USFM attribute bytes and must never display. */
export const ATTRIBUTE_EXCLUDED_KEYS: ReadonlySet<string> = new Set(["closed"]);

/**
 * The canonical PT9 byte form of an attribute set, including the leading `|` — or `""` when
 * nothing displays. A lone attribute that IS the marker's default collapses to the bare value
 * (`|gloss`); everything else is explicit `name="value"` pairs, double-quoted, single-spaced,
 * insertion order. Values are kept byte-exact (ParatextData treats trailing space as value).
 */
export function canonicalAttributeText(
  attributes: { [name: string]: string | undefined },
  defaultAttributeName?: string,
): string {
  const entries = Object.entries(attributes).filter(
    ([name, value]) => value !== undefined && !ATTRIBUTE_EXCLUDED_KEYS.has(name),
  );
  if (entries.length === 0) return "";
  if (entries.length === 1 && entries[0][0] === defaultAttributeName) return `|${entries[0][1]}`;
  return `|${entries.map(([name, value]) => `${name}="${value}"`).join(" ")}`;
}

/**
 * The attribute object a milestone's canonical display text is derived from: `sid`/`eid` folded
 * in first (their real USJ-object positions), then whatever else the marker carries (chiefly
 * `who`). Shared by usj-editor.adaptor's `addAttributes` (building the run from a `MarkerObject`)
 * and {@link $syncMilestoneDisplayRun} (healing it from a live `MilestoneNode`'s fields) so the
 * two sites — one USJ-shaped, one node-shaped — can never drift on WHICH fields make up a
 * milestone's displayed attributes.
 */
export function milestoneAttributes(
  sid: string | undefined,
  eid: string | undefined,
  unknownAttributes: UnknownAttributes | undefined,
): UnknownAttributes {
  return { ...(sid && { sid }), ...(eid && { eid }), ...unknownAttributes };
}

/**
 * `char`'s own closing glyph among its direct children, if any — the display run's insertion
 * anchor, and the tree signal for whether a run may exist at all. A span whose closing glyph is
 * skipped (a `closed="false"` span — the state that makes footnote/cross-ref content chars and any
 * other genuinely-unclosed span render closer-less) or simply absent never renders one: `createChar`
 * (usj-editor.adaptor) never builds a run there, so the sync must not fabricate one either —
 * deriving the rule from tree shape rather than viewOptions also keeps the sync a no-op outside
 * editable mode, where char spans carry no MarkerNode glyphs at all.
 */
export function $charClosingGlyph(char: CharNode): MarkerNode | undefined {
  return char
    .getChildren()
    .find(
      (child): child is MarkerNode =>
        $isMarkerNode(child) &&
        child.getMarkerSyntax() === "closing" &&
        child.getMarker() === char.getMarker(),
    );
}

/**
 * True when `char` carries attribute bytes that Tier-2 re-tokenization can never recover: real
 * (non-`closed`) attributes with NEITHER a closing glyph ({@link $charClosingGlyph}) NOR an
 * existing display run ({@link $charAttributeDisplayNode}) anywhere among its children. EITHER
 * anchor alone is enough to recover: a live display run carries the bytes into the fragment
 * regardless of the closer (a closer edit — deleted, damaged — re-tokenizes and settles, possibly
 * degrading to literal content, exactly like any other char content); a live closing glyph gives
 * `extractAttributes` a well-defined close event even if the run itself was just deleted (settles
 * to no attributes). Only when BOTH are absent — a `closed="false"` span skips the glyph AND never
 * gets a run built for it — does an attribute such as `link-href` on an unclosed span have no
 * visible representation anywhere in the tree for the Tier-2 fragment builder to pick up. (An
 * explicitly-closed `\xt`, by contrast, renders its closing glyph, so its attribute run IS built
 * and the span is recoverable.) A span with unrecoverable attributes must stay a Tier-2 sentinel
 * (preserve-or-refuse, tier2Rebuild.utils.ts): recursing into it would silently drop the attribute.
 */
export function $hasUnrecoverableAttributes(char: CharNode): boolean {
  const attributes = char.getUnknownAttributes();
  if (!attributes) return false;
  const hasRealAttributes = Object.keys(attributes).some((name) => name !== "closed");
  if (!hasRealAttributes) return false;
  return $charClosingGlyph(char) === undefined && $charAttributeDisplayNode(char) === undefined;
}

/**
 * `char`'s direct-child display run — the TextNode tagged textType "attribute" — or `undefined`
 * if none exists.
 */
export function $charAttributeDisplayNode(char: CharNode): TextNode | undefined {
  return char
    .getChildren()
    .find(
      (child): child is TextNode =>
        $isTextNode(child) && $getState(child, textTypeState) === "attribute",
    );
}

/**
 * A verse's `\va`/`\vp` display triplet — PT9's shape (`MarkerNode` open + value `TextNode` +
 * `MarkerNode` close). Unlike a char span's attribute run, `VerseNode` is itself a `TextNode`,
 * not a container, so its runs are FOLLOWING SIBLINGS rather than children: `\va`'s triplet sits
 * directly after the verse, and `\vp`'s directly after `\va`'s closer (back-to-back, no
 * separator between them — a same-line space there blocks the tokenizer's attrCapture fold onto
 * the verse, per its "space before \vp blocks its fold" rule).
 */
export type VerseAttributeMarker = "va" | "vp";

/**
 * A verse attribute marker's display-run pieces found among the siblings after its anchor — or
 * among the CHILDREN of an `AttributeRunNode` wrapper riding in that same position, when one
 * exists (see {@link AttributeRunNode}). `wrapper` is set only when the scan actually found and
 * descended into one; every OTHER field means exactly what it always has, regardless of which
 * shape produced it.
 */
export interface VerseAttributeRunPieces {
  opener?: MarkerNode;
  value?: TextNode;
  closer?: MarkerNode;
  wrapper?: AttributeRunNode;
}

/**
 * A verse attribute marker's run pieces — opener `MarkerNode` (matching `marker`), value TextNode
 * (textType "attribute"), closer `MarkerNode` — scanned tolerantly in their fixed order starting
 * immediately after `after`, with EACH piece individually optional. Mirrors
 * {@link $milestoneAttributeRunPieces}: a mid-edit tree can be missing any subset — deleting just
 * the value leaves opener + closer debris — and the tolerant scan lets callers recognize and grace
 * that partial state and repair only the genuinely missing pieces around whatever survives, never
 * duplicating a leftover. The old all-or-nothing model returned "no run at all" for a
 * value-deleted run and re-derived a whole new opener/value/closer over the surviving debris on the
 * next sync (the value-deletion resurrect/duplicate bug).
 *
 * When `after`'s immediately following sibling is an `AttributeRunNode` whose `runKind` matches
 * `marker`, the SAME tolerant scan runs over the wrapper's CHILDREN instead of `after`'s siblings
 * — a wrapper's children are the run's pieces in the identical fixed order, so redirecting the
 * cursor's starting point is the only change needed. The adaptor always builds this shape now; the
 * sync still heals whichever shape — loose siblings (a pre-flip editor state, an undo stack, or a
 * collab-materialized bare owner) or an existing wrapper — is actually in the tree.
 *
 * Exported (mirrors {@link $milestoneAttributeRunPieces}) so `markerEditTier1.utils.ts`'s
 * deletion-settle path (`packages/platform`) can locate a verse's wrapper(s) directly to detect
 * and clean up an emptied husk.
 */
export function $verseAttributeRunPieces(
  after: LexicalNode,
  marker: VerseAttributeMarker,
): VerseAttributeRunPieces {
  let opener: MarkerNode | undefined;
  let value: TextNode | undefined;
  let closer: MarkerNode | undefined;
  let wrapper: AttributeRunNode | undefined;
  let cursor: LexicalNode | null = after.getNextSibling();
  if ($isAttributeRunNode(cursor) && cursor.getRunKind() === marker) {
    wrapper = cursor;
    cursor = cursor.getFirstChild();
  }
  if (
    $isMarkerNode(cursor) &&
    cursor.getMarkerSyntax() === "opening" &&
    cursor.getMarker() === marker
  ) {
    opener = cursor;
    cursor = cursor.getNextSibling();
  }
  // A MarkerNode is itself a TextNode subclass, so the attribute-state check (never set on a
  // glyph) is what keeps a closer from being misread as the value.
  if ($isTextNode(cursor) && $getState(cursor, textTypeState) === "attribute") {
    value = cursor;
    cursor = cursor.getNextSibling();
  }
  if (
    $isMarkerNode(cursor) &&
    cursor.getMarkerSyntax() === "closing" &&
    cursor.getMarker() === marker
  )
    closer = cursor;
  return { opener, value, closer, wrapper };
}

/**
 * The VerseNode whose `\va`/`\vp` SOURCE span `node` is content of, or `undefined`. A settled
 * empty run leaves a standalone `char va`/`char vp` span in the verse's run position (displayed
 * `\va \va*`); a value typed into it is an ordinary content edit that no textType tag marks, so
 * the pend decision must key on the SITE — content of a va/vp span whose sibling chain reaches
 * back to a verse over run pieces only — for departure's re-tokenize to fold the bytes onto the
 * verse (the tokenizer's attrCapture). A va/vp span NOT in a verse's run position re-tokenizes
 * to itself (fixed point) and settles nothing — pending it is harmless. A preceding run piece may
 * be loose (a bare `MarkerNode`/attribute `TextNode`) or a whole `AttributeRunNode` wrapper
 * crossed in one step — the adaptor always builds a wanted run wrapped now, so a `\vp` span
 * sitting behind a WRAPPED `\va` run (the only shape an altnumber-bearing verse can have
 * post-migration) must still walk past it to reach the verse. Sibling walk to `$ownerOfRunPiece`'s
 * verse descriptors (displayRunRegistry.ts): those start from a run PIECE — including an opening
 * glyph, the shape MarkerEditPlugin.tsx's MarkerNode transform re-drives its sync/pend from — and
 * walk back to find the owning verse; this one starts from a SOURCE SPAN's content text and walks
 * back to find the owning verse for the pend decision. Both classify the same run-piece shapes
 * over the same sibling chain and must keep agreeing on what counts as one.
 */
export function $verseOfAttributeSourceText(node: LexicalNode): VerseNode | undefined {
  const span = node.getParent();
  if (!$isCharNode(span)) return undefined;
  const marker = span.getMarker();
  if (marker !== "va" && marker !== "vp") return undefined;
  for (let prev = span.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isVerseNode(prev)) return prev;
    const isRunPiece =
      ($isMarkerNode(prev) && (prev.getMarker() === "va" || prev.getMarker() === "vp")) ||
      ($isTextNode(prev) && $getState(prev, textTypeState) === "attribute") ||
      ($isCharNode(prev) && (prev.getMarker() === "va" || prev.getMarker() === "vp")) ||
      $isAttributeRunNode(prev);
    if (!isRunPiece) return undefined;
  }
  return undefined;
}

/**
 * A milestone's display-run pieces found among its immediate following siblings — or among the
 * CHILDREN of an `AttributeRunNode` wrapper riding in that same position, when one exists (see
 * {@link AttributeRunNode}). `wrapper` is set only when the scan actually found and descended
 * into one; every OTHER field means exactly what it always has, regardless of which shape
 * produced it.
 */
export interface MilestoneRunPieces {
  opening?: MarkerNode;
  attribute?: TextNode;
  closing?: MarkerNode;
  wrapper?: AttributeRunNode;
}

/**
 * A milestone's display-run pieces, scanned tolerantly in their fixed order — opening
 * `MarkerNode` (matching `milestone`'s own marker), attribute TextNode (textType "attribute"),
 * self-closing `MarkerNode` — with EACH piece individually optional: a bare collab-materialized
 * milestone has none of them, and a mid-edit tree can be missing any subset (only the opening
 * deleted leaves attribute + closer debris; only the closer deleted leaves opening + attribute).
 * The tolerant scan lets callers repair only the genuinely missing/stale pieces around whatever
 * survives — never duplicating a leftover — and lets {@link $milestoneRunEntirelyAbsent}
 * distinguish "every byte of the run deleted" from a partial mangle. Exported as the single
 * definition of "a milestone's run" — the Tier-2 rebuild's `$milestoneDisplayRun` delegates to it
 * so the sync and the rebuild can never disagree about which siblings make up the run.
 *
 * When `milestone`'s immediately following sibling is an `AttributeRunNode` whose `runKind` is
 * `"milestone"`, the SAME tolerant scan runs over the wrapper's CHILDREN instead of `milestone`'s
 * siblings — a wrapper's children are the run's pieces in the identical fixed order, so
 * redirecting the cursor's starting point is the only change needed. The adaptor always builds
 * this shape now; the sync still heals whichever shape — loose siblings (a pre-flip editor state,
 * an undo stack, or a collab-materialized bare milestone) or an existing wrapper — is actually in
 * the tree.
 */
export function $milestoneAttributeRunPieces(milestone: MilestoneNode): MilestoneRunPieces {
  let opening: MarkerNode | undefined;
  let attribute: TextNode | undefined;
  let closing: MarkerNode | undefined;
  let wrapper: AttributeRunNode | undefined;
  let cursor: LexicalNode | null = milestone.getNextSibling();
  if ($isAttributeRunNode(cursor) && cursor.getRunKind() === "milestone") {
    wrapper = cursor;
    cursor = cursor.getFirstChild();
  }
  if (
    $isMarkerNode(cursor) &&
    cursor.getMarkerSyntax() === "opening" &&
    cursor.getMarker() === milestone.getMarker()
  ) {
    opening = cursor;
    cursor = cursor.getNextSibling();
  }
  if ($isTextNode(cursor) && $getState(cursor, textTypeState) === "attribute") {
    attribute = cursor;
    cursor = cursor.getNextSibling();
  }
  if ($isMarkerNode(cursor) && cursor.getMarkerSyntax() === "selfClosing") closing = cursor;
  return { opening, attribute, closing, wrapper };
}

/**
 * True when NO piece of `milestone`'s display run remains — the run (the milestone's ENTIRE
 * visible byte representation) has been deleted outright, as opposed to a partial mangle that
 * still leaves debris to repair around. The marker-edit engine's settle path removes such a
 * milestone on caret departure: deleting all of a construct's bytes deletes the construct.
 */
export function $milestoneRunEntirelyAbsent(milestone: MilestoneNode): boolean {
  const { opening, attribute, closing } = $milestoneAttributeRunPieces(milestone);
  return !opening && !attribute && !closing;
}

/**
 * Whether the collapsed caret sits where a milestone's attribute TextNode already is, or — when
 * pieces are missing — at the run's edit site. Mirrors the char kind's insertion-point grace (now
 * `$caretHoldsRunSite`'s shared reporter plus the char descriptor's `graceSite`,
 * displayRunSync.utils.ts / displayRunRegistry.ts), including its missing-run arm: when the run
 * is ENTIRELY absent (a just-deleted run), its insertion point is the milestone's flank — the end
 * of the previous sibling or the start of the next — where a deletion collapses the caret; without
 * that arm the sync would re-derive the run from the milestone's still-set fields the instant it
 * was deleted and the deletion would visibly undo itself. When only the attribute text is missing
 * beside a surviving opening glyph, the site is the self-closing glyph (or the end of the opening
 * glyph's own text). A missing glyph next to OTHER surviving pieces is deliberately not
 * caret-graced — inserting a missing structural glyph beside existing content cannot corrupt
 * anything the user is mid-typing, unlike overwriting the attribute text.
 *
 * When `wrapper` is set, the caret holding ANY position inside the wrapper's subtree (not just a
 * recognized piece) also counts — an element-point selection can land on the wrapper itself, a
 * shape the piece-specific arms below don't otherwise recognize.
 */
function $isCaretAtMilestoneRunBoundary(
  milestone: MilestoneNode,
  { opening, attribute, closing, wrapper }: MilestoneRunPieces,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (wrapper && (anchorNode.is(wrapper) || $isDescendantOf(anchorNode, wrapper.getKey())))
    return true;
  if (attribute) return anchorNode.is(attribute);
  // Load-bearing, not just a loose-shape leftover: with no wrapper piece found at all, "run
  // entirely absent" is read from the milestone's own flanking siblings rather than from a
  // wrapper's own position. Covers the same two cases as the verse kind's flank grace
  // ($verseFlankGrace, displayRunRegistry.ts) — a genuinely loose run deleted before heal-forward
  // wrapped it, and a WRAPPED run whose whole `AttributeRunNode` was removed in one deletion —
  // since both leave the identical wrapper-less tree shape for this scan to find nothing at.
  if (!opening && !closing) {
    const previous = milestone.getPreviousSibling();
    if (
      previous !== null &&
      anchorNode.is(previous) &&
      selection.anchor.offset === previous.getTextContentSize()
    )
      return true;
    const next = milestone.getNextSibling();
    return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
  }
  if (!opening) return false;
  // Attribute text missing beside a surviving opening glyph: the caret can hold the site at the
  // self-closing glyph OR at the end of the opening glyph's own text (where deleting only the
  // attribute text collapses it). Grace BOTH — the documented contract, and the anchor a
  // delete-through-the-run actually lands on when the closer is left intact.
  const atOpeningEnd =
    anchorNode.is(opening) && selection.anchor.offset === opening.getTextContentSize();
  if (closing) return atOpeningEnd || anchorNode.is(closing);
  return atOpeningEnd;
}

/**
 * Heal `milestone`'s display run to `expectedAttributeText`: build the opening/self-closing glyph
 * pair when either is missing (the collab materializer's bare `MilestoneNode` has neither), and
 * insert/rewrite/remove the attribute TextNode between them to match — except while the collapsed
 * caret holds the run's site (mid-edit grace, see {@link $isCaretAtMilestoneRunBoundary}: inside
 * the attribute text, or at a just-deleted run's insertion point), or while the marker-edit engine
 * holds `milestone` pended (a run destroyed by something other than this call, or caret-held
 * divergence re-pended by `$resolvePendingMarkers`) — both of which the sync leaves alone for the
 * marker-edit engine to settle on caret departure, which also defers a pending wrap migration (see
 * below) for the same reason. Unlike a char span or verse, a milestone's opening/self-closing
 * glyphs are UNCONDITIONAL — only the attribute text in between comes and goes with
 * `expectedAttributeText`. Partial mangles are repaired AROUND the surviving pieces (a leftover
 * attribute text or glyph is reused in place, never duplicated). Idempotent — writes only on
 * change, so the registering transform converges.
 *
 * A run that should EXIST always ends up inside a wrapper: an already-wrapped run (even an
 * attached-but-empty husk) is repaired in place; a run found as LOOSE siblings — complete or
 * partial, from a pre-flip editor state, an undo stack, or a collab-materialized bare milestone —
 * is HEALED FORWARD: a new wrapper is created in the loose pieces' own position and every
 * surviving piece is moved inside it before any missing piece is built. This is the one migration
 * path from loose to wrapped, so the top-of-function early-return additionally requires an
 * existing wrapper — a fully-correct but still-loose run does not skip the migration.
 *
 * @param milestone - The milestone whose display run to sync. Must be called inside
 *   `editor.update()`.
 * @param expectedAttributeText - The canonical NBSP+`|…` bytes `milestone` should display between
 *   its glyphs, or `""` for none.
 */
export function $syncMilestoneDisplayRun(
  milestone: MilestoneNode,
  expectedAttributeText: string,
): void {
  if (!milestone.isAttached()) return;
  const pieces = $milestoneAttributeRunPieces(milestone);
  const { opening, attribute, closing, wrapper: existingWrapper } = pieces;
  const currentText = attribute?.getTextContent() ?? "";
  // A missing self-closing glyph disqualifies the run as canonical even when the text already
  // matches: the run is not fully repaired until both glyphs are in place. A complete, matching
  // run that is still LOOSE (no wrapper) also does not qualify — it still needs the wrap migration.
  if (
    opening !== undefined &&
    closing !== undefined &&
    currentText === expectedAttributeText &&
    existingWrapper
  )
    return;
  // The engine holds this milestone pending (a run deletion/edit detected from the destruction
  // itself, or caret-held divergence re-pended by $resolvePendingMarkers): healing now would
  // resurrect or overwrite it before caret departure settles it — mirrors the shared
  // $syncDisplayRun driver's pended guard (displayRunSync.utils.ts), which the char kind now
  // goes through.
  if ($isDisplayOwnerPended(milestone)) return;
  if ($isCaretAtMilestoneRunBoundary(milestone, pieces)) return;

  // Ensure a wrapper exists: reuse one already there (even an emptied husk, repaired in place), or
  // heal any loose survivors forward into a freshly created one, inserted where the run belongs
  // (directly after `milestone`, which is exactly where a surviving loose piece already sits — the
  // milestone's glyphs are unconditional, so a loose piece is never missing a slot ahead of it).
  const wrapper =
    existingWrapper ??
    (() => {
      const created = $createAttributeRunNode("milestone");
      milestone.insertAfter(created);
      if (opening) created.append(opening);
      if (attribute) created.append(attribute);
      if (closing) created.append(closing);
      return created;
    })();

  const openingGlyph =
    opening ??
    (() => {
      const created = $createMarkerNode(milestone.getMarker(), "opening");
      const wrapperFirstChild = wrapper.getFirstChild();
      if (wrapperFirstChild) wrapperFirstChild.insertBefore(created);
      else wrapper.append(created);
      return created;
    })();

  let workingAttribute = attribute;
  if (currentText !== expectedAttributeText) {
    if (expectedAttributeText === "") {
      workingAttribute?.remove();
      workingAttribute = undefined;
    } else if (workingAttribute) {
      workingAttribute.setTextContent(expectedAttributeText);
    } else {
      workingAttribute = $createTextNode(expectedAttributeText);
      $setState(workingAttribute, textTypeState, "attribute");
      openingGlyph.insertAfter(workingAttribute);
    }
  }

  if (!closing) {
    const closingGlyph = $createMarkerNode("", "selfClosing");
    (workingAttribute ?? openingGlyph).insertAfter(closingGlyph);
  }
}

/**
 * True when `milestone`'s display run diverges from `expectedAttributeText` but the sync is
 * deliberately leaving it alone because the caret holds the run's site — mid-editing the
 * attribute text (reachable when a remote collab update changes `sid`/`eid`/`unknownAttributes`
 * — delta-apply-update.utils.ts's `$applyEmbedAttributes` calls `setUnknownAttributes` directly,
 * never touching the run — while the local caret is inside that same run's text), or, for a
 * just-deleted run, sitting at its insertion point (see the deleted-run arm of
 * {@link $isCaretAtMilestoneRunBoundary}). The marker-edit engine pends such milestones so caret
 * departure settles them: the displayed bytes re-tokenize back into node state, or — when every
 * run piece is gone ({@link $milestoneRunEntirelyAbsent}) — the milestone itself is removed.
 */
export function $hasCaretHeldMilestoneRun(
  milestone: MilestoneNode,
  expectedAttributeText: string,
): boolean {
  if (!milestone.isAttached()) return false;
  const pieces = $milestoneAttributeRunPieces(milestone);
  const { opening, attribute, closing } = pieces;
  const currentText = attribute?.getTextContent() ?? "";
  if (opening !== undefined && closing !== undefined && currentText === expectedAttributeText)
    return false;
  return $isCaretAtMilestoneRunBoundary(milestone, pieces);
}
