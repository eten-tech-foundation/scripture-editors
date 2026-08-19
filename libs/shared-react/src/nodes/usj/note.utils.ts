/**
 * Note creation/selection machinery for the USJ editors: data-driven callers, the editable note
 * shape, insertion, selection, and PT9 note snippet semantics (reference text and
 * selection-to-quotation stripping). Extracted from `node-react.utils.ts` so the note machinery
 * has one home. The serialized twin of the editable note shape built here is the forward
 * adaptor's `createNote` (`packages/platform/src/editor/adaptors/usj-editor.adaptor.ts`).
 */
import { SelectionRange } from "../../plugins/usj/annotation/selection.model";
import { $getRangeFromUsjSelection } from "../../plugins/usj/annotation/selection.utils";
import { NoteMode, ViewOptions } from "../../views/view-options.utils";
import {
  $createImmutableNoteCallerNode,
  $isImmutableNoteCallerNode,
  ImmutableNoteCallerNode,
  NoteCallerOnClick,
} from "./ImmutableNoteCallerNode";
import { $isImmutableVerseNode } from "./ImmutableVerseNode";
import { UsjNodeOptions } from "./usj-node-options.model";
import { $dfs } from "@lexical/utils";
import {
  $createTextNode,
  $getCharacterOffsets,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalNode,
  RangeSelection,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createNoteNode,
  $getNoteCallerPreviewText,
  $isCharNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isNoteNode,
  $isVerseNode,
  $moveSelectionToEnd,
  CharNode,
  closingMarkerText,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getEditableCallerText,
  ImmutableTypedTextNode,
  LoggerBasic,
  MarkerNode,
  NBSP,
  NoteNode,
  openingMarkerText,
  ScriptureReference,
  segmentState,
} from "shared";

/** Caller count is in an object so it can be manipulated by passing the object. */
export interface CallerData {
  count: number;
}

/**
 * Find all ImmutableNoteCallerNodes in the given nodes tree.
 * @param nodes - Lexical node array to look in.
 * @returns an array of all ImmutableNoteCallerNodes in the tree.
 */
export function $findImmutableNoteCallerNodes(nodes: LexicalNode[]): ImmutableNoteCallerNode[] {
  const immutableNoteCallerNodes: ImmutableNoteCallerNode[] = [];

  function $traverse(node: LexicalNode) {
    if ($isImmutableNoteCallerNode(node)) immutableNoteCallerNodes.push(node);
    if (!$isElementNode(node)) return;

    const children = node.getChildren();
    children.forEach($traverse);
  }

  nodes.forEach($traverse);

  return immutableNoteCallerNodes;
}

/**
 * Inserts a note at the specified selection, e.g. footnote, cross-reference, endnote.
 * @param marker - The marker type for the note.
 * @param caller - Optional note caller to override the default for the given marker.
 * @param selectionRange - Optional selection range where the note should be inserted. By default it will
 *   use the current selection in the editor.
 * @param scriptureReference - Scripture reference for the note.
 * @param viewOptions - The current editor view options.
 * @param nodeOptions - The current editor node options.
 * @param logger - Logger instance.
 * @returns The inserted note node, or `undefined` if insertion failed.
 * @throws Will throw an error if the marker is not a valid note marker.
 */
export function $insertNote(
  marker: string,
  caller: string | undefined,
  selectionRange: SelectionRange | undefined,
  scriptureReference: ScriptureReference | undefined,
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): NoteNode | undefined {
  if (!NoteNode.isValidMarker(marker))
    throw new Error(`$insertNote: Invalid note marker '${marker}'`);

  const selection = selectionRange ? $getRangeFromUsjSelection(selectionRange) : $getSelection();
  if (!$isRangeSelection(selection)) return undefined;

  const children = $createNoteChildren(
    selection,
    marker,
    scriptureReference,
    viewOptions,
    nodeOptions,
    logger,
  );
  if (children === undefined) return undefined;

  const isCrossReference = marker.startsWith("x") || marker === "ex";
  const resolvedCaller =
    caller ??
    (isCrossReference
      ? (nodeOptions.defaultCrossRefCaller ?? "-")
      : (nodeOptions.defaultFootnoteCaller ?? "+"));

  const noteNode = $createWholeNote(
    marker,
    resolvedCaller,
    children,
    viewOptions,
    nodeOptions,
    undefined,
    undefined,
  );
  $insertNoteWithSelect(noteNode, selection, viewOptions);
  return noteNode;
}

/**
 * Whether notes BUILD collapsed under the given note mode: only `"expanded"` builds expanded
 * notes; `"collapsed"`, `"expandInline"`, and an unset mode all build collapsed ones (under
 * `expandInline` the NoteNodePlugin expands a note only while the caret is adjacent).
 *
 * This is the ONE predicate for constructing a note's collapsed flag and child layout — used at
 * document load (the platform adaptor's `createNote`) and at insert time (`$createWholeNote`,
 * `$insertNoteWithSelect`) so a freshly inserted note is indistinguishable from a loaded one.
 * When the two ever disagree, the flag and the layout drift apart (e.g. a collapsed-layout note
 * flagged expanded). Note: this governs CONSTRUCTION only — `$selectNote` intentionally uses a
 * different rule for expanding an existing note on selection.
 *
 * @param noteMode - The note display mode from the editor view options.
 * @returns `true` when notes are built collapsed under this mode.
 */
export function isCollapsedNoteMode(noteMode: NoteMode | undefined): boolean {
  return noteMode !== "expanded";
}

/**
 * The closing marker glyph a collapsed caret sits immediately before, when that glyph closes the
 * char span the caret is in — otherwise `undefined`.
 *
 * This is the one insertion point where Lexical's `selection.insertNodes()` SPLITS the enclosing
 * char span rather than inserting into it, because the caret is at a child boundary with nothing
 * but the closer beyond it. The split leaves a second span holding nothing but the orphaned
 * closing glyph, which the standard-view marker-edit engine reads as a span whose opener was
 * deleted and dissolves — taking the closer's bytes with it. A caret in the MIDDLE of the span's
 * text, or outside the span entirely, does not split it and needs none of this.
 *
 * Both spellings of the same boundary are recognized: the caret at the end of the span's content
 * text (a click at the end of the word) and the caret at offset 0 of the closing glyph itself
 * (an arrow-left back off the closer).
 *
 * Read-only: safe inside `editor.update()` or either read form.
 */
function $closingGlyphAfterCaret(selection: RangeSelection): MarkerNode | undefined {
  if (!selection.isCollapsed()) return undefined;
  const { anchor } = selection;
  if (anchor.type !== "text") return undefined;
  const node = anchor.getNode();
  if (!$isTextNode(node) || !$isCharNode(node.getParent())) return undefined;
  // MarkerNode extends TextNode, so the caret may be parked in the closing glyph itself.
  if ($isMarkerNode(node))
    return anchor.offset === 0 && node.getMarkerSyntax() === "closing" ? node : undefined;
  if (anchor.offset !== node.getTextContentSize()) return undefined;
  const next = node.getNextSibling();
  return $isMarkerNode(next) && next.getMarkerSyntax() === "closing" ? next : undefined;
}

/**
 * Insert note node at the given selection, and select the note content if expanded.
 *
 * Whether the note lands collapsed is `isCollapsedNoteMode` — the same predicate that governs
 * both the child structure and the collapsed flag when notes are built at document load — so a
 * freshly inserted note matches a loaded one.
 *
 * @param noteNode - The note node to insert.
 * @param selection - The selection where to insert the note.
 * @param viewOptions - The current editor view options.
 */
export function $insertNoteWithSelect(
  noteNode: NoteNode,
  selection: RangeSelection,
  viewOptions: ViewOptions | undefined,
) {
  const isCollapsed = isCollapsedNoteMode(viewOptions?.noteMode);
  noteNode.setIsCollapsed(isCollapsed);

  if (!selection.isCollapsed()) $moveSelectionToEnd(selection);

  // At a char span's content end, place the note explicitly rather than letting `insertNodes`
  // split the span there and strand its closing glyph (see `$closingGlyphAfterCaret`). The
  // resulting shape — note inside the span, ahead of the closer — is what re-tokenizing the
  // displayed bytes gives, and what a mid-content caret already produced.
  const closingGlyph = $closingGlyphAfterCaret(selection);
  if (closingGlyph) {
    closingGlyph.insertBefore(noteNode);
    noteNode.selectNext(0, 0); // caret past the note, where `insertNodes` leaves it
  } else {
    selection.insertNodes([noteNode]);
  }
  if (!isCollapsed) {
    const lastCharChild = noteNode.getChildren().reverse().find($isCharNode);
    lastCharChild?.selectEnd();
  }
}

/**
 * Build a single note-content char span matching the reverse adaptor's `createChar` output for
 * the active `markerMode`. In editable markerMode a char span MUST begin with its opening
 * MarkerNode glyph and carry a structural NBSP content prefix; otherwise the standard-view
 * marker-edit engine's `$charNodeDeletionTransform` treats it as "opener deleted" and
 * unwraps it back to plain text in the same commit — which was silently emptying freshly
 * inserted footnotes. `content === ""` yields the lone-NBSP empty-char placeholder (matching
 * `createChar`, which prepends the NBSP prefix only to real content, then adds the placeholder).
 */
function $createNoteContentChar(
  marker: string,
  content: string,
  viewOptions: ViewOptions,
): CharNode {
  const char = $createCharNode(marker);
  // Note-content chars are built without their own closing markers, i.e. they are implicitly
  // closed — exactly what ParatextData records as closed="false" (near universal on \fr/\ft/
  // \xo/\xt). Carrying the flag from creation keeps these nodes signature-identical to what
  // Tier-2 re-tokenization produces (the rebuild's fixed-point refusal depends on that) and
  // round-trips the correct USJ shape.
  char.setUnknownAttributes({ closed: "false" });
  const isEditable = viewOptions?.markerMode === "editable";
  if (isEditable) char.append($createMarkerNode(marker));
  // Visible marker mode shows a bare opening glyph inside the span, matching `createChar` in
  // the load adaptor (implicitly-closed note-content chars get no closer there either).
  else if (viewOptions?.markerMode === "visible")
    char.append($createImmutableTypedTextNode("marker", openingMarkerText(marker)));
  const text = content === "" ? EMPTY_CHAR_PLACEHOLDER_TEXT : isEditable ? NBSP + content : content;
  char.append($createTextNode(text));
  return char;
}

export function $createNoteChildren(
  selection: RangeSelection,
  marker: string,
  scriptureReference: ScriptureReference | undefined,
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): LexicalNode[] | undefined {
  const children: LexicalNode[] = [];
  const { chapterNum, verseNum, verse } = scriptureReference ?? {};
  const chapterVerseSeparator = nodeOptions.chapterVerseSeparator ?? ":";
  const verseRangeSeparator = nodeOptions.verseRangeSeparator ?? "-";
  // `verse` (e.g. "16-18") is only populated for a verse bridge; replace the raw "-" bridge
  // separator with the project's configured verseRangeSeparator (PT9 `GetFormattedVerse`).
  const referenceText =
    chapterNum !== undefined && verseNum !== undefined
      ? `${chapterNum}${chapterVerseSeparator}${(verse ?? `${verseNum}`).replace(/-/g, verseRangeSeparator)} `
      : undefined;

  switch (marker) {
    case "f":
    case "fe":
    case "ef":
    case "efe":
      if (referenceText !== undefined) {
        children.push($createNoteContentChar("fr", referenceText, viewOptions));
      }
      if (!selection.isCollapsed()) {
        const quotation = $stripSelectionToQuotation(selection);
        if (quotation.length > 0) {
          children.push($createNoteContentChar("fq", quotation, viewOptions));
        }
      }
      children.push($createNoteContentChar("ft", "", viewOptions));
      break;
    case "x":
    case "ex":
      if (referenceText !== undefined) {
        children.push($createNoteContentChar("xo", referenceText, viewOptions));
      }
      if (!selection.isCollapsed()) {
        const quotation = $stripSelectionToQuotation(selection);
        if (quotation.length > 0) {
          children.push($createNoteContentChar("xq", quotation, viewOptions));
        }
      }
      children.push($createNoteContentChar("xt", "", viewOptions));
      break;
    default:
      logger?.warn(`$createNoteChildren: Unsupported note marker '${marker}'`);
      return undefined;
  }

  return children;
}

/**
 * Creates a note node including children with the given parameters.
 * @param marker - The marker for the note.
 * @param caller - The caller for the note.
 * @param contentNodes - The content nodes for the note.
 * @param viewOptions - The view options for the note.
 * @param nodeOptions - The node options for the note.
 * @param segment - The segment for the note.
 * @param closed - The source `closed` attribute (`"false"` for an unterminated note). Unclosed
 *   notes render expanded inline (PT9 `opennote`) regardless of `noteMode`. `undefined` (the
 *   default for freshly inserted notes) behaves as closed.
 * @returns The created note node.
 */
// Keep this function updated with logic from
// `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` > `createNote`
export function $createWholeNote(
  marker: string,
  caller: string | undefined,
  contentNodes: LexicalNode[],
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  segment?: string,
  closed?: string,
) {
  // Unclosed notes (closed="false") render expanded inline (PT9 `opennote`); only closed
  // notes honor noteMode collapse.
  const isUnclosed = closed === "false";
  const isCollapsed = isUnclosed ? false : isCollapsedNoteMode(viewOptions?.noteMode);
  const note = $createNoteNode(marker, caller, isCollapsed);
  if (segment) $setState(note, segmentState, () => segment);

  let openingMarkerNode: MarkerNode | ImmutableTypedTextNode | undefined;
  let closingMarkerNode: MarkerNode | ImmutableTypedTextNode | undefined;
  if (viewOptions?.markerMode === "editable") {
    openingMarkerNode = $createMarkerNode(marker);
    // An unclosed note has no closer to display.
    if (!isUnclosed) closingMarkerNode = $createMarkerNode(marker, "closing");
  } else if (viewOptions?.markerMode === "visible") {
    // Same glyph text shapes as the load path (`createNote`): opening glyph with a plain
    // trailing space, closer bare. Glyphs are presentation-only (never serialized), so a
    // reloaded note shows the load path's shape — an inserted note must look identical.
    openingMarkerNode = $createImmutableTypedTextNode("marker", openingMarkerText(marker) + " ");
    if (!isUnclosed)
      closingMarkerNode = $createImmutableTypedTextNode("marker", closingMarkerText(marker));
  }

  let callerNode: ImmutableNoteCallerNode | TextNode;
  if (openingMarkerNode) note.append(openingMarkerNode);
  // Expanded layout whenever the note is expanded (either noteMode expanded OR unclosed).
  // Unlike the load path (`createNote`, usj-editor.adaptor), no `\cat` category run is built
  // here: this constructs NEW notes, which never carry a category at insert time — there is no
  // category input on the insert path. A category acquired later heals its run through the
  // shared display-run sync.
  if (viewOptions?.markerMode === "editable" && !isCollapsed) {
    if (caller === "") note.append(...contentNodes);
    else {
      callerNode = $createTextNode(getEditableCallerText(note.__caller));
      note.append(callerNode, ...contentNodes);
    }
  } else {
    // The engine-owned NBSP separators of a collapsed note's layout, in the same tagged token
    // shape as the para-marker prefix separator (and as the load path's `createNote` builds
    // them): a bare NBSP TextNode merged into adjacent plain content on the first normalization
    // pass, after which serialization's exact-NBSP drop could no longer see the separator and
    // one display byte leaked into USJ as a data space.
    const $createSpaceNodeFn = () => $createMarkerTrailingSeparator();
    const spacedContentNodes = contentNodes.flatMap($addSpaceNodes($createSpaceNodeFn));
    if (caller === "") note.append(...spacedContentNodes);
    else {
      const previewText = $getNoteCallerPreviewText(contentNodes);
      let onClick: NoteCallerOnClick = () => undefined;
      if (nodeOptions?.noteCallerOnClick) {
        onClick = nodeOptions.noteCallerOnClick;
      }
      callerNode = $createImmutableNoteCallerNode(note.__caller, previewText, onClick);
      note.append(callerNode, $createSpaceNodeFn(), ...spacedContentNodes);
    }
  }
  if (closingMarkerNode) note.append(closingMarkerNode);

  return note;
}

/**
 * Gets the note using the editor key or at the specified note index.
 * @param noteKeyOrIndex - The note key or index, e.g. 1 would select the second note in the editor.
 * @returns The note at the specified index, or `undefined` if not found.
 */
export function $getNoteByKeyOrIndex(noteKeyOrIndex: string | number): NoteNode | undefined {
  if (typeof noteKeyOrIndex === "string") {
    const node = $getNodeByKey(noteKeyOrIndex);
    if (!$isNoteNode(node)) return;
    return node;
  }

  const dfsNodes = $dfs();
  if (dfsNodes.length <= 0) return;

  const dfsNotes = dfsNodes.filter((dfsNode) => $isNoteNode(dfsNode.node));
  const note = dfsNotes[noteKeyOrIndex]?.node;
  if (!$isNoteNode(note)) return;

  return note;
}

/**
 * Selects the given note node, expanding or collapsing it based on the current view options.
 *
 * Deliberately NOT `isCollapsedNoteMode` (nor its inverse): that predicate is for CONSTRUCTING
 * notes, where `expandInline` builds collapsed. Here the user is navigating INTO the note, so
 * `expandInline` must expand it (the caret is about to be adjacent — the same condition under
 * which the NoteNodePlugin keeps it open); only an always-`"collapsed"` mode keeps it closed.
 *
 * @param noteNode - The note node to select.
 * @param viewOptions - The current editor view options.
 */
export function $selectNote(noteNode: NoteNode, viewOptions: ViewOptions | undefined) {
  const isCollapsed = viewOptions?.noteMode === "collapsed";
  noteNode.setIsCollapsed(isCollapsed);
  if (isCollapsed) {
    const nodeBefore = noteNode.getPreviousSibling();
    if ($isImmutableVerseNode(nodeBefore) || !nodeBefore) {
      const parent = noteNode.getParent();
      if (parent) {
        const nodeIndex = noteNode.getIndexWithinParent();
        parent.select(nodeIndex, nodeIndex);
      }
    } else nodeBefore.selectEnd();
  } else {
    const lastCharChild = noteNode.getChildren().reverse().find($isCharNode);
    lastCharChild?.selectEnd();
  }
}

/** Add the given space node after each child node */
function $addSpaceNodes(
  $createSpaceNodeFn: () => TextNode,
): (
  this: undefined,
  value: LexicalNode,
  index: number,
  array: LexicalNode[],
) => LexicalNode | readonly LexicalNode[] {
  return (node) => {
    if ($isImmutableTypedTextNode(node)) return [node];
    return [node, $createSpaceNodeFn()];
  };
}

/**
 * Returns `true` when `node` is inside a NoteNode (i.e. an existing footnote/cross-reference
 * embedded in the selected body text) — its entire content, markers included, must be dropped.
 * `selection.getNodes()` flattens a NoteNode's descendants into the returned list alongside the
 * note itself, so skipping just the NoteNode entry is not enough; every descendant must also be
 * excluded by walking its ancestor chain.
 */
function $isInsideNote(node: LexicalNode): boolean {
  let parent = node.getParent();
  while (parent) {
    if ($isNoteNode(parent)) return true;
    parent = parent.getParent();
  }
  return false;
}

/**
 * TS port of PT9 `RemoveMarkersAndFootnotes(text, isFootnote=true)`
 * (`UsfmSnippetInserter.cs:444-489`): builds a footnote/cross-reference quotation (`\fq`/`\xq`)
 * from a selection over body text — plain text only, with USFM markers and any nested
 * notes stripped, and embedded verse numbers converted to `\+fv <number>\+fv*`.
 *
 * Endpoint handling: Lexical's `RangeSelection.getNodes()` returns whole boundary nodes even for
 * a partial selection, so the first/last selected plain TextNode is sliced to the
 * anchor/focus offset here — reusing Lexical's own `$getCharacterOffsets` (which normalizes
 * "element"-type points, e.g. a whole-paragraph `select(0, childrenSize)`, to real character
 * offsets) and the same anchor/focus-order slicing Lexical's `RangeSelection.getTextContent()`
 * uses internally, rather than raw `.offset` values (a raw element-point offset is a child
 * index, not a character offset, and slicing with it truncates the last node's text).
 *
 * @param selection - The selection to build the quotation from.
 * @returns The stripped, trimmed quotation text.
 */
export function $stripSelectionToQuotation(selection: RangeSelection): string {
  if (!$isRangeSelection(selection)) return "";

  const nodes = selection.getNodes();
  if (nodes.length === 0) return "";

  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const isBefore = selection.anchor.isBefore(selection.focus);
  const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);

  let result = "";
  for (const node of nodes) {
    if ($isNoteNode(node) || $isImmutableNoteCallerNode(node) || $isInsideNote(node)) continue;
    if ($isMarkerNode(node)) continue;

    // Check VerseNode before TextNode: in editable markerMode a VerseNode IS a TextNode
    // subclass, so a TextNode-first check would emit its raw glyph text instead of `\+fv`.
    if ($isVerseNode(node)) {
      result += `\\+fv ${node.getNumber()}\\+fv*`;
      continue;
    }

    if ($isTextNode(node)) {
      let text = node.getTextContent();
      if (node === firstNode && node === lastNode) {
        text =
          anchorOffset < focusOffset
            ? text.slice(anchorOffset, focusOffset)
            : text.slice(focusOffset, anchorOffset);
      } else if (node === firstNode) {
        text = isBefore ? text.slice(anchorOffset) : text.slice(focusOffset);
      } else if (node === lastNode) {
        text = isBefore ? text.slice(0, focusOffset) : text.slice(0, anchorOffset);
      }
      result += text;
    }
  }

  return result.replace(/\s+/g, " ").trim();
}
