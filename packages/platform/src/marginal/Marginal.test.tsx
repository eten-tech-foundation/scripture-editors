// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { getEmbeddedLexicalEditor } from "../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import Marginal, { MarginalRef } from "./Marginal";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { $getRoot, $isTextNode } from "lexical";
import { createRef } from "react";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";
import { MockInstance, vi } from "vitest";

const sampleUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "1" }, "first verse text"],
    },
  ],
};

// Delegation smoke test only: Marginal's ref methods are one-line pass-throughs to the inner
// Editor, so one representative per pass-through style (boolean-returning, object-returning)
// proves the wiring without re-testing Editor behavior.
describe("Marginal ref delegation", () => {
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    // Marginal logs a deprecation warning on mount; keep test output clean.
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  async function renderMarginal() {
    const ref = createRef<MarginalRef>();
    let mountedContainer: HTMLElement | undefined;
    await act(async () => {
      const { container } = render(
        <Marginal
          ref={ref}
          defaultUsj={sampleUsj}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          options={{ view: getViewOptions(STANDARD_VIEW_MODE) }}
        />,
      );
      mountedContainer = container;
    });
    if (!ref.current) throw new Error("MarginalRef did not mount");
    if (!mountedContainer) throw new Error("container did not mount");
    // Marginal fills the inner Editor's children slot with its own CommentPlugin, so the
    // EditorRefPlugin-as-child capture is unavailable; reach in via the DOM back-reference.
    const lexical = getEmbeddedLexicalEditor(mountedContainer);
    return { marginal: ref.current, lexical, container: mountedContainer };
  }

  it("delegates isFocused to the inner editor", async () => {
    const { marginal, container } = await renderMarginal();
    const root = container.querySelector<HTMLElement>(".editor-input");
    if (!root) throw new Error("editor root not found");

    expect(marginal.isFocused()).toBe(false);

    await act(async () => root.focus());

    expect(marginal.isFocused()).toBe(true);
  });

  it("delegates getMarkerMenuContext to the inner editor", async () => {
    const { marginal, lexical } = await renderMarginal();
    await act(async () => {
      lexical.update(() => {
        const textNode = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("first verse text"));
        if (!textNode || !$isTextNode(textNode)) throw new Error("seed text node not found");
        textNode.select(5, 5);
      });
      // Flush Lexical's microtask-deferred commit so the state read sees the selection.
      await Promise.resolve();
      await Promise.resolve();
    });

    const context = marginal.getMarkerMenuContext();

    if (!context) throw new Error("expected a marker-menu context from the inner editor");
    expect(context.source).toBe("character");
    expect(context.paraMarker).toBe("p");
  });
});
