import { testEnvironment } from "./markerEdit.test-helpers";
import {
  $getStandardViewClipboardData,
  $handleCopyForStandardView,
} from "./whitespaceDisplay.plugin.utils";
import { act } from "@testing-library/react";
import { LexicalClipboardData } from "@lexical/clipboard";
import {
  $createTextNode,
  $getRoot,
  $setState,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $createMarkerNode, $createParaNode, NBSP, textTypeState } from "shared";

/**
 * Null-event leg: ClipboardPlugin/ContextMenuPlugin/EditorRef dispatch COPY_COMMAND/
 * CUT_COMMAND with a `null` payload. `@lexical/clipboard`'s `copyToClipboard` is mocked so the
 * jsdom `execCommand`/synthetic-event dance (unimplemented in jsdom — verified: `execCommand` is
 * `undefined` and `instanceof ClipboardEvent` throws) never has to run; instead we assert the
 * handler calls through with the exact normalized payload. `$getHtmlContent`/
 * `$getLexicalContent` (also from this module) stay real via the `importOriginal` spread, so the
 * payload-builder unit tests below exercise genuine HTML/Lexical-JSON generation.
 */
const copyToClipboardSpy = vi.hoisted(() =>
  vi.fn(
    async (_editor: LexicalEditor, _event: ClipboardEvent | null, _data?: LexicalClipboardData) =>
      true,
  ),
);
vi.mock("@lexical/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lexical/clipboard")>();
  return { ...actual, copyToClipboard: copyToClipboardSpy };
});

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

describe("typing invariant", () => {
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

describe("clipboard normalization", () => {
  it("copies display-NBSP as plain spaces in text/plain via the real-event branch (not copyToClipboard)", async () => {
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
    copyToClipboardSpy.mockClear();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe("a  b and 3~000"); // NBSP→space; ~ stays (PT9 shows/copies ~)
    // The real (event-carrying) branch writes directly via clipboardData.setData; it must NOT
    // route through the null-event copyToClipboard path (which mock would otherwise mask).
    expect(copyToClipboardSpy).not.toHaveBeenCalled();
  });
});

describe("$getStandardViewClipboardData", () => {
  it("returns undefined for a collapsed selection", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(1, 1)));
    let data: LexicalClipboardData | undefined;
    await act(async () => editor.update(() => (data = $getStandardViewClipboardData(editor))));
    expect(data).toBeUndefined();
  });

  it("builds a normalized text/plain payload (NBSP→space) plus html/lexical for a range selection", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    let data: LexicalClipboardData | undefined;
    await act(async () => editor.update(() => (data = $getStandardViewClipboardData(editor))));
    // Only text/plain inverts display-NBSP back to plain spaces; the html and lexical payloads
    // keep the on-screen NBSPs so a paste back into a Standard-view editor round-trips exactly.
    expect(data?.["text/plain"]).toBe("a  b");
    // html carries the two NBSPs (as entities) inside a text span, NOT normalized to spaces.
    expect(data?.["text/html"]).toContain("a&nbsp;&nbsp;b");
    expect(data?.["text/html"]).not.toContain("a  b");
    // the lexical clipboard JSON is a single TextNode whose content still holds the NBSPs.
    const lexical = JSON.parse(data?.["application/x-lexical-editor"] ?? "{}");
    expect(lexical.nodes).toHaveLength(1);
    expect(lexical.nodes[0]).toMatchObject({ type: "text", text: `a${NBSP}${NBSP}b` });
  });
});

describe("clipboard normalization — null-event leg (ClipboardPlugin/ContextMenuPlugin/EditorRef)", () => {
  it("COPY_COMMAND(null) writes the normalized payload via copyToClipboard(editor, null, data), selection intact", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    copyToClipboardSpy.mockClear();
    let handled: boolean | undefined;
    await act(async () => {
      handled = editor.dispatchCommand(COPY_COMMAND, null);
    });
    expect(handled).toBe(true);
    expect(copyToClipboardSpy).toHaveBeenCalledTimes(1);
    const [calledEditor, calledEvent, calledData] = copyToClipboardSpy.mock.calls[0];
    expect(calledEditor).toBe(editor);
    expect(calledEvent).toBeNull();
    expect(calledData?.["text/plain"]).toBe("a  b");
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe(`a${NBSP}${NBSP}b`)); // copy: unchanged
  });

  it("CUT_COMMAND(null) also removes the selected text after handing off to copyToClipboard", async () => {
    // Selects only the two interior NBSPs (leaving "a"/"b" behind) rather than the whole node:
    // cutting the *entire* content of a TextNode leaves it empty, and Lexical garbage-collects
    // empty text nodes on commit — the `text` reference would then point at a node no longer in
    // the committed state ("Lexical node does not exist in active editor state"). A partial cut
    // asserts real removal via the surviving node without hitting that GC edge case.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(1, 3)));
    copyToClipboardSpy.mockClear();
    let handled: boolean | undefined;
    await act(async () => {
      handled = editor.dispatchCommand(CUT_COMMAND, null);
    });
    expect(handled).toBe(true);
    expect(copyToClipboardSpy).toHaveBeenCalledTimes(1);
    const [, , calledData] = copyToClipboardSpy.mock.calls[0];
    expect(calledData?.["text/plain"]).toBe("  ");
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("ab"));
  });

  it("declines an event-shaped payload whose clipboardData is null (no dispatch, no removal)", async () => {
    // A real ClipboardEvent can carry a null clipboardData (the DOM data store is only
    // guaranteed during dispatch of a trusted clipboard event). The pre-null-leg code declined
    // this case outright, and the spec requires the real-event branch to stay behaviorally
    // identical — it must NOT fall into the null-dispatch leg, which would re-enter
    // document.execCommand from inside an in-flight native copy and never preventDefault the
    // original event. Direct handler call for the same jsdom-fallback reason as below.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(1, 3)));
    copyToClipboardSpy.mockClear();
    const event = { clipboardData: null, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    let handled: boolean | undefined;
    await act(async () =>
      editor.update(() => {
        handled = $handleCopyForStandardView(event, editor, true);
      }),
    );
    expect(handled).toBe(false);
    expect(copyToClipboardSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe(`a${NBSP}${NBSP}b`));
  });

  it("returns false (does not call copyToClipboard) for a collapsed selection", async () => {
    // Calls the handler directly rather than via editor.dispatchCommand: a `false` return here
    // falls through to Lexical's own RichText copy fallback, which — in real browsers — is fine,
    // but under jsdom crashes on a bare `ClipboardEvent` reference (jsdom doesn't implement the
    // class; verified above) regardless of this plugin's code. That's a pre-existing jsdom gap
    // in Lexical's own fallback, orthogonal to what's under test here (the collapsed-selection
    // decline), so it's sidestepped by unit-testing the handler in isolation.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(1, 1)));
    copyToClipboardSpy.mockClear();
    let handled: boolean | undefined;
    await act(async () =>
      editor.update(() => {
        handled = $handleCopyForStandardView(null, editor, false);
      }),
    );
    expect(handled).toBe(false);
    expect(copyToClipboardSpy).not.toHaveBeenCalled();
  });
});
