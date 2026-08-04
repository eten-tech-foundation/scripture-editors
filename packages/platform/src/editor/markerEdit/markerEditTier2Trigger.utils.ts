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
 * termination-looking content — see the attribute branch below. Plain `|…`
 * content typed into an ALREADY-closed char span is a fourth case: it carries
 * no backslash, so the immediate path never fires, yet it is a pending
 * attribute edit (PT9 re-parses `|…` before an explicit closer), so it pends
 * for the same caret-departure settle rather than being discarded as inert text.
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $getSelection, $getState, $isRangeSelection, LexicalNode, TextNode } from "lexical";
import {
  $charClosingGlyph,
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isUnknownNode,
  textTypeState,
} from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[ \u00A0])/;

/**
 * Whether `node` sits inside a char span that already carries its closing glyph. USFM attributes
 * are only meaningful before an explicit closer, so `|` bytes typed into such a span's plain
 * content are a pending attribute edit (PT9 re-parses them via `extractAttributes` on the next
 * reformat), not inert text. The nearest CharNode ancestor is the one that matters; a span with no
 * closing glyph (an unclosed `closed="false"` span) keeps such bytes literal, and plain paragraph
 * text with no CharNode ancestor is never an attribute site at all. Reuses `$charClosingGlyph` --
 * the same closing-glyph locator the attribute display owns (attributeDisplay.utils.ts) -- so this
 * pend decision and the display run can never disagree about whether a span is closed.
 */
function $isInClosedCharSpan(node: LexicalNode): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent())
    if ($isCharNode(parent)) return $charClosingGlyph(parent) !== undefined;
  return false;
}

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
    // `|…` bytes typed into a CLOSED char span's plain content are a pending attribute edit, not
    // inert text: PT9 re-parses `|…` before an explicit closer as attributes. When the closer glyph
    // was typed FIRST (TJ's corrected repro: `\nd text\nd*` then caret at "text|" and type
    // `|stuff="thing"`), no backslash ever lands in this node, so the immediate-rebuild path below
    // never fires — without pending here the node's key would be DELETED and caret departure would
    // have nothing to settle, leaving the pipe literal forever. Pend instead so the departure
    // settle routes it through `$rebuildParas`, whose tokenizer's `extractAttributes` forms the
    // attribute (or, for a bare value on a marker with no default, refuses at the fixed point and
    // keeps it literal — PT9 semantics, terminating without churn). Do NOT rebuild now: the user is
    // mid-typing `|stuff="thi…`. All other plain text still deletes its key (that cleanup matters):
    // pipe-text in an unclosed span carries no attribute, and pipe-text in bare paragraph content
    // is not an attribute site at all — `$isInClosedCharSpan` keeps both out.
    if (text.includes("|") && $isInClosedCharSpan(node)) context.pendingKeys.add(node.getKey());
    else context.pendingKeys.delete(node.getKey());
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
