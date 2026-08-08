/**
 * Tier 1 of the marker-editing engine: in-place renames that
 * keep structural node state and visible marker text in agreement at rest.
 * Everything Tier 1 cannot express routes to Tier 2 ($requestTier2ForNode).
 */

import { $requestTier2ForNode, Tier2Context } from "./tier2Rebuild.utils";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $hasCaretHeldAttributeRun,
  $hasCaretHeldMilestoneRun,
  $hasCaretHeldSeparatorGap,
  $hasCaretHeldVerseAttributeRun,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  $milestoneAttributeRunPieces,
  $milestoneRunEntirelyAbsent,
  $verseAttributeRunPieces,
  AttributeRunNode,
  canonicalAttributeText,
  ChapterNode,
  closingMarkerText,
  defaultMarkerAttribute,
  getVisibleOpenMarkerText,
  isMilestoneHeuristicName,
  MarkerLookup,
  MarkerNode,
  MarkerType,
  milestoneAttributes,
  milestoneDefaultAttribute,
  MilestoneNode,
  NBSP,
  NoteNode,
  openingMarkerText,
  VerseNode,
} from "shared";

export interface MarkerEditContext extends Tier2Context {
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
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
const BARE_OPENER_REGEX = /^\\(\+?[\w-]+)$/;
const CLOSER_FORM_REGEX = /^\\\+?[\w-]*\*$/;

/** The rest-state display text a marker glyph should carry — derived from the node's stored
 * marker, syntax, and nesting. A glyph whose text differs is mid-edit (pend-shaped). Exported for
 * the historic re-pend scan ($rependPendShapedNodes), which must classify glyph divergence with
 * the same rule the MarkerNode transform and `$resolvePendingMarkers` use. */
export function $markerCanonicalText(node: MarkerNode): string {
  const syntax = node.getMarkerSyntax();
  // A nested char span's glyphs carry the `+` prefix (`\+w …\+w*`); the canonical text must derive
  // the same `+` from the node's stored nesting so a rest-state nested glyph is not mistaken for a
  // mid-edit rename.
  const nested = node.getNested();
  if (syntax === "closing") return closingMarkerText(node.getMarker(), nested);
  if (syntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(node.getMarker(), nested);
}

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

function $clampSelectionToLength(node: MarkerNode, newLength: number): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  [selection.anchor, selection.focus].forEach((point) => {
    if (point.key === node.getKey() && point.offset > newLength)
      point.set(node.getKey(), newLength, "text");
  });
}

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

/** Returns whether the editor state was mutated — a rename applied, or a routed Tier 2 rebuild
 * that spliced (a refused rebuild mutates nothing). */
export function $applyOpenerRename(
  node: MarkerNode,
  newMarker: string,
  context: MarkerEditContext,
): boolean {
  // A typed `+` prefix is a NEST instruction, not a rename: only Tier 2 (re-tokenizing the
  // visible glyph text, which now carries the `+`) can express the resulting nesting. Tier 1's
  // in-place rename would strip the `+` and silently discard the nest intent, so route to Tier 2.
  if (newMarker.startsWith("+")) {
    return $requestTier2ForNode(node, context);
  }
  const parent = node.getParent();
  if ($isParaNode(parent)) {
    if (!isParaKindMarker(newMarker, context.getMarker)) {
      return $requestTier2ForNode(node, context);
    }
    parent.setMarker(newMarker);
    node.setMarker(newMarker); // rewrites __text to canonical, absorbing the typed terminator
    $moveCaretPastMarker(node);
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
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] ${parent.getType()} marker renamed to "${clean}"`);
    return true;
  }
  return $requestTier2ForNode(node, context);
}

export function $markerNodeTransform(node: MarkerNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (text === $markerCanonicalText(node)) {
    context.pendingKeys.delete(node.getKey());
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
  // Closer / selfClosing: one-way authority — closer edits never rename the span. Damage or
  // retype settles through Tier 2, whose tokenizer turns non-marker residue (`wj*` after the `\`
  // is deleted) into PLAIN text and re-closes the span per its rules — a `*`-terminated form
  // resolves now, anything else stays pending until the caret departs (mid-edit grace). A char
  // span the user leaves open re-closes WITHOUT a regenerated `\marker*` glyph: the tokenizer
  // marks every implicitly-closed span `closed="false"` (ParatextData emits it whenever a char
  // span has no explicit closer — see paranext-core's footnote-util test USJ), and the adaptor
  // skips the closing glyph for such spans, exactly as it does for auto-closed notes.
  if (text.endsWith("*")) {
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context);
    return;
  }
  context.pendingKeys.add(node.getKey());
}

// `\v`, separator, number token, then either nothing-yet (unterminated), or a
// separator plus optional trailing text the user typed inside the node.
const VERSE_TEXT_REGEX = /^\\v[ \u00A0]+([^ \u00A0\\]+)(?:[ \u00A0]([\s\S]*))?$/;

export function $verseNodeTransform(node: VerseNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const expected = getVisibleOpenMarkerText("v", node.getNumber());
  if (text === expected) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (/^\\v[ \u00A0]*$/.test(text)) {
    // number mid-edit; keep the stored number as the serialization fallback
    context.pendingKeys.add(node.getKey());
    return;
  }
  const match = VERSE_TEXT_REGEX.exec(text);
  if (!match) {
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
  node.setNumber(numberToken); // PT9 GetNextWord: whole word, valid or not
  node.setTextContent(getVisibleOpenMarkerText("v", numberToken));
  if (rest) {
    const restNode = $createTextNode(rest);
    node.insertAfter(restNode);
    restNode.select(rest.length, rest.length);
  }
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
  const match = /^\\c[ \u00A0]+([^ \u00A0\\]+)[ \u00A0]/.exec(text);
  if (!match) return; // leave literal; serialization falls back to the stored number
  node.setNumber(match[1]);
  textNode.setTextContent(getVisibleOpenMarkerText("c", match[1]));
}

/**
 * The canonical NBSP+`|…` bytes `node` should display between its glyphs — shared between
 * `MarkerEditPlugin`'s registered transform and this file's pend resolution so both always agree
 * on what "canonical" means for a milestone. `milestoneAttributes` (attributeDisplay.utils.ts)
 * folds sid/eid/unknownAttributes into the same object usj-editor.adaptor's `addAttributes` builds
 * from a `MarkerObject`. Computed here rather than inside `shared`'s attributeDisplay.utils.ts:
 * `milestoneDefaultAttribute` lives in the converters, and `shared`'s nodes/usj module graph must
 * not import from there (converters/usfm already imports FROM nodes/usj, so the reverse import
 * would cycle) — same reason `$syncCharAttributeDisplayNode` lives in CharNodePlugin.tsx.
 * @param node - MilestoneNode whose display run needs updating.
 */
export function $milestoneAttributeDisplayText(node: MilestoneNode): string {
  const attributes = milestoneAttributes(node.getSid(), node.getEid(), node.getUnknownAttributes());
  const text = canonicalAttributeText(attributes, milestoneDefaultAttribute(node.getMarker()));
  return text ? NBSP + text : "";
}

/**
 * Every currently-attached but EMPTY `AttributeRunNode` wrapper riding on `node` (a verse's `\va`
 * and/or `\vp` wrapper, or a milestone's single wrapper) — every piece of that wrapper's run was
 * deleted, leaving a transient husk with nothing left to display (see {@link AttributeRunNode}'s
 * own doc comment). A verse can carry up to two independent husks; a milestone at most one.
 */
function $emptyAttributeRunWrappers(node: LexicalNode): AttributeRunNode[] {
  if ($isMilestoneNode(node)) {
    const { wrapper } = $milestoneAttributeRunPieces(node);
    return wrapper && wrapper.getChildrenSize() === 0 ? [wrapper] : [];
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
 * The uniform deletion/pend settle for display-run OWNERS — the one place every kind's
 * grace-or-settle decision and entirely-absent deletion policy lives. Marker literals and plain
 * pending text are not owners and fall through (handled: false) to the caller's re-tokenize arm.
 */
export function $settlePendedDisplayOwner(
  node: LexicalNode,
  context: MarkerEditContext,
): { handled: boolean; mutated: boolean } {
  if ($isUnknownNode(node)) {
    // An optbreak's `//` token IS its entire USFM byte representation (unknownUsfm.utils.ts) —
    // no marker, no attributes, nothing else to re-derive it from. Deleting the token (Lexical
    // destroys a token-mode display child outright; there is no partial-edit state to grace)
    // deletes the construct, exactly as deleting a milestone's entire run deletes the milestone:
    // the alternative, an empty UnknownNode left behind, serializes an optbreak with no visible
    // bytes and no caret-distinguishable position — the undead husk this arm retires. The
    // flanking significant spaces are untouched: displayed bytes win, and they were never part
    // of the node being removed.
    if (node.getTag() === "optbreak" && node.getChildrenSize() === 0) {
      node.remove();
      return { handled: true, mutated: true };
    }
    // Every other UnknownNode kind is a permanent Tier-2 sentinel with no display run of its
    // own to settle (unknownUsfm.utils.ts's module doc: these bytes are read-only rendering,
    // never re-tokenized) — recognized so the caller's re-tokenize fallback never tries to route
    // one through `$requestTier2ForNode`.
    return { handled: true, mutated: false };
  }
  // Husk arm, mirrors the optbreak arm above: an emptied `AttributeRunNode` wrapper
  // left attached to a verse or milestone is undead scaffolding with nothing left to display —
  // removed here as a side effect (not an early return) so the OWNER's own policy below still
  // runs against the cleaned-up tree in the SAME settle pass. Without that, a milestone whose
  // wrapper was JUST emptied would leave the wrapper orphaned in the tree the instant
  // `$milestoneRunEntirelyAbsent` (below) removes the milestone itself — ownership is
  // POSITION-derived, so an orphaned wrapper with no owner immediately before it can never be
  // cleaned up by anything else. `huskRemoved` folds into whichever arm below actually returns,
  // so a settle pass that removed a husk is never misreported as having mutated nothing.
  let huskRemoved = false;
  for (const wrapper of $emptyAttributeRunWrappers(node)) {
    wrapper.remove();
    huskRemoved = true;
  }
  if ($isCharNode(node) && $hasCaretHeldSeparatorGap(node)) {
    // A deleted opener separator stays pending while the caret still sits at the gap (the
    // exceptKey protection covers only the anchor node itself, not its parent span) — mid-edit
    // grace, markerSeparators.utils.ts. It settles once the caret has actually departed.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: false };
  }
  if (
    $isCharNode(node) &&
    $hasCaretHeldAttributeRun(
      node,
      canonicalAttributeText(
        node.getUnknownAttributes() ?? {},
        defaultMarkerAttribute(node.getMarker()),
      ),
    )
  ) {
    // Same mid-edit grace for a span's edited/deleted attribute display run (the exceptKey
    // protection covers only the run TextNode the caret is in, not the parent span's pended
    // key) — attributeDisplay.utils.ts. Settling now would re-tokenize the run out from under
    // the user's caret; it settles once the caret has actually departed.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: false };
  }
  if (
    $isVerseNode(node) &&
    $hasCaretHeldVerseAttributeRun(node, node.getAltnumber(), node.getPubnumber())
  ) {
    // Same mid-edit grace for a verse's deleted/diverged \va/\vp attribute run: the exceptKey
    // protection covers only the run TextNode (or verse text) the caret is in, not the verse's
    // pended key. Settling now would re-tokenize the run out from under the caret; it settles
    // once the caret has actually departed and the run's bytes are absent from the fragment.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: huskRemoved };
  }
  if (
    $isMilestoneNode(node) &&
    $hasCaretHeldMilestoneRun(node, $milestoneAttributeDisplayText(node))
  ) {
    // Same mid-edit grace for a milestone's diverged or deleted display run: the exceptKey
    // protection covers only the node the caret is in (the run TextNode, or the flanking text
    // for a just-deleted run), not the milestone's pended key — attributeDisplay.utils.ts.
    // Settling now would rewrite or re-tokenize the run out from under the caret; it settles
    // once the caret has actually departed.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: huskRemoved };
  }
  if ($isMilestoneNode(node) && $milestoneRunEntirelyAbsent(node)) {
    // The display run is a milestone's ENTIRE visible byte representation, so deleting all of
    // it deletes the milestone itself — displayed bytes win, exactly as deleting every byte of
    // any other construct removes it. Guarded to the fully-absent shape: a partial mangle
    // (any glyph or attribute text still present) falls through and re-tokenizes instead.
    // Without this arm the paragraph rebuild would preserve the bare milestone as an atomic
    // sentinel (tier2Rebuild.utils.ts's empty-run guard) and the deletion could never finish.
    // (An emptied wrapper husk was already removed above, so this correctly still fires for it.)
    node.remove();
    return { handled: true, mutated: true };
  }
  // `handled: false` here regardless of `huskRemoved`: the caller ignores `mutated` on this path
  // and instead falls through to its own re-tokenize arm ($requestTier2ForNode) — the existing,
  // already-safe default for a verse whose pend wasn't (or is no longer, post-husk-cleanup) a
  // recognized caret-held divergence. Routing through it here too, rather than reporting
  // "handled" and stopping, keeps a verse's own altnumber/pubnumber able to re-derive a fresh
  // (loose) run on the same pass if a husk was cleared out from under a value that is still
  // wanted — `wrapper.remove()` alone does not dirty the VerseNode, so nothing else would
  // otherwise re-trigger its sync.
  return { handled: false, mutated: false };
}

/**
 * Completion trigger. PT9 completes mid-edit markers via its 1s debounced
 * reformat; our deterministic equivalents are Enter, blur, and the caret
 * leaving the node (`exceptKey` keeps the node still being edited pending).
 *
 * Returns whether anything actually MUTATED the editor state. A pass that only consumed
 * keys and REFUSED every routed rebuild (fixed points) changes nothing visible — but each
 * refused `$rebuildParas` probe still created parse orphans that count as dirty leaves, so
 * the deferred-resolution caller uses this to merge the visually-no-op commit into the
 * current history entry instead of letting it push a phantom undo step.
 */
export function $resolvePendingMarkers(context: MarkerEditContext, exceptKey?: NodeKey): boolean {
  let mutated = false;
  if (context.pendingKeys.size === 0) return mutated;
  const keys = [...context.pendingKeys].filter((key) => key !== exceptKey);
  for (const key of keys) {
    context.pendingKeys.delete(key);
    const node: LexicalNode | null = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    if ($isMarkerNode(node)) {
      const text = node.getTextContent();
      if (text === $markerCanonicalText(node)) continue;
      const bare = BARE_OPENER_REGEX.exec(text);
      if (node.getMarkerSyntax() === "opening" && bare)
        mutated = $applyOpenerRename(node, bare[1], context) || mutated;
      else mutated = $requestTier2ForNode(node, context) || mutated;
      continue;
    }
    const settled = $settlePendedDisplayOwner(node, context);
    if (settled.handled) {
      mutated = settled.mutated || mutated;
      continue;
    }
    // Pending plain-text nodes and departed verses/milestones re-tokenize. The settle rule is
    // uniform: the DISPLAYED BYTES win — Tier 2 re-tokenizes what the user sees (for a
    // milestone, scanMilestone re-derives sid/eid/unknownAttributes from its run's bytes), the
    // same last-write-wins convergence chars and verses use. A remote field change that
    // arrived while the caret held the run (mid-edit grace) loses locally and converges
    // through the normal save/OT path; settling from node state instead would rewrite the
    // run's displayed bytes and could clobber text the user just typed there.
    mutated = $requestTier2ForNode(node, context) || mutated;
  }
  return mutated;
}

export function $isSelectionInMarkerNode(): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && $isMarkerNode(selection.anchor.getNode());
}
