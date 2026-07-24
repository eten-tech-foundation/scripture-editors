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
  $createCharNode,
  $createMarkerNode,
  $createNodeFromSerializedNode,
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
        const innermostChar = $innermostCharAncestor(node);
        const sameNode = selection.anchor.key === selection.focus.key;
        if (
          $isCharNode(nodeToInsert) &&
          innermostChar &&
          sameNode &&
          !isNestInPlaceCharNode(nodeToInsert)
        ) {
          // A non-NEST style applied INSIDE an open char span: PT9 closes the enclosing char
          // styles and reopens the ones with content after the point — it never nests the span.
          $applyNonNestInsideChar(selection, nodeToInsert, node, innermostChar);
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
        } else if (
          $isCharNode(nodeToInsert) &&
          $isTextNode(node) &&
          !$isMarkerNode(node) &&
          $isCharNode(node.getParent()) &&
          selection.isCollapsed()
        ) {
          // Caret inside a char span — a body span (`\nd Lord`) or a note's content span (the
          // `\ft` of an expanded footnote). The generic `selection.insertNodes` fallback below
          // splices at the nearest BLOCK ancestor and CharNode is inline, so for a note it landed
          // the new span on the wrapper paragraph AFTER the note (outside `\f*`, invalid), and for
          // a body span it split the host span and left a closer-less half that triggers a
          // destructive Tier-2 rebuild. Instead splice at the span's own level, following PT9's
          // per-style split (StyleApplicator.ApplyCharacterStyle):
          // - NEST-able styles (OccursUnder contains NEST: \w, \nd, \wj, ...) nest IN PLACE —
          //   PT9 emits `\+marker` at the caret and closes it immediately, leaving every open
          //   span open. Split only the anchor TEXT and put the new span between the halves,
          //   INSIDE the span holding the caret; its glyphs get the `+` (see below).
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
              // The span now nests inside the caret's char span, so its editable glyphs carry the
              // `+` (matching the load path) — otherwise a Tier-2 re-tokenization of the visible
              // text would read the bare `\w` as close-on-bare and flatten the nesting.
              nodeToInsert.getChildren().forEach((child) => {
                if ($isMarkerNode(child)) child.setNested(true);
              });
            } else {
              // A note-content non-NEST style at a caret directly in a note-level span (not nested
              // in another char): split the span and drop the new span between the halves. Non-NEST
              // styles inside a NESTED span are handled earlier by $applyNonNestInsideChar (PT9
              // close-and-reopen), so they never reach here.
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

/**
 * Make a char span that now nests inside another char span (its parent is a CharNode) carry the
 * `+` on its glyphs AND an EXPLICIT closer. Implicitly-closed content markers (\fq, \xt, ...) are
 * normally built closer-less (closed="false") — the note-content convention where the following
 * bare marker closes them — but nested that convention breaks two ways: on serialization a
 * closer-less `\+fq` runs to the parent span's closer and swallows any following nested sibling
 * (`\ft A \+nd ho\+nd*\+fq\+nd ly\+nd*` re-parses with the second `\+nd` INSIDE `\+fq`); and a
 * selection wrap into a fresh closer-less span strips its opener glyph and gets unwrapped as a
 * "deleted opener" (a silent no-op). An explicit closer fixes both, matching PT9's requirement
 * that an applied nested span be explicitly terminated.
 */
function $ensureNestedSpanClosed(charNode: CharNode): void {
  charNode.getChildren().forEach((child) => {
    if ($isMarkerNode(child)) child.setNested(true);
  });
  const hasCloser = charNode
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  if (!hasCloser) charNode.append($createMarkerNode(charNode.getMarker(), "closing", true));
  const attributes = charNode.getUnknownAttributes();
  if (attributes?.closed === "false") {
    const rest = { ...attributes };
    delete rest.closed;
    charNode.setUnknownAttributes(Object.keys(rest).length > 0 ? rest : undefined);
  }
}

/** Nearest CharNode at or above `node` (the innermost char span the point sits in), or undefined. */
function $innermostCharAncestor(node: LexicalNode): CharNode | undefined {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isCharNode(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

/** The nearest non-char ancestor of `char` — the note or paragraph a bare char marker lands in. */
function $charContainer(char: CharNode): LexicalNode | null {
  let parent: LexicalNode | null = char.getParent();
  while (parent && $isCharNode(parent)) parent = parent.getParent();
  return parent;
}

/**
 * Lift `node` OUT of the char span `char` to `char`'s parent, splitting `char` around it: content
 * before `node` stays in `char` (its "before" half), content after `node` moves to a fresh
 * reopened clone inserted after `node`, and `node` itself becomes a sibling of `char`. A "before"
 * half left with only glyphs is dropped. The reopened clone keeps `char`'s marker, closer
 * convention, and nesting (its glyphs carry the `+` when `char` was itself nested).
 */
function $liftOutOfChar(node: LexicalNode, char: CharNode): void {
  const marker = char.getMarker();
  const nested = $isCharNode(char.getParent());
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  // Content strictly after `node`, excluding char's own closing glyph.
  const after: LexicalNode[] = [];
  for (let sibling = node.getNextSibling(); sibling; ) {
    const next = sibling.getNextSibling();
    if (!($isMarkerNode(sibling) && sibling.getMarkerSyntax() === "closing")) after.push(sibling);
    sibling = next;
  }
  char.insertAfter(node); // node leaves char, becomes its next sibling
  if (after.length > 0) {
    const right = $createCharNode(marker);
    right.append($createMarkerNode(marker, "opening", nested), ...after);
    if (hasCloser) right.append($createMarkerNode(marker, "closing", nested));
    // Structural NBSP only when the first content node is text (mirrors createChar).
    const [firstContent] = after;
    if (
      $isTextNode(firstContent) &&
      !$isMarkerNode(firstContent) &&
      !firstContent.getTextContent().startsWith(NBSP)
    )
      firstContent.setTextContent(NBSP + firstContent.getTextContent());
    node.insertAfter(right);
  }
  if (char.getChildren().every($isMarkerNode)) char.remove();
}

/**
 * Apply a non-NEST char style at a point or selection that sits INSIDE an open char span, following
 * PT9's StyleApplicator: close every enclosing char style before the point and reopen the ones with
 * content after it (never nest the new span). The new span — and every reopened right half — is
 * lifted to the nearest non-char container (the note or paragraph a bare marker would land in).
 * Handles a collapsed caret and a selection within a single text node; other multi-node selections
 * fall back to the caller's generic wrap.
 */
function $applyNonNestInsideChar(
  selection: RangeSelection,
  newSpan: CharNode,
  anchorNode: LexicalNode,
  innermostChar: CharNode,
): void {
  const container = $charContainer(innermostChar);
  let liftTarget: LexicalNode = newSpan;
  if (selection.isCollapsed() || !$isTextNode(anchorNode)) {
    // Caret: place the (empty) new span at the caret inside the innermost span.
    const offset = selection.anchor.offset;
    if ($isTextNode(anchorNode) && offset > 0 && offset < anchorNode.getTextContentSize()) {
      const [left] = anchorNode.splitText(offset);
      left.insertAfter(newSpan);
    } else if ($isTextNode(anchorNode) && offset >= anchorNode.getTextContentSize()) {
      anchorNode.insertAfter(newSpan);
    } else {
      anchorNode.insertBefore(newSpan);
    }
  } else {
    // Selection within one text node: isolate the selected text so it can be lifted out and wrapped.
    const [start, end] = getSelectionOffsets(selection);
    let selected: TextNode = anchorNode;
    if (start > 0) {
      const parts = selected.splitText(start);
      selected = parts[parts.length - 1];
    }
    if (selected.getTextContentSize() > end - start) selected = selected.splitText(end - start)[0];
    liftTarget = selected;
  }
  while (
    liftTarget.getParent() &&
    liftTarget.getParent() !== container &&
    $isCharNode(liftTarget.getParent())
  )
    $liftOutOfChar(liftTarget, liftTarget.getParent() as CharNode);
  if (liftTarget !== newSpan) {
    // Wrap the lifted selection text in the new span (now at container level), replacing its
    // empty-content placeholder and taking the structural NBSP as the span's first content.
    liftTarget.insertBefore(newSpan);
    if ($isTextNode(liftTarget) && !liftTarget.getTextContent().startsWith(NBSP))
      liftTarget.setTextContent(NBSP + liftTarget.getTextContent());
    const placeholder = newSpan
      .getChildren()
      .find((child) => $isTextNode(child) && !$isMarkerNode(child));
    if (placeholder) placeholder.replace(liftTarget);
    else newSpan.append(liftTarget);
  }
  // Caret inside the new span's content, so typing fills it.
  const contentText = newSpan
    .getChildren()
    .find((child) => $isTextNode(child) && !$isMarkerNode(child));
  if ($isTextNode(contentText))
    contentText.select(contentText.getTextContentSize(), contentText.getTextContentSize());
  else newSpan.selectEnd();
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
      // A wrapper nested inside another char span needs `+` glyphs and an explicit closer, so
      // $wrapNode inserts content before a real closer instead of stripping the lone opener of a
      // closer-less span (which leaves a glyph-less span the marker-edit engine unwraps — a silent
      // no-op). At other levels the wrapper keeps whatever convention it was built with.
      if ($isCharNode(currentWrapper) && $isCharNode(currentWrapper.getParent()))
        $ensureNestedSpanClosed(currentWrapper);
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
