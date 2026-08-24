/**
 * Tier 2 triggers for literal backslash text: typed or
 * pasted USFM that lands as plain TextNode content rather than being routed
 * through a MarkerNode/VerseNode transform. Lexical dispatches node
 * transforms by exact node type, so this transform never fires for
 * MarkerNode/VerseNode subclasses -- TextSpacingPlugin relies on the same
 * fact. A backslash sequence completed by a space/NBSP separator or a `*`
 * closer re-tokenizes immediately; an unterminated one waits in
 * `pendingKeys` for Enter/blur/caret-departure via `$resolvePendingMarkers`.
 * Attribute-run text (textType "attribute") is a third case: it never
 * re-tokenizes from here, regardless of backslashes or termination-looking
 * content, and pends whenever its own run diverges from what the owner's
 * state calls for — see the attribute branch below. Plain `|…`
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

import { $requestTier2ForNode, $settleScopeForNode } from "./tier2Rebuild.utils";
import { $noteCallerTextTransform, MarkerEditContext } from "./markerEditTier1.utils";
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
  $isCanonicalMarkerNode,
  $isCanonicalUnmatchedNode,
  $isChapterNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isMarkerNode,
  $isUnknownNode,
  $isVerseNode,
  $ownerOfRunPiece,
  $runDiverges,
  $runEntirelyAbsent,
  $verseOfAttributeSourceText,
  DisplayRunDescriptor,
  displayRunDescriptor,
  displayRunDescriptors,
  getVisibleOpenMarkerText,
  textTypeState,
  milestoneEjectionPending,
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
 * Whether an attribute-run VALUE node's run is at rest — its own descriptor reports no divergence
 * from what the owner's state calls for, so a settle would have nothing to do. Answered through
 * the registry ({@link $ownerOfRunPiece} then that kind's `$runDiverges`), so every display kind
 * gets one answer and none is special-cased. A node no descriptor claims as a run piece is not at
 * rest: an unrecognized shape keeps the unconditional pend it has always had.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $displayRunValueAtRest(node: TextNode): boolean {
  const reference = $ownerOfRunPiece(node);
  if (!reference) return false;
  const descriptor = displayRunDescriptor(reference.kind);
  return !$runDiverges(
    descriptor,
    descriptor.scanPieces(reference.owner),
    descriptor.expectedPieces(reference.owner),
  );
}

/**
 * Whether `node` sits inside a block whose text the tokenizer keeps literal — a book id or an
 * opaque UnknownNode block (sidebar, periph, figure, …). These are the
 * degradation-property contexts `$rebuildParas` refuses to re-tokenize (the paragraph guard
 * rails and `$requestTier2ForNode`'s opaque-block bail), so a divergence there can never
 * settle. Both the backslash path and the `//` optbreak path below skip such nodes: pending
 * a literal the engine will never rebuild would only leave a stuck key.
 *
 * Chapters USED to sit in this list, and their entry was purely circular: nothing about a
 * chapter's bytes is literal-by-policy — they were excluded only because no scope rebuilt them.
 * `$rebuildChapter` (tier2Rebuild.utils.ts) is that scope now, so a chapter's display bytes pend
 * and settle like any paragraph's. `book` stays: it has no settle scope, deliberately.
 */
function $inLiteralOnlyBlock(node: LexicalNode): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent())
    if ($isBookNode(parent) || $isUnknownNode(parent)) return true;
  return false;
}

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const textType = $getState(node, textTypeState);
  // A plain TextNode inside an editable CHAPTER is the chapter's own `\c N` glyph (or stray
  // mid-edit text beside it) — bytes whose CANONICAL form already contains a terminated marker
  // shape. The immediate-rebuild arm below would therefore re-tokenize the chapter on ANY
  // incidental dirtying (removing the adjacent `\ca` run marks the glyph dirty through Lexical's
  // sibling bookkeeping), settling a mid-gesture deletion under the user with no grace. Chapters
  // settle strictly on caret departure instead: canonical bytes have nothing pending; anything
  // else pends its own key, and departure's `$rebuildChapter` re-tokenizes the displayed bytes.
  // (The run's VALUE was already pended by the attribute branch below; its glyphs are
  // MarkerNodes, which exact-type dispatch never routes here.)
  const chapterParent = node.getParent();
  if (textType !== "attribute" && $isChapterNode(chapterParent)) {
    if (text === getVisibleOpenMarkerText("c", chapterParent.getNumber()))
      context.pendingKeys.delete(node.getKey());
    else context.pendingKeys.add(node.getKey());
    return;
  }
  // An expanded note's editable caller text — the note-marker family's leading attribute — has
  // its own Tier-1 arm (whitespace collapse plus word retag, `$noteCallerTextTransform`), the
  // same treatment a verse glyph's number gets from $verseNodeTransform. Handled shapes never
  // reach the literal machinery below; unhandled ones (a deleted flanking separator, backslash
  // bytes) fall through with today's behavior untouched.
  if ($noteCallerTextTransform(node, context)) return;
  // Attribute runs (every registered kind alike) pend and never re-tokenize from here: their
  // bytes legitimately contain arbitrary characters, so neither the backslash check below nor the
  // termination regex further down means anything for them — a `\`-free edit is just as much a
  // divergence from canonical as a "terminated"-looking one. The marker-edit engine settles the
  // run back to canonical on caret departure via `context.pendingKeys` (see `$caretHoldsRunSite`,
  // MarkerEditPlugin.tsx) instead of this trigger ever re-tokenizing it directly.
  if (textType === "attribute") {
    // Except when the registry says the run is at REST. `$runDiverges` is the same rule the sync
    // and the owner settle read, and it excuses whitespace flanking a separator-bearing value
    // (displayRunSync.utils.ts): the writer emits exactly one structural separator space whatever
    // the screen shows, so a space typed beside the value never reaches the document. Pending it
    // anyway routed the run through a departure re-tokenize that rewrote it to canonical — the
    // typed byte vanished on caret departure, a keystroke accepted and then discarded. A value
    // with nothing to settle also clears any stale pend of its own.
    if ($displayRunValueAtRest(node)) context.pendingKeys.delete(node.getKey());
    else context.pendingKeys.add(node.getKey());
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
    // Text inside a first-class `\ca`/`\cp` char span at document root adjacent to its chapter
    // is the chapter-side twin of the verse arm above: no backslash or pipe ever lands in a
    // value edit, so without pending here the key is deleted and the fold onto the chapter's
    // altnumber/pubnumber waited for a reload. `$settleScopeForNode` returns a CHAPTER here only
    // through its adjacency arm — chapter-INTERIOR text already returned at the top of this
    // transform — so this condition IS the adjacency test, not a re-derivation of it. Own-key
    // pend; departure's chapter-scoped rebuild re-tokenizes `\c` and `\ca` together (attrCapture
    // folds, or refuses at the fixed point for an unfoldable span).
    else if ($isChapterNode($settleScopeForNode(node))) context.pendingKeys.add(node.getKey());
    else {
      // Deleting a char opener's NBSP separator OUT OF ITS PREFIX position is a leaf-only edit:
      // the span's own element transform (the plugin's CharNode pend) does not run for it, so
      // without reporting the gap from the text side here nothing ever pends the span — the
      // deletion neither healed nor renamed, and the byte silently resurrected from node state
      // on the next save. Pend the OWNING SPAN's key (the same key the element-side pend uses);
      // departure settles it through the tokenize-identity routing. The standalone-spacer
      // deletion shape structurally dirties the span and never needs this arm.
      const parent = node.getParent();
      if ($isCharNode(parent) && $hasCaretHeldSeparatorGap(parent))
        context.pendingKeys.add(parent.getKey());
      context.pendingKeys.delete(node.getKey());
    }
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
    // A milestone rebuild that EJECTS content waits for the settle. Every other terminated marker
    // takes effect where it stands, which is why the immediate arm exists — but ejection MOVES
    // bytes out of the milestone and past a closer, so applying it the instant the `\*` is typed
    // rearranges the line under the caret while the user is still on it. Pending instead leaves
    // what they typed alone until they depart, and the departure settle performs the same rebuild.
    if (milestoneEjectionPending(text)) {
      context.pendingKeys.add(node.getKey());
      return;
    }
    context.pendingKeys.delete(node.getKey());
    if (context.rebuildAttempted.has(text)) {
      // $rebuildParas already produced this exact literal text once this commit and, being
      // deterministic, would only reproduce it again (e.g. an unterminated milestone run
      // that stays literal per the degradation property) — settle rather than
      // retrigger forever. Known gap: the set is keyed by TEXT, so this arm also swallows a
      // DIFFERENT node carrying the same bytes (a paste can insert two identical literals in
      // one commit), which then ends up neither rebuilt nor pended; pending it here instead
      // destabilizes the fixed-point damping (re-settles of damped literals are not idempotent
      // today), so the narrower behavior stands until that is resolved.
      return;
    }
    context.rebuildAttempted.add(text);
    $requestTier2ForNode(node, context);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}

/**
 * Whether a settle would act on `owner` for `descriptor`'s kind purely from tree shape, with no
 * caret involved. Only a run nothing can ever heal back qualifies: a `"read-only"` run that is
 * absent always means "settle removes this owner", while a HEALABLE run's absence can equally mean
 * "not built yet" (a collab-materialized bare milestone legitimately has no run at rest, and
 * pending it would DELETE it on the next departure).
 */
function $isStaticSettleShape(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean {
  if (descriptor.deletionPolicy !== "remove-owner") return false;
  if (descriptor.byteFormat.writer !== "read-only") return false;
  return $runEntirelyAbsent(descriptor, owner);
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
 * what the user is doing. The optbreak case is `$isStaticSettleShape`'s arm of the shared
 * per-descriptor loop below (optbreakDescriptor's `deletionPolicy`/`byteFormat.writer` rather
 * than a literal tag/children check) — it is no longer "the UnknownNode branch" that pends it.
 * The AttributeRunNode wrapper case has no registered descriptor of its own yet, so it stays the
 * literal branch below.
 */
export function $rependPendShapedNodes(context: MarkerEditContext): void {
  const visit = (node: LexicalNode): void => {
    if ($isMarkerNode(node)) {
      // Mid-edit glyph text (an undone rename settle) — $markerNodeTransform's pend shape.
      if (!$isCanonicalMarkerNode(node)) context.pendingKeys.add(node.getKey());
      return;
    }
    if ($isImmutableUnmatchedNode(node)) {
      // Mid-edit unmatched-marker bytes (an undone settle) — $unmatchedNodeTransform's pend
      // shape. Checked before the TextNode arm below, whose exact-type mirror would silently
      // skip this subclass.
      if (!$isCanonicalUnmatchedNode(node)) context.pendingKeys.add(node.getKey());
      return;
    }
    // Every registered display kind's owner re-pends by the SAME rule: a caret-held divergence, or
    // a statically-settling shape. A restored state ran no transforms, so nothing else re-derives
    // these pends and caret departure would settle nothing.
    for (const descriptor of displayRunDescriptors) {
      if (descriptor.settleScope === "none") continue;
      if (!descriptor.ownerPredicate(node)) continue;
      if ($caretHoldsRunSite(descriptor, node) || $isStaticSettleShape(descriptor, node))
        context.pendingKeys.add(node.getKey());
    }
    if ($isVerseNode(node)) {
      // A diverged verse glyph (an undone number-edit settle) — $verseNodeTransform's pend
      // shape. The caret-held \va/\vp run divergence pend ($syncAndPendOwner's run pend,
      // MarkerEditPlugin.tsx) is the shared loop above.
      if (node.getTextContent() !== getVisibleOpenMarkerText("v", node.getNumber()))
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
      // A plain TextNode inside an editable CHAPTER is the chapter's own `\c N` glyph (or stray
      // mid-edit text beside it) — the mirror of the live transform's chapter arm
      // ($textNodeTier2Transform). Canonical glyph bytes have nothing pending, and they always
      // contain `\`, so without this arm the literal-shapes check below would re-pend every
      // restored chapter's glyph on undo/redo and permanently defeat the pended-keys-empty fast
      // path. Anything non-canonical re-pends for departure's $rebuildChapter, like the live arm.
      const chapterParent = node.getParent();
      if ($isChapterNode(chapterParent)) {
        if (node.getTextContent() !== getVisibleOpenMarkerText("c", chapterParent.getNumber()))
          context.pendingKeys.add(node.getKey());
        return;
      }
      const text = node.getTextContent();
      // Four literal shapes pend, mirroring the transform's TextNode branches: backslash runs
      // (terminated or not), pipe bytes in a closed char span (the pipe branch), `//` optbreak
      // text (the optbreak branch), and content of an empty `\va`/`\vp` SOURCE span (the
      // verse-attribute-site branch). Undoing an optbreak settle restores the literal `//`, and
      // undoing a settled fold restores the empty source span's typed value — both are the same
      // divergence class and must re-pend so the next departure re-settles them. No
      // literal-only-block guard is needed here: the scan never descends into books or
      // unknowns (handled below), so a `//` there is never visited, and chapter interiors are
      // claimed by the chapter arm above.
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
      // A caret-held separator gap and a caret-held attribute-run divergence — the CharNode
      // transform's pend conditions (MarkerEditPlugin.tsx) — are both covered by the shared loop
      // above.
      node.getChildren().forEach(visit);
      return;
    }
    if ($isUnknownNode(node)) {
      // An emptied optbreak husk (an undone husk-removal settle restores it) is now pended by the
      // shared loop above, via `$isStaticSettleShape`'s optbreakDescriptor arm (that arm operates
      // on THIS node, unlike the AttributeRunNode husk below, whose arm operates on its OWNER).
      // Every UnknownNode kind (optbreak or opaque) still stops the walk here without descending:
      // books/chapters/unknowns keep literal text (degradation property) — the transform never
      // pends inside them.
      return;
    }
    // Books keep literal text (degradation property); chapters now DESCEND — their glyph text and
    // `\ca` run pieces are pend-shaped display bytes with a settle scope of their own
    // ($rebuildChapter), so an undone chapter settle must re-pend exactly like a paragraph's.
    if ($isBookNode(node)) return;
    if ($isAttributeRunNode(node) && node.getChildrenSize() === 0) {
      // An emptied AttributeRunNode wrapper (an undone husk-removal settle restores it) is the
      // same statically-re-derivable shape as the optbreak husk above: zero children means
      // $settlePendedDisplayOwner's husk arm removes it (AttributeRunNode.ts's own doc — the
      // wrapper is pure editor-owned scaffolding with nothing left to display). Statically
      // re-derivable, not unconditional: like every other settle write, the removal waits behind
      // the owner's grace pre-pass, so a caret sitting IN the husk (where deleting a run's last
      // byte leaves it) defers it to the caret's departure. Pending is right either way — it is the
      // departure settle this scan exists to arm. That arm is
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
