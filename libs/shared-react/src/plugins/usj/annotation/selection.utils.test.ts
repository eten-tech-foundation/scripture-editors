// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $createImmutableVerseNode,
  ImmutableVerseNode,
} from "../../../nodes/usj/ImmutableVerseNode";
import { SelectionRange, AnnotationRange } from "./selection.model";
import { $getRangeFromUsjSelection, $getUsjSelectionFromEditor } from "./selection.utils";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $setState,
  LineBreakNode,
  TextNode,
} from "lexical";
import {
  $createChapterNode,
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createTypedMarkNode,
  $createVerseNode,
  ChapterNode,
  CharNode,
  closingMarkerText,
  ImmutableChapterNode,
  ImmutableTypedTextNode,
  MarkerNode,
  MilestoneNode,
  NBSP,
  openingMarkerText,
  ParaNode,
  textTypeState,
  TypedMarkNode,
  VerseNode,
} from "shared";

describe("$getRangeFromUsjSelection", () => {
  describe("UsjTextContentLocation", () => {
    it("should convert a collapsed USJ selection to an editor selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // caret at the end of "Hello"
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 5 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.focus.key).toBe(t1.getKey());
        expect(editorSelection.focus.offset).toBe(5);
      });
    });

    it("should convert a USJ selection with start and end to an editor selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // select "Hello" from "Hello world"
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 0 },
          end: { jsonPath: "$.content[0].content[0]", offset: 5 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.focus.key).toBe(t1.getKey());
        expect(editorSelection.focus.offset).toBe(5);
      });
    });

    it("should convert a USJ selection at end of para to an editor usjSelection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // select "world" from "Hello world"
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 6 },
          end: { jsonPath: "$.content[0].content[0]", offset: 11 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(6);
        expect(editorSelection.focus.key).toBe(t1.getKey());
        expect(editorSelection.focus.offset).toBe(11);
      });
    });

    it("should convert an AnnotationRange spanning multiple nodes", () => {
      let t1: TextNode;
      let t2: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("First paragraph");
        t2 = $createTextNode("Second paragraph");
        $getRoot().append($createParaNode().append(t1), $createParaNode().append(t2));
      });

      editor.getEditorState().read(() => {
        const annotation: AnnotationRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 5 },
          end: { jsonPath: "$.content[1].content[0]", offset: 6 },
        };
        const editorSelection = $getRangeFromUsjSelection(annotation);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.focus.key).toBe(t2.getKey());
        expect(editorSelection.focus.offset).toBe(6);
      });
    });

    it("should return undefined when location points to non-existent node", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[99].content[0]", offset: 0 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        expect(editorSelection).toBeUndefined();
      });
    });

    it("should handle text inside TypedMarkNode", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        t1 = $createTextNode("Marked text");
        $getRoot().append(
          $createParaNode().append($createTypedMarkNode({ testType: ["testId"] }).append(t1)),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0].content[0]", offset: 7 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(7);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjMarkerLocation", () => {
    it("should return undefined when element has no children", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode());
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        expect(editorSelection).toBeUndefined();
      });
    });

    it("should position at para opening MarkerNode (editable markers)", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at para opening ImmutableTypedTextNode marker (visible markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        para = $createParaNode();
        $getRoot().append(
          para.append(
            $createImmutableTypedTextNode("marker", openingMarkerText("p")),
            $createTextNode("Hello"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Visible markers normalize to the parent element at the marker's index.
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to start of para (hidden markers)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at character opening MarkerNode (editable markers)", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, CharNode, MarkerNode], () => {
        markerNode = $createMarkerNode("wj", "opening");
        $getRoot().append(
          $createParaNode().append(
            $createMarkerNode("p", "opening"),
            $createTextNode("Jesus said "),
            $createCharNode("wj").append(
              markerNode,
              $createTextNode('"Follow me."'),
              $createMarkerNode("wj", "closing"),
            ),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0].content[1]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at character opening ImmutableTypedTextNode marker (visible markers)", () => {
      let char: CharNode;
      const { editor } = createBasicTestEnvironment(
        [ParaNode, CharNode, ImmutableTypedTextNode, MarkerNode],
        () => {
          char = $createCharNode("wj");
          $getRoot().append(
            $createParaNode().append(
              $createMarkerNode("p", "opening"),
              $createTextNode("Jesus said "),
              char.append(
                $createImmutableTypedTextNode("marker", openingMarkerText("wj")),
                $createTextNode('"Follow me."'),
                $createImmutableTypedTextNode("marker", closingMarkerText("wj")),
              ),
            ),
          );
        },
      );

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0].content[1]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Visible markers normalize to the parent element at the marker's index.
        expect(editorSelection.anchor.key).toBe(char.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to start of character text (hidden markers)", () => {
      let t2: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, CharNode], () => {
        t2 = $createTextNode('"Follow me."');
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Jesus said "),
            $createCharNode("wj").append(t2),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = { start: { jsonPath: "$.content[0].content[1]" } };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t2.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjClosingMarkerLocation", () => {
    it("should position within character closing MarkerNode (editable markers)", () => {
      let closingMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, CharNode, MarkerNode], () => {
        closingMarker = $createMarkerNode("wj", "closing");
        $getRoot().append(
          $createParaNode().append(
            $createMarkerNode("p", "opening"),
            $createTextNode("Jesus said "),
            $createCharNode("wj").append(
              $createMarkerNode("wj", "opening"),
              $createTextNode('"Follow me."'),
              closingMarker,
            ),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[1]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(closingMarker.getKey());
        expect(editorSelection.anchor.offset).toBe(2);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position within character closing ImmutableTypedTextNode marker (visible markers)", () => {
      let char: CharNode;
      const { editor } = createBasicTestEnvironment(
        [ParaNode, CharNode, ImmutableTypedTextNode, MarkerNode],
        () => {
          char = $createCharNode("wj");
          $getRoot().append(
            $createParaNode().append(
              $createMarkerNode("p", "opening"),
              $createTextNode("Jesus said "),
              char.append(
                $createImmutableTypedTextNode("marker", openingMarkerText("wj")),
                $createTextNode('"Follow me."'),
                $createImmutableTypedTextNode("marker", closingMarkerText("wj")),
              ),
            ),
          );
        },
      );

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[1]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Visible markers normalize to the parent element at the marker's index.
        expect(editorSelection.anchor.key).toBe(char.getKey());
        expect(editorSelection.anchor.offset).toBe(2);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to end of character text (hidden markers)", () => {
      let t2: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, CharNode], () => {
        t2 = $createTextNode('"Follow me."');
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Jesus said "),
            $createCharNode("wj").append(t2),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[1]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t2.getKey());
        expect(editorSelection.anchor.offset).toBe(12);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjPropertyValueLocation", () => {
    it("should position within para opening MarkerNode (editable markers)", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("toc1", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].marker", propertyOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(3);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position within para opening ImmutableTypedTextNode marker (visible markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        para = $createParaNode();
        $getRoot().append(
          para.append(
            // ImmutableTypedTextNode text is "\toc1" (backslash + marker name)
            $createImmutableTypedTextNode("marker", openingMarkerText("toc1")),
            $createTextNode("Hello"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].marker", propertyOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Visible markers normalize to the parent element at the marker's index.
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to start of para (hidden markers)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0].marker", propertyOffset: 1 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjAttributeKeyLocation", () => {
    it("should position at end of chapter (since ca not yet rendered with editable markers)", () => {
      let chText: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ChapterNode], () => {
        chText = $createTextNode(String.raw`\c${NBSP}1 `);
        $getRoot().append(
          $createChapterNode("1", "2SA 1", "1 ca", "1 cp").append(chText),
          $createParaNode().append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(chText.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca not yet rendered with visible markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", true, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca never visible with hidden markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", false, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjAttributeMarkerLocation", () => {
    it("should position at end of chapter (since ca not yet rendered with editable markers)", () => {
      let chText: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ChapterNode], () => {
        chText = $createTextNode(String.raw`\c${NBSP}1 `);
        $getRoot().append(
          $createChapterNode("1", "2SA 1", "1 ca", "1 cp").append(chText),
          $createParaNode().append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(chText.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca not yet rendered with visible markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", true, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca never visible with hidden markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", false, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjClosingAttributeMarkerLocation", () => {
    it("should position at end of chapter (since ca not yet rendered with editable markers)", () => {
      let chText: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ChapterNode], () => {
        chText = $createTextNode(String.raw`\c${NBSP}1 `);
        $getRoot().append(
          $createChapterNode("1", "2SA 1", "1 ca", "1 cp").append(chText),
          $createParaNode().append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyClosingMarkerOffset: 2,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(chText.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca not yet rendered with visible markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", true, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyClosingMarkerOffset: 2,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at end of chapter (since ca never visible with hidden markers)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableChapterNode], () => {
        para = $createParaNode();
        $getRoot().append(
          $createImmutableChapterNode("1", false, "2SA 1", "1 ca", "1 cp"),
          para.append($createTextNode("hello")),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "altnumber",
            keyClosingMarkerOffset: 2,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(para.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("Edge cases for annotation ranges", () => {
    it("should handle selection spanning from marker to text (visible markers)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        t1 = $createTextNode("nor sit in the seat");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableTypedTextNode("marker", openingMarkerText("q2")),
            t1,
          ),
        );
      });

      editor.getEditorState().read(() => {
        // Selection from marker location to start of text content
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0]" },
          end: { jsonPath: "$.content[0].content[0]", offset: 0 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Start with para jsonPath should position at beginning of paragraph
        const para = t1.getParent();
        expect(editorSelection.anchor.key).toBe(para?.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.focus.key).toBe(t1.getKey());
        expect(editorSelection.focus.offset).toBe(0);
      });
    });

    it("should handle selection from inside the marker to text (visible markers)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        t1 = $createTextNode("nor sit in the seat");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableTypedTextNode("marker", openingMarkerText("q2")),
            t1,
          ),
        );
      });

      editor.getEditorState().read(() => {
        // Location with jsonPath pointing to para but with offset (from editor selection)
        // This is what you get when selecting "\q2 " in the editor
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0]", offset: 0 },
          end: { jsonPath: "$.content[0].content[0]", offset: 0 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        // Start with element jsonPath + offset should position at beginning of paragraph
        const para = t1.getParent();
        expect(editorSelection.anchor.key).toBe(para?.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.focus.key).toBe(t1.getKey());
        expect(editorSelection.focus.offset).toBe(0);
      });
    });
  });
});

describe("$getUsjSelectionFromEditor", () => {
  describe("UsjTextContentLocation", () => {
    it("should return undefined when there is no selection", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello world")));
      });

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        expect(usjSelection).toBeUndefined();
      });
    });

    it("should return USJ selection with start only for collapsed editor selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      // Non-null assertion is safe: t1 is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 5);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should return USJ selection with start only for collapsed editor selection after editable marker", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        t1 = $createTextNode("Hello world");
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        $getRoot().append(
          $createParaNode("h").append($createMarkerNode("h", "opening"), markerTrailingSpace, t1),
        );
      });
      // Non-null assertion is safe: t1 is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 0,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should return USJ selection with start and end for forward editor selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      // Non-null assertions are safe: t1 is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 0, t1!, 5);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 0,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
      });
    });

    it("should ignore non-content nodes when counting content indexes for editable para marker", () => {
      let verseText: TextNode;
      const { editor } = createBasicTestEnvironment(
        [ParaNode, VerseNode, MarkerNode, LineBreakNode],
        () => {
          const markerTrailingSpace = $createTextNode(NBSP);
          $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
          verseText = $createTextNode("In the beginning");
          $getRoot().append(
            $createParaNode("p").append(
              $createMarkerNode("p", "opening"),
              markerTrailingSpace,
              $createLineBreakNode(),
              $createVerseNode("1", `\v${NBSP}1 `),
              verseText,
            ),
          );
        },
      );
      // Non-null assertion is safe: verseText is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, verseText!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[1]",
          offset: 0,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for text in editable ms", () => {
      let milestoneText: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "attribute");
        milestoneText = $createTextNode("tree");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p", "opening"),
            markerTrailingSpace,
            $createTextNode("He will be like a"),
            $createMilestoneNode("ts-s", "ts.PSA.tree"),
            $createMarkerNode("ts-s", "opening"),
            msMarkerAttributes,
            $createMarkerNode("ts-s", "selfClosing"),
            milestoneText,
          ),
        );
      });
      // Non-null assertion is safe: milestoneText is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, milestoneText!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[2]",
          offset: 0,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should normalize backward editor selection to start before end", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      // Non-null assertions are safe: t1 is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 8, t1!, 3);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 3,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 8,
        });
      });
    });

    it("should return correct jsonPath for editor selection spanning multiple paragraphs", () => {
      let t1: TextNode;
      let t2: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("First paragraph");
        t2 = $createTextNode("Second paragraph");
        $getRoot().append($createParaNode().append(t1), $createParaNode().append(t2));
      });
      // Non-null assertions are safe: t1 and t2 are assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 5, t2!, 6);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[1].content[0]",
          offset: 6,
        });
      });
    });

    it("should return correct jsonPath for editor selection inside TypedMarkNode", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        t1 = $createTextNode("Marked text");
        $getRoot().append(
          $createParaNode().append($createTypedMarkNode({ testType: ["testId"] }).append(t1)),
        );
      });
      // Non-null assertions are safe: t1 is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, t1!, 3, t1!, 9);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[0].content[0]",
          offset: 3,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[0].content[0].content[0]",
          offset: 9,
        });
      });
    });

    it("should return USJ selection of ImmutableVerseNode as an atomic unit", () => {
      let paraNode: ParaNode;
      let textNode: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode], () => {
        paraNode = $createParaNode();
        textNode = $createTextNode("In the beginning");
        $getRoot().append(paraNode.append($createImmutableVerseNode("16"), textNode));
      });
      // Select the first child (verse node) using element-based editor selection on parent
      // offset 0 = before first child, across the verse node to the start of the following text.
      // Non-null assertions are safe: paraNode and textNode are assigned during setup.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, paraNode!, 0, textNode!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0]",
          offset: 0,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[0].content[1]",
          offset: 0,
        });
      });
    });

    it("should return USJ selection of ImmutableVerseNode as an atomic unit with visible markers", () => {
      let paraNode: ParaNode;
      let textNode: TextNode;
      const { editor } = createBasicTestEnvironment(
        [ParaNode, ImmutableTypedTextNode, ImmutableVerseNode],
        () => {
          paraNode = $createParaNode();
          textNode = $createTextNode("In the beginning");
          $getRoot().append(
            paraNode.append(
              $createImmutableTypedTextNode("marker", openingMarkerText("p")),
              $createImmutableVerseNode("16"),
              textNode,
            ),
          );
        },
      );
      // Select the first child (verse node) using element-based editor selection on parent
      // offset 0 = before first child, across the verse node to the start of the following text.
      // Non-null assertions are safe: paraNode and textNode are assigned during setup.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, paraNode!, 1, textNode!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0]",
          offset: 0,
        });
        expect(usjSelection.end).toEqual({
          jsonPath: "$.content[0].content[1]",
          offset: 0,
        });
      });
    });

    it("should emit element jsonPath + offset when cursor is at start of para with visible marker", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        para = $createParaNode();
        $getRoot().append(
          para.append(
            $createImmutableTypedTextNode("marker", openingMarkerText("q2")),
            $createTextNode("nor sit in the seat"),
          ),
        );
      });
      // Non-null assertion is safe: para is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, para!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({ jsonPath: "$.content[0]" });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should emit selection spanning from para start to text when para has visible marker", () => {
      let para: ParaNode;
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        para = $createParaNode();
        t1 = $createTextNode("nor sit in the seat");
        $getRoot().append(
          para.append($createImmutableTypedTextNode("marker", openingMarkerText("q2")), t1),
        );
      });
      // Non-null assertions are safe: para and t1 are assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, para!, 0, t1!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({ jsonPath: "$.content[0]" });
        expect(usjSelection.end).toEqual({ jsonPath: "$.content[0].content[0]", offset: 0 });
      });
    });
  });

  describe("UsjMarkerLocation", () => {
    it("should emit UsjMarkerLocation when cursor is at offset 0 in editable opening marker", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });
      // Non-null assertion is safe: markerNode is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, markerNode!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0]",
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for editable marker in ms", () => {
      let msOpeningMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "attribute");
        msOpeningMarker = $createMarkerNode("ts-s", "opening");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p", "opening"),
            markerTrailingSpace,
            $createTextNode("He will be like a"),
            $createMilestoneNode("ts-s", "ts.PSA.tree"),
            msOpeningMarker,
            msMarkerAttributes,
            $createMarkerNode("ts-s", "selfClosing"),
            $createTextNode("tree"),
          ),
        );
      });
      // Non-null assertion is safe: msOpeningMarker is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, msOpeningMarker!, 0);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[1]",
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });
  });

  describe("UsjPropertyValueLocation", () => {
    it("should emit UsjPropertyValueLocation when cursor is after backslash in editable opening marker", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });
      // Non-null assertion is safe: markerNode is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, markerNode!, 1);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].marker",
          propertyOffset: 0,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for property in editable ms", () => {
      let msOpeningMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "attribute");
        msOpeningMarker = $createMarkerNode("ts-s", "opening");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p", "opening"),
            markerTrailingSpace,
            $createTextNode("He will be like a"),
            $createMilestoneNode("ts-s", "ts.PSA.tree"),
            msOpeningMarker,
            msMarkerAttributes,
            $createMarkerNode("ts-s", "selfClosing"),
            $createTextNode("tree"),
          ),
        );
      });
      // Non-null assertion is safe: msOpeningMarker is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, msOpeningMarker!, 1);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[1].marker",
          propertyOffset: 0,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });
  });

  describe("UsjClosingMarkerLocation", () => {
    it("should emit UsjClosingMarkerLocation when cursor is in editable closing marker", () => {
      let closingMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        closingMarker = $createMarkerNode("nd", "closing");
        $getRoot().append(
          $createParaNode().append(
            $createMarkerNode("nd", "opening"),
            $createTextNode("name"),
            closingMarker,
          ),
        );
      });
      // Non-null assertion is safe: closingMarker is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, closingMarker!, 1);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0]",
          closingMarkerOffset: 1,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for editable closing marker in ms", () => {
      let msClosingMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "attribute");
        msClosingMarker = $createMarkerNode("ts-s", "selfClosing");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p", "opening"),
            markerTrailingSpace,
            $createTextNode("He will be like a"),
            $createMilestoneNode("ts-s", "ts.PSA.tree"),
            $createMarkerNode("ts-s", "opening"),
            msMarkerAttributes,
            msClosingMarker,
            $createTextNode("tree"),
          ),
        );
      });
      // Non-null assertion is safe: msClosingMarker is assigned during the test setup callback.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      updateSelection(editor, msClosingMarker!, 1);

      editor.getEditorState().read(() => {
        const usjSelection = $getUsjSelectionFromEditor();

        if (!usjSelection) throw new Error("Expected usjSelection to be defined");
        expect(usjSelection.start).toEqual({
          jsonPath: "$.content[0].content[1]",
          closingMarkerOffset: 1,
        });
        expect(usjSelection.end).toBeUndefined();
      });
    });
  });
});

describe("round-trip conversion", () => {
  it("should round-trip UsjTextContentLocation selection", () => {
    let t1: TextNode;
    const { editor } = createBasicTestEnvironment([ParaNode], () => {
      t1 = $createTextNode("Hello world");
      $getRoot().append($createParaNode().append(t1));
    });
    // Non-null assertions are safe: t1 is assigned during the test setup callback.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    updateSelection(editor, t1!, 2, t1!, 8);

    editor.getEditorState().read(() => {
      // Get the USJ selection from the editor
      const usjSelection = $getUsjSelectionFromEditor();
      if (!usjSelection) throw new Error("Expected usjSelection to be defined");

      // Convert back to an editor selection
      const editorSelection = $getRangeFromUsjSelection(usjSelection);
      if (!editorSelection) throw new Error("Expected editorSelection to be defined");

      // Verify it matches the original
      expect(editorSelection.anchor.key).toBe(t1.getKey());
      expect(editorSelection.anchor.offset).toBe(2);
      expect(editorSelection.focus.key).toBe(t1.getKey());
      expect(editorSelection.focus.offset).toBe(8);
    });
  });

  it("should round-trip UsjMarkerLocation selection with editable markers", () => {
    let markerNode: MarkerNode;
    const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
      markerNode = $createMarkerNode("p", "opening");
      $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
    });
    // Non-null assertion is safe: markerNode is assigned during the test setup callback.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    updateSelection(editor, markerNode!, 0);

    editor.getEditorState().read(() => {
      const usjSelection = $getUsjSelectionFromEditor();
      if (!usjSelection) throw new Error("Expected usjSelection to be defined");

      const editorSelection = $getRangeFromUsjSelection(usjSelection);
      if (!editorSelection) throw new Error("Expected editorSelection to be defined");

      expect(editorSelection.anchor.key).toBe(markerNode.getKey());
      expect(editorSelection.anchor.offset).toBe(0);
    });
  });

  it("should round-trip UsjClosingMarkerLocation selection with editable markers", () => {
    let closingMarker: MarkerNode;
    const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
      closingMarker = $createMarkerNode("nd", "closing");
      $getRoot().append(
        $createParaNode().append(
          $createMarkerNode("nd", "opening"),
          $createTextNode("name"),
          closingMarker,
        ),
      );
    });
    // Non-null assertion is safe: closingMarker is assigned during the test setup callback.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    updateSelection(editor, closingMarker!, 2);

    editor.getEditorState().read(() => {
      const usjSelection = $getUsjSelectionFromEditor();
      if (!usjSelection) throw new Error("Expected usjSelection to be defined");

      const editorSelection = $getRangeFromUsjSelection(usjSelection);
      if (!editorSelection) throw new Error("Expected editorSelection to be defined");

      expect(editorSelection.anchor.key).toBe(closingMarker.getKey());
      expect(editorSelection.anchor.offset).toBe(2);
    });
  });
});
