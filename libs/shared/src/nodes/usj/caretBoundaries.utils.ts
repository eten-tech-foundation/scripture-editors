/**
 * Caret positions at a content boundary: the single place that owns HOW a boundary between an
 * element's children becomes a Lexical caret position, and WHICH node renders the caret there. A
 * "boundary" is the location just before a parent's child at some index — the location the child
 * count itself names being the end of the parent's content.
 *
 * Every path that parks a caret at the start of some content answers this same question, and each
 * one used to answer it by hand: the para-marker prefix cursor guard, the marker-edit prefix
 * injection, verse-start placement, and the `\fp` visual-line hop. The empty-verse caret guard asks
 * the other half of it — whether a boundary has a host at all — because that is exactly the state it
 * exists to repair.
 *
 * ## The convention
 *
 * - **A boundary is hosted by the text node that FOLLOWS it**, and a text point at that node's
 *   offset 0 is the caret position — not the end of whatever text precedes the boundary, and not the
 *   element point, even when a text node sits on both sides. The reason is what the caller is doing:
 *   it has chosen a boundary because the content AFTER it is where the user's next keystroke
 *   belongs, and at these boundaries what precedes is structure — a paragraph's marker glyph, its
 *   token-mode separator, a verse marker — that typed text must never merge into.
 * - **The element point is the fallback, and it renders no caret of its own.** Where the following
 *   child is a decorator (an immutable verse or chapter number, an immutable marker glyph) or where
 *   there is no child at all, the boundary can only be expressed as an element point, and the
 *   browser draws nothing at it. That is not a failure of this module — it is the condition
 *   `EmptyVerseCaretGuardPlugin` detects with {@link $caretHostAtBoundary} and repairs by
 *   materializing a text node to host the caret.
 * - **Hosting is a question about the TREE, not about the view.** A `MarkerNode` is a `TextNode`
 *   subclass, so an editable-mode marker glyph hosts a caret exactly as content text does. That is
 *   why one implementation serves every marker mode: it never asks which nodes are visible, only
 *   which node can carry a text point.
 *
 * ## What this module does NOT own
 *
 * WHICH boundary is the legal one. That rule is genuinely different in each caller, and deliberately
 * different per marker mode, so it is stated at each site rather than merged here:
 *
 * - `$guardCursorAtParaStart` (shared-react) rules that a click may not come to rest before or
 *   inside a paragraph's structural prefix, and advances FORWARD past it. It runs in every marker
 *   mode — it is what stops a click in the hanging-indent gutter of `\li`/`\ili`/poetry from landing
 *   before the marker — and its prefix scan therefore enumerates both marker flavors.
 * - `ArrowNavigationPlugin`'s visible-stop canonicalizer picks, among the tree positions sharing one
 *   screen location, the outermost and earliest: the end of the nearest PRECEDING visible text — the
 *   opposite preference to this module's, and correct there, because what precedes an arrow landing
 *   is rendered content the caret just walked over rather than structure. It is also scoped to
 *   markerMode "editable", where the display runs and glyph text that stack those positions exist at
 *   all. Merging the two preferences would be a behavior change in both directions.
 * - `$selectParaContentStart` (platform's marker-edit paths) knows its paragraphs have the fixed
 *   editable-mode `[glyph, separator, …content]` shape and names boundary 2 outright, where
 *   `$advancePastParaPrefixes` scans for its boundary. Same convention, different way of finding the
 *   index — which is precisely the part that is not shareable.
 *
 * Nor the mirror question, the caret position at the END of a node: `$placeCaretAtEnd`
 * (shared-react's structureKeyboard.utils.ts) owns that for the delete/merge paths, and it descends
 * into the node rather than resting at a boundary between children.
 */

import { $isTextNode, ElementNode, TextNode } from "lexical";

/**
 * The text node hosting a caret at the boundary before `parent`'s child at `index`, or `undefined`
 * when nothing there can carry a text point — a decorator child, or a boundary past the last child.
 *
 * Deliberately forward-looking: text preceding the boundary occupies the same screen location at its
 * own end, but it is not what this answers. See the module's convention.
 *
 * @param parent - The element whose children the boundary lies between.
 * @param index - The boundary: the index of the child that follows it.
 */
export function $caretHostAtBoundary(parent: ElementNode, index: number): TextNode | undefined {
  const child = parent.getChildAtIndex(index);
  return $isTextNode(child) ? child : undefined;
}

/**
 * Collapse the caret to the boundary before `parent`'s child at `index`: offset 0 of the text node
 * hosting it, or the element point when nothing hosts it.
 *
 * @param parent - The element whose children the boundary lies between.
 * @param index - The boundary: the index of the child that follows it.
 */
export function $placeCaretAtBoundary(parent: ElementNode, index: number): void {
  const host = $caretHostAtBoundary(parent, index);
  if (host) host.select(0, 0);
  else parent.select(index, index);
}
