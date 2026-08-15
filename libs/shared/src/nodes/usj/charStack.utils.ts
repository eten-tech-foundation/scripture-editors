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

import { $isMarkerNode } from "../features/MarkerNode.js";
import { $buildContinuationCharSpan, $continuationCharAttributes } from "./charGlyphs.utils.js";
import { $createCharNode, $isCharNode, CharNode } from "./CharNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { NBSP } from "./node-constants.js";
import { $getState, $isTextNode, LexicalNode } from "lexical";

/**
 * The innermost char span a point sits in: the nearest `CharNode` at or above `node`, or
 * `undefined` when the point is not inside one.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $innermostCharAncestor(node: LexicalNode): CharNode | undefined {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isCharNode(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

/**
 * Where a lifted node comes to rest: the nearest non-char ancestor of `node` — the note or
 * paragraph a bare marker would land in. Returns `node`'s own parent when `node` is not inside a
 * char span at all.
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
  return char
    .getChildren()
    .every(
      (child) =>
        $isMarkerNode(child) ||
        ($isTextNode(child) && child.getTextContent().replaceAll(NBSP, "") === ""),
    );
}

/**
 * Lift `node` OUT of the char span `char` to `char`'s parent, splitting `char` around it: content
 * before `node` stays in `char` (its "before" half), content after `node` moves to a fresh reopened
 * clone inserted after `node`, and `node` itself becomes a sibling of `char`. A half left with no
 * content ({@link $isCharContentEmpty}) is dropped rather than serialized as an empty marker pair.
 * The reopened clone keeps `char`'s marker, closer convention, and nesting (its glyphs carry the
 * `+` when `char` was itself nested).
 *
 * `renderGlyphs` decides only whether the clone carries the VISIBLE `\marker` opener and its
 * separator NBSP — a `MarkerNode` is markerMode "editable" presentation, so fabricating one in
 * "hidden"/"visible" mode would put literal `\ft ` text into the content. The clone always reopens
 * STRUCTURALLY; that is the operation, and it happens in every marker mode.
 *
 * Mutating: call inside `editor.update()`.
 */
export function $liftOutOfChar(node: LexicalNode, char: CharNode, renderGlyphs: boolean): void {
  // Content strictly after `node`. Two kinds of child stay behind rather than move: `char`'s own
  // closing glyph, which terminates the "before" half (the clone gets a fresh one of its own), and
  // its display run — the `|name="value"` bytes are a rendering of `char`'s OWN attribute state,
  // which stays on `char` (`$continuationCharAttributes` deliberately does not copy it, since
  // duplicating it would double those bytes on serialization). Carrying the bytes to the clone
  // left the attributes displayed on a span that does not have them and missing from the span that
  // does — the same content-versus-presentation split `$unwrapCharNode` makes.
  const after: LexicalNode[] = [];
  for (let sibling = node.getNextSibling(); sibling; ) {
    const next = sibling.getNextSibling();
    const isCloser = $isMarkerNode(sibling) && sibling.getMarkerSyntax() === "closing";
    const isDisplayRun = $getState(sibling, textTypeState) === "attribute";
    if (!isCloser && !isDisplayRun) after.push(sibling);
    sibling = next;
  }
  char.insertAfter(node); // node leaves char, becomes its next sibling
  if (after.length > 0) {
    const right = $createCharNode(char.getMarker(), $continuationCharAttributes(char));
    $buildContinuationCharSpan(right, char, after, renderGlyphs);
    node.insertAfter(right);
    if ($isCharContentEmpty(right)) right.remove();
  }
  if ($isCharContentEmpty(char)) char.remove();
}

/**
 * Lift `node` out of EVERY char span enclosing it, closing each on the way out and reopening the
 * ones with content after it — the whole close-and-reopen. `node` comes to rest in the nearest
 * non-char container ({@link $charStackContainer}), unless `stopAt` names a span to stop inside.
 *
 * Callers that place something in the gap (an unformatted space, a new non-nesting char span, a
 * paragraph-split marker) insert it at the caret first and lift THAT; the caret point they want
 * afterwards differs per caller, so this function deliberately does not move the selection.
 *
 * @param node - The node to lift. Must already be attached at the point the gap belongs.
 * @param renderGlyphs - Whether this document displays char glyphs (markerMode "editable").
 * @param stopAt - Stop while `node` is still inside this span, instead of going all the way to the
 *   container. Used by the in-note break, which reopens the spans nested inside the note's content
 *   span but replaces that span itself.
 *
 * Mutating: call inside `editor.update()`.
 */
export function $liftOutOfCharStack(
  node: LexicalNode,
  renderGlyphs: boolean,
  stopAt?: LexicalNode,
): void {
  let parent = node.getParent();
  while ($isCharNode(parent) && !(stopAt && parent.is(stopAt))) {
    $liftOutOfChar(node, parent, renderGlyphs);
    parent = node.getParent();
  }
}
