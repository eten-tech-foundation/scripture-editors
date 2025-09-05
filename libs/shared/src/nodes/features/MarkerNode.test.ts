import { createBasicTestEnvironment } from "../usj/test.utils.js";
import {
  $createMarkerNode,
  MarkerNode,
  MARKER_VERSION,
  SerializedMarkerNode,
  MarkerSyntax,
} from "./MarkerNode.js";

const testParaMarker = "p";
const testVerseMarker = "v";
const testChapterMarker = "c";

describe("MarkerNode", () => {
  describe("constructor", () => {
    it("should create an opening marker node by default", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker);
        expect(node).toBeDefined();
        expect(node.getMarker()).toBe(testParaMarker);
        expect(node.getMarkerSyntax()).toBe("opening");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}`);
      });
    });

    it("should create a closing marker node when specified", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "closing");
        expect(node).toBeDefined();
        expect(node.getMarker()).toBe(testParaMarker);
        expect(node.getMarkerSyntax()).toBe("closing");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}*`);
      });
    });

    it("should create a self-closing marker node when specified", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "selfClosing");
        expect(node).toBeDefined();
        expect(node.getMarker()).toBe(testParaMarker);
        expect(node.getMarkerSyntax()).toBe("selfClosing");
        expect(node.getTextContent()).toBe(`\\*`);
      });
    });
  });

  describe("importJSON()", () => {
    it("should import JSON correctly for opening marker", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const serializedNode = createSerializedMarkerNode(testVerseMarker, "opening");

        const node = MarkerNode.importJSON(serializedNode);
        expect(node.getMarker()).toBe(testVerseMarker);
        expect(node.getMarkerSyntax()).toBe("opening");
        expect(node.getTextContent()).toBe(`\\${testVerseMarker}`);
      });
    });

    it("should import JSON correctly for closing marker", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const serializedNode = createSerializedMarkerNode(testVerseMarker, "closing");

        const node = MarkerNode.importJSON(serializedNode);
        expect(node.getMarker()).toBe(testVerseMarker);
        expect(node.getMarkerSyntax()).toBe("closing");
        expect(node.getTextContent()).toBe(`\\${testVerseMarker}*`);
      });
    });

    it("should import JSON correctly for self-closing marker", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const serializedNode = createSerializedMarkerNode(testVerseMarker, "selfClosing");

        const node = MarkerNode.importJSON(serializedNode);
        expect(node.getMarker()).toBe(testVerseMarker);
        expect(node.getMarkerSyntax()).toBe("selfClosing");
        expect(node.getTextContent()).toBe(`\\*`);
      });
    });
  });

  describe("updateFromJSON()", () => {
    it("should update from JSON correctly to closing", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "opening");

        const updateData = createSerializedMarkerNode(testChapterMarker, "closing");

        const updatedNode = node.updateFromJSON(updateData);
        expect(updatedNode.getMarker()).toBe(testChapterMarker);
        expect(updatedNode.getMarkerSyntax()).toBe("closing");
        expect(updatedNode.getTextContent()).toBe(`\\${testChapterMarker}*`);
      });
    });

    it("should update from JSON correctly to self-closing", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "opening");

        const updateData = createSerializedMarkerNode(testChapterMarker, "selfClosing");

        const updatedNode = node.updateFromJSON(updateData);
        expect(updatedNode.getMarker()).toBe(testChapterMarker);
        expect(updatedNode.getMarkerSyntax()).toBe("selfClosing");
        expect(updatedNode.getTextContent()).toBe(`\\*`);
      });
    });
  });

  describe("text content updates", () => {
    it("should update text content when marker changes", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "opening");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}`);

        node.setMarker(testVerseMarker);
        expect(node.getTextContent()).toBe(`\\${testVerseMarker}`);
      });
    });

    it("should update text content when marker syntax changes", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "opening");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}`);

        node.setMarkerSyntax("closing");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}*`);
      });
    });

    it("should update text content when marker syntax changes to self-closing", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode(testParaMarker, "opening");
        expect(node.getTextContent()).toBe(`\\${testParaMarker}`);

        node.setMarkerSyntax("selfClosing");
        expect(node.getTextContent()).toBe(`\\*`);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty marker", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const node = $createMarkerNode("", "opening");
        expect(node.getMarker()).toBe("");
        expect(node.getTextContent()).toBe("\\");
      });
    });

    it("should handle markers with special characters", () => {
      const { editor } = createBasicTestEnvironment([MarkerNode]);
      editor.update(() => {
        const specialMarker = "test-marker_123";
        const node = $createMarkerNode(specialMarker, "opening");
        expect(node.getMarker()).toBe(specialMarker);
        expect(node.getTextContent()).toBe(`\\${specialMarker}`);
      });
    });
  });
});

// Helper function to create a valid SerializedMarkerNode
function createSerializedMarkerNode(
  marker: string,
  markerSyntax: MarkerSyntax = "opening",
): SerializedMarkerNode {
  return {
    type: "marker",
    marker,
    markerSyntax,
    text: "",
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    version: MARKER_VERSION,
  };
}
