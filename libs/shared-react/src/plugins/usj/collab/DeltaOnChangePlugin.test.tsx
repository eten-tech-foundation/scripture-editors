import {
  $createImmutableVerseNode,
  $isImmutableVerseNode,
  ImmutableVerseNode,
} from "../../../nodes/usj/ImmutableVerseNode";
import {
  $typeTextAtSelection,
  baseTestEnvironment,
  sutUpdate,
  typeTextAtSelection,
} from "../react-test.utils";
import { DeltaOp } from "./delta-common.utils";
import { DeltaOnChangePlugin } from "./DeltaOnChangePlugin";
import {
  $createTextNode,
  $getRoot,
  $isTextNode,
  EditorState,
  LexicalEditor,
  TextNode,
  $setState,
  $getState,
} from "lexical";
import {
  $createBookNode,
  $createCharNode,
  $createImmutableChapterNode,
  $createImpliedParaNode,
  $isImmutableChapterNode,
  $isImpliedParaNode,
  charIdState,
  ImmutableChapterNode,
  ImpliedParaNode,
  segmentState,
} from "shared";

let updateOps: DeltaOp[];

describe("OnChangePlugin", () => {
  it("should load an initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    expect(updateOps).toBeUndefined();
    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const p = root.getFirstChild();
      if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
      expect(p.getChildrenSize()).toBe(0);
    });
  });

  describe("Text-only Operations", () => {
    it("should get character inserts when typing in an implied paragraph", async () => {
      let impliedPara: ImpliedParaNode;
      const { editor } = await testEnvironment(() => {
        impliedPara = $createImpliedParaNode();
        $getRoot().append(impliedPara);
      });

      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "a", impliedPara!, 0, undefined, undefined, "verse_3_16");

      expect(updateOps).toEqual([{ insert: "a", attributes: { segment: "verse_3_16" } }]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);

        const p = root.getFirstChild();
        if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("Expected a TextNode");
        expect(t1.getTextContent()).toBe("a");
        expect($getState(t1, segmentState)).toBe("verse_3_16");
      });
    });

    it("should get character inserts when typing in a text node at the beginning", async () => {
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        textNode = $createTextNode("b");
        $setState(textNode, segmentState, "verse_3_16");
        $getRoot().append($createImpliedParaNode().append(textNode));
      });

      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "a", textNode!, 0);

      expect(updateOps).toEqual([{ insert: "a", attributes: { segment: "verse_3_16" } }]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);

        const p = root.getFirstChild();
        if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("Expected a TextNode");
        expect(t1.getTextContent()).toBe("ab");
        expect($getState(t1, segmentState)).toBe("verse_3_16");
      });
    });

    it("should get character inserts when typing in a text node at the end", async () => {
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        textNode = $createTextNode("a");
        $setState(textNode, segmentState, "verse_3_16");
        $getRoot().append($createImpliedParaNode().append(textNode));
      });

      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "b", textNode!, 1);

      expect(updateOps).toEqual([
        { retain: 1 },
        { insert: "b", attributes: { segment: "verse_3_16" } },
      ]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);

        const p = root.getFirstChild();
        if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("Expected a TextNode");
        expect(t1.getTextContent()).toBe("ab");
        expect($getState(t1, segmentState)).toBe("verse_3_16");
      });
    });

    it("should get character inserts when typing in a text node after a chapter", async () => {
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        textNode = $createTextNode("ac");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createImpliedParaNode().append(textNode),
        );
      });

      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "b", textNode!, 1);

      expect(updateOps).toEqual([{ retain: 2 }, { insert: "b" }]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);

        const p = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("Expected a TextNode");
        expect(t1.getTextContent()).toBe("abc");
        expect($getState(t1, segmentState)).toBeUndefined();
      });
    });

    it("should get character inserts when typing in a text node after a book", async () => {
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        textNode = $createTextNode("bc");
        $getRoot().append($createBookNode("GEN"), $createImpliedParaNode().append(textNode));
      });

      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "a", textNode!, 0);

      expect(updateOps).toEqual([{ retain: 1 }, { insert: "a" }]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);

        const p = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("Expected a TextNode");
        expect(t1.getTextContent()).toBe("abc");
      });
    });

    it("should handle complex OT text position calculation with chapters, verses, and char nodes", async () => {
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        const char = $createCharNode("wj");
        $setState(char, charIdState, "afd886c6-2397-4e4c-8a94-696bf9f2e545");
        textNode = $createTextNode("and all the brothers who are with me");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createImpliedParaNode().append(
            $createImmutableVerseNode("1"),
            char.append($createTextNode("It is finished.")), // length: 15
            $createImmutableVerseNode("2"),
            textNode, // This is where we'll make the change
          ),
        );
      });

      // Select after "and all the " (12) and all of "brothers" (8 long) 12 + 8 = 20.
      // Defined by the test environment.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await typeTextAtSelection(editor, "brethren", textNode!, 12, textNode!, 20);

      // Expected retain position:
      // ch1(1) + v1(1) + "It is finished."(15) + v2(1) + "and all the br"(14)
      // = 1 + 1 + 15 + 1 + 14 = 32
      expect(updateOps).toEqual([
        { retain: 32 },
        { insert: "e" },
        { delete: 1 },
        { retain: 2 },
        { insert: "ren" },
        { delete: 3 },
      ]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // Chapter, ImpliedParaNode

        const impliedPara = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(impliedPara)) throw new Error("Expected ImpliedParaNode");
        expect(impliedPara.getChildrenSize()).toBe(4); // VerseNode, CharNode, VerseNode, TextNode

        const t2 = impliedPara.getChildAtIndex(3);
        if (!$isTextNode(t2)) throw new Error("Expected TextNode");
        expect(t2.getTextContent()).toBe("and all the brethren who are with me");
      });
    });
  });

  describe("Mixed Operations", () => {
    it("should handle complex OT position calculation with chapters, verses, and char nodes", async () => {
      let ch1: ImmutableChapterNode;
      let v1: ImmutableVerseNode;
      let v2: ImmutableVerseNode;
      let textNode: TextNode;
      const { editor } = await testEnvironment(() => {
        ch1 = $createImmutableChapterNode("2");
        v1 = $createImmutableVerseNode("2");
        const char = $createCharNode("wj");
        $setState(char, charIdState, "afd886c6-2397-4e4c-8a94-696bf9f2e545");
        v2 = $createImmutableVerseNode("3");
        textNode = $createTextNode("and all the brothers who are with me");
        $getRoot().append(
          ch1,
          $createImpliedParaNode().append(
            v1,
            char.append($createTextNode("It is finished.")), // length: 15
            v2,
            textNode,
          ),
        );
      });

      await sutUpdate(editor, () => {
        ch1.setNumber("1");
        v1.setNumber("1");
        v2.setNumber("2");
        // Select after "and all the " (12) and all of "brothers" (8 long) 12 + 8 = 20.
        // Defined by the test environment.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        $typeTextAtSelection("brethren", textNode!, 12, textNode!, 20);
      });

      expect(updateOps).toEqual([
        { insert: { chapter: { number: "1", style: "c" } } },
        { insert: { verse: { number: "1", style: "v" } } },
        { delete: 2 },
        { retain: 15 }, // char text
        { insert: { verse: { number: "2", style: "v" } } },
        { delete: 1 },
        { retain: 14 }, // "and all the br"
        { insert: "e" },
        { delete: 1 },
        { retain: 2 },
        { insert: "ren" },
        { delete: 3 },
      ]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // Chapter, ImpliedParaNode

        const ch1 = root.getChildAtIndex(0);
        if (!$isImmutableChapterNode(ch1)) throw new Error("Expected ImmutableChapterNode");
        expect(ch1.getNumber()).toBe("1");

        const impliedPara = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(impliedPara)) throw new Error("Expected ImpliedParaNode");
        expect(impliedPara.getChildrenSize()).toBe(4); // VerseNode, CharNode, VerseNode, TextNode

        const v1 = impliedPara.getChildAtIndex(0);
        if (!$isImmutableVerseNode(v1)) throw new Error("Expected ImmutableVerseNode");
        expect(v1.getNumber()).toBe("1");

        const v2 = impliedPara.getChildAtIndex(2);
        if (!$isImmutableVerseNode(v2)) throw new Error("Expected ImmutableVerseNode");
        expect(v2.getNumber()).toBe("2");

        const t2 = impliedPara.getChildAtIndex(3);
        if (!$isTextNode(t2)) throw new Error("Expected TextNode");
        expect(t2.getTextContent()).toBe("and all the brethren who are with me");
      });
    });
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <DeltaOnChangePlugin
      onChange={handleChange}
      ignoreSelectionChange
      ignoreHistoryMergeTagChange
    />,
  );
}

function handleChange(
  _editorState: EditorState,
  _editor: LexicalEditor,
  _tags: Set<string>,
  ops: DeltaOp[],
) {
  updateOps = ops;
}
