import { useTransientCaretHost } from "./transientCaretHost";
import { $getSelection, $isElementNode, $isRangeSelection } from "lexical";
import { $caretHostAtBoundary } from "shared";
import { $isSomeVerseNode, SomeVerseNode } from "../../nodes/usj";

/**
 * The verse marker after which an empty-verse caret host is needed, or `undefined`.
 *
 * A verse whose content has all been deleted collapses to just its marker — an
 * `ImmutableVerseNode` is a childless decorator, so the caret can only land as an element point
 * wedged between markers, which the browser renders with no visible caret. This detects that state:
 * a collapsed element-type caret sitting immediately after a verse marker that is followed by
 * nothing, or by another verse marker (i.e. no `TextNode` to host the caret).
 *
 * Returns `undefined` when a text node already follows the marker (real content, or an existing
 * placeholder host), or when the caret is not at such a boundary.
 *
 * Read-only: call inside `editor.getEditorState().read()`.
 */
export function $emptyVerseNeedingHost(): SomeVerseNode | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const { anchor } = selection;
  if (anchor.type !== "element") return undefined;
  const element = anchor.getNode();
  if (!$isElementNode(element)) return undefined;

  const children = element.getChildren();
  const verse = children[anchor.offset - 1];
  if (!$isSomeVerseNode(verse)) return undefined;

  // A text node already hosts the caret at this boundary (real content or an existing placeholder).
  if ($caretHostAtBoundary(element, anchor.offset)) return undefined;

  const following = children[anchor.offset];
  // Nothing, or another verse marker, follows: this verse has no caret host.
  if (following === undefined || $isSomeVerseNode(following)) return verse;
  return undefined;
}

/**
 * Keeps a visible caret in a verse whose text has been fully deleted.
 *
 * A verse number is rendered by a childless `ImmutableVerseNode` decorator, so once a verse has no
 * text the caret can only rest as an element point between decorators — which the browser draws
 * with no visible caret. This plugin drops a zero-width-space "caret host" text node into such an
 * empty verse and moves the caret into it, so the insertion point stays visible and typing lands in
 * the verse. {@link useTransientCaretHost} owns the host's lifetime — created on arrival, removed on
 * departure or blur, stripped the moment real text is typed — and the exclusions that keep it out of
 * saved Scripture and out of collaborative traffic; this file supplies only the rule for WHERE one
 * is needed. `TrailingNoteCaretGuardPlugin` supplies the other rule.
 *
 * Unlike the arrow-driven `CursorHandler` placeholder system (perf-react), this hosts a *resting*
 * caret and is aware of verse markers, so it fits the platform editor's immutable verse numbers.
 *
 * @returns Always `null`; this plugin renders no UI.
 */
export function EmptyVerseCaretGuardPlugin(): null {
  useTransientCaretHost($emptyVerseNeedingHost);
  return null;
}
