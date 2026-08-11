/**
 * Tier 2 triggers for literal backslash text: typed or
 * pasted USFM that lands as plain TextNode content rather than being routed
 * through a MarkerNode/VerseNode transform. Lexical dispatches node
 * transforms by exact node type, so this transform never fires for
 * MarkerNode/VerseNode subclasses -- TextSpacingPlugin relies on the same
 * fact. A backslash sequence completed by a space/NBSP separator or a `*`
 * closer re-tokenizes immediately; an unterminated one waits in
 * `pendingKeys` for Enter/blur/caret-departure via `$resolvePendingMarkers`.
 * Attribute-run text (textType "attribute") is a third case: it always
 * pends and never re-tokenizes from here, regardless of backslashes or
 * termination-looking content — see the attribute branch below. Plain `|…`
 * content typed into an ALREADY-closed char span is a fourth case: it carries
 * no backslash, so the immediate path never fires, yet it is a pending
 * attribute edit (PT9 re-parses `|…` before an explicit closer), so it pends
 * for the same caret-departure settle rather than being discarded as inert text.
 * Typed `//` is a fifth case: USFM's discretionary line break (optbreak) carries
 * no backslash or pipe either, but the tokenizer maps it to an optbreak wherever
 * plain text appears, so it pends for the same caret-departure settle.
 * A value typed into an empty `\va`/`\vp` SOURCE span (the settled empty form,
 * displayed `\va \va*`) is a sixth case: it carries no backslash or pipe either, but the
 * span rides in the owning verse's run position, so the tokenizer's attrCapture folds the
 * typed bytes back onto the verse's altnumber/pubnumber on the next re-tokenize — it pends
 * for the same caret-departure settle.
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { $markerCanonicalText, MarkerEditContext } from "./markerEditTier1.utils";
import {
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $caretHoldsRunSite,
  $charClosingGlyph,
  $hasCaretHeldSeparatorGap,
  $isAttributeRunNode,
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isUnknownNode,
  $isVerseNode,
  $ownerOfRunPiece,
  $verseOfAttributeSourceText,
  displayRunDescriptor,
  getVisibleOpenMarkerText,
  textTypeState,
} from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[ \u00A0])/;

/**
 * Whether `node` sits inside a char span that already carries its closing glyph. USFM attributes
 * are only meaningful before an explicit closer, so `|` bytes typed into such a span's plain
 * content are a pending attribute edit (PT9 re-parses them via `extractAttributes` on the next
 * reformat), not inert text. The nearest CharNode ancestor is the one that matters; a span with no
 * closing glyph (an unclosed `closed="false"` span) keeps such bytes literal, and plain paragraph
 * text with no CharNode ancestor is never an attribute site at all. Reuses `$charClosingGlyph` --
 * the same closing-glyph locator the attribute display owns (attributeDisplay.utils.ts) -- so this
 * pend decision and the display run can never disagree about whether a span is closed.
 */
function $isInClosedCharSpan(node: LexicalNode): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent())
    if ($isCharNode(parent)) return $charClosingGlyph(parent) !== undefined;
  return false;
}

/**
 * Whether `node` sits inside a block whose text the tokenizer keeps literal — a book id, a
 * chapter, or an opaque UnknownNode block (sidebar, periph, figure, …). These are the
 * degradation-property contexts `$rebuildParas` refuses to re-tokenize (the paragraph guard
 * rails and `$requestTier2ForNode`'s opaque-block bail), so a divergence there can never
 * settle. Both the backslash path and the `//` optbreak path below skip such nodes: pending
 * a literal the engine will never rebuild would only leave a stuck key.
 */
function $inLiteralOnlyBlock(node: LexicalNode): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent())
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return true;
  return false;
}

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const textType = $getState(node, textTypeState);
  // Attribute runs (char and milestone alike) always pend and never re-tokenize from here:
  // their bytes legitimately contain arbitrary characters, so neither the backslash check below
  // nor the termination regex further down means anything for them — a `\`-free edit is just as
  // much a divergence from canonical as a "terminated"-looking one. The marker-edit engine
  // settles the run back to canonical on caret departure via `context.pendingKeys` (see
  // `$caretHoldsRunSite`, MarkerEditPlugin.tsx) instead of this trigger ever re-tokenizing it
  // directly.
  if (textType === "attribute") {
    context.pendingKeys.add(node.getKey());
    return;
  }
  if (!text.includes("\\")) {
    // `|…` bytes typed into a CLOSED char span's plain content are a pending attribute edit, not
    // inert text: PT9 re-parses `|…` before an explicit closer as attributes. When the closer glyph
    // was typed FIRST (TJ's corrected repro: `\nd text\nd*` then caret at "text|" and type
    // `|stuff="thing"`), no backslash ever lands in this node, so the immediate-rebuild path below
    // never fires — without pending here the node's key would be DELETED and caret departure would
    // have nothing to settle, leaving the pipe literal forever. Pend instead so the departure
    // settle routes it through `$rebuildParas`, whose tokenizer's `extractAttributes` forms the
    // attribute (or, for a bare value on a marker with no default, refuses at the fixed point and
    // keeps it literal — PT9 semantics, terminating without churn). Do NOT rebuild now: the user is
    // mid-typing `|stuff="thi…`. All other plain text still deletes its key (that cleanup matters):
    // pipe-text in an unclosed span carries no attribute, and pipe-text in bare paragraph content
    // is not an attribute site at all — `$isInClosedCharSpan` keeps both out.
    if (text.includes("|") && $isInClosedCharSpan(node)) context.pendingKeys.add(node.getKey());
    // `//` is USFM's discretionary line break (optbreak). The tokenizer maps it to an optbreak
    // wherever plain text appears — body paragraphs and char-span content alike (the split is
    // flat, run before char-stack assembly). No backslash, pipe, or termination ever re-triggers
    // on its own, so without pending here a typed `//` would delete its key and stay literal text
    // forever (the live bug: it never became an optbreak and editorUsj diverged from the PDP).
    // Pend so caret departure routes it through `$rebuildParas`, which re-tokenizes `//` into an
    // optbreak while keeping the significant flanking spaces byte-exact. Skip the literal-only
    // blocks the tokenizer never re-tokenizes — a settle there could never happen.
    else if (text.includes("//") && !$inLiteralOnlyBlock(node))
      context.pendingKeys.add(node.getKey());
    // A value typed into an empty `\va`/`\vp` SOURCE span is a pending attribute edit for the verse
    // the span rides on: no backslash or pipe ever lands, so without pending here the key is
    // deleted and departure settles nothing — the value never re-folds to altnumber/pubnumber and
    // every save warns (the third live bug). Own-key pend: the caret-node exception graces it
    // mid-typing, and departure's paragraph rebuild folds the bytes onto the verse (attrCapture).
    else if ($verseOfAttributeSourceText(node)) context.pendingKeys.add(node.getKey());
    else context.pendingKeys.delete(node.getKey());
    return;
  }
  // The para-prefix trailing-space node is NOT exempt: it only
  // reaches this point when it carries a literal backslash run (a pure-NBSP prefix bails at the
  // includes check above), and that is exactly the node a caret at "content start" types into.
  // Exempting it made typed literals there invisible to the whole pend/settle machinery — `\zz `/
  // `\zfoo ` persisted indefinitely and serialized raw to disk because the caret-departure
  // settle had nothing pended to resolve.
  //
  // Note content now routes to the note-scoped rebuild (`$rebuildNoteContent`) via
  // `$requestTier2ForNode`, so it is NOT skipped here; books/chapters/unknowns keep
  // literal text (degradation property).
  if ($inLiteralOnlyBlock(node)) return;
  // Only the USER'S TYPED RUN can terminate a marker (the type-through corruption class): with
  // the caret mid-word ("li|ke"), typing `\` yields
  // "li\ke …", and the word remainder's own following space made `\ke ` look terminated —
  // splitting immediately into a phantom paragraph whose marker absorbed the remainder ("ke"),
  // which the palette apply then consumed (text loss). When this node holds the collapsed
  // caret, test only the text BEFORE the caret: characters after it pre-existed and cannot have
  // been "just typed". Non-anchor nodes (paste normalization, programmatic edits, remote
  // deltas) keep the whole-text check; an unterminated run left before the caret still resolves
  // via Enter/blur/caret departure.
  const selection = $getSelection();
  const terminationText =
    $isRangeSelection(selection) &&
    selection.isCollapsed() &&
    selection.anchor.key === node.getKey()
      ? text.slice(0, selection.anchor.offset)
      : text;
  if (TERMINATED_MARKER_IN_TEXT_REGEX.test(terminationText)) {
    context.pendingKeys.delete(node.getKey());
    if (context.rebuildAttempted.has(text)) {
      // $rebuildParas already produced this exact literal text once this commit and, being
      // deterministic, would only reproduce it again (e.g. an unterminated milestone run
      // that stays literal per the degradation property) — settle rather than
      // retrigger forever.
      return;
    }
    context.rebuildAttempted.add(text);
    $requestTier2ForNode(node, context);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}

/**
 * Read-only re-pend scan for HISTORIC (undo/redo) commits. Lexical's history restores a
 * state via `setEditorState`, which never runs node transforms (`$applyAllTransforms`
 * lives only on the `editor.update` path), so every pend the transforms would have
 * derived from the restored bytes is missing: an undone settle's literal (`\nd hi\nd*`
 * text, `|attrs` in a closed span, a diverged glyph or attribute run) is invisible to
 * `context.pendingKeys` and caret departure settles nothing — the literal persists until
 * the user happens to type inside it. This scan re-derives those pends by walking the
 * restored tree with the SAME predicates the transforms use, strictly read-only: keys go
 * into the plain `pendingKeys` Set, no node is touched, so the historic commit stays
 * mutation-free — it creates no history entry and leaves the undo/redo stacks intact.
 * The caller clears `pendingKeys` first: stale keys describe the pre-restore document.
 *
 * Where a transform would REBUILD immediately (a terminated literal), the scan only
 * pends: a history restore is not a user edit, so the settle waits for the next real
 * caret departure exactly like every other pend. The scan's divergence set is therefore
 * deliberately BROADER than the transforms' immediate-rebuild set — everything
 * restore-divergent pends, and nothing rebuilds until the user genuinely departs.
 *
 * Two more shapes pend for a DIFFERENT reason than everything above: an emptied optbreak
 * UnknownNode or AttributeRunNode wrapper (an undone husk-removal settle restores the empty
 * husk) is not a caret-dependent divergence at all — it is statically re-derivable from its own
 * shape alone (tag "optbreak" plus zero children, or zero children on a wrapper, always means
 * "settle removes this node"), unlike every other pend here, whose correct resolution depends on
 * what the user is doing. See the UnknownNode and AttributeRunNode branches below.
 */
export function $rependPendShapedNodes(context: MarkerEditContext): void {
  const visit = (node: LexicalNode): void => {
    if ($isMarkerNode(node)) {
      // Mid-edit glyph text (an undone rename settle) — $markerNodeTransform's pend shape.
      if (node.getTextContent() !== $markerCanonicalText(node))
        context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isVerseNode(node)) {
      // A diverged verse glyph (an undone number-edit settle), or a caret-held \va/\vp run
      // divergence — $verseNodeTransform plus $syncAndPendVerse's run pend (MarkerEditPlugin.tsx).
      if (
        node.getTextContent() !== getVisibleOpenMarkerText("v", node.getNumber()) ||
        (["va", "vp"] as const).some((kind) => $caretHoldsRunSite(displayRunDescriptor(kind), node))
      )
        context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isMilestoneNode(node)) {
      // A caret-held milestone run divergence — $syncAndPendMilestone's pend condition
      // (MarkerEditPlugin.tsx). The run-entirely-absent shape is deliberately NOT pended here: a
      // bare collab-materialized milestone legitimately has no run at rest, and pending it
      // would DELETE it on the next departure ($resolvePendingMarkers' removal arm).
      if ($caretHoldsRunSite(displayRunDescriptor("milestone"), node))
        context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isTextNode(node)) {
      // Exact-type mirror of the TextNode catch-all transform's dispatch: Lexical
      // dispatches transforms by exact node type, so subclasses (MarkerNode/VerseNode
      // handled above, immutable display texts) never receive it and must not pend here.
      if (node.getType() !== TextNode.getType()) return;
      // Attribute runs settle at their OWNER (the char span / milestone / verse caret-held
      // checks in this scan); a canonical run has nothing to settle, and a diverged one is
      // only reachable mid-edit, i.e. caret-held.
      if ($getState(node, textTypeState) === "attribute") return;
      const text = node.getTextContent();
      // Four literal shapes pend, mirroring the transform's TextNode branches: backslash runs
      // (terminated or not), pipe bytes in a closed char span (the pipe branch), `//` optbreak
      // text (the optbreak branch), and content of an empty `\va`/`\vp` SOURCE span (the
      // verse-attribute-site branch). Undoing an optbreak settle restores the literal `//`, and
      // undoing a settled fold restores the empty source span's typed value — both are the same
      // divergence class and must re-pend so the next departure re-settles them. No
      // literal-only-block guard is needed here: the scan never descends into books/chapters/
      // unknowns (handled below), so a `//` there is never visited.
      if (
        text.includes("\\") ||
        (text.includes("|") && $isInClosedCharSpan(node)) ||
        text.includes("//") ||
        $verseOfAttributeSourceText(node) !== undefined
      )
        context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isCharNode(node)) {
      // A caret-held separator gap or attribute-run divergence — the CharNode transform's
      // pend conditions (MarkerEditPlugin.tsx).
      if ($hasCaretHeldSeparatorGap(node)) context.pendingKeys.add(node.getKey());
      if ($caretHoldsRunSite(displayRunDescriptor("char"), node))
        context.pendingKeys.add(node.getKey());
      node.getChildren().forEach(visit);
      return;
    }
    if ($isUnknownNode(node)) {
      // An emptied optbreak husk (an undone husk-removal settle restores it) is statically
      // re-derivable from its own shape alone — tag "optbreak" plus zero children always means
      // $settlePendedDisplayOwner's optbreak arm removes it, unlike a destruction pend, whose
      // correct outcome depends on caret state. Pend it directly (that arm operates on THIS
      // node, unlike the AttributeRunNode husk below, whose arm operates on its OWNER) so the
      // next real departure re-removes the husk instead of it silently re-serializing an
      // optbreak with no visible bytes forever. Every other UnknownNode kind (and every other
      // book/chapter block) keeps literal text (degradation property) — the transform never
      // pends inside them, so the scan does not descend into any of them.
      if (node.getTag() === "optbreak" && node.getChildrenSize() === 0)
        context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isBookNode(node) || $isChapterNode(node)) return;
    if ($isAttributeRunNode(node) && node.getChildrenSize() === 0) {
      // An emptied AttributeRunNode wrapper (an undone husk-removal settle restores it) is the
      // same statically-re-derivable shape as the optbreak husk above: zero children always
      // means $settlePendedDisplayOwner's husk arm removes it (AttributeRunNode.ts's own doc —
      // the wrapper is pure editor-owned scaffolding with nothing left to display). That arm is
      // keyed off the OWNING verse/milestone, not the wrapper itself ($emptyAttributeRunWrappers
      // only recognizes a VerseNode/MilestoneNode), so the owner — found by `$ownerOfRunPiece`
      // (shared's displayRunOwner.utils.ts), the same walk MarkerEditPlugin's live
      // AttributeRunNode transform delegates to — is what gets pended here, not the wrapper's own
      // key. Its verse/milestone descriptors' walk-back recognizes this shape directly, and
      // nothing about it depends on the wrapper actually being destroyed — only on tree position,
      // which this attached (undo-restored) wrapper still has.
      const owner = $ownerOfRunPiece(node)?.owner;
      if (owner) context.pendingKeys.add(owner.getKey());
      return;
    }
    if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  $getRoot().getChildren().forEach(visit);
}
