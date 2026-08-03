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
 * {@link $syncCharAttributeDisplay}/{@link $syncVerseAttributeDisplay}/
 * {@link $syncMilestoneDisplayRun} — registered as CharNode/VerseNode/MilestoneNode transforms —
 * re-derive it whenever a span, verse, or milestone is dirtied, healing remote collab updates
 * (the collab materializer's `$createMilestone` builds a BARE `MilestoneNode` with no run at
 * all — delta-apply-update.utils.ts) and structure surgery. While the collapsed caret sits
 * inside the run the sync leaves it alone (mid-edit grace); the marker-edit engine settles it on
 * caret departure by pending the edited run into its Tier-2 completion path. Unlike the char/
 * verse syncs (registered in shared-react plugins that always run, relying on the char/verse
 * EDITABLE node types never appearing outside editable mode), `MilestoneNode` is the SAME type
 * in every mode — so its sync is registered only in `MarkerEditPlugin.tsx`, which is itself
 * markerMode-"editable"-gated, to keep visible/hidden mode's `ImmutableTypedTextNode`-based
 * milestone runs (built by the adaptor, never edited) untouched.
 */

import { $createMarkerNode, $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { CharNode } from "./CharNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { NBSP, UnknownAttributes } from "./node-constants.js";
import { VerseNode } from "./VerseNode.js";
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
 * skipped (implicitly-closed footnote/cross-ref content, or `closed="false"`) or simply absent
 * never renders one: `createChar` (usj-editor.adaptor) never builds a run there, so the sync must
 * not fabricate one either — deriving the rule from tree shape rather than viewOptions also keeps
 * the sync a no-op outside editable mode, where char spans carry no MarkerNode glyphs at all.
 */
function $charClosingGlyph(char: CharNode): MarkerNode | undefined {
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
 * to no attributes). Only when BOTH are absent — implicitly-closed footnote/cross-reference
 * content (`\fr`/`\ft`/`\xt`…) and explicit `closed="false"` spans skip the glyph AND never get a
 * run built for them — does an attribute such as `link-href` on an auto-closed `\xt` have no
 * visible representation anywhere in the tree for the Tier-2 fragment builder to pick up. Such a
 * span must stay a Tier-2 sentinel (preserve-or-refuse, tier2Rebuild.utils.ts): recursing into it
 * would silently drop the attribute.
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
 * Whether the collapsed caret sits where the display run already is, or — when the run is
 * missing — at its insertion point. Mirrors {@link $isCaretAtOpenerBoundary}
 * (markerSeparators.utils.ts): a boundary the caret can hold in more than one shape after an
 * edit. `closingGlyph` is the insertion anchor, and the caret can sit at it either by landing on
 * the glyph itself or at the text-end of the content immediately before it.
 */
function $isCaretAtAttributeRunBoundary(
  run: TextNode | undefined,
  closingGlyph: MarkerNode | undefined,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (run) return anchorNode.is(run);
  if (!closingGlyph) return false;
  if (anchorNode.is(closingGlyph)) return true;
  const lastContent = closingGlyph.getPreviousSibling();
  return (
    lastContent !== null &&
    anchorNode.is(lastContent) &&
    selection.anchor.offset === lastContent.getTextContentSize()
  );
}

/**
 * Heal `char`'s attribute display run to `expectedText`: insert it before the closing glyph when
 * missing, rewrite it in place when stale, or remove it when `expectedText` is `""` — except
 * while the collapsed caret holds the run (mid-edit grace, see
 * {@link $isCaretAtAttributeRunBoundary}), which the sync leaves alone for the marker-edit engine
 * to settle on caret departure. A span with no closing glyph never carries a run regardless of
 * `expectedText` (see {@link $charClosingGlyph}). Idempotent — writes only on change, so the
 * registering transform converges.
 *
 * @param char - The char span whose display run to sync. Must be called inside `editor.update()`.
 * @param expectedText - The canonical attribute bytes `char` should display, or `""` for none.
 */
export function $syncCharAttributeDisplay(char: CharNode, expectedText: string): void {
  // An earlier transform in the same pass may have merged/removed the span (adjacent-span
  // combining); a detached span has no tree position to derive from.
  if (!char.isAttached()) return;
  const closingGlyph = $charClosingGlyph(char);
  const targetText = closingGlyph ? expectedText : "";
  const run = $charAttributeDisplayNode(char);
  // A missing run reads as "" so a missing-and-unwanted run compares equal without a run lookup.
  if ((run?.getTextContent() ?? "") === targetText) return;
  if ($isCaretAtAttributeRunBoundary(run, closingGlyph)) return;
  if (targetText === "") {
    run?.remove();
    return;
  }
  if (run) {
    run.setTextContent(targetText);
    return;
  }
  const newRun = $createTextNode(targetText);
  $setState(newRun, textTypeState, "attribute");
  closingGlyph?.insertBefore(newRun);
}

/**
 * True when `char`'s display run diverges from `expectedText` but the sync is deliberately
 * leaving it alone because the caret holds it — mid-edit, or, for a missing run, sitting at its
 * would-be insertion point. The marker-edit engine pends such spans so caret departure settles
 * them back to canonical via Tier-2.
 */
export function $hasCaretHeldAttributeRun(char: CharNode, expectedText: string): boolean {
  if (!char.isAttached()) return false;
  const closingGlyph = $charClosingGlyph(char);
  const targetText = closingGlyph ? expectedText : "";
  const run = $charAttributeDisplayNode(char);
  if ((run?.getTextContent() ?? "") === targetText) return false;
  return $isCaretAtAttributeRunBoundary(run, closingGlyph);
}

/**
 * A verse's `\va`/`\vp` display triplet — PT9's shape (`MarkerNode` open + value `TextNode` +
 * `MarkerNode` close). Unlike a char span's attribute run, `VerseNode` is itself a `TextNode`,
 * not a container, so its runs are FOLLOWING SIBLINGS rather than children: `\va`'s triplet sits
 * directly after the verse, and `\vp`'s directly after `\va`'s closer (back-to-back, no
 * separator between them — a same-line space there blocks the tokenizer's attrCapture fold onto
 * the verse, per its "space before \vp blocks its fold" rule).
 */
type VerseAttributeMarker = "va" | "vp";

interface VerseAttributeTriplet {
  opener: MarkerNode;
  value: TextNode;
  closer: MarkerNode;
}

/** The triplet starting AT `candidate`, if `candidate` is a matching opener with a well-formed
 * value + closer immediately following it. */
function $verseAttributeTriplet(
  candidate: LexicalNode | null,
  marker: VerseAttributeMarker,
): VerseAttributeTriplet | undefined {
  if (
    !$isMarkerNode(candidate) ||
    candidate.getMarkerSyntax() !== "opening" ||
    candidate.getMarker() !== marker
  )
    return undefined;
  const value = candidate.getNextSibling();
  if (!$isTextNode(value) || $getState(value, textTypeState) !== "attribute") return undefined;
  const closer = value.getNextSibling();
  if (
    !$isMarkerNode(closer) ||
    closer.getMarkerSyntax() !== "closing" ||
    closer.getMarker() !== marker
  )
    return undefined;
  return { opener: candidate, value, closer };
}

/** The display text a triplet's value should hold for `value`, or `undefined` for no triplet at
 * all — NBSP-prefixed (not bare, unlike a char's `|…` run) because the byte between `\va` and its
 * value is the file's real separator (`\va 2\va*`), and Tier-2's NBSP→space flattening reproduces
 * it exactly rather than leaking a display-only space into the captured attribute value. */
function $verseAttributeTargetText(value: string | undefined): string | undefined {
  return value ? NBSP + value : undefined;
}

/** True when `triplet`'s value diverges from what `value` should render as — including "no
 * triplet, no value wanted" comparing equal (not diverging). */
function $verseAttributeDiverges(
  triplet: VerseAttributeTriplet | undefined,
  value: string | undefined,
): boolean {
  return triplet?.value.getTextContent() !== $verseAttributeTargetText(value);
}

/**
 * Whether the collapsed caret holds a verse attribute run's SITE — inside `triplet`'s value when
 * the triplet exists (the mid-edit grace, leaving the user's in-progress edit alone), or, when the
 * triplet is MISSING (the user just deleted the whole `\va …\va*` run), at the run's insertion
 * point: the end of `after` (the verse, or a preceding `\va` closer) or the very start of `after`'s
 * next content sibling, where a range deletion collapses the caret. Mirrors the char side's
 * {@link $isCaretAtAttributeRunBoundary}. Without the missing-triplet arm, the sync would re-derive
 * the run from the still-set altnumber/pubnumber the instant the triplet is deleted and the
 * deletion would visibly undo itself.
 */
function $isCaretAtVerseAttributeSite(
  after: LexicalNode,
  triplet: VerseAttributeTriplet | undefined,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (triplet) return anchorNode.is(triplet.value);
  if (anchorNode.is(after) && selection.anchor.offset === after.getTextContentSize()) return true;
  const next = after.getNextSibling();
  return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
}

/**
 * Heal a single marker's triplet (insert missing, rewrite stale, or remove leftover), anchored
 * immediately after `after`. Returns the node the NEXT marker's triplet should anchor after —
 * `after` itself when no triplet exists there, else this triplet's closer — so `\va` and `\vp`
 * chain correctly regardless of which are present.
 */
function $syncVerseAttributeRun(
  after: LexicalNode,
  marker: VerseAttributeMarker,
  value: string | undefined,
): LexicalNode {
  const triplet = $verseAttributeTriplet(after.getNextSibling(), marker);
  if (!$verseAttributeDiverges(triplet, value)) return triplet?.closer ?? after;
  // Mid-edit grace: the caret holds the run's site (inside a live value, or at a just-deleted
  // run's insertion point). Leave it alone — the marker-edit engine settles it on departure.
  if ($isCaretAtVerseAttributeSite(after, triplet)) return triplet?.closer ?? after;
  const targetText = $verseAttributeTargetText(value);
  if (targetText === undefined) {
    triplet?.opener.remove();
    triplet?.value.remove();
    triplet?.closer.remove();
    return after;
  }
  if (triplet) {
    triplet.value.setTextContent(targetText);
    return triplet.closer;
  }
  const opener = $createMarkerNode(marker, "opening");
  after.insertAfter(opener);
  const newValue = $createTextNode(targetText);
  $setState(newValue, textTypeState, "attribute");
  opener.insertAfter(newValue);
  const closer = $createMarkerNode(marker, "closing");
  newValue.insertAfter(closer);
  return closer;
}

/**
 * Heal `verse`'s `\va`/`\vp` display triplets to match `altnumber`/`pubnumber`: insert a missing
 * triplet, rewrite a stale one, or remove a leftover one — except while the collapsed caret sits
 * inside a triplet's value (mid-edit grace), which the sync leaves alone for the marker-edit
 * engine to settle on caret departure. Idempotent — writes only on change, so the registering
 * transform converges.
 *
 * @param verse - The verse whose display triplets to sync. Must be called inside `editor.update()`.
 * @param altnumber - The `\va` value `verse` should display, or `undefined` for none.
 * @param pubnumber - The `\vp` value `verse` should display, or `undefined` for none.
 */
export function $syncVerseAttributeDisplay(
  verse: VerseNode,
  altnumber: string | undefined,
  pubnumber: string | undefined,
): void {
  if (!verse.isAttached()) return;
  const afterVa = $syncVerseAttributeRun(verse, "va", altnumber);
  $syncVerseAttributeRun(afterVa, "vp", pubnumber);
}

/**
 * True when `verse`'s `\va` or `\vp` triplet diverges from `altnumber`/`pubnumber` but the sync
 * is deliberately leaving it alone because the caret holds it. The marker-edit engine pends such
 * verses so caret departure settles them back to canonical.
 */
export function $hasCaretHeldVerseAttributeRun(
  verse: VerseNode,
  altnumber: string | undefined,
  pubnumber: string | undefined,
): boolean {
  if (!verse.isAttached()) return false;
  const vaTriplet = $verseAttributeTriplet(verse.getNextSibling(), "va");
  if (
    $verseAttributeDiverges(vaTriplet, altnumber) &&
    $isCaretAtVerseAttributeSite(verse, vaTriplet)
  )
    return true;
  // A diverging \va the caret does NOT hold is not "caret-held" (it would just heal in place),
  // but that must not short-circuit the \vp check — the two triplets are independent, and the
  // caret can only ever be in one of them at a time.
  const afterVa = vaTriplet?.closer ?? verse;
  const vpTriplet = $verseAttributeTriplet(afterVa.getNextSibling(), "vp");
  return Boolean(
    $verseAttributeDiverges(vpTriplet, pubnumber) &&
    $isCaretAtVerseAttributeSite(afterVa, vpTriplet),
  );
}

/**
 * A milestone's display-run glyphs found directly after it, if a well-formed opening glyph is
 * there at all: the opening `MarkerNode` (matching `milestone`'s own marker), an optional
 * attribute TextNode, and — only recognized when it immediately follows the opening (or the
 * attribute, when present) — the self-closing `MarkerNode`. Any of the three can be individually
 * absent (a bare collab-materialized milestone has none of them; a mid-edit tree may have some but
 * not others), so callers repair only the missing/stale pieces rather than tearing down and
 * rebuilding ones already in place.
 */
function $milestoneAttributeRunPieces(milestone: MilestoneNode): {
  opening?: MarkerNode;
  attribute?: TextNode;
  closing?: MarkerNode;
} {
  const opening = milestone.getNextSibling();
  if (
    !$isMarkerNode(opening) ||
    opening.getMarkerSyntax() !== "opening" ||
    opening.getMarker() !== milestone.getMarker()
  )
    return {};
  const afterOpening = opening.getNextSibling();
  if ($isMarkerNode(afterOpening) && afterOpening.getMarkerSyntax() === "selfClosing")
    return { opening, closing: afterOpening };
  if ($isTextNode(afterOpening) && $getState(afterOpening, textTypeState) === "attribute") {
    const afterAttribute = afterOpening.getNextSibling();
    if ($isMarkerNode(afterAttribute) && afterAttribute.getMarkerSyntax() === "selfClosing")
      return { opening, attribute: afterOpening, closing: afterAttribute };
    return { opening, attribute: afterOpening };
  }
  return { opening };
}

/**
 * Whether the collapsed caret sits where a milestone's attribute TextNode already is, or — when
 * that text node is missing — at its would-be insertion point (the self-closing glyph, if one is
 * already there, or the end of the opening glyph's own text otherwise). Mirrors
 * {@link $isCaretAtAttributeRunBoundary} (the char version): the opening/self-closing glyphs
 * themselves are never caret-graced here — inserting a missing structural glyph beside existing
 * content cannot corrupt anything the user is mid-typing, unlike overwriting the attribute text.
 */
function $isCaretAtMilestoneRunBoundary(
  attribute: TextNode | undefined,
  opening: MarkerNode | undefined,
  closing: MarkerNode | undefined,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (attribute) return anchorNode.is(attribute);
  if (!opening) return false;
  if (closing) return anchorNode.is(closing);
  return anchorNode.is(opening) && selection.anchor.offset === opening.getTextContentSize();
}

/**
 * Heal `milestone`'s display run to `expectedAttributeText`: build the opening/self-closing glyph
 * pair when either is missing (the collab materializer's bare `MilestoneNode` has neither), and
 * insert/rewrite/remove the attribute TextNode between them to match — except while the collapsed
 * caret holds the attribute text (mid-edit grace, see {@link $isCaretAtMilestoneRunBoundary}),
 * which the sync leaves alone for the marker-edit engine to settle on caret departure. Unlike a
 * char span or verse, a milestone's opening/self-closing glyphs are UNCONDITIONAL — only the
 * attribute text in between comes and goes with `expectedAttributeText`. Idempotent — writes only
 * on change, so the registering transform converges.
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
  const { opening, attribute, closing } = $milestoneAttributeRunPieces(milestone);
  const currentText = attribute?.getTextContent() ?? "";
  // A missing self-closing glyph disqualifies the run as canonical even when the text already
  // matches: the run is not fully repaired until both glyphs are in place.
  if (opening !== undefined && closing !== undefined && currentText === expectedAttributeText)
    return;
  if ($isCaretAtMilestoneRunBoundary(attribute, opening, closing)) return;

  const openingGlyph =
    opening ??
    (() => {
      const created = $createMarkerNode(milestone.getMarker(), "opening");
      milestone.insertAfter(created);
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
 * deliberately leaving it alone because the caret holds the attribute text. The marker-edit
 * engine pends such milestones so caret departure settles them back to canonical — reachable when
 * a remote collab update changes `sid`/`eid`/`unknownAttributes` (delta-apply-update.utils.ts's
 * `$applyEmbedAttributes` calls `setUnknownAttributes` directly, never touching the run) while the
 * local caret happens to be mid-editing that same run's text.
 */
export function $hasCaretHeldMilestoneRun(
  milestone: MilestoneNode,
  expectedAttributeText: string,
): boolean {
  if (!milestone.isAttached()) return false;
  const { opening, attribute, closing } = $milestoneAttributeRunPieces(milestone);
  const currentText = attribute?.getTextContent() ?? "";
  if (opening !== undefined && closing !== undefined && currentText === expectedAttributeText)
    return false;
  return $isCaretAtMilestoneRunBoundary(attribute, opening, closing);
}
