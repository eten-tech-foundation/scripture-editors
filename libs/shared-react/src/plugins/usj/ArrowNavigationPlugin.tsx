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
  $getCollapsedCaretRange,
  $getSelection,
  $getSiblingCaret,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $normalizeCaret,
  $setSelectionFromCaretRange,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { useEffect } from "react";
import {
  $findFirstAncestorNoteNode,
  $getNextNode,
  $getPreviousNode,
  $isAttributeRunNode,
  $isBookNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isSomeParaNode,
  AttributeRunNode,
  CharNode,
  ImmutableChapterNode,
  NoteNode,
} from "shared";

/**
 * Registers arrow-key handling for USJ scripture: verse-to-verse vertical movement when needed,
 * and horizontal movement around notes, chapter boundaries, and the leading edge of a milestone's
 * attribute display run.
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
      // The `\fp` boundary hops apply only to plain arrow moves: modified arrows (shift range
      // extension, word/line jumps) keep native semantics.
      const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
      let isHandled = false;
      if (isMovingForward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleForwardFpNavigation(selection)) ||
          $handleForwardNavigation(selection);
      } else if (isMovingBackward(direction, event.key)) {
        isHandled =
          (!hasModifier && $handleBackwardFpNavigation(selection)) ||
          (!hasModifier && $handleBackwardMilestoneRunNavigation(selection)) ||
          $handleBackwardNavigation(selection, viewOptions);
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

// --- The caret stop at a milestone display run's leading edge ---
//
// A milestone's display run — its `\qt-s`…`\*` glyph pair and any attribute value — rides inside
// ONE inline `AttributeRunNode` immediately following the `MilestoneNode` that owns it, and that
// owner is a `DecoratorNode` rendering nothing: an empty `contenteditable="false"` span.
//
// Lexical (pinned at 0.43.0) resolves a caret move across a decorator itself only while the
// decorator is a SIBLING of the caret's own node (`$modifySelectionAroundDecoratorsAndBlocks`);
// the fallback scan that does walk out through ancestors claims only NON-inline decorators, and a
// milestone is inline. With the run's glyphs one level down inside the wrapper the milestone is
// the WRAPPER's sibling rather than the glyph's, so Lexical declines and defers to the browser's
// native `Selection.modify` — which will not carry a caret backward across an empty non-editable
// span. `@lexical/rich-text`'s ArrowLeft handler has already called `preventDefault` by then (its
// own `$shouldOverrideDefaultCharacterSelection` DOES see the decorator through the wrapper), so
// the keystroke is consumed and nothing happens at all: the caret cannot leave the run leftward.
// This handler makes the hop instead, landing exactly where Lexical's own decorator handling did
// before the run was wrapped — the position before the owner, normalized to the end of the
// preceding text when there is text there.
//
// `AttributeRunNode.test.ts` (shared) pins that Lexical-side behavior directly, and is the
// tripwire for a Lexical upgrade: if the wrapped shape starts being resolved by Lexical again,
// that pin fails and this handler can be retired.
//
// COVERED: backward, collapsed, UNMODIFIED arrows. Three cases are knowingly left to the browser:
//   - Shift-extend stays trapped. Restoring it needs an extend of the focus alone, not the
//     collapsed range set below. This is a genuine regression from the wrapper: before it,
//     shift+ArrowLeft was resolved by Lexical; wrapped, it falls through to the native move.
//   - Ctrl/Alt/Meta arrows are excluded because Lexical never hopped them either, before or after
//     the wrapper — so claiming them here would be new behavior, not restored parity. Its keydown
//     gate (`isMoveBackward`, an EXACT modifier match allowing only shift) dispatches
//     `KEY_ARROW_LEFT_COMMAND` for unmodified/shifted ArrowLeft alone; ctrl+ArrowLeft dispatches
//     `MOVE_TO_START`, which nothing anywhere registers a handler for, and alt+ArrowLeft dispatches
//     nothing at all. Both reach the browser un-preventDefaulted, with word/line granularity this
//     character hop would not reproduce.
//   - FORWARD off the run's trailing edge. That usually crosses into ordinary text, which the
//     browser handles, but two adjacent milestones (`wrapper` → `MilestoneNode` → `wrapper`, with
//     no text between) put the same empty decorator in the way. Known and unfixed.
//
// Scoped structurally to the milestone kind, mirroring the display-run registry's own ownership
// rule (`displayRunRegistry.ts`, `milestoneDescriptor.ownerOf`: a wrapper's owner is the
// `MilestoneNode` directly before it, and only for a "milestone" `runKind`). Testing instead that
// the owner is any decorator would rest on a view-mode coincidence rather than a rule — an
// editable-mode `VerseNode` is a `TextNode`, but `ImmutableVerseNode` is a `DecoratorNode`, so a
// verse's `\va`/`\vp` wrapper would start matching wherever the immutable form is built.

/** The `AttributeRunNode` whose very start the collapsed caret sits at, if any. */
function $getAttributeRunAtStart(selection: RangeSelection): AttributeRunNode | undefined {
  const anchor = selection.anchor;
  if (anchor.offset !== 0) return undefined;

  const anchorNode = anchor.getNode();
  // Element point directly on the wrapper (e.g. an empty wrapper, or a click-placed caret).
  if (anchor.type === "element") return $isAttributeRunNode(anchorNode) ? anchorNode : undefined;

  // Text point at offset 0 of the run's first piece — the opening marker glyph.
  const parent = anchorNode.getParent();
  if (!$isAttributeRunNode(parent) || !anchorNode.is(parent.getFirstChild())) return undefined;
  return parent;
}

/** Helper to handle the backward hop out of a milestone's display run. */
function $handleBackwardMilestoneRunNavigation(selection: RangeSelection): boolean {
  const wrapper = $getAttributeRunAtStart(selection);
  if (!wrapper || wrapper.getRunKind() !== "milestone") return false;

  // Ownership is position-derived: the wrapper directly follows the leaf it belongs to.
  const owner = wrapper.getPreviousSibling();
  if (!$isMilestoneNode(owner)) return false;

  $setSelectionFromCaretRange(
    $getCollapsedCaretRange($normalizeCaret($getSiblingCaret(owner, "previous"))),
  );
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
