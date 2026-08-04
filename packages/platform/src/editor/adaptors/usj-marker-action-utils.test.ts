// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $extendCharacterMarkerAtSelection,
  $removeCharacterMarkerAtSelection,
  $replaceCharacterMarkerAtSelection,
  getUsjMarkerAction,
  isCharacterMarkerSupported,
  isUsjMarkerSupported,
} from "./usj-marker-action.utils";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createImmutableVerseNode,
  $isImmutableVerseNode,
  usjReactNodes,
  ViewOptions,
} from "shared-react";
import {
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isNoteNode,
  $isParaNode,
  CharNode,
  charIdState,
  closingMarkerText,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  NBSP,
  openingMarkerText,
} from "shared";

const nodes = usjReactNodes;
const reference = { book: "GEN", chapterNum: 1, verseNum: 1 };

let secondVerseTextNode: TextNode;
let noVerseText: TextNode;
let verse1Text: TextNode;
let insertedVerse2Text: TextNode;
let precedingVerseText: TextNode;
let charTextNode: TextNode;
let tailTextNode: TextNode;
let innerTextNode: TextNode;

function $defaultInitialEditorState() {
  secondVerseTextNode = $createTextNode("second verse text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append($createImmutableVerseNode("1"), $createTextNode("first verse text ")),
    $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
  );
}

/**
 * Builds the paragraph the character-marker tests default to: `the ` + a marked `Lord` + ` said`,
 * with the marked run as a single ordinary text child and no synthesized marker children.
 *
 * Only for tests whose fixture shape is incidental. Tests where the shape *is* the thing under test
 * - marker-mode children, NBSP prefixes, nesting, notes, empty-char placeholders - build their tree
 * inline, so the deviation stays visible at the test that depends on it.
 *
 * @param marker - The character marker to wrap `Lord` in.
 * @returns the text node inside the `CharNode`, which is what these tests select within.
 */
function $createCharParagraph(marker = "nd"): TextNode {
  const charText = $createTextNode("Lord");
  $getRoot().append(
    $createParaNode("p").append(
      $createTextNode("the "),
      $createCharNode(marker).append(charText),
      $createTextNode(" said"),
    ),
  );
  return charText;
}

/**
 * Invokes the system under test inside a discrete update, the way `Editor.tsx` will.
 *
 * @returns whether a marker was removed, mirroring what `EditorRef.removeCharacterMarker` reports.
 */
function sutRemoveCharacterMarker(
  editor: LexicalEditor,
  marker?: string,
  viewOptions?: ViewOptions,
): boolean {
  let didRemove = false;
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        didRemove = $removeCharacterMarkerAtSelection(selection, marker, viewOptions);
    },
    { discrete: true },
  );
  return didRemove;
}

/**
 * Invokes the system under test inside a discrete update, the way `Editor.tsx` will.
 *
 * @returns whether a marker was changed, mirroring what `EditorRef.replaceCharacterMarker` reports.
 */
function sutReplaceCharacterMarker(
  editor: LexicalEditor,
  toMarker: string,
  fromMarker?: string,
): boolean {
  let didReplace = false;
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        didReplace = $replaceCharacterMarkerAtSelection(selection, toMarker, fromMarker);
    },
    { discrete: true },
  );
  return didReplace;
}

/**
 * Invokes the system under test inside a discrete update, the way `Editor.tsx` will.
 *
 * @returns whether the marker was extended, mirroring what `EditorRef.extendCharacterMarker` reports.
 */
function sutExtendCharacterMarker(
  editor: LexicalEditor,
  marker: string,
  conflictingMarkers?: readonly string[],
  viewOptions?: ViewOptions,
): boolean {
  let didExtend = false;
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        didExtend = $extendCharacterMarkerAtSelection(
          selection,
          marker,
          conflictingMarkers,
          viewOptions,
        );
    },
    { discrete: true },
  );
  return didExtend;
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

  function $initialEditorStateWithNoChapterNode() {
    secondVerseTextNode = $createTextNode("second verse text ");
    $getRoot().append(
      $createParaNode().append(
        $createImmutableVerseNode("1"),
        $createTextNode("first verse text "),
      ),
      $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
    );
  }

  it("should insert the current chapter number (not incremented) when no chapter node exists yet", () => {
    const { editor } = createBasicTestEnvironment(nodes, $initialEditorStateWithNoChapterNode);
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
      expect(children.length).toBe(4);
      if (!$isImmutableChapterNode(children[2])) throw new Error("Inserted node is not a chapter");
      // reference.chapterNum is 1 — must be inserted as-is, not incremented to 2.
      expect(children[2].getNumber()).toBe("1");
      if (!$isParaNode(children[3]))
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
        // Caret INSIDE the span at the placeholder's end (PT9: typing fills the new span);
        // CharNodePlugin strips the placeholder once real content lands.
        const placeholder = insertedNode.getFirstChild();
        if (!$isTextNode(placeholder)) throw new Error("Placeholder is not text");
        $expectSelectionToBe(placeholder, placeholder.getTextContentSize());
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
        // Caret INSIDE the span at the placeholder's end (PT9: typing fills the new span).
        const placeholder = insertedNode.getFirstChild();
        if (!$isTextNode(placeholder)) throw new Error("Placeholder is not text");
        $expectSelectionToBe(placeholder, placeholder.getTextContentSize());
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
        // End of the placeholder, not offset 0: CharNodePlugin's placeholder strip matches a
        // LEADING placeholder (`startsWith`), so typed text must land after it.
        $expectSelectionToBe(charTextNode, charTextNode.getTextContentSize());
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

  describe("should remove a character marker", () => {
    it("when the cursor is collapsed inside a CharNode", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 2);

      expect(sutRemoveCharacterMarker(editor)).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Collapsed cursor removes the marker from the whole CharNode — no split.
        expect(para.getChildren().some($isCharNode)).toBe(false);
        expect(para.getChildrenSize()).toBe(1);
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("is a no-op when the requested marker is not present", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      expect(sutRemoveCharacterMarker(editor, "wj")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("nd");
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("dirties no node when the requested marker is not present", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      // A *partial* selection, unlike the whole-node selection in the test above: an unguarded
      // `handleTextNode` would `splitText(1, 3)` here, splitting "Lord" into three pieces.
      updateSelection(editor, charTextNode, 1, charTextNode, 3);

      // Asserting on dirty nodes rather than on the resulting tree: Lexical's reconciliation
      // re-merges adjacent simple text nodes, so the split is not observable afterwards — but it
      // still marks nodes dirty, and that is what puts an entry on the undo stack and produces a
      // collab delta. A documented no-op must not do either.
      // `dirtyElements` as well as `dirtyLeaves`: unwrapping or splitting a CharNode dirties an
      // *element*, which a leaf-only count would miss entirely.
      let dirtyLeafCount = 0;
      let dirtyElementCount = 0;
      const unregisterUpdateListener = editor.registerUpdateListener(
        ({ dirtyLeaves, dirtyElements }) => {
          dirtyLeafCount += dirtyLeaves.size;
          dirtyElementCount += dirtyElements.size;
        },
      );

      sutRemoveCharacterMarker(editor, "wj");
      unregisterUpdateListener();

      expect(dirtyLeafCount).toBe(0);
      expect(dirtyElementCount).toBe(0);
      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Lord said");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("nd");
      });
    });

    it("skips a selection inside a NoteNode", () => {
      let noteTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        noteTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createNoteNode("f", "+").append($createCharNode("nd").append(noteTextNode)),
          ),
        );
      });
      updateSelection(editor, noteTextNode, 0, noteTextNode, 4);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const noteNode = para.getChildAtIndex(1);
        if (!$isNoteNode(noteNode)) throw new Error("noteNode is not a NoteNode");
        // $getTargetNode's note check only sees an immediate parent, which doesn't cover a
        // CharNode nested inside a NoteNode. It's $getMatchingCharNode's own NoteNode guard that
        // skips this case, so the CharNode survives.
        expect(noteNode.getChildren().some($isCharNode)).toBe(true);
        expect(noteNode.getTextContent()).toBe("Lord");
      });
    });

    it("splits the CharNode when the selection is strictly inside it", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        const charNode = $createCharNode("nd", { customAttr: "value" });
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(charNode.append(charTextNode)));
      });
      // "Lo|rem ips|um"
      updateSelection(editor, charTextNode, 2, charTextNode, 9);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Every character of the marker's content survives the split.
        expect(para.getTextContent()).toBe("Lorem ipsum");
        const children = para.getChildren();
        expect(children.length).toBe(3);
        const [leading, middle, trailing] = children;
        if (!$isCharNode(leading)) throw new Error("leading is not a CharNode");
        if (!$isTextNode(middle)) throw new Error("middle is not a TextNode");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(leading.getMarker()).toBe("nd");
        expect(leading.getTextContent()).toBe("Lo");
        expect(middle.getTextContent()).toBe("rem ips");
        expect(trailing.getMarker()).toBe("nd");
        expect(trailing.getTextContent()).toBe("um");
        // $createCharNodeLike must carry the original's identity onto both clones, not just the
        // marker: the cid is what lets $charNodeTransform re-merge the halves later.
        expect($getState(leading, charIdState)).toBe("char-id");
        expect(leading.getUnknownAttributes()).toEqual({ customAttr: "value" });
        expect($getState(trailing, charIdState)).toBe("char-id");
        expect(trailing.getUnknownAttributes()).toEqual({ customAttr: "value" });
      });
    });

    it("splits off only a trailing clone when the selection covers the leading text", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        $getRoot().append($createParaNode("p").append($createCharNode("nd").append(charTextNode)));
      });
      // "[Lo]rem ipsum"
      updateSelection(editor, charTextNode, 0, charTextNode, 2);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lorem ipsum");
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [leading, trailing] = children;
        if (!$isTextNode(leading)) throw new Error("leading is not a TextNode");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(leading.getTextContent()).toBe("Lo");
        expect(trailing.getMarker()).toBe("nd");
        expect(trailing.getTextContent()).toBe("rem ipsum");
      });
    });

    it("splits off only a leading clone when the selection covers the trailing text", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        $getRoot().append($createParaNode("p").append($createCharNode("nd").append(charTextNode)));
      });
      // "Lorem ips[um]"
      updateSelection(editor, charTextNode, 9, charTextNode, 11);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lorem ipsum");
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [leading, trailing] = children;
        if (!$isCharNode(leading)) throw new Error("leading is not a CharNode");
        if (!$isTextNode(trailing)) throw new Error("trailing is not a TextNode");
        expect(leading.getMarker()).toBe("nd");
        expect(leading.getTextContent()).toBe("Lorem ips");
        expect(trailing.getTextContent()).toBe("um");
      });
    });

    it("when the selection spans a CharNode and plain text", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        tailTextNode = $createTextNode(" said");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(charTextNode),
            tailTextNode,
          ),
        );
      });
      // "the [Lord sa]id"
      updateSelection(editor, charTextNode, 0, tailTextNode, 3);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        // CharNode gone, siblings normalized into a single TextNode.
        expect(para.getChildrenSize()).toBe(1);
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("when the selection spans two sibling CharNodes", () => {
      let firstCharTextNode!: TextNode;
      let secondCharTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        firstCharTextNode = $createTextNode("Lord");
        secondCharTextNode = $createTextNode("God");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(firstCharTextNode),
            $createTextNode(" the "),
            $createCharNode("nd").append(secondCharTextNode),
          ),
        );
      });
      updateSelection(editor, firstCharTextNode, 0, secondCharTextNode, 3);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        expect(para.getTextContent()).toBe("Lord the God");
      });
    });

    it("removes the inner marker of a nested pair, leaving the outer intact", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lord");
        const outerCharNode = para.getFirstChild();
        if (!$isCharNode(outerCharNode)) throw new Error("outer is not a CharNode");
        expect(outerCharNode.getMarker()).toBe("wj");
        expect(outerCharNode.getChildren().some($isCharNode)).toBe(false);
        expect(outerCharNode.getTextContent()).toBe("Lord");
      });
    });

    it("removes the outer marker of a nested pair, leaving the inner intact", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutRemoveCharacterMarker(editor, "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lord");
        const innerCharNode = para.getFirstChild();
        if (!$isCharNode(innerCharNode)) throw new Error("inner is not a CharNode");
        expect(innerCharNode.getMarker()).toBe("nd");
        expect(innerCharNode.getTextContent()).toBe("Lord");
      });
    });

    it("removes the innermost marker when none is given", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutRemoveCharacterMarker(editor);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lord");
        const outerCharNode = para.getFirstChild();
        if (!$isCharNode(outerCharNode)) throw new Error("outer is not a CharNode");
        expect(outerCharNode.getMarker()).toBe("wj");
        expect(outerCharNode.getChildren().some($isCharNode)).toBe(false);
        expect(outerCharNode.getTextContent()).toBe("Lord");
      });
    });

    it("does not strip the outer marker from unselected text flanking a nested marker", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append(
              $createTextNode("the "),
              $createCharNode("nd").append(innerTextNode),
              $createTextNode(" said"),
            ),
          ),
        );
      });
      // Select only "Lord", inside the nested `nd`, and remove the outer `wj`.
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutRemoveCharacterMarker(editor, "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Lord said");
        const children = para.getChildren();
        expect(children.length).toBe(3);
        const [leading, middle, trailing] = children;
        // Unselected flanking text must keep its `wj` marker — only the selected span loses it.
        if (!$isCharNode(leading)) throw new Error("leading is not a CharNode");
        expect(leading.getMarker()).toBe("wj");
        expect(leading.getTextContent()).toBe("the ");
        if (!$isCharNode(middle)) throw new Error("middle is not a CharNode");
        expect(middle.getMarker()).toBe("nd");
        expect(middle.getTextContent()).toBe("Lord");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(trailing.getMarker()).toBe("wj");
        expect(trailing.getTextContent()).toBe(" said");
      });
    });

    it("does not strip the outer marker from a leading sibling of a fully covered nested marker", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append(
              $createTextNode("the "),
              $createCharNode("nd").append(innerTextNode),
            ),
          ),
        );
      });
      // Select all of "Lord", inside the nested `nd`, and remove the outer `wj`. Only one flanking
      // sibling exists (leading), exercising the split's leading-clone branch on its own.
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutRemoveCharacterMarker(editor, "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Lord");
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [leading, trailing] = children;
        // The unselected leading text must keep its `wj` marker; only the selected nested span
        // loses it.
        if (!$isCharNode(leading)) throw new Error("leading is not a CharNode");
        expect(leading.getMarker()).toBe("wj");
        expect(leading.getTextContent()).toBe("the ");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(trailing.getMarker()).toBe("nd");
        expect(trailing.getTextContent()).toBe("Lord");
      });
    });

    it("refuses to remove the outer marker when only part of a nested marker's span is selected", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append(
              $createTextNode("the "),
              $createCharNode("nd").append(innerTextNode),
              $createTextNode(" said"),
            ),
          ),
        );
      });
      // Select only "Lo" — part of the nested "Lord" — and remove the outer "wj".
      updateSelection(editor, innerTextNode, 0, innerTextNode, 2);

      sutRemoveCharacterMarker(editor, "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Lord said");
        // See $splitCharNodeAroundTargets docstring, "Refuses — partial coverage of a nested
        // CharNode": transitive coverage cannot split the inner `nd` CharNode at the selection
        // boundary, so the only removal available would strip "wj" from the whole of "Lord" —
        // including the unselected "rd". The removal is refused instead, so "wj" still covers the
        // entire span and no marker attribution changed anywhere. Asserted so that implementing
        // recursive nested splitting later trips this test rather than silently changing behavior.
        const children = para.getChildren();
        expect(children.length).toBe(1);
        const [outer] = children;
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        expect(outer.getMarker()).toBe("wj");
        expect(outer.getTextContent()).toBe("the Lord said");
        const inner = outer.getChildren().find($isCharNode);
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("nd");
        expect(inner.getTextContent()).toBe("Lord");
      });
    });

    it("dirties no node and leaves the selection alone when the removal is refused", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append(
              $createTextNode("the "),
              $createCharNode("nd").append(innerTextNode),
              $createTextNode(" said"),
            ),
          ),
        );
      });
      // Same partial-coverage-of-a-nested-marker shape as the test above, which asserts only the
      // final tree. Lexical re-merges the split halves, so that tree looks identical whether or not
      // the refuse path mutated on its way to refusing — this test covers that blind spot.
      updateSelection(editor, innerTextNode, 0, innerTextNode, 2);

      let dirtyLeafCount = 0;
      let dirtyElementCount = 0;
      const unregisterUpdateListener = editor.registerUpdateListener(
        ({ dirtyLeaves, dirtyElements }) => {
          dirtyLeafCount += dirtyLeaves.size;
          dirtyElementCount += dirtyElements.size;
        },
      );

      expect(sutRemoveCharacterMarker(editor, "wj")).toBe(false);
      unregisterUpdateListener();

      // A refused request is documented as a no-op, so it must not put an entry on the undo stack
      // or produce a collab delta. `$hasActionableCharNode` decides the refusal read-only, before
      // the splitting pass, which is what keeps both counts at zero.
      expect(dirtyLeafCount).toBe(0);
      expect(dirtyElementCount).toBe(0);
      editor.getEditorState().read(() => {
        // The selection restore block must not run either — a no-op has no business moving the
        // caller's selection off the range they chose.
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a range selection");
        expect(selection.anchor.getNode().getKey()).toBe(innerTextNode.getKey());
        expect(selection.anchor.offset).toBe(0);
        expect(selection.focus.getNode().getKey()).toBe(innerTextNode.getKey());
        expect(selection.focus.offset).toBe(2);
      });
    });

    it("strips synthesized MarkerNode children and the NBSP in markerMode 'editable'", () => {
      let charTextNodeSize = 0;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        // Mirrors usj-editor.adaptor.ts createChar under markerMode "editable": a MarkerNode
        // opening, each text child prefixed with NBSP, then a closing MarkerNode.
        charTextNode = $createTextNode(NBSP + "Lord");
        charTextNodeSize = charTextNode.getTextContentSize();
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              charTextNode,
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, charTextNode, charTextNodeSize);

      sutRemoveCharacterMarker(editor, "nd", {
        markerMode: "editable",
        hasSpacing: true,
        isFormattedFont: true,
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        // No literal \nd or \nd* left behind, and no stray NBSP.
        expect(para.getTextContent()).not.toContain(openingMarkerText("nd"));
        expect(para.getTextContent()).not.toContain(closingMarkerText("nd"));
        expect(para.getTextContent()).not.toContain(NBSP);
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("strips synthesized ImmutableTypedTextNode children in markerMode 'visible'", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        // Mirrors usj-editor.adaptor.ts createChar under markerMode "visible": immutable
        // typed-text markers on both sides and no NBSP prefix on the content.
        charTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(
              $createImmutableTypedTextNode("marker", openingMarkerText("nd")),
              charTextNode,
              $createImmutableTypedTextNode("marker", closingMarkerText("nd")),
            ),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      sutRemoveCharacterMarker(editor, "nd", {
        markerMode: "visible",
        hasSpacing: true,
        isFormattedFont: true,
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        expect(para.getTextContent()).not.toContain(openingMarkerText("nd"));
        expect(para.getTextContent()).not.toContain(closingMarkerText("nd"));
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("removes an empty CharNode outright instead of leaking the placeholder", () => {
      let placeholderTextNode!: TextNode;
      let placeholderTextNodeSize = 0;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        placeholderTextNode = $createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT);
        placeholderTextNodeSize = placeholderTextNode.getTextContentSize();
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(placeholderTextNode),
            $createTextNode("said"),
          ),
        );
      });
      updateSelection(editor, placeholderTextNode, 0, placeholderTextNode, placeholderTextNodeSize);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        // The placeholder is synthesized, not content — it must not survive as real text.
        expect(para.getTextContent()).toBe("the said");
      });
    });

    it("keeps the selection over the same characters after removal", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      // Select exactly "Lord".
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // CharNode gone, siblings normalized into a single TextNode.
        expect(para.getChildren().some($isCharNode)).toBe(false);
        expect(para.getChildrenSize()).toBe(1);
        expect(para.getTextContent()).toBe("the Lord said");
        // The three text nodes normalized into one, so assert on the survivor.
        const mergedTextNode = para.getFirstChild();
        if (!$isTextNode(mergedTextNode)) throw new Error("merged node is not a TextNode");
        expect(mergedTextNode.getTextContent()).toBe("the Lord said");
        // "the " is 4 chars, "Lord" is 4 more.
        $expectSelectionToBe(mergedTextNode, 4, mergedTextNode, 8);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a range selection");
        expect(selection.getTextContent()).toBe("Lord");
      });
    });

    it("keeps the selection backward when the original selection was backward", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      // Select "Lord" backward: anchor at the end, focus at the start.
      updateSelection(editor, charTextNode, 4, charTextNode, 0);

      sutRemoveCharacterMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const mergedTextNode = para.getFirstChild();
        if (!$isTextNode(mergedTextNode)) throw new Error("merged node is not a TextNode");
        expect(mergedTextNode.getTextContent()).toBe("the Lord said");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a range selection");
        // Direction preserved: anchor stays at the end (offset 8), focus at the start (offset 4) —
        // not normalized to forward.
        expect(selection.isBackward()).toBe(true);
        expect(selection.anchor.offset).toBe(8);
        expect(selection.focus.offset).toBe(4);
      });
    });

    it("restores the selection after the NBSP trim shifts content length in markerMode 'editable'", () => {
      let charTextNodeSize = 0;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode(NBSP + "Lord");
        charTextNodeSize = charTextNode.getTextContentSize();
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              charTextNode,
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" said"),
          ),
        );
      });
      // Select the whole CharNode's content (NBSP + "Lord"), so handleTextNode never calls
      // TextNode.splitText on it — splitText's own point-transfer logic never runs, unlike the
      // sibling test above whose split shape isn't exercised here.
      updateSelection(editor, charTextNode, 0, charTextNode, charTextNodeSize);

      sutRemoveCharacterMarker(editor, "nd", {
        markerMode: "editable",
        hasSpacing: true,
        isFormattedFont: true,
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const mergedTextNode = para.getFirstChild();
        if (!$isTextNode(mergedTextNode)) throw new Error("merged node is not a TextNode");
        expect(mergedTextNode.getTextContent()).toBe("the Lord said");
        // $removeCharNodeKeepingContent's NBSP trim calls TextNode.setTextContent, which only
        // mutates __text and never touches selection points. Without the restore, the pre-trim
        // focus offset (5, the end of NBSP+"Lord") survives the trim and then the merge shifts it
        // by the leading sibling's length alone, landing one character past "Lord"'s real end.
        $expectSelectionToBe(mergedTextNode, 4, mergedTextNode, 8);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a range selection");
        expect(selection.getTextContent()).toBe("Lord");
      });
    });

    it("keeps the collapsed caret positioned after the NBSP trim in markerMode 'editable'", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode(NBSP + "Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              charTextNode,
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" said"),
          ),
        );
      });
      // Collapse the caret at the end of "Lord" (offset 5 = NBSP + "Lord".length).
      updateSelection(editor, charTextNode, 5);

      sutRemoveCharacterMarker(editor, "nd", {
        markerMode: "editable",
        hasSpacing: true,
        isFormattedFont: true,
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const mergedTextNode = para.getFirstChild();
        if (!$isTextNode(mergedTextNode)) throw new Error("merged node is not a TextNode");
        expect(mergedTextNode.getTextContent()).toBe("the Lord said");
        // The caret was at the end of "Lord" (offset 5 within NBSP + "Lord"). Once the NBSP is
        // trimmed and the siblings merge, it must land at "the Lord"'s end (offset 8), not one
        // character past it — the collapsed-branch counterpart to the range-branch restore above.
        $expectSelectionToBe(mergedTextNode, 8);
      });
    });

    it("known limitation: an interior selection leaves an unpaired marker under 'visible'", () => {
      let targetTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        // A single ordinary text child. `handleTextNode`'s own `splitText(4, 8)` below carves it
        // into "the " / "Lord" / " said" siblings inside the `CharNode`, so the 5-child shape this
        // test pins is one an everyday selection-and-remove reaches, not a hand-built fixture.
        targetTextNode = $createTextNode("the Lord said");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(
              $createImmutableTypedTextNode("marker", openingMarkerText("nd")),
              targetTextNode,
              $createImmutableTypedTextNode("marker", closingMarkerText("nd")),
            ),
          ),
        );
      });
      // Select only the interior "Lord" (offsets 4-8), leaving real unselected text between it and
      // each boundary marker — the shape $splitCharNodeAroundTargets' docstring documents as
      // unhandled.
      updateSelection(editor, targetTextNode, 4, targetTextNode, 8);

      sutRemoveCharacterMarker(editor, "nd", {
        markerMode: "visible",
        hasSpacing: true,
        isFormattedFont: true,
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Known limitation (see $splitCharNodeAroundTargets docstring, "interior partial coverage
        // under marker mode"): the boundary-marker fold only reaches a marker immediately adjacent
        // to the covered range. Here real unselected text ("the " / " said") sits between each
        // marker and the covered "Lord", so neither marker folds, and each ends up alone in a
        // leading/trailing clone that $removeCharNodeKeepingContent never sees — the marker is
        // never stripped. Asserting today's actual (broken) output so a future fix to this
        // limitation is noticed here rather than silently reintroduced.
        expect(para.getTextContent()).toContain(openingMarkerText("nd"));
        expect(para.getTextContent()).toContain(closingMarkerText("nd"));
        expect(para.getTextContent()).toBe(
          `${openingMarkerText("nd")}the Lord said${closingMarkerText("nd")}`,
        );
      });
    });
  });

  describe("should replace a character marker", () => {
    it("when the cursor is collapsed inside a CharNode", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 2);

      expect(sutReplaceCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Collapsed cursor changes the whole CharNode — no split.
        expect(para.getChildrenSize()).toBe(3);
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("targets the innermost marker when fromMarker is omitted", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 2);

      sutReplaceCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const outer = para.getFirstChild();
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        expect(outer.getMarker()).toBe("wj");
        const inner = outer.getFirstChild();
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("bd");
        expect(para.getTextContent()).toBe("Lord");
      });
    });

    it("targets the outer marker when fromMarker names it", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 2);

      sutReplaceCharacterMarker(editor, "bd", "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const outer = para.getFirstChild();
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        expect(outer.getMarker()).toBe("bd");
        const inner = outer.getFirstChild();
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("nd");
      });
    });

    it("is a no-op when the requested marker is not present", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 2);

      expect(sutReplaceCharacterMarker(editor, "bd", "wj")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("nd");
      });
    });

    it("dirties no node when the target marker is already in place", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 2);

      const charNodeKey = editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        return charNode.getKey();
      });

      // Asserting on dirty nodes rather than the resulting tree: a same-marker replace is
      // indistinguishable from a no-op by inspection, but a mutating implementation would still
      // put an entry on the undo stack and produce a collab delta. Checking the CharNode's key
      // specifically rather than `dirtyElements.size`, because Lexical routinely marks the root
      // dirty on any update — that would make a size assertion flaky without proving anything.
      let dirtyLeafCount = 0;
      let charNodeWasDirtied = false;
      const unregisterUpdateListener = editor.registerUpdateListener(
        ({ dirtyElements, dirtyLeaves }) => {
          dirtyLeafCount += dirtyLeaves.size;
          if (dirtyElements.has(charNodeKey)) charNodeWasDirtied = true;
        },
      );

      expect(sutReplaceCharacterMarker(editor, "nd")).toBe(false);
      unregisterUpdateListener();

      expect(dirtyLeafCount).toBe(0);
      expect(charNodeWasDirtied).toBe(false);
    });

    it("skips a selection inside a NoteNode", () => {
      let noteTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        noteTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createNoteNode("f", "+").append($createCharNode("nd").append(noteTextNode)),
          ),
        );
      });
      updateSelection(editor, noteTextNode, 2);

      expect(sutReplaceCharacterMarker(editor, "bd", "nd")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const noteNode = para.getChildAtIndex(1);
        if (!$isNoteNode(noteNode)) throw new Error("noteNode is not a NoteNode");
        const charNode = noteNode.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        // $getMatchingCharNode's own NoteNode guard is what skips this.
        expect(charNode.getMarker()).toBe("nd");
      });
    });

    it("preserves unknown attributes and the char id", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        const charNode = $createCharNode("nd", { customAttr: "value" });
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(charNode.append(charTextNode)));
      });
      updateSelection(editor, charTextNode, 2);

      sutReplaceCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        expect(charNode.getUnknownAttributes()).toEqual({ customAttr: "value" });
        expect($getState(charNode, charIdState)).toBe("char-id");
        expect(charNode.getTextContent()).toBe("Lord");
      });
    });

    it("splits the CharNode when the selection is strictly inside it", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        const charNode = $createCharNode("nd", { customAttr: "value" });
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(charNode.append(charTextNode)));
      });
      // "Lo|rem ips|um"
      updateSelection(editor, charTextNode, 2, charTextNode, 9);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Every character survives the split.
        expect(para.getTextContent()).toBe("Lorem ipsum");
        const children = para.getChildren();
        expect(children.length).toBe(3);
        const [leading, middle, trailing] = children;
        if (!$isCharNode(leading)) throw new Error("leading is not a CharNode");
        if (!$isCharNode(middle)) throw new Error("middle is not a CharNode");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(leading.getMarker()).toBe("nd");
        expect(leading.getTextContent()).toBe("Lo");
        expect(middle.getMarker()).toBe("bd");
        expect(middle.getTextContent()).toBe("rem ips");
        expect(trailing.getMarker()).toBe("nd");
        expect(trailing.getTextContent()).toBe("um");
        // The clones must carry the original's identity so $charNodeTransform can re-merge later.
        expect($getState(leading, charIdState)).toBe("char-id");
        expect(leading.getUnknownAttributes()).toEqual({ customAttr: "value" });
        expect($getState(trailing, charIdState)).toBe("char-id");
        expect(trailing.getUnknownAttributes()).toEqual({ customAttr: "value" });
      });
    });

    it("splits off only a trailing clone when the selection covers the leading text", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        $getRoot().append($createParaNode("p").append($createCharNode("nd").append(charTextNode)));
      });
      // "[Lo]rem ipsum"
      updateSelection(editor, charTextNode, 0, charTextNode, 2);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Lorem ipsum");
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [covered, trailing] = children;
        if (!$isCharNode(covered)) throw new Error("covered is not a CharNode");
        if (!$isCharNode(trailing)) throw new Error("trailing is not a CharNode");
        expect(covered.getMarker()).toBe("bd");
        expect(covered.getTextContent()).toBe("Lo");
        expect(trailing.getMarker()).toBe("nd");
        expect(trailing.getTextContent()).toBe("rem ipsum");
      });
    });

    it("when the selection spans a CharNode and plain text", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        tailTextNode = $createTextNode(" said");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(charTextNode),
            tailTextNode,
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, tailTextNode, 5);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Lord said");
        const charNode = para.getChildren().find($isCharNode);
        if (!charNode) throw new Error("no CharNode survived");
        // The plain text is untouched; only the marked run changes.
        expect(charNode.getMarker()).toBe("bd");
        expect(charNode.getTextContent()).toBe("Lord");
      });
    });

    it("when the selection spans two sibling CharNodes", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        tailTextNode = $createTextNode("God");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(charTextNode),
            $createCharNode("nd").append(tailTextNode),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, tailTextNode, 3);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("LordGod");
        const charNodes = para.getChildren().filter($isCharNode);
        expect(charNodes.length).toBe(2);
        // Both matched, so both change. Merging them is $charNodeTransform's job, and that plugin
        // is not registered in this environment.
        charNodes.forEach((charNode) => expect(charNode.getMarker()).toBe("bd"));
      });
    });

    it("keeps a backward selection spanning two CharNodes valid across the splits", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("the Lord");
        tailTextNode = $createTextNode("God said");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(charTextNode),
            $createCharNode("nd").append(tailTextNode),
          ),
        );
      });
      // Backward, and partial at both ends: anchor inside the second CharNode, focus inside the
      // first. Both CharNodes get split, so both selection points sit on nodes that move.
      updateSelection(editor, tailTextNode, 3, charTextNode, 4);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the LordGod said");
        // Only the covered runs changed; the uncovered flanks keep \nd.
        const markers = para
          .getChildren()
          .filter($isCharNode)
          .map((charNode) => ({
            marker: charNode.getMarker(),
            text: charNode.getTextContent(),
          }));
        expect(markers).toContainEqual({ marker: "bd", text: "Lord" });
        expect(markers).toContainEqual({ marker: "bd", text: "God" });
        expect(markers).toContainEqual({ marker: "nd", text: "the " });
        expect(markers).toContainEqual({ marker: "nd", text: " said" });
        // The point of the test: replacement adds no selection restore of its own (unlike removal),
        // so this is what proves the original points survived the splits. Same covered text, same
        // direction, both endpoints still attached.
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a range selection");
        expect(selection.isBackward()).toBe(true);
        expect(selection.anchor.getNode().isAttached()).toBe(true);
        expect(selection.focus.getNode().isAttached()).toBe(true);
        expect(selection.getTextContent()).toBe("LordGod");
      });
    });

    it("when the selection spans a sibling that already carries toMarker", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        tailTextNode = $createTextNode("God");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(charTextNode),
            $createCharNode("bd").append(tailTextNode),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, tailTextNode, 3);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("LordGod");
        const charNodes = para.getChildren().filter($isCharNode);
        expect(charNodes.length).toBe(2);
        const [changed, alreadyTarget] = charNodes;
        // The \nd sibling changes to \bd...
        expect(changed.getMarker()).toBe("bd");
        expect(changed.getTextContent()).toBe("Lord");
        // ...but the sibling already at \bd is left alone rather than re-dirtied. Re-checked per
        // CharNode inside the loop, not just the pre-flight $hasActionableCharNode guard, because a
        // selection can span one CharNode needing the change and one that already has it.
        expect(alreadyTarget.getMarker()).toBe("bd");
        expect(alreadyTarget.getTextContent()).toBe("God");
      });
    });

    it("known limitation: a merge with an adjacent sibling keeps both marker texts under 'visible'", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        tailTextNode = $createTextNode("God");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(
              $createImmutableTypedTextNode("marker", openingMarkerText("nd")),
              charTextNode,
              $createImmutableTypedTextNode("marker", closingMarkerText("nd")),
            ),
            $createCharNode("bd").append(
              $createImmutableTypedTextNode("marker", openingMarkerText("bd")),
              tailTextNode,
              $createImmutableTypedTextNode("marker", closingMarkerText("bd")),
            ),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, tailTextNode, 3);

      expect(sutReplaceCharacterMarker(editor, "bd", "nd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNodes = para.getChildren().filter($isCharNode);
        // Known limitation of *this* environment: createBasicTestEnvironment does not mount
        // CharNodePlugin, so $charNodeTransform — the thing that would merge the now identically
        // marked siblings — never runs, and the two CharNodes stay separate here.
        expect(charNodes.length).toBe(2);
        charNodes.forEach((charNode) => expect(charNode.getMarker()).toBe("bd"));
        // Known limitation of the feature (see EditorRef.replaceCharacterMarker's TSDoc): each
        // side keeps its own retargeted opening/closing marker text, so once the merge does run in
        // the real editor that text ends up side by side in the merged node's interior
        // (`\bd Lord\bd*\bd God\bd*` rather than `\bd Lord God\bd*`). Asserting today's actual
        // output so a future fix to this limitation is noticed here rather than silently
        // reintroduced. It is excluded from USJ export and self-corrects on the next USJ load.
        expect(para.getTextContent()).toBe(
          `${openingMarkerText("bd")}Lord${closingMarkerText("bd")}` +
            `${openingMarkerText("bd")}God${closingMarkerText("bd")}`,
        );
      });
    });

    it("changes the inner marker of a nested pair, leaving the outer intact", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const outer = para.getFirstChild();
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        expect(outer.getMarker()).toBe("wj");
        const inner = outer.getFirstChild();
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("bd");
        expect(para.getTextContent()).toBe("Lord");
      });
    });

    it("changes the outer marker of a nested pair, leaving the inner intact", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      updateSelection(editor, innerTextNode, 0, innerTextNode, 4);

      sutReplaceCharacterMarker(editor, "bd", "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const outer = para.getFirstChild();
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        expect(outer.getMarker()).toBe("bd");
        const inner = outer.getFirstChild();
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("nd");
        expect(para.getTextContent()).toBe("Lord");
      });
    });

    it("refuses to change the outer marker when only part of a nested marker's span is selected", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        innerTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("wj").append($createCharNode("nd").append(innerTextNode)),
          ),
        );
      });
      // "Lo|rd" — only part of the nested \nd span.
      updateSelection(editor, innerTextNode, 0, innerTextNode, 2);

      expect(sutReplaceCharacterMarker(editor, "bd", "wj")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const outer = para.getFirstChild();
        if (!$isCharNode(outer)) throw new Error("outer is not a CharNode");
        // Refused rather than changing \wj across text the user never selected.
        expect(outer.getMarker()).toBe("wj");
        const inner = outer.getFirstChild();
        if (!$isCharNode(inner)) throw new Error("inner is not a CharNode");
        expect(inner.getMarker()).toBe("nd");
        expect(para.getTextContent()).toBe("Lord");
      });
    });

    it("dirties no node when a range selection's marker is already the target", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        $getRoot().append($createParaNode("p").append($createCharNode("nd").append(charTextNode)));
      });
      // A *partial* selection: an unguarded pass would splitText(2, 9) before discovering there is
      // nothing to change.
      updateSelection(editor, charTextNode, 2, charTextNode, 9);

      let dirtyLeafCount = 0;
      const unregisterUpdateListener = editor.registerUpdateListener(({ dirtyLeaves }) => {
        dirtyLeafCount += dirtyLeaves.size;
      });

      expect(sutReplaceCharacterMarker(editor, "nd", "nd")).toBe(false);
      unregisterUpdateListener();

      expect(dirtyLeafCount).toBe(0);
      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(1);
        expect(para.getTextContent()).toBe("Lorem ipsum");
      });
    });

    it("keeps the selection over the same characters after the change", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createCharParagraph();
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        // Replacement changes no text lengths and detaches no nodes, so the original points stay
        // valid without the explicit restore that removal needs.
        $expectSelectionToBe(charTextNode, 0, charTextNode, 4);
      });
    });

    it("keeps the selection over the same characters after a change that splits the CharNode", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        $getRoot().append($createParaNode("p").append($createCharNode("nd").append(charTextNode)));
      });
      // "Lo|rem ips|um" — strictly inside, unlike the fully-covered case above, so
      // $splitCharNodeAroundTargets actually moves the uncovered text into sibling clones and the
      // original charTextNode ends up in the middle (changed) clone rather than staying in place.
      updateSelection(editor, charTextNode, 2, charTextNode, 9);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const middle = para.getChildAtIndex(1);
        if (!$isCharNode(middle)) throw new Error("middle is not a CharNode");
        const middleText = middle.getFirstChild();
        if (!$isTextNode(middleText)) throw new Error("middleText is not a TextNode");
        expect(middleText.getTextContent()).toBe("rem ips");
        $expectSelectionToBe(middleText, 0, middleText, 7);
      });
    });

    it("retargets synthesized MarkerNode children in markerMode 'editable'", () => {
      let charTextNodeSize = 0;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        // Mirrors usj-editor.adaptor.ts createChar under markerMode "editable": a MarkerNode
        // opening, each text child prefixed with NBSP, then a closing MarkerNode.
        charTextNode = $createTextNode(NBSP + "Lord");
        charTextNodeSize = charTextNode.getTextContentSize();
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              charTextNode,
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, charTextNode, charTextNodeSize);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        const text = para.getTextContent();
        // The new marker is rendered, and no stale \nd or \nd* survives.
        expect(text).toContain(openingMarkerText("bd"));
        expect(text).toContain(closingMarkerText("bd"));
        expect(text).not.toContain(openingMarkerText("nd"));
        expect(text).not.toContain(closingMarkerText("nd"));
        // The NBSP is presentation the adaptor added; replacement neither trims nor duplicates it.
        expect(charNode.getTextContent()).toContain(NBSP + "Lord");
      });
    });

    it("leaves a stale MarkerNode fragment alone when a selection splits it mid-marker", () => {
      let openMarkerNode!: TextNode;
      let closeMarkerNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        openMarkerNode = $createMarkerNode("nd");
        closeMarkerNode = $createMarkerNode("nd", "closing");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(openMarkerNode, charTextNode, closeMarkerNode),
          ),
        );
      });
      // Anchored one character into the opening marker's own text ("\|nd"), not into the content —
      // reaches handleTextNode -> splitText on the MarkerNode itself, leaving a fragment whose text
      // no longer matches "nd"'s opening form even though its stored __marker is still "nd".
      updateSelection(editor, openMarkerNode, 1, charTextNode, 4);

      sutReplaceCharacterMarker(editor, "bd", "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        // Guarded correctly, the split fragments ("\" and "nd") are left verbatim rather than each
        // being expanded to a full opening marker, which would duplicate it (e.g. "\bd\bdLord").
        // The stale, unretargeted opening text is a documented pre-existing limitation (splitting a
        // MarkerNode mid-marker), not something this fix is responsible for; only the closing
        // marker — untouched by the split — is correctly retargeted.
        expect(para.getTextContent()).toBe(`\\ndLord${closingMarkerText("bd")}`);
      });
    });
  });

  describe("should extend a character marker", () => {
    it("wraps the uncovered text beside an existing run without nesting", () => {
      let koloTextNode!: TextNode;
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        koloTextNode = $createTextNode("kolo ");
        muluTextNode = $createTextNode("Mulu");
        $getRoot().append(
          $createParaNode("p").append(koloTextNode, $createCharNode("bd").append(muluTextNode)),
        );
      });
      // "[kolo \bd Mulu\bd*]"
      updateSelection(editor, koloTextNode, 0, muluTextNode, 4);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // Every character survives, in order.
        expect(para.getTextContent()).toBe("kolo Mulu");
        // Two adjacent siblings, not one nested inside the other. `$charNodeTransform` merges them
        // into one in the real editor; this headless environment registers no transforms, so the
        // pre-merge shape is what's asserted here. The merged result is covered in `Editor.test.tsx`.
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [extended, existing] = children;
        if (!$isCharNode(extended)) throw new Error("extended is not a CharNode");
        if (!$isCharNode(existing)) throw new Error("existing is not a CharNode");
        expect(extended.getMarker()).toBe("bd");
        expect(extended.getTextContent()).toBe("kolo ");
        expect(existing.getMarker()).toBe("bd");
        expect(existing.getTextContent()).toBe("Mulu");
        expect(existing.getChildren().some($isCharNode)).toBe(false);
      });
    });

    it("wraps gaps on either side of a covered run separately, preserving text order", () => {
      let koloTextNode!: TextNode;
      let sanaTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        koloTextNode = $createTextNode("kolo ");
        sanaTextNode = $createTextNode(" sana");
        $getRoot().append(
          $createParaNode("p").append(
            koloTextNode,
            $createCharNode("bd").append($createTextNode("Mulu")),
            sanaTextNode,
          ),
        );
      });
      updateSelection(editor, koloTextNode, 0, sanaTextNode, 5);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // The two gaps are not adjacent siblings, so they must get one wrapper each. Appending both
        // to a single wrapper would move " sana" next to "kolo " and scramble the text.
        expect(para.getTextContent()).toBe("kolo Mulu sana");
        const children = para.getChildren();
        expect(children.length).toBe(3);
        children.forEach((child) => {
          if (!$isCharNode(child)) throw new Error("child is not a CharNode");
          expect(child.getMarker()).toBe("bd");
          expect(child.getChildren().some($isCharNode)).toBe(false);
        });
      });
    });

    it("wraps a gap that sits inside a different marker, nesting it there", () => {
      let koloTextNode!: TextNode;
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        koloTextNode = $createTextNode("kolo ");
        muluTextNode = $createTextNode("Mulu");
        $getRoot().append(
          $createParaNode("p").append(koloTextNode, $createCharNode("nd").append(muluTextNode)),
        );
      });
      // "[kolo \nd Mul]u\nd*"
      updateSelection(editor, koloTextNode, 0, muluTextNode, 3);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("kolo Mulu");
        const [outerBd, ndNode] = para.getChildren();
        if (!$isCharNode(outerBd)) throw new Error("outerBd is not a CharNode");
        if (!$isCharNode(ndNode)) throw new Error("ndNode is not a CharNode");
        expect(outerBd.getMarker()).toBe("bd");
        expect(outerBd.getTextContent()).toBe("kolo ");
        // The piece inside \nd is wrapped where it sits. Extend is purely additive — it never
        // rewrites the USJ of unselected text — so the nested-partial-coverage refusal that removal
        // and replacement need does not apply. \nd itself is untouched.
        expect(ndNode.getMarker()).toBe("nd");
        const [innerBd, uncovered] = ndNode.getChildren();
        if (!$isCharNode(innerBd)) throw new Error("innerBd is not a CharNode");
        if (!$isTextNode(uncovered)) throw new Error("uncovered is not a TextNode");
        expect(innerBd.getMarker()).toBe("bd");
        expect(innerBd.getTextContent()).toBe("Mul");
        expect(uncovered.getTextContent()).toBe("u");
      });
    });

    it("copies the neighboring run's identity onto the wrapper so the two can merge", () => {
      let koloTextNode!: TextNode;
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        koloTextNode = $createTextNode("kolo ");
        muluTextNode = $createTextNode("Mulu");
        const charNode = $createCharNode("bd", { customAttr: "value" });
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(koloTextNode, charNode.append(muluTextNode)));
      });
      updateSelection(editor, koloTextNode, 0, muluTextNode, 4);

      sutExtendCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const wrapper = para.getFirstChild();
        if (!$isCharNode(wrapper)) throw new Error("wrapper is not a CharNode");
        // `$hasSameCharAttributes` requires both nodes to have a cid or neither to — a wrapper
        // without one would never merge with its neighbor in a collab document.
        expect($getState(wrapper, charIdState)).toBe("char-id");
        expect(wrapper.getUnknownAttributes()).toEqual({ customAttr: "value" });
      });
    });

    it("creates a plain wrapper when there is no neighboring run to match", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("kolo Mulu");
        $getRoot().append($createParaNode("p").append(charTextNode));
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 9);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const wrapper = para.getFirstChild();
        if (!$isCharNode(wrapper)) throw new Error("wrapper is not a CharNode");
        expect(wrapper.getMarker()).toBe("bd");
        expect(wrapper.getTextContent()).toBe("kolo Mulu");
        expect($getState(wrapper, charIdState)).toBeUndefined();
      });
    });

    it("is a no-op for a collapsed selection", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Mulu");
        $getRoot().append($createParaNode("p").append(charTextNode));
      });
      updateSelection(editor, charTextNode, 2);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
      });
    });

    it("is a no-op when the selection is already fully covered, without dirtying anything", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Mulu");
        $getRoot().append($createParaNode("p").append($createCharNode("bd").append(charTextNode)));
      });
      // "\bd [Mul]u\bd*" — a partial selection, so a mutating implementation would `splitText`.
      updateSelection(editor, charTextNode, 0, charTextNode, 3);

      // The tree shape alone can't tell a no-op from a split-then-remerge: only the dirty sets can.
      // An entry on the undo stack (and a collab delta) is exactly what must not happen here.
      let dirtyLeafCount = 0;
      const unregisterUpdateListener = editor.registerUpdateListener(({ dirtyLeaves }) => {
        dirtyLeafCount += dirtyLeaves.size;
      });

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(false);
      unregisterUpdateListener();

      expect(dirtyLeafCount).toBe(0);
      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().length).toBe(1);
        expect(para.getTextContent()).toBe("Mulu");
      });
    });

    it("skips a selection inside a NoteNode", () => {
      let noteTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        noteTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createNoteNode("f", "+").append(noteTextNode),
          ),
        );
      });
      updateSelection(editor, noteTextNode, 0, noteTextNode, 4);

      // `$getTargetNode` drops a leaf whose immediate parent is a NoteNode, so nothing is
      // actionable and the note's text is never wrapped.
      expect(sutExtendCharacterMarker(editor, "bd")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const noteNode = para.getLastChild();
        if (!$isNoteNode(noteNode)) throw new Error("noteNode is not a NoteNode");
        expect(noteNode.getChildren().some($isCharNode)).toBe(false);
        expect(noteNode.getTextContent()).toBe("Lord");
      });
    });

    it("skips a selection inside a CharNode nested in a NoteNode", () => {
      let noteTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        noteTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createNoteNode("f", "+").append($createCharNode("nd").append(noteTextNode)),
          ),
        );
      });
      updateSelection(editor, noteTextNode, 0, noteTextNode, 4);

      // `$getTargetNode` only drops a leaf whose *immediate* parent is a NoteNode, so this deeper
      // shape reaches the gap filter. It's `$isInsideNote` that refuses it: without that guard the
      // absent `$getMatchingCharNode` match would read as "uncovered" and wrap the note's text.
      expect(sutExtendCharacterMarker(editor, "bd")).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const noteNode = para.getLastChild();
        if (!$isNoteNode(noteNode)) throw new Error("noteNode is not a NoteNode");
        const charNode = noteNode.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("nd");
        expect(charNode.getChildren().some($isCharNode)).toBe(false);
        expect(noteNode.getTextContent()).toBe("Lord");
      });
    });

    it("moves a leading space out of the new marker, as the insert path does", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("the Mulu");
        $getRoot().append($createParaNode("p").append(charTextNode));
      });
      // "the[ Mulu]" — one text node, not two adjacent ones: Lexical's `$normalizeTextNode` merges
      // same-format adjacent text siblings on commit, so a two-node fixture would be gone before
      // the test could select it. The split happens inside the SUT, as it does in the real editor.
      updateSelection(editor, charTextNode, 3, charTextNode, 8);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("the Mulu");
        const [leading, wrapper] = para.getChildren();
        if (!$isTextNode(leading)) throw new Error("leading is not a TextNode");
        if (!$isCharNode(wrapper)) throw new Error("wrapper is not a CharNode");
        // A \bd span never starts with a space — the rule `$moveLeadingSpaceToPreviousNode` already
        // enforces on the insert path.
        expect(leading.getTextContent()).toBe("the ");
        expect(wrapper.getTextContent()).toBe("Mulu");
      });
    });

    it("keeps a leading space inside the wrapper when it will merge with the previous run", () => {
      let muluTextNode!: TextNode;
      let koloTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode("Mulu");
        koloTextNode = $createTextNode(" kolo");
        $getRoot().append(
          $createParaNode("p").append($createCharNode("bd").append(muluTextNode), koloTextNode),
        );
      });
      updateSelection(editor, muluTextNode, 0, koloTextNode, 5);

      expect(sutExtendCharacterMarker(editor, "bd")).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Mulu kolo");
        // Moving the space out would put a plain TextNode between the two \bd runs and stop
        // `$charNodeTransform` merging them. After the merge the space is interior, so the span
        // still doesn't start with a space — the insert path's actual rule is honored.
        const children = para.getChildren();
        expect(children.length).toBe(2);
        const [existing, wrapper] = children;
        if (!$isCharNode(existing)) throw new Error("existing is not a CharNode");
        if (!$isCharNode(wrapper)) throw new Error("wrapper is not a CharNode");
        expect(existing.getTextContent()).toBe("Mulu");
        expect(wrapper.getTextContent()).toBe(" kolo");
      });
    });

    it("leaves an interior space alone when extending over it", () => {
      let koloTextNode!: TextNode;
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        koloTextNode = $createTextNode("kolo ");
        muluTextNode = $createTextNode("Mulu");
        $getRoot().append(
          $createParaNode("p").append(koloTextNode, $createCharNode("bd").append(muluTextNode)),
        );
      });
      updateSelection(editor, koloTextNode, 0, muluTextNode, 4);

      sutExtendCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // No trailing-space handling is invented: the insert path has no opinion about it, and
        // OQ-7 is still open. The space stays where the user put it.
        expect(para.getTextContent()).toBe("kolo Mulu");
        expect(para.getFirstChild()?.getTextContent()).toBe("kolo ");
      });
    });

    it("leaves the selection over the same characters", () => {
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode(" Mulu");
        $getRoot().append($createParaNode("p").append(muluTextNode));
      });
      updateSelection(editor, muluTextNode, 0, muluTextNode, 5);

      sutExtendCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // The space moved out of the marker but stayed in the document.
        expect(para.getTextContent()).toBe(" Mulu");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a RangeSelection");
        // The focus offset was 5 against a node the trim shortened to 4. Without the restore it is
        // out of range, and Lexical's `setDOMSelectionBaseAndExtent` throws and warns.
        expect(selection.getTextContent()).toBe("Mulu");
        expect(selection.isBackward()).toBe(false);
      });
    });

    it("keeps a backward selection backward", () => {
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode(" Mulu");
        $getRoot().append($createParaNode("p").append(muluTextNode));
      });
      // Anchor at the end, focus at the start.
      updateSelection(editor, muluTextNode, 5, muluTextNode, 0);

      sutExtendCharacterMarker(editor, "bd");

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("selection is not a RangeSelection");
        expect(selection.getTextContent()).toBe("Mulu");
        // `isBackward` is captured before the mutation; restoring forward would silently flip the
        // user's selection direction.
        expect(selection.isBackward()).toBe(true);
      });
    });

    it("removes a conflicting marker before extending over it", () => {
      let muluTextNode!: TextNode;
      let koloTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode("Mulu");
        koloTextNode = $createTextNode("kolo");
        $getRoot().append(
          $createParaNode("p").append($createCharNode("it").append(muluTextNode), koloTextNode),
        );
      });
      updateSelection(editor, muluTextNode, 0, koloTextNode, 4);

      expect(sutExtendCharacterMarker(editor, "bd", ["it"])).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Mulukolo");
        // \it is gone and \bd covers everything. The conflict list is the caller's — nothing about
        // bd/it is hard-coded here (OQ-6).
        const charNodes = para.getChildren().filter($isCharNode);
        expect(charNodes.every((charNode) => charNode.getMarker() === "bd")).toBe(true);
        expect(charNodes.map((charNode) => charNode.getTextContent()).join("")).toBe("Mulukolo");
      });
    });

    it("ignores a conflicting marker that isn't in the selection", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("kolo Mulu");
        $getRoot().append($createParaNode("p").append(charTextNode));
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 9);

      expect(sutExtendCharacterMarker(editor, "bd", ["it"])).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const wrapper = para.getFirstChild();
        if (!$isCharNode(wrapper)) throw new Error("wrapper is not a CharNode");
        expect(wrapper.getMarker()).toBe("bd");
        expect(wrapper.getTextContent()).toBe("kolo Mulu");
      });
    });

    it("still extends when a conflicting marker's removal is refused", () => {
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode("Mulu");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("it").append($createCharNode("nd").append(muluTextNode)),
          ),
        );
      });
      // "\it \nd [Mu]lu\nd*\it*" — removing \it would have to strip it from the whole \nd span,
      // including "lu", which the user never selected, so `$hasActionableCharNode` refuses it.
      updateSelection(editor, muluTextNode, 0, muluTextNode, 2);

      // Best-effort: the refused conflict is left in place and the extend still happens, rather
      // than the whole call silently doing nothing.
      expect(sutExtendCharacterMarker(editor, "bd", ["it"])).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Mulu");
        const itNode = para.getFirstChild();
        if (!$isCharNode(itNode)) throw new Error("itNode is not a CharNode");
        expect(itNode.getMarker()).toBe("it");
        const ndNode = itNode.getFirstChild();
        if (!$isCharNode(ndNode)) throw new Error("ndNode is not a CharNode");
        expect(ndNode.getMarker()).toBe("nd");
        const bdNode = ndNode.getFirstChild();
        if (!$isCharNode(bdNode)) throw new Error("bdNode is not a CharNode");
        expect(bdNode.getMarker()).toBe("bd");
        expect(bdNode.getTextContent()).toBe("Mu");
      });
    });

    it("reports a change when only a conflicting marker was removed", () => {
      let muluTextNode!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        muluTextNode = $createTextNode("Mulu");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("bd").append($createCharNode("it").append(muluTextNode)),
          ),
        );
      });
      updateSelection(editor, muluTextNode, 0, muluTextNode, 4);

      // Already fully covered by \bd, so the gap pass does nothing — but \it still had to go, and
      // the caller must be told the document changed.
      expect(sutExtendCharacterMarker(editor, "bd", ["it"])).toBe(true);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getTextContent()).toBe("Mulu");
        const bdNode = para.getFirstChild();
        if (!$isCharNode(bdNode)) throw new Error("bdNode is not a CharNode");
        expect(bdNode.getMarker()).toBe("bd");
        expect(bdNode.getChildren().some($isCharNode)).toBe(false);
      });
    });

    it("ignores a conflicting marker equal to the target marker, preserving the run's identity", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Mulu");
        const charNode = $createCharNode("bd");
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(charNode.append(charTextNode)));
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      // Passing "bd" as its own conflicting marker is caller error, but must not be treated as a
      // real conflict: removing and re-wrapping the same run would strip its CharNode — including
      // the cid — and rebuild a fresh, identity-less one. The selection is already fully covered by
      // "bd", and "bd" is the only (self-referential) conflicting marker, so once it's ignored there
      // is nothing left to do.
      expect(sutExtendCharacterMarker(editor, "bd", ["bd"])).toBe(false);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        expect(charNode.getTextContent()).toBe("Mulu");
        // The cid survives untouched. Without the self-filter, the conflict pass would have removed
        // this CharNode (stripping its cid) and the gap pass would then have rewrapped it with a
        // fresh, cid-less identity.
        expect($getState(charNode, charIdState)).toBe("char-id");
      });
    });
  });

  // Footnote/cross-reference content markers (\fr \ft \xo \xt …) are inserted OPEN by convention:
  // PT9's inserter emits them closer-less and ParatextData records closed="false". Since closer
  // DISPLAY now keys on state (an explicitly-closed span renders its closer), that OPEN default is
  // carried as an explicit closed="false" on the palette template (getMarkerAction) rather than
  // relying on the marker family in the display path — otherwise a cursor-only insert of these
  // markers would come out closed. This test environment is hidden marker mode (no glyphs render),
  // so the mode-independent signal is the closed state itself. A body char marker keeps NO flag.
  describe("inserts a footnote/cross-reference content marker open (closed=false)", () => {
    it.each(["xt", "xo", "fr", "ft"])("cursor-only \\%s carries closed=false", (marker) => {
      // Sanity: the marker really is one of the content families this default targets.
      expect(
        CharNode.isValidFootnoteMarker(marker) || CharNode.isValidCrossReferenceMarker(marker),
      ).toBe(true);
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        marker,
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
        const span = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(span)) throw new Error("Inserted node is not a char");
        expect(span.getMarker()).toBe(marker);
        expect(span.getUnknownAttributes()?.closed).toBe("false");
      });
    });

    it("a plain body char marker (\\nd) is unaffected: no closed flag", () => {
      const { editor } = createBasicTestEnvironment(nodes, $defaultInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "nd",
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
        const span = secondVerseTextNode.getNextSibling();
        if (!$isCharNode(span)) throw new Error("Inserted node is not a char");
        expect(span.getMarker()).toBe("nd");
        expect(span.getUnknownAttributes()?.closed).toBeUndefined();
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

  describe("should insert a char into a note", () => {
    let noteCharTextNode: TextNode;
    let noteSpacerTextNode: TextNode;

    function $noteInitialEditorState() {
      noteCharTextNode = $createTextNode("existing footnote text");
      noteSpacerTextNode = $createTextNode(NBSP);
      $getRoot().append(
        $createImmutableChapterNode("1"),
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode("first verse text "),
          $createNoteNode("f", "+", false).append(
            $createCharNode("ft").append(noteCharTextNode),
            noteSpacerTextNode,
          ),
        ),
      );
    }

    // Regression test for PT-3780.
    it("places the caret inside the newly inserted marker", () => {
      const { editor } = createBasicTestEnvironment(nodes, $noteInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "fk",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret directly inside the note, after its existing content
      updateSelection(editor, noteSpacerTextNode);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const insertedNode = noteSpacerTextNode.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("Inserted node is not a char");
        expect(insertedNode.getMarker()).toBe("fk");
        expect($isNoteNode(insertedNode.getParent())).toBe(true);
        const charTextNode = insertedNode.getChildAtIndex(0);
        if (!$isTextNode(charTextNode))
          throw new Error("Inserted char node does not have a text node");
        $expectSelectionToBe(charTextNode);
      });
    });

    // When the caret is inside an existing footnote CharNode, the new marker is inserted at the
    // caret — the char is split so the marker lands between its two halves, inside the note.
    it("splits the footnote char at the caret and inserts the marker between the halves", () => {
      const { editor } = createBasicTestEnvironment(nodes, $noteInitialEditorState);
      const markerAction = getUsjMarkerAction(
        "fk",
        expandedNoteKeyRef,
        undefined,
        undefined,
        undefined,
        {
          discrete: true,
        },
      );
      // caret in the middle of the existing footnote text (parent is the ft CharNode, not the note)
      updateSelection(editor, noteCharTextNode, 8);

      markerAction.action({ editor, reference });

      editor.getEditorState().read(() => {
        const ftChar = noteCharTextNode.getParent();
        if (!$isCharNode(ftChar)) throw new Error("Existing footnote char is missing");
        expect($isNoteNode(ftChar.getParent())).toBe(true);
        // The text before the caret stays in the original char.
        expect(ftChar.getTextContent()).toBe("existing");
        // The new marker is inserted right after it, still inside the note.
        const insertedNode = ftChar.getNextSibling();
        if (!$isCharNode(insertedNode)) throw new Error("New marker is not after the split char");
        expect(insertedNode.getMarker()).toBe("fk");
        expect($isNoteNode(insertedNode.getParent())).toBe(true);
        // The text after the caret moves into a following clone of the original char.
        const tailChar = insertedNode.getNextSibling();
        if (!$isCharNode(tailChar)) throw new Error("Tail footnote char is missing");
        expect(tailChar.getMarker()).toBe("ft");
        expect(tailChar.getTextContent()).toBe(" footnote text");
        // The caret lands inside the new marker.
        const charTextNode = insertedNode.getChildAtIndex(0);
        if (!$isTextNode(charTextNode))
          throw new Error("Inserted char node does not have a text node");
        $expectSelectionToBe(charTextNode);
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

    it.each(["wj", "nd", "bd"])(
      "isCharacterMarkerSupported returns true for character marker '%s'",
      (marker) => {
        expect(isCharacterMarkerSupported(marker)).toBe(true);
      },
    );

    it.each(["p", "f", "v", "c", "zzz"])(
      "isCharacterMarkerSupported returns false for non-character marker '%s'",
      (marker) => {
        expect(isCharacterMarkerSupported(marker)).toBe(false);
      },
    );

    it("isCharacterMarkerSupported honors extraValidMarkers, unlike isUsjMarkerSupported", () => {
      expect(isCharacterMarkerSupported("zzz", ["zzz"])).toBe(true);
      expect(isUsjMarkerSupported("zzz")).toBe(false);
    });
  });
});
