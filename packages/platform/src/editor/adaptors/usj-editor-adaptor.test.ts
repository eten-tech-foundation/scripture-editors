import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { SerializedEditorState } from "lexical";
import { SerializedNoteNode, SerializedParaNode } from "shared";
import {
  defaultNoteCallers,
  getViewOptions,
  SerializedImmutableNoteCallerNode,
  UNFORMATTED_VIEW_MODE,
} from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  NOTE_CALLER_INDEX,
  NOTE_INDEX,
  NOTE_PARA_INDEX,
  NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  usjEmpty,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import { serializeEditorState, reset, initialize } from "./usj-editor.adaptor";
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
    const serializedEditorState = serializeEditorState(usjEmpty);

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
    removeOnClick(serializedEditorState);
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

  it("should convert from USJ to Lexical editor state JSON with editable view", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    expect(serializedEditorState).toEqual(editorStateGen1v1Editable);
  });

  it("should convert from USJ to Lexical editor state JSON including the hidden caller", () => {
    const usjGen1v1Updated = usjGen1v1;
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
    removeOnClick(serializedEditorState);
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

    removeOnClick(serializedEditorState, NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX);
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

/**
 * Remove the `onClick` function because it can't be compared since it's anonymous.
 * @param serializedEditorState
 */
function removeOnClick(
  serializedEditorState: SerializedEditorState,
  noteParaIndex = NOTE_PARA_INDEX,
  noteIndex = NOTE_INDEX,
  noteCallerIndex = NOTE_CALLER_INDEX,
) {
  const note = (serializedEditorState.root.children[noteParaIndex] as SerializedParaNode).children[
    noteIndex
  ] as SerializedNoteNode;
  const noteCaller = note.children[noteCallerIndex] as SerializedImmutableNoteCallerNode;
  delete noteCaller.onClick;
}
