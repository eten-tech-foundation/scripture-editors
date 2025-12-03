import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
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
  $isMarkerNode,
  $isNoteNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  CharNode,
  createLexicalUsjNode,
  GENERATOR_NOTE_CALLER,
  getNextVerse,
  HIDDEN_NOTE_CALLER,
  Marker,
  MarkerAction,
  NBSP,
  NoteNode,
  ParaNode,
  ScriptureReference,
} from "shared";
import {
  $addTrailingSpace,
  $insertNoteWithSelect,
  $isSomeVerseNode,
  $removeLeadingSpace,
  getDefaultViewOptions,
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

// Keep this function updated with logic from
// `libs/shared-react/src/nodes/usj/node-react.utils.ts` > `$createNoteChildren`
const getFootnoteMarkerAction: (footnoteMarker: string) => UsjMarkerAction = (footnoteMarker) => {
  if (!NoteNode.isValidMarker(footnoteMarker) || !footnoteMarker.includes("f"))
    throw new Error(`Invalid footnote marker '${footnoteMarker}'`);

  return {
    action: (currentEditor) => {
      const { chapterNum, verseNum } = currentEditor.reference;
      const noteChildren: MarkerObject[] = [];
      if (chapterNum !== undefined && verseNum !== undefined)
        noteChildren.push({
          type: "char",
          marker: "fr",
          content: [`${chapterNum}:${verseNum} `],
        });
      if (currentEditor.noteText)
        noteChildren.push({
          type: "char",
          marker: "fq",
          content: [currentEditor.noteText],
        });
      noteChildren.push({ type: "char", marker: "ft" });
      const content: MarkerContent = {
        type: "note",
        marker: footnoteMarker,
        caller: GENERATOR_NOTE_CALLER,
        content: noteChildren,
      };
      return [content];
    },
  };
};

// Keep this function updated with logic from
// `libs/shared-react/src/nodes/usj/node-react.utils.ts` > `$createNoteChildren`
const getCrossReferenceMarkerAction: (crossReferenceMarker: string) => UsjMarkerAction = (
  crossReferenceMarker,
) => {
  if (!NoteNode.isValidMarker(crossReferenceMarker) || !crossReferenceMarker.includes("x"))
    throw new Error(`Invalid cross-reference marker '${crossReferenceMarker}'`);

  return {
    action: (currentEditor) => {
      const { chapterNum, verseNum } = currentEditor.reference;
      const noteChildren: MarkerObject[] = [];
      if (chapterNum !== undefined && verseNum !== undefined)
        noteChildren.push({
          type: "char",
          marker: "xo",
          content: [`${chapterNum}:${verseNum} `],
        });
      if (currentEditor.noteText)
        noteChildren.push({
          type: "char",
          marker: "xq",
          content: [currentEditor.noteText],
        });
      noteChildren.push({ type: "char", marker: "xt" });
      const content: MarkerContent = {
        type: "note",
        marker: crossReferenceMarker,
        caller: HIDDEN_NOTE_CALLER,
        content: noteChildren,
      };
      return [content];
    },
  };
};

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
  f: getFootnoteMarkerAction("f"),
  fe: getFootnoteMarkerAction("fe"),
  ef: getFootnoteMarkerAction("ef"),
  efe: getFootnoteMarkerAction("efe"),
  x: getCrossReferenceMarkerAction("x"),
  ex: getCrossReferenceMarkerAction("ex"),
};

/** A function that returns a marker action for a given USJ marker */
export function getUsjMarkerAction(
  marker: string,
  expandedNoteKeyRef: React.MutableRefObject<string | undefined>,
  _markerData?: Marker,
  viewOptions?: ViewOptions,
  /** Included for tests, e.g. `{ discrete: true }` */
  editorUpdateOptions?: EditorUpdateOptions,
): MarkerAction {
  const markerAction = getMarkerAction(marker);
  const action = (currentEditor: {
    editor: LexicalEditor;
    reference: SerializedVerseRef;
    noteText?: string;
  }) => {
    currentEditor.editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) currentEditor.noteText = selection.getTextContent();
      const content = markerAction?.action?.(currentEditor);
      if (!content) return;

      const serializedLexicalNode = createLexicalUsjNode(content, usjEditorAdaptor, viewOptions);
      const nodeToInsert = $createNodeFromSerializedNode(serializedLexicalNode);

      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
        if ($isNoteNode(nodeToInsert)) {
          $insertNoteWithSelect(nodeToInsert, selection, viewOptions);
          if (!nodeToInsert.getIsCollapsed()) expandedNoteKeyRef.current = nodeToInsert.getKey();
        } else if (selection.getTextContent().length > 0) {
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

// #region Helper functions for $wrapTextSelectionInInlineNode

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
