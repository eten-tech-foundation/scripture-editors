import { $createImmutableNoteCallerNode } from "../../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import { baseTestEnvironment } from "../react-test.utils";
import { $getNodeOTPosition } from "./delta-common.utils";
import { $createTextNode, $getRoot, $setState, LexicalNode } from "lexical";
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
  segmentState,
} from "shared";

describe("$getNodeOTPosition", () => {
  let targetNode: LexicalNode | undefined;

  it("should return undefined for a node not in the editor", async () => {
    const { editor } = await testEnvironment(() => {
      targetNode = $createTextNode("orphan");
      $getRoot().append($createImpliedParaNode().append($createTextNode("Hello")));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const orphanNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(orphanNode));

    expect(position).toBeUndefined();
  });

  it("should return 0 for text node at the start", async () => {
    const { editor } = await testEnvironment(() => {
      targetNode = $createTextNode("Hello");
      $getRoot().append($createImpliedParaNode().append(targetNode));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const textNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(textNode));

    expect(position).toBe(0);
  });

  it("should return correct position for chapter embed", async () => {
    const { editor } = await testEnvironment(() => {
      const chapter = $createImmutableChapterNode("3");
      targetNode = chapter;
      $getRoot().append($createBookNode("JHN").append($createTextNode("John ")), chapter);
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const chapterNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(chapterNode));

    // "John " (5) + book closing LF (1) = 6
    expect(position).toBe(6);
  });

  it("should return correct position for verse embed", async () => {
    const { editor } = await testEnvironment(() => {
      const verse = $createImmutableVerseNode("16");
      targetNode = verse;
      $getRoot().append($createImpliedParaNode().append(verse));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const verseNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(verseNode));

    expect(position).toBe(0);
  });

  it("should return closing position for para node", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("q1");
      targetNode = para;
      $getRoot().append(para.append($createTextNode("Hello")));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const paraNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(paraNode));

    // "Hello" (5) + para closing LF (1) = 6, but we want the closing position at 5
    expect(position).toBe(5);
  });

  it("should return closing position for book node", async () => {
    const { editor } = await testEnvironment(() => {
      const book = $createBookNode("JHN");
      targetNode = book;
      $getRoot().append(book.append($createTextNode("John ")));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const bookNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(bookNode));

    // "John " (5) + book closing LF (1) = 6, but we want the closing position at 5
    expect(position).toBe(5);
  });

  it("should return closing position for implied para node", async () => {
    const { editor } = await testEnvironment(() => {
      const impliedPara = $createImpliedParaNode();
      targetNode = impliedPara;
      $getRoot().append(impliedPara.append($createTextNode("Hello")));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const impliedParaNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(impliedParaNode));

    // "Hello" (5) + implied para closing LF (1) = 6, but we want the closing position at 5
    expect(position).toBe(5);
  });

  it("should skip CharNodes when calculating position", async () => {
    const { editor } = await testEnvironment(() => {
      const text = $createTextNode("Bold");
      targetNode = text;
      $getRoot().append($createImpliedParaNode().append($createCharNode("bd").append(text)));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const textNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(textNode));

    // CharNode doesn't contribute to OT length, so text is at position 0
    expect(position).toBe(0);
  });

  it("should return correct position for milestone embed", async () => {
    const { editor } = await testEnvironment(() => {
      const milestone = $createMilestoneNode("ts-s", "TS1");
      targetNode = milestone;
      $getRoot().append($createParaNode("q1").append(milestone));
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const milestoneNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(milestoneNode));

    expect(position).toBe(0);
  });

  it("should return correct position for note embed", async () => {
    const { editor } = await testEnvironment(() => {
      const note = $createNoteNode("f", GENERATOR_NOTE_CALLER);
      targetNode = note;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          note.append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "3:16 Footnote text"),
            $createCharNode("fr").append($createTextNode("3:16 ")),
            $createCharNode("ft").append($createTextNode("Footnote text ")),
          ),
          $createTextNode(" then"),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const noteNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(noteNode));

    // "When" (4) + note position
    expect(position).toBe(4);
  });

  it("should return note position for text node inside note", async () => {
    const { editor } = await testEnvironment(() => {
      const innerText = $createTextNode("Footnote text ");
      targetNode = innerText;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "3:16 Footnote text"),
            $createCharNode("fr").append($createTextNode("3:16 ")),
            $createCharNode("ft").append(innerText),
          ),
          $createTextNode(" then"),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const innerTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(innerTextNode));

    // Should return the note's position (4), not count internal note content
    expect(position).toBe(4);
  });

  it("should return note position for char node inside note", async () => {
    const { editor } = await testEnvironment(() => {
      const charNode = $createCharNode("ft");
      targetNode = charNode;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "3:16 Footnote text"),
            $createCharNode("fr").append($createTextNode("3:16 ")),
            charNode.append($createTextNode("Footnote text ")),
          ),
          $createTextNode(" then"),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const charNodeTarget = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(charNodeTarget));

    // Should return the note's position (4), not count internal note content
    expect(position).toBe(4);
  });

  it("should return correct position for immutable note caller", async () => {
    const { editor } = await testEnvironment(() => {
      const noteCaller = $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "3:16 Footnote");
      targetNode = noteCaller;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            noteCaller,
            $createCharNode("ft").append($createTextNode("Footnote text")),
          ),
          $createTextNode(" then"),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const noteCallerNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(noteCallerNode));

    // Should return the note's position (4), not separate position for caller
    expect(position).toBe(4);
  });

  it("should return correct position after note for following text", async () => {
    const { editor } = await testEnvironment(() => {
      const afterText = $createTextNode(" then");
      targetNode = afterText;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "3:16 Footnote text"),
            $createCharNode("fr").append($createTextNode("3:16 ")),
            $createCharNode("ft").append($createTextNode("Footnote text ")),
          ),
          afterText,
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const afterTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(afterTextNode));

    // "When" (4) + note (1) = 5
    expect(position).toBe(5);
  });

  it("should handle multiple notes correctly", async () => {
    const { editor } = await testEnvironment(() => {
      const textAfterNotes = $createTextNode("end");
      targetNode = textAfterNotes;
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("Start"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "First note"),
            $createCharNode("ft").append($createTextNode("First note")),
          ),
          $createTextNode(" middle"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "Second note"),
            $createCharNode("ft").append($createTextNode("Second note")),
          ),
          textAfterNotes,
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const textAfterNotesNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(textAfterNotesNode));

    // "Start" (5) + note1 (1) + " middle" (7) + note2 (1) = 14
    expect(position).toBe(14);
  });

  it("should handle complex document structure", async () => {
    const { editor } = await testEnvironment(() => {
      const bookText = $createTextNode("John ");
      $setState(bookText, segmentState, "id_1");
      const qtChar = $createCharNode("qt");
      $setState(qtChar, charIdState, "1");
      const godChar = $createCharNode("w");
      $setState(godChar, charIdState, "2");
      const target = $createTextNode("God");
      targetNode = target;
      $getRoot().append(
        $createBookNode("JHN").append(bookText),
        $createImmutableChapterNode("3"),
        $createImpliedParaNode().append(
          $createImmutableVerseNode("16"),
          qtChar.append(godChar.append(target), $createTextNode(" so ")),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "John " (5) + book closing LF (1) + chapter (1) + verse (1) = 8
    expect(position).toBe(8);
  });

  it("should handle text after para node", async () => {
    const { editor } = await testEnvironment(() => {
      const secondText = $createTextNode("Second");
      targetNode = secondText;
      $getRoot().append(
        $createParaNode("p").append($createTextNode("First")),
        $createImpliedParaNode().append(secondText),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const secondTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(secondTextNode));

    // "First" (5) + para1 closing LF (1) = 6
    expect(position).toBe(6);
  });

  it("should handle nested CharNodes", async () => {
    const { editor } = await testEnvironment(() => {
      const innerText = $createTextNode("Bold");
      targetNode = innerText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("qt").append(
            $createTextNode("Quote "),
            $createCharNode("bd").append(innerText),
            $createTextNode(" end"),
          ),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const innerTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(innerTextNode));

    // "Quote " (6) + inner text position
    expect(position).toBe(6);
  });

  it("should handle multiple paras and embeds", async () => {
    const { editor } = await testEnvironment(() => {
      const target = $createTextNode("Second");
      targetNode = target;
      $getRoot().append(
        $createParaNode("p").append($createTextNode("First")),
        $createParaNode("q1").append($createImmutableVerseNode("2"), target),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const secondTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(secondTextNode));

    // "First" (5) + para1 closing LF (1) + verse (1) = 7
    expect(position).toBe(7);
  });

  it("should handle adjacent CharNodes with separate text", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("italic");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("bd").append($createTextNode("bold")),
          $createCharNode("it").append(targetText),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "bold" (4) + "italic" position
    expect(position).toBe(4);
  });

  it("should handle adjacent CharNodes with text between", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("italic");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("bd").append($createTextNode("bold")),
          $createTextNode(" "),
          $createCharNode("it").append(targetText),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "bold" (4) + " " (1) + "italic" position = 5
    expect(position).toBe(5);
  });

  it("should handle deeply nested CharNodes", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("deep");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createTextNode("start "),
          $createCharNode("qt").append(
            $createTextNode("level1 "),
            $createCharNode("bd").append(
              $createTextNode("level2 "),
              $createCharNode("it").append(targetText),
            ),
          ),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "start " (6) + "level1 " (7) + "level2 " (7) = 20
    expect(position).toBe(20);
  });

  it("should handle CharNode closing and reopening same style", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("second");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("bd").append($createTextNode("first")),
          $createTextNode(" "),
          $createCharNode("bd").append(targetText),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "first" (5) + " " (1) + "second" position = 6
    expect(position).toBe(6);
  });

  it("should handle text after CharNode closes", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("after");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("bd").append($createTextNode("bold")),
          targetText,
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "bold" (4) + "after" position
    expect(position).toBe(4);
  });

  it("should handle CharNodes with embeds inside", async () => {
    const { editor } = await testEnvironment(() => {
      const targetText = $createTextNode("after verse");
      targetNode = targetText;
      $getRoot().append(
        $createImpliedParaNode().append(
          $createCharNode("qt").append(
            $createTextNode("before "),
            $createImmutableVerseNode("5"),
            targetText,
          ),
        ),
      );
    });
    if (!targetNode) throw new Error("targetNode not initialized");
    const targetTextNode = targetNode;

    const position = editor.getEditorState().read(() => $getNodeOTPosition(targetTextNode));

    // "before " (7) + verse (1) = 8
    expect(position).toBe(8);
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment($initialEditorState);
}
