// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../../libs/shared/src/nodes/usj/test.utils";
import { SelectionRange, AnnotationRange } from "./selection.model";
import { $getRangeFromSelection, $getRangeFromEditor } from "./selection.utils";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $setState,
  LineBreakNode,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createTypedMarkNode,
  $createVerseNode,
  MarkerNode,
  MilestoneNode,
  NBSP,
  ParaNode,
  textTypeState,
  TypedMarkNode,
  VerseNode,
} from "shared";

describe("$getRangeFromSelection", () => {
  describe("UsjTextContentLocation", () => {
    it("should convert a collapsed SelectionRange to a RangeSelection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // caret at the end of "Hello"
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 5 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(5);
        expect(rangeSelection.focus.key).toBe(t1.getKey());
        expect(rangeSelection.focus.offset).toBe(5);
      });
    });

    it("should convert a SelectionRange with start and end to a RangeSelection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // select "Hello" from "Hello world"
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 0 },
          end: { jsonPath: "$.content[0].content[0]", offset: 5 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(0);
        expect(rangeSelection.focus.key).toBe(t1.getKey());
        expect(rangeSelection.focus.offset).toBe(5);
      });
    });

    it("should convert a SelectionRange at end of para to a RangeSelection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        // select "world" from "Hello world"
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0]", offset: 6 },
          end: { jsonPath: "$.content[0].content[0]", offset: 11 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(6);
        expect(rangeSelection.focus.key).toBe(t1.getKey());
        expect(rangeSelection.focus.offset).toBe(11);
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
        const rangeSelection = $getRangeFromSelection(annotation);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(5);
        expect(rangeSelection.focus.key).toBe(t2.getKey());
        expect(rangeSelection.focus.offset).toBe(6);
      });
    });

    it("should return undefined when location points to non-existent node", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[99].content[0]", offset: 0 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        expect(rangeSelection).toBeUndefined();
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
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].content[0].content[0]", offset: 7 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(7);
        expect(rangeSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjMarkerLocation", () => {
    it("should position at opening MarkerNode when present", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]" },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(markerNode.getKey());
        expect(rangeSelection.anchor.offset).toBe(0);
      });
    });

    it("should fall back to first text node when no MarkerNode exists", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]" },
        };

        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(0);
      });
    });

    it("should return undefined when element has no children", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode());
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]" },
        };

        const rangeSelection = $getRangeFromSelection(selection);
        expect(rangeSelection).toBeUndefined();
      });
    });
  });

  describe("UsjClosingMarkerLocation", () => {
    it("should position within closing MarkerNode when present", () => {
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

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]", closingMarkerOffset: 2 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(closingMarker.getKey());
        expect(rangeSelection.anchor.offset).toBe(2);
      });
    });

    it("should fall back to end of last text node when no closing MarkerNode exists", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]", closingMarkerOffset: 2 },
        };

        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(5);
      });
    });
  });

  describe("UsjPropertyValueLocation", () => {
    it("should position within opening MarkerNode when property is 'marker'", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("para", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].marker", propertyOffset: 2 },
        };
        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(markerNode.getKey());
        expect(rangeSelection.anchor.offset).toBe(3);
      });
    });

    it("should fall back to first text node when MarkerNode doesn't exist", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0].marker", propertyOffset: 1 },
        };

        const rangeSelection = $getRangeFromSelection(selection);

        if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");
        expect(rangeSelection.anchor.key).toBe(t1.getKey());
        expect(rangeSelection.anchor.offset).toBe(0);
      });
    });
  });

  describe("unsupported UsjDocumentLocation types", () => {
    it("should throw error for UsjAttributeKeyLocation", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const selection = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
            keyOffset: 0,
          },
        };

        expect(() => $getRangeFromSelection(selection as SelectionRange)).toThrow(
          /Unsupported UsjDocumentLocation type/,
        );
      });
    });
  });
});

describe("$getRangeFromEditor", () => {
  describe("UsjTextContentLocation", () => {
    it("should return undefined when there is no selection", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello world")));
      });

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        expect(range).toBeUndefined();
      });
    });

    it("should return SelectionRange with start only for collapsed selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      updateSelection(editor, t1!, 5);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should return SelectionRange with start only for collapsed selection after marker", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        t1 = $createTextNode("Hello world");
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        $getRoot().append(
          $createParaNode("h").append($createMarkerNode("h", "opening"), markerTrailingSpace, t1),
        );
      });
      updateSelection(editor, t1!, 0);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 0,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should return SelectionRange with start and end for forward range selection", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      updateSelection(editor, t1!, 0, t1!, 5);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 0,
        });
        expect(range.end).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
      });
    });

    it("should ignore non-content nodes when counting content indexes for para marker", () => {
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
      updateSelection(editor, verseText!, 0);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[1]",
          offset: 0,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for text in ms", () => {
      let milestoneText: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "marker-attributes");
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
      updateSelection(editor, milestoneText!, 0);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[2]",
          offset: 0,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should normalize backward selection to start before end", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello world");
        $getRoot().append($createParaNode().append(t1));
      });
      updateSelection(editor, t1!, 8, t1!, 3);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 3,
        });
        expect(range.end).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 8,
        });
      });
    });

    it("should return correct jsonPath for selection spanning multiple paragraphs", () => {
      let t1: TextNode;
      let t2: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("First paragraph");
        t2 = $createTextNode("Second paragraph");
        $getRoot().append($createParaNode().append(t1), $createParaNode().append(t2));
      });
      updateSelection(editor, t1!, 5, t2!, 6);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0]",
          offset: 5,
        });
        expect(range.end).toEqual({
          jsonPath: "$.content[1].content[0]",
          offset: 6,
        });
      });
    });

    it("should return correct jsonPath for selection inside TypedMarkNode", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        t1 = $createTextNode("Marked text");
        $getRoot().append(
          $createParaNode().append($createTypedMarkNode({ testType: ["testId"] }).append(t1)),
        );
      });
      updateSelection(editor, t1!, 3, t1!, 9);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[0].content[0]",
          offset: 3,
        });
        expect(range.end).toEqual({
          jsonPath: "$.content[0].content[0].content[0]",
          offset: 9,
        });
      });
    });
  });

  describe("UsjMarkerLocation", () => {
    it("should emit UsjMarkerLocation when cursor is at offset 0 in opening marker", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });
      updateSelection(editor, markerNode!, 0);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0]",
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for marker in ms", () => {
      let msOpeningMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "marker-attributes");
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
      updateSelection(editor, msOpeningMarker!, 0);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[1]",
        });
        expect(range.end).toBeUndefined();
      });
    });
  });

  describe("UsjPropertyValueLocation", () => {
    it("should emit UsjPropertyValueLocation when cursor is after backslash in opening marker", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });
      updateSelection(editor, markerNode!, 1);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].marker",
          propertyOffset: 0,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for property in ms", () => {
      let msOpeningMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "marker-attributes");
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
      updateSelection(editor, msOpeningMarker!, 1);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[1].marker",
          propertyOffset: 0,
        });
        expect(range.end).toBeUndefined();
      });
    });
  });

  describe("UsjClosingMarkerLocation", () => {
    it("should emit UsjClosingMarkerLocation when cursor is in closing marker", () => {
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
      updateSelection(editor, closingMarker!, 1);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0]",
          closingMarkerOffset: 1,
        });
        expect(range.end).toBeUndefined();
      });
    });

    it("should ignore non-content nodes when counting content indexes for closing marker in ms", () => {
      let msClosingMarker: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode, MilestoneNode], () => {
        const markerTrailingSpace = $createTextNode(NBSP);
        $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
        const msMarkerAttributes = $createTextNode(`${NBSP}|sid="ts.PSA.tree"`);
        $setState(msMarkerAttributes, textTypeState, "marker-attributes");
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
      updateSelection(editor, msClosingMarker!, 1);

      editor.getEditorState().read(() => {
        const range = $getRangeFromEditor();

        if (!range) throw new Error("Expected range to be defined");
        expect(range.start).toEqual({
          jsonPath: "$.content[0].content[1]",
          closingMarkerOffset: 1,
        });
        expect(range.end).toBeUndefined();
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
    updateSelection(editor, t1!, 2, t1!, 8);

    editor.getEditorState().read(() => {
      // Get the selection range from the editor
      const range = $getRangeFromEditor();
      if (!range) throw new Error("Expected range to be defined");

      // Convert back to RangeSelection
      const rangeSelection = $getRangeFromSelection(range);
      if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");

      // Verify it matches the original
      expect(rangeSelection.anchor.key).toBe(t1.getKey());
      expect(rangeSelection.anchor.offset).toBe(2);
      expect(rangeSelection.focus.key).toBe(t1.getKey());
      expect(rangeSelection.focus.offset).toBe(8);
    });
  });

  it("should round-trip UsjMarkerLocation selection", () => {
    let markerNode: MarkerNode;
    const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
      markerNode = $createMarkerNode("p", "opening");
      $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
    });
    updateSelection(editor, markerNode!, 0);

    editor.getEditorState().read(() => {
      const range = $getRangeFromEditor();
      if (!range) throw new Error("Expected range to be defined");

      const rangeSelection = $getRangeFromSelection(range);
      if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");

      expect(rangeSelection.anchor.key).toBe(markerNode.getKey());
      expect(rangeSelection.anchor.offset).toBe(0);
    });
  });

  it("should round-trip UsjClosingMarkerLocation selection", () => {
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
    updateSelection(editor, closingMarker!, 2);

    editor.getEditorState().read(() => {
      const range = $getRangeFromEditor();
      if (!range) throw new Error("Expected range to be defined");

      const rangeSelection = $getRangeFromSelection(range);
      if (!rangeSelection) throw new Error("Expected rangeSelection to be defined");

      expect(rangeSelection.anchor.key).toBe(closingMarker.getKey());
      expect(rangeSelection.anchor.offset).toBe(2);
    });
  });
});
