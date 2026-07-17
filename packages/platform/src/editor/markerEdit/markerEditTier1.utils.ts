/**
 * Tier 1 of the marker-editing engine: in-place renames that
 * keep structural node state and visible marker text in agreement at rest.
 * Everything Tier 1 cannot express routes to Tier 2 ($requestTier2ForNode).
 */

import { $requestTier2ForNode, Tier2Context } from "./tier2Rebuild.utils";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  ChapterNode,
  closingMarkerText,
  getVisibleOpenMarkerText,
  isMilestoneCommentMarker,
  MarkerLookup,
  MarkerNode,
  MarkerType,
  MilestoneNode,
  NoteNode,
  openingMarkerText,
  VerseNode,
} from "shared";

export interface MarkerEditContext extends Tier2Context {
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
  /**
   * Literal text already submitted to `$requestTier2ForNode` this commit.
   * `$rebuildParas` is deterministic (the degradation property): a paragraph
   * whose rebuild still contains a fragment the tokenizer cannot resolve into anything new
   * (e.g. an unterminated milestone run) reproduces the identical literal text on every
   * retry, so the TextNode catch-all transform ($textNodeTier2Transform) would otherwise
   * retrigger the same rebuild forever within one update, tripping Lexical's
   * infinite-transform guard. This is no longer about unmatched closers specifically —
   * those now resolve to an `ImmutableUnmatchedNode` (real structural progress, not
   * identical-literal reproduction) — the guard remains only for fragments that still
   * reproduce identically.
   * Reset every commit by the plugin's update listener.
   */
  rebuildAttempted: Set<string>;
}

const TERMINATED_OPENER_REGEX = /^\\(\+?[\w-]+)[ \u00A0]$/;
const BARE_OPENER_REGEX = /^\\(\+?[\w-]+)$/;
const CLOSER_FORM_REGEX = /^\\\+?[\w-]*\*$/;

function $markerCanonicalText(node: MarkerNode): string {
  const syntax = node.getMarkerSyntax();
  if (syntax === "closing") return closingMarkerText(node.getMarker());
  if (syntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(node.getMarker());
}

/** True for markers on USFM's fixed milestone list (`\ts-s`, `\qt1-e`, ...), not for arbitrary
 * z-namespace custom.sty markers: `MilestoneNode.isValidMarker` also accepts any `z`-prefixed
 * string so a milestone node can render an as-yet-unknown custom marker, but that same
 * allowance would misclassify a merely-unrecognized paragraph opener (e.g. `\zed`) as
 * positionally a milestone. Milestone markers all follow the `-s`/`-e` start/end suffix
 * convention, with bare `ts` as the sole exception. */
function isKnownMilestoneMarker(marker: string): boolean {
  return (
    MilestoneNode.isValidMarker(marker) &&
    (marker === "ts" ||
      marker.endsWith("-s") ||
      marker.endsWith("-e") ||
      isMilestoneCommentMarker(marker))
  );
}

/** Same-positional-kind rule for paragraph openers. Stylesheet-first:
 * a marker the effective sheet KNOWS classifies by its styleType; heuristics
 * cover only markers absent from the sheet. Unknown markers stay as typed
 * (Tier-1 renames to unknown markers stay in place). */
function isParaKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Paragraph;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  return true;
}

/** Same-positional-kind rule for char openers (see isParaKindMarker). */
function isCharKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Character;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  return true;
}

function $clampSelectionToLength(node: MarkerNode, newLength: number): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  [selection.anchor, selection.focus].forEach((point) => {
    if (point.key === node.getKey() && point.offset > newLength)
      point.set(node.getKey(), newLength, "text");
  });
}

function $moveCaretPastMarker(node: MarkerNode): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  if (selection.anchor.key !== node.getKey()) return;
  const next = node.getNextSibling();
  // Both para trailing-space and char NBSP-prefixed content put the caret after
  // offset 1 of the following text node.
  if ($isTextNode(next)) next.select(1, 1);
  else node.select(node.getTextContentSize(), node.getTextContentSize());
}

export function $applyOpenerRename(
  node: MarkerNode,
  newMarker: string,
  context: MarkerEditContext,
): void {
  const parent = node.getParent();
  if ($isParaNode(parent)) {
    if (!isParaKindMarker(newMarker, context.getMarker)) {
      $requestTier2ForNode(node, context);
      return;
    }
    parent.setMarker(newMarker);
    node.setMarker(newMarker); // rewrites __text to canonical, absorbing the typed terminator
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] para marker renamed to "${newMarker}"`);
    return;
  }
  if ($isCharNode(parent) || $isNoteNode(parent)) {
    const clean = newMarker.replace(/^\+/, "");
    const isValidKind = $isCharNode(parent)
      ? isCharKindMarker(newMarker, context.getMarker)
      : NoteNode.isValidMarker(clean);
    if (!isValidKind) {
      $requestTier2ForNode(node, context);
      return;
    }
    const oldMarker = node.getMarker();
    if (parent.getMarker() !== oldMarker) {
      // Tree shape doesn't match the simple opener-owns-parent assumption: e.g. the collab
      // delta-apply path ($createNestedChars) flattens nested char spans, so an inner opener's
      // direct parent is the outer CharNode, not an inner one. Renaming in place under that
      // assumption would target the wrong closer, so refuse and let Tier 2 rebuild proper
      // nesting from the glyph text via the tokenizer.
      $requestTier2ForNode(node, context);
      return;
    }
    parent.setMarker(clean);
    const closer = parent
      .getChildren()
      .filter($isMarkerNode)
      .filter((child) => child.getMarkerSyntax() === "closing" && child.getMarker() === oldMarker)
      .at(-1);
    if (closer) {
      $clampSelectionToLength(closer, closingMarkerText(clean).length);
      closer.setMarker(clean); // same update: opener authority rewrites the closer
    }
    node.setMarker(clean);
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] ${parent.getType()} marker renamed to "${clean}"`);
    return;
  }
  $requestTier2ForNode(node, context);
}

export function $markerNodeTransform(node: MarkerNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (text === $markerCanonicalText(node)) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (node.getMarkerSyntax() === "opening") {
    const terminated = TERMINATED_OPENER_REGEX.exec(text);
    if (terminated) {
      context.pendingKeys.delete(node.getKey());
      $applyOpenerRename(node, terminated[1], context);
      return;
    }
    if (CLOSER_FORM_REGEX.test(text)) {
      // Opener retyped into closer form: positional kind changed -> Tier 2.
      context.pendingKeys.delete(node.getKey());
      $requestTier2ForNode(node, context);
      return;
    }
    context.pendingKeys.add(node.getKey());
    return;
  }
  // Closer / selfClosing: one-way authority — closer edits never rename the span. Damage or
  // retype settles through Tier 2, whose tokenizer turns non-marker residue (`wj*` after the `\`
  // is deleted) into PLAIN text and re-closes the span per its rules — a `*`-terminated form
  // resolves now, anything else stays pending until the caret departs (mid-edit grace). NOTE:
  // USJ chars DO support `closed="false"` (ParatextData emits it whenever a char span has no
  // explicit closer — see paranext-core's footnote-util test USJ), but our tokenizer does not
  // yet set it on auto-closed char spans, so the rebuilt span currently re-closes at the
  // paragraph end with a regenerated closer glyph. Emitting `closed="false"` there (and skipping
  // the closer glyph for such spans) is the planned parity fix.
  if (text.endsWith("*")) {
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context);
    return;
  }
  context.pendingKeys.add(node.getKey());
}

// `\v`, separator, number token, then either nothing-yet (unterminated), or a
// separator plus optional trailing text the user typed inside the node.
const VERSE_TEXT_REGEX = /^\\v[ \u00A0]+([^ \u00A0\\]+)(?:[ \u00A0]([\s\S]*))?$/;

export function $verseNodeTransform(node: VerseNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const expected = getVisibleOpenMarkerText("v", node.getNumber());
  if (text === expected) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (/^\\v[ \u00A0]*$/.test(text)) {
    // number mid-edit; keep the stored number as the serialization fallback
    context.pendingKeys.add(node.getKey());
    return;
  }
  const match = VERSE_TEXT_REGEX.exec(text);
  if (!match) {
    // `\v` prefix broken: PT9 re-tokenizes and the token becomes plain text
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context);
    return;
  }
  const [, numberToken, rest] = match;
  if (rest === undefined && !/[ \u00A0]$/.test(text)) {
    context.pendingKeys.add(node.getKey()); // e.g. `\v 12` while typing the number
    return;
  }
  context.pendingKeys.delete(node.getKey());
  node.setNumber(numberToken); // PT9 GetNextWord: whole word, valid or not
  node.setTextContent(getVisibleOpenMarkerText("v", numberToken));
  if (rest) {
    const restNode = $createTextNode(rest);
    node.insertAfter(restNode);
    restNode.select(rest.length, rest.length);
  }
}

export function $chapterNodeTransform(node: ChapterNode, _context: MarkerEditContext): void {
  if (node.getChildrenSize() === 0) {
    node.remove(); // deleting the chapter marker deletes it
    return;
  }
  const textNode = node.getFirstChild();
  if (!$isTextNode(textNode)) return;
  const expected = getVisibleOpenMarkerText("c", node.getNumber());
  const text = textNode.getTextContent();
  if (text === expected) return;
  const match = /^\\c[ \u00A0]+([^ \u00A0\\]+)[ \u00A0]/.exec(text);
  if (!match) return; // leave literal; serialization falls back to the stored number
  node.setNumber(match[1]);
  textNode.setTextContent(getVisibleOpenMarkerText("c", match[1]));
}

/**
 * Completion trigger. PT9 completes mid-edit markers via its 1s debounced
 * reformat; our deterministic equivalents are Enter, blur, and the caret
 * leaving the node (`exceptKey` keeps the node still being edited pending).
 */
export function $resolvePendingMarkers(context: MarkerEditContext, exceptKey?: NodeKey): void {
  if (context.pendingKeys.size === 0) return;
  const keys = [...context.pendingKeys].filter((key) => key !== exceptKey);
  for (const key of keys) {
    context.pendingKeys.delete(key);
    const node: LexicalNode | null = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    if ($isMarkerNode(node)) {
      const text = node.getTextContent();
      if (text === $markerCanonicalText(node)) continue;
      const bare = BARE_OPENER_REGEX.exec(text);
      if (node.getMarkerSyntax() === "opening" && bare) $applyOpenerRename(node, bare[1], context);
      else $requestTier2ForNode(node, context);
    } else {
      // Pending plain-text / verse nodes (registered by later tasks) re-tokenize.
      $requestTier2ForNode(node, context);
    }
  }
}

export function $isSelectionInMarkerNode(): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && $isMarkerNode(selection.anchor.getNode());
}
