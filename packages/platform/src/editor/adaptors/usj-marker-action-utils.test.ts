// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $removeCharMarkerAtSelection,
  getUsjMarkerAction,
  isUsjMarkerSupported,
} from "./usj-marker-action.utils";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
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
  charIdState,
  closingMarkerText,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  NBSP,
  openingMarkerText,
} from "shared";

const nodes = usjReactNodes;
const reference = { book: "GEN", chapterNum: 1, verseNum: 1 };

let secondVerseTextNode: TextNode;
let charTextNode: TextNode;
let placeholderTextNode: TextNode;
let noteTextNode: TextNode;
let tailTextNode: TextNode;
let firstCharTextNode: TextNode;
let secondCharTextNode: TextNode;
let innerTextNode: TextNode;

function $defaultInitialEditorState() {
  secondVerseTextNode = $createTextNode("second verse text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append($createImmutableVerseNode("1"), $createTextNode("first verse text ")),
    $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
  );
}

/** Invokes the system under test inside a discrete update, the way `Editor.tsx` will. */
function sutRemoveCharMarker(editor: LexicalEditor, marker?: string, viewOptions?: ViewOptions) {
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        $removeCharMarkerAtSelection(selection, marker, viewOptions);
    },
    { discrete: true },
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
        expect(insertedNode.getNumber()).toBe("2");
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

  describe("should remove a char marker", () => {
    it("when the selection is exactly one CharNode", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(charTextNode),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      sutRemoveCharMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // CharNode gone, siblings normalized into a single TextNode.
        expect(para.getChildren().some($isCharNode)).toBe(false);
        expect(para.getChildrenSize()).toBe(1);
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("when the cursor is collapsed inside a CharNode", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(charTextNode),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 2);

      sutRemoveCharMarker(editor);

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
        charTextNode = $createTextNode("Lord");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("the "),
            $createCharNode("nd").append(charTextNode),
            $createTextNode(" said"),
          ),
        );
      });
      updateSelection(editor, charTextNode, 0, charTextNode, 4);

      sutRemoveCharMarker(editor, "wj");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const charNode = para.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("nd");
        expect(para.getTextContent()).toBe("the Lord said");
      });
    });

    it("skips a selection inside a NoteNode", () => {
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

      sutRemoveCharMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        const noteNode = para.getChildAtIndex(1);
        if (!$isNoteNode(noteNode)) throw new Error("noteNode is not a NoteNode");
        // $getTargetNode's note check only sees an immediate parent, which doesn't cover a
        // CharNode nested inside a NoteNode. It's $getCharNodeToRemove's own NoteNode guard that
        // skips this case, so the CharNode survives.
        expect(noteNode.getChildren().some($isCharNode)).toBe(true);
        expect(noteNode.getTextContent()).toBe("Lord");
      });
    });

    it("splits the CharNode when the selection is strictly inside it", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charTextNode = $createTextNode("Lorem ipsum");
        const charNode = $createCharNode("nd", { customAttr: "value" }).append(charTextNode);
        $setState(charNode, charIdState, "char-id");
        $getRoot().append($createParaNode("p").append(charNode));
      });
      // "Lo|rem ips|um"
      updateSelection(editor, charTextNode, 2, charTextNode, 9);

      sutRemoveCharMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        // N2: every character survives.
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

      sutRemoveCharMarker(editor, "nd");

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

      sutRemoveCharMarker(editor, "nd");

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

      sutRemoveCharMarker(editor, "nd");

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

      sutRemoveCharMarker(editor, "nd");

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

      sutRemoveCharMarker(editor, "nd");

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

      sutRemoveCharMarker(editor, "wj");

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

      sutRemoveCharMarker(editor);

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

      sutRemoveCharMarker(editor, "wj");

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

      sutRemoveCharMarker(editor, "wj");

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

      sutRemoveCharMarker(editor, "nd", {
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

      sutRemoveCharMarker(editor, "nd", {
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

      sutRemoveCharMarker(editor, "nd");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildren().some($isCharNode)).toBe(false);
        // The placeholder is synthesized, not content — it must not survive as real text.
        expect(para.getTextContent()).toBe("the said");
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
