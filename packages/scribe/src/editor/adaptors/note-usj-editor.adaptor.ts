import {
  BookCode,
  MarkerContent,
  MarkerObject,
  USJ_TYPE,
  USJ_VERSION,
  Usj,
} from "@eten-tech-foundation/scripture-utilities";
import { MarkNode, SerializedMarkNode } from "@lexical/mark";
import {
  LineBreakNode,
  SerializedEditorState,
  SerializedLexicalNode,
  SerializedLineBreakNode,
  SerializedTextNode,
  TextModeType,
  TextNode,
} from "lexical";
import {
  BOOK_MARKER,
  BOOK_VERSION,
  BookMarker,
  BookNode,
  CHAPTER_MARKER,
  CHAPTER_VERSION,
  ChapterMarker,
  ChapterNode,
  CHAR_VERSION,
  CharNode,
  EditorAdaptor,
  ENDING_MS_COMMENT_MARKER,
  getEditableCallerText,
  getPreviewTextFromSerializedNodes,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  IMMUTABLE_CHAPTER_VERSION,
  ImmutableChapterNode,
  IMPLIED_PARA_VERSION,
  ImpliedParaNode,
  isMilestoneCommentMarker,
  isSerializedTextNode,
  LoggerBasic,
  MarkerNode,
  MILESTONE_VERSION,
  MilestoneNode,
  NBSP,
  NOTE_VERSION,
  NoteNode,
  PARA_MARKER_DEFAULT,
  PARA_VERSION,
  ParaNode,
  removeUndefinedProperties,
  SerializedBookNode,
  SerializedChapterNode,
  SerializedCharNode,
  SerializedImmutableChapterNode,
  SerializedImpliedParaNode,
  SerializedMarkerNode,
  SerializedMilestoneNode,
  SerializedNoteNode,
  SerializedParaNode,
  SerializedUnknownNode,
  SerializedVerseNode,
  STARTING_MS_COMMENT_MARKER,
  UNKNOWN_VERSION,
  UnknownNode,
  VERSE_MARKER,
  VERSE_VERSION,
  VerseMarker,
  VerseNode,
} from "shared";
import {
  CallerData,
  getDefaultViewOptions,
  getVerseNodeClass,
  IMMUTABLE_NOTE_CALLER_VERSION,
  IMMUTABLE_VERSE_VERSION,
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  OnClick,
  SerializedImmutableNoteCallerNode,
  SerializedImmutableVerseNode,
  UsjNodeOptions,
  ViewOptions,
} from "shared-react";

interface UsjNoteEditorAdapter extends EditorAdaptor {
  initialize: typeof initialize;
  reset: typeof reset;
  serializeEditorState: typeof serializeEditorState;
}

const serializedLineBreakNode: SerializedLineBreakNode = {
  type: LineBreakNode.getType(),
  version: 1,
};
const callerData: CallerData = {
  /** Count used for note callers. */
  count: 0,
};

/** View options - view mode parameters */
let _viewOptions: ViewOptions | undefined;
/** Options for each node */
let _nodeOptions: UsjNodeOptions | undefined;
/** Logger instance */
let _logger: LoggerBasic | undefined;

export function initialize(
  nodeOptions: UsjNodeOptions | undefined,
  logger: LoggerBasic | undefined,
) {
  setNodeOptions(nodeOptions);
  setLogger(logger);
}

export function reset(callerCountValue = 0) {
  //Reset the caller count used for note callers.
  callerData.count = callerCountValue;
}

function getNotesFromUsj(usjContent: MarkerContent[]) {
  const notes: MarkerObject[] = [];
  usjContent.forEach((content) => {
    if (typeof content !== "string") {
      content.content?.forEach((note) => {
        if (typeof note !== "string" && note.type === "note") {
          notes.push(note);
        }
      });
    }
  });
  return notes;
}

export function serializeEditorState(
  usj: Usj | undefined,
  viewOptions?: ViewOptions,
): SerializedEditorState {
  // use default view options if no `viewOptions`
  _viewOptions = viewOptions ?? getDefaultViewOptions();
  /** empty para node for an 'empty' editor */
  const emptyParaNode: SerializedParaNode = createPara({
    type: ParaNode.getType(),
    marker: PARA_MARKER_DEFAULT,
  });
  let children: SerializedLexicalNode[];
  if (usj) {
    if (usj.type !== USJ_TYPE)
      _logger?.warn(`This USJ type '${usj.type}' didn't match the expected type '${USJ_TYPE}'.`);
    if (usj.version !== USJ_VERSION)
      _logger?.warn(
        `This USJ version '${usj.version}' didn't match the expected version '${USJ_VERSION}'.`,
      );

    const notes = getNotesFromUsj(usj.content);
    if (notes.length > 0) children = insertImpliedNotes(recurseNodes(notes));
    else children = [emptyParaNode];
  } else {
    children = [emptyParaNode];
  }

  return {
    root: {
      children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

/**
 * Set the node options.
 * @param nodeOptions - Node options.
 */
function setNodeOptions(nodeOptions: UsjNodeOptions | undefined) {
  if (nodeOptions) _nodeOptions = nodeOptions;
}

/**
 * Set the logger to use if needed when loading Scripture data to editor state.
 * @param logger - Logger to use.
 */
function setLogger(logger: LoggerBasic | undefined) {
  if (logger) _logger = logger;
}

function getTextContent(markers: MarkerContent[] | undefined): string {
  if (!markers || markers.length !== 1 || typeof markers[0] !== "string") return "";

  return markers[0];
}

function createBook(markerObject: MarkerObject): SerializedBookNode {
  const { marker, code } = markerObject;
  if (marker !== BOOK_MARKER) {
    _logger?.warn(`Unexpected book marker '${marker}'!`);
  }
  if (!code || !BookNode.isValidBookCode(code)) {
    _logger?.warn(`Unexpected book code '${code}'!`);
  }
  const unknownAttributes = getUnknownAttributes(markerObject);

  return removeUndefinedProperties({
    type: BookNode.getType(),
    marker: marker as BookMarker,
    code: code ?? ("" as BookCode),
    unknownAttributes,
    children: [createText(getTextContent(markerObject.content))],
    direction: null,
    format: "",
    indent: 0,
    version: BOOK_VERSION,
  });
}

function createChapter(
  markerObject: MarkerObject,
): SerializedChapterNode | SerializedImmutableChapterNode {
  const { marker, number, sid, altnumber, pubnumber } = markerObject;
  if (marker !== CHAPTER_MARKER) {
    _logger?.warn(`Unexpected chapter marker '${marker}'!`);
  }
  const unknownAttributes = getUnknownAttributes(markerObject);
  let showMarker: boolean | undefined;
  if (_viewOptions?.markerMode === "visible") showMarker = true;

  return _viewOptions?.markerMode === "editable"
    ? removeUndefinedProperties({
        type: ChapterNode.getType(),
        marker: marker as ChapterMarker,
        number: number ?? "",
        sid,
        altnumber,
        pubnumber,
        unknownAttributes,
        children: [createText(getVisibleOpenMarkerText(marker, number) ?? "")],
        direction: null,
        format: "",
        indent: 0,
        version: CHAPTER_VERSION,
      })
    : removeUndefinedProperties({
        type: ImmutableChapterNode.getType(),
        marker: marker as ChapterMarker,
        number: number ?? "",
        showMarker,
        sid,
        altnumber,
        pubnumber,
        unknownAttributes,
        version: IMMUTABLE_CHAPTER_VERSION,
      });
}

function createVerse(
  markerObject: MarkerObject,
): SerializedVerseNode | SerializedImmutableVerseNode {
  const { marker, number, sid, altnumber, pubnumber } = markerObject;
  if (marker !== VERSE_MARKER) {
    _logger?.warn(`Unexpected verse marker '${marker}'!`);
  }
  const VerseNodeClass = getVerseNodeClass(_viewOptions) ?? ImmutableVerseNode;
  const type = VerseNodeClass.getType();
  const version = _viewOptions?.markerMode === "editable" ? VERSE_VERSION : IMMUTABLE_VERSE_VERSION;
  let text: string | undefined;
  let showMarker: boolean | undefined;
  if (_viewOptions?.markerMode === "editable") text = getVisibleOpenMarkerText(marker, number);
  else if (_viewOptions?.markerMode === "visible") showMarker = true;
  const unknownAttributes = getUnknownAttributes(markerObject);

  return removeUndefinedProperties({
    type,
    text,
    marker: marker as VerseMarker,
    number: number ?? "",
    sid,
    altnumber,
    pubnumber,
    showMarker,
    unknownAttributes,
    version,
  });
}

function createChar(
  markerObject: MarkerObject,
  childNodes: SerializedLexicalNode[] = [],
): SerializedCharNode {
  const { marker } = markerObject;
  if (!CharNode.isValidMarker(marker)) {
    _logger?.warn(`Unexpected char marker '${marker}'!`);
  }
  if (_viewOptions?.markerMode === "visible" || _viewOptions?.markerMode === "editable")
    childNodes.forEach((node) => {
      if (isSerializedTextNode(node)) node.text = NBSP + node.text;
    });
  const unknownAttributes = getUnknownAttributes(markerObject);

  return removeUndefinedProperties({
    type: CharNode.getType(),
    marker,
    unknownAttributes,
    children: [...childNodes],
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    version: CHAR_VERSION,
  });
}

function createImpliedPara(children: SerializedLexicalNode[]): SerializedImpliedParaNode {
  return {
    type: ImpliedParaNode.getType(),
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    version: IMPLIED_PARA_VERSION,
  };
}

function createPara(
  markerObject: MarkerObject,
  childNodes: SerializedLexicalNode[] = [],
): SerializedParaNode {
  const { marker } = markerObject;
  if (!ParaNode.isValidMarker(marker)) {
    _logger?.warn(`Unexpected para marker '${marker}'!`);
  }
  const children: SerializedLexicalNode[] = [];
  if (_viewOptions?.markerMode === "editable")
    children.push(createMarker(marker), createText(NBSP));
  children.push(...childNodes);
  const unknownAttributes = getUnknownAttributes(markerObject);

  return removeUndefinedProperties({
    type: ParaNode.getType(),
    marker,
    unknownAttributes,
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    version: PARA_VERSION,
  });
}

function createNoteCaller(
  caller: string,
  childNodes: SerializedLexicalNode[],
): SerializedImmutableNoteCallerNode {
  const previewText = getPreviewTextFromSerializedNodes(childNodes);
  let onClick: OnClick = () => undefined;
  if (_nodeOptions?.noteCallerOnClick) onClick = _nodeOptions.noteCallerOnClick;

  return removeUndefinedProperties({
    type: ImmutableNoteCallerNode.getType(),
    caller,
    previewText,
    onClick,
    version: IMMUTABLE_NOTE_CALLER_VERSION,
  });
}

function createNote(
  markerObject: MarkerObject,
  childNodes: SerializedLexicalNode[],
): SerializedNoteNode {
  const { marker, category } = markerObject;
  if (!NoteNode.isValidMarker(marker)) _logger?.warn(`Unexpected note marker '${marker}'!`);
  const caller = markerObject.caller ?? "*";
  let callerNode: SerializedImmutableNoteCallerNode | SerializedTextNode;
  if (_viewOptions?.markerMode === "editable") {
    callerNode = createText(getEditableCallerText(caller));
  } else {
    callerNode = createNoteCaller(caller, childNodes);
  }
  const unknownAttributes = getUnknownAttributes(markerObject);

  let openingMarkerNode: SerializedTextNode | undefined;
  let closingMarkerNode: SerializedTextNode | undefined;
  if (_viewOptions?.markerMode === "visible" || _viewOptions?.markerMode === "editable") {
    openingMarkerNode = createMarker(marker);
    closingMarkerNode = createMarker(marker, false);
  }
  const children: SerializedLexicalNode[] = [];
  if (openingMarkerNode) children.push(openingMarkerNode);
  children.push(callerNode, ...childNodes);
  if (closingMarkerNode) children.push(closingMarkerNode);

  return removeUndefinedProperties({
    type: NoteNode.getType(),
    marker,
    caller,
    category,
    unknownAttributes,
    children,
    direction: null,
    format: "",
    indent: 0,
    version: NOTE_VERSION,
  });
}

function createMilestone(markerObject: MarkerObject): SerializedMilestoneNode {
  const { marker, sid, eid } = markerObject;
  if (!marker || !MilestoneNode.isValidMarker(marker)) {
    _logger?.warn(`Unexpected milestone marker '${marker}'!`);
  }
  const unknownAttributes = getUnknownAttributes(markerObject);

  return removeUndefinedProperties({
    type: MilestoneNode.getType(),
    marker,
    sid,
    eid,
    unknownAttributes,
    version: MILESTONE_VERSION,
  });
}

function createMark(children: SerializedLexicalNode[], ids: string[] = []): SerializedMarkNode {
  return {
    type: MarkNode.getType(),
    ids,
    children,
    direction: null,
    format: "",
    indent: 0,
    version: 1,
  };
}

function createUnknown(
  markerObject: MarkerObject,
  childNodes: SerializedLexicalNode[],
): SerializedUnknownNode {
  const { marker } = markerObject;
  const tag = markerObject.type;
  const unknownAttributes = getUnknownAttributes(markerObject);
  const children: SerializedLexicalNode[] = [...childNodes];
  return removeUndefinedProperties({
    type: UnknownNode.getType(),
    tag,
    marker,
    unknownAttributes,
    children,
    direction: null,
    format: "",
    indent: 0,
    version: UNKNOWN_VERSION,
  });
}

function createMarker(marker: string, isOpening = true): SerializedMarkerNode {
  return {
    type: MarkerNode.getType(),
    marker,
    isOpening,
    text: "",
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    version: 1,
  };
}

function createText(text: string, mode: TextModeType = "normal"): SerializedTextNode {
  return {
    type: TextNode.getType(),
    text,
    detail: 0,
    format: 0,
    mode,
    style: "",
    version: 1,
  };
}

function addOpeningMarker(marker: string, nodes: SerializedLexicalNode[]) {
  if (_viewOptions?.markerMode === "visible" || _viewOptions?.markerMode === "editable") {
    nodes.push(createMarker(marker));
  }
}

function addClosingMarker(marker: string, nodes: SerializedLexicalNode[]) {
  if (
    (_viewOptions?.markerMode === "visible" || _viewOptions?.markerMode === "editable") &&
    !(CharNode.isValidFootnoteMarker(marker) || CharNode.isValidCrossReferenceMarker(marker))
  ) {
    nodes.push(createMarker(marker, false));
  }
}

function reIndex(indexes: number[], offset: number): number[] {
  if (indexes.length <= 0 || offset === 0) return indexes;

  return indexes.map((index) => index - offset);
}

function removeValueFromArray<T>(arr: T[], value: T) {
  const index = arr.indexOf(value, 0);
  if (index > -1) {
    arr.splice(index, 1);
  }
}

function updateSids(sids: string[], msMarkNode: SerializedMilestoneNode) {
  if (msMarkNode.marker === STARTING_MS_COMMENT_MARKER && msMarkNode.sid !== undefined)
    sids.push(msMarkNode.sid);
  if (msMarkNode.marker === ENDING_MS_COMMENT_MARKER && msMarkNode.eid !== undefined)
    removeValueFromArray(sids, msMarkNode.eid);
}

function insertMilestoneMarksRecurse(
  nodes: SerializedLexicalNode[],
  msMarkIndexes: number[],
  isPreviousMsStarting = false,
  sids: string[] = [],
): SerializedLexicalNode[] {
  if (msMarkIndexes.length <= 0 || msMarkIndexes[0] >= nodes.length) return nodes;

  const firstIndex = msMarkIndexes.shift();
  const secondIndex = msMarkIndexes.length > 0 ? msMarkIndexes.shift() : nodes.length - 1;
  if (!firstIndex || !secondIndex) return nodes;

  const startNodes = nodes.slice(0, firstIndex);
  const nodesBefore = isPreviousMsStarting ? [createMark(startNodes, [...sids])] : startNodes;
  const firstMSMarkNode = nodes[firstIndex] as SerializedMilestoneNode;
  updateSids(sids, firstMSMarkNode);
  const markedNodes = insertMilestoneMarksRecurse(
    nodes.slice(firstIndex + 1, secondIndex),
    reIndex(msMarkIndexes, firstIndex + 1),
    firstMSMarkNode.marker === STARTING_MS_COMMENT_MARKER,
    sids,
  );
  const markNode = createMark(markedNodes, [...sids]);
  const secondMSMarkNode = nodes[secondIndex] as SerializedMilestoneNode;
  updateSids(sids, secondMSMarkNode);
  const nodesAfter = insertMilestoneMarksRecurse(
    nodes.slice(secondIndex + 1),
    reIndex(msMarkIndexes, secondIndex + 1),
    secondMSMarkNode.marker === STARTING_MS_COMMENT_MARKER,
    sids,
  );
  return [...nodesBefore, firstMSMarkNode, markNode, secondMSMarkNode, ...nodesAfter];
}

function recurseNodes(markers: MarkerContent[] | undefined): SerializedLexicalNode[] {
  const msMarkIndexes: number[] = [];
  const nodes: SerializedLexicalNode[] = [];
  markers?.forEach((markerContent) => {
    if (typeof markerContent === "string") {
      nodes.push(createText(markerContent));
    } else if (!markerContent.type) {
      _logger?.error(`Marker type is missing!`);
    } else {
      switch (markerContent.type) {
        case BookNode.getType():
          nodes.push(createBook(markerContent));
          break;
        case ChapterNode.getType():
          nodes.push(createChapter(markerContent));
          break;
        case VerseNode.getType():
          if (!_viewOptions?.hasSpacing) nodes.push(serializedLineBreakNode);
          nodes.push(createVerse(markerContent));
          break;
        case CharNode.getType():
          addOpeningMarker(markerContent.marker, nodes);
          nodes.push(createChar(markerContent, recurseNodes(markerContent.content)));
          addClosingMarker(markerContent.marker, nodes);
          break;
        case ParaNode.getType():
          nodes.push(createPara(markerContent, recurseNodes(markerContent.content)));
          break;
        case NoteNode.getType():
          nodes.push(createNote(markerContent, recurseNodes(markerContent.content)));
          break;
        case MilestoneNode.getType():
          if (isMilestoneCommentMarker(markerContent.marker)) msMarkIndexes.push(nodes.length);
          nodes.push(createMilestone(markerContent));
          break;
        default:
          _logger?.warn(`Unknown type-marker '${markerContent.type}-${markerContent.marker}'!`);
          nodes.push(createUnknown(markerContent, recurseNodes(markerContent.content)));
      }
    }
  });
  return insertMilestoneMarksRecurse(nodes, msMarkIndexes);
}

/**
 * Insert implied paras around any other set of nodes that contain a text element at the root.
 * @param nodes - Serialized nodes.
 * @returns nodes with any needed implied paras inserted.
 */
function insertImpliedNotes(nodes: SerializedLexicalNode[]): SerializedLexicalNode[] {
  const impliedNoteNodes = nodes.map((node) => createImpliedPara([node]));
  return impliedNoteNodes;
}

const usjNoteEditorAdapter: UsjNoteEditorAdapter = {
  initialize,
  reset,
  serializeEditorState,
};
export default usjNoteEditorAdapter;
