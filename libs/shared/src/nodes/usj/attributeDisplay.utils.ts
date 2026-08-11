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
 * `addVerseAttributes`; transforms do not run on `setEditorState`). A char span's own run, a
 * verse's `\va`/`\vp` runs, and a milestone's run all follow the identical contract through the
 * shared `$syncDisplayRun` driver (displayRunSync.utils.ts), parameterized by each kind's own
 * descriptor rather than defined in this module — re-deriving the run whenever its owner is
 * dirtied, healing remote collab updates (the collab materializer's `$createMilestone` builds a
 * BARE `MilestoneNode` with no run at all — delta-apply-update.utils.ts) and structure surgery.
 * While the collapsed caret sits inside the run the sync leaves it alone (mid-edit
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

import { $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $isAttributeRunNode, AttributeRunNode } from "./AttributeRunNode.js";
import { $isCharNode, CharNode } from "./CharNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { UnknownAttributes } from "./node-constants.js";
import { $isVerseNode, VerseNode } from "./VerseNode.js";
import { $getState, $isTextNode, LexicalNode, TextNode } from "lexical";

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
 * and the milestone descriptor's `expectedPieces` (displayRun/displayRunRegistry.ts, healing it
 * from a live `MilestoneNode`'s fields through the shared `$syncDisplayRun` driver) so the two
 * sites — one USJ-shaped, one node-shaped — can never drift on WHICH fields make up a milestone's
 * displayed attributes.
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
