// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editorial from "../Editorial";
import { EditorRef } from "./editor.model";
import { deserializeSerializedEditorState } from "./adaptors/editor-usj.adaptor";
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

  it("refuses to apply a delta update", async () => {
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

    expect(() => ref.current?.applyUpdate([{ retain: 1 }])).toThrow(/block verse/i);
  });

  // USJ locations are indexes into the source USJ's content, which the regrouping renumbers.
  it("reports no USJ selection", async () => {
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

    expect(ref.current?.getSelection()).toBeUndefined();
  });
});

describe("editor-usj adaptor with verse blocks", () => {
  // Refusing loudly beats emitting USJ that looks right and has the wrong paragraph structure.
  it("throws rather than exporting a block verse tree as USJ", () => {
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(
      usjGen1v1,
      blockVerseOptions,
    );

    expect(() => deserializeSerializedEditorState(serializedEditorState)).toThrow(
      /not round-trippable/i,
    );
  });

  it("still exports normally for the inline layouts", () => {
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(usjGen1v1);

    expect(deserializeSerializedEditorState(serializedEditorState)).toBeDefined();
  });
});
