// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { $expectSelectionToBe } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { ImmutableVerseNode, $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode } from "../../nodes/usj/node-react.utils";
import { TextSpacingPlugin } from "./TextSpacingPlugin";
import {
  baseTestEnvironment,
  createTextAtSelection,
  deleteTextAtSelection,
  typeTextAfterNode,
  typeTextAtSelection,
} from "./react-test.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, TextNode, $setSelection } from "lexical";
import {
  $createCharNode,
  $createImmutableChapterNode,
  $createNoteNode,
  $createParaNode,
  $createTypedMarkNode,
  $createUnknownNode,
  $isCharNode,
  $isParaNode,
  $isTypedMarkNode,
  $isUnknownNode,
  ParaNode,
  UnknownNode,
} from "shared";

let v1Node: ImmutableVerseNode;
let textNode: TextNode;
let v4ParaNode: ParaNode;
let v4Node: ImmutableVerseNode;

function $defaultInitialEditorState() {
  v1Node = $createImmutableVerseNode("1");
  textNode = $createTextNode("b ");
  v4ParaNode = $createParaNode();
  v4Node = $createImmutableVerseNode("1");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append(v1Node, $createImmutableVerseNode("2")),
    $createParaNode().append($createImmutableVerseNode("3"), textNode),
    v4ParaNode.append(v4Node, $createNoteNode("f", "+")),
    $createParaNode().append(
      $createImmutableVerseNode("5"),
      $createCharNode("wj").append($createTextNode("e")),
    ),
  );
}

describe("TextSpacingPlugin", () => {
  it("should load default initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("\n\nb \n\n\n\ne");
    });
  });

  it("should insert a character between empty verses and add trailing space and retain caret location", async () => {
    const { editor } = await testEnvironment();

    await typeTextAfterNode(editor, "a", v1Node, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[1];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(1);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("a ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should remove the character between empty verses and trailing space is removed", async () => {
    const { editor } = await testEnvironment();

    // Remove the 'b' and leave the space.
    await act(async () => {
      editor.update(() => {
        if ($isTextNode(textNode) && textNode.isAttached()) textNode.setTextContent(" ");
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[2];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(1);
      const verseNode = para.getChildAtIndex(0);
      if (!$isSomeVerseNode(verseNode)) throw new Error("Expected some verse node");
    });
  });

  it("should insert a character before a note node and not add trailing space", async () => {
    const { editor } = await testEnvironment();

    await typeTextAfterNode(editor, "d", v4Node, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[3];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(1);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should not add a space inside a char node", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[4];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const charNode = para.getChildAtIndex(1);
      if (!$isCharNode(charNode)) throw new Error("Expected a CharNode");
      expect(charNode.getTextContent()).toBe("e");
    });
  });

  it("should not add a space inside a TypedMarkNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("This is "),
          $createTypedMarkNode({ testType1: ["testID1"] }).append(
            $createTextNode("a TypedMarkNode"),
          ),
          $createTextNode("."),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildrenSize()).toBe(3);
      const markNode = para.getChildAtIndex(1);
      if (!$isTypedMarkNode(markNode)) throw new Error("Expected a TypedMarkNode");
      // No extra space at the end.
      expect(markNode.getTextContent()).toBe("a TypedMarkNode");
    });
  });

  it("should not add trailing space when next sibling is a CharNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("abc"),
          $createCharNode("nd").append($createTextNode("xyz")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("abc");
      const charNode = para.getChildAtIndex(1);
      if (!$isCharNode(charNode)) throw new Error("Expected a CharNode");
      expect(charNode.getTextContent()).toBe("xyz");
    });
  });

  it("should not add trailing space when next sibling is a TypedMarkNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("abc"),
          $createTypedMarkNode({ testType1: ["testID1"] }).append($createTextNode("marked")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("abc");
      const markNode = para.getChildAtIndex(1);
      if (!$isTypedMarkNode(markNode)) throw new Error("Expected a TypedMarkNode");
      expect(markNode.getTextContent()).toBe("marked");
    });
  });

  it("should add a space if typing before an initial verse in a para", async () => {
    const { editor } = await testEnvironment();

    await typeTextAtSelection(editor, "d", v4ParaNode, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[3];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should add a space if typing before a verse in a para starting with an UnknownNode", async () => {
    let unknownTextNode: TextNode;
    const { editor } = await testEnvironment(() => {
      unknownTextNode = $createTextNode("wat-z");
      $getRoot().append(
        $createParaNode().append(
          $createUnknownNode("wat", "z").append(unknownTextNode),
          $createImmutableVerseNode("6"),
          $createTextNode("f"),
        ),
      );
    });

    // Defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await createTextAtSelection(editor, "d", unknownTextNode!, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(4);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should not remove a space if it precedes a verse", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode(" "),
          $createImmutableVerseNode("2"),
        ),
      );
    });

    // Trigger an update by moving selection (or any other update)
    await act(async () => {
      editor.update(() => {
        const verse1 = $getRoot().getFirstDescendant();
        if (verse1) $setSelection(verse1.selectNext(0, 0));
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const spaceNode = para.getChildAtIndex(1);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should move typed text out of an UnknownNode and add space before verse", async () => {
    let unknownNode: UnknownNode;
    let innerTextNode: TextNode;
    const { editor } = await testEnvironment(() => {
      innerTextNode = $createTextNode("abc");
      unknownNode = $createUnknownNode("tag", "content").append(innerTextNode);
      $getRoot().append($createParaNode().append(unknownNode, $createImmutableVerseNode("1")));
    });

    // Select within the inner text node and type. `innerTextNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await createTextAtSelection(editor, "d", innerTextNode!, 1); // Select after 'a'

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [UnknownNode, TextNode("d "), VerseNode]
      expect(para.getChildren()).toHaveLength(3);
      const typedTextNode = para.getChildAtIndex(1);
      if (!$isTextNode(typedTextNode)) throw new Error("Expected a TextNode");
      expect(typedTextNode.getTextContent()).toBe("d ");
      const originalUnknownNode = para.getChildAtIndex(0);
      expect(originalUnknownNode?.getKey()).toBe(unknownNode.getKey());
      expect(originalUnknownNode?.getTextContent()).toBe("abc"); // Original text unchanged
      $expectSelectionToBe(typedTextNode, 1); // Selection after the typed 'd'
    });
  });

  it("should insert a space before a verse if preceded by a CharNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("wj").append($createTextNode("abc")),
          $createImmutableVerseNode("1"),
        ),
      );
    });

    // Trigger an update
    await act(async () => {
      editor.update(() => {
        const verse1 = $getRoot().getLastDescendant();
        if (verse1) $setSelection(verse1.selectPrevious(0, 0));
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [CharNode, TextNode(" "), VerseNode]
      expect(para.getChildren()).toHaveLength(3);
      const spaceNode = para.getChildAtIndex(1);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should not insert a space before a verse if preceded by an UnknownNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createUnknownNode("tag", "content").append($createTextNode("abc")),
          $createImmutableVerseNode("1"),
        ),
      );
    });

    // Trigger an update (no change expected)
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should remain [UnknownNode, VerseNode]
      expect(para.getChildren()).toHaveLength(2);
      expect($isUnknownNode(para.getChildAtIndex(0))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(1))).toBe(true);
    });
  });

  it("should not remove a space left after deletion if it precedes a verse", async () => {
    let textNodeToDelete: TextNode;
    const { editor } = await testEnvironment(() => {
      textNodeToDelete = $createTextNode("abc ");
      $getRoot().append($createParaNode().append(textNodeToDelete, $createImmutableVerseNode("1")));
    });

    // Select "abc" and delete. `textNodeToDelete` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteTextAtSelection(editor, textNodeToDelete!, 0, textNodeToDelete!, 3); // Select "abc"

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [TextNode(" "), VerseNode]
      expect(para.getChildren()).toHaveLength(2);
      const spaceNode = para.getChildAtIndex(0);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should not insert a space before a verse if it's empty", async () => {
    let paraNode: ParaNode;
    const { editor } = await testEnvironment(() => {
      paraNode = $createParaNode();
      $getRoot().append(
        paraNode.append(
          $createImmutableVerseNode("1"),
          $createImmutableVerseNode("2"),
          $createImmutableVerseNode("3"),
        ),
      );
    });

    // `paraNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "a", paraNode!, 2);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(4);
      expect($isSomeVerseNode(para.getChildAtIndex(0))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(1))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(3))).toBe(true);
      const typedTextNode = para.getChildAtIndex(2);
      if (!$isTextNode(typedTextNode)) throw new Error("Expected a TextNode");
      $expectSelectionToBe(typedTextNode, 1); // Selection after the typed 'a'
    });
  });
});

async function testEnvironment($initialEditorState: () => void = $defaultInitialEditorState) {
  return baseTestEnvironment($initialEditorState, <TextSpacingPlugin />);
}
