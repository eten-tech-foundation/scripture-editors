/**
 * Tier 2 triggers for literal backslash text (design spec section 5.2): typed or
 * pasted USFM that lands as plain TextNode content rather than being routed
 * through a MarkerNode/VerseNode transform. Lexical dispatches node
 * transforms by exact node type, so this transform never fires for
 * MarkerNode/VerseNode subclasses -- TextSpacingPlugin relies on the same
 * fact. A backslash sequence completed by a space/NBSP separator or a `*`
 * closer re-tokenizes immediately; an unterminated one waits in
 * `pendingKeys` for Enter/blur/caret-departure via `$resolvePendingMarkers`.
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $getState, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isNoteNode, $isUnknownNode, textTypeState } from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[ \u00A0])/;

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (!text.includes("\\")) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === "marker-trailing-space") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content is its own re-tokenization scope (Phase 3); books/chapters/
    // unknowns keep literal text (degradation property).
    if (
      $isNoteNode(parent) ||
      $isBookNode(parent) ||
      $isChapterNode(parent) ||
      $isUnknownNode(parent)
    )
      return;
  }
  if (TERMINATED_MARKER_IN_TEXT_REGEX.test(text)) {
    context.pendingKeys.delete(node.getKey());
    if (context.rebuildAttempted.has(text)) {
      // $rebuildParas already produced this exact literal text once this commit and, being
      // deterministic, would only reproduce it again (e.g. an unmatched closer that stays
      // literal per the §5.2 degradation property) — settle rather than retrigger forever.
      return;
    }
    context.rebuildAttempted.add(text);
    $requestTier2ForNode(node, context.viewOptions, context.logger);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}
