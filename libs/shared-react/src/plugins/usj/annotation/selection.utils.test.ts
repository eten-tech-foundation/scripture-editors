// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../../libs/shared/src/nodes/usj/test.utils";
import { SelectionRange, AnnotationRange } from "./selection.model";
import { $getRangeFromSelection, $getRangeFromEditor } from "./selection.utils";
import { $createTextNode, $getRoot, TextNode } from "lexical";
import { $createParaNode, $createTypedMarkNode, ParaNode, TypedMarkNode } from "shared";

describe("$getRangeFromSelection", () => {
  describe("with valid UsjTextContentLocation", () => {
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
        const t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
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

  describe("with unsupported UsjDocumentLocation types", () => {
    it("should throw error for UsjMarkerLocation", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        const t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          // UsjMarkerLocation has jsonPath but no offset
          start: { jsonPath: "$.content[0]" },
        };

        expect(() => $getRangeFromSelection(selection)).toThrow(
          /Unsupported UsjDocumentLocation type: UsjMarkerLocation/,
        );
        expect(() => $getRangeFromSelection(selection)).toThrow(
          /Currently only UsjTextContentLocation is supported/,
        );
      });
    });

    it("should throw error for UsjClosingMarkerLocation", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        const t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: {
            jsonPath: "$.content[0]",
            closingMarkerOffset: 2,
          },
        };

        expect(() => $getRangeFromSelection(selection)).toThrow(
          /Unsupported UsjDocumentLocation type: UsjClosingMarkerLocation/,
        );
      });
    });

    it("should throw error for UsjPropertyValueLocation", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        const t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: {
            jsonPath: "$.content[0].marker",
            propertyOffset: 1,
          },
        };

        expect(() => $getRangeFromSelection(selection)).toThrow(
          /Unsupported UsjDocumentLocation type: UsjPropertyValueLocation/,
        );
      });
    });

    it("should include the received location in error message", () => {
      const { editor } = createBasicTestEnvironment([ParaNode], () => {
        const t1 = $createTextNode("Hello");
        $getRoot().append($createParaNode().append(t1));
      });

      editor.getEditorState().read(() => {
        const selection: SelectionRange = {
          start: { jsonPath: "$.content[0]" },
        };

        expect(() => $getRangeFromSelection(selection)).toThrow(/Received:/);
        expect(() => $getRangeFromSelection(selection)).toThrow(/"jsonPath"/);
      });
    });
  });
});

describe("$getRangeFromEditor", () => {
  it("should return undefined when there is no selection", () => {
    const { editor } = createBasicTestEnvironment([ParaNode], () => {
      const t1 = $createTextNode("Hello world");
      $getRoot().append($createParaNode().append(t1));
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
    updateSelection(editor, t1!, 5, t1!, 5);

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

  it("should normalize backward selection to start before end", () => {
    let t1: TextNode;
    const { editor } = createBasicTestEnvironment([ParaNode], () => {
      t1 = $createTextNode("Hello world");
      $getRoot().append($createParaNode().append(t1));
    });
    // Create backward selection (end offset before start offset in creation order)
    updateSelection(editor, t1!, 8, t1!, 3);

    editor.getEditorState().read(() => {
      const range = $getRangeFromEditor();

      if (!range) throw new Error("Expected range to be defined");
      // Start should be the earlier position
      expect(range.start).toEqual({
        jsonPath: "$.content[0].content[0]",
        offset: 3,
      });
      // End should be the later position
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

describe("round-trip conversion", () => {
  it("should convert editor selection to range and back", () => {
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
});
