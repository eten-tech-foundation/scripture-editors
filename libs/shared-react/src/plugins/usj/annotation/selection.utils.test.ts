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
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createTypedMarkNode,
  $createVerseNode,
  closingMarkerText,
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
    it("should position at opening MarkerNode when present", () => {
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

    it("should fall back to first text node when no MarkerNode exists", () => {
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

    it("should position at opening ImmutableTypedTextNode marker when present (visible mode)", () => {
      let markerNode: ImmutableTypedTextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        markerNode = $createImmutableTypedTextNode("marker", openingMarkerText("p"));
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
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(closingMarker.getKey());
        expect(editorSelection.anchor.offset).toBe(2);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to end of last text node when no closing MarkerNode exists", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(5);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position within closing ImmutableTypedTextNode marker when present (visible mode)", () => {
      let closingMarker: ImmutableTypedTextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        closingMarker = $createImmutableTypedTextNode("marker", closingMarkerText("nd"));
        $getRoot().append(
          $createParaNode().append(
            $createImmutableTypedTextNode("marker", openingMarkerText("nd") + " "),
            $createTextNode("name"),
            closingMarker,
          ),
        );
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: { jsonPath: "$.content[0]", closingMarkerOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(closingMarker.getKey());
        expect(editorSelection.anchor.offset).toBe(2);
        expect(editorSelection.isCollapsed()).toBe(true);
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

    it("should fall back to first text node when MarkerNode doesn't exist", () => {
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

    it("should position within opening ImmutableTypedTextNode marker when property is 'marker' (visible mode)", () => {
      let markerNode: ImmutableTypedTextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        // ImmutableTypedTextNode text is "\toc1" (backslash + marker name)
        markerNode = $createImmutableTypedTextNode("marker", openingMarkerText("toc1"));
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          // propertyOffset 2 means offset 2 within the marker name itself ("toc1")
          // The text is "\toc1", so offset 2 in marker name maps to offset 3 in the text
          start: { jsonPath: "$.content[0].marker", propertyOffset: 2 },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        // propertyOffset + 1 = 3 (after backslash)
        expect(editorSelection.anchor.offset).toBe(3);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjAttributeKeyLocation", () => {
    it("should position at opening MarkerNode when present (editable mode)", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should position at opening ImmutableTypedTextNode marker when present (visible mode)", () => {
      let markerNode: ImmutableTypedTextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, ImmutableTypedTextNode], () => {
        markerNode = $createImmutableTypedTextNode("marker", openingMarkerText("p"));
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to first text node when no marker exists (hidden mode)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
            keyOffset: 0,
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });
  });

  describe("UsjAttributeMarkerLocation", () => {
    it("should position at opening MarkerNode when present (editable mode)", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(markerNode.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
      });
    });

    it("should fall back to first text node when no marker exists (hidden mode)", () => {
      let t1: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const usjSelection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            keyName: "someAttr",
          },
        };
        const editorSelection = $getRangeFromUsjSelection(usjSelection);

        if (!editorSelection) throw new Error("Expected editorSelection to be defined");
        expect(editorSelection.anchor.key).toBe(t1.getKey());
        expect(editorSelection.anchor.offset).toBe(0);
        expect(editorSelection.isCollapsed()).toBe(true);
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
  });

  describe("UsjMarkerLocation", () => {
    it("should emit UsjMarkerLocation when cursor is at offset 0 in editable opening marker", () => {
      let markerNode: MarkerNode;
      const { editor } = createBasicTestEnvironment([ParaNode, MarkerNode], () => {
        markerNode = $createMarkerNode("p", "opening");
        $getRoot().append($createParaNode().append(markerNode, $createTextNode("Hello")));
      });
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
