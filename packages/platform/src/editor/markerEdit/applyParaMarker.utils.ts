/**
 * Single entry point for setting or changing the marker of an EXISTING paragraph on a live
 * editor tree. Every flow that retags a paragraph (marker menu retag, toolbar block format,
 * remote collab retain) must keep three things in agreement — the `ParaNode` marker state, the
 * visible prefix glyph (editable marker mode), and the `[glyph, separator, content]` layout the
 * marker-deletion transform polices — and this helper owns that decision so callers don't each
 * reimplement it.
 */
import { $setParaMarkerWithPrefix } from "./markerEditDeletion.utils";
import { $isMarkerNode, ParaNode } from "shared";
import { $syncParaMarkerGlyph, ViewOptions } from "shared-react";

/**
 * Sets `para`'s marker, keeping the visible prefix in agreement. Call inside `editor.update()`.
 *
 * Dispatches on what the paragraph actually carries:
 *
 * - Prefix glyph present (detected structurally): rewrite the marker state AND the glyph text
 *   in place — node identities, content, and the caret stay put.
 * - No glyph, editable marker mode: every editable-mode paragraph must carry a visible prefix
 *   (a prefix-less one gets merged into the previous paragraph or reset to `\p` by the
 *   marker-deletion transform), so the prefix is injected together with the marker change; the
 *   caret moves to the content side of the new prefix, matching the split/menu flows this
 *   injection serves. EXCEPT when the view opted out of paragraph marker prefixes
 *   (`showParaMarkerPrefixes: false`): prefix-less is the canonical editable-mode shape there
 *   (the deletion transform stands down for the same reason), so the retag is a bare marker
 *   state change like any other glyph-less tree.
 * - No glyph, any other mode: bare marker state change. Visible/gutter marker rendering is
 *   adaptor-serialized typed text, not an injectable glyph — injecting would corrupt those
 *   trees.
 *
 * The glyph-present case needs no mode knowledge, but inject-vs-bare genuinely depends on the
 * marker mode — that is why `viewOptions` is a parameter. When omitted, the helper never
 * injects (the safe choice for trees of unknown mode).
 *
 * @param para - The paragraph to retag.
 * @param marker - The new paragraph marker (e.g. `"q1"`).
 * @param viewOptions - View options of the editor; decides whether a MISSING prefix should be
 *   injected. Irrelevant when the paragraph already carries a glyph.
 */
export function $applyParaMarker(para: ParaNode, marker: string, viewOptions?: ViewOptions): void {
  if (
    !$isMarkerNode(para.getFirstChild()) &&
    viewOptions?.markerMode === "editable" &&
    viewOptions.showParaMarkerPrefixes !== false
  ) {
    $setParaMarkerWithPrefix(para, marker);
    return;
  }
  $syncParaMarkerGlyph(para, marker);
}
