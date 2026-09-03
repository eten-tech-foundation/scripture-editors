/**
 * Char-span glyph shape: the single place that owns WHETHER a char span carries an opening and a
 * closing glyph, and HOW a fresh span's pair is built. Sibling of nestedGlyphs.utils.ts (the `+` a
 * nested span's glyphs carry), markerSeparators.utils.ts (the NBSP between an opening glyph and its
 * content), and attributeDisplay.utils.ts (the `|name="value"` run) — between them those three own
 * everything about a rendered char glyph EXCEPT whether there is one at all, which is this module.
 *
 * ## The conventions
 *
 * - **Glyphs are markerMode "editable" presentation.** A `MarkerNode` exists only there — "visible"
 *   mode renders `ImmutableTypedTextNode` byte runs instead and "hidden" mode renders no glyph at
 *   all — so a builder that fabricates one unconditionally puts literal `\ft ` text (and its
 *   separator NBSP) into the content of a document that displays no glyphs, where it is visible in
 *   the span's text content and wrong on serialization. Callers that can run outside editable mode
 *   pass `renderGlyphs` false. It is a plain boolean rather than `ViewOptions` because that type
 *   lives in `shared-react`, which this package must not depend on.
 * - **Closer display keys on the span's STATE, never on its marker family**
 *   ({@link $charOwesClosingGlyph}): a span renders a closing glyph iff it does NOT carry
 *   `closed="false"`. ParatextData stamps that flag on every genuinely-unclosed span — chiefly
 *   footnote/cross-reference content chars (`\fr`, `\ft`, `\xo`, `\xt`), which the next bare marker
 *   closes — so those render closer-less, while an explicitly-closed `\xt` keeps its `\xt*`. The
 *   same state decides whether a missing closer is deletion damage (`$charNodeDeletionTransform`)
 *   and whether an attribute run may exist at all (attributeDisplay.utils.ts).
 * - **A span CONTINUING another reproduces that span's shape**, not the convention's default
 *   ({@link $buildContinuationCharSpan}): the PT9 close-and-reopen (`$liftOutOfChar`) and the
 *   Ctrl+Space-style split (`$splitCharNodeAt`) both build a right-hand span keeping the source's
 *   marker, nesting, and `closed` state, and take its closing glyph from the source's actual
 *   CHILDREN ({@link $charHasClosingGlyph}) rather than from that state — the tree is what says
 *   which glyphs this document renders, so a mode with no glyphs reopens with none.
 *
 * ## What this module does NOT own
 *
 * Only the shape of a span BUILT here. Keeping an existing span's glyphs honest afterwards belongs
 * to the syncs and the marker-edit engine: `$syncNestedGlyphs` re-derives the `+`,
 * `$syncOpenerSeparators` heals the separator, `$charNodeDeletionTransform` reads a missing
 * opener/closer as deletion damage, and the Tier-1 rename engine retargets a live pair. Nor are
 * these the only glyph MATERIALIZATIONS: the load adaptor's `createChar`/`addOpeningMarker`/
 * `addClosingMarker` build the same shape as SERIALIZED nodes, the collab materializer builds it
 * for "visible" mode as `ImmutableTypedTextNode`s, and `CharNode`'s `applyMarkerToDom` writes the
 * marker onto the rendered DOM. Each is a different layer with its own node kinds; this module is
 * the live-`MarkerNode` one, and states the conventions the others follow.
 */

import { $createMarkerNode, $isMarkerNode } from "../features/MarkerNode.js";
import { CharNode } from "./CharNode.js";
import { $isSeparatorPrefixHostText } from "./markerSeparators.utils.js";
import { $isNestedCharNode } from "./nestedGlyphs.utils.js";
import { NBSP, UnknownAttributes } from "./node-constants.js";
import { LexicalNode } from "lexical";

/**
 * Whether `char` owes a closing glyph — the implicit-close convention read from the span's own
 * state: everything closes except a span explicitly marked `closed="false"`. This is the rule for
 * whether a closer SHOULD exist; {@link $charHasClosingGlyph} is the separate question of whether
 * one actually does.
 */
export function $charOwesClosingGlyph(char: CharNode): boolean {
  return char.getUnknownAttributes()?.closed !== "false";
}

/**
 * Whether `char` currently renders a closing glyph — a direct-child `MarkerNode` with closing
 * syntax. Outside markerMode "editable" a span has no glyph children at all, so this is also the
 * tree's answer to "does this document display glyphs for this span".
 *
 * Deliberately marker-AGNOSTIC, unlike `$charClosingGlyph` (attributeDisplay.utils.ts), which
 * requires the glyph to name `char`'s own marker because it must anchor `char`'s own attribute run
 * and the collab-flattened shape parks a nested child span's glyphs among the same children. Here
 * the question is only whether the span was built with a closer to reproduce.
 */
export function $charHasClosingGlyph(char: CharNode): boolean {
  return char
    .getChildren()
    .some((child: LexicalNode) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
}

/**
 * The unknown attributes a span continuing `char` must be created with: `closed="false"` when
 * `char` carries the implicit-close convention, otherwise none.
 *
 * `closed` is structural state, not attribute bytes — an implicitly-closed span splits into TWO
 * implicitly-closed spans, and without the flag the continuation's (correct) missing closer reads
 * as deletion damage and gets routed through Tier 2. The DISPLAY attributes (`|name="value"`) are
 * deliberately not copied: they stay on the left half only, since duplicating them would double
 * those bytes on serialization.
 */
export function $continuationCharAttributes(char: CharNode): UnknownAttributes | undefined {
  return $charOwesClosingGlyph(char) ? undefined : { closed: "false" };
}

/**
 * Fill `span` — a freshly created, not-yet-inserted char span continuing `source` — with `content`
 * and the glyphs that content is owed. The caller creates `span` (with `source`'s marker and
 * {@link $continuationCharAttributes}) and inserts it; this decides its shape:
 *
 * - an opening glyph, first, only when `renderGlyphs` — the document has to display glyphs at all;
 * - the separator NBSP on `content`'s leading text, only when an opening glyph was emitted, since
 *   the NBSP is the separator BETWEEN the glyph and the content it opens (markerSeparators.utils.ts);
 * - a closing glyph, last, only when `source` itself renders one ({@link $charHasClosingGlyph});
 * - the `+` on both glyphs when `source` is nested ({@link $isNestedCharNode}) — the continuation
 *   becomes `source`'s sibling, so it inherits `source`'s nesting.
 *
 * @param span - The continuation span to fill. Must be empty; must be called inside `editor.update()`.
 * @param source - The span being continued, read for marker, nesting, and closing-glyph shape.
 * @param content - The nodes moving into `span`, in order. May be empty.
 * @param renderGlyphs - Whether this document displays char glyphs (markerMode "editable").
 */
export function $buildContinuationCharSpan(
  span: CharNode,
  source: CharNode,
  content: LexicalNode[],
  renderGlyphs: boolean,
): void {
  const marker = source.getMarker();
  const nested = $isNestedCharNode(source);
  const hasCloser = $charHasClosingGlyph(source);
  if (renderGlyphs) {
    span.append($createMarkerNode(marker, "opening", nested));
    // Plain-text-first content carries the separator as its prefix — the same host predicate the
    // separator sync uses ($isSeparatorPrefixHostText): TextNode SUBCLASSES (VerseNode,
    // ImmutableUnmatchedNode, MarkerNode) render their own marker bytes and attribute runs are
    // engine-owned canonical output, so splicing an NBSP into either rewrites a glyph or corrupts
    // the run. Everything else takes a standalone NBSP spacer, which `$syncOpenerSeparators` adds
    // when the span is next dirtied.
    const [firstContent] = content;
    if ($isSeparatorPrefixHostText(firstContent) && !firstContent.getTextContent().startsWith(NBSP))
      firstContent.setTextContent(NBSP + firstContent.getTextContent());
  }
  span.append(...content);
  if (hasCloser) span.append($createMarkerNode(marker, "closing", nested));
}
