/**
 * Tier 1 of the marker-editing engine: in-place renames that
 * keep structural node state and visible marker text in agreement at rest.
 * Everything Tier 1 cannot express routes to Tier 2 ($requestTier2ForNode).
 */

import {
  $idleSettleWouldDiscardCaretHeldBytes,
  $rebuildParas,
  $requestTier2ForNode,
  Tier2Context,
} from "./tier2Rebuild.utils";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  NodeKey,
  TextNode,
} from "lexical";
import {
  $caretHoldsRunSite,
  $isCanonicalMarkerNode,
  $isCanonicalUnmatchedNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isVerseNode,
  $chapterAltnumberRunPieces,
  $chapterPubnumberRunPieces,
  $isChapterNode,
  $milestoneAttributeRunPieces,
  $noteCategoryRunPieces,
  $openerSeparatorGapFollowingBytes,
  $ownerOfRunPiece,
  $paraPrefixSeparatorCaretHeld,
  $restoreCanonicalMarkerText,
  $runDiverges,
  $runEntirelyAbsent,
  $runNeedsOnlyWrapMigration,
  $syncDisplayRun,
  $syncOpenerSeparators,
  $verseAttributeRunPieces,
  AttributeRunNode,
  ChapterNode,
  closingMarkerText,
  displayRunDescriptors,
  getEditableCallerText,
  getVisibleOpenMarkerText,
  ImmutableUnmatchedNode,
  isMilestoneHeuristicName,
  leadingAttributeNames,
  MarkerLookup,
  MarkerNode,
  MarkerType,
  NoteNode,
  ParaNode,
  separatorRemovalTokenizesIdentically,
  textTypeState,
  VerseNode,
} from "shared";

export interface MarkerEditContext extends Tier2Context {
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
  /**
   * Paragraphs whose ENTIRE visible representation the current commit's user deletion covered —
   * armed by the delete-key command handlers from the pre-delete selection
   * (`$armWholeParaDeletion`), consumed by `$paraMarkerDeletionTransform`'s empty-paragraph
   * branch, and reset every commit by the plugin's update listener. This is the paragraph
   * equivalent of the display-run registry's `remove-owner` deletion policy: deleting every
   * displayed byte of a construct deletes the construct. It is a PROVENANCE signal — emptiness
   * alone must never reap a paragraph, because rebuilds legitimately empty one transiently.
   * Optional so contexts built without the deletion wiring (narrow test harnesses) simply never
   * reap — the guard's safe default.
   */
  wholeParaDeleteExpected?: Set<NodeKey>;
  /**
   * Paragraphs holding the COLLAPSED caret when a Backspace/Delete went down this commit —
   * armed by the same delete-key command handlers (`$armCollapsedParaDeletion`), consumed by
   * `$paraMarkerDeletionTransform`'s empty-paragraph branch alongside
   * {@link wholeParaDeleteExpected}, and reset every commit by the plugin's update listener.
   * A paragraph the user was backspacing inside that ends the commit EMPTY has had its last
   * displayed byte deleted by that gesture — the byte-by-byte completion of the same
   * whole-representation deletion the selection arm records up front, so it reaps the same
   * way. Provenance, not geometry: emptiness plus caret proximity alone must never reap —
   * only the delete-key gesture arms this, so transient rebuild emptiness (even under the
   * caret) stays untouched. Optional with the same never-reap safe default as its sibling.
   */
  collapsedDeleteCaretParas?: Set<NodeKey>;
  /**
   * Literal text already submitted to `$requestTier2ForNode` this commit.
   * `$rebuildParas` is deterministic (the degradation property): a paragraph
   * whose rebuild still contains a fragment the tokenizer cannot resolve into anything new
   * (e.g. an unterminated milestone run) reproduces the identical literal text on every
   * retry, so the TextNode catch-all transform ($textNodeTier2Transform) would otherwise
   * retrigger the same rebuild forever within one update, tripping Lexical's
   * infinite-transform guard. This is no longer about unmatched closers specifically —
   * those now resolve to an `ImmutableUnmatchedNode` (real structural progress, not
   * identical-literal reproduction) — the guard remains only for fragments that still
   * reproduce identically.
   * Reset every commit by the plugin's update listener.
   */
  rebuildAttempted: Set<string>;
}

const TERMINATED_OPENER_REGEX = /^\\(\+?[\w-]+)[ \u00A0]$/;
// Exported for the read-only settle's own mirror of $applyOpenerRename's note-glyph-rename
// decision surface (virtualSettle.utils.ts's `$noteGlyphRenameTarget`), which must recognize a
// bare pending opener rename using the identical shape this file's own transform/resolve loop
// uses \u2014 a second, independently-derived regex could silently drift out of sync with this one.
export const BARE_OPENER_REGEX = /^\\(\+?[\w-]+)$/;
const CLOSER_FORM_REGEX = /^\\\+?[\w-]*\*$/;

// Milestone-name heuristic shared with the fragment tokenizer (`isMilestoneHeuristicName`):
// only stylesheet-family milestone names (`\qt#-s/-e`, `\ts-s/-e`) plus annotation comment
// markers — see its doc comment for why bare `ts`/`t-s`/`t-e` and the z-prefix wildcard are
// deliberately excluded. Keeping one predicate here and in the tokenizer means Tier-1 kind
// guards and Tier-2 re-tokenization can never disagree about what is positionally a milestone.

/** Same-positional-kind rule for paragraph openers. Stylesheet-first:
 * a marker the effective sheet KNOWS classifies by its styleType; heuristics
 * cover only markers absent from the sheet. Unknown markers stay as typed
 * (Tier-1 renames to unknown markers stay in place). */
function isParaKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Paragraph;
  if (NoteNode.isValidMarker(clean) || isMilestoneHeuristicName(clean)) return false;
  return true;
}

/** Same-positional-kind rule for char openers (see isParaKindMarker). */
function isCharKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Character;
  if (NoteNode.isValidMarker(clean) || isMilestoneHeuristicName(clean)) return false;
  return true;
}

/** An opening glyph's leading marker name, by the tokenizer's own name-scan rule: the scan ends
 * at whitespace (or at the end of the bytes), so `\wj things` names `wj` exactly as the tokenizer
 * reads it, while `\wjthings` names the whole unknown run. Shapes the scan does not terminate
 * cleanly (a closer form, an attribute delimiter) deliberately do not match — see
 * {@link openerBytesEndTheSplit}. */
const OPENER_NAME_REGEX = /^\\(\+?[\w-]+)(?:[ \u00A0]|$)/;

/**
 * Whether an OPENING glyph's current — possibly mid-edit — bytes have stopped meaning a BLOCK
 * marker, which is the only thing an unknown-marker paragraph's split ever rested on.
 *
 * The tokenizer is the authority, so this asks its question, not a shape question: what marker do
 * these bytes name, and what kind is that marker? Three edits reach the same answer, which is why
 * they share one gate instead of accumulating one condition each:
 *
 * - the `\` deleted (`asdf`) — no marker interpretation at all, so nothing makes the line a block;
 * - the marker corrected to a known CHAR marker (`\w `, `\wj`) — inline, never a block;
 * - the separator retyped INTO the name (`\wjthings` back to `\wj things`) — the name scan ends at
 *   the space again, so the marker is `wj` and the trailing bytes are its content.
 *
 * Everything else keeps the split: a known PARAGRAPH marker is authored blockness; a marker the
 * effective stylesheet does not know stays block-shaped, because that is exactly what the
 * tokenizer's unknown-token default makes it (PT9 DetermineUnknownTokenType); and notes and
 * milestones keep their existing routing rather than gaining a rejoin they never had.
 */
function openerBytesEndTheSplit(text: string, getMarkerFn: MarkerLookup): boolean {
  if (!text.startsWith("\\")) return true;
  const name = OPENER_NAME_REGEX.exec(text)?.[1];
  if (name === undefined) return false;
  return getMarkerFn(name.replace(/^\+/, ""))?.type === MarkerType.Character;
}

/**
 * The widened Tier-2 scope that dissolves an unknown-split artifact around `glyph` —
 * `[previous, paragraph]`, so the tokenizer sees the JOINED bytes — or `undefined` when the shape
 * is not the artifact and the caller should keep its single-paragraph route.
 *
 * An unknown-marker paragraph exists ONLY because its leading marker was block-shaped (the
 * tokenizer defaults an unknown token to a paragraph in body context, PT9
 * DetermineUnknownTokenType), so its blockness is fabricated, never authored. Once the leading
 * glyph's bytes stop naming a block marker ({@link openerBytesEndTheSplit}) the split has no
 * reason left to exist, and re-tokenizing the artifact paragraph ALONE hands the tokenizer
 * leading inline-or-plain content — which fabricates a default `\p` wrapper the user never typed.
 *
 * Deliberately narrow beyond that: the paragraph's OWN marker must be unknown (a user-authored
 * `\p`/`\q1` has real blockness and keeps its own scope), the edited glyph must be the
 * paragraph's LEADING glyph (a stray opener mid-paragraph says nothing about the split), and a
 * previous sibling ParaNode must exist (with none, the degraded bytes re-tokenize alone and the
 * tokenizer's body-context default applies). A LOADED unknown paragraph (authored in the file,
 * not a split artifact) rejoins by the same rule — in the file a line without a leading marker
 * continues the previous paragraph, so the joined bytes are exactly what ParatextData would
 * parse.
 *
 * Exported because BOTH settle legs must decide this identically: the mutating settle widens its
 * rebuild here, and the read-only settle (virtualSettle.utils.ts) widens the scope it recomputes
 * into `getUsj()`'s output. A gate only the mutating leg knew about is how the save path came to
 * write a `\p` the screen never showed.
 *
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
export function $unknownSplitRejoinScope(
  glyph: MarkerNode,
  getMarkerFn: MarkerLookup,
): ParaNode[] | undefined {
  if (glyph.getMarkerSyntax() !== "opening") return undefined;
  if (!openerBytesEndTheSplit(glyph.getTextContent(), getMarkerFn)) return undefined;
  const parent = glyph.getParent();
  if (!$isParaNode(parent)) return undefined;
  const paraKind = getMarkerFn(parent.getMarker())?.type;
  if (paraKind !== undefined && paraKind !== MarkerType.Unknown) return undefined;
  if (parent.getFirstChild()?.is(glyph) !== true) return undefined;
  const previous = parent.getPreviousSibling();
  if (!$isParaNode(previous)) return undefined;
  return [previous, parent];
}

/**
 * Attempt the unknown-split artifact REJOIN for `glyph`'s paragraph — the mutating half of
 * {@link $unknownSplitRejoinScope}, which carries the gate's reasoning.
 *
 * Mutating: call inside `editor.update()` (runs from {@link $applyOpenerRename} and
 * {@link $resolvePendingMarkers}).
 *
 * @returns Whether the widened rebuild spliced. `false` — the shape is not the artifact, or the
 *   widened rebuild was refused (guard rails on the previous paragraph) — falls back to the
 *   caller's single-scope route.
 */
function $tryUnknownSplitRejoin(glyph: MarkerNode, context: MarkerEditContext): boolean {
  const scope = $unknownSplitRejoinScope(glyph, context.getMarker);
  return scope !== undefined && $rebuildParas(scope, context);
}

function $clampSelectionToLength(node: MarkerNode, newLength: number): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  [selection.anchor, selection.focus].forEach((point) => {
    if (point.key === node.getKey() && point.offset > newLength)
      point.set(node.getKey(), newLength, "text");
  });
}

/**
 * The marker NAME's span inside an opening glyph's bytes — `[start, end)` over the name that
 * follows the `\` and, on a nested glyph, its `+`. `undefined` when the bytes are not
 * opener-shaped at all.
 */
function markerNameSpan(text: string): { start: number; end: number } | undefined {
  const match = /^\\(\+?)([\w-]+)/.exec(text);
  if (!match) return undefined;
  const start = 1 + match[1].length;
  return { start, end: start + match[2].length };
}

/**
 * How far into `node`'s marker NAME the collapsed caret sits, or `undefined` when the caret is
 * not in that name at all — it is elsewhere in the document, it is a range, it sits before the
 * `\`, or it is past a terminator the user typed to END the name.
 *
 * This is the property that tells the two gestures reaching {@link $applyOpenerRename} apart. A
 * user who terminates a name has said the name is finished and has left the caret beyond it, so
 * the caret belongs in the content ({@link $moveCaretPastMarker}). A rename the SETTLE applies
 * while the caret is still inside the name is a background event the user did not ask for, and a
 * background event may not move the caret out from under them.
 *
 * Read-only: safe inside `editor.update()` or either read form. Call BEFORE the rename rewrites
 * the glyph — the offset is measured against the bytes the user is looking at.
 */
function $caretOffsetInMarkerName(node: MarkerNode): number | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  if (selection.anchor.key !== node.getKey()) return undefined;
  const span = markerNameSpan(node.getTextContent());
  if (!span) return undefined;
  const { offset } = selection.anchor;
  if (offset < span.start || offset > span.end) return undefined;
  return offset - span.start;
}

/**
 * Land the caret in the content after a rename that COMPLETED a marker name — `\s` retyped to
 * `\s1` plus the space that terminates it. That terminator is the user saying the name is
 * finished, so the caret belongs past the glyph and its separator, where the content starts.
 *
 * Only call this when the name actually changed. A space typed beside a marker that is ALREADY
 * complete renames nothing, and moving the caret there would advance it two positions for one
 * keystroke, past a separator the user did not type. See {@link $renamesTheMarkerName}.
 *
 * Mutating: call inside `editor.update()`.
 */
function $moveCaretPastMarker(node: MarkerNode): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  if (selection.anchor.key !== node.getKey()) return;
  const next = node.getNextSibling();
  // Both para trailing-space and char NBSP-prefixed content put the caret after
  // offset 1 of the following text node.
  if ($isTextNode(next)) next.select(1, 1);
  else node.select(node.getTextContentSize(), node.getTextContentSize());
}

/**
 * Where the caret goes after an in-place rename, given how far into the name it sat BEFORE that
 * rename ({@link $caretOffsetInMarkerName}).
 *
 * Caret INSIDE the name: it stays the same distance into the name, re-resolved against the
 * glyph's rewritten bytes rather than kept as a raw offset — canonicalization re-spells the
 * glyph around the name (a nested span's `+`, an absorbed terminator), so the same character
 * position is not the same offset afterwards. Caret anywhere else: the name-completion landing
 * ({@link $moveCaretPastMarker}), unchanged.
 *
 * Mutating: call inside `editor.update()`, after the rename has rewritten the glyph.
 */
function $landCaretAfterRename(node: MarkerNode, caretOffsetInName: number | undefined): void {
  if (caretOffsetInName !== undefined) {
    const latest = node.getLatest();
    const span = markerNameSpan(latest.getTextContent());
    if (span) {
      const offset = Math.min(span.start + caretOffsetInName, span.end);
      latest.select(offset, offset);
      return;
    }
  }
  $moveCaretPastMarker(node);
}

/**
 * Whether an opener rename changes the marker's NAME, as opposed to only absorbing whitespace the
 * user typed beside an already-correct one. Both spellings of the same name compare equal, so a
 * nested glyph's `+` never reads as a rename on its own.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $renamesTheMarkerName(oldMarker: string, newMarker: string): boolean {
  return oldMarker.replace(/^\+/, "") !== newMarker.replace(/^\+/, "");
}

/**
 * Tier 1's in-place rename: applies a terminated opener edit (`\s1` retyped to `\s2 `) by
 * renaming the structural parent and rewriting the glyph(s) to canonical form — para markers
 * rename the ParaNode, char/note openers also rewrite the matching closer in the same update
 * (one-way opener authority). Routes to Tier 2 instead whenever the rename cannot be expressed
 * in place: a typed `+` nest instruction, a positional-kind change, or a tree shape that breaks
 * the opener-owns-parent assumption (e.g. collab-flattened nested spans).
 *
 * Mutating: call inside `editor.update()` (runs from node transforms and
 * {@link $resolvePendingMarkers}).
 *
 * @returns Whether the editor state was mutated — a rename applied, or a routed Tier 2 rebuild
 *   that spliced (a refused rebuild mutates nothing).
 */
export function $applyOpenerRename(
  node: MarkerNode,
  newMarker: string,
  context: MarkerEditContext,
): boolean {
  // A typed `+` prefix on a NON-nested glyph is a NEST instruction, not a rename: only Tier 2
  // (re-tokenizing the visible glyph text, which now carries the `+`) can express the resulting
  // nesting. Tier 1's in-place rename would strip the `+` and silently discard the nest intent,
  // so route to Tier 2. On a glyph that is ALREADY nested, the `+` is just the glyph's own
  // canonical spelling (`\+nd` retyped to `\+wj `) — no nesting is being requested that the tree
  // doesn't already have — so it falls through to the ordinary in-place rename below, which
  // mirrors the nested closer. Routing it to Tier 2 instead re-tokenized `\+wj … \+nd*` and
  // stranded the untouched closer as unmatched.
  if (newMarker.startsWith("+") && !node.getNested()) {
    return $requestTier2ForNode(node, context);
  }
  // Read BEFORE anything mutates: both arms below rewrite the glyph, and the caret's distance
  // into the name is measured against the bytes the user typed. See {@link $landCaretAfterRename}.
  const caretOffsetInName = $caretOffsetInMarkerName(node);
  const parent = node.getParent();
  if ($isParaNode(parent)) {
    if (!isParaKindMarker(newMarker, context.getMarker)) {
      // Correcting an unknown-split artifact's marker to a CHAR-kind one removes the split's
      // only reason to exist: in the file, `\p some` + newline + `\w stuff` is ONE paragraph (a
      // newline before an inline marker is ordinary whitespace). Widen the settle scope to
      // include the PREVIOUS paragraph so re-tokenization rejoins them — the gate reads the
      // glyph's own bytes (which already carry `newMarker` on every path into this function), so
      // notes and milestones keep today's routing without a second kind check here. The shape
      // gate and the fabricated-`\p` failure mode live in {@link $unknownSplitRejoinScope}'s doc
      // comment.
      if ($tryUnknownSplitRejoin(node, context)) {
        context.logger?.debug(
          `[MarkerEdit] unknown-split paragraph rejoined its predecessor on rename to "${newMarker}"`,
        );
        return true;
      }
      return $requestTier2ForNode(node, context);
    }
    const oldParaMarker = node.getMarker();
    parent.setMarker(newMarker);
    node.setMarker(newMarker); // rewrites __text to canonical, absorbing the typed terminator
    if ($renamesTheMarkerName(oldParaMarker, newMarker))
      $landCaretAfterRename(node, caretOffsetInName);
    context.logger?.debug(`[MarkerEdit] para marker renamed to "${newMarker}"`);
    return true;
  }
  if ($isCharNode(parent) || $isNoteNode(parent)) {
    const clean = newMarker.replace(/^\+/, "");
    const isValidKind = $isCharNode(parent)
      ? isCharKindMarker(newMarker, context.getMarker)
      : NoteNode.isValidMarker(clean);
    if (!isValidKind) {
      return $requestTier2ForNode(node, context);
    }
    const oldMarker = node.getMarker();
    if (parent.getMarker() !== oldMarker) {
      // Tree shape doesn't match the simple opener-owns-parent assumption: e.g. the collab
      // delta-apply path ($createNestedChars) flattens nested char spans, so an inner opener's
      // direct parent is the outer CharNode, not an inner one. Renaming in place under that
      // assumption would target the wrong closer, so refuse and let Tier 2 rebuild proper
      // nesting from the glyph text via the tokenizer.
      return $requestTier2ForNode(node, context);
    }
    parent.setMarker(clean);
    const closer = parent
      .getChildren()
      .filter($isMarkerNode)
      .filter((child) => child.getMarkerSyntax() === "closing" && child.getMarker() === oldMarker)
      .at(-1);
    if (closer) {
      // A nested span's closer is `\+marker*`; clamp to the nested-aware length so the `+` is
      // counted (`setMarker` below re-derives the closer text from its own stored nesting).
      $clampSelectionToLength(closer, closingMarkerText(clean, closer.getNested()).length);
      closer.setMarker(clean); // same update: opener authority rewrites the closer
    }
    node.setMarker(clean);
    if ($renamesTheMarkerName(oldMarker, clean)) $landCaretAfterRename(node, caretOffsetInName);
    context.logger?.debug(`[MarkerEdit] ${parent.getType()} marker renamed to "${clean}"`);
    return true;
  }
  return $requestTier2ForNode(node, context);
}

/**
 * Whether the live selection touches `glyph`'s own edit surface — the glyph's text, either of its
 * flanking caret sites (the end of the previous sibling / the start of the next, where a
 * boundary-crossing Backspace/Delete leaves the caret), an element point on its parent at or just
 * past its own index (where a range deletion can collapse), or anywhere inside a non-collapsed
 * range that covers the glyph. Generous on purpose: a false negative only defers a machine-drift
 * heal to the pend/settle path (today's behavior), while a false positive would heal against a
 * live user edit — the one outcome the invariants forbid.
 *
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
function $markerGlyphCaretHeld(glyph: MarkerNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const points = selection.isCollapsed() ? [selection.anchor] : [selection.anchor, selection.focus];
  for (const point of points) {
    const pointNode = point.getNode();
    if (pointNode.is(glyph)) return true;
    const previous = glyph.getPreviousSibling();
    if (
      previous !== null &&
      pointNode.is(previous) &&
      point.offset === previous.getTextContentSize()
    )
      return true;
    const next = glyph.getNextSibling();
    if (next !== null && pointNode.is(next) && point.offset === 0) return true;
    const parent = glyph.getParent();
    if (parent !== null && pointNode.is(parent)) {
      const index = glyph.getIndexWithinParent();
      if (point.offset === index || point.offset === index + 1) return true;
    }
  }
  if (!selection.isCollapsed() && selection.getNodes().some((selected) => selected.is(glyph)))
    return true;
  return false;
}

export function $markerNodeTransform(node: MarkerNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if ($isCanonicalMarkerNode(node)) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  // Heal-by-provenance: a divergence that is NOT in the pend ledger and whose
  // edit surface the caret does not touch cannot be a user typing gesture — glyph bytes are
  // engine-rendered display, and every user path that edits them does so at the caret, inside the
  // very update this transform runs in. Machine drift (a transform bug, a stray programmatic
  // write, a pasted damaged glyph) heals in place; everything else keeps the pend/settle path
  // below (never heal against a user edit). The ledger half is what carries provenance ACROSS
  // commits: a user's mid-edit pend survives caret departure windows and undo restores
  // (`$rependPendShapedNodes`), so a later machine re-dirtying of that same glyph must not
  // resurrect the canonical bytes out from under the user's recorded edit. This is the
  // caret-at-edit-time gate `$healMarkerTrailingSeparator` uses, not the forbidden
  // heal-later-by-caret-proximity heuristic.
  if (!context.pendingKeys.has(node.getKey()) && !$markerGlyphCaretHeld(node)) {
    $restoreCanonicalMarkerText(node);
    context.logger?.debug(
      `[MarkerEdit] healed machine-drifted glyph bytes back to "${node.getTextContent()}"`,
    );
    return;
  }
  if (node.getMarkerSyntax() === "opening") {
    const terminated = TERMINATED_OPENER_REGEX.exec(text);
    if (terminated) {
      context.pendingKeys.delete(node.getKey());
      $applyOpenerRename(node, terminated[1], context);
      return;
    }
    if (CLOSER_FORM_REGEX.test(text)) {
      // Opener retyped into closer form: positional kind changed -> Tier 2.
      context.pendingKeys.delete(node.getKey());
      $requestTier2ForNode(node, context);
      return;
    }
    context.pendingKeys.add(node.getKey());
    return;
  }
  // Text typed at the very END of an intact char-span closer merges into the glyph (`\nd*x`).
  // The name scan ends at the `*`, so those bytes re-tokenize as the canonical closer plus plain
  // text after the span — an in-place split is re-tokenization identity (Invariant I's one
  // sanctioned optimization), applied immediately so the typed character never rides styled
  // inside the span until a departure settles it. Same shape as $verseNodeTransform's rest
  // split. Scoped to the span's OWN last-child closer; every other closer divergence (damage,
  // retype, run closers) pends below.
  if (node.getMarkerSyntax() === "closing") {
    const parent = node.getParent();
    const canonical = closingMarkerText(node.getMarker(), node.getNested());
    if (
      $isCharNode(parent) &&
      node.getMarker() === parent.getMarker() &&
      parent.getLastChild()?.is(node) &&
      text.startsWith(canonical) &&
      text.length > canonical.length
    ) {
      const selection = $getSelection();
      const caretOffset =
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.key === node.getKey() &&
        selection.anchor.offset > canonical.length
          ? selection.anchor.offset - canonical.length
          : undefined;
      const rest = $createTextNode(text.slice(canonical.length));
      node.setTextContent(canonical);
      parent.insertAfter(rest);
      if (caretOffset !== undefined) rest.select(caretOffset, caretOffset);
      context.pendingKeys.delete(node.getKey());
      return;
    }
  }
  // Closer / selfClosing: one-way authority — closer edits never rename the span. Damage or
  // retype ALWAYS pends and settles through Tier 2 on caret departure/Enter/blur
  // ($resolvePendingMarkers), never in the editing commit. An opener has a genuine completion
  // gesture (the typed trailing separator) to resolve on; a closer has none — its trailing `*` is
  // still there through every mid-glyph edit, so a `*`-terminated form is evidence of nothing.
  // Resolving on it re-tokenized the span out from under the caret on the FIRST keystroke,
  // leaving the retyped closer unmatched — and, as a decorator, uneditable — with the caret
  // ejected. The settle's tokenizer turns non-marker residue (`wj*` after the `\` is deleted)
  // into PLAIN text and re-closes the span per its rules. A char span the user leaves open
  // re-closes WITHOUT a regenerated `\marker*` glyph: the tokenizer marks every
  // implicitly-closed span `closed="false"` (ParatextData emits it whenever a char span has no
  // explicit closer — see paranext-core's footnote-util test USJ), and the adaptor skips the
  // closing glyph for such spans, exactly as it does for auto-closed notes.
  context.pendingKeys.add(node.getKey());
}

/**
 * Pend/settle for an unmatched marker's editable bytes, mirroring the closer arm of
 * {@link $markerNodeTransform}: at rest the node consumes its pend; every byte deleted deletes
 * the construct outright (displayed bytes win); anything else is a mid-edit divergence that
 * pends and settles through Tier 2 on caret departure/Enter/blur \u2014 where the bytes flow into the
 * fragment as text and the tokenizer decides what, if anything, they now close.
 *
 * Mutating: call inside `editor.update()` (runs from MarkerEditPlugin's node transform).
 */
export function $unmatchedNodeTransform(
  node: ImmutableUnmatchedNode,
  context: MarkerEditContext,
): void {
  if (node.getTextContent() === "") {
    context.pendingKeys.delete(node.getKey());
    node.remove();
    return;
  }
  if ($isCanonicalUnmatchedNode(node)) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  context.pendingKeys.add(node.getKey());
}

/**
 * Glyph-shape regexes for a marker the markers map declares a leading attribute for. The map
 * (`leadingAttributeNames`, `shared`, vendored from paranext-core's markers map), not this file,
 * decides WHICH markers get the leading-attribute treatment \u2014 whitespace between the marker and
 * the value is structural and collapses, and the value retags to the typed word \u2014 so `\v`'s and
 * `\c`'s number arms below carry no per-marker knowledge of their own. The regexes are only the
 * TOKENIZATION of "word" beside that declaration, the same word scan the fragment tokenizer's
 * `getNextWord` applies. Throws for a marker the map declares nothing for, so an arm can never
 * be compiled by accident for a marker whose leading whitespace is NOT structural.
 */
function leadingAttributeGlyphRegexes(marker: string): {
  valueAndRest: RegExp;
  markerRest: RegExp;
  midEdit: RegExp;
  valueTerminated: RegExp;
} {
  if (!leadingAttributeNames(marker)?.length)
    throw new Error(`marker "${marker}" declares no leading attributes in the markers map`);
  return {
    // `\m`, separator, value word, then either nothing-yet (unterminated), or a
    // separator plus optional trailing text the user typed inside the node.
    valueAndRest: new RegExp(`^\\\\${marker}[ \u00A0]+([^ \u00A0\\\\]+)(?:[ \u00A0]([\\s\\S]*))?$`),
    // Value word followed DIRECTLY by a `\`-initiated rest, no separator between: `\` is one of
    // the tokenizer's name-scan terminators, so it ends the value's word where an ordinary
    // character would extend it (`\v 1a`). Typed between the value and the glyph's display space
    // (`\v 1\ `), the rest \u2014 backslash plus whatever followed it in the glyph, including that
    // space, which stops being value-adjacent display and becomes content \u2014 extracts to a plain
    // sibling exactly like valueAndRest's separated rest. Without this arm the shape fell
    // through to a whole-paragraph Tier-2 rebuild that produced the SAME tree but lost the caret
    // (observed at the paragraph start, three words from the typed character).
    markerRest: new RegExp(`^(\\\\${marker}[ \u00A0]+([^ \u00A0\\\\]+))(\\\\[\\s\\S]*)$`),
    // The marker with its value not yet typed (mid-edit).
    midEdit: new RegExp(`^\\\\${marker}[ \u00A0]*$`),
    // Value word followed by NOTHING but a terminating separator run (the chapter arm's shape).
    // End-anchored on purpose: bytes past the separator (`\c 1 \ca 5\ca*`) mean the glyph holds
    // more than a retagged number, and the immediate canonical rewrite would DELETE them \u2014 no
    // pend, no settle, no undo entry. Those shapes stay literal instead and settle through the
    // chapter-scoped rebuild on caret departure, whose tokenizer re-homes them (attrCapture
    // folds `\ca`/`\cp` onto the chapter).
    valueTerminated: new RegExp(`^\\\\${marker}[ \u00A0]+([^ \u00A0\\\\]+)[ \u00A0]+$`),
  };
}

const VERSE_GLYPH_REGEXES = leadingAttributeGlyphRegexes("v");
const CHAPTER_GLYPH_REGEXES = leadingAttributeGlyphRegexes("c");

/**
 * Bytes made of nothing but the whitespace a separator run is built from — the same alphabet the
 * glyph regexes above spend on their separators. A glyph whose only divergence from canonical is
 * bytes matching this is one the user typed a space into, not one whose value or content changed.
 */
const SEPARATOR_RUN_ONLY_REGEX = /^[ \u00A0]*$/;

/**
 * Insert `rest` — bytes extracted out of a verse glyph — as plain content directly after the
 * verse, merging into an existing following plain content node rather than always inserting a
 * fresh one. A fresh node fragments a literal the user is mid-typing across siblings — the
 * live failure: `\` typed at the verse's end split out alone, the next keystroke landed in
 * yet another node, and the resolve's caret shield (which covers the caret's contiguous
 * run) had nothing contiguous to cover, so `\vbut…` glued together in the rebuild fragment
 * and settled as a terminated unknown marker mid-word. Only an ordinary content node
 * qualifies: never a glyph (exact-type check), a token (the para-prefix separator), or an
 * attribute-run value riding beside the verse. Shared by BOTH extraction arms of
 * {@link $verseNodeTransform} so the merge behavior cannot drift between them.
 *
 * `caretOffsetInRest` places the collapsed caret at that offset within the inserted rest
 * (clamped to the rest by the callers); `undefined` leaves the selection untouched (a
 * programmatic edit with no caret in the glyph).
 *
 * Mutating: call inside `editor.update()` (runs from {@link $verseNodeTransform}).
 */
function $insertRestAfterVerse(
  node: VerseNode,
  rest: string,
  caretOffsetInRest: number | undefined,
): void {
  const next = node.getNextSibling();
  if (
    $isTextNode(next) &&
    next.getType() === TextNode.getType() &&
    next.getMode() === "normal" &&
    $getState(next, textTypeState) !== "attribute"
  ) {
    next.setTextContent(rest + next.getTextContent());
    if (caretOffsetInRest !== undefined) next.select(caretOffsetInRest, caretOffsetInRest);
    return;
  }
  const restNode = $createTextNode(rest);
  node.insertAfter(restNode);
  if (caretOffsetInRest !== undefined) restNode.select(caretOffsetInRest, caretOffsetInRest);
}

export function $verseNodeTransform(node: VerseNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const expected = getVisibleOpenMarkerText("v", node.getNumber());
  if (text === expected) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (VERSE_GLYPH_REGEXES.midEdit.test(text)) {
    // number mid-edit; keep the stored number as the serialization fallback
    context.pendingKeys.add(node.getKey());
    return;
  }
  const match = VERSE_GLYPH_REGEXES.valueAndRest.exec(text);
  if (!match) {
    const markerRest = VERSE_GLYPH_REGEXES.markerRest.exec(text);
    if (markerRest) {
      // Extract the `\`-initiated rest as content, keeping the caret on the character the user
      // just typed: a caret inside the rest maps to its same character in the extracted node;
      // a caret elsewhere (or none — a programmatic edit) is left untouched.
      const [, prefix, numberToken, rest] = markerRest;
      const selection = $getSelection();
      const caretOffset =
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.key === node.getKey()
          ? selection.anchor.offset
          : undefined;
      context.pendingKeys.delete(node.getKey());
      node.setNumber(numberToken); // PT9 GetNextWord: whole word, valid or not
      node.setTextContent(getVisibleOpenMarkerText("v", numberToken));
      // A caret inside the rest maps to its same character in the extracted bytes; a caret
      // elsewhere (or none — a programmatic edit) is left untouched.
      const target =
        caretOffset !== undefined && caretOffset >= prefix.length
          ? Math.min(caretOffset - prefix.length, rest.length)
          : undefined;
      $insertRestAfterVerse(node, rest, target);
      return;
    }
    // `\v` prefix broken: PT9 re-tokenizes and the token becomes plain text
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context);
    return;
  }
  const [, numberToken, rest] = match;
  if (rest === undefined && !/[ \u00A0]$/.test(text)) {
    context.pendingKeys.add(node.getKey()); // e.g. `\v 12` while typing the number
    return;
  }
  context.pendingKeys.delete(node.getKey());
  // A whitespace-only `rest` with the number unchanged means the glyph diverges from canonical
  // ONLY by whitespace inside its separator runs — the user typed a space beside the marker,
  // beside the number, or past the separator that follows it. Leave those bytes alone. Rewriting
  // to canonical here deleted the typed space while the caret advanced over where it had been, so
  // pressing space looked like it merely moved the cursor: a keystroke accepted and discarded,
  // which "no silent no-ops" forbids. Nothing reaches the document either way — whitespace
  // flanking a leading-attribute value is structural and the writer emits exactly one space —
  // which is the same licence a trailing space at the end of a paragraph already has.
  //
  // The check is the whole separator RUN, not an empty `rest`, because the glyph's TRAILING
  // separator is a run exactly as its leading one is: the regex spends one whitespace byte on
  // that separator and hands the remainder over as `rest`, so a space typed anywhere past the
  // number arrives here as whitespace-only `rest`. Extracting it re-homed it as document CONTENT
  // after the verse, which beside a verse carrying a `\va`/`\vp` run is a place content cannot
  // live, so the next rebuild dropped it. Only a NON-whitespace byte past the number is content,
  // and that still extracts.
  if (numberToken === node.getNumber() && SEPARATOR_RUN_ONLY_REGEX.test(rest ?? "")) return;
  node.setNumber(numberToken); // PT9 GetNextWord: whole word, valid or not
  node.setTextContent(getVisibleOpenMarkerText("v", numberToken));
  // The caret follows to the end of the extracted rest (see $insertRestAfterVerse for the
  // merge-into-following behavior both arms share).
  if (rest) $insertRestAfterVerse(node, rest, rest.length);
}

// An expanded note's editable caller text: whitespace run, caller word, whitespace run
// (canonical: one space, the caller, one NBSP — getEditableCallerText). The tokenization of
// "word" beside the map's caller declaration, exactly as the verse regexes tokenize the number.
const NOTE_CALLER_TEXT_REGEX = /^[ \u00A0]+([^ \u00A0\\]+)[ \u00A0]+$/;

/**
 * Tier-1 arm for an expanded note's editable caller text — the note-marker family's leading
 * attribute (the markers map declares `caller` on `f`/`fe`/`ef`/`efe`/`x`/`ex`;
 * `leadingAttributeNames`, `shared`) — giving the caller the same one-rule treatment as a
 * verse's number: whitespace between the marker and the value is structural and collapses, so
 * an extra typed space cannot demote the caller (`\f  +` is still caller `+`), and the caller
 * RETAGS to the typed word (PT9 GetNextWord: whole word, valid or not) exactly as `\v 1a`
 * retags the number. Without this arm the edited bytes were unreachable by any settle: nothing
 * pended them, the note-scoped rebuild refuses a non-canonical caller shape outright
 * (`$buildNoteFragment`), and serialization leaked the whole diverged caller text into note
 * content (the reverse adaptor only drops a byte-exact caller).
 *
 * Scope-guarded to shapes with BOTH flanking whitespace runs still present: a deleted flanking
 * separator is separator-deletion territory (the tokenize-identity rule), not whitespace
 * collapse, and falls through to the existing machinery untouched. Collapsed notes never reach
 * this arm — their caller is an atomic `ImmutableNoteCallerNode`, not editable text.
 *
 * Mutating: call inside `editor.update()` (runs from the TextNode catch-all transform,
 * `$textNodeTier2Transform`).
 *
 * @returns Whether `node` is an expanded note's caller-slot text and this arm consumed the
 *   edit (including the nothing-to-do canonical case).
 */
export function $noteCallerTextTransform(node: TextNode, context: MarkerEditContext): boolean {
  const note = node.getParent();
  if (!$isNoteNode(note) || note.getIsCollapsed() !== false) return false;
  // The map, never a local list, decides which note markers carry a leading caller.
  if (!leadingAttributeNames(note.getMarker())?.includes("caller")) return false;
  // The caller slot: the first child after the opening glyph(s) — the same scan
  // $buildNoteFragment uses to find it.
  const children = note.getChildren();
  let slot = 0;
  while (slot < children.length) {
    const child = children[slot];
    if (!$isMarkerNode(child) || child.getMarkerSyntax() !== "opening") break;
    slot++;
  }
  if (!node.is(children[slot])) return false;
  const text = node.getTextContent();
  if (text === getEditableCallerText(note.getCaller())) {
    context.pendingKeys.delete(node.getKey());
    return true;
  }
  const match = NOTE_CALLER_TEXT_REGEX.exec(text);
  if (!match) return false; // other damage keeps today's behavior (literal machinery)
  const [, caller] = match;
  context.pendingKeys.delete(node.getKey());
  note.setCaller(caller); // PT9 GetNextWord: whole word, valid or not
  node.setTextContent(getEditableCallerText(caller));
  return true;
}

// Unlike its sibling node-transform functions, a chapter marker never enters the pending/deferred
// machinery MarkerEditContext tracks (deleting it removes the node outright; retagging its number
// is a same-tick rewrite) — so it takes no context parameter, and its call site passes only `node`.
export function $chapterNodeTransform(node: ChapterNode): void {
  if (node.getChildrenSize() === 0) {
    node.remove(); // deleting the chapter marker deletes it
    return;
  }
  const textNode = node.getFirstChild();
  if (!$isTextNode(textNode)) return;
  const expected = getVisibleOpenMarkerText("c", node.getNumber());
  const text = textNode.getTextContent();
  if (text === expected) return;
  const match = CHAPTER_GLYPH_REGEXES.valueTerminated.exec(text);
  if (!match) return; // leave literal; serialization falls back to the stored number
  node.setNumber(match[1]);
  textNode.setTextContent(getVisibleOpenMarkerText("c", match[1]));
}

/**
 * Every currently-attached but EMPTY `AttributeRunNode` wrapper riding on `node` (a verse's `\va`
 * and/or `\vp` wrapper, a milestone's single wrapper, a note's `\cat` wrapper, or a chapter's
 * `\ca`/`\cp` wrappers) — every piece of that wrapper's run was deleted, leaving a transient
 * husk with nothing left to display (see {@link AttributeRunNode}'s own doc comment). A verse or
 * a chapter can carry up to two independent husks; a milestone or note at most one.
 */
function $emptyAttributeRunWrappers(node: LexicalNode): AttributeRunNode[] {
  if ($isMilestoneNode(node)) {
    const { wrapper } = $milestoneAttributeRunPieces(node);
    return wrapper && wrapper.getChildrenSize() === 0 ? [wrapper] : [];
  }
  if ($isNoteNode(node)) {
    const { wrapper } = $noteCategoryRunPieces(node);
    return wrapper && wrapper.getChildrenSize() === 0 ? [wrapper] : [];
  }
  if ($isChapterNode(node)) {
    const husks: AttributeRunNode[] = [];
    const ca = $chapterAltnumberRunPieces(node);
    if (ca.wrapper && ca.wrapper.getChildrenSize() === 0) husks.push(ca.wrapper);
    const cp = $chapterPubnumberRunPieces(node);
    if (cp.wrapper && cp.wrapper.getChildrenSize() === 0) husks.push(cp.wrapper);
    return husks;
  }
  if ($isVerseNode(node)) {
    const husks: AttributeRunNode[] = [];
    const vaPieces = $verseAttributeRunPieces(node, "va");
    if (vaPieces.wrapper && vaPieces.wrapper.getChildrenSize() === 0) husks.push(vaPieces.wrapper);
    const afterVa = vaPieces.wrapper ?? vaPieces.closer ?? node;
    const vpPieces = $verseAttributeRunPieces(afterVa, "vp");
    if (vpPieces.wrapper && vpPieces.wrapper.getChildrenSize() === 0) husks.push(vpPieces.wrapper);
    return husks;
  }
  return [];
}

/**
 * Whether the collapsed caret sits ON one of `node`'s emptied `AttributeRunNode` husks — the
 * element point Lexical collapses the caret to when the user deletes a run's every byte. This is
 * the ONE caret shape whose settle cannot preserve the caret: the husk is the caret's own node,
 * so settling destroys it, and no adjacent position survives the settle either — the Tier-2
 * rebuild cannot map an element point onto a rebuilt text offset (the caret-dump-to-paragraph-
 * start bug the grace pre-pass below documents), and pre-parking the caret on a neighboring
 * text node was observed to lose it anyway to a follow-on selection re-resolution one commit
 * later. Read-only: call inside a read or update.
 */
function $caretOnEmptyHuskOf(node: LexicalNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  return $emptyAttributeRunWrappers(node).some((wrapper) => anchorNode.is(wrapper));
}

/**
 * Which clock asked for a settle pass. `"departure"` — the caret-departure microtask, Enter,
 * blur, and forced commits: the caret-POSITION grace arms hold, so a site the caret still sits
 * in re-pends untouched and settles later. `"idle"` — the idle debounce expiry (PT9's
 * debounced-reformat tick): the user has genuinely idled, so caret position grants no grace and
 * even held sites settle in place. Distinct from the except-KEY shield, which protects the
 * caret's own node by identity and is decided by the caller.
 *
 * One carve-out survives even an idle settle: a caret parked ON an emptied wrapper husk
 * ({@link $caretOnEmptyHuskOf}) keeps its grace, because that settle would destroy the caret's
 * own node and no caret-preservation strategy for it has held up — see the helper's doc comment.
 */
export type SettleReason = "departure" | "idle";

/**
 * The uniform deletion/pend settle for display-run OWNERS — the one place every kind's
 * grace-or-settle decision and entirely-absent deletion policy lives, driven entirely by the
 * registry. Marker literals and plain pending text own no run and fall through (`handled: false`)
 * to the caller's re-tokenize arm.
 *
 * `mutated` is meaningful on both SETTLING result paths: an emptied `AttributeRunNode` husk removed
 * here, or a loose-but-canonical run migrated into its wrapper, is a visible change even when the
 * caller's own re-tokenize then refuses at a fixed point — a settle pass that reports mutating
 * nothing has its commit merged into the previous history entry. The GRACE return is the exception
 * and always reports `mutated: false`: every write this function can make now lives after the grace
 * pre-pass (see below), so a graced owner is by construction one nothing has touched.
 */
export function $settlePendedDisplayOwner(
  node: LexicalNode,
  context: MarkerEditContext,
  settleReason: SettleReason = "departure",
): { handled: boolean; mutated: boolean } {
  let mutated = false;
  // Every caret-position grace arm below holds only for a "departure" settle: an idle expiry
  // (PT9's debounced-reformat tick) means the user has genuinely stopped, so the caret sitting
  // at a held site is no longer evidence of a gesture in progress — the site settles in place,
  // caret and all, exactly as PT9's reformat does (see SettleReason).
  const graceHolds = settleReason === "departure";
  // Para-prefix separator grace, the same contract as the descriptor pre-pass below but for a
  // pended PARAGRAPH (paras match no display-run descriptor): while the collapsed caret still
  // holds the deleted separator's site, settling would re-tokenize the paragraph out from under
  // the caret mid-gesture. Re-pend untouched; it settles once the caret has actually departed —
  // the deletion transform's own grace ($healMarkerTrailingSeparator) is what pended it.
  if (graceHolds && $isParaNode(node) && $paraPrefixSeparatorCaretHeld(node)) {
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: false };
  }
  // Grace PRE-PASS: every descriptor matching this node is checked for a caret-held run BEFORE any
  // settle action runs for ANY of them — a standing contract, not an artifact of iteration order. A
  // verse's `\va`/`\vp` are two INDEPENDENT runs sharing one pended owner identity; if `\va` rides
  // loose-but-canonical (needing only a wrap migration) while the caret is actively mid-edit inside
  // `\vp`'s value, migrating `\va` first would move three nodes beside a live caret — a DOM mutation
  // under the user's mid-typing selection — before this same pass ever discovers `\vp` must re-pend
  // the whole owner untouched. Checking every matching descriptor's grace to completion FIRST, and
  // only then running any migration/deletion, guarantees a caret-held owner is re-pended with
  // NOTHING moved, regardless of which sibling kind's turn would otherwise come first.
  //
  // The emptied-wrapper husk cleanup below is INSIDE that "nothing moved" guarantee, which is why
  // it no longer runs ahead of this loop: deleting a run's every byte collapses the caret onto the
  // emptied wrapper itself (an ELEMENT point on the husk — where the run used to be, which is
  // exactly where the user expects to keep typing). Removing the husk first destroyed the caret's
  // own node, Lexical relocated the point to the PREVIOUS run's wrapper, and the grace arms —
  // which recognize the run's insertion site, not an arbitrary element point on a sibling — then
  // saw nothing caret-held and re-tokenized the whole paragraph mid-gesture. The rebuild cannot map
  // an element point onto a rebuilt text offset, so it dumped the caret at the paragraph START
  // (the live bug: deleting a `\vp` run, by selection or by backspacing it away one character at a
  // time, sent the caret to the top of the verse). Graced, the husk simply survives until the caret
  // genuinely departs, and the settle removes it then.
  for (const descriptor of displayRunDescriptors) {
    if (descriptor.settleScope === "none") continue;
    if (!descriptor.ownerPredicate(node)) continue;
    if (!$caretHoldsRunSite(descriptor, node)) continue;
    // On an idle settle only the husk shape keeps its grace — the one caret-held shape whose
    // settle destroys the caret's own node (see SettleReason's carve-out and
    // $caretOnEmptyHuskOf). Every other held site settles on the idle tick.
    if (graceHolds || $caretOnEmptyHuskOf(node)) {
      // Mid-edit grace: settling now would rewrite or re-tokenize the run out from under the
      // caret. It settles once the caret has actually departed. `mutated: false` literally, not
      // `mutated`: nothing this function writes can have run yet at this point, and stating that
      // keeps the guarantee readable rather than dependent on where the husk loop happens to sit.
      context.pendingKeys.add(node.getKey());
      return { handled: true, mutated: false };
    }
  }
  // An emptied wrapper left attached to a verse or milestone is undead scaffolding with nothing
  // left to display. Removed as a side effect, not an early return, so the OWNER's own policy
  // below still runs against the cleaned-up tree in the SAME pass: ownership is position-derived,
  // so a wrapper orphaned by its owner's removal could never be cleaned up by anything else.
  for (const wrapper of $emptyAttributeRunWrappers(node)) {
    wrapper.remove();
    mutated = true;
  }
  // Tokenize-identity routing for a deleted opener separator: restore the engine-owned byte iff
  // the displayed bytes tokenize IDENTICALLY without it. When they do (`\nd` before `\`, `|`, or
  // more whitespace), the deletion cannot mean anything and the O(1) in-place heal settles it —
  // no paragraph rebuild. When they do not (`\ndthings` renames the marker; `\nd*` is a closing
  // marker the user is entitled to), the gap is left for the re-tokenize fallback below, where
  // the displayed bytes win. The predicate lives beside the tokenizer's own name scan
  // (usfmFragmentToUsj.ts) so the two can never drift.
  let separatorHealed = false;
  if ($isCharNode(node)) {
    const gapBytes = $openerSeparatorGapFollowingBytes(node);
    if (gapBytes !== undefined && separatorRemovalTokenizesIdentically(gapBytes)) {
      $syncOpenerSeparators(node);
      separatorHealed = true;
      mutated = true;
    }
  }
  let handled = false;
  // A verse's `\va`/`\vp` pair and a milestone's single run both migrate loose-but-canonical bytes
  // into their wrapper here (via the same $syncDisplayRun driver construction/edits use) rather
  // than falling through to Tier 2, which would always REFUSE a wrap-only change: an
  // AttributeRunNode wrapper carries no bytes of its own, so the rebuilt signature is
  // byte-identical to what is already displayed, leaving the run loose forever with nothing else
  // to re-drive it — the exact gap the migration-pend behavior exists to close.
  //
  // Whether migrating settles the OWNER is decided only after every descriptor matching this node
  // has been visited, never on the migrating descriptor's own turn: a verse's two runs are
  // independent, so `\vp` migrating must never short-circuit past `\va`'s still-unresolved genuine
  // divergence (e.g. a run destroyed by something else in a separate commit, which the sync's own
  // destruction detection cannot see once this owner is already pended — the mutation would stay
  // silently stale until an unrelated future edit dirties the verse again). Falling through to the
  // Tier-2 re-tokenize below for that remaining divergence, even after a sibling kind migrated,
  // gets both duties done in one settle pass. A milestone has only one matching descriptor, so the
  // same deferred decision resolves after its single visit — equivalent to migrating and returning
  // outright.
  //
  // No grace check runs in THIS loop: the pre-pass above already established that no matching
  // descriptor is caret-held, over the tree as it stood before any action here — every write below
  // is therefore safe to perform unconditionally.
  let migrated = false;
  let hasGenuineDivergence = false;
  for (const descriptor of displayRunDescriptors) {
    if (descriptor.settleScope === "none") continue;
    if (!descriptor.ownerPredicate(node)) continue;
    if ($runNeedsOnlyWrapMigration(descriptor, node)) {
      $syncDisplayRun(descriptor, node);
      migrated = true;
      mutated = true; // a real structural write even when a sibling kind's divergence keeps this
      // owner from being reported "handled" below (see the deferred-decision comment above).
      continue;
    }
    if (descriptor.deletionPolicy === "none") {
      // Nothing to settle, but the owner must still be reported as handled so the caller's
      // re-tokenize fallback never routes it anywhere.
      handled = true;
      continue;
    }
    if (descriptor.deletionPolicy === "remove-owner" && $runEntirelyAbsent(descriptor, node)) {
      // The display run is this owner's ENTIRE visible byte representation, so deleting all of it
      // deletes the owner — displayed bytes win, exactly as deleting every byte of any other
      // construct removes it. Guarded to the fully-absent shape: a partial mangle falls through
      // and re-tokenizes instead. (An emptied wrapper husk was already removed above, so this
      // correctly still fires for it.) Any flanking significant bytes are untouched: `node.remove()`
      // touches only this node, never its siblings.
      node.remove();
      return { handled: true, mutated: true };
    }
    if ($runDiverges(descriptor, descriptor.scanPieces(node), descriptor.expectedPieces(node)))
      hasGenuineDivergence = true;
  }
  if ((migrated || separatorHealed) && !hasGenuineDivergence) return { handled: true, mutated };
  // `handled: false` here regardless of `mutated`: the caller no longer discards `mutated` on this
  // path (see `$resolvePendingMarkers`) — it still falls through to its own re-tokenize arm
  // ($requestTier2ForNode), the existing, already-safe default for an owner whose pend wasn't (or
  // is no longer, post-husk-cleanup/post-migration) a recognized settle shape. Routing through it
  // here too, rather than reporting "handled" and stopping, keeps e.g. a verse's own
  // altnumber/pubnumber able to re-derive a fresh (loose) run on the same pass if a husk was
  // cleared out from under a value that is still wanted — `wrapper.remove()` alone does not dirty
  // the VerseNode, so nothing else would otherwise re-trigger its sync.
  return { handled, mutated };
}

/** Whether `node` is ordinary plain content text — the kind a mid-typing literal run is made of:
 * exact TextNode (glyph subclasses excluded), normal mode (the token para-prefix separator
 * excluded), and not an attribute-run value. */
function $isPlainContentText(node: LexicalNode): node is TextNode {
  return (
    $isTextNode(node) &&
    node.getType() === TextNode.getType() &&
    node.getMode() === "normal" &&
    $getState(node, textTypeState) !== "attribute"
  );
}

/**
 * The caret shield as a SET: `exceptKey` plus every plain content-text sibling contiguous with
 * it. A literal the user is mid-typing is not guaranteed to be one node — the verse-split path
 * (and any boundary-point insertion) can leave `\` and the just-typed `v` as separate siblings —
 * and a shield that protects only the caret's own node then reads the rest of the run as
 * "departed" and settles it mid-word (the live `\vbut…` unknown-paragraph split). Contiguity is
 * the boundary: anything that is not plain content text (a glyph, the token separator, an
 * attribute value, an element) ends the run, so pends beyond it still settle on genuine
 * departure exactly as before.
 */
function $exceptKeysAround(exceptKey: NodeKey | undefined): Set<NodeKey> {
  const keys = new Set<NodeKey>();
  if (exceptKey === undefined) return keys;
  keys.add(exceptKey);
  const exceptNode = $getNodeByKey(exceptKey);
  if (!exceptNode?.isAttached()) return keys;
  for (
    let sibling = exceptNode.getPreviousSibling();
    sibling && $isPlainContentText(sibling);
    sibling = sibling.getPreviousSibling()
  )
    keys.add(sibling.getKey());
  for (
    let sibling = exceptNode.getNextSibling();
    sibling && $isPlainContentText(sibling);
    sibling = sibling.getNextSibling()
  )
    keys.add(sibling.getKey());
  return keys;
}

/**
 * Completion trigger. PT9 completes mid-edit markers via its 1s debounced
 * reformat; our deterministic equivalents are Enter, blur, and the caret
 * leaving the node (`exceptKey` keeps the node still being edited pending — widened to the
 * caret's contiguous plain-text run, see {@link $exceptKeysAround}), plus the idle debounce
 * clock itself. `settleReason` says which clock is asking: `"idle"` additionally drops the
 * caret-POSITION grace arms in {@link $settlePendedDisplayOwner}, so a site the caret still
 * holds settles in place on the idle tick — see {@link SettleReason}. Departure-style callers
 * omit it and keep every grace exactly as before.
 *
 * Mutating (settles pending nodes via {@link $applyOpenerRename} / Tier 2 rebuilds): call inside
 * `editor.update()` — never synchronously from an update/mutation listener.
 *
 * @returns Whether anything actually MUTATED the editor state. A pass that only consumed
 *   keys and REFUSED every routed rebuild (fixed points) mutates nothing at all — a refused
 *   probe compares signatures on the SERIALIZED rebuild and materializes no live nodes, so
 *   the containing update is a genuine no-op commit. The deferred-resolution caller uses this
 *   to merge a mutating settle into the current history entry instead of letting it push a
 *   phantom undo step.
 */
export function $resolvePendingMarkers(
  context: MarkerEditContext,
  exceptKey?: NodeKey,
  settleReason: SettleReason = "departure",
): boolean {
  let mutated = false;
  if (context.pendingKeys.size === 0) return mutated;
  const exceptKeys = $exceptKeysAround(exceptKey);
  const keys = [...context.pendingKeys].filter((key) => !exceptKeys.has(key));
  // Owners already routed through their settle in THIS pass. Several pended PIECES can map to one
  // owner (a verse's `\va` and `\vp` values are two runs sharing one owner identity, and every
  // attribute value pends under its own key — $textNodeTier2Transform), and the settle is not
  // idempotent-for-free: a second run would re-probe the paragraph the first one already rebuilt,
  // and even a refused (fixed-point) probe leaves parse orphans that count as dirty leaves.
  const settledOwners = new Set<NodeKey>();
  for (const key of keys) {
    const node: LexicalNode | null = $getNodeByKey(key);
    if (!node?.isAttached()) {
      context.pendingKeys.delete(key);
      continue;
    }
    if ($isMarkerNode(node)) {
      context.pendingKeys.delete(key);
      const text = node.getTextContent();
      if ($isCanonicalMarkerNode(node)) continue;
      const bare = BARE_OPENER_REGEX.exec(text);
      if (node.getMarkerSyntax() === "opening" && bare)
        mutated = $applyOpenerRename(node, bare[1], context) || mutated;
      else if (
        settleReason === "idle" &&
        $idleSettleWouldDiscardCaretHeldBytes(node, context.getMarker)
      ) {
        // The idle tick may not settle a caret-held site whose re-tokenization would DROP the
        // typed byte (accept-then-discard, and the caret's byte would not survive) — the same
        // family as the emptied-husk carve-out. Re-pend; genuine departure settles it.
        context.pendingKeys.add(key);
      } else if ($tryUnknownSplitRejoin(node, context)) {
        // The glyph's bytes no longer name a BLOCK marker — the `\` deleted outright, or the
        // marker edited back into an inline one — so the unknown-split artifact has no reason
        // left to be its own paragraph (see $unknownSplitRejoinScope). The single-scope route
        // below would re-tokenize those bytes alone and fabricate a default `\p` around them;
        // the widened rejoin lets the tokenizer join them to the previous paragraph instead,
        // exactly as the file bytes would parse.
        mutated = true;
        context.logger?.debug(
          "[MarkerEdit] unknown-split paragraph rejoined its predecessor on marker degradation",
        );
      } else mutated = $requestTier2ForNode(node, context) || mutated;
      continue;
    }
    // A pended run PIECE settles at its OWNER. `$settlePendedDisplayOwner` recognizes only owners
    // (`descriptor.ownerPredicate`), so a piece used to match nothing, report itself unhandled, and
    // fall straight through to the re-tokenize arm below — a whole-paragraph rebuild with NO
    // owner-grace check anywhere on the path. That bypassed the grace contract entirely: a sibling
    // piece's key could re-tokenize a run the caret was actively mid-editing (a `\vp` value's key
    // settling the `\va` value under the user's caret, mid-deletion). Mapping first — through
    // `$ownerOfRunPiece` (shared's displayRunOwner.utils.ts), the ONE piece→owner classifier every
    // other pend path already uses — puts the owner's grace pre-pass back in front of both arms: a
    // caret-held owner is re-pended untouched and settles on departure instead. A piece whose walk
    // finds no owner (plain pending text, a literal, an unregistered kind) keeps today's behavior,
    // re-tokenizing its own scope.
    const owner = $ownerOfRunPiece(node)?.owner;
    const target = owner?.isAttached() ? owner : node;
    const targetKey = target.getKey();
    if (settledOwners.has(targetKey)) {
      // This owner already settled (or re-pended under grace) earlier in the pass. Consume the
      // piece's key, but never the OWNER's own — a grace re-pend added that key back deliberately.
      if (key !== targetKey) context.pendingKeys.delete(key);
      continue;
    }
    if (exceptKeys.has(targetKey)) {
      // The shield covers the node the caret is still in (and its contiguous run). The filter
      // above applies it to the PENDED key; mapping can reach a shielded node from a piece's key
      // instead, so honor it here too — the owner keeps its pend and settles once the caret
      // departs.
      context.pendingKeys.delete(key);
      context.pendingKeys.add(targetKey);
      continue;
    }
    context.pendingKeys.delete(key);
    // The owner's own pend (if it has one this pass) is consumed by the settle below, so a later
    // key of it is a dedup skip rather than a second settle.
    if (key !== targetKey) context.pendingKeys.delete(targetKey);
    settledOwners.add(targetKey);
    const settled = $settlePendedDisplayOwner(target, context, settleReason);
    // Folded regardless of `handled`: a husk removal or wrap migration is a real mutation even on
    // the `handled: false` path, where the settle still falls through to the re-tokenize arm below
    // — a refused (fixed-point) rebuild must not make that earlier mutation disappear from the
    // caller's own report (see `$settlePendedDisplayOwner`'s doc comment).
    mutated = settled.mutated || mutated;
    if (settled.handled) continue;
    // Pending plain-text nodes and departed verses/milestones re-tokenize. The settle rule is
    // uniform: the DISPLAYED BYTES win — Tier 2 re-tokenizes what the user sees (for a
    // milestone, scanMilestone re-derives sid/eid/unknownAttributes from its run's bytes), the
    // same last-write-wins convergence chars and verses use. A remote field change that
    // arrived while the caret held the run (mid-edit grace) loses locally and converges
    // through the normal save/OT path; settling from node state instead would rewrite the
    // run's displayed bytes and could clobber text the user just typed there. Routed on `target`
    // (the piece's owner where it has one) rather than the raw pended node: both resolve to the
    // same scope — a run rides as its owner's following siblings, or as its children for a char
    // span — so this is the same rebuild, reached only after the owner's grace has declined.
    if (
      settleReason === "idle" &&
      $idleSettleWouldDiscardCaretHeldBytes(target, context.getMarker)
    ) {
      // Same idle carve-out as the marker-glyph arm above: a rebuild that would discard the
      // caret-held typed byte re-pends and settles on genuine departure instead.
      context.pendingKeys.add(targetKey);
      continue;
    }
    mutated = $requestTier2ForNode(target, context) || mutated;
  }
  return mutated;
}
