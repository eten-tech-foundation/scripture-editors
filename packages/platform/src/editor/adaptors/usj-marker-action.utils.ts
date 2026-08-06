import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { $unwrapNode } from "@lexical/utils";
import {
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  EditorUpdateOptions,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $createNodeFromSerializedNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
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
 * A collapsed selection removes the marker from the entire enclosing `CharNode`. A range
 * selection that only partially covers a `CharNode` splits it first, so the uncovered text keeps
 * its marker. Selections inside a `NoteNode` are skipped (see `$getCharNodeToRemove`).
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
    const charNode = $getCharNodeToRemove(selection.anchor.getNode(), marker);
    if (charNode) $removeCharNodeKeepingContent(charNode, viewOptions);
    return;
  }

  const nodes = selection.getNodes();
  const [startOffset, endOffset] = getSelectionOffsets(selection);
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
  if (targetNodes.length === 0) return;

  const handledCharNodeKeys = new Set<string>();
  targetNodes.forEach((targetNode) => {
    const charNode = $getCharNodeToRemove(targetNode, marker);
    if (!charNode || handledCharNodeKeys.has(charNode.getKey())) return;
    handledCharNodeKeys.add(charNode.getKey());
    $removeCharNodeKeepingContent(charNode, viewOptions);
  });
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
    if ($isMarkerNode(child) || $isVisibleMarkerNode(child)) child.remove();
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
