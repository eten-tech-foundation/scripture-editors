/**
 * Nested inline-marker glyphs: the single place that owns HOW the `+` prefix (`\+w …\+w*`) is
 * represented and kept in sync.
 *
 * ## The representations (who owns what)
 *
 * - **Tree containment is the truth.** A char span is nested iff its parent is another CharNode
 *   ({@link $isNestedCharNode}) — exactly USJ/USX's model, where nesting is element containment
 *   and no `+` exists in any marker name.
 * - **Markers are always CLEAN** (`"w"`, never `"+w"`), in CharNode state, in USJ, and in the
 *   OT/collab delta (which conveys nesting by char-ARRAY position, outermost-first; see
 *   `$buildCharItem` in editor-delta.adaptor and `$createNestedChars` in delta-apply-update —
 *   both in `shared-react`'s collab plugin).
 * - **Only the rendered glyph text carries the `+`** — USFM's serialization of nesting, and PT9's
 *   on-screen display for USFM ≤3.0. `MarkerNode` caches it: Lexical renders a TextNode's stored
 *   `__text` (there is no computed-text hook, and nothing re-runs when an ANCESTOR moves), so the
 *   `+` must be baked into `__text`. `MarkerNode.__nested` is the flag that `getMarkerText`
 *   derives it from — see MarkerNode.ts, which points back here.
 *
 * ## Keeping the cache honest
 *
 * Because `__text` is a cache of tree-derived state, every path that BUILDS glyphs sets `nested`
 * at construction (the USJ load adaptor's `createChar`, `$splitCharNodeAt`, the marker-apply
 * paths, the collab materializer) — construction-time correctness matters because transforms do
 * not run on `setEditorState` (initial load / restored states render straight from serialized
 * `__text`). {@link $syncNestedGlyphs} is the safety net for everything AFTER load: registered as
 * a CharNode transform (CharNodePlugin in `shared-react`), it re-derives each glyph's `nested`
 * from tree position whenever a span is dirtied, so structure surgery that forgets to refresh
 * glyphs (a move, an unwrap, a merge) self-heals instead of leaving a stale `+` that Tier-2
 * re-tokenization would misread (`\+w` with nothing open parses as an unknown marker; a missing
 * `+` flattens the nesting via close-on-bare).
 */

import { $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { $isCharNode, CharNode } from "./CharNode.js";
import { LexicalNode } from "lexical";

/** Whether `char` is a nested char span — its parent is another char span. The one derivation
 * rule for the glyph `+`; every representation above follows from this. */
export function $isNestedCharNode(char: CharNode): boolean {
  return $isCharNode(char.getParent());
}

/**
 * Which char span a glyph that is a DIRECT child of `char` describes:
 *
 * - `char` itself (`glyph.getMarker() === char.getMarker()`) — the span's own opener/closer;
 *   nested iff `char` is nested.
 * - A nested CHILD span with that marker (the collab-flattened shape, where an inner span's
 *   glyphs sit as siblings around the inner CharNode) — nested by construction.
 * - Neither — e.g. a milestone's display run (`\qt-s` … `\*`) rendered inside the span. Not a
 *   char glyph at all: milestones never take the `+`, so it is left untouched.
 *
 * @returns the nested value the glyph must carry, or `undefined` to leave the glyph alone.
 */
function $glyphNestedValue(glyph: MarkerNode, char: CharNode): boolean | undefined {
  if (glyph.getMarkerSyntax() === "selfClosing") return undefined;
  const marker = glyph.getMarker();
  if (marker === char.getMarker()) return $isNestedCharNode(char);
  const describesNestedChild = char
    .getChildren()
    .some((child: LexicalNode) => $isCharNode(child) && child.getMarker() === marker);
  return describesNestedChild ? true : undefined;
}

/**
 * Re-derive the `nested` flag (and thereby the `+` in the glyph text) of `char`'s direct marker
 * glyphs from tree position. Idempotent — `setNested` writes only on change, so a second pass is
 * a no-op and the registering transform converges.
 *
 * @param char - The char span whose glyphs to sync. Must be called inside `editor.update()`.
 */
export function $syncNestedGlyphs(char: CharNode): void {
  // An earlier transform in the same pass may have merged/removed the span (adjacent-span
  // combining); a detached span has no tree position to derive from.
  if (!char.isAttached()) return;
  char.getChildren().forEach((child: LexicalNode) => {
    if (!$isMarkerNode(child)) return;
    const nested = $glyphNestedValue(child, char);
    if (nested !== undefined) child.setNested(nested);
  });
}
