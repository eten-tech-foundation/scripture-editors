import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $unwrapNode } from "@lexical/utils";
import {
  $createTextNode,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  EditorUpdateOptions,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createNodeFromSerializedNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  charIdState,
  CharNode,
  createLexicalUsjNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getNextVerse,
  LoggerBasic,
  MarkerAction,
  NBSP,
  NoteNode,
  ParaNode,
  ScriptureReference,
} from "shared";
import {
  $addTrailingSpace,
  $insertNote,
  $isSomeVerseNode,
  $removeLeadingSpace,
  getDefaultViewOptions,
  UsjNodeOptions,
  ViewOptions,
} from "shared-react";
import usjEditorAdaptor from "./usj-editor.adaptor";

interface UsjMarkerAction {
  label?: string;
  action: (currentEditor: {
    editor: LexicalEditor;
    reference: ScriptureReference;
    autoNumbering?: boolean;
    newVerseRChapterNum?: number;
    noteText?: string;
  }) => MarkerContent[];
}

const markerActions: { [marker: string]: UsjMarkerAction } = {
  c: {
    action: (currentEditor) => {
      const { chapterNum } = currentEditor.reference;
      const nextChapter = chapterNum + 1;
      const content: MarkerContent = {
        type: "chapter",
        marker: "c",
        number: `${nextChapter}`,
      };
      return [content];
    },
  },
  v: {
    action: (currentEditor) => {
      const { verseNum, verse } = currentEditor.reference;
      const nextVerse = getNextVerse(verseNum, verse);
      const content: MarkerContent = {
        type: "verse",
        marker: "v",
        number: `${nextVerse}`,
      };
      return [content];
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
      const content = markerAction.action(currentEditor);

      const serializedLexicalNode = createLexicalUsjNode(content, usjEditorAdaptor, viewOptions);
      const nodeToInsert = $createNodeFromSerializedNode(serializedLexicalNode);

      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
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
          $isNoteNode(node.getParent()) &&
          selection.isCollapsed()
        ) {
          // Inserting into NoteNode
          let lastInsertedNode: LexicalNode = node.insertAfter(nodeToInsert);
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
          lastInsertedNode.insertAfter($createTextNode(NBSP));
        } else {
          selection.insertNodes([nodeToInsert]);
          $moveVerseFollowingSpaceToPreviousNode(nodeToInsert);
          const nextNode = nodeToInsert.getNextSibling();
          if (nextNode) nextNode.selectStart();
          else nodeToInsert.selectStart();
        }
      } else {
        // Insert the node directly
        selection?.insertNodes([nodeToInsert]);
      }
    }, editorUpdateOptions);
  };
  return { action, label: markerAction?.label };
}

function getMarkerAction(marker: string): UsjMarkerAction | undefined {
  let markerAction = markerActions[marker];
  if (!markerAction) {
    if (ParaNode.isValidMarker(marker)) {
      markerAction = {
        action: () => {
          const content: MarkerContent = { type: ParaNode.getType(), marker, content: [] };
          return [content];
        },
      };
    } else if (CharNode.isValidMarker(marker)) {
      markerAction = {
        action: () => {
          const content: MarkerContent = { type: CharNode.getType(), marker };
          return [content];
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

function $getTargetNode(
  node: LexicalNode,
  isFirst: boolean,
  isLast: boolean,
  startOffset: number,
  endOffset: number,
): LexicalNode | undefined {
  // Skip mark nodes and note nodes
  if ($isTypedMarkNode(node) || $isNoteNode(node) || $isNoteNode(node.getParent())) {
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

/**
 * Remove a character marker from the given selection, keeping all of its text content.
 *
 * A collapsed selection removes the marker from the entire enclosing `CharNode`. Selections
 * inside a `NoteNode` are skipped (see `$getCharNodeToRemove`). A range selection that only
 * partially covers a `CharNode` — or spans a `CharNode` and its neighbors — is narrowed first by
 * `$splitCharNodeAroundTargets`, so uncovered text *at that CharNode's own level* keeps its
 * marker. This is not an unconditional guarantee: see `$splitCharNodeAroundTargets`'s docstring
 * for the nested-CharNode case where uncovered text one level deeper still loses the marker.
 *
 * @param selection - The current range selection.
 * @param marker - The character marker to remove, or `undefined` for the innermost one.
 * @param viewOptions - View options, used to strip synthesized marker content.
 */
export function $removeCharMarkerAtSelection(
  selection: RangeSelection,
  marker: string | undefined,
  viewOptions: ViewOptions | undefined,
): void {
  if (selection.isCollapsed()) {
    const anchorNode = selection.anchor.getNode();
    const anchorOffset = selection.anchor.offset;
    const charNode = $getCharNodeToRemove(anchorNode, marker);
    if (!charNode) return;
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
    return;
  }

  const nodes = selection.getNodes();
  const isBackward = selection.isBackward();
  const [startOffset, endOffset] = getSelectionOffsets(selection);
  const targetNodes: TextNode[] = [];
  // Known, harmless: this splits every selected text node via `handleTextNode`'s `splitText`
  // whether or not any of them turn out to sit inside a matching `CharNode` below. A no-match
  // request still leaves the document split at the selection boundaries — content-preserving, but
  // an avoidable no-op mutation (a spurious undo entry, and possibly an empty collab delta).
  // Resolving the matching `CharNode` set before this loop would avoid it.
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
  if (targetNodes.length === 0) return;

  // No reachable path currently resolves two targetNodes to the same CharNode key.
  // $splitCharNodeAroundTargets consults the full targetNodes array,
  // so the first targetNode belonging to a given CharNode already causes every other targetNode
  // sharing it to be carved into (or left in) that same node before this loop reaches them. When
  // $removeCharNodeKeepingContent unwraps that CharNode, later targetNodes resolve to undefined
  // (their former parent is gone). When it removes the CharNode outright instead — which only
  // happens when the CharNode is empty or holds nothing but the single-character
  // EMPTY_CHAR_PLACEHOLDER_TEXT — a later targetNode walking up from a still-attached child WOULD
  // resolve to the same key (`.remove()` leaves `__parent` pointers and the node in the nodeMap for
  // the rest of the update), but that branch can't contain two distinct target text nodes to begin
  // with, so it never has a "later targetNode" to reach. Kept as a guard in case a future change
  // reintroduces a path where two targetNodes still resolve to the same charNode.getKey().
  const handledCharNodeKeys = new Set<string>();
  targetNodes.forEach((targetNode) => {
    const charNode = $getCharNodeToRemove(targetNode, marker);
    if (!charNode || handledCharNodeKeys.has(charNode.getKey())) return;
    handledCharNodeKeys.add(charNode.getKey());
    const coveredCharNode = $splitCharNodeAroundTargets(charNode, targetNodes);
    $removeCharNodeKeepingContent(coveredCharNode, viewOptions);
  });

  // Restore the range over the same characters so a toolbar caller can re-toggle without
  // re-selecting. `handleTextNode` split each target to cover exactly the selected portion, so the
  // range is the whole of the first target through the whole of the last. This is not always a
  // no-op: `TextNode.splitText` (used by `handleTextNode` above, via `$getTargetNode`) transfers
  // anchor/focus onto the right split piece on its own, but `TextNode.setTextContent` — used by
  // `$removeCharNodeKeepingContent`'s NBSP trim under `markerMode: "editable"` — only mutates
  // `__text` and does not touch selection points at all. When the trim runs on a node the focus
  // still points at (e.g. selecting a whole `CharNode`'s content, so no split happens), the
  // pre-trim offset ends up one character past the new end without this restore. Skipped when a
  // target node itself didn't survive — this happens when its enclosing CharNode held nothing but
  // the empty-char placeholder and was removed outright rather than unwrapped (see
  // $removeCharNodeKeepingContent) — in which case Lexical's own selection repair applies instead.
  // Preserves the original direction: `isBackward` was captured above, before the removal loop,
  // since a backward range's anchor is the *last* target and its focus is the *first* — swapping
  // which end gets which role keeps a backward selection backward instead of always normalizing
  // to forward.
  //
  // Re-fetch the selection instead of reusing the `selection` parameter: `$unwrapNode` (used by
  // `$removeCharNodeKeepingContent`) unwraps via `CharNode.replace()`, and `TextNode.replace()`
  // unconditionally clones the active selection and calls `$setSelection` on the clone partway
  // through — even when neither point needs adjusting. That silently swaps the *active* selection
  // for a new object, leaving the `selection` parameter pointing at a now-stale, detached one.
  // Mutating the stale object here would have no effect on what the later merge actually reads.
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
}

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
 * True for either flavor of synthesized marker child a `CharNode` can hold under
 * `markerMode: "editable"` (`MarkerNode`) or `"visible"` (an `ImmutableTypedTextNode` with
 * `textType: "marker"`). Not `$isParaMarkerPrefix` from `shared` — same predicate, but that name
 * describes a paragraph's leading marker, which would mislead here.
 *
 * @param node - The node to check.
 * @returns `true` if the node is a synthesized marker child.
 */
function $isSynthesizedMarkerNode(node: LexicalNode | null | undefined): boolean {
  return $isMarkerNode(node) || $isVisibleMarkerNode(node);
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
 * Known limitation — partial coverage of a nested CharNode: transitive coverage (above) only
 * decides whether a nested element child counts as covered at *this* level; it cannot split that
 * child at the selection boundary. So when the selection covers only part of a nested CharNode's
 * text, the whole nested child is treated as covered and left untouched, and the outer marker is
 * still removed from all of it — including the unselected remainder inside it. For example,
 * selecting only part of a divine-name word (`\nd`) inside red-letter text (`\wj`) and removing
 * `\wj` will correctly preserve `\wj` on any plain-text siblings of the `\nd` span, but will still
 * silently drop `\wj` from the rest of that divine-name word, not just the selected part. Fixing
 * this needs recursive splitting of the nested CharNode itself, which this function does not do.
 *
 * @param charNode - The `CharNode` the selection touches.
 * @param targetNodes - The text nodes the selection covers.
 * @returns the `CharNode` that now covers only the selection. Unchanged when coverage is total.
 */
function $splitCharNodeAroundTargets(charNode: CharNode, targetNodes: TextNode[]): CharNode {
  const targetKeys = new Set(targetNodes.map((targetNode) => targetNode.getKey()));
  const children = charNode.getChildren();
  const coveredIndexes = children
    .map((child, index) =>
      targetKeys.has(child.getKey()) ||
      ($isElementNode(child) && targetNodes.some((targetNode) => child.isParentOf(targetNode)))
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  if (coveredIndexes.length === 0) return charNode;

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
 * Copies marker, unknown attributes, direction, format, and style — modeled on
 * `CharNode.insertNewAfter`'s copy, but pairing `setStyle` with `getStyle` rather than
 * `getTextStyle` (see the note below) so the style copy actually takes effect. Additionally
 * copies `charIdState` — without the cid, `$charNodeTransform`'s `$hasSameCharAttributes` check
 * would refuse to re-merge the halves later.
 *
 * @param charNode - The `CharNode` to copy identity from.
 * @returns a new empty `CharNode` with the same identity.
 */
function $createCharNodeLike(charNode: CharNode): CharNode {
  const newCharNode = $createCharNode(charNode.getMarker(), charNode.getUnknownAttributes());
  newCharNode.setDirection(charNode.getDirection());
  newCharNode.setFormat(charNode.getFormatType());
  // Note: `getStyle()`/`setStyle()` are the matching pair for an ElementNode's own CSS style
  // string (`__style`); `getTextStyle()` reads a different member (`__textStyle`, the default
  // inline style for children) entirely. Note `CharNode.insertNewAfter` (CharNode.ts:254) and
  // `ParaNode.insertNewAfter` (ParaNode.ts:286) both pair `setStyle` with `getTextStyle`, so their
  // style copies are inert; don't copy that pairing from them.
  newCharNode.setStyle(charNode.getStyle());
  $setState(newCharNode, charIdState, () => $getState(charNode, charIdState));
  return newCharNode;
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
