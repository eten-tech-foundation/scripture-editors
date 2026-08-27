/**
 * The character-style STACK: closing every char span open at a point and reopening the ones that
 * still have content after it. Sibling of charGlyphs.utils.ts, which owns the shape of each span
 * this module builds.
 *
 * ## Why one primitive
 *
 * Paratext 9 has no bespoke algorithm for this. Its `StyleApplicator` closes the open character
 * styles before the point and reopens the still-active ones after it, and every operation that
 * interrupts styled text — applying a non-nesting style, an unformatted space, a footnote-paragraph
 * break, a paragraph split — is the same close-and-reopen with a different thing placed in the gap.
 * Reimplemented per caller, that operation came out right in one place and wrong in four.
 *
 * ## Ordering falls out of the loop, not out of ordering code
 *
 * {@link $liftOutOfChar} closes the ONE span holding the node and reopens a continuation after it.
 * {@link $liftOutOfCharStack} iterates that outwards. Each iteration's continuation lands in the
 * next iteration's "content after the node" set, so the closers emerge innermost-to-outermost and
 * the openers outermost-to-innermost with no explicit ordering step:
 *
 * ```
 * \wj \+nd thing\+nd*\wj*   ->   \wj \+nd thi\+nd*\wj* <node> \wj \+nd ng\+nd*\wj*
 * ```
 *
 * PT9 gets the reopen order WRONG for nested styles — its reopen loop walks the style list
 * innermost-first and emits index 0 without the `+`, so a two-deep stack comes back with the
 * markers swapped. That path has no PT9 test coverage. We port the intent, not the code.
 */

import { $createMarkerNode, $isMarkerNode } from "../features/MarkerNode.js";
import {
  $buildContinuationCharSpan,
  $charOwesClosingGlyph,
  $continuationCharAttributes,
} from "./charGlyphs.utils.js";
import { $createCharNode, $isCharNode, CharNode } from "./CharNode.js";
import { $isSeparatorPrefixHostText } from "./markerSeparators.utils.js";
import { $isNestedCharNode } from "./nestedGlyphs.utils.js";
import { canonicalAttributeText } from "./attributeDisplay.utils.js";
import { textTypeState } from "../collab/delta.state.js";
import { defaultMarkerAttribute } from "../../converters/usfm/usfmFragmentToUsj.js";
import { NBSP } from "./node-constants.js";
import { $findMatchingParent } from "@lexical/utils";
import { $createTextNode, $getState, $isElementNode, $isTextNode, LexicalNode } from "lexical";

/** How a lift treats the gap it opens in a character-style stack. */
export interface CharStackLiftOptions {
  /**
   * Whether this document displays char glyphs (markerMode "editable"). A `MarkerNode` is
   * "editable" presentation, so fabricating one in "hidden"/"visible" mode would put literal
   * `\ft ` text into the content. A span always reopens STRUCTURALLY; this decides only whether
   * the reopened clone carries the VISIBLE `\marker` opener and its separator NBSP.
   */
  renderGlyphs: boolean;
  /**
   * Whether the thing being placed in the gap is unable to TERMINATE the span it interrupts, so
   * an implicitly-closed span (`closed="false"`) must be left explicitly closed on the way out.
   *
   * The two answers are not a detail of nesting; they are two different gestures. A note-content
   * marker (`\fq`, `\fp`, `\xt`) ends the span it is written inside just by being written, so
   * inserting one emits nothing extra ({@link $endsImplicitly}). Anything else — Ctrl+Space's
   * unformatted space, or text pulled out of a style — does not: `\ft` runs on to the next note
   * marker or `\f*`, so bytes merely placed after its content re-read as MORE of that content and
   * the gesture never reaches the file. Such a caller passes `true`, and the span gets a real
   * closing marker; the continuation reopens implicitly as before.
   *
   * Defaults to false: a caller that puts a marker in the gap must not start emitting closers.
   */
  closeImplicitSpans?: boolean;
}

/**
 * The innermost char span a point sits in: the nearest `CharNode` at or above `node`, or
 * `undefined` when the point is not inside one.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $innermostCharAncestor(node: LexicalNode): CharNode | undefined {
  return $findMatchingParent(node, $isCharNode) ?? undefined;
}

/**
 * Where a lifted node comes to rest: the nearest non-char ancestor of `node` — the note or
 * paragraph a bare marker would land in. Returns `node`'s own parent when `node` is not inside a
 * char span at all.
 *
 * Deliberately NOT delegated to `$findMatchingParent`: for a root-level char span the resting
 * place is the RootNode itself, which `$findMatchingParent` never yields (it stops before testing
 * the root).
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $charStackContainer(node: LexicalNode): LexicalNode | null {
  let parent: LexicalNode | null = node.getParent();
  while ($isCharNode(parent)) parent = parent.getParent();
  return parent;
}

/**
 * Whether `char` holds no CONTENT — only its own glyphs and the structural NBSP separator those
 * glyphs own (markerSeparators.utils.ts). Such a span serializes to `\nd \nd*`: a marker pair
 * around nothing, which is not what the user asked for when a close-and-reopen happened to land at
 * a run's edge. A genuine space is content and does NOT make a span empty — only the NBSP does.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $isCharContentEmpty(char: CharNode): boolean {
  // The display run is a rendering of the span's attribute state, not content — a span holding
  // nothing but its own `|name="value"` bytes has had its content taken away and is empty. Only a
  // span that closes explicitly can own a run at all ({@link $ownsDisplayRun}); inside an
  // implicitly-closed one, `attribute`-tagged text is ordinary content.
  const ownsDisplayRun = $ownsDisplayRun(char);
  return char
    .getChildren()
    .every(
      (child) =>
        $isMarkerNode(child) ||
        (ownsDisplayRun && $getState(child, textTypeState) === "attribute") ||
        ($isTextNode(child) && child.getTextContent().replaceAll(NBSP, "") === ""),
    );
}

/**
 * Whether `char` can own a display run at all. The run is anchored to the closing glyph, and a
 * `closed="false"` span renders neither (attributeDisplay.utils.ts), so inside one — note content,
 * chiefly — `attribute`-tagged text is not a run but ordinary content.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $ownsDisplayRun(char: CharNode): boolean {
  return $charOwesClosingGlyph(char);
}

/**
 * Remove `char`, leaving its attribute bytes behind as plain text after `contentEnd` when it has
 * any. Paratext 9 keeps an unwrapped span's attributes as literal bytes, and the span is the only
 * thing that carried them — dropping it silently would delete `|lemma="grace"` from the file.
 * Routed through {@link canonicalAttributeText}, the same one serializer `$unwrapCharNode` uses, so
 * the two paths cannot spell the same attributes differently: a lone default attribute collapses to
 * `|value`, anything else stays `|name="value" …`.
 *
 * Mutating: call inside `editor.update()`.
 */
function $removeCharKeepingAttributeBytes(char: CharNode, contentEnd: LexicalNode): void {
  const attributes = char.getUnknownAttributes();
  const bytes = attributes
    ? canonicalAttributeText(attributes, defaultMarkerAttribute(char.getMarker()))
    : "";
  if (bytes !== "") contentEnd.insertAfter($createTextNode(bytes));
  char.remove();
}

/**
 * Leave `char` EXPLICITLY closed: drop the `closed="false"` convention it was carrying and, where
 * this document renders glyphs, give it the closing glyph that state now owes. Already-explicit
 * spans are untouched.
 *
 * The state is the load-bearing half — it is what serializes — and the glyph follows it, the same
 * pairing `$charOwesClosingGlyph` reads everywhere else. Leaving one without the other makes the
 * marker-edit engine read the mismatch as deletion damage.
 *
 * Mutating: call inside `editor.update()`.
 */
function $closeCharExplicitly(char: CharNode, renderGlyphs: boolean): void {
  if ($charOwesClosingGlyph(char)) return;
  const attributes = char.getUnknownAttributes();
  if (attributes) {
    const rest = { ...attributes };
    delete rest.closed;
    char.setUnknownAttributes(Object.keys(rest).length > 0 ? rest : undefined);
  }
  if (renderGlyphs)
    char.append($createMarkerNode(char.getMarker(), "closing", $isNestedCharNode(char)));
}

/**
 * Whether writing `node`'s own opening marker is ITSELF how `char` ends, so there is nothing to
 * close and nothing to reopen.
 *
 * True when both spans close implicitly — the `closed="false"` convention ParatextData stamps on
 * note-content and cross-reference markers (`\ft`, `\fq`, `\fr`, `\fp`, `\xt`, …), which are
 * terminated by the next bare marker rather than by an end marker. Putting `\fq` at a caret inside
 * `\ft` therefore emits no `\ft*` and no reopened `\ft`: the remainder of `\ft`'s content simply
 * belongs to `\fq` now.
 *
 * False whenever either side closes explicitly. An explicitly-closed `char` (`\wj`) must emit its
 * `\wj*` and reopen afterwards, because the new marker cannot terminate it; and an
 * explicitly-closed `node` (`\add`) ends at its own `\add*`, so `char`'s remaining content is not
 * part of it and does need reopening.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $endsImplicitly(node: LexicalNode, char: CharNode): node is CharNode {
  return $isCharNode(node) && !$charOwesClosingGlyph(node) && !$charOwesClosingGlyph(char);
}

/**
 * Move `content` into `span`, which is a freshly built, still content-less marker taking over the
 * remainder of the span it just ended ({@link $endsImplicitly}). Any placeholder the builder gave
 * `span` is dropped so the moved nodes become its real content, and a leading text run takes the
 * structural separator the opening glyph owes it (markerSeparators.utils.ts) — the same shape
 * {@link $buildContinuationCharSpan} gives a reopened clone.
 *
 * Mutating: call inside `editor.update()`.
 */
function $absorbIntoCharSpan(span: CharNode, content: LexicalNode[], renderGlyphs: boolean): void {
  if ($isCharContentEmpty(span))
    span.getChildren().forEach((child: LexicalNode) => {
      if (!$isMarkerNode(child)) child.remove();
    });
  // Only PLAIN leading text takes the separator as its prefix — the same host predicate the
  // separator sync uses ($isSeparatorPrefixHostText): TextNode subclasses (VerseNode,
  // ImmutableUnmatchedNode) render their own marker bytes and attribute runs are engine-owned
  // canonical output, so splicing an NBSP into either rewrites a glyph or corrupts the run.
  // Everything else gets its standalone spacer from `$syncOpenerSeparators` on the next dirty.
  const [first] = content;
  if (renderGlyphs && $isSeparatorPrefixHostText(first) && !first.getTextContent().startsWith(NBSP))
    first.setTextContent(NBSP + first.getTextContent());
  span.append(...content);
}

/**
 * Lift `node` OUT of the char span `char` to `char`'s parent, splitting `char` around it: content
 * before `node` stays in `char` (its "before" half), content after `node` moves to a fresh reopened
 * clone inserted after `node`, and `node` itself becomes a sibling of `char`. A half left with no
 * content ({@link $isCharContentEmpty}) is dropped rather than serialized as an empty marker pair.
 * The reopened clone keeps `char`'s marker, closer convention, and nesting (its glyphs carry the
 * `+` when `char` was itself nested).
 *
 * The one shape with no reopened clone is a `node` that ends `char` implicitly
 * ({@link $endsImplicitly}): there the content after `node` moves INTO it instead.
 *
 * An implicitly-closed `char` is left EXPLICITLY closed when `options.closeImplicitSpans` says the
 * gap cannot terminate it — see {@link CharStackLiftOptions}, which also documents `renderGlyphs`.
 *
 * Mutating: call inside `editor.update()`.
 */
export function $liftOutOfChar(
  node: LexicalNode,
  char: CharNode,
  options: CharStackLiftOptions,
): void {
  const { renderGlyphs, closeImplicitSpans = false } = options;
  // Content strictly after `node`. Two kinds of child stay behind rather than move: `char`'s own
  // closing glyph, which terminates the "before" half (the clone gets a fresh one of its own), and
  // its display run — the `|name="value"` bytes are a rendering of `char`'s OWN attribute state,
  // which stays on `char` (`$continuationCharAttributes` deliberately does not copy it, since
  // duplicating it would double those bytes on serialization). Carrying the bytes to the clone
  // left the attributes displayed on a span that does not have them and missing from the span that
  // does — the same content-versus-presentation split `$unwrapCharNode` makes.
  //
  // Only a span that closes EXPLICITLY can own a display run ({@link $ownsDisplayRun}). So inside
  // an implicitly-closed one — note content, chiefly — `attribute`-tagged text is not a run and is
  // ordinary content that must ride along with everything else after the caret.
  const ownsDisplayRun = $ownsDisplayRun(char);
  const after: LexicalNode[] = [];
  for (let sibling = node.getNextSibling(); sibling; ) {
    const next = sibling.getNextSibling();
    const isCloser = $isMarkerNode(sibling) && sibling.getMarkerSyntax() === "closing";
    const isDisplayRun = ownsDisplayRun && $getState(sibling, textTypeState) === "attribute";
    if (!isCloser && !isDisplayRun) after.push(sibling);
    sibling = next;
  }
  const endsImplicitly = $endsImplicitly(node, char);
  char.insertAfter(node); // node leaves char, becomes its next sibling
  // Where whatever came out of `char` ends, so a dropped span's attribute bytes land after its
  // former content rather than in front of it.
  let contentEnd: LexicalNode = node;
  if (after.length > 0) {
    if (endsImplicitly) {
      $absorbIntoCharSpan(node, after, renderGlyphs);
    } else {
      const right = $createCharNode(char.getMarker(), $continuationCharAttributes(char));
      $buildContinuationCharSpan(right, char, after, renderGlyphs);
      node.insertAfter(right);
      if ($isCharContentEmpty(right)) right.remove();
      else contentEnd = right;
    }
  }
  // The gap cannot terminate `char` on its own, so an implicitly-closed one has to be closed for
  // real: `\ft` runs to the next note marker or `\f*`, and anything merely placed after its
  // content would re-read as more of that content. Done AFTER the continuation is built, which
  // takes its own closing glyph from `char`'s children — the continuation reopens implicitly, as
  // the span it continues did.
  if (closeImplicitSpans && !endsImplicitly) $closeCharExplicitly(char, renderGlyphs);
  if ($isCharContentEmpty(char)) $removeCharKeepingAttributeBytes(char, contentEnd);
}

/**
 * Lift `node` out of EVERY char span enclosing it, closing each on the way out and reopening the
 * ones with content after it — the whole close-and-reopen. `node` comes to rest in the nearest
 * non-char container ({@link $charStackContainer}), carrying with it the content of any span it
 * ended implicitly on the way ({@link $endsImplicitly}).
 *
 * Callers that place something in the gap (an unformatted space, a new non-nesting char span, a
 * paragraph-split marker) insert it at the caret first and lift THAT; the caret point they want
 * afterwards differs per caller, so this function deliberately does not move the selection.
 *
 * @param node - The node to lift. Must already be attached at the point the gap belongs.
 * @param options - How the gap is treated; see {@link CharStackLiftOptions}.
 *
 * Mutating: call inside `editor.update()`.
 */
export function $liftOutOfCharStack(node: LexicalNode, options: CharStackLiftOptions): void {
  let parent = node.getParent();
  while ($isCharNode(parent)) {
    $liftOutOfChar(node, parent, options);
    parent = node.getParent();
  }
}

/**
 * Put the caret at the START of `node`'s content — immediately after the structural separator the
 * opening glyph owns, and descending through nested spans to the innermost one. This is where
 * typing belongs after a close-and-reopen: the user interrupted the text at that point, so the
 * next keystroke continues the reopened run rather than landing outside it. Offset 0 would sit
 * BEFORE the separator, splicing typed text between the glyph and the space it owns.
 *
 * Mutating (moves the selection): call inside `editor.update()`.
 */
export function $selectCharContentStart(node: LexicalNode): void {
  if ($isTextNode(node) && !$isMarkerNode(node)) {
    const offset = node.getTextContent().startsWith(NBSP) ? 1 : 0;
    node.select(offset, offset);
    return;
  }
  if ($isElementNode(node)) {
    const first = node.getChildren().find((child: LexicalNode) => !$isMarkerNode(child));
    if (first) {
      $selectCharContentStart(first);
      return;
    }
    node.selectEnd(); // defensive: glyphs only, no content to sit in front of
  }
}
