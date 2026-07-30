/**
 * Tier 2 triggers for literal backslash text: typed or
 * pasted USFM that lands as plain TextNode content rather than being routed
 * through a MarkerNode/VerseNode transform. Lexical dispatches node
 * transforms by exact node type, so this transform never fires for
 * MarkerNode/VerseNode subclasses -- TextSpacingPlugin relies on the same
 * fact. A backslash sequence completed by a space/NBSP separator or a `*`
 * closer re-tokenizes immediately; an unterminated one waits in
 * `pendingKeys` for Enter/blur/caret-departure via `$resolvePendingMarkers`.
 * Attribute-run text (textType "attribute") is a third case: it always
 * pends and never re-tokenizes from here, regardless of backslashes or
 * termination-looking content — see the attribute branch below.
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $getSelection, $getState, $isRangeSelection, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isUnknownNode, textTypeState } from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[ \u00A0])/;

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const textType = $getState(node, textTypeState);
  // Attribute runs (char and milestone alike) always pend and never re-tokenize from here:
  // their bytes legitimately contain arbitrary characters, so neither the backslash check below
  // nor the termination regex further down means anything for them — a `\`-free edit is just as
  // much a divergence from canonical as a "terminated"-looking one. The marker-edit engine
  // settles the run back to canonical on caret departure via `context.pendingKeys` (see
  // `$hasCaretHeldAttributeRun`, MarkerEditPlugin.tsx) instead of this trigger ever
  // re-tokenizing it directly.
  if (textType === "attribute") {
    context.pendingKeys.add(node.getKey());
    return;
  }
  if (!text.includes("\\")) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  // The para-prefix trailing-space node is NOT exempt: it only
  // reaches this point when it carries a literal backslash run (a pure-NBSP prefix bails at the
  // includes check above), and that is exactly the node a caret at "content start" types into.
  // Exempting it made typed literals there invisible to the whole pend/settle machinery — `\zz `/
  // `\zfoo ` persisted indefinitely and serialized raw to disk because the caret-departure
  // settle had nothing pended to resolve.
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content now routes to the note-scoped rebuild (`$rebuildNoteContent`) via
    // `$requestTier2ForNode`, so it is NOT skipped here; books/chapters/unknowns keep
    // literal text (degradation property).
    if ($isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent)) return;
  }
  // Only the USER'S TYPED RUN can terminate a marker (the type-through corruption class): with
  // the caret mid-word ("li|ke"), typing `\` yields
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
      // that stays literal per the degradation property) — settle rather than
      // retrigger forever.
      return;
    }
    context.rebuildAttempted.add(text);
    $requestTier2ForNode(node, context);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}
