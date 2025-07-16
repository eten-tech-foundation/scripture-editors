import { $createImmutableNoteCallerNode } from "../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { ArrowNavigationPlugin } from "./ArrowNavigationPlugin";
import { TextDirectionPlugin } from "./TextDirectionPlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { $createTextNode, $getRoot, TextNode } from "lexical";
import { $createCharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode, ImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $createNoteNode } from "shared/nodes/usj/NoteNode";
import { $createParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { $expectSelectionToBe, pressKey, updateSelection } from "shared/nodes/usj/test.utils";

let paraNode: ParaNode | ImpliedParaNode;
let v1TextNode: TextNode;
let v2TextNode: TextNode;

function $defaultInitialEditorState() {
  paraNode = $createParaNode();
  $initialEditorState();
}

function $impliedParaInitialEditorState() {
  paraNode = $createImpliedParaNode();
  $initialEditorState();
}

function $initialEditorState() {
  v1TextNode = $createTextNode("verse1 text ");
  v2TextNode = $createTextNode("verse2 text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    paraNode.append(
      $createImmutableVerseNode("1"),
      $createNoteNode("f", "+").append(
        $createImmutableNoteCallerNode("+", "note1 preview"),
        $createCharNode("ft").append($createTextNode("note1 text")),
      ),
      v1TextNode,
      $createImmutableVerseNode("2"),
      $createNoteNode("f", "+").append(
        $createImmutableNoteCallerNode("+", "note2 preview"),
        $createCharNode("ft").append($createTextNode("note2 text")),
      ),
      v2TextNode,
    ),
  );
}

describe("ArrowNavigationPlugin", () => {
  describe("LTR Direction ArrowRight", () => {
    it("should skip over ImmutableVerseNode and following NoteNode when moving forward from para start", async () => {
      const { editor } = await testEnvironment();
      updateSelection(editor, paraNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward inline", async () => {
      const { editor } = await testEnvironment();
      updateSelection(editor, v1TextNode);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward from implied para start", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState);
      updateSelection(editor, paraNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward inline in implied para", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState);
      updateSelection(editor, v1TextNode);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2TextNode, 0);
      });
    });
  });

  describe("LTR Direction ArrowLeft", () => {
    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward to para start", async () => {
      const { editor } = await testEnvironment();
      updateSelection(editor, v1TextNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(paraNode, 0);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward inline", async () => {
      const { editor } = await testEnvironment();
      updateSelection(editor, v2TextNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward to implied para start", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState);
      updateSelection(editor, v1TextNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(paraNode, 0);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward inline in implied para", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState);
      updateSelection(editor, v2TextNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode);
      });
    });
  });

  describe("RTL Direction ArrowLeft (Forward)", () => {
    it("should skip over ImmutableVerseNode and following NoteNode when moving forward (RTL) from para start", async () => {
      const { editor } = await testEnvironment(undefined, "rtl");
      updateSelection(editor, paraNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward (RTL) inline", async () => {
      const { editor } = await testEnvironment(undefined, "rtl");
      updateSelection(editor, v1TextNode);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward (RTL) from implied para start", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState, "rtl");
      updateSelection(editor, paraNode, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode, 0);
      });
    });

    it("should skip over ImmutableVerseNode and following NoteNode when moving forward (RTL) inline in implied para", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState, "rtl");
      updateSelection(editor, v1TextNode);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2TextNode, 0);
      });
    });
  });

  describe("RTL DirectionArrowRight (Backward)", () => {
    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward (RTL) to para start", async () => {
      const { editor } = await testEnvironment(undefined, "rtl");
      updateSelection(editor, v1TextNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(paraNode, 0);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward (RTL) inline", async () => {
      const { editor } = await testEnvironment(undefined, "rtl");
      updateSelection(editor, v2TextNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward (RTL) to implied para start", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState, "rtl");
      updateSelection(editor, v1TextNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(paraNode, 0);
      });
    });

    it("should skip over NoteNode and preceding ImmutableVerseNode when moving backward (RTL) inline in implied para", async () => {
      const { editor } = await testEnvironment($impliedParaInitialEditorState, "rtl");
      updateSelection(editor, v2TextNode, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1TextNode);
      });
    });
  });
});

async function testEnvironment(
  $initialEditorState: () => void = $defaultInitialEditorState,
  textDirection: "ltr" | "rtl" = "ltr",
) {
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <ArrowNavigationPlugin />
      <TextDirectionPlugin textDirection={textDirection} />
    </>,
  );
}
