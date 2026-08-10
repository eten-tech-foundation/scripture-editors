import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $unwrapNode } from "@lexical/utils";
import {
  $copyNode,
  $createNodeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  EditorUpdateOptions,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $createNodeFromSerializedNode,
  $findChapter,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  $isSynthesizedMarkerNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  CharNode,
  createLexicalUsjNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getNextVerse,
  getSelectionStartNode,
  isVerseInRange,
  isVerseRange,
  LoggerBasic,
  MarkerAction,
  NBSP,
  NoteNode,
  ParaNode,
  ScriptureReference,
} from "shared";
import {
  $addTrailingSpace,
  $findNextVerseAfter,
  $findThisVerse,
  $insertNote,
  $isSomeVerseNode,
  $removeLeadingSpace,
  getDefaultViewOptions,
  UsjNodeOptions,
  ViewOptions,
} from "shared-react";
import usjEditorAdaptor from "./usj-editor.adaptor";

interface UsjMarkerActionResult {
  content: MarkerContent[];
  /** When true, the outer handler selects the freshly-inserted node (`NodeSelection`) instead of
   * placing the caret after it - used by the verse action's "no numeric slot" highlight cue. */
  highlightInserted?: boolean;
}

interface UsjMarkerAction {
  label?: string;
  action: (currentEditor: {
    editor: LexicalEditor;
    reference: ScriptureReference;
    autoNumbering?: boolean;
    newVerseRChapterNum?: number;
    noteText?: string;
  }) => UsjMarkerActionResult;
}

const markerActions: { [marker: string]: UsjMarkerAction } = {
  c: {
    // Deliberately still trusts reference.chapterNum, unlike `v` below - the chapter-number
    // reinstatement work (a separate branch/PR) owns rewriting this action to scan the tree.
    action: (currentEditor) => {
      const { chapterNum } = currentEditor.reference;
      // Chapter node already present → next chapter; none present (reinstating a missing `\c`
      // in an otherwise-blank chapter) → keep the current number, don't increment. Intentionally
      // narrow: this doesn't check whether `chapterNum + 1` already exists elsewhere before
      // incrementing into it, so the pre-existing duplicate-`\c` case in that scenario is
      // unchanged by this fix.
      const hasChapterNode = $findChapter($getRoot().getChildren(), chapterNum) !== undefined;
      const targetChapter = hasChapterNode ? chapterNum + 1 : chapterNum;
      const content: MarkerContent = {
        type: "chapter",
        marker: "c",
        number: `${targetChapter}`,
      };
      return { content: [content] };
    },
  },
  v: {
    action: () => {
      const selection = $getSelection();
      const anchorNode = getSelectionStartNode(selection);
      const precedingVerse = $findThisVerse(anchorNode);

      let nextVerseNumber: string;
      let highlightInserted = false;
      if (!precedingVerse) {
        nextVerseNumber = "1";
      } else {
        const precedingVerseString = precedingVerse.getNumber();
        // getNextVerse ignores its first (numeric) argument whenever `verse` is given, which it
        // always is here - the leading 0 is a placeholder, not a meaningful value.
        nextVerseNumber = getNextVerse(0, precedingVerseString);
        const followingVerse = $findNextVerseAfter(precedingVerse);
        if (followingVerse) {
          const followingVerseString = followingVerse.getNumber();
          // Exact match catches plain-number and same-segment collisions (e.g. "5c" === "5c").
          // The range check additionally catches a bridge that swallows the inserted number
          // (e.g. inserting "5" when the following verse is bridge "5-6") - gated on the
          // following verse actually being a bridge so it doesn't also fire for an unrelated
          // segment that merely shares a leading digit (e.g. "5c" next to "5d" is not a collision).
          highlightInserted =
            nextVerseNumber === followingVerseString ||
            (isVerseRange(followingVerseString) &&
              isVerseInRange(parseInt(nextVerseNumber, 10), followingVerseString));
        }
      }

      const content: MarkerContent = {
        type: "verse",
        marker: "v",
        number: nextVerseNumber,
      };
      return { content: [content], highlightInserted };
    },
  },
};

/** Returns whether the given USFM marker is supported by {@link getUsjMarkerAction}. */
export function isUsjMarkerSupported(marker: string): boolean {
  return (
    NoteNode.isValidMarker(marker) ||
    !!markerActions[marker] ||
    ParaNode.isValidMarker(marker) ||
    CharNode.isValidMarker(marker)
  );
}

/**
 * Returns whether the given USFM marker is a character marker, and so can be removed by
 * {@link $removeCharacterMarkerAtSelection}.
 *
 * Deliberately stricter than {@link isUsjMarkerSupported}: that one also accepts para, note,
 * chapter, and verse markers, but removal only ever targets a `CharNode`, so `"p"` must be
 * rejected. It also honors `extraValidMarkers`, which `isUsjMarkerSupported` does not — a character
 * marker this project configures as valid, and which the adaptor therefore accepts on load, should
 * be removable too.
 *
 * Stricter than `CharNode.isValidMarker` too: that list spreads in the footnote and
 * cross-reference character markers (`"ft"`, `"xt"`, …), but those only ever occur inside a
 * `NoteNode`, which `$getCharNodeToRemove` skips. Accepting them here would promise a removal that
 * can never happen and then silently no-op, so they are rejected up front instead.
 *
 * @param marker - The USFM marker to check.
 * @param extraValidMarkers - Extra character markers this project treats as valid.
 * @returns `true` if the marker is a character marker.
 */
export function isCharacterMarkerSupported(
  marker: string,
  extraValidMarkers?: readonly string[],
): boolean {
  if (CharNode.isValidFootnoteMarker(marker) || CharNode.isValidCrossReferenceMarker(marker))
    return false;
  return CharNode.isValidMarker(marker, extraValidMarkers);
}

/** A function that returns a marker action for a given USJ marker */
export function getUsjMarkerAction(
  marker: string,
  expandedNoteKeyRef: React.MutableRefObject<string | undefined>,
  viewOptions?: ViewOptions,
  nodeOptions?: UsjNodeOptions,
  logger?: LoggerBasic,
  /** Included for tests, e.g. `{ discrete: true }` */
  editorUpdateOptions?: EditorUpdateOptions,
): MarkerAction {
  // Note markers are handled directly via $insertNote (no serialization round-trip).
  if (NoteNode.isValidMarker(marker)) {
    const action = (currentEditor: { editor: LexicalEditor; reference: SerializedVerseRef }) => {
      currentEditor.editor.update(() => {
        const noteNode = $insertNote(
          marker,
          undefined,
          undefined,
          currentEditor.reference,
          viewOptions ?? getDefaultViewOptions(),
          nodeOptions ?? {},
          logger,
        );
        if (noteNode && !noteNode.getIsCollapsed()) expandedNoteKeyRef.current = noteNode.getKey();
      }, editorUpdateOptions);
    };
    return { action, label: undefined };
  }

  const markerAction = getMarkerAction(marker);
  // No-op for unsupported markers so the marker menu doesn't crash during render.
  if (!markerAction) return { action: () => undefined, label: undefined };
  const action = (currentEditor: {
    editor: LexicalEditor;
    reference: SerializedVerseRef;
    noteText?: string;
  }) => {
    currentEditor.editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) currentEditor.noteText = selection.getTextContent();
      const { content, highlightInserted } = markerAction.action(currentEditor);

      const serializedLexicalNode = createLexicalUsjNode(content, usjEditorAdaptor, viewOptions);
      const nodeToInsert = $createNodeFromSerializedNode(serializedLexicalNode);

      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
        const nodeParent = node.getParent();
        if (selection.getTextContent().length > 0) {
          // If the selection has text content, wrap the text selection in an inline node
          $wrapTextSelectionInInlineNode(selection, () =>
            $createNodeFromSerializedNode(serializedLexicalNode),
          );
        } else if ($isElementNode(nodeToInsert) && !nodeToInsert.isInline()) {
          // If the selection is empty, insert a new paragraph and replace it with the USJ node
          const paragraph = selection.insertParagraph();
          if (paragraph) {
            // Transfer the content of the paragraph to the USJ node
            const paragraphContent = paragraph.getChildren();
            nodeToInsert.append(...paragraphContent);
            paragraph.replace(nodeToInsert);
            nodeToInsert.selectStart();
          }
        } else if (
          $isTextNode(node) &&
          !$isMarkerNode(node) &&
          selection.isCollapsed() &&
          ($isNoteNode(nodeParent) ||
            ($isCharNode(nodeParent) && $isNoteNode(nodeParent.getParent())))
        ) {
          // Inserting into a NoteNode. The caret sits on the note's own text (a spacer) or inside
          // one of its CharNodes; insert the new marker as a sibling within the note so it can't
          // escape into the surrounding paragraph.
          const caretChar = $isCharNode(nodeParent) ? nodeParent : undefined;
          // When the caret is inside a char, split it there: the content after the caret moves into
          // a following clone so the new marker lands between the two halves (not after the char).
          const charTail = caretChar
            ? $collectSiblingsFromCaret(node, selection.anchor.offset)
            : [];
          const noteChildAnchor = caretChar ?? node;
          let lastInsertedNode: LexicalNode = noteChildAnchor.insertAfter(nodeToInsert);
          if ($isVisibleMarkerNode(nodeToInsert)) {
            // We are using visible marker mode so the `nodeToInsert` is just the marker. Get the
            // CharNode with content to insert after it.
            const _viewOptions: ViewOptions = {
              ...(viewOptions || getDefaultViewOptions()),
              markerMode: "hidden",
            };
            const serializedLexicalNode = createLexicalUsjNode(
              content,
              usjEditorAdaptor,
              _viewOptions,
            );
            const charNodeToInsert = $createNodeFromSerializedNode(serializedLexicalNode);
            lastInsertedNode = lastInsertedNode.insertAfter(charNodeToInsert);
          }
          if (charTail.length > 0 && caretChar) {
            // Move the after-caret content into a clone of the split char, right after the marker.
            // Use $createCharNodeLike (not a hand-rolled $createCharNode) so the clone keeps the
            // char's identity - notably charIdState - and $charNodeTransform can re-merge the halves
            // if the marker between them is later removed.
            const tailChar = $createCharNodeLike(caretChar).append(...charTail);
            lastInsertedNode.insertAfter(tailChar);
            if (caretChar.isEmpty()) caretChar.remove();
          } else if (!$isTextNode(lastInsertedNode.getNextSibling())) {
            // Add a trailing spacer only if one doesn't already follow. Inserting between a char and
            // its existing spacer would leave two adjacent spacers, which a note transform collapses
            // with a selectEnd that steals the caret out of the new marker.
            lastInsertedNode.insertAfter($createTextNode(NBSP));
          }
          // Land the caret inside the new marker's content, not before it (PT-3780). selectEnd
          // leaves it after the empty-char placeholder, which the placeholder transform strips on
          // the first keystroke.
          if ($isElementNode(lastInsertedNode)) lastInsertedNode.selectEnd();
        } else {
          selection.insertNodes([nodeToInsert]);
          $moveVerseFollowingSpaceToPreviousNode(nodeToInsert);
          // `highlightInserted` is only honored on this branch (plain insert at a collapsed
          // caret). Deliberate: only the `v` action ever sets it, and a verse marker - an inline
          // DecoratorNode with no text content - always takes this path in practice, never the
          // text-wrap, paragraph-replace, or note-insert branches above.
          if (highlightInserted) {
            const nodeSelection = $createNodeSelection();
            nodeSelection.add(nodeToInsert.getKey());
            $setSelection(nodeSelection);
          } else {
            const nextNode = nodeToInsert.getNextSibling();
            if (nextNode) nextNode.selectStart();
            else nodeToInsert.selectStart();
          }
        }
      } else {
        // Insert the node directly
        selection?.insertNodes([nodeToInsert]);
      }
    }, editorUpdateOptions);
  };
  return { action, label: markerAction?.label };
}

/**
 * Collect the caret's "tail" within its parent element: the part of `node` after `offset` plus all
 * following siblings, splitting `node` in place when the caret is mid-text. Used to split a char at
 * the caret so a new marker can be inserted between the halves.
 */
function $collectSiblingsFromCaret(node: TextNode, offset: number): LexicalNode[] {
  const size = node.getTextContentSize();
  let tailStart: LexicalNode | null;
  if (offset <= 0) tailStart = node;
  else if (offset >= size) tailStart = node.getNextSibling();
  else tailStart = node.splitText(offset)[1] ?? node.getNextSibling();
  if (!tailStart) return [];
  return [tailStart, ...tailStart.getNextSiblings()];
}

function getMarkerAction(marker: string): UsjMarkerAction | undefined {
  let markerAction = markerActions[marker];
  if (!markerAction) {
    if (ParaNode.isValidMarker(marker)) {
      markerAction = {
        action: () => {
          const content: MarkerContent = { type: ParaNode.getType(), marker, content: [] };
          return { content: [content] };
        },
      };
    } else if (CharNode.isValidMarker(marker)) {
      markerAction = {
        action: () => {
          const content: MarkerContent = { type: CharNode.getType(), marker };
          return { content: [content] };
        },
      };
    }
  }
  return markerAction;
}

function $wrapTextSelectionInInlineNode(
  selection: RangeSelection,
  createNode: () => LexicalNode,
): void {
  const nodes = selection.getNodes();
  const [startOffset, endOffset] = getSelectionOffsets(selection);

  let currentWrapper: LexicalNode | undefined;

  nodes.forEach((node, index) => {
    // Skip if node is already wrapped
    if ($isElementNode(currentWrapper) && currentWrapper.isParentOf(node)) {
      return;
    }

    // Get the target node to wrap
    const targetNode = $getTargetNode(
      node,
      index === 0,
      index === nodes.length - 1,
      startOffset,
      endOffset,
    );

    if (!targetNode) {
      currentWrapper = undefined;
      return;
    }

    // Create or reuse wrapper node
    if (!currentWrapper) {
      currentWrapper = createNode();
      targetNode.insertBefore(currentWrapper);
    }

    // Wrap the target node
    $wrapNode(targetNode, currentWrapper);
  });

  // Update selection
  if ($isTextNode(currentWrapper) || $isElementNode(currentWrapper)) currentWrapper.selectEnd();
}

// #region Helper functions for wrapping and unwrapping inline nodes

/**
 * Get the start and end offsets of a selection.
 * @param selection - The selection to get the offsets from.
 * @returns the start and end offsets of the selection.
 */
function getSelectionOffsets(selection: RangeSelection): [number, number] {
  const anchorOffset = selection.anchor.offset;
  const focusOffset = selection.focus.offset;
  return selection.isBackward() ? [focusOffset, anchorOffset] : [anchorOffset, focusOffset];
}

/**
 * Whether a marker action never acts on `node`: mark nodes and note contents are always skipped.
 *
 * @param node - The node to check.
 * @returns `true` if the node should be skipped.
 */
function $isSkippedByMarkerAction(node: LexicalNode): boolean {
  return $isTypedMarkNode(node) || $isNoteNode(node) || $isNoteNode(node.getParent());
}

function $getTargetNode(
  node: LexicalNode,
  isFirst: boolean,
  isLast: boolean,
  startOffset: number,
  endOffset: number,
): LexicalNode | undefined {
  // Skip mark nodes and note nodes
  if ($isSkippedByMarkerAction(node)) {
    return undefined;
  }

  // Handle text nodes
  if ($isTextNode(node)) {
    return handleTextNode(node, isFirst, isLast, startOffset, endOffset);
  }

  // Handle inline elements
  if ($isElementNode(node) && node.isInline()) {
    return node;
  }
  return undefined;
}

function handleTextNode(
  node: TextNode,
  isFirst: boolean,
  isLast: boolean,
  startOffset: number,
  endOffset: number,
): TextNode | undefined {
  const textLength = node.getTextContentSize();
  const start = isFirst ? startOffset : 0;
  const end = isLast ? endOffset : textLength;

  if (start === 0 && end === 0) return;

  const splitNodes = node.splitText(start, end);

  if (splitNodes.length === 1) return splitNodes[0];

  return splitNodes.length === 3 || end === textLength ? splitNodes[1] : splitNodes[0];
}

function $wrapNode(node: LexicalNode, wrapper: LexicalNode): void {
  if ($isTextNode(wrapper)) {
    const text = $moveLeadingSpaceToPreviousNode(node, wrapper);
    wrapper.setTextContent(text);
    node.remove();
  } else if ($isElementNode(wrapper)) {
    const wrapperChildrenCount = wrapper.getChildrenSize();
    wrapper.append(node);
    for (let i = 0; i < wrapperChildrenCount; i++) wrapper.getFirstChild()?.remove();
    $moveLeadingSpaceToPreviousNode(node, wrapper);
  }
}

function $moveLeadingSpaceToPreviousNode(node: LexicalNode, wrapper: LexicalNode): string {
  let text = node.getTextContent();
  if ($isTextNode(node) && wrapper.isInline() && text.startsWith(" ")) {
    text = text.trimStart();
    node.setTextContent(text);
    const previousNode = wrapper.getPreviousSibling();
    $addTrailingSpace(previousNode);
    if (!$isTextNode(previousNode)) wrapper.insertBefore($createTextNode(" "));
  }
  return text;
}

// #endregion

/**
 * Remove a character marker from the given selection, keeping all of its text content.
 *
 * A collapsed selection removes the marker from the entire enclosing `CharNode`. Selections
 * inside a `NoteNode` are skipped (see `$getCharNodeToRemove`). A range selection that only
 * partially covers a `CharNode` — or spans a `CharNode` and its neighbors — is narrowed first by
 * `$splitCharNodeAroundTargets`, so uncovered text keeps its marker. Where that narrowing is
 * impossible — a selection covering only part of a *nested* `CharNode`, which cannot be split at
 * the selection boundary here — the marker is left in place rather than removed from the whole
 * nested span; see `$splitCharNodeAroundTargets`'s docstring.
 *
 * @param selection - The current range selection.
 * @param marker - The character marker to remove, or `undefined` for the innermost one.
 * @param viewOptions - View options, used to strip synthesized marker content.
 * @returns `true` if a marker was removed, `false` if the request was a no-op.
 */
export function $removeCharacterMarkerAtSelection(
  selection: RangeSelection,
  marker: string | undefined,
  viewOptions: ViewOptions | undefined,
): boolean {
  if (selection.isCollapsed()) {
    const anchorNode = selection.anchor.getNode();
    const anchorOffset = selection.anchor.offset;
    const charNode = $getCharNodeToRemove(anchorNode, marker);
    if (!charNode) return false;
    const originalSize = $isTextNode(anchorNode) ? anchorNode.getTextContentSize() : 0;
    $removeCharNodeKeepingContent(charNode, viewOptions);

    // Mirror the range branch's restore below: `$removeCharNodeKeepingContent`'s NBSP trim
    // (`markerMode: "editable"`) calls `TextNode.setTextContent`, which never touches selection
    // points, and `$unwrapNode`'s underlying `replace()` call clones the active selection without
    // adjusting them either. Without this, a collapsed caret inside NBSP-prefixed content ends up
    // one character right of where it belongs — out of range entirely when the caret was at the
    // text's end. Skipped when the anchor node itself didn't survive: that happens only when its
    // enclosing CharNode held nothing but the empty-char placeholder and was removed outright
    // rather than unwrapped (see `$removeCharNodeKeepingContent`), in which case `.remove()`'s own
    // `restoreSelection` already redirects the point correctly.
    if ($isTextNode(anchorNode) && anchorNode.isAttached()) {
      const newSize = anchorNode.getTextContentSize();
      const trimmedLength = Math.max(originalSize - newSize, 0);
      const newOffset = Math.max(0, Math.min(anchorOffset - trimmedLength, newSize));
      const currentSelection = $getSelection();
      if ($isRangeSelection(currentSelection))
        currentSelection.setTextNodeRange(anchorNode, newOffset, anchorNode, newOffset);
    }
    return true;
  }

  const nodes = selection.getNodes();
  const isBackward = selection.isBackward();
  const [startOffset, endOffset] = getSelectionOffsets(selection);
  // Check there is something removable before the loop below starts splitting text nodes, so a
  // request that ends up a no-op mutates nothing at all. See `$hasRemovableCharNode`.
  if (!$hasRemovableCharNode(nodes, marker, startOffset, endOffset)) return false;

  const targetNodes: TextNode[] = [];
  nodes.forEach((node, index) => {
    const targetNode = $getTargetNode(
      node,
      index === 0,
      index === nodes.length - 1,
      startOffset,
      endOffset,
    );
    if ($isTextNode(targetNode)) targetNodes.push(targetNode);
  });
  if (targetNodes.length === 0) return false;

  // Belt-and-braces: no current path resolves two targetNodes to the same CharNode key, since
  // `$splitCharNodeAroundTargets` reads the whole `targetNodes` array and unwrapping detaches the
  // rest. Kept in case a future change reintroduces one.
  const handledCharNodeKeys = new Set<string>();
  let didRemove = false;
  targetNodes.forEach((targetNode) => {
    const charNode = $getCharNodeToRemove(targetNode, marker);
    if (!charNode || handledCharNodeKeys.has(charNode.getKey())) return;
    handledCharNodeKeys.add(charNode.getKey());
    // `undefined` means removal would have to affect unselected text — see
    // `$splitCharNodeAroundTargets`. Leave this CharNode alone rather than over-remove.
    // `$hasRemovableCharNode` above has already established that at least one CharNode in the
    // selection is *not* refused, so this cannot be the only outcome for the whole call.
    const coveredCharNode = $splitCharNodeAroundTargets(charNode, targetNodes);
    if (coveredCharNode) {
      $removeCharNodeKeepingContent(coveredCharNode, viewOptions);
      didRemove = true;
    }
  });

  // Restore the range over the same characters so a toolbar caller can re-toggle without
  // re-selecting: each target covers exactly the selected portion, so the range runs from the
  // whole first target to the whole last. Three traps make this more than a no-op:
  //
  // - `TextNode.setTextContent` (the NBSP trim under `markerMode: "editable"`) mutates `__text`
  //   without touching selection points, so a focus on a trimmed node ends up one past the new end.
  // - `isBackward` is captured before the loop: a backward range's anchor is the *last* target, so
  //   swapping the roles keeps it backward instead of normalizing to forward.
  // - `$getSelection()` is re-fetched rather than reusing `selection`: `$unwrapNode` splices the
  //   CharNode out with `NodeCaret.splice`, which calls `replace()` on it (Lexical 0.43.0,
  //   `NodeCaret.splice` → `target.replace(node)`), and `LexicalNode.replace` clones the active
  //   selection and `$setSelection`s the clone. So the parameter is left pointing at a detached
  //   object and mutating it would have no effect. Note this is the CharNode's own
  //   `ElementNode.replace()`, not `TextNode.replace()`.
  //
  // Skipped when a target didn't survive — its CharNode held only the empty-char placeholder and
  // was removed outright — in which case Lexical's own selection repair applies instead.
  const currentSelection = $getSelection();
  const firstTargetNode = targetNodes[0];
  const lastTargetNode = targetNodes[targetNodes.length - 1];
  if (
    $isRangeSelection(currentSelection) &&
    firstTargetNode.isAttached() &&
    lastTargetNode.isAttached()
  ) {
    const lastOffset = lastTargetNode.getTextContentSize();
    if (isBackward)
      currentSelection.setTextNodeRange(lastTargetNode, lastOffset, firstTargetNode, 0);
    else currentSelection.setTextNodeRange(firstTargetNode, 0, lastTargetNode, lastOffset);
  }

  return didRemove;
}

// #region Helper functions for $removeCharacterMarkerAtSelection

/**
 * Find the `CharNode` a removal should act on, walking up from a target node.
 *
 * Returns `undefined` when nothing matches, which the caller treats as a no-op for that target
 * node. The walk is per-target, so a selection spanning a matching and a non-matching node still
 * acts on the matching one. A `CharNode` nested inside a `NoteNode` is skipped: `$getTargetNode`
 * only recognizes note interiors one level deep (a leaf whose *immediate* parent is the
 * `NoteNode`), so a marker `CharNode` nested deeper inside a note — the common case — would
 * otherwise still be found and removed by this walk.
 *
 * @param node - The node to walk up from.
 * @param marker - The marker to match, or `undefined` to take the innermost `CharNode`.
 * @returns the `CharNode` to remove, or `undefined` if there isn't one.
 */
function $getCharNodeToRemove(node: LexicalNode, marker: string | undefined): CharNode | undefined {
  let currentNode: LexicalNode | null = node;
  let matchedCharNode: CharNode | undefined;
  while (currentNode && !$isSomeParaNode(currentNode)) {
    if ($isNoteNode(currentNode)) return undefined;
    // Walking upwards, the first CharNode found is the innermost one. Keep walking past it (up
    // to the enclosing para) so a NoteNode further up still causes a skip.
    if (
      !matchedCharNode &&
      $isCharNode(currentNode) &&
      (marker === undefined || currentNode.getMarker() === marker)
    )
      matchedCharNode = currentNode;
    currentNode = currentNode.getParent();
  }
  return matchedCharNode;
}

/**
 * The selection's nodes that a marker action can actually act on.
 *
 * Deliberately no narrower than `$getTargetNode`: it shares the skip rule via
 * `$isSkippedByMarkerAction` and does not replicate `handleTextNode`'s zero-width filter. So the
 * read-only pre-pass built on it can only ever be more permissive, never wrongly refuse a removal
 * that would have happened.
 *
 * @param nodes - The nodes in the selection.
 * @returns the subset of `nodes` a marker action can act on.
 */
function $getActionableNodes(nodes: LexicalNode[]): LexicalNode[] {
  return nodes.filter(
    (node) =>
      !$isSkippedByMarkerAction(node) &&
      ($isTextNode(node) || ($isElementNode(node) && node.isInline())),
  );
}

/**
 * Keys of the selection's text nodes that the selection covers *in full*, computed before the
 * splitting pass.
 *
 * A boundary node the selection covers only partially is deliberately excluded. `handleTextNode`
 * would split such a node, and only the covered piece becomes a target — so the uncovered piece
 * remains inside whatever element held it, and any nested-coverage question about that element must
 * answer "not fully covered". Treating the whole pre-split node as uncovered here makes this set
 * agree with the post-split `targetNodes` set that `$splitCharNodeAroundTargets` sees.
 *
 * @param nodes - The nodes in the selection.
 * @param startOffset - The selection's start offset within the first node.
 * @param endOffset - The selection's end offset within the last node.
 * @returns keys of the fully covered text nodes.
 */
function $getFullyCoveredTextKeys(
  nodes: LexicalNode[],
  startOffset: number,
  endOffset: number,
): Set<string> {
  const keys = new Set<string>();
  nodes.forEach((node, index) => {
    if (!$isTextNode(node) || $isSkippedByMarkerAction(node)) return;
    const size = node.getTextContentSize();
    const start = index === 0 ? startOffset : 0;
    const end = index === nodes.length - 1 ? endOffset : size;
    if (start === 0 && end === size) keys.add(node.getKey());
  });
  return keys;
}

/**
 * Whether `$splitCharNodeAroundTargets` would refuse this `CharNode`, decided read-only.
 *
 * Mirrors that function's nested-partial-coverage refusal (see its docstring) without mutating
 * anything: a nested element child that holds part of the selection but is not covered in full
 * cannot be split at the selection boundary, so the marker must be left in place.
 *
 * Answerable before the split because splitting never changes a node's ancestry — the pieces keep
 * the same parent — and `$getFullyCoveredTextKeys` already accounts for the uncovered pieces the
 * split will create.
 *
 * @param charNode - The `CharNode` a removal would act on.
 * @param actionableNodes - The selection's actionable nodes.
 * @param fullyCoveredKeys - Keys of the text nodes the selection covers in full.
 * @returns `true` if this `CharNode` would be refused.
 */
function $isRefusedForNestedCoverage(
  charNode: CharNode,
  actionableNodes: LexicalNode[],
  fullyCoveredKeys: Set<string>,
): boolean {
  return charNode
    .getChildren()
    .some(
      (child) =>
        $isElementNode(child) &&
        actionableNodes.some((node) => child.isParentOf(node)) &&
        !$isFullyCoveredByTargets(child, fullyCoveredKeys),
    );
}

/**
 * Whether the selection contains a `CharNode` matching `marker` that removal would actually strip.
 *
 * Read-only, and answered *before* the splitting pass, so that a request which ends up a no-op
 * leaves the document completely untouched: `handleTextNode`'s `splitText` mutates the tree, and
 * running it first would give a documented no-op a spurious undo entry (and possibly an empty
 * collab delta), and would then let the restore block overwrite the caller's selection.
 *
 * Both no-op paths are screened here — no matching `CharNode` at all, and a matching one that
 * `$splitCharNodeAroundTargets` would refuse for nested partial coverage.
 *
 * Residual, deliberately not fixed here: when a selection spans two matching `CharNode`s and only
 * one of them is refused, this returns `true` (correctly — a removal does happen), so the split
 * pass still runs and briefly dirties the refused node's text too. Lexical re-merges it, so the
 * tree is unchanged, but the undo entry covers both. Avoiding that needs the split loop to skip
 * refused nodes, which its index-based offset math can't express without a wider rework.
 *
 * @param nodes - The nodes in the selection.
 * @param marker - The character marker to remove, or `undefined` for the innermost one.
 * @param startOffset - The selection's start offset within the first node.
 * @param endOffset - The selection's end offset within the last node.
 * @returns `true` if there is a matching `CharNode` that would be removed.
 */
function $hasRemovableCharNode(
  nodes: LexicalNode[],
  marker: string | undefined,
  startOffset: number,
  endOffset: number,
): boolean {
  const actionableNodes = $getActionableNodes(nodes);
  const fullyCoveredKeys = $getFullyCoveredTextKeys(nodes, startOffset, endOffset);
  const seenCharNodeKeys = new Set<string>();
  return actionableNodes.some((node) => {
    const charNode = $getCharNodeToRemove(node, marker);
    if (!charNode || seenCharNodeKeys.has(charNode.getKey())) return false;
    seenCharNodeKeys.add(charNode.getKey());
    return !$isRefusedForNestedCoverage(charNode, actionableNodes, fullyCoveredKeys);
  });
}

/**
 * Whether every character inside `element` is covered by the selection.
 *
 * Synthesized marker children don't count against coverage: they carry no user content and
 * `$removeCharNodeKeepingContent` strips them unconditionally.
 *
 * That exemption is only reached under `markerMode: "editable"`, where markers are `MarkerNode`s —
 * real `TextNode`s, so `getAllTextNodes()` returns them and they would otherwise fail the coverage
 * check. Under `markerMode: "visible"` markers are `ImmutableTypedTextNode`s, which extend
 * `DecoratorNode` rather than `TextNode`, so `getAllTextNodes()` never returns them and they cannot
 * count against coverage in the first place. Both modes end up with the same answer by different
 * routes; the `$isSynthesizedMarkerNode` clause is what makes the editable one agree.
 *
 * @param element - The element to check, typically a nested `CharNode`.
 * @param targetKeys - Keys of the text nodes the selection covers.
 * @returns `true` if the selection covers all of the element's content.
 */
function $isFullyCoveredByTargets(element: ElementNode, targetKeys: Set<string>): boolean {
  return element
    .getAllTextNodes()
    .every((textNode) => targetKeys.has(textNode.getKey()) || $isSynthesizedMarkerNode(textNode));
}

/**
 * Narrow a `CharNode` to just the children the selection covers, moving the uncovered leading and
 * trailing children into sibling `CharNode`s that keep the marker.
 *
 * Needed because `handleTextNode` splits the *text* node, leaving all the pieces inside the same
 * `CharNode` — so unwrapping it would strip the marker from the uncovered text too.
 *
 * A child counts as covered either directly (it is one of `targetNodes`) or transitively (it is an
 * element, such as a nested `CharNode`, that contains one of `targetNodes`) — so a partially
 * covered outer marker around an inner marked span still narrows correctly instead of being
 * mistaken for having no covered children at all.
 *
 * Marker-mode handling — boundary case only: under `markerMode: "visible"` / `"editable"`, a
 * `CharNode`'s opening marker child sits at index 0 and its closing marker child sits last. When
 * the covered range already touches that boundary (nothing real and unselected sits between the
 * marker and the covered content on that side), folding the adjacent marker into the covered range
 * before splitting avoids stranding it alone in a leading or trailing clone. This is safe *for the
 * folded side*: `$removeCharNodeKeepingContent` strips a marker unconditionally regardless of which
 * clone it ends up in, so folding it into the covered side changes nothing about its fate — it only
 * prevents a stray marker-only sibling `CharNode` from surviving when the real content is fully
 * covered.
 *
 * Known limitation — interior partial coverage under marker mode: the fold above only reaches a
 * marker immediately adjacent to the covered range. When real, unselected text sits between the
 * marker and the covered range — e.g. children `[openMarker, leadingText, targetText,
 * trailingText, closeMarker]` with only `targetText` covered — neither boundary marker is adjacent
 * to `coveredIndexes`, so neither folds. The split then produces a leading clone
 * `[openMarker, leadingText]` and a trailing clone `[trailingText, closeMarker]`, each carrying an
 * unpaired marker node that is never stripped, because only the returned (covered) node is passed
 * to `$removeCharNodeKeepingContent`. A literal `\nd` / `\nd*` survives in the document in that
 * shape. Fixing this correctly requires each surviving clone to be given its own regenerated
 * opening *and* closing marker children — adaptor-level work beyond this function's scope — so it
 * is left as a documented limitation rather than attempted here.
 *
 * Refuses — partial coverage of a nested CharNode: transitive coverage (above) only decides whether
 * a nested element child counts as covered at *this* level; it cannot split that child at the
 * selection boundary. So when the selection covers only part of a nested `CharNode`'s text, there
 * is no shape this function can produce that removes the marker from the selection alone. Rather
 * than remove it from the whole nested span — silently changing the USJ of text the user never
 * selected — this returns `undefined` so the caller leaves this `CharNode` alone. For example,
 * selecting only part of a divine-name word (`\nd`) inside red-letter text (`\wj`) and removing
 * `\wj` does nothing, rather than dropping `\wj` from the rest of that divine-name word too.
 *
 * `$hasRemovableCharNode` predicts this same refusal read-only, so a request that would be refused
 * outright never reaches the splitting pass and leaves the document — and the caller's selection —
 * completely untouched.
 *
 * This is deliberately narrow: it is the *partially* covered nested case only. Removing either the
 * inner or the outer marker of a fully covered nested pair works, and is the case the feature's UI
 * actually reaches. Doing it properly needs recursive splitting of the nested `CharNode` itself,
 * which is out of scope here — refusing keeps that a strictly additive change later, whereas
 * shipping the whole-span removal would make the eventual fix a behavior change.
 *
 * @param charNode - The `CharNode` the selection touches.
 * @param targetNodes - The text nodes the selection covers.
 * @returns the `CharNode` that now covers only the selection — unchanged when coverage is total —
 *   or `undefined` when the marker cannot be removed without also affecting unselected text.
 */
function $splitCharNodeAroundTargets(
  charNode: CharNode,
  targetNodes: TextNode[],
): CharNode | undefined {
  const targetKeys = new Set(targetNodes.map((targetNode) => targetNode.getKey()));
  const children = charNode.getChildren();
  const coveredIndexes: number[] = [];
  for (const [index, child] of children.entries()) {
    if (targetKeys.has(child.getKey())) {
      coveredIndexes.push(index);
    } else if ($isElementNode(child) && targetNodes.some((target) => child.isParentOf(target))) {
      // Refusing here mutates nothing *in this function*, but the caller has already run
      // `handleTextNode`'s `splitText` to build `targetNodes`. So this alone is not enough to keep
      // a refused request off the undo stack — `$hasRemovableCharNode` screens the whole-call case
      // read-only, before any splitting. See its docstring for the residual mixed-selection case.
      if (!$isFullyCoveredByTargets(child, targetKeys)) return undefined;
      coveredIndexes.push(index);
    }
  }
  // Unreachable today: the caller only gets here via a target inside `charNode`, which yields at
  // least one covered index. Refusing rather than returning `charNode` keeps this function's
  // "refuse rather than over-remove" contract the default if a future caller does reach it —
  // returning `charNode` would strip the marker from content nothing established as covered.
  if (coveredIndexes.length === 0) return undefined;

  let firstCoveredIndex = coveredIndexes[0];
  let lastCoveredIndex = coveredIndexes[coveredIndexes.length - 1];
  // Fold an adjacent boundary marker into the covered range so it isn't left stranded alone in a
  // clone — see the marker-mode handling note above.
  if (firstCoveredIndex > 0 && $isSynthesizedMarkerNode(children[firstCoveredIndex - 1]))
    firstCoveredIndex -= 1;
  if (
    lastCoveredIndex < children.length - 1 &&
    $isSynthesizedMarkerNode(children[lastCoveredIndex + 1])
  )
    lastCoveredIndex += 1;
  if (firstCoveredIndex === 0 && lastCoveredIndex === children.length - 1) return charNode;

  // Append moves the children out of `charNode`, so it is left holding only the covered ones.
  const trailingChildren = children.slice(lastCoveredIndex + 1);
  if (trailingChildren.length > 0)
    charNode.insertAfter($createCharNodeLike(charNode).append(...trailingChildren));
  const leadingChildren = children.slice(0, firstCoveredIndex);
  if (leadingChildren.length > 0)
    charNode.insertBefore($createCharNodeLike(charNode).append(...leadingChildren));

  return charNode;
}

/**
 * Create an empty `CharNode` carrying the same identity as `charNode`.
 *
 * `$copyNode` gives a childless copy with a fresh key: `CharNode.clone` carries the marker and
 * unknown attributes, `ElementNode.afterCloneFrom` carries indent, format, style, direction and
 * both text-style members, and `LexicalNode.afterCloneFrom` carries node state — including
 * `charIdState`, which `resetOnCopyNode` leaves alone because that config doesn't opt into being
 * reset. The cid matters: without it `$charNodeTransform`'s `$hasSameCharAttributes` check would
 * refuse to re-merge the halves later.
 *
 * The children copy in `afterCloneFrom` is gated on the keys matching, and `$copyNode` assigns a
 * fresh key before calling it, so the copy is genuinely empty. `$copyNode` also skips
 * `$applyNodeReplacement`, which is irrelevant here — no `CharNode` replacement is registered.
 *
 * Don't hand-roll this: `CharNode.insertNewAfter` (CharNode.ts:254) and `ParaNode.insertNewAfter`
 * (ParaNode.ts:286) model a manual copy, but both pair `setStyle` with `getTextStyle()` — a
 * different member (`__textStyle`, the default inline style for children) than `setStyle` writes
 * (`__style`) — so their style copies are silently inert.
 *
 * @param charNode - The `CharNode` to copy identity from.
 * @returns a new empty `CharNode` with the same identity.
 */
function $createCharNodeLike(charNode: CharNode): CharNode {
  return $copyNode(charNode);
}

/**
 * Remove a `CharNode` but keep its text content in the parent.
 *
 * Synthesized marker children (`markerMode: "editable"` / `"visible"`) are stripped first so no
 * literal `\nd` / `\nd*` text is left behind, and in `"editable"` mode the NBSP that
 * `usj-editor.adaptor.ts` prepends to each text child for rendering is trimmed. A `CharNode`
 * holding nothing but the empty-char placeholder is removed outright rather than unwrapped.
 *
 * @param charNode - The `CharNode` to remove.
 * @param viewOptions - View options, used to decide what counts as synthesized content.
 */
function $removeCharNodeKeepingContent(
  charNode: CharNode,
  viewOptions: ViewOptions | undefined,
): void {
  charNode.getChildren().forEach((child) => {
    if ($isSynthesizedMarkerNode(child)) child.remove();
  });

  // Checked before the NBSP trim below: the placeholder IS an NBSP, and the adaptor does not
  // prepend a second one to it.
  const remainingChildren = charNode.getChildren();
  if (remainingChildren.length === 0 || charNode.getTextContent() === EMPTY_CHAR_PLACEHOLDER_TEXT) {
    charNode.remove();
    return;
  }

  if (viewOptions?.markerMode === "editable")
    remainingChildren.forEach((child) => {
      const text = child.getTextContent();
      if ($isTextNode(child) && text.startsWith(NBSP))
        child.setTextContent(text.slice(NBSP.length));
    });

  $unwrapNode(charNode);
}

// #endregion

/**
 * Moves the leading space of a node following a verse node to the previous node.
 *
 * This function checks if the previous node ends in a space and adds one if needed. It then checks
 * if the following node starts with a space and removes it.
 *
 * @param node - The node to check for leading space.
 */
function $moveVerseFollowingSpaceToPreviousNode(node: LexicalNode) {
  if (!$isSomeVerseNode(node)) return;

  $addTrailingSpace(node.getPreviousSibling());
  $removeLeadingSpace(node.getNextSibling());
}
