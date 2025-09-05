import { $createImmutableNoteCallerNode } from "../../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import { baseTestEnvironment } from "../react-test.utils";
import { LF } from "./delta-common.utils";
import { getEditorDelta } from "./editor-delta.adaptor";
import { $setState, $createTextNode, $getRoot } from "lexical";
import {
  $createBookNode,
  $createCharNode,
  $createImmutableChapterNode,
  $createImpliedParaNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  charIdState,
  GENERATOR_NOTE_CALLER,
  getEditableCallerText,
  segmentState,
} from "shared";

describe("getEditorDelta", () => {
  it("should return an empty array for an empty editor state", async () => {
    const { editor } = await testEnvironment();

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([]);
  });

  it("should return the correct ops for a book", async () => {
    const { editor } = await testEnvironment(() => {
      const bookText = $createTextNode("John ");
      $setState(bookText, segmentState, "id_1");
      $getRoot().append($createBookNode("JHN").append(bookText));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John ", attributes: { segment: "id_1" } },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
    ]);
  });

  it("should return the correct ops for a chapter", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createImmutableChapterNode("3"));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([{ insert: { chapter: { style: "c", number: "3" } } }]);
  });

  it("should return the correct ops for a book and chapter", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createBookNode("JHN").append($createTextNode("John ")),
        $createImmutableChapterNode("3"),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John " },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
      { insert: { chapter: { style: "c", number: "3" } } },
    ]);
  });

  it("should return the correct ops for a verse and implied para", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createImpliedParaNode().append($createImmutableVerseNode("16")));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: { verse: { style: "v", number: "16" } } },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for a milestone and para", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createParaNode("q1").append($createMilestoneNode("ts-s", "TS1")));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: { milestone: { style: "ts-s", sid: "TS1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for nested chars", async () => {
    const { editor } = await testEnvironment(() => {
      const qtChar = $createCharNode("qt");
      $setState(qtChar, charIdState, "1");
      const godChar = $createCharNode("w");
      $setState(godChar, charIdState, "2");
      const lovedChar = $createCharNode("w");
      $setState(lovedChar, charIdState, "3");
      $getRoot().append(
        $createImpliedParaNode().append(
          qtChar.append(
            godChar.append($createTextNode("God")),
            $createTextNode(" so "),
            lovedChar.append($createTextNode("loved")),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: "God",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "2" },
          ],
        },
      },
      { insert: " so ", attributes: { char: { style: "qt", cid: "1" } } },
      {
        insert: "loved",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "3" },
          ],
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for a note and para", async () => {
    const reference = "3:16 ";
    const footnoteText = "Footnote text ";
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, `${reference} ${footnoteText}`),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for a note with editable caller", async () => {
    const reference = "3:16 ";
    const footnoteText = "Footnote text ";
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for a complex editor state", async () => {
    const { editor } = await testEnvironment(() => {
      const bookText = $createTextNode("John ");
      $setState(bookText, segmentState, "id_1");
      const qtChar = $createCharNode("qt");
      $setState(qtChar, charIdState, "1");
      const godChar = $createCharNode("w");
      $setState(godChar, charIdState, "2");
      const lovedChar = $createCharNode("w");
      $setState(lovedChar, charIdState, "3");
      const reference = "3:16 ";
      const footnoteText = "Footnote text ";
      $getRoot().append(
        $createBookNode("JHN").append(bookText),
        $createImmutableChapterNode("3"),
        $createImpliedParaNode().append(
          $createImmutableVerseNode("16"),
          qtChar.append(
            godChar.append($createTextNode("God")),
            $createTextNode(" so "),
            lovedChar.append($createTextNode("loved")),
          ),
        ),
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, `${reference} ${footnoteText}`),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
          $createMilestoneNode("ts-s", "TS1"),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John ", attributes: { segment: "id_1" } },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
      { insert: { chapter: { style: "c", number: "3" } } },
      { insert: { verse: { style: "v", number: "16" } } },
      {
        insert: "God",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "2" },
          ],
        },
      },
      { insert: " so ", attributes: { char: { style: "qt", cid: "1" } } },
      {
        insert: "loved",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "3" },
          ],
        },
      },
      { insert: LF + "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: { milestone: { style: "ts-s", sid: "TS1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment($initialEditorState);
}
