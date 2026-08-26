import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  serializedState,
  testEnvironment,
  testEnvironmentWithDisplaySyncs,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  $getStandardViewClipboardData,
  $handleCopyForStandardView,
  $handlePasteForStandardView,
  invertDisplayNbspInHtml,
} from "./whitespaceDisplay.plugin.utils";
import { displayTextToUsj } from "./whitespaceDisplay.utils";
import { act } from "@testing-library/react";
import { LexicalClipboardData } from "@lexical/clipboard";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { $dfs } from "@lexical/utils";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setSelection,
  $setState,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isParaNode,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";

/**
 * Null-event leg: ClipboardPlugin/ContextMenuPlugin/EditorRef dispatch COPY_COMMAND/
 * CUT_COMMAND with a `null` payload. `@lexical/clipboard`'s `copyToClipboard` is mocked so the
 * jsdom `execCommand`/synthetic-event dance (unimplemented in jsdom — verified: `execCommand` is
 * `undefined` and `instanceof ClipboardEvent` throws) never has to run; instead we assert the
 * handler calls through with the exact normalized payload. `$getHtmlContent`/
 * `$getLexicalContent` (also from this module) stay real via the `importOriginal` spread, so the
 * payload-builder unit tests below exercise genuine HTML/Lexical-JSON generation.
 */
// Typed explicitly against the real `copyToClipboard` signature: an untyped `vi.fn(async () =>
// true)` infers a zero-arg mock, which narrows `.mock.calls[0]` to the empty tuple `[]` and
// breaks the positional destructuring below (TS2493) even though the mock is genuinely called
// with three arguments at runtime.
const copyToClipboardSpy = vi.hoisted(() =>
  vi.fn<
    (
      editor: LexicalEditor,
      event: null | ClipboardEvent,
      data?: LexicalClipboardData,
    ) => Promise<boolean>
  >(async () => true),
);
vi.mock("@lexical/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lexical/clipboard")>();
  return { ...actual, copyToClipboard: copyToClipboardSpy };
});

/**
 * jsdom (see StructureKeyboardPlugin.test.tsx's `htmlPasteEvent`) doesn't implement
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

  // A char span's text children carry a STRUCTURAL leading NBSP (the glyph separator glued on by
  // the adaptor/materializer). It must not act as left context for the run mapping: a genuine
  // content-leading single space stays plain in the clean-loaded shape, and mapping it here made
  // edited (dirty) nodes emit different collab ops than clean-loaded ones for identical content.
  it("keeps a char span's content-leading space plain after the structural NBSP prefix", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`${NBSP} Bx`);
      // Complete span (opening + closing glyphs) — a closer-less span would trigger the
      // missing-closer Tier-2 rebuild and replace the captured node reference.
      const span = $createCharNode("nd").append(
        $createMarkerNode("nd", "opening"),
        text,
        $createMarkerNode("nd", "closing"),
      );
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), sep, span));
    });
    await act(async () => editor.update(() => text.setTextContent(`${NBSP} B`)));
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe(`${NBSP} B`));
  });

  it("still maps space runs INSIDE char span content beyond the structural prefix", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`${NBSP}a b`);
      const span = $createCharNode("nd").append(
        $createMarkerNode("nd", "opening"),
        text,
        $createMarkerNode("nd", "closing"),
      );
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), sep, span));
    });
    await act(async () => editor.update(() => text.setTextContent(`${NBSP}a  b`)));
    editor
      .getEditorState()
      .read(() => expect(text.getTextContent()).toBe(`${NBSP}a${NBSP}${NBSP}b`));
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

  it("cuts via the real-event branch: payload written through clipboardData.setData, selected text removed", async () => {
    // Same partial-interior selection as the null-event cut test: cutting a TextNode's ENTIRE
    // content leaves it empty and Lexical garbage-collects empty text nodes on commit, killing
    // the captured reference — a partial cut asserts real removal via the surviving node.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(1, 3)));
    const { event, getData } = copyEvent();
    copyToClipboardSpy.mockClear();
    let handled: boolean | undefined;
    await act(async () => {
      handled = editor.dispatchCommand(CUT_COMMAND, event);
    });
    expect(handled).toBe(true);
    // The two display-NBSPs invert to plain spaces in the written payload — a cut that skipped
    // the normalization (or wrote nothing) would fail here.
    expect(getData("text/plain")).toBe("  ");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    // The real-event branch writes directly; routing a live event into copyToClipboard would
    // re-enter execCommand mid-dispatch (the exact hazard the branch split exists for).
    expect(copyToClipboardSpy).not.toHaveBeenCalled();
    // isCut removed exactly the selected text — a copy-shaped regression would leave it intact.
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("ab"));
  });
});

/** A paragraph with a figure between two plain-text runs. */
const FIGURE_USX =
  `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" />` +
  `<para style="p">Before <figure style="fig" file="cn01617.jpg" size="span" ref="1.18">caption</figure> after.</para></usx>`;

/**
 * Select from the start of the text BEFORE the figure to the end of the text AFTER it — the only
 * selection a user can make that reaches the block at all, since the block itself is
 * `contentEditable=false` and its glyph children are not keyboard-selectable.
 *
 * Mutating: call inside `editor.update()`.
 */
function $selectAcrossFigure(): void {
  const textNodes = $dfs($getRoot())
    .map(({ node }) => node)
    .filter($isTextNode);
  const before = textNodes.find((node) => node.getTextContent() === "Before ");
  const after = textNodes.find((node) => node.getTextContent() === " after.");
  if (!before || !after) throw new Error("Expected surrounding text nodes to exist");
  const selection = $createRangeSelection();
  selection.anchor = $createPoint(before.getKey(), 0, "text");
  selection.focus = $createPoint(after.getKey(), after.getTextContentSize(), "text");
  $setSelection(selection);
}

async function copyAcrossFigure() {
  const { editor } = await baseTestEnvironment(
    serializedState(usxStringToUsj(FIGURE_USX)),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
  await act(async () => editor.update(() => $selectAcrossFigure()));
  const { event, getData } = copyEvent();
  await act(async () => {
    editor.dispatchCommand(COPY_COMMAND, event);
  });
  return getData;
}

describe("copy across an UnknownNode (figure) — full USFM byte display", () => {
  it("copies the figure's exact USFM: opening marker, caption, then attributes and closer", async () => {
    const getData = await copyAcrossFigure();

    // The whole span, marker glyphs included: the figure's ImmutableTypedTextNode display
    // children (opening marker before the caption; attributes folded into the closing after it,
    // matching USFM 3.0's caption-first figure syntax) are real Lexical text to a range
    // selection, so the copy carries the figure's complete, valid USFM — not just its caption.
    expect(getData("text/plain")).toBe(
      'Before \\fig caption|src="cn01617.jpg" size="span" ref="1.18"\\fig* after.',
    );
  });

  it("keeps the block's bytes in the Lexical payload and drops them from text/html", async () => {
    const getData = await copyAcrossFigure();

    // The internal payload keeps the block whole, so a paste back into this editor is lossless.
    // (JSON-escaped, hence the doubled backslash.)
    expect(getData("application/x-lexical-editor")).toContain("\\\\fig ");

    // text/html does not. `UnknownNode.exportDOM` returns a null element and Lexical's HTML
    // exporter reads that as "drop this subtree", bailing BEFORE it recurses into children — so a
    // rich-text paste target (a word processor, a browser, a chat client) receives neither the
    // marker name nor the block's own content, here the figure's caption. That is the half of
    // "read-only blocks are selectable and copyable" that does not hold.
    //
    // Pinned as today's answer rather than as the desired one: making the block export HTML also
    // governs the paste leg, since `importDOM` reads a block back out of `data-tag`/`data-marker`.
    const html = getData("text/html");
    expect(html).toContain("Before ");
    expect(html).toContain(" after.");
    expect(html).not.toContain("fig");
    expect(html).not.toContain("caption");
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
    // text/plain inverts every display-NBSP back to a plain space. text/html is collapse-aware
    // (see the dedicated describe below): this run of 2 keeps its NBSPs so it survives a
    // rich-text consumer's whitespace collapsing. The lexical payload keeps the on-screen NBSPs
    // so a paste back into a Standard-view editor round-trips exactly.
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

describe("text/html flavor — collapse-aware display-NBSP inversion", () => {
  /**
   * Selects from the start of `from` to the end of `to`.
   *
   * Mutating: call inside `editor.update()`.
   */
  function $selectSpan(from: TextNode, to: TextNode): void {
    const selection = from.select(0, 0);
    selection.focus.set(to.getKey(), to.getTextContentSize(), "text");
  }

  /** The text a rich consumer would extract from the html flavor (inline fragment: no blocks). */
  function htmlTextOf(html: string): string {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  }

  it("inverts a single display-NBSP (marker-trailing separator) to a plain space", async () => {
    let marker: TextNode;
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      marker = $createMarkerNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("a b c");
      $getRoot().append($createParaNode("p").append(marker, sep, text));
    });
    await act(async () => editor.update(() => $selectSpan(marker, text)));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe("\\p a b c");
    // The separator NBSP sits between the glyph and the content — an interior single — so the
    // html flavor ships the plain space it stands for: nothing non-breaking reaches a rich
    // consumer from ordinary single-spaced text.
    const html = getData("text/html");
    expect(html).not.toContain("&nbsp;");
    expect(html).not.toContain(NBSP);
    expect(htmlTextOf(html)).toBe("\\p a b c");
  });

  it("keeps a genuine data NBSP's `~` byte form in both flavors", async () => {
    // In Standard view a data NBSP never appears as an NBSP character: it displays as the
    // literal `~` (the USFM byte form PT9 also shows and copies), so BOTH flavors carry `~` —
    // not an NBSP — and stay decode-consistent with each other. Every NBSP character in the
    // display is a display artifact standing for a plain space.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode("pay 3~000 now");
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe("pay 3~000 now");
    const html = getData("text/html");
    expect(html).toContain("3~000");
    expect(html).not.toContain("&nbsp;");
    expect(html).not.toContain(NBSP);
  });

  it("keeps a run of 2+ display-NBSPs all-NBSP so it survives html whitespace collapsing", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      text = $createTextNode(`a${NBSP}${NBSP}${NBSP}b`);
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    // Plain spaces would collapse to one in a rich consumer; the run stays in its all-NBSP form
    // (the bytes the display already carries — the space/NBSP alternation would survive too but
    // changes bytes for no gain).
    expect(getData("text/plain")).toBe("a   b");
    expect(getData("text/html")).toContain("a&nbsp;&nbsp;&nbsp;b");
  });

  it("judges runs across span boundaries: separator + paragraph-leading NBSP form one preserved run", async () => {
    // The marker-trailing separator and a paragraph-leading NBSP live in different html spans
    // but are adjacent in the fragment's text: treated per span each would be a "single" and
    // become a plain space, and the consumer would then collapse the pair down to one space.
    let marker: TextNode;
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      marker = $createMarkerNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      // The paragraph-leading NBSP shape createPara produces for an authored leading space.
      text = $createTextNode(`${NBSP}lead in`);
      $getRoot().append($createParaNode("p").append(marker, sep, text));
    });
    await act(async () => editor.update(() => $selectSpan(marker, text)));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe("\\p  lead in");
    const html = getData("text/html");
    expect(html.match(/&nbsp;/g)).toHaveLength(2);
    expect(htmlTextOf(html)).toBe(`\\p${NBSP}${NBSP}lead in`);
  });

  it("keeps a fragment-leading single NBSP (separator selected without its marker)", async () => {
    // A plain space at the fragment's edge is exactly what html consumers drop; edge whitespace
    // is in the fragment only because the user deliberately selected it, so it stays NBSP.
    let sep: TextNode;
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("body");
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => $selectSpan(sep, text)));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(getData("text/plain")).toBe(" body");
    const html = getData("text/html");
    expect(html.match(/&nbsp;/g)).toHaveLength(1);
    expect(htmlTextOf(html)).toBe(`${NBSP}body`);
  });

  it("both flavors decode to the same document text across glyphs, runs, `~`, and a char span", async () => {
    let marker: TextNode;
    let spanText: TextNode;
    const { editor } = await testEnvironment(() => {
      marker = $createMarkerNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      const text = $createTextNode(`before${NBSP}${NBSP}mid 3~000 x`);
      spanText = $createTextNode(`${NBSP}deep waters`);
      $getRoot().append(
        $createParaNode("p").append(
          marker,
          sep,
          text,
          $createCharNode("nd").append(
            $createMarkerNode("nd", "opening"),
            spanText,
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });
    await act(async () => editor.update(() => $selectSpan(marker, spanText)));
    const { event, getData } = copyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    const plain = getData("text/plain");
    expect(plain).toBe("\\p before  mid 3~000 x\\nd deep waters");
    // One selection, one document: the display→data inversion (display-NBSP → space, `~` →
    // data NBSP) must read both flavors as the same text, or the paste target's flavor choice
    // would change the content.
    expect(displayTextToUsj(htmlTextOf(getData("text/html")))).toBe(displayTextToUsj(plain));
  });

  describe("invertDisplayNbspInHtml mechanics", () => {
    it("inverts an interior single NBSP that is its own span (concatenated-text judgment)", () => {
      expect(invertDisplayNbspInHtml(`<span>a</span><span>${NBSP}</span><span>b</span>`)).toBe(
        "<span>a</span><span> </span><span>b</span>",
      );
    });

    it("returns the input unchanged when nothing inverts (runs and edge singles keep NBSP)", () => {
      const run = `<span>a${NBSP}${NBSP}b</span>`;
      expect(invertDisplayNbspInHtml(run)).toBe(run);
      const leadingEdge = `<span>${NBSP}a</span>`;
      expect(invertDisplayNbspInHtml(leadingEdge)).toBe(leadingEdge);
      const trailingEdge = `<span>a${NBSP}</span>`;
      expect(invertDisplayNbspInHtml(trailingEdge)).toBe(trailingEdge);
    });
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

describe("paste normalization ($handlePasteForStandardView)", () => {
  function pasteEvent(payload: { [key: string]: string }): {
    event: ClipboardEvent;
    prevented: () => boolean;
  } {
    let prevented = false;
    const clipboardData = { getData: (type: string) => payload[type] ?? "" };
    const event = {
      clipboardData,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as ClipboardEvent;
    return { event, prevented: () => prevented };
  }

  it("rewrites a pasted data-NBSP to the `~` display form (data round-trips to a real NBSP)", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("before after");
      $getRoot().append(para.append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => text.select(7, 7))); // between "before " and "after"

    const { event, prevented } = pasteEvent({ "text/plain": `3${NBSP}000` });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(true);
    expect(prevented()).toBe(true);
    editor.getEditorState().read(() => {
      // The NBSP shows as `~` on screen; serialization inverts `~` → NBSP, so the data keeps it.
      expect($getRoot().getTextContent()).toContain("3~000");
    });
  });

  it("passes through internal pastes (lexical payload) and NBSP-free plain text", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("body");
      $getRoot().append(para.append($createMarkerNode("p"), text));
    });
    await act(async () => editor.update(() => text.select(0, 0)));

    const internal = pasteEvent({
      "application/x-lexical-editor": "{}",
      "text/plain": `x${NBSP}y`,
    });
    const plain = pasteEvent({ "text/plain": "no nbsp here" });
    await act(async () =>
      editor.update(() => {
        expect($handlePasteForStandardView(internal.event)).toBe(false);
        expect($handlePasteForStandardView(plain.event)).toBe(false);
      }),
    );
    expect(internal.prevented()).toBe(false);
    expect(plain.prevented()).toBe(false);
  });

  it("rewrites an NBSP found only in a `text/html` payload (word-processor `&nbsp;`) to `~`, with no `text/plain` data", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("before after");
      $getRoot().append(para.append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => text.select(7, 7))); // between "before " and "after"

    // No `text/plain` key at all — some clipboard sources only populate `text/html`.
    const { event, prevented } = pasteEvent({ "text/html": "<p>3&nbsp;000</p>" });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(true);
    expect(prevented()).toBe(true);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("3~000");
    });
  });

  it("separates blocks (and `<br>`) into paragraphs so a multi-paragraph html paste doesn't merge words", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("before after");
      $getRoot().append(para.append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => text.select(7, 7))); // between "before " and "after"

    const { event } = pasteEvent({
      "text/html": "<p>one&nbsp;two</p><p>three<br>four</p>",
    });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      // Block boundaries and <br> become newlines, so "two"/"three" don't fuse into one word —
      // and each newline is then replayed as a real paragraph split (see the line-replay
      // describe at the bottom of this file), since no USFM line can carry a `\n` byte.
      expect(
        $getRoot()
          .getChildren()
          .map((child) => child.getTextContent().replaceAll(NBSP, " ")),
      ).toEqual(["\\p before one~two", "\\p three", "\\p fourafter"]);
    });
  });

  it("excludes body-level style/script text from the inserted content", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("before after");
      $getRoot().append(para.append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => text.select(7, 7)));

    // A leading <style>/<script> would be hoisted into <head> by the parser (already excluded);
    // placing them AFTER body content keeps them body-level — the case that leaked.
    const { event } = pasteEvent({
      "text/html": '<p>a&nbsp;b</p><style>p{color:red}</style><script>alert("x")</script>',
    });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      const content = $getRoot().getTextContent();
      expect(content).toContain("a~b");
      expect(content).not.toContain("color");
      expect(content).not.toContain("alert");
    });
  });

  it("triggers on a literal NBSP byte in the raw html, not just the `&nbsp;` entity", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      text = $createTextNode("before after");
      $getRoot().append(para.append($createMarkerNode("p"), sep, text));
    });
    await act(async () => editor.update(() => text.select(7, 7)));

    const { event, prevented } = pasteEvent({ "text/html": `<p>3${NBSP}000</p>` });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(true);
    expect(prevented()).toBe(true);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("3~000");
    });
  });

  it("falls through to default html handling when `text/html` carries no NBSP (raw or decoded)", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("body");
      $getRoot().append(para.append($createMarkerNode("p"), text));
    });
    await act(async () => editor.update(() => text.select(0, 0)));

    const { event, prevented } = pasteEvent({ "text/html": "<p><b>bold text</b></p>" });
    let handled = true;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(false);
    expect(prevented()).toBe(false);
  });

  it("keeps current behavior (declines) when an `application/x-lexical-editor` payload is present, even if `text/html` carries NBSP", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("body");
      $getRoot().append(para.append($createMarkerNode("p"), text));
    });
    await act(async () => editor.update(() => text.select(0, 0)));

    const { event, prevented } = pasteEvent({
      "application/x-lexical-editor": "{}",
      "text/html": "<p>3&nbsp;000</p>",
    });
    let handled = true;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );

    expect(handled).toBe(false);
    expect(prevented()).toBe(false);
  });
});

/**
 * A newline is not a byte any USFM line can carry, so a pasted `\n` must become a paragraph
 * split — never a literal character inside a text node (invariants Invariant I). The NBSP claim
 * above runs at HIGH ahead of every other paste claim, so an NBSP-carrying multi-line paste
 * reaches nothing else: the split has to happen inside that claim.
 *
 * Driven through the real `PASTE_COMMAND` ladder rather than by calling the handler directly (as
 * the tests above do), because the split runs through `INSERT_PARAGRAPH_COMMAND` and only the
 * mounted plugin chain answers it.
 */
describe("multi-line paste carrying an NBSP", () => {
  const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
  if (typeof globalStubs.DragEvent === "undefined")
    globalStubs.DragEvent = class DragEvent extends Event {};
  if (typeof globalStubs.ClipboardEvent === "undefined")
    globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

  /**
   * Duck-typed paste event carrying `types`/`files` as well, since dispatching through the whole
   * ladder reaches `@lexical/clipboard`, which reads both (jsdom implements neither
   * `ClipboardEvent` nor `DataTransfer`).
   */
  function pasteEventWith(flavors: { [mime: string]: string }): ClipboardEvent {
    return {
      clipboardData: {
        types: Object.keys(flavors),
        files: [],
        getData: (type: string) => flavors[type] ?? "",
      },
      preventDefault: () => undefined,
    } as unknown as ClipboardEvent;
  }

  function $paras(): ParaNode[] {
    return $getRoot().getChildren().filter($isParaNode);
  }

  /**
   * Asserted per TEXT NODE, not on the root's text content: `getTextContent()` on an element
   * JOINS its block children with newlines of its own, so a root-level read can never tell a
   * literal pasted `\n` from a genuine paragraph boundary.
   */
  function $noTextNodeHoldsANewline(): boolean {
    return $getRoot()
      .getAllTextNodes()
      .every((textNode) => !textNode.getTextContent().includes("\n"));
  }

  /** The USFM bytes a subtree stands for, structural NBSP separators rendered as plain spaces. */
  function $usfmBytes(para: ParaNode): string {
    return para
      .getAllTextNodes()
      .map((textNode) => textNode.getTextContent())
      .join("")
      .replaceAll(NBSP, " ");
  }

  /** `\p \nd thing\nd*` — one paragraph holding a single character-styled run. */
  function $appendCharPara(): TextNode {
    const content = $createTextNode(`${NBSP}thing`);
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createCharNode("nd").append(
          $createMarkerNode("nd"),
          content,
          $createMarkerNode("nd", "closing"),
        ),
      ),
    );
    return content;
  }

  it("splits paragraphs inside a character stack, closing and reopening it per line", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => (content = $appendCharPara()));
    await act(async () => editor.update(() => content.select(4, 4))); // "thi|ng"

    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, pasteEventWith({ "text/plain": `one${NBSP}x\ntwo` }));
    });

    editor.getEditorState().read(() => {
      const paras = $paras();
      expect(paras).toHaveLength(2);
      // The pasted NBSP takes its `~` display form; serialization inverts it back to an NBSP.
      expect($usfmBytes(paras[0])).toBe("\\p \\nd thione~x\\nd*");
      expect($usfmBytes(paras[1])).toBe("\\p \\nd twong\\nd*");
      expect($noTextNodeHoldsANewline()).toBe(true);
    });
  });

  it("splits paragraphs in plain text too, keeping the NBSP's display form", async () => {
    let text: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      text = $createTextNode("plain");
      $appendMarkerAndText(text);
    });
    await act(async () => editor.update(() => text.select(5, 5))); // "plain|"

    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, pasteEventWith({ "text/plain": `a${NBSP}b\nc` }));
    });

    editor.getEditorState().read(() => {
      const paras = $paras();
      expect(paras).toHaveLength(2);
      expect($usfmBytes(paras[0])).toBe("\\p plaina~b");
      expect($usfmBytes(paras[1])).toBe("\\p c");
      expect($noTextNodeHoldsANewline()).toBe(true);
    });
  });
});
