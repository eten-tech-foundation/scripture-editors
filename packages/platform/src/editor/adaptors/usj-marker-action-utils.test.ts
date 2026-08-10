// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getUsjMarkerAction, isUsjMarkerSupported } from "./usj-marker-action.utils";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isTextNode,
  TextNode,
} from "lexical";
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
let noVerseText: TextNode;
let verse1Text: TextNode;
let insertedVerse2Text: TextNode;
let precedingVerseText: TextNode;

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
    const markerAction = getUsjMarkerAction(
      "c",
      expandedNoteKeyRef,
      undefined,
      undefined,
      undefined,
      {
        discrete: true,
      },
    );
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
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      updateSelection(editor, secondVerseTextNode, 7);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isImmutableVerseNode(insertedNode)) throw new Error("Inserted node is not a verse");
        expect(insertedNode.getMarker()).toBe("v");
        // Verse 2 is the chapter's last verse (no following verse): inferred from the actual
        // tree, not the stale reference.verseNum=1 this test's fixture reference carries.
        expect(insertedNode.getNumber()).toBe("3");
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe("verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });

    it("but move leading space to previous node", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second ");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isImmutableVerseNode(insertedNode)) throw new Error("Inserted node is not a verse");
        expect(insertedNode.getMarker()).toBe("v");
        expect(insertedNode.getNumber()).toBe("3"); // last verse in chapter: increment from tree
        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Tail node is not text");
        expect(tailTextNode.getTextContent()).toBe("verse text ");
        $expectSelectionToBe(tailTextNode, 0);
      });
    });
  });

  describe("verse-number inference", () => {
    it("inserts verse 1 with no highlight when no verse precedes the caret", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        noVerseText = $createTextNode("no verse yet");
        $getRoot().append($createImmutableChapterNode("1"), $createParaNode().append(noVerseText));
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, noVerseText, 0);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        const insertedNode = para.getChildren().find($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected an inserted verse node");
        expect(insertedNode.getNumber()).toBe("1");
        expect($isNodeSelection($getSelection())).toBe(false); // not highlighted
      });
    });

    it("increments across a gap with no highlight", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        verse1Text = $createTextNode("verse one ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("1"), verse1Text),
          $createParaNode().append($createImmutableVerseNode("4"), $createTextNode("verse four")),
        );
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, verse1Text);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        // findLast: the pre-existing verse 1 is also a child of this paragraph and comes first.
        const insertedNode = para.getChildren().findLast($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected an inserted verse node");
        expect(insertedNode.getNumber()).toBe("2"); // gap between 1 and 4: increment, not garbled
        expect($isNodeSelection($getSelection())).toBe(false);
      });
    });

    it("increments and highlights when preceding and following verses are adjacent (no numeric slot)", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        verse1Text = $createTextNode("first verse text ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("1"), verse1Text),
          $createParaNode().append(
            $createImmutableVerseNode("2"),
            $createTextNode("second verse text"),
          ),
        );
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, verse1Text);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        // findLast: the pre-existing verse 1 is also a child of this paragraph and comes first.
        const insertedNode = para.getChildren().findLast($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected an inserted verse node");
        expect(insertedNode.getNumber()).toBe("2");
        const sel = $getSelection();
        expect($isNodeSelection(sel)).toBe(true);
        if ($isNodeSelection(sel)) expect(sel.has(insertedNode.getKey())).toBe(true); // highlighted
      });
    });

    it("increments and highlights when the following verse is a bridge that contains the inserted number", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        precedingVerseText = $createTextNode("fourth verse text ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("4"), precedingVerseText),
          $createParaNode().append(
            $createImmutableVerseNode("5-6"),
            $createTextNode("bridged verse text"),
          ),
        );
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, precedingVerseText);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        const insertedNode = para.getChildren().findLast($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected an inserted verse node");
        expect(insertedNode.getNumber()).toBe("5"); // plain increment from 4
        const sel = $getSelection();
        expect($isNodeSelection(sel)).toBe(true);
        // 5 falls inside the following bridge 5-6, even though it isn't an exact-string match.
        if ($isNodeSelection(sel)) expect(sel.has(insertedNode.getKey())).toBe(true);
      });
    });

    it("does not highlight when the following bridge does not contain the inserted number", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        precedingVerseText = $createTextNode("fourth verse text ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("4"), precedingVerseText),
          $createParaNode().append(
            $createImmutableVerseNode("6-7"),
            $createTextNode("bridged verse text"),
          ),
        );
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, precedingVerseText);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        const insertedNode = para.getChildren().findLast($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected an inserted verse node");
        expect(insertedNode.getNumber()).toBe("5"); // plain increment from 4
        // The following verse IS a bridge (proving the check actually ran against it, not just
        // "no verse found"), but 5 falls outside 6-7, so this must not be flagged as a collision.
        expect($isNodeSelection($getSelection())).toBe(false);
      });
    });

    it("does not repeat or garble verse numbers when re-adding a missing verse into a gap", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        // "verse one " (10 chars) + "text" (4 chars): caret splits after the first part, leaving
        // "text" as a trailing node so a second insertion can be anchored right after the first.
        verse1Text = $createTextNode("verse one text");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("1"), verse1Text),
          $createParaNode().append($createImmutableVerseNode("4"), $createTextNode("verse four")),
        );
      });
      const markerAction = getUsjMarkerAction(
        "v",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        { discrete: true },
      );
      updateSelection(editor, verse1Text, 10);
      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        // findLast: the pre-existing verse 1 is also a child of this paragraph and comes first.
        const insertedNode = para.getChildren().findLast($isImmutableVerseNode);
        if (!insertedNode) throw new Error("Expected inserted verse");
        expect(insertedNode.getNumber()).toBe("2"); // not "11" or garbled
        const tail = insertedNode.getNextSibling();
        if (!$isTextNode(tail)) throw new Error("Expected trailing text node");
        insertedVerse2Text = tail;
      });

      // Re-add the next missing verse immediately after, simulating the user manually recovering
      // from an incomplete undo.
      updateSelection(editor, insertedVerse2Text, 0);
      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren()[1];
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
        const verseNumbers = para
          .getChildren()
          .filter($isImmutableVerseNode)
          .map((v) => v.getNumber());
        expect(verseNumbers).toEqual(["1", "2", "3"]); // clean sequence, no repeats
      });
    });
  });

  describe("should insert a char", () => {
    it("with no leading space", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "wj",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
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
      const markerAction = getUsjMarkerAction(
        "wj",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
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
      const markerAction = getUsjMarkerAction(
        "wj",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
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
      const markerAction = getUsjMarkerAction(
        "wj",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
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
      const markerAction = getUsjMarkerAction(
        "wj",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
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
    const referenceCVText = `${reference.chapterNum}:${reference.verseNum} `;

    it("of type footnote", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "f",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret after the word "second"
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Expected a NoteNode");
        expect(insertedNode.getMarker()).toBe("f");

        const frChar = insertedNode.getChildAtIndex(2);
        if (!$isCharNode(frChar)) throw new Error("Expected a CharNode");
        expect(frChar.getTextContent()).toBe(referenceCVText);

        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Expected a TextNode");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type endnote", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "fe",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret after the word "second"
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
      const markerAction = getUsjMarkerAction(
        "ef",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret after the word "second"
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
      const markerAction = getUsjMarkerAction(
        "x",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret after the word "second"
      updateSelection(editor, secondVerseTextNode, 6);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        expect(secondVerseTextNode.getTextContent()).toBe("second");
        const insertedNode = secondVerseTextNode.getNextSibling();
        if (!$isNoteNode(insertedNode)) throw new Error("Expected a NoteNode");
        expect(insertedNode.getMarker()).toBe("x");

        const xoChar = insertedNode.getChildAtIndex(2);
        if (!$isCharNode(xoChar)) throw new Error("Expected a CharNode");
        expect(xoChar.getTextContent()).toBe(referenceCVText);

        const tailTextNode = insertedNode.getNextSibling();
        if (!$isTextNode(tailTextNode)) throw new Error("Expected a TextNode");
        expect(tailTextNode.getTextContent()).toBe(" verse text ");
      });
    });

    it("of type extended cross reference", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "ex",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret after the word "second"
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

  describe("unsupported markers", () => {
    it("should return a no-op action for an unknown marker", () => {
      const result = getUsjMarkerAction("zzz", expandedNoteKeyRef);
      expect(result.label).toBeUndefined();
      expect(typeof result.action).toBe("function");
    });

    it.each(["p", "wj", "f", "v", "c"])("should not throw for supported marker '%s'", (marker) => {
      expect(() => getUsjMarkerAction(marker, expandedNoteKeyRef)).not.toThrow();
    });

    it("isUsjMarkerSupported returns false for unknown markers", () => {
      expect(isUsjMarkerSupported("zzz")).toBe(false);
    });

    it.each(["p", "wj", "f", "v", "c"])("isUsjMarkerSupported returns true for '%s'", (marker) => {
      expect(isUsjMarkerSupported(marker)).toBe(true);
    });
  });
});
