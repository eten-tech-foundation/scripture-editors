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
 * canonicalization, exactly like Tier-2's rebuild produces.
 *
 * Only char-span glyphs take a separator — a milestone's display run inside a span is left
 * alone — so which glyphs qualify is decided by the same classifier the nested-`+` sync uses
 * ({@link $charGlyphNestedValue}).
 */

import { $isMarkerNode } from "../features/MarkerNode.js";
import { CharNode } from "./CharNode.js";
import { $charGlyphNestedValue } from "./nestedGlyphs.utils.js";
import { NBSP } from "./node-constants.js";
import { $createTextNode, $isTextNode, LexicalNode, TextNode } from "lexical";

/**
 * Ensure every opening char glyph among `char`'s direct children is followed by its display
 * separator. Idempotent — a healed span passes untouched, so the registering transform
 * converges.
 *
 * @param char - The char span whose separators to sync. Must be called inside `editor.update()`.
 */
export function $syncOpenerSeparators(char: CharNode): void {
  // An earlier transform in the same pass may have merged/removed the span.
  if (!char.isAttached()) return;
  char.getChildren().forEach((child: LexicalNode) => {
    if (!$isMarkerNode(child) || child.getMarkerSyntax() !== "opening") return;
    // Only char-span glyphs take a separator (not a milestone's display run).
    if ($charGlyphNestedValue(child, char) === undefined) return;
    const next = child.getNextSibling();
    if (next === null) return;
    if ($isMarkerNode(next)) {
      // Opening glyph directly before another glyph: in the collab-flattened shape that next
      // glyph opens a nested span (`\add\+wj …`) and the separator goes between them. Any other
      // adjacent glyph (the span's own closer on a degenerate empty span) takes none.
      if ($charGlyphNestedValue(next, char) === true) child.insertAfter($createTextNode(NBSP));
      return;
    }
    // Plain text directly after the glyph carries the separator as its prefix. TextNode
    // SUBCLASSES (VerseNode) render their own marker text and fall through to the spacer case.
    if ($isTextNode(next) && next.getType() === TextNode.getType()) {
      const text = next.getTextContent();
      if (!text.startsWith(NBSP)) next.setTextContent(NBSP + text);
      return;
    }
    // Element content (nested char span, note, milestone, verse): standalone NBSP spacer.
    child.insertAfter($createTextNode(NBSP));
  });
}
