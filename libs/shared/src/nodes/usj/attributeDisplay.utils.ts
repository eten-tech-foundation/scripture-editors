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
 * caret departure by pending the edited run into its Tier-2 completion path — the displayed
 * bytes re-tokenize back into node state (last-write-wins, uniformly across chars, verses, and
 * milestones), and a milestone whose run was deleted OUTRIGHT ({@link $milestoneRunEntirelyAbsent})
 * is itself removed, since the run is its entire byte representation. Unlike the char/
 * verse syncs (registered in shared-react plugins that always run, relying on the char/verse
 * EDITABLE node types never appearing outside editable mode), `MilestoneNode` is the SAME type
 * in every mode — so its sync is registered only in `MarkerEditPlugin.tsx`, which is itself
 * markerMode-"editable"-gated, to keep visible/hidden mode's `ImmutableTypedTextNode`-based
 * milestone runs (built by the adaptor, never edited) untouched.
 */

import { $createMarkerNode, $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $isAttributeRunNode, AttributeRunNode } from "./AttributeRunNode.js";
import { $isCharNode, CharNode } from "./CharNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { DELTA_CHANGE_TAG, NBSP, UnknownAttributes } from "./node-constants.js";
import { $isDescendantOf } from "./node.utils.js";
import {
  $isDisplayOwnerPended,
  $reportDestroyedDisplayOwner,
} from "./pendedDisplayOwners.utils.js";
import { $isVerseNode, VerseNode } from "./VerseNode.js";
import {
  $createTextNode,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $getState,
  $hasUpdateTag,
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
 * {@link $isCaretAtAttributeRunBoundary}), or while a wanted run has just been destroyed by
 * something other than this call (see the destruction check below), both of which the sync
 * leaves alone for the marker-edit engine to settle on caret departure. A span with no closing
 * glyph never carries a run regardless of `expectedText` (see {@link $charClosingGlyph}).
 * Idempotent — writes only on change, so the registering transform converges.
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
  // The engine holds this owner pending — a run deletion it detected from the destruction itself
  // rather than from the caret's shape (see MarkerEditPlugin's mutation-listener pend). Healing
  // now would resurrect the deletion before caret departure settles it, for exactly the caret
  // shapes {@link $isCaretAtAttributeRunBoundary} below does not recognize (e.g. an element-point
  // selection left after the run is removed).
  if ($isDisplayOwnerPended(char)) return;
  // A run that is WANTED (`targetText` non-empty) but currently ABSENT, and existed in the
  // last-COMMITTED state (the state as of the start of this update, before anything below runs),
  // was destroyed by something other than this call — this branch only runs with `run ===
  // undefined`, and the only place below that ever removes a run does so exclusively when
  // `targetText === ""`, the opposite of this condition, so a call can never be reacting to its
  // own prior removal here. Detecting the destruction from the LAST-COMMITTED state, inside the
  // sync's own decision path, keeps the result independent of which plugin's transforms happen to
  // run first on the shared dirty CharNode: mount order varies across hosts (the real app mounts
  // `CharNodePlugin` before `MarkerEditPlugin`), so a caller-side check reacting to "the run is
  // already gone" would only see that in time under ONE of the two orders. A remote collab apply
  // is excluded: `$applyEmbedAttributes` (delta-apply-update.utils.ts) clears `unknownAttributes`
  // directly, which already makes `targetText` empty before this sync next runs, so this branch
  // is not the normal path a remote clear takes — the tag check is kept as an explicit guard
  // against pending on a remote commit regardless.
  if (targetText !== "" && run === undefined && !$hasUpdateTag(DELTA_CHANGE_TAG)) {
    const existedBefore = $getEditor()
      .getEditorState()
      .read(() => {
        const previous = $getNodeByKey(char.getKey());
        return $isCharNode(previous) && $charAttributeDisplayNode(previous) !== undefined;
      });
    if (existedBefore) {
      $reportDestroyedDisplayOwner(char);
      return;
    }
  }
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
 * cursor's starting point is the only change needed. The adaptor does not build this shape yet;
 * the sync heals whichever shape — loose siblings or an existing wrapper — is actually in the
 * tree.
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

/** The display text a triplet's value should hold for `value`, or `undefined` for no triplet at
 * all — NBSP-prefixed (not bare, unlike a char's `|…` run) because the byte between `\va` and its
 * value is the file's real separator (`\va 2\va*`), and Tier-2's NBSP→space flattening reproduces
 * it exactly rather than leaking a display-only space into the captured attribute value. */
function $verseAttributeTargetText(value: string | undefined): string | undefined {
  return value ? NBSP + value : undefined;
}

/**
 * True when `pieces` diverge from what `value` should render as. When `value` is undefined the run
 * must be ENTIRELY absent — any surviving piece (opener/value/closer debris) diverges. When `value`
 * is wanted the run must be complete AND its value byte-exact — a missing opener, missing value,
 * missing closer, or stale value text all diverge. "No pieces, no value wanted" compares equal.
 */
function $verseAttributeDiverges(
  pieces: VerseAttributeRunPieces,
  value: string | undefined,
): boolean {
  const { opener, value: valueNode, closer } = pieces;
  if (value === undefined) return Boolean(opener || valueNode || closer);
  return !(opener && closer && valueNode?.getTextContent() === $verseAttributeTargetText(value));
}

/**
 * Whether the collapsed caret holds a verse attribute run's SITE — inside the value TextNode when
 * it exists (the mid-edit grace, leaving the user's in-progress edit alone); or, when the run is
 * ENTIRELY absent (the user just deleted the whole `\va …\va*` run), at the run's insertion point —
 * the end of `after` (the verse, or a preceding `\va` closer) or the very start of `after`'s next
 * content sibling, where a range deletion collapses the caret; or, when only the VALUE was deleted
 * beside a surviving opener glyph, at the opener glyph's own end or on the closer glyph, where a
 * delete-through-the-value leaves it. Mirrors {@link $isCaretAtMilestoneRunBoundary}. Without these
 * arms the sync would re-derive the run from the still-set altnumber/pubnumber the instant the run
 * (or its value) is deleted and the deletion would visibly undo itself.
 *
 * When `pieces.wrapper` is set, the caret holding ANY position inside the wrapper's subtree (not
 * just a recognized piece) also counts — an element-point selection can land on the wrapper
 * itself, a shape the piece-specific arms below don't otherwise recognize.
 */
function $isCaretAtVerseAttributeSite(
  after: LexicalNode,
  pieces: VerseAttributeRunPieces,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  const { opener, value, closer, wrapper } = pieces;
  if (wrapper && (anchorNode.is(wrapper) || $isDescendantOf(anchorNode, wrapper.getKey())))
    return true;
  if (value) return anchorNode.is(value);
  // Loose-sibling arm — removable once nothing builds loose runs: with no wrapper at all, "run
  // entirely absent" is read from the flank of `after` (the verse or a preceding closer) rather
  // than from a wrapper's own position.
  if (!opener && !closer) {
    if (anchorNode.is(after) && selection.anchor.offset === after.getTextContentSize()) return true;
    const next = after.getNextSibling();
    return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
  }
  if (!opener) return false;
  // Value missing beside a surviving opener glyph: the caret can hold the site at the closer glyph
  // OR at the end of the opener glyph's own text (where deleting only the value collapses it).
  const atOpenerEnd =
    anchorNode.is(opener) && selection.anchor.offset === opener.getTextContentSize();
  if (closer) return atOpenerEnd || anchorNode.is(closer);
  return atOpenerEnd;
}

/**
 * Heal a single marker's run (insert missing pieces, rewrite a stale value, or remove leftover
 * debris), anchored immediately after `after`. Partial mangles are repaired AROUND the surviving
 * pieces — a leftover opener/value/closer is reused in place, never duplicated (the tolerant-pieces
 * fix for the value-deletion resurrect bug). Returns the node the NEXT marker's run should anchor
 * after — `after` itself when no run exists there, else this run's closer — so `\va` and `\vp`
 * chain correctly regardless of which are present. `verse` and `after` name two different things:
 * `verse` is the run's OWNER — the identity the pended-registry check below looks up — while
 * `after` is only this call's scan/insertion ANCHOR, which for the chained `\vp` call is `\va`'s
 * closer (or `verse` itself), never the owner to check pended-ness against.
 *
 * When a wrapper is found, every insertion happens INSIDE it (a missing opener becomes the
 * wrapper's first child; a missing value/closer still `insertAfter`s the preceding piece, which
 * already lives inside the wrapper) rather than as a loose sibling of `after` — this sync never
 * CREATES a wrapper, only repairs pieces inside one that already exists. The chain anchor
 * returned to the caller prefers the wrapper itself over its closer: `\vp`'s own wrapper (if any)
 * rides directly after `\va`'s wrapper, per {@link AttributeRunNode}'s doc comment, not after a
 * piece inside it.
 */
function $syncVerseAttributeRun(
  verse: VerseNode,
  after: LexicalNode,
  marker: VerseAttributeMarker,
  value: string | undefined,
): LexicalNode {
  const pieces = $verseAttributeRunPieces(after, marker);
  const chainAnchor = pieces.wrapper ?? pieces.closer ?? after;
  if (!$verseAttributeDiverges(pieces, value)) return chainAnchor;
  // The engine holds this verse pending (a run deletion/edit detected from the destruction
  // itself, or caret-held divergence re-pended by $resolvePendingMarkers): healing now would
  // resurrect or overwrite it before caret departure settles it — mirrors
  // $syncCharAttributeDisplay's pended guard (this file).
  if ($isDisplayOwnerPended(verse)) return chainAnchor;
  // Mid-edit grace: the caret holds the run's site (inside a live value, at a just-deleted run's
  // insertion point, or beside a surviving glyph whose value was deleted). Leave it alone — the
  // marker-edit engine settles it on caret departure.
  if ($isCaretAtVerseAttributeSite(after, pieces)) return chainAnchor;
  const { opener, value: valueNode, closer, wrapper } = pieces;
  const targetText = $verseAttributeTargetText(value);
  if (targetText === undefined) {
    // No run wanted: remove whatever debris survives. A wrapper that becomes empty here is left
    // in place — a transient husk the marker-edit engine's deletion driver removes as part of
    // settling the deletion (markerEditTier1.utils.ts's $settlePendedDisplayOwner).
    opener?.remove();
    valueNode?.remove();
    closer?.remove();
    return wrapper ?? after;
  }
  // Repair around survivors, in fixed order: opener directly after `after`, then value, then
  // closer. Each found piece already sits in its correct position (the tolerant scan reads them
  // in order), so a missing one is inserted into its gap.
  const openerGlyph =
    opener ??
    (() => {
      const created = $createMarkerNode(marker, "opening");
      if (wrapper) {
        const wrapperFirstChild = wrapper.getFirstChild();
        if (wrapperFirstChild) wrapperFirstChild.insertBefore(created);
        else wrapper.append(created);
      } else {
        after.insertAfter(created);
      }
      return created;
    })();
  let workingValue = valueNode;
  if (workingValue) workingValue.setTextContent(targetText);
  else {
    workingValue = $createTextNode(targetText);
    $setState(workingValue, textTypeState, "attribute");
    openerGlyph.insertAfter(workingValue);
  }
  const closerGlyph =
    closer ??
    (() => {
      const created = $createMarkerNode(marker, "closing");
      workingValue.insertAfter(created);
      return created;
    })();
  return wrapper ?? closerGlyph;
}

/**
 * Heal `verse`'s `\va`/`\vp` display triplets to match `altnumber`/`pubnumber`: insert a missing
 * triplet, rewrite a stale one, or remove a leftover one — except while the collapsed caret sits
 * inside a triplet's value (mid-edit grace), or while the marker-edit engine holds `verse` pended
 * (a triplet destroyed by something other than this call, or caret-held divergence re-pended by
 * `$resolvePendingMarkers`) — both of which the sync leaves alone for the marker-edit engine to
 * settle on caret departure. Idempotent — writes only on change, so the registering transform
 * converges.
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
  const afterVa = $syncVerseAttributeRun(verse, verse, "va", altnumber);
  $syncVerseAttributeRun(verse, afterVa, "vp", pubnumber);
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
  const vaPieces = $verseAttributeRunPieces(verse, "va");
  if ($verseAttributeDiverges(vaPieces, altnumber) && $isCaretAtVerseAttributeSite(verse, vaPieces))
    return true;
  // A diverging \va the caret does NOT hold is not "caret-held" (it would just heal in place),
  // but that must not short-circuit the \vp check — the two runs are independent, and the
  // caret can only ever be in one of them at a time.
  const afterVa = vaPieces.wrapper ?? vaPieces.closer ?? verse;
  const vpPieces = $verseAttributeRunPieces(afterVa, "vp");
  return Boolean(
    $verseAttributeDiverges(vpPieces, pubnumber) && $isCaretAtVerseAttributeSite(afterVa, vpPieces),
  );
}

/**
 * The VerseNode whose `\va`/`\vp` SOURCE span `node` is content of, or `undefined`. A settled
 * empty run leaves a standalone `char va`/`char vp` span in the verse's run position (displayed
 * `\va \va*`); a value typed into it is an ordinary content edit that no textType tag marks, so
 * the pend decision must key on the SITE — content of a va/vp span whose sibling chain reaches
 * back to a verse over run pieces only — for departure's re-tokenize to fold the bytes onto the
 * verse (the tokenizer's attrCapture). A va/vp span NOT in a verse's run position re-tokenizes
 * to itself (fixed point) and settles nothing — pending it is harmless. Sibling walk to
 * `$verseOfAttributeGlyph` (MarkerEditPlugin.tsx): that one starts from an opening run GLYPH and
 * walks back to find the owning verse for re-sync/re-pend; this one starts from a SOURCE SPAN's
 * content text and walks back to find the owning verse for the pend decision. Both classify the
 * same run-piece shapes over the same sibling chain and must keep agreeing on what counts as one.
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
      ($isCharNode(prev) && (prev.getMarker() === "va" || prev.getMarker() === "vp"));
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
 * redirecting the cursor's starting point is the only change needed. The adaptor does not build
 * this shape yet; the sync heals whichever shape — loose siblings or an existing wrapper — is
 * actually in the tree.
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
 * pieces are missing — at the run's edit site. Mirrors {@link $isCaretAtAttributeRunBoundary}
 * (the char version), including its missing-run arm: when the run is ENTIRELY absent (a
 * just-deleted run), its insertion point is the milestone's flank — the end of the previous
 * sibling or the start of the next — where a deletion collapses the caret; without that arm the
 * sync would re-derive the run from the milestone's still-set fields the instant it was deleted
 * and the deletion would visibly undo itself. When only the attribute text is missing beside a
 * surviving opening glyph, the site is the self-closing glyph (or the end of the opening glyph's
 * own text). A missing glyph next to OTHER surviving pieces is deliberately not caret-graced —
 * inserting a missing structural glyph beside existing content cannot corrupt anything the user
 * is mid-typing, unlike overwriting the attribute text.
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
  // Loose-sibling arm — removable once nothing builds loose runs: with no wrapper at all, "run
  // entirely absent" is read from the milestone's own flanking siblings rather than from a
  // wrapper's own position.
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
 * marker-edit engine to settle on caret departure. Unlike a char span or verse, a milestone's
 * opening/self-closing glyphs are UNCONDITIONAL — only the attribute text in between comes and
 * goes with `expectedAttributeText`. Partial mangles are repaired AROUND the surviving pieces (a
 * leftover attribute text or glyph is reused in place, never duplicated). Idempotent — writes
 * only on change, so the registering transform converges.
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
  const { opening, attribute, closing, wrapper } = pieces;
  const currentText = attribute?.getTextContent() ?? "";
  // A missing self-closing glyph disqualifies the run as canonical even when the text already
  // matches: the run is not fully repaired until both glyphs are in place.
  if (opening !== undefined && closing !== undefined && currentText === expectedAttributeText)
    return;
  // The engine holds this milestone pending (a run deletion/edit detected from the destruction
  // itself, or caret-held divergence re-pended by $resolvePendingMarkers): healing now would
  // resurrect or overwrite it before caret departure settles it — mirrors
  // $syncCharAttributeDisplay's pended guard (this file).
  if ($isDisplayOwnerPended(milestone)) return;
  if ($isCaretAtMilestoneRunBoundary(milestone, pieces)) return;

  // A missing opening glyph inside an existing wrapper is inserted as the wrapper's first child,
  // not as a loose sibling of `milestone` — the sync never CREATES a wrapper, only repairs pieces
  // inside one that already exists.
  const openingGlyph =
    opening ??
    (() => {
      const created = $createMarkerNode(milestone.getMarker(), "opening");
      if (wrapper) {
        const wrapperFirstChild = wrapper.getFirstChild();
        if (wrapperFirstChild) wrapperFirstChild.insertBefore(created);
        else wrapper.append(created);
      } else {
        milestone.insertAfter(created);
      }
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
