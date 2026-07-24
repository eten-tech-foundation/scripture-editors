import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
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
import { $splitCharNodeAt } from "../markerEdit/charFormatting.utils";
import {
  $createNodeFromSerializedNode,
  $findFirstAncestorNoteNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  CharNode,
  createLexicalUsjNode,
  defaultStyleInfo,
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

/**
 * Extends the shared {@link MarkerAction} `action`/`label` pair with an optional way to read the
 * freshly-inserted note's TRUE Lexical node key immediately after `action(...)` returns. Only the
 * note branch of {@link getUsjMarkerAction} populates it; every other marker's returned action
 * leaves it `undefined`.
 *
 * Exists so `EditorRef.insertMarker` (`Editor.tsx`) can hand the host the exact key of the note it
 * just created, bypassing the `"delta-doc"` OT coordinate derivation (`getInsertedNodeKey`) that
 * double-counts editable VerseNodes and can land past the note when one precedes the insertion
 * point — without touching any OT coordinate code.
 */
export interface UsjMarkerActionResult extends MarkerAction {
  getInsertedNoteKey?: () => string | undefined;
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

/**
 * Inserts a note for `marker` at the current selection and returns the created NoteNode's TRUE
 * Lexical key (or undefined when insertion bailed). Call inside `editor.update()`. Shared by the
 * `getUsjMarkerAction` note action (which wraps it in its own update for the `insertMarker`
 * entry point) and `$applyMarkerMenuSelection` (already inside an update — a nested update would
 * be QUEUED, losing the key).
 */
export function $insertNoteForMarker(
  marker: string,
  reference: SerializedVerseRef,
  expandedNoteKeyRef: React.MutableRefObject<string | undefined>,
  viewOptions?: ViewOptions,
  nodeOptions?: UsjNodeOptions,
  logger?: LoggerBasic,
): string | undefined {
  const noteNode = $insertNote(
    marker,
    undefined,
    undefined,
    reference,
    viewOptions ?? getDefaultViewOptions(),
    nodeOptions ?? {},
    logger,
  );
  if (noteNode && !noteNode.getIsCollapsed()) expandedNoteKeyRef.current = noteNode.getKey();
  return noteNode?.getKey();
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
): UsjMarkerActionResult {
  // Note markers are handled directly via $insertNote (no serialization round-trip).
  if (NoteNode.isValidMarker(marker)) {
    // Captured synchronously inside the `editor.update()` callback below - Lexical's callback
    // runs synchronously when this is the OUTERMOST update (only the DOM reconciliation/commit
    // may be deferred), so this is populated by the time `action(...)` returns for the
    // `insertMarker` entry point. NOTE: a caller already inside an update must NOT go through
    // this wrapper (the nested update is queued, not run) — use `$insertNoteForMarker` directly,
    // as `$applyMarkerMenuSelection` does.
    let insertedNoteKey: string | undefined;
    const action = (currentEditor: { editor: LexicalEditor; reference: SerializedVerseRef }) => {
      currentEditor.editor.update(() => {
        insertedNoteKey = $insertNoteForMarker(
          marker,
          currentEditor.reference,
          expandedNoteKeyRef,
          viewOptions,
          nodeOptions,
          logger,
        );
      }, editorUpdateOptions);
    };
    return { action, label: undefined, getInsertedNoteKey: () => insertedNoteKey };
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
        } else if (
          $isCharNode(nodeToInsert) &&
          $isTextNode(node) &&
          !$isMarkerNode(node) &&
          $isCharNode(node.getParent()) &&
          $findFirstAncestorNoteNode(node) !== undefined &&
          selection.isCollapsed()
        ) {
          // Caret inside a note's char span (e.g. the \ft content of an expanded footnote).
          // The generic `selection.insertNodes` fallback below splices at the nearest BLOCK
          // ancestor — NoteNode and CharNode are both inline — landing the new span on the
          // wrapper paragraph AFTER the note, outside \f*, as invalid note-less content.
          // Instead splice at the span's own level, following PT9's per-style split
          // (StyleApplicator.ApplyCharacterStyle):
          // - NEST-able styles (OccursUnder contains NEST: \w, \nd, \wj, ...) nest IN PLACE —
          //   PT9 emits `\+marker` at the caret and closes it immediately, leaving every open
          //   span open. Split only the anchor TEXT and put the new span between the halves,
          //   INSIDE the span holding the caret.
          // - Note-content styles (\fq, \fk, ...) get PT9's close-all-and-reopen shape: split
          //   the span at the caret and put the new span between the halves. At the span's
          //   content end `$splitCharNodeAt` attaches nothing and the new span simply follows
          //   the whole span — still before the note's closing glyph, which sits after all
          //   content children.
          //
          // `nodeToInsert` already carries the note-content span convention that
          // `$createNoteContentChar` builds and `createChar` loads: an opening glyph with
          // placeholder content, and for implicitly-closed footnote/cross-reference content
          // markers (\fq, \xt, ...) no closing glyph plus closed="false" recorded.
          const charSpan = node.getParent();
          if ($isCharNode(charSpan)) {
            if (isNestInPlaceCharNode(nodeToInsert)) {
              const offset = selection.anchor.offset;
              if (offset === 0) node.insertBefore(nodeToInsert);
              else if (offset >= node.getTextContentSize()) node.insertAfter(nodeToInsert);
              else {
                const [leftHalf] = node.splitText(offset);
                leftHalf.insertAfter(nodeToInsert);
              }
            } else {
              $splitCharNodeAt(charSpan, node, selection.anchor.offset);
              charSpan.insertAfter(nodeToInsert);
              // A split before all content leaves the left span glyph-only; drop it (the same
              // emptied-half cleanup Ctrl+Space's split performs).
              if (charSpan.getChildren().every($isMarkerNode)) charSpan.remove();
            }
            // Caret INSIDE the new span at its content position — same convention as the
            // generic char path below: typed text appends after the placeholder and
            // CharNodePlugin strips the placeholder once real content exists.
            const contentText = nodeToInsert
              .getChildren()
              .find((child) => $isTextNode(child) && !$isMarkerNode(child));
            if (contentText && $isTextNode(contentText)) {
              contentText.select(
                contentText.getTextContentSize(),
                contentText.getTextContentSize(),
              );
            } else {
              nodeToInsert.selectEnd();
            }
          }
        } else {
          selection.insertNodes([nodeToInsert]);
          $moveVerseFollowingSpaceToPreviousNode(nodeToInsert);
          // A char span must receive the caret INSIDE, at its content position (PT9: after
          // inserting `\wj ` you type the span's content). Both outside placements were wrong:
          // selectStart() descends to the opening glyph's offset 0, so typing edited the glyph
          // (Tier-1 rename); nextNode.selectStart() put typing after the whole span.
          if ($isCharNode(nodeToInsert)) {
            const contentText = nodeToInsert
              .getChildren()
              .find((child) => $isTextNode(child) && !$isMarkerNode(child));
            if (contentText && $isTextNode(contentText)) {
              // End of the empty-content placeholder: typed text appends after it and
              // CharNodePlugin strips the placeholder prefix once real content exists.
              contentText.select(
                contentText.getTextContentSize(),
                contentText.getTextContentSize(),
              );
            } else {
              nodeToInsert.selectEnd();
            }
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
 * Whether an in-note char apply should NEST the new span in place — inside the span holding the
 * caret — rather than split that span. PT9's StyleApplicator nests exactly the styles whose
 * OccursUnder contains NEST (\w, \nd, \wj, ...); other styles get the close-all-and-reopen
 * shape the split path produces. Nesting additionally requires the built span to carry an
 * explicit closer: a span with the implicit-close convention (closed="false", no closing glyph —
 * \xt is the one NEST-able such marker) would swallow the rest of the host span's content on
 * serialization, since without its own closer the marker runs to the parent's.
 */
function isNestInPlaceCharNode(charNode: CharNode): boolean {
  const occursUnder = defaultStyleInfo.markers[charNode.getMarker()]?.occursUnder ?? [];
  return occursUnder.includes("NEST") && charNode.getUnknownAttributes()?.closed !== "false";
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

    // Create or reuse wrapper node. The wrapper is created ONCE and reused for every node of the
    // selection, so only its FIRST use is "fresh" (carries the empty-content placeholder to discard);
    // later uses already hold real content wrapped for earlier nodes.
    let isFreshWrapper = false;
    if (!currentWrapper) {
      currentWrapper = createNode();
      targetNode.insertBefore(currentWrapper);
      isFreshWrapper = true;
    }

    // Wrap the target node
    $wrapNode(targetNode, currentWrapper, isFreshWrapper);
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

function $wrapNode(node: LexicalNode, wrapper: LexicalNode, isFreshWrapper: boolean): void {
  if ($isTextNode(wrapper)) {
    const text = $moveLeadingSpaceToPreviousNode(node, wrapper);
    wrapper.setTextContent(text);
    node.remove();
  } else if ($isElementNode(wrapper)) {
    // A freshly created wrapper already carries its own opener/closer glyph children (plus a
    // placeholder for its otherwise-empty content) when built in "editable" marker mode
    // (`createChar`, `usj-editor.adaptor.ts:349-356`): preserve those glyphs and discard only
    // the placeholder, inserting the real wrapped content where the placeholder sat - a
    // glyph-less span reads to `MarkerEditPlugin` as "the opener was deleted" and gets
    // unwrapped again immediately (`$charNodeDeletionTransform`). Other marker modes don't
    // populate glyph children this way, so the original strip-everything behavior (append then
    // drop whatever pre-existing children there were) is unchanged for them.
    //
    // The placeholder/pre-existing children only exist on the FIRST use of the wrapper. When the
    // SAME wrapper is reused for the next node of a multi-node selection it is NOT fresh, and its
    // non-marker children are real content already wrapped for an earlier node — stripping them
    // then would delete that content (keeping only the last node's).
    const existingChildren = wrapper.getChildren();
    const closer = existingChildren.find(
      (child) => $isMarkerNode(child) && child.getMarkerSyntax() !== "opening",
    );
    if (closer) {
      closer.insertBefore(node);
      if (isFreshWrapper)
        existingChildren
          .filter((child) => !$isMarkerNode(child))
          .forEach((child) => child.remove());
    } else if (isFreshWrapper) {
      const wrapperChildrenCount = wrapper.getChildrenSize();
      wrapper.append(node);
      for (let i = 0; i < wrapperChildrenCount; i++) wrapper.getFirstChild()?.remove();
    } else {
      wrapper.append(node);
    }
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
