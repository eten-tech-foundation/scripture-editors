/**
 * Marker-menu context — builds a `MarkerMenuContext` snapshot from the live
 * Lexical selection. Port of PT9's `MarkerDropdownEditHandler.HandleBackslash` selection-shape
 * rule (`MarkerDropdownEditHandler.cs:96-139`): a non-collapsed selection is always character
 * source (`:130-137`); a collapsed caret is paragraph source only ON the paragraph's own marker
 * prefix — inside the glyph, at its edges, or directly right of it before the separator space
 * ({@link $isAtParagraphMarkerPrefix}) — otherwise character source. Directly AFTER the
 * separator, where content starts, `\` is a character action (owner-directed boundary; the
 * original port counted content start as paragraph source, which put the paragraph palette
 * where the user is about to type content).
 *
 * Called from `EditorRef.getMarkerMenuContext` (`Editor.tsx`) via
 * `editorRef.current?.getEditorState().read(...)` rather than `editor.read(...)` - the latter
 * force-flushes any in-flight update mid-dispatch, the hazard class fixed for
 * `OnSelectionChangePlugin`.
 */
import { MarkerMenuContext } from "./markerItemSource";
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, LexicalNode } from "lexical";
import {
  $findFirstAncestorNoteNode,
  $isBookNode,
  $isCharNode,
  $isMarkerTrailingSeparator,
  $isParaNode,
  $isPointInMarkerGlyphText,
  $isSomeChapterNode,
  $isSynthesizedMarkerNode,
  ParaNode,
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
 * order: `ParaNode`/chapter/`BookNode` markers (the stack replay in
 * `markerItemSource.ts` filters to styleType-paragraph entries itself - `c`/`id` ARE
 * paragraph-typed in the sheet). Chapters match via `$isSomeChapterNode` — the same
 * predicate the validation walk uses — so a decorator `ImmutableChapterNode` contributes
 * its `\c` just like the mutable variant.
 */
function $collectPreviousParaMarkers(node: LexicalNode): string[] {
  const topLevel = node.getTopLevelElement();
  const markers: string[] = [];
  for (const child of $getRoot().getChildren()) {
    if (topLevel && child.is(topLevel)) break;
    if ($isBookNode(child) || $isSomeChapterNode(child) || $isParaNode(child)) {
      markers.push(child.getMarker());
    }
  }
  return markers;
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
 * Exported for `markerMenuApply.utils.ts`'s paragraph-kind retag-vs-split routing, which is
 * this probe's ONLY consumer now: a paragraph pick (from the Enter menu or any explicit flow)
 * still RETAGS at content start rather than splitting. The `\` palette's SOURCE no longer uses
 * it — the menu boundary is the deliberately narrower {@link $isAtParagraphMarkerPrefix}
 * (after-the-separator caret offers characters), and the two probes are split so changing the
 * menu boundary could not silently change how a pick applies.
 */
export function $isAtParagraphContentStart(
  para: ParaNode,
  anchorNode: LexicalNode,
  offset: number,
): boolean {
  const firstChild = para.getFirstChild();
  if (!firstChild) return false;

  let contentStart: LexicalNode | null = firstChild;
  if ($isSynthesizedMarkerNode(firstChild)) {
    if (anchorNode.is(firstChild)) return true;
    contentStart = firstChild.getNextSibling();
    if (contentStart && $isMarkerTrailingSeparator(contentStart)) {
      if (anchorNode.is(contentStart)) return true;
      contentStart = contentStart.getNextSibling();
    }
  }
  if (!contentStart) return false;
  return anchorNode.is($getFirstLeaf(contentStart)) && offset === 0;
}

/**
 * True when the collapsed caret sits ON `para`'s own marker prefix: inside the synthesized
 * glyph's text (its edges included), or directly right of the glyph BEFORE the separator space
 * (the separator node's offset 0). This is the `\` palette's SOURCE boundary: the paragraph
 * palette — whose pick retags the paragraph — belongs to the marker glyph itself, while the
 * caret directly AFTER the separator is where content starts, so `\` there offers the inline
 * (character) palette like any other content position.
 *
 * Deliberately narrower than {@link $isAtParagraphContentStart}: that probe also counts the
 * after-the-separator content start (and the first content leaf's offset 0), and it keeps that
 * wider boundary for its one remaining job — routing a paragraph PICK to retag-vs-split in
 * `markerMenuApply.utils.ts`. Menu SOURCE and apply ROUTING are separate probes on purpose.
 */
function $isAtParagraphMarkerPrefix(
  para: ParaNode,
  anchorNode: LexicalNode,
  offset: number,
): boolean {
  const firstChild = para.getFirstChild();
  if (!firstChild || !$isSynthesizedMarkerNode(firstChild)) return false;
  if (anchorNode.is(firstChild)) return true;
  const separator = firstChild.getNextSibling();
  return (
    separator !== null &&
    $isMarkerTrailingSeparator(separator) &&
    anchorNode.is(separator) &&
    offset === 0
  );
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
 * `editor.getEditorState().read(...)` — NOT `editor.read(...)`, which force-flushes an in-flight
 * update when dispatched mid-update (see the module doc above; this hazard class caused real
 * frozen-state crashes, fixed for `OnSelectionChangePlugin`). Returns `undefined` when there is no
 * range selection (e.g. a `NodeSelection`, or none at all).
 */
export function $getMarkerMenuContext(): MarkerMenuContextSnapshot | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return undefined;

  const anchorNode = selection.anchor.getNode();
  const offset = selection.anchor.offset;
  const hasTextSelection = !selection.isCollapsed();

  const para = $findNearestAncestor(anchorNode, $isParaNode);
  // A collapsed caret with NO paragraph around it at all is the book/header region — `\id` is a
  // BookNode at document root, not a `ParaNode`. There is no paragraph there to take a character
  // style, so the paragraph list is what the region can actually accept. A text selection stays
  // character source wherever it sits: wrapping is a character action.
  const source: MarkerMenuContext["source"] =
    !hasTextSelection && (!para || $isAtParagraphMarkerPrefix(para, anchorNode, offset))
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
    // The trailing edge of a canonical closing glyph counts as AFTER the marker, not inside it
    // (see $isPointInMarkerGlyphText) — Enter there opens the paragraph menu exactly as at the
    // end of a plain-text paragraph.
    inMarkerText: $isPointInMarkerGlyphText(anchorNode, offset),
    anchorRect: getAnchorRect(),
  };
}
