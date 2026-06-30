import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import { $createCharNode, CharNode } from "./CharNode.js";

interface ThemeOverrides {
  [key: string]: unknown;
}

function createTestEditor(themeOverrides?: ThemeOverrides) {
  return createEditor({
    namespace: "char-node-test",
    nodes: [CharNode],
    onError: (error) => {
      throw error;
    },
    theme: { ...themeOverrides },
  });
}

function createDomFor(editor: ReturnType<typeof createTestEditor>, marker: string): HTMLElement {
  let element: HTMLElement | undefined;
  editor.update(() => {
    const node = $createCharNode(marker);
    element = node.createDOM({
      theme: editor._config.theme,
      namespace: editor._config.namespace,
    });
  });
  if (!element) throw new Error("CharNode.createDOM did not produce an element");
  return element;
}

describe("CharNode createDOM title attribute", () => {
  it("sets title=__marker by default", () => {
    const editor = createTestEditor();
    const element = createDomFor(editor, "wg");
    expect(element.getAttribute("title")).toBe("wg");
  });

  it("sets title=__marker when showCharMarkerTitles is true", () => {
    const editor = createTestEditor({ showCharMarkerTitles: true });
    const element = createDomFor(editor, "wg");
    expect(element.getAttribute("title")).toBe("wg");
  });

  it("omits the title attribute when showCharMarkerTitles is false", () => {
    const editor = createTestEditor({ showCharMarkerTitles: false });
    const element = createDomFor(editor, "wg");
    expect(element.hasAttribute("title")).toBe(false);
  });

  it("preserves data-marker and usfm_* class regardless of showCharMarkerTitles", () => {
    const editor = createTestEditor({ showCharMarkerTitles: false });
    const element = createDomFor(editor, "wj");
    expect(element.getAttribute("data-marker")).toBe("wj");
    expect(element.classList.contains("usfm_wj")).toBe(true);
  });
});

describe("CharNode.isValidMarker", () => {
  it("returns true for a built-in marker", () => {
    expect(CharNode.isValidMarker("add")).toBe(true);
  });

  it("returns false for an unknown marker when no extra list is given", () => {
    expect(CharNode.isValidMarker("app")).toBe(false);
  });

  it("returns true for a marker supplied via extraValidMarkers", () => {
    expect(CharNode.isValidMarker("app", ["app"])).toBe(true);
  });

  it("returns false for a marker not in the extra list", () => {
    expect(CharNode.isValidMarker("app", ["other"])).toBe(false);
  });
});
