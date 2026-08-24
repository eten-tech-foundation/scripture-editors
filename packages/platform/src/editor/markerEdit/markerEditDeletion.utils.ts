/**
 * Deletion semantics. Replaces ParaMarkerPrefixGuardPlugin's reset-to-\p
 * behavior in editable marker mode: deleting a paragraph's marker text merges
 * its content into the previous paragraph (PT9 reformat outcome).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $dfs } from "@lexical/utils";
import {
  $createTextNode,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalNode,
  PointType,
  RangeSelection,
} from "lexical";
import {
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $isMarkerNode,
  $isMarkerTrailingSeparator,
  $isSynthesizedMarkerNode,
  $paraPrefixSeparatorCaretHeld,
  $isParaNode,
  $placeCaretAtBoundary,
  canonicalAttributeText,
  CharNode,
  defaultMarkerAttribute,
  getEditableCallerText,
  MARKER_TRAILING_SPACE_TEXT_TYPE,
  NBSP,
  NoteNode,
  PARA_MARKER_DEFAULT,
  ParaNode,
  textTypeState,
} from "shared";
import { showParaMarkerPrefix } from "shared-react";

export function $createMarkerPrefix(marker: string) {
  // The separator's shape (token mode, textType tag) and the reasons for it live with
  // $createMarkerTrailingSeparator.
  return [$createMarkerNode(marker), $createMarkerTrailingSeparator()];
}

/**
 * Places the caret at the content side of a paragraph's `[glyph, separator, ...content]` prefix —
 * child index 2, the content boundary — under the shared convention for what a boundary's caret
 * position is: text content selects at its own offset 0, and anything else (no content yet in a
 * fresh empty paragraph, or element content such as a leading red-letter `\wj` CharNode) gets the
 * element point. Typing there inserts plain text at content start instead of the caret jumping to
 * the paragraph end (`selectEnd`), which is wrong for element content and, before the separator was
 * token-mode, let typing merge into the separator itself.
 *
 * The index is fixed rather than scanned because these callers have just built or retagged the
 * prefix and know its shape; `$advancePastParaPrefixes` (shared-react) finds the same kind of
 * boundary by scanning when the shape is not known.
 */
export function $selectParaContentStart(para: ParaNode): void {
  $placeCaretAtBoundary(para, 2);
}

/**
 * Whether the collapsed caret sits at the START of a (still prefix-less) paragraph — the shape
 * `selection.insertParagraph()` leaves behind: an element point on the paragraph at offset 0
 * (empty clone from an end-of-content split), or offset 0 of its first child (the moved tail
 * content). Evaluated BEFORE the prefix splice, while "start of the paragraph" and "start of the
 * content" are still the same place.
 */
function $isCaretAtParaStart(para: ParaNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const { anchor } = selection;
  if (anchor.type === "element") return anchor.key === para.getKey() && anchor.offset === 0;
  const first = para.getFirstChild();
  return first !== null && anchor.key === first.getKey() && anchor.offset === 0;
}

export function $injectMarkerPrefix(para: ParaNode): void {
  // The caret follows the injection only when it sat at the paragraph's start (the Enter-split
  // shape): the splice lands the prefix UNDER such a caret, which would otherwise be left on the
  // marker side of it (an element point at offset 0 now points before the glyph — typing there
  // inserts into the marker prefix). A caret elsewhere — mid-text or at the end of a pasted
  // line, where one paste can inject several paragraphs' prefixes in a single update — is not
  // disturbed by the splice and must stay exactly where the user's edit put it.
  const caretAtStart = $isCaretAtParaStart(para);
  para.splice(0, 0, $createMarkerPrefix(para.getMarker()));
  if (caretAtStart) $selectParaContentStart(para);
}

/**
 * Retags a PREFIX-LESS paragraph: sets its marker AND injects the matching visible
 * `[glyph, separator]` prefix (editable marker mode) as one step. The two must land in the same
 * update — a paragraph whose marker state and visible prefix disagree hits
 * `$paraMarkerDeletionTransform`'s no-prefix branches (merge into the previous paragraph, or
 * reset to `\p`) on the next transform pass. Callers own the "no prefix present" precondition
 * (freshly split paragraph, or its prefix was just deleted); a paragraph that still has its
 * prefix wants an in-place glyph rewrite instead (see `$retagParagraph`,
 * `../markerMenu/markerMenuApply.utils.ts`), since injecting again would double the prefix.
 *
 * Always parks the caret on the content side of the new prefix: retagging is a deliberate
 * "make THIS paragraph a `\q1`" act (palette apply, reset-to-`\p`), so the user's next
 * keystroke belongs in that paragraph's content wherever the caret sat before — unlike
 * `$injectMarkerPrefix` alone, whose caret handling is conditional because a paste can inject
 * several paragraphs' prefixes far away from the caret.
 */
export function $setParaMarkerWithPrefix(para: ParaNode, marker: string): void {
  para.setMarker(marker);
  $injectMarkerPrefix(para);
  $selectParaContentStart(para);
}

/**
 * Re-asserts the marker-trailing NBSP separator between an intact paragraph prefix glyph and the
 * content. The separator is presentation scaffolding OWNED by the engine, so machine drift that
 * eats it (a selection edit that swallowed it alongside real content, a restructure that dropped
 * it, …) heals on the next transform pass instead of leaving a separator-less prefix — which
 * broke the `[glyph, separator, content]` layout every caret/retag computation assumes
 * (live-observed: retag caret jumping to the paragraph end, "the space after the marker keeps
 * disappearing"). A user-typed plain space/NBSP right after the glyph is intent for the same
 * separator and is canonicalized in place rather than doubled — byte-identical either way, since
 * the USFM writer emits this space structurally.
 *
 * A deletion whose site still holds the collapsed caret is a USER edit, not drift: it gets
 * mid-edit grace (nothing healed) and the paragraph pends, so caret departure settles it by
 * re-tokenizing the displayed bytes — `\q2` directly before `body` really does mean the marker
 * `q2body`, while `\p` directly before `\nd` tokenizes identically and heals. The same
 * tokenize-identity rule the char opener separator follows
 * (`separatorRemovalTokenizesIdentically`, `shared`), reached here through the paragraph-scoped
 * rebuild.
 */
function $healMarkerTrailingSeparator(para: ParaNode, context: MarkerEditContext): void {
  const glyph = para.getFirstChild();
  if (!glyph) return;
  const second = glyph.getNextSibling();
  if ($isMarkerTrailingSeparator(second)) return; // canonical separator present
  if (
    $isTextNode(second) &&
    !$isMarkerNode(second) &&
    /^[ \u00A0]$/.test(second.getTextContent())
  ) {
    // A single space right after the glyph is normally the user TYPING the separator back —
    // canonicalized in place below. But when this very commit carries a delete-key gesture with
    // the collapsed caret in this paragraph ($armCollapsedParaDeletion), the space is a CONTENT
    // byte that slid into the prefix gap as the separator before it was deleted — absorbing it
    // would turn a document byte into engine scaffolding, and the marker-deleted merge below
    // drops separators as orphaned display, so the byte would silently vanish from the file
    // (the Enter-Enter-then-backspace repro's eaten space). Provenance, not geometry: only the
    // delete gesture reroutes here; a typed space keeps the immediate canonicalize. Mid-edit
    // grace instead — pend, and let genuine caret departure settle the paragraph by
    // re-tokenizing the displayed bytes.
    if (context.collapsedDeleteCaretParas?.has(para.getKey())) {
      context.pendingKeys.add(para.getKey());
      return;
    }
    // Canonicalize the user's typed space into the separator instead of inserting a second one.
    second.setTextContent(NBSP);
    $setState(second, textTypeState, MARKER_TRAILING_SPACE_TEXT_TYPE);
    second.setMode("token");
    return;
  }
  if ($paraPrefixSeparatorCaretHeld(para)) {
    context.pendingKeys.add(para.getKey());
    return;
  }
  glyph.insertAfter($createMarkerTrailingSeparator());
}

/**
 * Whether `point` sits at `para`'s very `edge` — before its first byte ("start") or after its
 * last ("end"). Judged positionally: the point must be at its own node's matching edge, and that
 * node (and every ancestor up to `para`) must be the edge-most child, so the answer is right for
 * any content shape — glyph text, char spans, decorator atoms like a verse number.
 */
function $isPointAtParaEdge(point: PointType, para: ParaNode, edge: "start" | "end"): boolean {
  const node = point.getNode();
  if (node.is(para)) {
    return edge === "start" ? point.offset === 0 : point.offset === para.getChildrenSize();
  }
  const size =
    point.type === "text"
      ? node.getTextContentSize()
      : $isElementNode(node)
        ? node.getChildrenSize()
        : 0;
  if (edge === "start" ? point.offset !== 0 : point.offset !== size) return false;
  for (let current = node; !current.is(para); ) {
    if (edge === "start" ? current.getPreviousSibling() : current.getNextSibling()) return false;
    const parent = current.getParent();
    if (parent === null) return false; // the point is not inside `para` at all
    current = parent;
  }
  return true;
}

/** The paragraph `node` is, or the one it sits inside; `undefined` outside any paragraph. */
function $paraOf(node: LexicalNode): ParaNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isParaNode(current)) return current;
  }
  return undefined;
}

/**
 * The `ParaNode`s whose ENTIRE visible representation lies inside `selection`: every paragraph
 * the selection touches, except an edge paragraph the selection enters or leaves mid-way.
 * Candidates come from the selected nodes' paragraph ANCESTORS, not from the selected-node list
 * alone — `selection.getNodes()` never includes an element the anchor or focus sits inside, so a
 * selection covering exactly one paragraph reports only that paragraph's children.
 */
function $parasFullyCoveredBySelection(selection: RangeSelection): ParaNode[] {
  const isBackward = selection.isBackward();
  const start = isBackward ? selection.focus : selection.anchor;
  const end = isBackward ? selection.anchor : selection.focus;
  const candidates = new Set<ParaNode>();
  for (const node of selection.getNodes()) {
    const para = $paraOf(node);
    if (para) candidates.add(para);
  }
  return [...candidates].filter((para) => {
    const containsStart = $paraOf(start.getNode())?.is(para) ?? false;
    const containsEnd = $paraOf(end.getNode())?.is(para) ?? false;
    if (containsStart && !$isPointAtParaEdge(start, para, "start")) return false;
    if (containsEnd && !$isPointAtParaEdge(end, para, "end")) return false;
    return true;
  });
}

/**
 * Deletion driver, paragraph arm: records — BEFORE a user delete gesture executes — every
 * paragraph whose entire visible representation the live selection covers, into
 * `context.wholeParaDeleteExpected`. `$paraMarkerDeletionTransform` reads that provenance at the
 * end of the same commit to tell a user's completed whole-paragraph delete (reap it) apart from
 * transient emptiness (leave it alone). Paragraph equivalent of the display-run registry's
 * `remove-owner` deletion policy, keyed on the destruction gesture itself, never on caret
 * geometry.
 *
 * Mutating context state only (reads the editor): call from a command handler (delete keys, cut)
 * ahead of the handler that performs the deletion; never claims the event.
 */
export function $armWholeParaDeletion(context: MarkerEditContext): void {
  const expected = context.wholeParaDeleteExpected;
  if (!expected) return;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
  for (const para of $parasFullyCoveredBySelection(selection)) expected.add(para.getKey());
}

/**
 * Deletion driver, collapsed arm: records — BEFORE a collapsed-caret Backspace/Delete executes —
 * the paragraph the caret sits in, into `context.collapsedDeleteCaretParas`.
 * `$paraMarkerDeletionTransform`'s empty branch reads it exactly like the selection arm's set: a
 * paragraph the user was backspacing inside that ends the commit EMPTY has had its last displayed
 * byte deleted by that gesture (Enter-Enter then backspacing the fresh `\p ` prefix away), which
 * is the byte-by-byte completion of the same whole-representation deletion — so the paragraph
 * dissolves and the caret lands at the previous line's end. Keyed on the delete-key gesture, never
 * on caret geometry: a rebuild transiently emptying the caret's paragraph arms nothing.
 *
 * Mutating context state only (reads the editor): call from the delete-key KEY_DOWN handler ahead
 * of the handler that performs the deletion; never claims the event.
 */
export function $armCollapsedParaDeletion(context: MarkerEditContext): void {
  const armed = context.collapsedDeleteCaretParas;
  if (!armed) return;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  // Focus, not anchor, by the repo's caret convention — collapsed selections make them equal,
  // so this is future-proof rather than load-bearing.
  const para = $paraOf(selection.focus.getNode());
  if (para) armed.add(para.getKey());
}

/**
 * Deletion driver, replacement arm: typing over a non-collapsed selection IS
 * delete-the-selection-then-type, so a replacement whose selection covers marker-glyph bytes
 * performs the delete half HERE — the same arming as the delete keys, then `removeText()` —
 * and leaves the insertion to the default handler at the collapsed caret. Without this,
 * Lexical lands the typed text in the selection's anchor node: a fully-covered marker glyph is
 * resurrected carrying the typed character as its "renamed" text, so typing over a whole
 * `\q1 two` line produced a rename-in-progress paragraph instead of deleting it. A selection
 * that touches no glyph is left to the stock replacement, which is already delete-then-insert
 * for plain content; a PARTIALLY covered glyph keeps its surviving bytes and the typed text
 * joins them (`\` + typed `x` → the pending literal `\x`), exactly as delete-then-type implies.
 *
 * Mutating (arms context state and removes the selected text): call from a
 * CONTROLLED_TEXT_INSERTION_COMMAND handler registered above the default insertion and below
 * structure protection's block, never claiming the command.
 */
export function $prepareReplaceSelection(context: MarkerEditContext): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
  if (!selection.getNodes().some((node) => $isMarkerNode(node))) return;
  $armWholeParaDeletion(context);
  selection.removeText();
}

export function $paraMarkerDeletionTransform(para: ParaNode, context: MarkerEditContext): void {
  // Surfaces that opted out of paragraph marker prefixes (`showParaMarkerPrefixes: false`, e.g.
  // a footnote-editor popover whose lone paragraph is scaffolding) render no glyph for this
  // transform to police: a prefix-less paragraph is the CANONICAL shape there, not evidence the
  // user deleted its marker. Every branch below either heals a prefix or reacts to a missing one
  // (inject, merge into the previous paragraph, reset-with-prefix — each re-materializing the
  // bytes the option promises are never built), so the whole transform stands down.
  if (!showParaMarkerPrefix(context.viewOptions)) return;

  // Branch order is load-bearing. Heal-first is the termination anchor: injecting a prefix
  // (below) re-dirties the paragraph and re-enters this transform, and that re-entry must land
  // here and stop — with the injection branch checked first, every re-entry re-injected and the
  // transform looped endlessly.
  if ($isSynthesizedMarkerNode(para.getFirstChild())) {
    $healMarkerTrailingSeparator(para, context);
    return;
  }

  if (context.splitExpected.current) {
    // Fresh paragraph from an expected split (Enter, or a multi-line paste — both arm the
    // flag): insertNewAfter cloned the marker; make it visible. This runs
    // ahead of the isEmpty guard because an Enter split at a paragraph's content edge leaves a
    // DURABLY empty paragraph (the clone at the end, or the emptied original at the start) that
    // the user is about to type into. Skipping it as transient left it prefix-less, so the first
    // typed character made it non-empty without a prefix — read below as "marker deleted" and
    // merged straight back into the previous paragraph. The flag is deliberately NOT consumed
    // here: this transform is its only reader, both halves of a split can pass through in the
    // same commit, and the update listener resets it after every commit anyway.
    $injectMarkerPrefix(para);
    context.logger?.debug(`[MarkerEdit] injected prefix for split para "${para.getMarker()}"`);
    return;
  }

  if (para.isEmpty()) {
    // Emptiness alone is not evidence of anything: a rebuild legitimately empties a paragraph
    // before refilling it, so an unattributed empty paragraph is left for the pass that
    // repopulates it. Only PROVENANCE reaps, in either of its two forms: a user delete gesture
    // whose pre-delete selection covered this paragraph's entire visible representation
    // ($armWholeParaDeletion), or a collapsed-caret Backspace/Delete in this paragraph whose
    // commit ends with it empty ($armCollapsedParaDeletion — the last displayed byte went with
    // the last backspace). Both mean the user deleted the whole construct, and displayed bytes
    // are the document — the paragraph goes with its bytes instead of surviving as an invisible
    // line that still serializes its marker.
    const wholeSelectionArmed = context.wholeParaDeleteExpected?.has(para.getKey()) ?? false;
    const collapsedArmed = context.collapsedDeleteCaretParas?.has(para.getKey()) ?? false;
    if (!wholeSelectionArmed && !collapsedArmed) return;
    context.wholeParaDeleteExpected?.delete(para.getKey());
    context.collapsedDeleteCaretParas?.delete(para.getKey());
    const isLastPara = !para
      .getParent()
      ?.getChildren()
      .some((sibling) => $isParaNode(sibling) && !sibling.is(para));
    if (isLastPara) {
      // The document keeps at least one paragraph: the survivor of a delete-everything gesture
      // resets to the default marker with its visible prefix, ready to type into — the same
      // fallback as deleting a lone paragraph's marker.
      $setParaMarkerWithPrefix(para, PARA_MARKER_DEFAULT);
      context.logger?.debug(`[MarkerEdit] whole-para delete of the last para: reset to \\p`);
      return;
    }
    para.remove();
    context.logger?.debug(`[MarkerEdit] removed para whose whole representation was deleted`);
    return;
  }

  const previous = para.getPreviousSibling();
  if ($isParaNode(previous)) {
    // Deleting a para's marker text merges its content into the previous para.
    const children = para.getChildren().filter((child) => {
      if ($isMarkerTrailingSeparator(child)) return false; // drop the orphaned separator
      return true;
    });
    // A caret in a MOVED child follows the move on its own (moved nodes keep their keys). A
    // caret the merge would ORPHAN — an element point on the dissolving paragraph itself (where
    // deleting the last prefix glyph byte leaves it), or a point in a dropped separator — must
    // be placed explicitly, at the JUNCTION: the boundary before the first moved child, the
    // position the deleted representation occupied. Without this, removing the paragraph let
    // Lexical relocate the point arbitrarily (observed: flung to the merged paragraph's end).
    const selection = $getSelection();
    let caretOrphaned = false;
    if ($isRangeSelection(selection) && selection.isCollapsed()) {
      const anchorNode = selection.anchor.getNode();
      if (anchorNode.is(para)) caretOrphaned = true;
      else if ($paraOf(anchorNode)?.is(para))
        caretOrphaned = !children.some(
          (child) =>
            anchorNode.is(child) ||
            ($isElementNode(child) && anchorNode.getParents().some((parent) => parent.is(child))),
        );
    }
    const junctionIndex = previous.getChildrenSize();
    previous.append(...children); // moved nodes keep their keys; selection follows
    para.remove();
    if (caretOrphaned) $placeCaretAtBoundary(previous, junctionIndex);
    context.logger?.debug(`[MarkerEdit] merged marker-deleted para into previous`);
    return;
  }

  // No previous paragraph to merge into: fall back to the default marker, visibly.
  $setParaMarkerWithPrefix(para, PARA_MARKER_DEFAULT);
}

/** The canonical `|…` attribute bytes for a span whose glyphs are being dropped (PT9 keeps these
 * as literal bytes when the span is unwrapped), or `undefined` when there are none. Routed through
 * {@link canonicalAttributeText} — the one PT9 serializer — so the reconstructed bytes are
 * byte-identical to the span's own display run (a lone default attribute collapses to `|value`,
 * everything else is `|name="value" …`) rather than a second, divergent rendering. `closed` is
 * excluded there: it is derived USJ metadata (ParatextData emits `closed="false"` on char spans
 * with no explicit closing marker — extremely common on footnote-content chars like `\fr`/`\ft`),
 * not user bytes, and paranext-core's USFM writer likewise never emits it as an attribute. */
function unknownAttributesText(char: CharNode): string | undefined {
  const attributes = char.getUnknownAttributes();
  if (!attributes) return undefined;
  const text = canonicalAttributeText(attributes, defaultMarkerAttribute(char.getMarker()));
  return text === "" ? undefined : text;
}

/** Move a char span's content out and drop the span (opener deleted / Ctrl+Space). */
export function $unwrapCharNode(char: CharNode): void {
  // Drop the display run (textType "attribute") alongside the marker glyphs: it is a derived
  // cache of the span's attribute state, not content. Keeping it would leave its bytes in the
  // paragraph AND have the reconstruction below re-emit the same bytes — duplicating the
  // attribute text on every opener-deletion unwrap.
  const children = char
    .getChildren()
    .filter((child) => !$isMarkerNode(child) && $getState(child, textTypeState) !== "attribute");
  const first = children[0];
  if (first && $isTextNode(first) && first.getTextContent().startsWith(NBSP))
    first.setTextContent(first.getTextContent().slice(1)); // structural NBSP prefix
  // PT9 leaves an unknown-attribute span's attributes as literal bytes on unwrap. The char node
  // is about to be dropped, so reconstruct the canonical `|…` suffix as plain text after the
  // content (where the closer glyph used to be) so the bytes survive serialization.
  const attributesText = unknownAttributesText(char);
  if (attributesText) children.push($createTextNode(attributesText));
  // Reinsert AFTER the span (in order), then drop the span — never insertBefore. The tree comes
  // out identical either way, but not the caret: a collapsed ELEMENT point at the span's own
  // boundary (the content-start placement a same-commit paragraph split parks there) is advanced
  // by Lexical past every node inserted AT its offset and is not pulled back by the wrapper's
  // removal, so before-insertion dragged the caret to the far side of the unwrapped content.
  // After-insertion leaves the point where it is; removing the span then resolves it onto the
  // first reinserted child — the content start the caret meant all along.
  let anchor: LexicalNode = char;
  for (const child of children) {
    anchor.insertAfter(child);
    anchor = child;
  }
  char.remove();
}

/**
 * A note is an atomic object in the text —
 * PT9 deletes the whole footnote when any part of it is deleted. In editable marker mode a
 * collapsed note carries its `\f`/`\f*` glyphs as its first/last children; Backspace right
 * after the note deletes the closing glyph (and forward-Delete before it deletes the opener).
 * Without this transform the damaged note then spilled its internals into the paragraph as
 * literal glyph text (`\fr 8.4 \ft \f*` — live-verified data corruption), which the
 * re-tokenizer would settle into phantom markers. A glyph pair that is damaged on one side
 * only means the user deleted "half the pair": remove the whole note, PT9-style. Notes with
 * NO glyphs at all (shapes built by non-editable creation paths) are left alone.
 *
 * EXPANDED notes (inline-editable zone) get the same PT9 outcome for their only deletable
 * marker handle: deleting the opening glyph removes the whole note. Damage is detected by the
 * missing OPENER only — an UNCLOSED note (its normal shape after typing a bare `\f `)
 * legitimately has no closing glyph, so a collapsed-style opener-XOR-closer rule would wrongly
 * delete every intact unclosed note. The editable-built shape is recognized by its caller text
 * (`getEditableCallerText`); without that anchor (caller-less or non-editable-built shapes)
 * the note is left alone. Without this, the glyph-deleted NoteNode survived and serialization
 * regenerated `\f caller` forever while the orphaned caller spilled into the paragraph
 * (live-observed `tell,~tell,~…` accumulation).
 */
export function $noteDeletionTransform(note: NoteNode, context: MarkerEditContext): void {
  // Detect glyphs by PRESENCE among the direct children, not by first/last POSITION: a
  // stray leading TextNode (the user typed at the note's start — the transient NoteNodePlugin's
  // `$noteNodeTransform` salvages by moving that text out) leaves the opener glyph intact but no
  // longer first. A first/last check would read that as "opener deleted" and remove the whole
  // note before the salvage runs (MarkerEditPlugin's NoteNode transform is registered first, and
  // Lexical breaks the transform loop once `note.remove()` detaches the node) — destroying the
  // footnote's `\fr`/`\ft` content on a single keystroke.
  const children = note.getChildren();
  const hasOpener = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "opening");

  if (note.getIsCollapsed() !== true) {
    if (hasOpener) return; // intact — unclosed expanded notes have no closer by construction
    // Recognize an editable-built note by ANY marker-glyph evidence: the editable caller text,
    // a closing glyph, or a MarkerNode anywhere in the subtree (content char spans carry their
    // own glyphs). A single evidence anchor (caller only) is not enough: a RANGE deletion
    // across `\f caller` removes the opener AND the caller in one edit. Notes with no glyph
    // evidence at all (shapes built by non-editable creation paths) are left alone, as for
    // collapsed.
    const caller = note.getCaller();
    const hasEditableCaller =
      caller !== "" &&
      children.some(
        (c) =>
          $isTextNode(c) &&
          !$isMarkerNode(c) &&
          c.getTextContent() === getEditableCallerText(caller),
      );
    const hasAnyMarkerGlyph = $dfs(note).some(({ node: n }) => $isMarkerNode(n));
    if (!hasEditableCaller && !hasAnyMarkerGlyph) return; // glyph-less shape — not ours
    // UNWRAP, don't delete: an expanded note's content is visible inline (an unclosed note may
    // have absorbed the rest of the verse), so deleting the `\f` marker deletes ONLY the marker.
    // The note node dissolves: the editable caller returns to plain text (its structural NBSP
    // becomes a plain space so it can't leak into USJ as `~`), remaining glyphs go with the
    // note, and the content stays in the paragraph. Contrast: a COLLAPSED note is an atomic
    // object — glyph damage removes the whole note (below).
    children.forEach((child) => {
      if ($isMarkerNode(child)) return; // closing glyph (if any) dissolves with the note
      if ($isTextNode(child) && child.getTextContent() === getEditableCallerText(caller))
        child.setTextContent(` ${caller} `);
      note.insertBefore(child);
    });
    note.remove();
    context.logger?.debug(
      `[MarkerEdit] unwrapped expanded note whose opening glyph was deleted (content preserved)`,
    );
    return;
  }

  const hasCloser = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing");
  if (hasOpener === hasCloser) return; // intact pair, both-gone, or a glyph-less shape — not ours
  note.remove();
  context.logger?.debug(`[MarkerEdit] removed collapsed note with damaged glyph pair`);
}

export function $charNodeDeletionTransform(char: CharNode, context: MarkerEditContext): void {
  if (char.isEmpty()) return; // CharNodePlugin removes empty spans
  const first = char.getFirstChild();
  const hasOpener = $isMarkerNode(first) && first.getMarkerSyntax() === "opening";
  if (!hasOpener) {
    $unwrapCharNode(char); // opener deleted -> unwrap the span
    context.logger?.debug(`[MarkerEdit] unwrapped char span "${char.getMarker()}"`);
    return;
  }
  // A span "needs" a closer iff it is not marked closed="false": that flag (which ParatextData
  // emits on every genuinely-unclosed span, footnote/cross-ref content included) means the missing
  // closer is the span's normal shape, not deletion damage. Closer-ness keys on this actual state,
  // never on the marker family — an explicitly-closed \xt DOES need its closer, so deleting it must
  // still re-route through Tier 2.
  const needsCloser = char.getUnknownAttributes()?.closed !== "false";
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  if (needsCloser && !hasCloser) {
    // Closer deletion goes through Tier 2 (tokenizer decides the span extent).
    $requestTier2ForNode(char, context);
  }
}
