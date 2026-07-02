import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $setState, COPY_COMMAND, TextNode } from "lexical";
import { $createMarkerNode, $createParaNode, NBSP, textTypeState } from "shared";

/**
 * jsdom (see StructureProtectionPlugin.test.tsx's `htmlPasteEvent`) doesn't implement
 * `ClipboardEvent`/`DataTransfer`; the handler under test only touches
 * `clipboardData.setData`/`preventDefault`, so a minimal stub covers it.
 */
function copyEvent(): { event: ClipboardEvent; getData: (type: string) => string } {
  const store = new Map<string, string>();
  const clipboardData = {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, data: string) => {
      store.set(type, data);
    },
  };
  return {
    event: { clipboardData, preventDefault: vi.fn() } as unknown as ClipboardEvent,
    getData: (type: string) => clipboardData.getData(type),
  };
}

/**
 * Builds `<p>` + a marker-trailing-space NBSP + `text` as siblings. The trailing-space node's
 * `textType` state (matching the real adaptor's `createText(NBSP, "marker-trailing-space")`)
 * is required here for more than skip-list realism: without it, Lexical's built-in adjacent
 * simple-TextNode normalization would silently merge it into `text` on the very first commit,
 * leaving the `text` reference captured below pointing at a removed node.
 */
function $appendMarkerAndText(text: TextNode): void {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  $getRoot().append($createParaNode("p").append($createMarkerNode("p"), spaceNode, text));
}

describe("§4 typing invariant", () => {
  it("converts a typed double space to display-NBSP", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode("a b");
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.setTextContent("a  b")));
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe(`a${NBSP}${NBSP}b`));
  });

  it("leaves single spaces alone", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode("a b c");
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.setTextContent("a b c d")));
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("a b c d"));
  });

  it("preserves text length (no caret adjustment needed)", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode("a b");
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.setTextContent("a   b")));
    editor.getEditorState().read(() => expect(text.getTextContent().length).toBe(5));
  });
});

describe("§5.6 clipboard normalization", () => {
  it("copies display-NBSP as plain spaces in text/plain", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b and 3~000`);
      $appendMarkerAndText(text);
    });
    // Selection set inside the initial-state builder doesn't survive mount (RichTextPlugin
    // resets it once the root element attaches) — set it in a separate post-mount update,
    // matching this suite's `updateSelection` precedent.
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe("a  b and 3~000"); // NBSP→space; ~ stays (PT9 shows/copies ~)
  });
});
