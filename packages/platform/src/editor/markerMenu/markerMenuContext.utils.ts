/**
 * Marker-menu context — builds a `MarkerMenuContext` snapshot from the live
 * Lexical selection. Port of PT9's `MarkerDropdownEditHandler.HandleBackslash` selection-shape
 * rule (`MarkerDropdownEditHandler.cs:96-139`): a non-collapsed selection is always character
 * source (`:130-137`); a collapsed caret is paragraph source only at the paragraph's content
 * start (immediately after the visible marker prefix), otherwise character source.
 *
 * Called from `EditorRef.getMarkerMenuContext` (`Editor.tsx`) via
 * `editorRef.current?.getEditorState().read(...)` rather than `editor.read(...)` - the latter
 * force-flushes any in-flight update mid-dispatch, the hazard class fixed for
 * `OnSelectionChangePlugin`.
 */
import { MarkerMenuContext } from "./markerItemSource";
import {
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $findFirstAncestorNoteNode,
  $isBookNode,
  $isCharNode,
  $isChapterNode,
  $isMarkerNode,
  $isParaMarkerPrefix,
  $isParaNode,
  ParaNode,
  textTypeState,
} from "shared";

/**
 * `MarkerMenuContext` plus the caret's viewport rect for palette anchoring. `undefined` in
 * headless tests (jsdom's `Range` has no `getBoundingClientRect`) and whenever there is no
 * live DOM selection to read one from.
 *
 * Not re-exported from the package barrel (internal implementation detail, like
 * `markerEditDeletion.utils.ts`'s `$createMarkerPrefix`) - `EditorRef.getMarkerMenuContext`
 * spells the equivalent intersection type inline (`editor.model.ts`) since that IS public API.
 */
export type MarkerMenuContextSnapshot = MarkerMenuContext & {
  anchorRect?: { x: number; y: number; width: number; height: number };
};

/** Nearest ancestor (including `node` itself) satisfying `predicate`, or `undefined`. */
function $findNearestAncestor<T extends LexicalNode>(
  node: LexicalNode,
  predicate: (candidate: LexicalNode) => candidate is T,
): T | undefined {
  let current: LexicalNode | null = node;
  while (current) {
    if (predicate(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

/** `CharNode` ancestors of `node` (inclusive), innermost first. */
function $collectOpenCharMarkers(node: LexicalNode): string[] {
  const markers: string[] = [];
  let current: LexicalNode | null = node;
  while (current) {
    if ($isCharNode(current)) markers.push(current.getMarker());
    current = current.getParent();
  }
  return markers;
}

/**
 * Root's block-level children before the top-level element containing `node`, in document
 * order: `ParaNode`/`ChapterNode`/`BookNode` markers (the stack replay in
 * `markerItemSource.ts` filters to styleType-paragraph entries itself - `c`/`id` ARE
 * paragraph-typed in the sheet).
 */
function $collectPreviousParaMarkers(node: LexicalNode): string[] {
  const topLevel = node.getTopLevelElement();
  const markers: string[] = [];
  for (const child of $getRoot().getChildren()) {
    if (topLevel && child.is(topLevel)) break;
    if ($isBookNode(child) || $isChapterNode(child) || $isParaNode(child)) {
      markers.push(child.getMarker());
    }
  }
  return markers;
}

/** A plain `TextNode` tagged as the NBSP separator following a paragraph's marker prefix. */
function $isTrailingSpaceNode(node: LexicalNode | null | undefined): node is TextNode {
  return $isTextNode(node) && $getState(node, textTypeState) === "marker-trailing-space";
}

/** First leaf of `node`: descend through first children of element nodes (the node itself
 * when it is already a leaf or an empty element). */
function $getFirstLeaf(node: LexicalNode): LexicalNode {
  let current = node;
  while ($isElementNode(current)) {
    const child: LexicalNode | null = current.getFirstChild();
    if (!child) break;
    current = child;
  }
  return current;
}

/**
 * True when `anchorNode`/`offset` sits at `para`'s CONTENT start: inside the marker prefix /
 * its trailing-space NBSP, or at offset 0 of the first LEAF of the first content child
 * (`MarkerDropdownEditHandler.cs:107-116` — PT9's probe is a flat character-position check,
 * blind to markup nesting, so ours must see through wrappers too).
 *
 * The leaf descent matters when the paragraph's visible content begins inside a char span —
 * e.g. `\p \wj Then Jesus said…\wj*`, an ordinary red-letter Gospel shape: Lexical anchors
 * the caret on the span's inner leaf, never on the span element itself. In editable mode a
 * CharNode's first leaf is its opener MarkerNode glyph — a caret at offset 0 of that glyph
 * IS the visible content start.
 *
 * Exported for `markerMenuApply.utils.ts`'s paragraph-kind retag-vs-split routing — the same
 * PT9 probe decides both which menu SOURCE to offer and how a paragraph pick APPLIES.
 */
export function $isAtParagraphContentStart(
  para: ParaNode,
  anchorNode: LexicalNode,
  offset: number,
): boolean {
  const firstChild = para.getFirstChild();
  if (!firstChild) return false;

  let contentStart: LexicalNode | null = firstChild;
  if ($isParaMarkerPrefix(firstChild)) {
    if (anchorNode.is(firstChild)) return true;
    contentStart = firstChild.getNextSibling();
    if ($isTrailingSpaceNode(contentStart)) {
      if (anchorNode.is(contentStart)) return true;
      contentStart = contentStart.getNextSibling();
    }
  }
  if (!contentStart) return false;
  return anchorNode.is($getFirstLeaf(contentStart)) && offset === 0;
}

/** iframe-relative viewport coords of the live DOM selection, or `undefined` if unavailable. */
function getAnchorRect(): MarkerMenuContextSnapshot["anchorRect"] {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") return undefined;
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return undefined;

  const range = domSelection.getRangeAt(0);
  if (typeof range.getBoundingClientRect !== "function") return undefined;

  const { x, y, width, height } = range.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * Builds a `MarkerMenuContext` snapshot from the current selection. Call inside
 * `editor.read()`/`editor.getEditorState().read()`. Returns `undefined` when there is no range
 * selection (e.g. a `NodeSelection`, or none at all).
 */
export function $getMarkerMenuContext(): MarkerMenuContextSnapshot | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return undefined;

  const anchorNode = selection.anchor.getNode();
  const offset = selection.anchor.offset;
  const hasTextSelection = !selection.isCollapsed();

  const para = $findNearestAncestor(anchorNode, $isParaNode);
  const source: MarkerMenuContext["source"] =
    !hasTextSelection && para && $isAtParagraphContentStart(para, anchorNode, offset)
      ? "paragraph"
      : "character";

  const note = $findFirstAncestorNoteNode(anchorNode);

  return {
    source,
    paraMarker: para?.getMarker(),
    previousParaMarkers: $collectPreviousParaMarkers(anchorNode),
    openCharMarkers: $collectOpenCharMarkers(anchorNode),
    noteMarker: note?.getMarker(),
    hasTextSelection,
    inMarkerText: $isMarkerNode(anchorNode),
    anchorRect: getAnchorRect(),
  };
}
