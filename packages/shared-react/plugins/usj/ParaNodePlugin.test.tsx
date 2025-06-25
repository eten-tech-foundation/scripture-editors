import { ParaNodePlugin } from "./ParaNodePlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { $getRoot, $createTextNode, TextNode } from "lexical";
import {
  $createImmutableChapterNode,
  $isImmutableChapterNode,
} from "shared/nodes/usj/ImmutableChapterNode";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";
import { pressEnterAtSelection } from "shared/nodes/usj/test.utils";

let firstVerseTextNode: TextNode;

function $defaultInitialEditorState() {
  const secondVerseTextNode = $createTextNode("second verse text ");
  firstVerseTextNode = $createTextNode("first verse text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append(firstVerseTextNode),
    $createParaNode().append(secondVerseTextNode),
  );
}

describe("ParaNodePlugin", () => {
  it("should load default initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      expect(root.getTextContent()).toBe("first verse text \n\nsecond verse text ");
      expect(children.length).toBe(3);
      if (!$isImmutableChapterNode(children[0]))
        throw new Error("First item is not an ImmutableChapterNode");
      if (!$isParaNode(children[1])) throw new Error("First child after chapter is not a ParaNode");
      expect(children[1].getChildrenSize()).toBe(1);
    });
  });

  it("should insert ParaNode without leading space", async () => {
    const { editor } = await testEnvironment();

    await pressEnterAtSelection(editor, firstVerseTextNode, 6);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      expect(children.length).toBe(4);
      const firstPara = children[1];
      if (!$isParaNode(firstPara)) throw new Error("First child after chapter is not a ParaNode");
      expect(firstPara.getTextContent()).toBe("first ");
      const secondPara = children[2];
      if (!$isParaNode(secondPara)) throw new Error("Second child after chapter is not a ParaNode");
      expect(secondPara.getTextContent()).toBe("verse text ");
    });
  });

  it("should insert ParaNode with leading space and remove it", async () => {
    const { editor } = await testEnvironment();

    await pressEnterAtSelection(editor, firstVerseTextNode, 5);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      expect(children.length).toBe(4);
      const firstPara = children[1];
      if (!$isParaNode(firstPara)) throw new Error("First child after chapter is not a ParaNode");
      expect(firstPara.getTextContent()).toBe("first");
      const secondPara = children[2];
      if (!$isParaNode(secondPara)) throw new Error("Second child after chapter is not a ParaNode");
      expect(secondPara.getTextContent()).toBe("verse text ");
    });
  });
});

async function testEnvironment($initialEditorState: () => void = $defaultInitialEditorState) {
  return baseTestEnvironment($initialEditorState, <ParaNodePlugin />);
}
