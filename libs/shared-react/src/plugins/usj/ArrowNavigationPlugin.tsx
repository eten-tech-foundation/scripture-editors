import {
  $isImmutableNoteCallerNode,
  $isImmutableVerseNode,
  $isSomeVerseNode,
  $selectNextVerse,
  $selectPreviousVerse,
  ImmutableVerseNode,
} from "../../nodes/usj";
import { ViewOptions } from "../../views/view-options.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  ElementNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  $findFirstAncestorNoteNode,
  $getNextNode,
  $getPreviousNode,
  $isBookNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isSomeParaNode,
  CharNode,
  ImmutableChapterNode,
  NoteNode,
} from "shared";

/**
 * Registers arrow-key handling for USJ scripture: verse-to-verse vertical movement when needed,
 * and horizontal movement around notes and chapter boundaries. In editable-marker mode it also
 * normalizes horizontal traversal so every press crosses exactly one piece of rendered content.
 *
 * TODO: When the caret is before an empty verse number in an otherwise empty para, pressing up or
 * down moves the caret to after the verse number in the para above/below rather than staying
 * before the verse number.
 *
 * @param viewOptions - View options (e.g. collapsed note mode) affecting backward navigation.
 * @returns Always `null`; this component has no UI.
 */
export function ArrowNavigationPlugin({
  viewOptions,
}: {
  viewOptions: ViewOptions | undefined;
}): null {
  const [editor] = useLexicalComposerContext();
  useArrowKeys(editor, viewOptions);
  return null;
}

/**
 * When moving with arrow keys, it handles navigation around adjacent verse and note nodes.
 * It also handles not moving if a chapter node is the only thing at the beginning.
 * @param editor - The LexicalEditor instance used to access the DOM.
 * @param viewOptions - The current view options, which may affect navigation behavior.
 */
function useArrowKeys(editor: LexicalEditor, viewOptions: ViewOptions | undefined) {
  useEffect(() => {
    if (!editor.hasNodes([ImmutableChapterNode, ImmutableVerseNode, NoteNode])) {
      throw new Error(
        "ArrowNavigationPlugin: ImmutableChapterNode, ImmutableVerseNode or NoteNode not registered on editor!",
      );
    }

    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

      if (event.key === "ArrowUp") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        if (!$shouldAttemptVerticalVerseNavigation(selection)) return false;
        const isHandled = $selectPreviousVerse(selection);
        if (isHandled) event.preventDefault();
        return isHandled;
      }
      if (event.key === "ArrowDown") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
        if (!$shouldAttemptVerticalVerseNavigation(selection)) return false;
        const isHandled = $selectNextVerse(selection);
        if (isHandled) event.preventDefault();
        return isHandled;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      const inputDiv = editor.getRootElement();
      if (!inputDiv) return false;

      const direction = inputDiv.dir || "ltr";
      // Display runs and glyph text — the stacked invisible positions the normalizer exists for —
      // are built only in editable-marker mode; the other views keep the browser's own traversal.
      const normalizesStops = viewOptions?.markerMode === "editable";
      // The `\fp` boundary hops apply only to plain arrow moves: modified arrows (shift range
      // extension, word/line jumps) keep native semantics.
      const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
      let isHandled = false;
      if (isMovingForward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleForwardFpNavigation(selection)) ||
          $handleForwardNavigation(selection) ||
          (!hasModifier && normalizesStops && $moveOneVisibleStop(selection, "next"));
      } else if (isMovingBackward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleBackwardFpNavigation(selection)) ||
          $handleBackwardNavigation(selection, viewOptions) ||
          (!hasModifier && normalizesStops && $moveOneVisibleStop(selection, "previous"));
      }

      if (isHandled) event.preventDefault();
      return isHandled;
    };

    return editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH);
  }, [editor, viewOptions]);
}

// --- Helper functions for direction checking ---

function isMovingForward(direction: string, key: string): boolean {
  return (
    (direction === "ltr" && key === "ArrowRight") || (direction === "rtl" && key === "ArrowLeft")
  );
}

function isMovingBackward(direction: string, key: string): boolean {
  return (
    (direction === "ltr" && key === "ArrowLeft") || (direction === "rtl" && key === "ArrowRight")
  );
}

// --- Two caret stops around the `\fp` visual line break ---
//
// An expanded note's `\fp` (footnote paragraph) span renders with a CSS-generated line break
// before it (`.note.expanded .usfm_fp::before`). The pseudo content has no DOM position, so the
// browser collapses the caret positions on either side of the visual newline and skips one stop:
// moving forward it jumps from the end of the previous line straight past the start of the `\fp`
// span, and moving backward it can skip the span start on the way out. These handlers restore the
// two stops: end of the previous line, then the very start of the `\fp` span on the new line.

/** The given node if it is a `\fp` span whose leading line break renders (expanded note). */
function $getFpBoundaryCharNode(node: LexicalNode | null | undefined): CharNode | undefined {
  if (!$isCharNode(node) || node.getMarker() !== "fp") return undefined;
  const note = $findFirstAncestorNoteNode(node);
  if (!note || note.getIsCollapsed()) return undefined;
  return node;
}

/** Helper to handle the forward hop onto the start of a `\fp` span at its visual line break. */
function $handleForwardFpNavigation(selection: RangeSelection): boolean {
  const fpNode = $getFpBoundaryCharNode($getNextNode(selection));
  if (!fpNode) return false;

  // A text caret is only at the boundary when it sits at the very end of its text.
  const anchor = selection.anchor;
  if (anchor.type === "text" && anchor.offset !== anchor.getNode().getTextContentSize()) {
    return false;
  }

  const firstChild = fpNode.getFirstChild();
  // Land at the start of the new visual line: offset 0 of the span's first text (the editable
  // marker glyph, or content text when glyphs are hidden). A non-text first child (the
  // non-editable marker glyph) takes an element point before it instead.
  if ($isTextNode(firstChild)) firstChild.select(0, 0);
  else fpNode.select(0, 0);
  return true;
}

/** Helper to handle backward hops at the start of a `\fp` span and its visual line break. */
function $handleBackwardFpNavigation(selection: RangeSelection): boolean {
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();

  if (anchor.type === "text") {
    const fpNode = $getFpBoundaryCharNode(anchorNode.getParent());
    if (!fpNode || !anchorNode.is(fpNode.getFirstChild())) return false;

    if (anchor.offset === 1) {
      // caret after first character of the span's first text → stop at the span start (start of
      // the new visual line) instead of letting the browser collapse the boundary and skip it
      anchorNode.select(0, 0);
      return true;
    }
    if (anchor.offset !== 0) return false;
    // caret at span start → hop over the visual newline to the end of the previous line
    return $selectBeforeFpSpan(fpNode);
  }

  // Element caret at the very start of the `\fp` span (before a non-text first child, e.g. the
  // non-editable marker glyph).
  if (anchor.offset === 0) {
    const fpNode = $getFpBoundaryCharNode(anchorNode);
    if (!fpNode) return false;
    return $selectBeforeFpSpan(fpNode);
  }
  return false;
}

/** Place the caret at the end of the content preceding the `\fp` span (end of the previous line). */
function $selectBeforeFpSpan(fpNode: CharNode): boolean {
  const prevNode = fpNode.getPreviousSibling();
  if (!prevNode) return false;

  if ($isTextNode(prevNode)) {
    prevNode.select();
    return true;
  }
  if ($isElementNode(prevNode)) {
    // end of the previous span's content (e.g. the `\ft` span, or a preceding `\fp`)
    const lastDescendant = prevNode.getLastDescendant();
    if ($isTextNode(lastDescendant)) lastDescendant.select();
    else prevNode.selectEnd();
    return true;
  }
  // Decorator sibling (e.g. the note caller): place the caret between it and the `\fp` span so
  // the existing note-boundary handling can take over from there on the next press.
  const parent = fpNode.getParent();
  if (!parent) return false;
  const fpIndex = fpNode.getIndexWithinParent();
  parent.select(fpIndex, fpIndex);
  return true;
}

// --- The visible-stop normalizer ---
//
// ONE rule for horizontal arrow traversal, replacing the per-shape hops that preceded it: an
// unmodified arrow press must cross exactly ONE piece of RENDERED content — a visible character, or
// a visible atom (a note caller, an immutable glyph, a collapsed note) crossed whole. Everything
// that renders nothing is stepped over, however many tree positions it contributes: element
// boundaries, wrapper seams, and zero-width decorators such as a `MilestoneNode`, whose `decorate()`
// returns "".
//
// Those invisible positions are the whole problem. A milestone anchor sits between the text before
// it and its own `\qt-s`…`\*` display run, so the run's leading seam alone stacks up to five tree
// positions at ONE screen location — end of the preceding text, before the anchor, after the anchor,
// the wrapper's own start, offset 0 of its first glyph. Lexical and the browser stop at several of
// them, so a press moved the caret without moving anything the eye could follow; a caret in a marker
// glyph merely changes colour, from the paragraph's black to the run's dim grey. Nested spans stack
// more seams (`\add word\add*\qt-s\*` measured three presses to cross `*`→`\`), and where the seam
// is a zero-width decorator with no text on the far side the browser refuses the move outright, so
// the caret could not leave a run leftward at all.
//
// Two halves make one press equal one visible crossing:
//   - MOVE: from the caret, walk in the press direction, skipping everything that renders nothing,
//     until the first rendered thing; cross exactly it. Crossing a visible text node means landing
//     one grapheme INTO it, not at its edge — the edge is the position the caret just left.
//   - CANONICALIZE: where several tree positions share one screen location, only ONE is a resting
//     place — the outermost, earliest in document order: the end of the nearest preceding visible
//     text. That is Lexical's own convention for a plain text/text seam
//     (`resolveSelectionPointOnBoundary`), extended across the invisible nodes it does not look
//     through. It keeps round trips exact — N presses one way and N back returns to the very same
//     tree position — and it keeps typing predictable, since the two positions flanking a run's
//     opening glyph put typed text in different nodes.
//
// Scope: unmodified ArrowLeft/ArrowRight, collapsed caret, editable-marker mode (where display runs
// and glyph text exist at all), and only within the caret's own block. At a block edge this declines
// and the existing paragraph/line handling runs. Direction is LOGICAL — `isMovingForward` maps the
// physical key through the root's `dir`, so RTL mirrors for free. Claiming the key keeps Lexical's
// own `KEY_ARROW_*` handling from running at all, so `$moveCharacter` never double-applies and no
// native `Selection.modify` is consulted; the whole traversal is decided from the tree, which is
// also what makes press counts measurable without browser caret geometry.
//
// Clicks and programmatic selection are untouched — this is arrow traversal only, so a caret parked
// on a non-canonical position by other means is normalized by its next arrow press rather than
// underneath the user.
//
// KNOWN APPROXIMATIONS, both disclosed rather than silently smoothed:
//   - Moves that stay INSIDE one text node are declined, so the browser keeps applying its own
//     grapheme and bidi rules there — the cases a tree walk cannot see. The one exception is a
//     backward step off a text node's first character, which must be claimed because its landing
//     needs canonicalizing. A backward step that lands on offset 0 from further in (only possible
//     when the FIRST grapheme spans several code units) is left to the browser and so rests on a
//     non-canonical position until the next boundary press normalizes it.
//   - Visual bidi order inside mixed-direction text is not modelled; traversal is logical.

type TraversalDirection = "next" | "previous";

/** Where a resolved move lands: a text point, or an element point between two children. */
type CaretLanding =
  | { kind: "text"; node: TextNode; offset: number }
  | { kind: "element"; node: ElementNode; offset: number };

/**
 * Minimal shape of `Intl.Segmenter`, declared locally so this file does not depend on the ambient
 * lib target carrying it. Absent at runtime, the code-point fallbacks below still keep the caret off
 * the inside of a surrogate pair.
 */
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ index: number; segment: string }>;
}

const graphemeSegmenter: GraphemeSegmenter | undefined = (() => {
  const intl = Intl as unknown as {
    Segmenter?: new (
      locales?: string | undefined,
      options?: { granularity: string },
    ) => GraphemeSegmenter;
  };
  return intl.Segmenter ? new intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;
})();

/** The offset just past `text`'s first grapheme — where a forward crossing into it lands. */
function firstGraphemeEnd(text: string): number {
  if (graphemeSegmenter) {
    for (const { segment } of graphemeSegmenter.segment(text)) return segment.length;
  }
  const codePoint = text.codePointAt(0);
  return codePoint === undefined ? 0 : String.fromCodePoint(codePoint).length;
}

/** The offset where `text`'s last grapheme begins — where a backward crossing into it lands. */
function lastGraphemeStart(text: string): number {
  if (graphemeSegmenter) {
    let start = 0;
    for (const { index } of graphemeSegmenter.segment(text)) start = index;
    return start;
  }
  const codePoint = text.codePointAt(Math.max(0, text.length - 2));
  const isSurrogatePair = codePoint !== undefined && codePoint > 0xffff;
  return Math.max(0, text.length - (isSurrogatePair ? 2 : 1));
}

/** The block the traversal is confined to — arrows leave a block through the handlers above. */
function $blockOf(node: LexicalNode): ElementNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isElementNode(current) && !current.isInline()) return current;
  }
  return undefined;
}

/** Text the caret walks through one character at a time. */
function $isTraversableText(node: LexicalNode | null | undefined): node is TextNode {
  return $isTextNode(node) && !node.isToken() && node.getTextContentSize() > 0;
}

/**
 * Rendered as one indivisible glyph: crossing it is a single stop, and the caret never lands inside.
 * A COLLAPSED note qualifies whole — only its caller is on screen, and its hidden content must not
 * be walked into. Every decorator is one except a `MilestoneNode`, the one node here that renders
 * nothing at all; a new zero-width decorator belongs in that exception, or traversal will stop on it.
 */
function $isVisibleAtom(node: LexicalNode): boolean {
  // The collapsed flag is undefined until the note plugin settles it; an unsettled note counts as
  // expanded, matching what is on screen before the collapse lands.
  if ($isNoteNode(node)) return node.getIsCollapsed() === true;
  if ($isDecoratorNode(node)) return !$isMilestoneNode(node);
  return $isTextNode(node) && node.isToken() && node.getTextContentSize() > 0;
}

/** The next node in document order in `direction`, stepping out of ancestors, bounded by `block`. */
function $stepOver(
  from: LexicalNode,
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  for (let current: LexicalNode | null = from; current && !current.is(block); ) {
    const sibling = direction === "next" ? current.getNextSibling() : current.getPreviousSibling();
    if (sibling) return sibling;
    current = current.getParent();
  }
  return undefined;
}

/**
 * The first node rendering anything, starting AT `seed` and walking `direction` — descending into
 * elements that are not atoms, stepping over everything invisible.
 */
function $scanForRendered(
  seed: LexicalNode | undefined,
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  for (let cursor = seed; cursor; ) {
    if ($isVisibleAtom(cursor)) return cursor;
    if ($isElementNode(cursor)) {
      const child = direction === "next" ? cursor.getFirstChild() : cursor.getLastChild();
      cursor = child ?? $stepOver(cursor, direction, block);
      continue;
    }
    if ($isTraversableText(cursor)) return cursor;
    cursor = $stepOver(cursor, direction, block);
  }
  return undefined;
}

/** The node a scan should consider first when leaving the caret's position in `direction`. */
function $scanSeed(
  anchorNode: LexicalNode,
  anchorOffset: number,
  anchorType: "text" | "element",
  direction: TraversalDirection,
  block: ElementNode,
): LexicalNode | undefined {
  if (anchorType === "element" && $isElementNode(anchorNode)) {
    const child = anchorNode.getChildAtIndex(
      direction === "next" ? anchorOffset : anchorOffset - 1,
    );
    return child ?? $stepOver(anchorNode, direction, block);
  }
  return $stepOver(anchorNode, direction, block);
}

/** The single resting position for the screen location `landing` sits at. */
function $canonicalize(landing: CaretLanding, block: ElementNode): CaretLanding {
  // A text point with a character before it in its own node is already the outermost position at
  // its location — nothing invisible separates it from rendered content on its left.
  if (landing.kind === "text" && landing.offset > 0) return landing;

  const seed = $scanSeed(landing.node, landing.offset, landing.kind, "previous", block);
  const rendered = $scanForRendered(seed, "previous", block);
  // Nothing rendered precedes it (the block's leading edge): the landing is already outermost.
  if (!rendered) return landing;
  if ($isTraversableText(rendered))
    return { kind: "text", node: rendered, offset: rendered.getTextContentSize() };

  const parent = rendered.getParent();
  if (!parent) return landing;
  return { kind: "element", node: parent, offset: rendered.getIndexWithinParent() + 1 };
}

/** Where a single press lands, or `undefined` when the block edge leaves nothing to cross. */
function $resolveOneVisibleStop(
  selection: RangeSelection,
  direction: TraversalDirection,
): CaretLanding | undefined {
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  const block = $blockOf(anchorNode);
  if (!block) return undefined;

  // Inside a text node the browser's own grapheme and bidi handling is better than a tree walk, so
  // those moves are declined — except a backward step off the first character, whose landing at
  // offset 0 is one of the stacked positions and has to be canonicalized.
  if (anchor.type === "text" && $isTraversableText(anchorNode)) {
    if (direction === "next" && anchor.offset < anchorNode.getTextContentSize()) return undefined;
    if (direction === "previous" && anchor.offset > 1) return undefined;
    if (direction === "previous" && anchor.offset === 1)
      return $canonicalize({ kind: "text", node: anchorNode, offset: 0 }, block);
  }

  const seed = $scanSeed(anchorNode, anchor.offset, anchor.type, direction, block);
  const rendered = $scanForRendered(seed, direction, block);
  if (!rendered) return undefined;

  if ($isTraversableText(rendered)) {
    const text = rendered.getTextContent();
    const offset = direction === "next" ? firstGraphemeEnd(text) : lastGraphemeStart(text);
    return $canonicalize({ kind: "text", node: rendered, offset }, block);
  }

  const parent = rendered.getParent();
  if (!parent) return undefined;
  const index = rendered.getIndexWithinParent();
  return $canonicalize(
    { kind: "element", node: parent, offset: direction === "next" ? index + 1 : index },
    block,
  );
}

/** Moves the caret one visible stop in `direction`; `false` leaves the press to other handling. */
function $moveOneVisibleStop(selection: RangeSelection, direction: TraversalDirection): boolean {
  const landing = $resolveOneVisibleStop(selection, direction);
  if (!landing) return false;
  // Already there (a canonicalization that resolved back onto the caret): report the press as
  // unhandled rather than claiming a keystroke that changes nothing.
  if (
    landing.node.is(selection.anchor.getNode()) &&
    landing.offset === selection.anchor.offset &&
    landing.kind === selection.anchor.type
  ) {
    return false;
  }
  landing.node.select(landing.offset, landing.offset);
  return true;
}

/** Helper to handle forward arrow key navigation logic */
function $handleForwardNavigation(selection: RangeSelection): boolean {
  const node = selection.anchor.getNode();
  const nextNode = $getNextNode(selection);
  if ($isNoteNode(nextNode) && !$isMarkerNode(nextNode.getFirstChild())) {
    // note is next and markers are not editable
    if ($isSomeParaNode(node)) {
      const isSelectionAtParaEnd = selection.anchor.offset === node.getChildrenSize();
      if (isSelectionAtParaEnd) return false;
    } else {
      const isSelectionAtNodeEnd = selection.anchor.offset === node.getTextContentSize();
      if (!isSelectionAtNodeEnd) return false;
    }

    if (!nextNode.getIsCollapsed()) {
      // caret at end of node before expanded note → move past note caller
      if ($isImmutableTypedTextNode(nextNode.getFirstChild())) nextNode.select(2, 2);
      else nextNode.select(1, 1);
      return true;
    } else if (nextNode.is(nextNode.getParent()?.getLastChild())) {
      // caret at end of node before collapsed note at end of para → move past note
      nextNode.getParent()?.getNextSibling()?.selectStart();
      return true;
    }
  }

  if ($isSomeParaNode(node) && $isNoteNode(nextNode) && nextNode.getIsCollapsed()) {
    // caret between verse and collapsed note → move past note
    const nodeAfterNote = nextNode.getNextSibling();
    if (nodeAfterNote) nodeAfterNote.selectStart();
    // TODO: we probably need a space character after a note at the end of a para to allow caret
    // placement after the note. Currently typing will go into the note.
    else nextNode.selectEnd();
    return true;
  }

  const nextNodeParent = nextNode?.getParent();
  if (
    $isImmutableTypedTextNode(nextNode) &&
    $isNoteNode(nextNodeParent) &&
    nextNode.is(nextNodeParent?.getLastChild())
  ) {
    // caret before closing note marker → move past note
    const nodeAfterNote = nextNodeParent.getNextSibling();
    if (nodeAfterNote) nodeAfterNote.selectStart();
    // TODO: we probably need a space character after a note at the end of a para to allow caret
    // placement after the note. Currently typing will go into the note.
    else nextNodeParent.selectEnd();
    return true;
  }

  return false;
}

/** Helper to handle backward arrow key navigation logic */
function $handleBackwardNavigation(
  selection: RangeSelection,
  viewOptions: ViewOptions | undefined,
): boolean {
  const prevNode = $getPreviousNode(selection);
  // If a chapter node is the only thing at the beginning → don't move.
  if ($isImmutableChapterNode(prevNode) && !prevNode.getPreviousSibling()) return true;

  // If not at the beginning of node text → skip.
  const isSelectionAtNodeStart = selection.anchor.offset === 0;
  if (!isSelectionAtNodeStart) return false;

  // If at the beginning of book node text → don't move.
  const node = selection.anchor.getNode();
  if ($isBookNode(node.getParent())) return true;

  if ($isNoteNode(prevNode) && prevNode.getIsCollapsed()) {
    // caret at end of collapsed note preceded by verse → move to start of note in para
    const nodeBeforeNote = prevNode.getPreviousSibling();
    if (!$isImmutableVerseNode(nodeBeforeNote)) return false;

    const parent = prevNode.getParent();
    if (!parent) return false;

    const noteIndex = prevNode.getIndexWithinParent();
    parent.select(noteIndex, noteIndex);
    return true;
  }

  // Deliberately gated on the always-"collapsed" MODE, not just the note's own collapsed flag:
  // under "expandInline" the caret must instead land inside the note's end (Lexical's default
  // move), where the NoteNodePlugin expands it for inline editing — hopping over the note here
  // would defeat that enter-and-expand behavior.
  if ($isSomeParaNode(prevNode) && viewOptions?.noteMode === "collapsed") {
    // caret at beginning of para after collapsed note → move to start in previous para
    const lastChild = prevNode.getLastChild();
    if (!lastChild) return false;

    const note = $findMatchingParent(lastChild, (n: LexicalNode) => $isNoteNode(n));
    if ($isNoteNode(note) && note.getIsCollapsed()) {
      const parent = note.getParent();
      if (!parent) return false;

      const noteIndex = note.getIndexWithinParent();
      parent.select(noteIndex, noteIndex);
      return true;
    }
  }

  const noteNode = $findFirstAncestorNoteNode(node);
  if (!noteNode || noteNode.getIsCollapsed()) return false;

  if ($isImmutableNoteCallerNode(prevNode)) {
    // caret after caller in expanded note (markers hidden) → move to start of note in para
    const parent = noteNode.getParent();
    if (!parent) return false;

    const noteIndex = noteNode.getIndexWithinParent();
    parent.select(noteIndex, noteIndex);
    return true;
  }

  return false;
}

/**
 * Returns whether custom ArrowUp/ArrowDown verse navigation should run.
 *
 * Intercepts when the anchor is an element point (cursor between block nodes, including
 * positions adjacent to `ImmutableVerseNode`) or when the anchor is inside an editable
 * `VerseNode` (a `TextNode` subclass). Regular `TextNode` positions are left to Lexical's
 * default visual-line navigation.
 *
 * Lexical normalizes element points to text offset 0 when the next child is a `TextNode`;
 * the post-normalization position right after an `ImmutableVerseNode` marker is also
 * treated as a verse boundary.
 */
function $shouldAttemptVerticalVerseNavigation(selection: RangeSelection): boolean {
  if (selection.anchor.type === "element") return true;
  const anchorNode = selection.anchor.getNode();
  if ($isSomeVerseNode(anchorNode)) return true;
  if (selection.anchor.offset === 0 && $isSomeVerseNode(anchorNode.getPreviousSibling())) {
    return true;
  }
  return false;
}
