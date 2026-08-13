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
  $createCharNode,
  $createMarkerNode,
  $createNodeFromSerializedNode,
  $findChapter,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  $isSynthesizedMarkerNode,
  $isTypedMarkNode,
  $isVisibleMarkerNode,
  $setCharNodeMarker,
  CharNode,
  createLexicalUsjNode,
  defaultStyleInfo,
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
  $advancePastParaPrefixes,
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
export interface UsjMarkerActionWithNoteKey extends MarkerAction {
  getInsertedNoteKey?: () => string | undefined;
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
 * {@link $removeCharacterMarkerAtSelection}, replaced by
 * {@link $replaceCharacterMarkerAtSelection}, or extended by
 * {@link $extendCharacterMarkerAtSelection} — which gates its `conflictingMarkers` entries through
 * this too, since each one is removed by the same removal path.
 *
 * Deliberately stricter than {@link isUsjMarkerSupported}: that one also accepts para, note,
 * chapter, and verse markers, but these actions only ever target a `CharNode`, so `"p"` must be
 * rejected. It also honors `extraValidMarkers`, which `isUsjMarkerSupported` does not — a character
 * marker this project configures as valid, and which the adaptor therefore accepts on load, should
 * be actionable too.
 *
 * Stricter than `CharNode.isValidMarker` too: that list spreads in the footnote and
 * cross-reference character markers (`"ft"`, `"xt"`, …), but those only ever occur inside a
 * `NoteNode`, which `$getMatchingCharNode` skips. Accepting them here would promise an action that
 * can never happen and then silently no-op, so they are rejected up front instead. That holds for
 * replacement's `toMarker` as well: a `\ft` span outside a note is not USJ the adaptor produces.
 *
 * @param marker - The USFM marker to check.
 * @param extraValidMarkers - Extra character markers this project treats as valid.
 * @returns `true` if the marker is a character marker.
 */
export function isCharacterMarkerSupported(
  marker: string,
  extraValidMarkers?: readonly string[],
): boolean {
  // Note-content markers only occur inside a NoteNode, which the character-marker actions skip.
  if (CharNode.isNoteContentMarker(marker)) return false;
  return CharNode.isValidMarker(marker, extraValidMarkers);
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
): UsjMarkerActionWithNoteKey {
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
      const { content, highlightInserted } = markerAction.action(currentEditor);

      const serializedLexicalNode = createLexicalUsjNode(content, usjEditorAdaptor, viewOptions);
      const nodeToInsert = $createNodeFromSerializedNode(serializedLexicalNode);

      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
        const nodeParent = node.getParent();
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
          $applyNonNestInsideChar(
            selection,
            nodeToInsert,
            node,
            innermostChar,
            viewOptions?.markerMode === "editable",
          );
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
            if (!($isSomeParaNode(nodeToInsert) && $advancePastParaPrefixes(nodeToInsert)))
              nodeToInsert.selectStart();
          }
        } else if (
          $isCharNode(nodeToInsert) &&
          $isTextNode(node) &&
          !$isMarkerNode(node) &&
          $isCharNode(node.getParent()) &&
          selection.isCollapsed() &&
          // NEST-able only. A non-NEST style at a caret inside ANY char span — nested or note-level
          // — is already claimed by the `$applyNonNestInsideChar` branch above, whose guard is this
          // one minus this test. Stating it here rather than branching on it inside keeps that
          // division visible at the guard instead of implying a second non-NEST path exists.
          isNestInPlaceCharNode(nodeToInsert)
        ) {
          // Caret inside a char span — a body span (`\nd Lord`) or a note's content span (the
          // `\ft` of an expanded footnote). The generic `selection.insertNodes` fallback below
          // splices at the nearest BLOCK ancestor and CharNode is inline, so for a note it landed
          // the new span on the wrapper paragraph AFTER the note (outside `\f*`, invalid), and for
          // a body span it split the host span and left a closer-less half that triggers a
          // destructive Tier-2 rebuild. Instead splice at the span's own level, following PT9's
          // per-style rule (StyleApplicator.ApplyCharacterStyle). This branch is the NEST-able
          // half of it: styles whose OccursUnder contains NEST (\w, \nd, \wj, ...) nest IN
          // PLACE — PT9 emits `\+marker` at the caret and closes it immediately, leaving every
          // open span open. Split only the anchor TEXT and put the new span between the halves,
          // INSIDE the span holding the caret; its glyphs get the `+` (see below). Non-NEST
          // styles get PT9's close-all-and-reopen instead, in the `$applyNonNestInsideChar`
          // branch above — they never reach here.
          //
          // `nodeToInsert` already carries the note-content span convention that
          // `$createNoteContentChar` builds and `createChar` loads: an opening glyph with
          // placeholder content, and for implicitly-closed footnote/cross-reference content
          // markers (\fq, \xt, ...) no closing glyph plus closed="false" recorded.
          const charSpan = node.getParent();
          if ($isCharNode(charSpan)) {
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
          } else if ($isCharNode(nodeToInsert)) {
            // A char span must receive the caret INSIDE, at its content position (PT9: after
            // inserting `\wj ` you type the span's content). Both outside placements were wrong:
            // selectStart() descends to the opening glyph's offset 0, so typing edited the glyph
            // (Tier-1 rename); nextNode.selectStart() put typing after the whole span.
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
function $liftOutOfChar(node: LexicalNode, char: CharNode, renderGlyphs: boolean): void {
  const marker = char.getMarker();
  const nested = $isCharNode(char.getParent());
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  // The reopened clone must reproduce `char`'s closer CONVENTION, which keys on state: an
  // implicitly-closed span (closed="false", no closing glyph) reopens as another implicitly-closed
  // span carrying the same flag. Without it the clone has no closer AND no closed="false", so the
  // marker-edit engine reads its (correct) missing closer as deletion damage and rebuilds the note.
  const isUnclosed = char.getUnknownAttributes()?.closed === "false";
  // Content strictly after `node`, excluding char's own closing glyph.
  const after: LexicalNode[] = [];
  for (let sibling = node.getNextSibling(); sibling; ) {
    const next = sibling.getNextSibling();
    if (!($isMarkerNode(sibling) && sibling.getMarkerSyntax() === "closing")) after.push(sibling);
    sibling = next;
  }
  char.insertAfter(node); // node leaves char, becomes its next sibling
  if (after.length > 0) {
    const right = $createCharNode(marker, isUnclosed ? { closed: "false" } : undefined);
    // The clone ALWAYS reopens structurally — that is the PT9 close-and-reopen this function
    // implements, and it happens in every marker mode. `renderGlyphs` only decides whether the
    // clone also carries the VISIBLE `\marker` opener: a MarkerNode is markerMode "editable"
    // presentation, so fabricating one in "hidden"/"visible" mode puts literal `\ft ` text into
    // the content. The closer needs no gate — it is copied only when `char` itself has a closing
    // glyph, which only exists in editable mode anyway.
    if (renderGlyphs) right.append($createMarkerNode(marker, "opening", nested), ...after);
    else right.append(...after);
    if (hasCloser) right.append($createMarkerNode(marker, "closing", nested));
    // Structural NBSP only when the first content node is text (mirrors createChar) and the clone
    // carries an opening glyph — the NBSP is the separator between the glyph and its content.
    const [firstContent] = after;
    if (
      renderGlyphs &&
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
  renderGlyphs: boolean,
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
    $liftOutOfChar(liftTarget, liftTarget.getParent() as CharNode, renderGlyphs);
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
          return { content: [content] };
        },
      };
    } else if (CharNode.isValidMarker(marker)) {
      markerAction = {
        action: () => {
          const content: MarkerContent = { type: CharNode.getType(), marker };
          // Footnote/cross-reference content markers (\fr \ft \xo \xt …) are inserted OPEN by
          // convention — PT9's inserter emits them closer-less and ParatextData then records
          // closed="false" (matching `$createNoteContentChar`). This is an insertion DEFAULT keyed
          // on the marker family, distinct from closer DISPLAY (which keys on state in `createChar`):
          // now that `createChar` renders a closer for any span lacking closed="false", the default
          // must be carried explicitly here or a cursor-only insert of these markers would come out
          // closed. A selection wrap can still promote the span to explicitly closed downstream.
          if (
            CharNode.isValidFootnoteMarker(marker) ||
            CharNode.isValidCrossReferenceMarker(marker)
          )
            (content as MarkerContent & { closed?: string }).closed = "false";
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
    // The span's first content carries the display separator after the opening glyph (`\nd one`,
    // not `\ndone`) — the structural NBSP convention in markerSeparators.utils.ts. Only the FIRST
    // wrapped node takes it (later nodes of a multi-node selection are mid-span content), and only
    // in the editable-glyph shape (an opening MarkerNode child); other marker modes carry no
    // display separator.
    if (
      isFreshWrapper &&
      $isCharNode(wrapper) &&
      wrapper.getChildren().some((child) => $isMarkerNode(child)) &&
      $isTextNode(node) &&
      !$isMarkerNode(node) &&
      !node.getTextContent().startsWith(NBSP)
    )
      node.setTextContent(NBSP + node.getTextContent());
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
 * inside a `NoteNode` are skipped (see `$getMatchingCharNode`). A range selection that only
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
    const charNode = $getMatchingCharNode(anchorNode, marker);
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
  // request that ends up a no-op mutates nothing at all. See `$hasActionableCharNode`.
  if (!$hasActionableCharNode(nodes, marker, startOffset, endOffset)) return false;

  const targetNodes = $getTargetNodes(nodes, startOffset, endOffset);
  if (targetNodes.length === 0) return false;

  // Belt-and-braces: no current path resolves two targetNodes to the same CharNode key, since
  // `$splitCharNodeAroundTargets` reads the whole `targetNodes` array and unwrapping detaches the
  // rest. Kept in case a future change reintroduces one.
  const handledCharNodeKeys = new Set<string>();
  let didRemove = false;
  targetNodes.forEach((targetNode) => {
    const charNode = $getMatchingCharNode(targetNode, marker);
    if (!charNode || handledCharNodeKeys.has(charNode.getKey())) return;
    handledCharNodeKeys.add(charNode.getKey());
    // `undefined` means removal would have to affect unselected text — see
    // `$splitCharNodeAroundTargets`. Leave this CharNode alone rather than over-remove.
    // `$hasActionableCharNode` above has already established that at least one CharNode in the
    // selection is *not* refused, so this cannot be the only outcome for the whole call.
    const coveredCharNode = $splitCharNodeAroundTargets(charNode, targetNodes);
    if (coveredCharNode) {
      $removeCharNodeKeepingContent(coveredCharNode, viewOptions);
      didRemove = true;
    }
  });

  $restoreRangeOverTargets(targetNodes, isBackward);

  return didRemove;
}

// #region Helper functions for $removeCharacterMarkerAtSelection

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

// #region Helper functions shared by the character marker actions

/**
 * Resolve the selected nodes to the text nodes a marker action should act on.
 *
 * Shared by removal, replacement, and extension. The first and last nodes are trimmed to the
 * selection offsets by `$getTargetNode`; interior nodes are taken whole. Anything that doesn't
 * resolve to a `TextNode` — a skipped node, or an element with nothing selectable — is dropped, so
 * an empty result means the caller has nothing to do.
 *
 * @param nodes - The selected nodes, in document order.
 * @param startOffset - The selection's start offset within the first node.
 * @param endOffset - The selection's end offset within the last node.
 * @returns the text nodes to act on.
 */
function $getTargetNodes(nodes: LexicalNode[], startOffset: number, endOffset: number): TextNode[] {
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
  return targetNodes;
}

/**
 * Find the `CharNode` a marker action should act on, walking up from a target node.
 *
 * Shared by removal, replacement, and extension.
 *
 * Returns `undefined` when nothing matches, which the caller treats as a no-op for that target
 * node. The walk is per-target, so a selection spanning a matching and a non-matching node still
 * acts on the matching one. A `CharNode` nested inside a `NoteNode` is skipped: `$getTargetNode`
 * only recognizes note interiors one level deep (a leaf whose *immediate* parent is the
 * `NoteNode`), so a marker `CharNode` nested deeper inside a note — the common case — would
 * otherwise still be found and acted on by this walk.
 *
 * @param node - The node to walk up from.
 * @param marker - The marker to match, or `undefined` to take the innermost `CharNode`.
 * @returns the matching `CharNode`, or `undefined` if there isn't one.
 */
function $getMatchingCharNode(node: LexicalNode, marker: string | undefined): CharNode | undefined {
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
 * Whether `node` sits anywhere inside a `NoteNode`, at any depth.
 *
 * `$isSkippedByMarkerAction` only recognizes note interiors one level deep (a leaf whose *immediate*
 * parent is the `NoteNode`), so `$getTargetNode` still returns text nested deeper — the common
 * `NoteNode > CharNode > TextNode` shape. Removal and replacement absorb that because
 * `$getMatchingCharNode` returns `undefined` for such a node and they read `undefined` as "no match,
 * do nothing". Extension reads the same `undefined` as "not covered", the opposite meaning, so it
 * needs this guard to tell the two apart — without it, a gap run inside a note gets wrapped in a new
 * `CharNode`, contradicting `extendCharacterMarker`'s documented refusal to touch note contents.
 *
 * @param node - The node to check.
 * @returns `true` if a `NoteNode` encloses `node`.
 */
function $isInsideNote(node: LexicalNode): boolean {
  let currentNode: LexicalNode | null = node;
  while (currentNode && !$isSomeParaNode(currentNode)) {
    if ($isNoteNode(currentNode)) return true;
    currentNode = currentNode.getParent();
  }
  return false;
}

/**
 * The selection's nodes that a marker action can actually act on.
 *
 * Deliberately no narrower than `$getTargetNode`: it shares the skip rule via
 * `$isSkippedByMarkerAction` and does not replicate `handleTextNode`'s zero-width filter. So the
 * read-only pre-pass built on it can only ever be more permissive, never wrongly refuse an action
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
 * @param charNode - The `CharNode` a marker action would act on.
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
 * Whether the selection contains a `CharNode` matching `marker` that a marker action would actually
 * act on.
 *
 * Shared by removal, replacement, and extension.
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
 * one of them is refused, this returns `true` (correctly — an action does happen), so the split
 * pass still runs and briefly dirties the refused node's text too. Lexical re-merges it, so the
 * tree is unchanged, but the undo entry covers both. Avoiding that needs the split loop to skip
 * refused nodes, which its index-based offset math can't express without a wider rework.
 *
 * @param nodes - The nodes in the selection.
 * @param marker - The character marker to match, or `undefined` for the innermost one.
 * @param startOffset - The selection's start offset within the first node.
 * @param endOffset - The selection's end offset within the last node.
 * @param excludeMarker - When given, a `CharNode` already carrying this marker does not count as a
 *   match. Replacement passes its target marker here so a same-marker request is a true no-op.
 *   Omitted by removal, where `getMarker() !== undefined` is trivially true, leaving its behavior
 *   unchanged.
 * @returns `true` if there is a matching `CharNode` that would be acted on.
 */
function $hasActionableCharNode(
  nodes: LexicalNode[],
  marker: string | undefined,
  startOffset: number,
  endOffset: number,
  excludeMarker?: string,
): boolean {
  const actionableNodes = $getActionableNodes(nodes);
  const fullyCoveredKeys = $getFullyCoveredTextKeys(nodes, startOffset, endOffset);
  const seenCharNodeKeys = new Set<string>();
  return actionableNodes.some((node) => {
    const charNode = $getMatchingCharNode(node, marker);
    if (!charNode || seenCharNodeKeys.has(charNode.getKey())) return false;
    seenCharNodeKeys.add(charNode.getKey());
    if (charNode.getMarker() === excludeMarker) return false;
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
 * `$hasActionableCharNode` predicts this same refusal read-only, so a request that would be refused
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
      // a refused request off the undo stack — `$hasActionableCharNode` screens the whole-call case
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
 * Don't hand-roll this: `CharNode.insertNewAfter` (CharNode.ts) and `ParaNode.insertNewAfter`
 * (ParaNode.ts) model a manual copy, but both pair `setStyle` with `getTextStyle()` — a
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
 * Restore the range over exactly the characters the marker action acted on.
 *
 * Shared by removal and extension, so a toolbar caller can re-toggle without re-selecting: each
 * target covers exactly the selected portion, so the range runs from the whole first target to the
 * whole last. Three traps make this more than a no-op:
 *
 * - `TextNode.setTextContent` (removal's NBSP trim, extension's leading-space move) mutates
 *   `__text` without touching selection points, so a focus on a trimmed node ends up one past the
 *   new end.
 * - `isBackward` must be captured by the caller *before* mutating: a backward range's anchor is the
 *   *last* target, so swapping the roles keeps it backward instead of normalizing to forward.
 * - `$getSelection()` is re-fetched rather than reusing the caller's `selection`: `$unwrapNode`
 *   splices a CharNode out with `NodeCaret.splice`, which calls `replace()` on it (Lexical 0.43.0,
 *   `NodeCaret.splice` → `target.replace(node)`), and `LexicalNode.replace` clones the active
 *   selection and `$setSelection`s the clone. So the caller's parameter can be a detached object
 *   that it would be pointless to mutate. Note this is the CharNode's own `ElementNode.replace()`,
 *   not `TextNode.replace()`.
 *
 * Skipped when a target didn't survive — for removal, its CharNode held only the empty-char
 * placeholder and was removed outright — in which case Lexical's own selection repair applies.
 *
 * @param targetNodes - The text nodes the action covered, in document order.
 * @param isBackward - Whether the original selection was backward.
 */
function $restoreRangeOverTargets(targetNodes: TextNode[], isBackward: boolean): void {
  const currentSelection = $getSelection();
  const firstTargetNode = targetNodes[0];
  const lastTargetNode = targetNodes[targetNodes.length - 1];
  if (
    !$isRangeSelection(currentSelection) ||
    !firstTargetNode.isAttached() ||
    !lastTargetNode.isAttached()
  )
    return;

  const lastOffset = lastTargetNode.getTextContentSize();
  if (isBackward) currentSelection.setTextNodeRange(lastTargetNode, lastOffset, firstTargetNode, 0);
  else currentSelection.setTextNodeRange(firstTargetNode, 0, lastTargetNode, lastOffset);
}

// #endregion

/**
 * Replace a character marker on the given selection, keeping all of its text content.
 *
 * A collapsed selection changes the marker on the entire enclosing `CharNode`. Selections inside a
 * `NoteNode` are skipped (see `$getMatchingCharNode`). Partial coverage is narrowed and refused on
 * the same terms as removal — see {@link $removeCharacterMarkerAtSelection}.
 *
 * Takes no `ViewOptions`, unlike {@link $removeCharacterMarkerAtSelection}: replacement changes no
 * text and strips no children, so it has nothing marker-mode-dependent to undo. The synthesized
 * marker children that marker modes add are retargeted rather than removed — see
 * `$retargetSynthesizedMarkers`.
 *
 * @param selection - The current range selection.
 * @param toMarker - The character marker to change to.
 * @param fromMarker - The character marker to match, or `undefined` for the innermost one.
 * @returns `true` if a marker was changed, `false` if the request was a no-op.
 */
export function $replaceCharacterMarkerAtSelection(
  selection: RangeSelection,
  toMarker: string,
  fromMarker: string | undefined,
): boolean {
  if (selection.isCollapsed()) {
    const charNode = $getMatchingCharNode(selection.anchor.getNode(), fromMarker);
    // `CharNode.setMarker` already short-circuits on an unchanged marker, so this check isn't
    // what keeps a same-marker replace from dirtying the CharNode itself. It guards
    // `$setCharNodeMarker`'s other work: rewriting the node's synthesized marker children has
    // no such short-circuit of its own, and a same-marker request must not reach it.
    if (!charNode || charNode.getMarker() === toMarker) return false;
    $setCharNodeMarker(charNode, toMarker);
    return true;
  }

  const nodes = selection.getNodes();
  const [startOffset, endOffset] = getSelectionOffsets(selection);
  // Check there is something to change before the loop below starts splitting text nodes, so a
  // no-match — or already-`toMarker` — request mutates nothing at all. See
  // `$hasActionableCharNode`.
  if (!$hasActionableCharNode(nodes, fromMarker, startOffset, endOffset, toMarker)) return false;

  const targetNodes = $getTargetNodes(nodes, startOffset, endOffset);
  if (targetNodes.length === 0) return false;

  // No selection restore afterwards, unlike `$removeCharacterMarkerAtSelection`: that one needs
  // one because `$unwrapNode`'s `replace()` clones the active selection and its NBSP trim changes
  // text lengths. Replacement changes no text and detaches no node carrying a selection point —
  // `$splitCharNodeAroundTargets` and `$charNodeTransform` both *move* existing child nodes — so
  // the original points stay valid.
  const handledCharNodeKeys = new Set<string>();
  let didReplace = false;
  targetNodes.forEach((targetNode) => {
    const charNode = $getMatchingCharNode(targetNode, fromMarker);
    if (!charNode || handledCharNodeKeys.has(charNode.getKey())) return;
    handledCharNodeKeys.add(charNode.getKey());
    // Re-checked per CharNode, not just in the pre-flight guard above: a selection can span one
    // CharNode that needs changing and another already carrying `toMarker`.
    if (charNode.getMarker() === toMarker) return;
    // `undefined` means the change would have to affect unselected text — see
    // `$splitCharNodeAroundTargets`. Leave this CharNode alone rather than over-apply.
    // `$hasActionableCharNode` above has already established that at least one CharNode in the
    // selection is *not* refused, so this cannot be the only outcome for the whole call.
    const coveredCharNode = $splitCharNodeAroundTargets(charNode, targetNodes);
    if (coveredCharNode) {
      $setCharNodeMarker(coveredCharNode, toMarker);
      didReplace = true;
    }
  });

  return didReplace;
}

/**
 * Extend a character marker to cover the whole selection, keeping all of its text content.
 *
 * "Extend" means *make the whole selection carry `marker`*, however much of it already does — the
 * mutation behind the toolbar's partial → all step. Only the sub-ranges not already covered are
 * wrapped, so no nested identical marker is ever produced: `kolo ` + `\bd Mulu\bd*` becomes one
 * `\bd` over the lot, never `\bd kolo \bd Mulu\bd*\bd*`. A selection with no existing run of
 * `marker` is the degenerate case and is wrapped in full.
 *
 * Adjacent same-marker `CharNode`s are merged by `$charNodeTransform`
 * (`CharNodePlugin.tsx`), so this function deliberately stops at "adjacent siblings, never nested".
 *
 * Some markers cannot coexist with `marker` — which pairs is an open product question (OQ-6) this
 * function deliberately does not answer, so `conflictingMarkers` is the caller's list, injected
 * rather than hard-coded. Each one is removed from the selection via
 * {@link $removeCharacterMarkerAtSelection} before the gaps are wrapped. Removal is best-effort: a
 * removal refused for nested partial coverage (see `$splitCharNodeAroundTargets`) leaves that
 * conflicting marker in place and the extend still proceeds — aborting the whole call would kill
 * the toolbar's toggle in a case the user cannot see.
 *
 * @param selection - The current range selection.
 * @param marker - The character marker to extend over the selection.
 * @param conflictingMarkers - Character markers that cannot coexist with `marker` and so are
 *   removed from the selection first. An entry equal to `marker` itself is ignored: removing and
 *   then re-wrapping the same run would strip its `CharNode` — including its cid — and rebuild it
 *   with a fresh identity, silently losing that run's collab identity for no behavioral gain.
 * @param viewOptions - View options, forwarded to {@link $removeCharacterMarkerAtSelection}.
 * @returns `true` if the document was changed, `false` if the request was a no-op.
 */
export function $extendCharacterMarkerAtSelection(
  selection: RangeSelection,
  marker: string,
  conflictingMarkers: readonly string[] | undefined,
  viewOptions: ViewOptions | undefined,
): boolean {
  // Nothing to cover: "the whole selection" is vacuous for a caret. Unlike removal and replacement,
  // which act on the enclosing CharNode when collapsed, extend has no analogous meaning.
  if (selection.isCollapsed()) return false;

  // A conflicting marker equal to `marker` itself would remove and immediately re-wrap the same
  // run, losing its cid for nothing — see the `conflictingMarkers` param doc. Derived once so the
  // pre-flight check below and the removal loop can't disagree on which markers actually conflict.
  const conflictingMarkersExcludingSelf = conflictingMarkers?.filter(
    (conflictingMarker) => conflictingMarker !== marker,
  );

  const nodes = selection.getNodes();
  const [startOffset, endOffset] = getSelectionOffsets(selection);
  // Both no-op paths are screened read-only, before anything splits: nothing left to cover *and*
  // no conflicting marker to strip means the document and the selection stay untouched.
  const hasConflictToRemove = !!conflictingMarkersExcludingSelf?.some((conflictingMarker) =>
    $hasActionableCharNode(nodes, conflictingMarker, startOffset, endOffset),
  );
  if (!hasConflictToRemove && !$hasUncoveredNode(nodes, marker)) return false;

  // Best-effort by design: a removal refused for nested partial coverage (see
  // `$splitCharNodeAroundTargets`) leaves that conflicting marker in place and the extend still
  // happens. Aborting the whole call would kill the toolbar's toggle in a case the user can't see.
  // The selection is re-fetched around every removal: `$unwrapNode`'s `replace()` clones the active
  // selection, so the object from the previous iteration is detached.
  let didChange = false;
  conflictingMarkersExcludingSelf?.forEach((conflictingMarker) => {
    const currentSelection = $getSelection();
    if (!$isRangeSelection(currentSelection)) return;
    if ($removeCharacterMarkerAtSelection(currentSelection, conflictingMarker, viewOptions))
      didChange = true;
  });

  const currentSelection = $getSelection();
  if (!$isRangeSelection(currentSelection)) return didChange;
  // Recomputed rather than reusing `nodes` and the offsets above: the conflict pass may have
  // changed both the tree and the selection.
  const isBackward = currentSelection.isBackward();
  const [currentStartOffset, currentEndOffset] = getSelectionOffsets(currentSelection);
  const targetNodes = $getTargetNodes(
    currentSelection.getNodes(),
    currentStartOffset,
    currentEndOffset,
  );
  if (targetNodes.length === 0) return didChange;

  // A target is already covered when any ancestor up to the enclosing para carries `marker` — the
  // same walk removal and replacement use to find their target. Note interiors are screened
  // separately by `$isInsideNote`, because an absent match means "uncovered" here but "do nothing"
  // there, and `$getTargetNode` only drops note text one level deep. Kept in step with
  // `$hasUncoveredNode`, the read-only pre-flight for this same filter.
  const gapNodes = targetNodes.filter(
    (targetNode) => !$isInsideNote(targetNode) && !$getMatchingCharNode(targetNode, marker),
  );
  if (gapNodes.length > 0) {
    $groupAdjacentGapRuns(gapNodes).forEach((run) => $wrapRunInCharNode(run, marker));
    didChange = true;
  }

  $restoreRangeOverTargets(targetNodes, isBackward);
  return didChange;
}

// #region Helper functions for $extendCharacterMarkerAtSelection

/**
 * Whether any actionable node in the selection is *not* already covered by `marker`.
 *
 * The read-only counterpart of the gap filter in `$extendCharacterMarkerAtSelection`, answered
 * before the splitting pass so a fully covered request never calls `handleTextNode`'s `splitText`
 * — which would put a documented no-op on the undo stack and produce an empty collab delta.
 *
 * Built on `$getActionableNodes`, which is deliberately no narrower than `$getTargetNode`, so this
 * can only ever be more permissive — it never wrongly refuses an extend that would have happened.
 *
 * Note interiors are excluded up front by `$isInsideNote` rather than by an absent
 * `$getMatchingCharNode` match: unlike removal and replacement, extension treats a missing match as
 * "uncovered", so without that guard a note's text would read as something left to cover. Must stay
 * in step with the gap filter in `$extendCharacterMarkerAtSelection`, which screens the same way.
 *
 * @param nodes - The nodes in the selection.
 * @param marker - The character marker being extended.
 * @returns `true` if there is something left to cover.
 */
function $hasUncoveredNode(nodes: LexicalNode[], marker: string): boolean {
  return $getActionableNodes(nodes).some(
    (node) => !$isInsideNote(node) && !$getMatchingCharNode(node, marker),
  );
}

/**
 * Split the gap nodes into maximal runs of adjacent siblings — one `CharNode` wrapper each.
 *
 * Adjacency is checked with `getNextSibling()`, which subsumes a same-parent check: two nodes under
 * different parents are never each other's siblings. Both cases have to break the run — gaps
 * separated by covered content (`kolo ` and ` sana` around `\bd Mulu\bd*`) would have their text
 * reordered by a shared wrapper, and gaps under different parents would be hoisted out of the
 * element that holds them.
 *
 * Grouping happens before any wrapping: `append` moves a node out of its original parent, so
 * adjacency can only be read off the untouched tree.
 *
 * @param gapNodes - The uncovered text nodes, in document order.
 * @returns the runs to wrap, in document order.
 */
function $groupAdjacentGapRuns(gapNodes: TextNode[]): TextNode[][] {
  const runs: TextNode[][] = [];
  let currentRun: TextNode[] | undefined;
  gapNodes.forEach((gapNode) => {
    const previousGapNode = currentRun?.[currentRun.length - 1];
    if (currentRun && previousGapNode?.getNextSibling()?.is(gapNode)) currentRun.push(gapNode);
    else {
      currentRun = [gapNode];
      runs.push(currentRun);
    }
  });
  return runs;
}

/**
 * Wrap one run of adjacent uncovered text nodes in a new `CharNode` carrying `marker`.
 *
 * The wrapper is inserted where the run already is, then the run is appended into it — the shape
 * `$wrapSelectionInTypedMarkNode` (`TypedMarkNode.ts`) uses, minus its mark-specific parts.
 *
 * When a sibling of the run is already a `CharNode` carrying `marker`, the wrapper copies that
 * neighbor's identity via `$createCharNodeLike` instead of starting from a bare `$createCharNode`.
 * A fresh `CharNode` has no cid, and `$charNodeTransform`'s `$hasSameCharAttributes` check refuses
 * to merge a node that has one with one that doesn't — so in a collab document, where every
 * `CharNode` gets a cid, an identity-less wrapper would sit beside the neighbor forever instead of
 * merging into it.
 *
 * @remarks Insert-path parity (OQ-7): a marker never starts with a space, matching
 *   `$moveLeadingSpaceToPreviousNode`'s rule for the insert path. See the call below for the one
 *   exception.
 *
 * @remarks The invariant behind the copied cid: two attached `CharNode`s may share one cid only
 *   while they stay equivalent. `$charNodeTransform` normally reunites them inside the same
 *   `editor.update()` (see `$setCharNodeMarker`), so nothing observes the pair. Even unmerged it is
 *   invisible on the wire, because `$buildCharItem` emits `{style, cid}` per run and quill-delta's
 *   `push` coalesces adjacent inserts with deep-equal attributes — the split and the merge serialize
 *   identically. Both of those hold only while the attributes compare equal. An edit that changed
 *   one half and not the other would break the coalescing and expose the duplicate cid to collab.
 *   Not reachable today, and deliberately not asserted at runtime: the wrap can't observe a
 *   divergence a later edit would introduce. The realistic way this breaks is `CharNodePlugin` not
 *   being mounted — it is wired up only in platform's `Editor.tsx`, so lifting these utils toward
 *   `shared` would silently start producing permanent duplicate-cid pairs. `Editor.test.tsx`'s
 *   "covers the whole selection with one marker, not a nested pair" catches that by asserting
 *   exactly one `char` node survives the merge.
 *
 * @remarks Previous-sibling preference: `.find` over `[previousSibling, nextSibling]` always picks
 *   the previous one when both are same-marker `CharNode`s. This is observable when the two
 *   neighbors carry different cids: the wrapper can only copy one identity, so it merges with
 *   whichever side it copied from and the result is two runs, not one, rather than merging with
 *   both.
 *
 * @param run - Adjacent sibling text nodes to wrap.
 * @param marker - The character marker for the new `CharNode`.
 */
function $wrapRunInCharNode(run: TextNode[], marker: string): void {
  const previousSibling = run[0].getPreviousSibling();
  const nextSibling = run[run.length - 1].getNextSibling();
  const neighborCharNode = [previousSibling, nextSibling].find(
    (sibling): sibling is CharNode => $isCharNode(sibling) && sibling.getMarker() === marker,
  );
  const wrapper = neighborCharNode
    ? $createCharNodeLike(neighborCharNode)
    : $createCharNode(marker);
  run[0].insertBefore(wrapper);
  wrapper.append(...run);

  // Insert-path parity (OQ-7): a marker never starts with a space. Skipped when the previous
  // sibling is a same-marker CharNode, because `$moveLeadingSpaceToPreviousNode` would insert a
  // plain space TextNode between the two runs — `$addTrailingSpace` no-ops on an element — and
  // block the merge that makes them one marker. After merging the space is interior anyway.
  // `.find` prefers the previous sibling (see the remark above), so identity against it is the
  // whole test — no need to restate the same-marker rule.
  const willMergeWithPreviousSibling = neighborCharNode === previousSibling;
  if (!willMergeWithPreviousSibling) $moveLeadingSpaceToPreviousNode(run[0], wrapper);
}

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
