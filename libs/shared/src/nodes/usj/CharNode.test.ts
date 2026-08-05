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

// The five USFM attribute markers (usfmFragmentToUsj.ts's ATTRIBUTE_MARKERS: ca, cp, va, vp,
// cat) each degrade to an ordinary standalone char span — same as any other marker — whenever
// they are NOT adjacent to a target they can fold onto (or carry markup that blocks the fold).
// createDOM does not special-case them: the marker string alone drives the `usfm_<marker>`
// class, same as "wj" above, so a project stylesheet that styles `va` (green superscript, say)
// applies to a standalone `\va ...\va*` span exactly like any other char marker. Pinned here
// because a FOLDED `\va`/`\vp` display run (attributeDisplay.utils.ts, a verse's following
// siblings, never a CharNode) needed a SEPARATE fix to carry the same class — see
// MarkerEditPlugin.tsx's attribute-run mutation listener and attributeClass.utils.test.tsx.
// `ca`/`cp`/`cat` have no such folded display run today: a chapter's altnumber/pubnumber are
// never shown on screen at all, and `cat` lives inside an atomic, unexpanded note/sidebar — so
// this standalone-span pin is their only display-styling coverage.
describe("standalone attribute-marker char spans (ca/cp/va/vp/cat) get their usfm_<marker> class", () => {
  it.each(["ca", "cp", "va", "vp", "cat"])("marker %s", (marker) => {
    const editor = createTestEditor();
    const element = createDomFor(editor, marker);
    expect(element.getAttribute("data-marker")).toBe(marker);
    expect(element.classList.contains(`usfm_${marker}`)).toBe(true);
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
