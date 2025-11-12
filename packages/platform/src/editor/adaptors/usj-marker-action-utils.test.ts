// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getUsjMarkerAction } from "./usj-marker-action.utils";
import { $createTextNode, $getRoot, $isTextNode, TextNode } from "lexical";
import { $createImmutableVerseNode, $isImmutableVerseNode, usjReactNodes } from "shared-react";
import {
  $createImmutableChapterNode,
  $createParaNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isNoteNode,
  $isParaNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
} from "shared";

const nodes = usjReactNodes;
const reference = { book: "GEN", chapterNum: 1, verseNum: 1 };

let secondVerseTextNode: TextNode;

function $defaultInitialEditorState() {
  secondVerseTextNode = $createTextNode("second verse text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append($createImmutableVerseNode("1"), $createTextNode("first verse text ")),
    $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
  );
}

describe("USJ Marker Action Utils", () => {
  // Create a ref for expanded note key - using a simple object to simulate useRef behavior in tests
  const expandedNoteKeyRef = { current: undefined as string | undefined };

  it("should load default initialEditorState and set selection (sanity check)", async () => {
    const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
    updateSelection(editor, secondVerseTextNode);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getTextContent()).toBe("first verse text \n\nsecond verse text ");
      expect(root.getChildren().length).toBe(3);
      $expectSelectionToBe(secondVerseTextNode);
    });
  });

  it("should insert a chapter", () => {
    const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
    const markerAction = getUsjMarkerAction("c", expandedNoteKeyRef, undefined, undefined, {
      discrete: true,
    });
    updateSelection(editor, secondVerseTextNode);

    markerAction.action({ editor, reference });

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children.length).toBe(5);
      if (!$isImmutableChapterNode(children[3])) throw new Error("Inserted node is not a chapter");
      expect(children[3].getNumber()).toBe("2");
      if (!$isParaNode(children[4]))
        throw new Error("Inserted node after inserted chapter is not a ParaNode");
    });
  });

  describe("should insert a verse", () => {
    it("with no leading space", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("v", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 7);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isImmutableVerseNode(insertedNode)) throw new Error("Inserted node is not a verse");
        expect(insertedNode.getMarker()).toBe("v");
        // Note that renumbering happens in the `UsjNodesMenuPlugin` which isn't in scope here.
        expect(insertedNode.getNumber()).toBe("2");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe("verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });

    it("but move leading space to previous node", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("v", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isImmutableVerseNode(insertedNode)) throw new Error("Inserted node is not a verse");
        expect(insertedNode.getMarker()).toBe("v");
        // Note that renumbering happens in the `UsjNodesMenuPlugin` which isn't in scope here.
        expect(insertedNode.getNumber()).toBe("2");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe("verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });
  });

  describe("should insert a char", () => {
    it("with no leading space", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("wj", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 7);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("wj");
        expect(insertedNode.getTextContent()).toBe(EMPTY_CHAR_PLACEHOLDER_TEXT);
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe("verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });

    it("with leading space", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("wj", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("wj");
        expect(insertedNode.getTextContent()).toBe(EMPTY_CHAR_PLACEHOLDER_TEXT);
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });

    it("at end of para", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("wj", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second verse text ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("wj");
        expect(insertedNode.getTextContent()).toBe(EMPTY_CHAR_PLACEHOLDER_TEXT);
        const charTextNode = insertedNode.getChildAtIndex(0);
        if (!$isTextNode(charTextNode))
          throw new Error("Inserted char node does not have a text node");
        $expectSelectionToBe(charTextNode, 0);
      });
    });
  });

  describe("should wrap selection in char", () => {
    it("with no leading space", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("wj", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 7, secondVerseTextNode, 12);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("wj");
        expect(insertedNode.getTextContent()).toBe("verse");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" text ");
        const charTextNode = insertedNode.getChildAtIndex(0);
        if (!$isTextNode(charTextNode))
          throw new Error("Inserted char node does not have a text node");
        $expectSelectionToBe(charTextNode);
      });
    });

    it("but move leading space to previous node", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("wj", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6, secondVerseTextNode, 12);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("wj");
        expect(insertedNode.getTextContent()).toBe("verse");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" text ");
        const charTextNode = insertedNode.getChildAtIndex(0);
        if (!$isTextNode(charTextNode))
          throw new Error("Inserted char node does not have a text node");
        $expectSelectionToBe(charTextNode);
      });
    });
  });

  describe("should insert a note", () => {
    it("of type footnote", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("f", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Inserted node is not a note");
        expect(insertedNode.getMarker()).toBe("f");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type endnote", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("fe", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Inserted node is not a note");
        expect(insertedNode.getMarker()).toBe("fe");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type extended note", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("ef", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Inserted node is not a note");
        expect(insertedNode.getMarker()).toBe("ef");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type cross reference", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("x", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Inserted node is not a note");
        expect(insertedNode.getMarker()).toBe("x");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type extended cross reference", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction("ex", expandedNoteKeyRef, undefined, undefined, {
        discrete: true,
      });
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Inserted node is not a note");
        expect(insertedNode.getMarker()).toBe("ex");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });
  });
});
