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
import { $getSelection, $getState, $isRangeSelection, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isUnknownNode, textTypeState } from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[ \u00A0])/;

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (!text.includes("\\")) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  const textType = $getState(node, textTypeState);
  // The para-prefix trailing-space node is NOT exempt (Task 15 QA run 3 items 2/6): it only
  // reaches this point when it carries a literal backslash run (a pure-NBSP prefix bails at the
  // includes check above), and that is exactly the node a caret at "content start" types into.
  // Exempting it made typed literals there invisible to the whole pend/settle machinery — `\zz `/
  // `\zfoo ` persisted indefinitely and serialized raw to disk because the Phase-4 departure
  // settle had nothing pended to resolve. Attribute runs stay exempt (milestone attribute text
  // legitimately contains arbitrary characters).
  if (textType === "attribute") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content now routes to the note-scoped rebuild (`$rebuildNoteContent`) via
    // `$requestTier2ForNode`, so it is NOT skipped here; books/chapters/unknowns keep
    // literal text (degradation property).
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return;
  }
  // Only the USER'S TYPED RUN can terminate a marker (Task 15 QA run 3 item 3 — the Task-8
  // type-through corruption class): with the caret mid-word ("li|ke"), typing `\` yields
  // "li\ke …", and the word remainder's own following space made `\ke ` look terminated —
  // splitting immediately into a phantom paragraph whose marker absorbed the remainder ("ke"),
  // which the palette apply then consumed (text loss). When this node holds the collapsed
  // caret, test only the text BEFORE the caret: characters after it pre-existed and cannot have
  // been "just typed". Non-anchor nodes (paste normalization, programmatic edits, remote
  // deltas) keep the whole-text check; an unterminated run left before the caret still resolves
  // via Enter/blur/caret departure.
  const selection = $getSelection();
  const terminationText =
    $isRangeSelection(selection) &&
    selection.isCollapsed() &&
    selection.anchor.key === node.getKey()
      ? text.slice(0, selection.anchor.offset)
      : text;
  if (TERMINATED_MARKER_IN_TEXT_REGEX.test(terminationText)) {
    context.pendingKeys.delete(node.getKey());
    if (context.rebuildAttempted.has(text)) {
      // $rebuildParas already produced this exact literal text once this commit and, being
      // deterministic, would only reproduce it again (e.g. an unterminated milestone run
      // that stays literal per the §5.2 degradation property) — settle rather than
      // retrigger forever.
      return;
    }
    context.rebuildAttempted.add(text);
    $requestTier2ForNode(node, context);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}
