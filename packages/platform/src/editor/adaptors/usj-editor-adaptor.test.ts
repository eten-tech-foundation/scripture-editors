// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { removeNoteCallerOnClick } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  CHAPTER_1_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  NOTE_CALLER_INDEX,
  NOTE_INDEX,
  NOTE_PARA_INDEX,
  NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
  VERSE_PARA_INDEX,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import { serializeEditorState, reset, initialize } from "./usj-editor.adaptor";
import { EMPTY_USJ, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { SerializedLexicalNode } from "lexical";
import {
  closingMarkerText,
  getEditableCallerText,
  isSerializedBookNode,
  isSerializedImmutableChapterNode,
  isSerializedImmutableTypedTextNode,
  isSerializedNoteNode,
  isSerializedParaNode,
  isSerializedCharNode,
  isSerializedTextNode,
  NBSP,
  openingMarkerText,
  SerializedNoteNode,
  SerializedParaNode,
  isSerializedMarkerNode,
} from "shared";
import {
  defaultNoteCallers,
  getDefaultViewOptions,
  getViewOptions,
  SerializedImmutableNoteCallerNode,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
  isSomeSerializedVerseNode,
  isSerializedImmutableVerseNode,
  isSerializedImmutableNoteCallerNode,
} from "shared-react";
import { MockInstance } from "vitest";

describe("USJ Editor Adaptor", () => {
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    // Spy on console methods before each test and provide mock implementations
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Restore console methods after each test to their original implementations
    consoleWarnSpy.mockRestore();
  });

  it("should convert from undefined USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(undefined);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from empty USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(EMPTY_USJ);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from USJ to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjGen1v1);

    const note = (serializedEditorState.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    expect(typeof noteCaller.onClick).toBe("function");
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateGen1v1);
  });

  it("should convert from USJ with empty implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedParaEmpty);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedParaEmpty);
  });

  it("should convert from USJ with implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedPara);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedPara);
  });

  it("should convert from USJ with nonstandard features to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1Nonstandard);

    expect(serializedEditorState).toEqual(editorStateGen1v1Nonstandard);
  });

  it("should convert from USJ to Lexical editor state JSON in visible marker mode", () => {
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleView);

    // Book marker rendered as typed-text marker with code and NBSP
    const book = serializedEditorState.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const bookMarker = book.children?.[0];
    if (!isSerializedImmutableTypedTextNode(bookMarker)) throw new Error("No book marker found");
    expect(bookMarker.textType).toBe("marker");
    expect(bookMarker.text).toBe(`${openingMarkerText("id")} GEN${NBSP}`);

    // Chapter is immutable with showMarker flag
    const chapter = serializedEditorState.root.children[CHAPTER_1_INDEX];
    if (!isSerializedImmutableChapterNode(chapter)) throw new Error("No chapter node found");
    expect(chapter.showMarker).toBe(true);

    // Para 'p' begins with a typed-text marker and NBSP
    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pFirst = pPara.children?.[0];
    if (!isSerializedImmutableTypedTextNode(pFirst)) throw new Error("No para marker found");
    expect(pFirst.textType).toBe("marker");
    expect(pFirst.text).toBe(`${openingMarkerText("p")}${NBSP}`);

    // Verse is immutable with showMarker flag
    const verse2 = pPara.children.find(
      (n: SerializedLexicalNode) => isSerializedImmutableVerseNode(n) && n.number === "2",
    );
    if (!isSerializedImmutableVerseNode(verse2)) throw new Error("Verse 2 not found");
    expect(verse2.showMarker).toBe(true);

    // Note has typed-text markers for open/close and immutable caller
    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX];
    if (!isSerializedParaNode(notePara)) throw new Error("No note para node found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    const noteChildren = note.children;
    const noteOpening = noteChildren[0];
    if (!isSerializedImmutableTypedTextNode(noteOpening)) throw new Error("No note opening marker");
    expect(noteOpening.textType).toBe("marker");
    expect(noteOpening.text).toBe(`${openingMarkerText("f")}${NBSP}`);
    const noteCaller = noteChildren[1];
    expect(isSerializedImmutableNoteCallerNode(noteCaller)).toBe(true);
    // Closing marker at the end with NBSP
    const noteClosing = noteChildren[noteChildren.length - 1];
    if (!isSerializedImmutableTypedTextNode(noteClosing)) throw new Error("No note closing marker");
    expect(noteClosing.textType).toBe("marker");
    expect(noteClosing.text).toBe(`${closingMarkerText("f")}${NBSP}`);

    // Note inner char 'fr' is preceded by a typed marker and its text is NBSP-prefixed
    const frOpen = noteChildren.find(
      (n) =>
        isSerializedImmutableTypedTextNode(n) &&
        n.textType === "marker" &&
        n.text.startsWith(openingMarkerText("fr")),
    );
    expect(!!frOpen).toBe(true);
    const frChar = noteChildren.find((n) => isSerializedCharNode(n) && n.marker === "fr");
    const frFirst = isSerializedCharNode(frChar) ? frChar.children?.[0] : undefined;
    expect(isSerializedTextNode(frFirst) && frFirst.text.startsWith(NBSP)).toBe(false);
  });

  it("should add line breaks before verses when visible mode has no spacing", () => {
    const visibleCompact: ViewOptions = {
      markerMode: "visible",
      hasSpacing: false,
      isFormattedFont: false,
    };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleCompact);

    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pChildren: SerializedLexicalNode[] = pPara.children;
    const idxVerse2 = pChildren.findIndex((n) => isSomeSerializedVerseNode(n) && n.number === "2");
    expect(idxVerse2).toBeGreaterThan(0);
    expect(pChildren[idxVerse2 - 1].type).toBe("linebreak");
  });

  it("should convert from USJ to Lexical editor state JSON in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    expect(serializedEditorState).toEqual(editorStateGen1v1Editable);
  });

  it("should render editable caller text and markers in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    const editableNoteParaNode = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(editableNoteParaNode)) throw new Error("Editable para not found");
    const noteNode = editableNoteParaNode.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(noteNode)) throw new Error("Editable note not found");
    const noteChildren = noteNode.children;
    // opening marker node for note
    expect(isSerializedMarkerNode(noteChildren[0])).toBe(true);
    // caller is editable text
    const callerNode = noteChildren[1];
    if (!isSerializedTextNode(callerNode)) throw new Error("Caller text not found");
    expect(callerNode.text).toBe(getEditableCallerText("+"));
    // closing marker node for note appears later
    const hasClosingMarker = noteChildren.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(true);
  });

  it("should convert from USJ to Lexical editor state JSON including the hidden caller", () => {
    // Clone USJ and ensure the note caller is '-'
    const usjGen1v1Updated = JSON.parse(JSON.stringify(usjGen1v1));
    const usjNote = (
      (usjGen1v1Updated.content[NOTE_PARA_INDEX] as MarkerObject).content as MarkerObject[]
    )[NOTE_INDEX];
    usjNote.caller = "-";

    const serializedEditorState = serializeEditorState(usjGen1v1Updated);

    const editorStateCallerUpdated = editorStateGen1v1;
    const note = (editorStateCallerUpdated.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    note.caller = "-";
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    noteCaller.caller = "-";
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateCallerUpdated);
  });

  it("should convert from USJ with Marks to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
  });

  it("should call `addMissingComments` if it's set", () => {
    const mockAddMissingComments = vi.fn();
    const nodeOptions = { addMissingComments: mockAddMissingComments };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
    expect(mockAddMissingComments.mock.calls).toHaveLength(1); // called once
    // Called with `sid` array argument from `usjMarks`.
    expect(mockAddMissingComments.mock.calls[0][0]).toEqual(["1", "1", "2", "1", "2", "1", "2"]);
  });

  it("should convert from USJ with unknown items to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);
    reset();

    const serializedEditorState = serializeEditorState(usjWithUnknownItems);

    removeNoteCallerOnClick(serializedEditorState, NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX);
    expect(serializedEditorState).toEqual(editorStateWithUnknownItems);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(9);
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(1, "Unknown type-marker 'wat-z'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(2, "Unknown type-marker 'optbreak-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(3, "Unknown type-marker 'ref-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(4, "Unknown type-marker 'sidebar-esb'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(5, "Unknown type-marker 'periph-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(6, "Unknown type-marker 'figure-fig'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(7, "Unknown type-marker 'table-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(8, "Unknown type-marker 'table:row-tr'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(9, "Unknown type-marker 'table:cell-tc1'!");
  });
});
