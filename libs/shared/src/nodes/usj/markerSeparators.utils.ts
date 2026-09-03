/**
 * Editable-mode display separators after opening char glyphs: the single place that owns HOW the
 * space the user sees after `\nd` is represented and kept in sync. Sibling of
 * nestedGlyphs.utils.ts, which owns the glyph `+` the same way.
 *
 * ## The convention
 *
 * In editable marker mode an opening char glyph (`\nd`) is followed on screen by a separator —
 * the space PT9 shows and the serializer writes after the marker. That separator is
 * PRESENTATION-ONLY state: the USFM writer emits the space after an opening marker structurally
 * and the tokenizer consumes it, so no separator ever lives in USJ content or in the saved bytes
 * as data. In the editor it is an NBSP (never a plain space, so it cannot word-wrap away from its
 * glyph), stored as:
 *
 * - a prefix of the following text (`\nd` + `⍽one`) when the glyph is directly followed by plain
 *   text — the shape `createChar` (usj-editor.adaptor), `$splitCharNodeAt`, and the marker-apply
 *   paths build, and the reverse adaptor strips on save;
 * - a standalone NBSP text node when the glyph is directly followed by an element (a nested char
 *   span, note, milestone, or verse: `\nd` + `⍽` + `\+wj …`) — NBSP-only text nodes are
 *   presentation-only by convention (`$shouldIgnoreNodeForContentIndexes`) and dropped by the
 *   editor→USJ conversion.
 *
 * ## Keeping it in sync
 *
 * Builders construct the separator (transforms do not run on `setEditorState`, so loaded states
 * must render correctly as-is), and {@link $syncOpenerSeparators} — registered as a CharNode
 * transform in CharNodePlugin — re-derives it whenever a span is dirtied, healing paths that
 * restructure spans without rebuilding them through an adaptor. Deleting the separator is
 * semantically a no-op (the writer emits the space regardless), so healing it back is display
 * canonicalization, exactly like Tier-2's rebuild produces — but deleting must still be
 * ALLOWED: while the collapsed caret sits at the deletion point the sync leaves the gap alone
 * (mid-edit grace), and the marker-edit engine settles it back on caret departure by pending
 * spans reported by {@link $hasCaretHeldSeparatorGap} into its Tier-2 completion path.
 *
 * Only char-span glyphs take a separator — a milestone's display run inside a span is left
 * alone — so which glyphs qualify is decided by the same classifier the nested-`+` sync uses
 * ({@link $charGlyphNestedValue}).
 */

import { $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { CharNode } from "./CharNode.js";
import { $charGlyphNestedValue } from "./nestedGlyphs.utils.js";
import { NBSP } from "./node-constants.js";
import {
  $createTextNode,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";

/**
 * Whether `node` is text that may carry a char-span separator NBSP as its own PREFIX: exactly a
 * plain `TextNode` — subclasses (`VerseNode`, `ImmutableUnmatchedNode`, `MarkerNode`) render their
 * own marker bytes, and splicing an NBSP into those rewrites a glyph — and not an attribute
 * display run (textType "attribute"), whose `|…` bytes are engine-owned canonical output that an
 * NBSP prefix would corrupt. THE one predicate for every site that splices a separator into
 * leading text ({@link $openerSeparatorGap} here, plus the continuation/absorb span builders in
 * charGlyphs.utils.ts and charStack.utils.ts), so the rule cannot drift between them; anything
 * else takes a standalone NBSP spacer instead.
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
export function $isSeparatorPrefixHostText(node: LexicalNode | null | undefined): node is TextNode {
  return (
    $isTextNode(node) &&
    node.getType() === TextNode.getType() &&
    $getState(node, textTypeState) !== "attribute"
  );
}

/**
 * Where a separator is missing after `opener` (a direct child of `char`):
 *
 * - `"prefix"` — the glyph is followed by plain text that lacks the NBSP prefix;
 * - `"spacer"` — the glyph is followed by an element (or, in the collab-flattened shape, a nested
 *   span's opening glyph) with no standalone NBSP spacer between them;
 * - `undefined` — no separator is owed: the glyph is not a char-span glyph (a milestone's display
 *   run), has nothing after it, sits directly before a non-nested glyph, or its separator exists.
 */
function $openerSeparatorGap(opener: MarkerNode, char: CharNode): "prefix" | "spacer" | undefined {
  if (opener.getMarkerSyntax() !== "opening") return undefined;
  // Only char-span glyphs take a separator (not a milestone's display run).
  if ($charGlyphNestedValue(opener, char) === undefined) return undefined;
  const next = opener.getNextSibling();
  if (next === null) return undefined;
  if ($isMarkerNode(next)) {
    // Opening glyph directly before another glyph: in the collab-flattened shape that next glyph
    // opens a nested span (`\add\+wj …`) and the separator goes between them. Any other adjacent
    // glyph (the span's own closer on a degenerate empty span) takes none.
    return $charGlyphNestedValue(next, char) === true ? "spacer" : undefined;
  }
  // Plain text directly after the glyph carries the separator as its prefix — see
  // $isSeparatorPrefixHostText for what qualifies and why.
  if ($isSeparatorPrefixHostText(next))
    return next.getTextContent().startsWith(NBSP) ? undefined : "prefix";
  // Element content (nested char span, note, milestone, verse), TextNode subclasses, and
  // attribute-run text: standalone NBSP spacer.
  return "spacer";
}

/**
 * The displayed bytes immediately after `char`'s first missing-separator site, or `undefined`
 * when every opening glyph's separator is present (or none is owed). This is the input the
 * tokenize-identity predicate (`separatorRemovalTokenizesIdentically`, the fragment tokenizer's
 * sibling) needs to decide whether the missing byte may be healed in place or the bytes now mean
 * something new and must re-tokenize. Read-only: call inside `editor.getEditorState().read(...)`
 * or an update.
 */
export function $openerSeparatorGapFollowingBytes(char: CharNode): string | undefined {
  if (!char.isAttached()) return undefined;
  for (const child of char.getChildren()) {
    if (!$isMarkerNode(child)) continue;
    if ($openerSeparatorGap(child, char) === undefined) continue;
    return child.getNextSibling()?.getTextContent() ?? "";
  }
  return undefined;
}

/**
 * Whether the collapsed caret sits at `opener`'s separator site — on the glyph itself, on the
 * span (an element point), or at the very start of the node after the glyph. This is where the
 * caret lands when the user deletes the separator, and deleting must always be allowed: while
 * the caret stays here the sync leaves the gap alone (mid-edit grace), and the marker-edit
 * engine settles the span back to canonical on caret departure (it pends spans reported by
 * {@link $hasCaretHeldSeparatorGap} and routes them to a Tier-2 rebuild, the same completion
 * path as a pending marker literal).
 */
function $isCaretAtOpenerBoundary(opener: MarkerNode, char: CharNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (anchorNode.is(opener) || anchorNode.is(char)) return true;
  const next = opener.getNextSibling();
  return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
}

/**
 * Ensure every opening char glyph among `char`'s direct children is followed by its display
 * separator — except one whose separator site holds the collapsed caret (see
 * {@link $isCaretAtOpenerBoundary}). Idempotent — a healed span passes untouched, so the
 * registering transform converges.
 *
 * @param char - The char span whose separators to sync. Must be called inside `editor.update()`.
 */
export function $syncOpenerSeparators(char: CharNode): void {
  // An earlier transform in the same pass may have merged/removed the span.
  if (!char.isAttached()) return;
  char.getChildren().forEach((child: LexicalNode) => {
    if (!$isMarkerNode(child)) return;
    const gap = $openerSeparatorGap(child, char);
    if (gap === undefined) return;
    if ($isCaretAtOpenerBoundary(child, char)) return;
    if (gap === "prefix") {
      const next = child.getNextSibling();
      if ($isTextNode(next)) next.setTextContent(NBSP + next.getTextContent());
    } else {
      child.insertAfter($createTextNode(NBSP));
    }
  });
}

/**
 * True when `char` has a separator gap the sync is deliberately leaving alone because the caret
 * sits at it (a just-deleted separator). The marker-edit engine pends such spans so caret
 * departure settles them back to canonical via Tier-2.
 */
export function $hasCaretHeldSeparatorGap(char: CharNode): boolean {
  if (!char.isAttached()) return false;
  return char
    .getChildren()
    .some(
      (child: LexicalNode) =>
        $isMarkerNode(child) &&
        $openerSeparatorGap(child, char) !== undefined &&
        $isCaretAtOpenerBoundary(child, char),
    );
}
