// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editorial from "../Editorial";
import { EditorRef } from "./editor.model";
import {
  deserializeSerializedEditorState,
  initialize as initializeEditorUsjAdaptor,
} from "./adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "./adaptors/usj-editor.adaptor";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { BLOCK_VERSE_VIEW_MODE, getViewOptions, PARAGRAPH_STRUCTURE_VIEW_MODE } from "shared-react";

const blockVerseOptions = getViewOptions(BLOCK_VERSE_VIEW_MODE);
if (!blockVerseOptions) throw new Error("block verse view options are not defined");

function createLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

describe("block verse layout guards", () => {
  // The layout is read-only by construction: its paragraphs are split across verse blocks, so an
  // edit would have nowhere valid to go back to in USJ. A host that asks for it with editing on
  // gets a clear error and a read-only editor - not a white screen from a render-time throw.
  it("forces read-only and reports it when the host asks for an editable block verse editor", async () => {
    const logger = createLogger();

    let container: HTMLElement | undefined;
    await act(async () => {
      ({ container } = render(
        <Editorial
          defaultUsj={usjGen1v1}
          options={{ isReadonly: false, view: blockVerseOptions }}
          logger={logger}
        />,
      ));
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("read-only"));
    expect(container?.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it("stays quiet when the host asks for it correctly", async () => {
    const logger = createLogger();

    await act(async () => {
      render(
        <Editorial
          defaultUsj={usjGen1v1}
          options={{ isReadonly: true, view: blockVerseOptions }}
          logger={logger}
        />,
      );
    });

    expect(logger.error).not.toHaveBeenCalled();
  });

  // Gutter markers are added to the source paragraph only, so the fragments a verse block is split
  // into would be reset to `\p`, wiping the poetry indentation the layout exists to preserve.
  it("drops gutter para markers and reports it", async () => {
    const logger = createLogger();

    await act(async () => {
      render(
        <Editorial
          defaultUsj={usjGen1v1}
          options={{
            isReadonly: true,
            view: { ...blockVerseOptions, hasGutterParaMarkers: true },
          }}
          logger={logger}
        />,
      );
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("hasGutterParaMarkers"));
  });

  // The warning above only says the flag was noticed. This asserts it was actually dropped: with
  // the gutter still on, every paragraph would carry an immutable marker prefix.
  it("renders no gutter marker prefixes when the gutter is requested with block verse", async () => {
    let container: HTMLElement | undefined;
    await act(async () => {
      ({ container } = render(
        <Editorial
          defaultUsj={usjGen1v1}
          options={{
            isReadonly: true,
            view: { ...blockVerseOptions, hasGutterParaMarkers: true },
          }}
        />,
      ));
    });

    expect(container?.querySelectorAll(".verse-block").length).toBeGreaterThan(0);
    expect(container?.querySelectorAll('[data-text-type="marker"]')).toHaveLength(0);
  });

  // Guards the assertion above: paragraph structure does render gutter markers, so if this stops
  // finding any then the selector has drifted and the test before it would pass for the wrong
  // reason.
  it("renders gutter marker prefixes in paragraph structure, where they are supported", async () => {
    let container: HTMLElement | undefined;
    await act(async () => {
      ({ container } = render(
        <Editorial
          defaultUsj={usjGen1v1}
          options={{ isReadonly: true, view: getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE) }}
        />,
      ));
    });

    expect(container?.querySelectorAll('[data-text-type="marker"]').length).toBeGreaterThan(0);
  });

  // The layout is read-only, so the marker-insert path must refuse before it can build a fragment
  // and splice it into the document.
  it("refuses to insert a marker", async () => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          options={{ isReadonly: false, view: blockVerseOptions }}
        />,
      );
    });

    expect(() => ref.current?.insertMarker("p")).toThrow(/readonly/i);
  });

  // Same reasoning as the marker insert above, for the character-marker paths. Lexical does not
  // block `editor.update()` on `editable: false`, so these have to refuse on the *effective*
  // read-only state - gating on the raw `isReadonly` prop would let them mutate the document while
  // `getUsj()` kept returning the unedited USJ.
  it.each([
    ["removeCharacterMarker", (ref: EditorRef) => ref.removeCharacterMarker("nd")],
    ["replaceCharacterMarker", (ref: EditorRef) => ref.replaceCharacterMarker("nd", "bd")],
    ["extendCharacterMarker", (ref: EditorRef) => ref.extendCharacterMarker("nd")],
  ] as const)("refuses %s", async (_name, callMarkerMethod) => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          options={{ isReadonly: false, view: blockVerseOptions }}
        />,
      );
    });

    const editor = ref.current;
    if (!editor) throw new Error("editor ref is not set");
    expect(() => callMarkerMethod(editor)).toThrow(/readonly/i);
  });

  // Every entry point that would change the document has to refuse before it can, because Lexical
  // does not block `editor.update()` on `editable: false` - an edit that went through would leave
  // the rendered document and `getUsj()` silently diverged.
  it.each([
    ["cut", (ref: EditorRef) => ref.cut()],
    ["paste", (ref: EditorRef) => ref.paste()],
    ["pastePlainText", (ref: EditorRef) => ref.pastePlainText()],
    ["formatPara", (ref: EditorRef) => ref.formatPara("q1")],
    ["insertNote", (ref: EditorRef) => ref.insertNote("f")],
  ] as const)("refuses %s", async (_name, callMethod) => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          options={{ isReadonly: true, view: blockVerseOptions }}
        />,
      );
    });

    const editor = ref.current;
    if (!editor) throw new Error("editor ref is not set");
    expect(() => callMethod(editor)).toThrow(/block verse/i);
  });

  // The same guards close a gap that predates this layout: these methods used to go through for a
  // host that simply passed `isReadonly: true`, unlike their character-marker neighbours.
  it.each([
    ["cut", (ref: EditorRef) => ref.cut()],
    ["paste", (ref: EditorRef) => ref.paste()],
    ["pastePlainText", (ref: EditorRef) => ref.pastePlainText()],
    ["formatPara", (ref: EditorRef) => ref.formatPara("q1")],
    ["insertNote", (ref: EditorRef) => ref.insertNote("f")],
  ] as const)("refuses %s in a plain readonly editor", async (_name, callMethod) => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          options={{ isReadonly: true }}
        />,
      );
    });

    const editor = ref.current;
    if (!editor) throw new Error("editor ref is not set");
    expect(() => callMethod(editor)).toThrow(/readonly/i);
  });

  // The USJ-addressed APIs have no location to answer with, and no return value a host could check
  // for `setSelection`/`setAnnotation`. Report through the editor's own logger so a multi-pane host
  // hears it for every pane, not just the one that happened to ask first.
  it.each([
    ["getSelection", (ref: EditorRef) => ref.getSelection()],
    ["setSelection", (ref: EditorRef) => ref.setSelection({ start: { jsonPath: "$", offset: 0 } })],
    [
      "setAnnotation",
      (ref: EditorRef) =>
        ref.setAnnotation(
          { start: { jsonPath: "$", offset: 0 }, end: { jsonPath: "$", offset: 0 } },
          "comment",
          "annotation-1",
        ),
    ],
  ] as const)("reports that %s is unavailable", async (_name, callMethod) => {
    const logger = createLogger();
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          options={{ isReadonly: true, view: blockVerseOptions }}
          logger={logger}
        />,
      );
    });

    const editor = ref.current;
    if (!editor) throw new Error("editor ref is not set");
    expect(callMethod(editor)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("block verse layout"));
  });

  // A local update is a caller error, so it throws.
  it("refuses a local delta update", async () => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          options={{ isReadonly: true, view: blockVerseOptions }}
        />,
      );
    });

    expect(() => ref.current?.applyUpdate([{ retain: 1 }], "local")).toThrow(/block verse/i);
  });

  // A remote update is not: it arrives from a collaborator, and throwing into the host's op loop
  // would tear it down. It is reported and dropped instead - a read-only view refreshes by being
  // handed new USJ.
  it("drops a remote delta update without throwing", async () => {
    const logger = createLogger();
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editorial
          ref={ref}
          defaultUsj={usjGen1v1}
          options={{ isReadonly: true, view: blockVerseOptions }}
          logger={logger}
        />,
      );
    });

    expect(() => ref.current?.applyUpdate([{ retain: 1 }])).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("remote update"));
  });
});

describe("editor-usj adaptor with verse blocks", () => {
  // Giving up beats emitting USJ that looks right and has the wrong paragraph structure. Reported
  // rather than thrown: this runs inside a Lexical change listener, where `onError` would rethrow
  // and tear the editor down, and every other unexpected-node case in the adaptor reports too.
  it("reports and gives up rather than exporting a block verse tree as USJ", () => {
    const logger = createLogger();
    initializeEditorUsjAdaptor(logger);
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(
      usjGen1v1,
      blockVerseOptions,
    );

    expect(deserializeSerializedEditorState(serializedEditorState)).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("not round-trippable"));
  });

  it("still exports normally for the inline layouts", () => {
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(usjGen1v1);

    expect(deserializeSerializedEditorState(serializedEditorState)).toBeDefined();
  });
});
