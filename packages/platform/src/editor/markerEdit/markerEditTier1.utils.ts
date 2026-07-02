/**
 * Tier 1 of the marker-editing engine (design spec §5.1): in-place renames that
 * keep structural node state and visible marker text in agreement at rest.
 * Everything Tier 1 cannot express routes to Tier 2 ($requestTier2ForNode).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import {
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
  closingMarkerText,
  getMarker,
  isMilestoneCommentMarker,
  LoggerBasic,
  MarkerNode,
  MarkerType,
  MilestoneNode,
  NoteNode,
  openingMarkerText,
} from "shared";
import { ViewOptions } from "shared-react";

export interface MarkerEditContext {
  viewOptions: ViewOptions;
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
  logger?: LoggerBasic;
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

/** Spec §5.1 same-positional-kind rule for paragraph openers. Unknown markers stay as typed. */
function isParaKindMarker(marker: string): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  const kind = getMarker(clean)?.type;
  return kind === undefined || kind === MarkerType.Paragraph || kind === MarkerType.Unknown;
}

/** Spec §5.1 same-positional-kind rule for char openers. Unknown markers stay as typed.
 * Uses the same local `isKnownMilestoneMarker` helper as `isParaKindMarker`, for the same
 * z-wildcard false-positive reason (see that function's doc comment). */
function isCharKindMarker(marker: string): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  const kind = getMarker(clean)?.type;
  return kind === undefined || kind === MarkerType.Character || kind === MarkerType.Unknown;
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
    if (!isParaKindMarker(newMarker)) {
      $requestTier2ForNode(node, context.viewOptions, context.logger);
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
      ? isCharKindMarker(newMarker)
      : NoteNode.isValidMarker(clean);
    if (!isValidKind) {
      $requestTier2ForNode(node, context.viewOptions, context.logger);
      return;
    }
    parent.setMarker(clean);
    const closer = parent
      .getChildren()
      .filter($isMarkerNode)
      .find((child) => child.getMarkerSyntax() === "closing");
    if (closer) {
      $clampSelectionToLength(closer, closingMarkerText(clean).length);
      closer.setMarker(clean); // same update: opener authority rewrites the closer
    }
    node.setMarker(clean);
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] ${parent.getType()} marker renamed to "${clean}"`);
    return;
  }
  $requestTier2ForNode(node, context.viewOptions, context.logger);
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
      $requestTier2ForNode(node, context.viewOptions, context.logger);
      return;
    }
    context.pendingKeys.add(node.getKey());
    return;
  }
  // Closer / selfClosing: one-way authority — closer edits never rename the span.
  if (text.endsWith("*")) {
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context.viewOptions, context.logger);
    return;
  }
  context.pendingKeys.add(node.getKey());
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
      else $requestTier2ForNode(node, context.viewOptions, context.logger);
    } else {
      // Pending plain-text / verse nodes (registered by later tasks) re-tokenize.
      $requestTier2ForNode(node, context.viewOptions, context.logger);
    }
  }
}

export function $isSelectionInMarkerNode(): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && $isMarkerNode(selection.anchor.getNode());
}
