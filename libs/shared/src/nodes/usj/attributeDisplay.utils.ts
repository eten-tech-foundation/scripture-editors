/**
 * Attribute display runs: the single place that owns HOW a node's USFM attribute bytes
 * (`|lemma="grace" strong="G5485"`, `|gloss`) are rendered as engine-owned display text and kept
 * in sync. Sibling of nestedGlyphs.utils.ts (glyph `+`) and markerSeparators.utils.ts (opener
 * separators), following the same owning-module shape.
 *
 * ## The representations (who owns what)
 *
 * - **Node state is the truth.** Char-span attributes live in `CharNode.__unknownAttributes`;
 *   milestone attributes in `MilestoneNode` props + `__unknownAttributes`. The display run is a
 *   derived cache, never a second store.
 * - **The display run** is a TextNode tagged textType "attribute" holding the canonical PT9 byte
 *   form produced by {@link canonicalAttributeText}: a lone default attribute collapses to
 *   `|value`; anything else is `|name="value" …` (double quotes, single spaces, insertion
 *   order). `closed` is derived metadata, never displayed. Char runs are bare `|…` directly
 *   before the closing glyph (PT9's shape; an NBSP prefix would flatten to a space and leak
 *   into span content on a Tier-2 rebuild). Milestone runs keep the NBSP+`|` prefix — that NBSP
 *   flattens to the space genuinely in the file (`\qt-s |sid="…"\*`).
 * - **Excluded from data paths**: textType "attribute" text never enters OT content ops or the
 *   editor→USJ conversion; the Tier-2 fragment is the one place it DOES flow, so edited bytes
 *   re-tokenize back into node state (extractAttributes / scanMilestone).
 *
 * ## Keeping the cache honest
 *
 * Builders construct the run (usj-editor.adaptor's `createChar`/`addAttributes`; transforms do
 * not run on `setEditorState`), and {@link $syncCharAttributeDisplay} — registered as a CharNode
 * transform in CharNodePlugin — re-derives it whenever a span is dirtied, healing remote collab
 * updates and structure surgery. While the collapsed caret sits inside the run the sync leaves
 * it alone (mid-edit grace); the marker-edit engine settles it on caret departure by pending
 * the edited run into its Tier-2 completion path.
 */

import { $isMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { CharNode } from "./CharNode.js";
import {
  $createTextNode,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  TextNode,
} from "lexical";

/** USJ artifacts that are not USFM attribute bytes and must never display. */
export const CHAR_ATTRIBUTE_EXCLUDED_KEYS: ReadonlySet<string> = new Set(["closed"]);

/**
 * The canonical PT9 byte form of an attribute set, including the leading `|` — or `""` when
 * nothing displays. A lone attribute that IS the marker's default collapses to the bare value
 * (`|gloss`); everything else is explicit `name="value"` pairs, double-quoted, single-spaced,
 * insertion order. Values are kept byte-exact (ParatextData treats trailing space as value).
 */
export function canonicalAttributeText(
  attributes: { [name: string]: string | undefined },
  defaultAttributeName?: string,
): string {
  const entries = Object.entries(attributes).filter(
    ([name, value]) => value !== undefined && !CHAR_ATTRIBUTE_EXCLUDED_KEYS.has(name),
  );
  if (entries.length === 0) return "";
  if (entries.length === 1 && entries[0][0] === defaultAttributeName) return `|${entries[0][1]}`;
  return `|${entries.map(([name, value]) => `${name}="${value}"`).join(" ")}`;
}

/**
 * `char`'s own closing glyph among its direct children, if any — the display run's insertion
 * anchor, and the tree signal for whether a run may exist at all. A span whose closing glyph is
 * skipped (implicitly-closed footnote/cross-ref content, or `closed="false"`) or simply absent
 * never renders one: `createChar` (usj-editor.adaptor) never builds a run there, so the sync must
 * not fabricate one either — deriving the rule from tree shape rather than viewOptions also keeps
 * the sync a no-op outside editable mode, where char spans carry no MarkerNode glyphs at all.
 */
function $charClosingGlyph(char: CharNode): MarkerNode | undefined {
  return char
    .getChildren()
    .find(
      (child): child is MarkerNode =>
        $isMarkerNode(child) &&
        child.getMarkerSyntax() === "closing" &&
        child.getMarker() === char.getMarker(),
    );
}

/**
 * `char`'s direct-child display run — the TextNode tagged textType "attribute" — or `undefined`
 * if none exists.
 */
export function $charAttributeDisplayNode(char: CharNode): TextNode | undefined {
  return char
    .getChildren()
    .find(
      (child): child is TextNode =>
        $isTextNode(child) && $getState(child, textTypeState) === "attribute",
    );
}

/**
 * Whether the collapsed caret sits where the display run already is, or — when the run is
 * missing — at its insertion point. Mirrors {@link $isCaretAtOpenerBoundary}
 * (markerSeparators.utils.ts): a boundary the caret can hold in more than one shape after an
 * edit. `closingGlyph` is the insertion anchor, and the caret can sit at it either by landing on
 * the glyph itself or at the text-end of the content immediately before it.
 */
function $isCaretAtAttributeRunBoundary(
  run: TextNode | undefined,
  closingGlyph: MarkerNode | undefined,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (run) return anchorNode.is(run);
  if (!closingGlyph) return false;
  if (anchorNode.is(closingGlyph)) return true;
  const lastContent = closingGlyph.getPreviousSibling();
  return (
    lastContent !== null &&
    anchorNode.is(lastContent) &&
    selection.anchor.offset === lastContent.getTextContentSize()
  );
}

/**
 * Heal `char`'s attribute display run to `expectedText`: insert it before the closing glyph when
 * missing, rewrite it in place when stale, or remove it when `expectedText` is `""` — except
 * while the collapsed caret holds the run (mid-edit grace, see
 * {@link $isCaretAtAttributeRunBoundary}), which the sync leaves alone for the marker-edit engine
 * to settle on caret departure. A span with no closing glyph never carries a run regardless of
 * `expectedText` (see {@link $charClosingGlyph}). Idempotent — writes only on change, so the
 * registering transform converges.
 *
 * @param char - The char span whose display run to sync. Must be called inside `editor.update()`.
 * @param expectedText - The canonical attribute bytes `char` should display, or `""` for none.
 */
export function $syncCharAttributeDisplay(char: CharNode, expectedText: string): void {
  // An earlier transform in the same pass may have merged/removed the span (adjacent-span
  // combining); a detached span has no tree position to derive from.
  if (!char.isAttached()) return;
  const closingGlyph = $charClosingGlyph(char);
  const targetText = closingGlyph ? expectedText : "";
  const run = $charAttributeDisplayNode(char);
  // A missing run reads as "" so a missing-and-unwanted run compares equal without a run lookup.
  if ((run?.getTextContent() ?? "") === targetText) return;
  if ($isCaretAtAttributeRunBoundary(run, closingGlyph)) return;
  if (targetText === "") {
    run?.remove();
    return;
  }
  if (run) {
    run.setTextContent(targetText);
    return;
  }
  const newRun = $createTextNode(targetText);
  $setState(newRun, textTypeState, "attribute");
  closingGlyph?.insertBefore(newRun);
}

/**
 * True when `char`'s display run diverges from `expectedText` but the sync is deliberately
 * leaving it alone because the caret holds it — mid-edit, or, for a missing run, sitting at its
 * would-be insertion point. The marker-edit engine pends such spans so caret departure settles
 * them back to canonical via Tier-2.
 */
export function $hasCaretHeldAttributeRun(char: CharNode, expectedText: string): boolean {
  if (!char.isAttached()) return false;
  const closingGlyph = $charClosingGlyph(char);
  const targetText = closingGlyph ? expectedText : "";
  const run = $charAttributeDisplayNode(char);
  if ((run?.getTextContent() ?? "") === targetText) return false;
  return $isCaretAtAttributeRunBoundary(run, closingGlyph);
}
