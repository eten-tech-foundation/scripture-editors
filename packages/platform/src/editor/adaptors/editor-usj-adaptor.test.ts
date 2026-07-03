// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  CHAPTER_1_INDEX,
  VERSE_2_EDITABLE_INDEX,
  VERSE_2_INDEX,
  VERSE_PARA_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import editorUsjAdaptor, {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "./editor-usj.adaptor";
import usjEditorAdaptor, {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "./usj-editor.adaptor";
import { EMPTY_USJ, MarkerObject, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { deepEqual } from "fast-equals";
import { SerializedTextNode } from "lexical";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes } from "shared-react";
import {
  CHAPTER_MARKER,
  getVisibleOpenMarkerText,
  isSerializedTextNode,
  NBSP,
  SerializedChapterNode,
  SerializedParaNode,
  SerializedVerseNode,
  TypedMarkNode,
  VERSE_MARKER,
} from "shared";

const nodes = [TypedMarkNode, ...usjReactNodes];
const { editor } = createBasicTestEnvironment(nodes);

describe("Editor USJ Adaptor", () => {
  it("should convert to USJ from empty Lexical editor state JSON", () => {
    const editorState = editor.parseEditorState(editorStateEmpty);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(EMPTY_USJ);
  });

  it("should convert to USJ from Lexical editor state JSON", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1);
  });

  it("should convert to USJ from Lexical editor state JSON with an empty implied para", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1ImpliedParaEmpty);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1ImpliedParaEmpty);
  });

  it("should convert to USJ from Lexical editor state JSON with implied para", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1ImpliedPara);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1ImpliedPara);
  });

  it("should convert to USJ from Lexical editor state JSON with nonstandard features", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1Nonstandard);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1Nonstandard);
  });

  it("should convert to USJ from Lexical editor state JSON with edits", () => {
    const editorStateEdited = editorStateGen1v1Editable;
    const chapter1 = editorStateEdited.root.children[CHAPTER_1_INDEX] as SerializedChapterNode;
    const chapter1Number = "101";
    (chapter1.children[0] as SerializedTextNode).text = getVisibleOpenMarkerText(
      CHAPTER_MARKER,
      chapter1Number,
    );
    const verse2 = (editorStateEdited.root.children[VERSE_PARA_INDEX] as SerializedParaNode)
      .children[VERSE_2_EDITABLE_INDEX] as SerializedVerseNode;
    const verse2Number = "202";
    verse2.text = getVisibleOpenMarkerText(VERSE_MARKER, verse2Number);
    const editorState = editor.parseEditorState(editorStateEdited);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    const usjGen1v1Edited = usjGen1v1;
    const usjChapter1 = usjGen1v1Edited.content[CHAPTER_1_INDEX] as MarkerObject;
    usjChapter1.number = chapter1Number;
    const usjVerse2 = (
      (usjGen1v1Edited.content[VERSE_PARA_INDEX] as MarkerObject).content as MarkerObject[]
    )[VERSE_2_INDEX];
    usjVerse2.number = verse2Number;
    expect(usj).toEqual(usjGen1v1Edited);
  });

  it("should convert USJ to Lexical editor state JSON and back again", () => {
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(usjGen1v1);
    const editorState = editor.parseEditorState(serializedEditorState);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    const isEqual = deepEqual(usj, usjGen1v1);
    expect(usj).toEqual(usjGen1v1);
    expect(isEqual).toBe(true);
  });

  it("should convert to USJ from Lexical editor state JSON with Marks", () => {
    const editorState = editor.parseEditorState(editorStateMarks);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjMarks);
  });

  it("should convert to USJ from Lexical editor state JSON with unknown items", () => {
    const editorState = editor.parseEditorState(editorStateWithUnknownItems);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjWithUnknownItems);
  });

  function buildPatchedStandardState(displayText: string) {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />in the days</para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("in the days"),
    ) as SerializedTextNode;
    text.text = displayText;
    return state;
  }

  it("inverts display whitespace when deserializing standard view", () => {
    // display tilde (= data NBSP) + display-NBSP run (= space run, collapses to one)
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const roundTripped = deserializeSerializedEditorState(
      state,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    expect(JSON.stringify(roundTripped)).toContain(`in${NBSP}the days`);
  });

  it("leaves whitespace untouched when deserializing without standard viewOptions", () => {
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const roundTripped = deserializeSerializedEditorState(state);
    expect(JSON.stringify(roundTripped)).toContain(`in~the${NBSP}${NBSP}days`);
  });

  it("uses per-call viewOptions, not a latched module singleton (task zero)", () => {
    // Build a standard-view state with a stored NBSP (renders as display `~`).
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined); // no viewOptions latched
    reset();
    const standardState = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    // Deserializing WITH standard viewOptions inverts display `~` back to a data NBSP...
    const asStandard = deserializeSerializedEditorState(
      standardState,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    expect(JSON.stringify(asStandard)).toContain(`3${NBSP}000 men`);

    // ...and deserializing the SAME state WITHOUT standard viewOptions leaves display `~` literal,
    // proving the result depends on the per-call arg, not on whatever `initialize` last saw.
    const asDefault = deserializeSerializedEditorState(standardState, undefined);
    expect(JSON.stringify(asDefault)).toContain(`3~000 men`);
  });
});
