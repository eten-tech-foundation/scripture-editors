import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { execCommandSpy } from "./markerEdit/markerEdit.test-helpers";
import { act, render } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { createRef, RefObject } from "react";
import {
  $createPoint,
  $createRangeSelection,
  $getRoot,
  $setSelection,
  COPY_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
} from "lexical";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { FORMATTED_VIEW_MODE, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Editor-level gate controls shared-react's `CommandMenuPlugin`, which `preventDefault`s a
// typed or pasted `\` and `/` so those characters never land in the document. Editable marker
// modes (Standard view) need a literal `\` to reach the editor - the marker-edit engine and the
// `\` marker menu both consume it - so the gate leaves CommandMenuPlugin UNMOUNTED there. In
// non-editable views (Formatted) a literal `\`/`/` is garbage, so the gate keeps CommandMenuPlugin
// mounted to swallow it.
//
// These tests assert the gate's real, user-facing effect rather than merely which plugin mounts:
// they render the actual Editor (no mock) and dispatch a real `\`/`/` keydown through Lexical's
// command pipeline, then check whether a handler called `preventDefault`. The key is allowed to
// land in Standard view and is blocked in Formatted view.

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

/** Renders the real Editor in `viewMode` and returns its underlying Lexical editor. The editor
 * is captured through a child `EditorRefPlugin` (which `<Editor>` renders inside its composer)
 * rather than a `.__lexicalEditor` DOM reach-in. */
async function renderEditorWithRef(
  viewMode: string,
): Promise<{ editor: LexicalEditor; ref: RefObject<EditorRef | null> }> {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={sampleUsj} options={{ view: getViewOptions(viewMode) }}>
        <EditorRefPlugin editorRef={lexicalRef} />
      </Editor>,
    );
  });
  if (!lexicalRef.current) throw new Error("lexical editor was not captured");
  return { editor: lexicalRef.current, ref };
}

async function renderEditor(viewMode: string): Promise<LexicalEditor> {
  return (await renderEditorWithRef(viewMode)).editor;
}

/**
 * Dispatches a cancelable `keydown` for `key` through the editor's command pipeline and reports
 * whether a handler blocked it (called `preventDefault`).
 */
async function keyWasBlocked(editor: LexicalEditor, key: string): Promise<boolean> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    editor.dispatchCommand(KEY_DOWN_COMMAND, event);
  });
  return event.defaultPrevented;
}

describe("CommandMenuPlugin editable-mode gate", () => {
  it("lets a literal \\ and / land in editable marker mode (Standard view)", async () => {
    const editor = await renderEditor(STANDARD_VIEW_MODE);
    expect(await keyWasBlocked(editor, "\\")).toBe(false);
    expect(await keyWasBlocked(editor, "/")).toBe(false);
  });

  it("blocks a literal \\ and / in a non-editable marker mode (Formatted view)", async () => {
    const editor = await renderEditor(FORMATTED_VIEW_MODE);
    expect(await keyWasBlocked(editor, "\\")).toBe(true);
    expect(await keyWasBlocked(editor, "/")).toBe(true);
  });
});

// The Standard-view-only clipboard engine ($handleCopyForStandardView, shared by the COPY_COMMAND
// and CUT_COMMAND registrations, plus $handlePasteForStandardView — all in MarkerEditPlugin.tsx)
// is registered only inside a block gated on `hasStandardViewWhitespace(viewOptions)`, itself
// nested inside the whole plugin's `markerMode === "editable"` gate. Formatted view's `markerMode`
// is "hidden", so neither gate opens and none of those handlers register at all. These tests prove
// that absence behaviorally, the same way the suite above proves CommandMenuPlugin's gate: render
// the real Editor (no mock), dispatch the real command, and check what actually happened to the
// clipboard/document — not which plugin mounted.

// A note whose caller is a printable, uncommon-elsewhere glyph ("+") so its presence in a copied
// payload is unambiguous evidence of the Standard-view USFM walker having run.
// `closed: "false"` marks the `\ft` char as never having its own closer, matching real
// ParatextData USJ for footnote content (see markerEdit.test-helpers.tsx's `noteUsx` doc comment)
// — not part of the `Usj` package type's `MarkerObject`, hence the cast below.
const sampleUsjWithNote = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "first verse text",
        {
          type: "note",
          marker: "f",
          caller: "+",
          content: [{ type: "char", marker: "ft", content: ["A note"], closed: "false" }],
        },
        " after",
      ],
    },
  ],
} as unknown as Usj;

/**
 * jsdom does not implement the DOM `ClipboardEvent` class (`typeof ClipboardEvent` is
 * `undefined` under this project's jsdom test environment). Formatted view registers no
 * Standard-view handler ahead of `@lexical/rich-text`'s own COPY_COMMAND fallback, so a dispatch
 * here falls all the way through to that fallback — which reads the bare, unimported, ambient
 * global `ClipboardEvent` identifier before it ever touches the event. With the global entirely
 * undefined that reference throws a `ReferenceError`, before any clipboard data is written.
 * `@lexical/utils`'s `objectKlassEquals` (which the fallback uses to decide whether to honor the
 * event) only compares constructor NAMES (`Object.getPrototypeOf(x).constructor.name`), not real
 * inheritance, so a same-named stand-in registered on `globalThis` satisfies both the reference
 * and the name check without jsdom needing to implement the real class. `StubClipboardEvent` is
 * declared and renamed here, rather than a class literally named `ClipboardEvent`, so this file's
 * own `ClipboardEvent` TYPE annotations keep referring to the real DOM type.
 */
class StubClipboardEvent {
  clipboardData: {
    getData: (type: string) => string;
    setData: (type: string, data: string) => void;
  };
  constructor(clipboardData: StubClipboardEvent["clipboardData"]) {
    this.clipboardData = clipboardData;
  }
  preventDefault(): void {
    /* not asserted on by these tests */
  }
}
Object.defineProperty(StubClipboardEvent, "name", { value: "ClipboardEvent" });

/** A jsdom-safe `ClipboardEvent`-shaped stub, with a real read/write `clipboardData` store, that
 * satisfies `@lexical/rich-text`'s own `objectKlassEquals(event, ClipboardEvent)` check (see
 * `StubClipboardEvent`'s doc comment) so RichText's default COPY_COMMAND handler actually runs
 * instead of throwing. Registers `StubClipboardEvent` as the global `ClipboardEvent` for the
 * caller to `vi.unstubAllGlobals()` afterward. */
function formattedViewCopyEvent(): { event: ClipboardEvent; getData: (type: string) => string } {
  const store = new Map<string, string>();
  const clipboardData = {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, data: string) => store.set(type, data),
  };
  vi.stubGlobal("ClipboardEvent", StubClipboardEvent);
  return {
    event: new StubClipboardEvent(clipboardData) as unknown as ClipboardEvent,
    getData: (type: string) => clipboardData.getData(type),
  };
}

/** Selects the whole document (first descendant through last descendant). */
function selectWholeDocument(editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot();
    const first = root.getFirstDescendant();
    const last = root.getLastDescendant();
    if (!first || !last) throw new Error("expected the loaded document to have content");
    const selection = $createRangeSelection();
    selection.anchor = $createPoint(first.getKey(), 0, "text");
    const lastSize = "getTextContentSize" in last ? last.getTextContentSize() : 0;
    selection.focus = $createPoint(last.getKey(), lastSize, "text");
    $setSelection(selection);
  });
}

describe("MarkerEditPlugin's Standard-view clipboard handlers do not leak into Formatted view", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("COPY_COMMAND yields Lexical's default payload: prose only, no marker glyphs, no note-caller character", async () => {
    const ref = createRef<EditorRef>();
    const lexicalRef = createRef<LexicalEditor>();
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={sampleUsjWithNote}
          options={{ view: getViewOptions(FORMATTED_VIEW_MODE) }}
        >
          <EditorRefPlugin editorRef={lexicalRef} />
        </Editor>,
      );
    });
    const editor = lexicalRef.current;
    if (!editor) throw new Error("lexical editor was not captured");

    await act(async () => selectWholeDocument(editor));
    const { event, getData } = formattedViewCopyEvent();
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });

    const text = getData("text/plain");
    // Real content was copied (proves the command actually ran, not that everything declined).
    expect(text).toContain("first verse text");
    // No marker glyphs: `$selectionToUsfmText` (the Standard-view walker, gated out of this view)
    // is the only thing in this codebase that renders literal backslash marker syntax like `\p`,
    // `\v`, or `\f`; Formatted view's own node types (ImmutableTypedTextNode et al.) carry no
    // backslash text at all, so any backslash here is direct evidence of the walker having run.
    expect(text).not.toContain("\\");
    expect(text).not.toContain("\\f");
    // No note-caller character: the collapsed note's caller renders as a DecoratorNode
    // (`ImmutableNoteCallerNode`) with no literal text of its own, so Lexical's default text
    // extraction never emits it — only the Standard-view walker renders the caller as visible "+"
    // text. Confirmed by direct comparison: calling `$getStandardViewClipboardData` against this
    // exact selection produces "...first verse text + A note after" (caller present); Lexical's
    // real default (asserted here) has no caller at all.
    expect(text).not.toContain("+");
  });

  it("an external \\-bearing paste is swallowed by CommandMenuPlugin's gate, not claimed by the Standard-view paste handler — nothing is inserted", async () => {
    const editor = await renderEditor(FORMATTED_VIEW_MODE);
    let before = "";
    editor.getEditorState().read(() => {
      before = $getRoot().getTextContent();
    });

    await act(async () =>
      editor.update(() => {
        const last = $getRoot().getLastDescendant();
        if (!last) throw new Error("expected the loaded document to have content");
        const lastSize = "getTextContentSize" in last ? last.getTextContentSize() : 0;
        const point = $createPoint(last.getKey(), lastSize, "text");
        const selection = $createRangeSelection();
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      }),
    );

    const payload = { "text/plain": "\\nd inserted\\nd*" };
    let prevented = false;
    const event = {
      clipboardData: { getData: (type: string) => payload[type as keyof typeof payload] ?? "" },
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as ClipboardEvent;

    let handled: boolean | undefined;
    await act(async () => {
      handled = editor.dispatchCommand(PASTE_COMMAND, event);
    });

    // CommandMenuPlugin's PASTE_COMMAND handler (COMMAND_PRIORITY_NORMAL, shared-react) is the
    // one that claims this: it swallows any paste containing `\` or `/`. The consolidated
    // Standard-view handler ($handlePasteForStandardView, COMMAND_PRIORITY_HIGH inside
    // MarkerEditPlugin) is not registered in Formatted view at all, so it never enters the race —
    // were it wrongly registered here, its HIGHER priority would let it win instead, tokenize the
    // marker text, and insert real structure, which the unchanged-document assertion below would
    // catch.
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(before);
    });
  });
});

/**
 * The empty-copy rule is not Standard view's. It lives in `ClipboardPlugin` (shared-react), which
 * every view mounts, and this view has no Standard-view copy handler registered at all — so a
 * regression here would leak the same way the reported one did, in a view where nothing else is
 * watching. These exercise the whole real path from the public surface to the clipboard: a keydown
 * on the root element where the plugin listens, and `EditorRef.copy()`/`.cut()`, the API a host
 * app drives the editor through.
 *
 * `execCommandSpy` supplies the `document.execCommand` jsdom lacks and reports whether anything was
 * written. `ClipboardEvent` is stubbed for the same reason `formattedViewCopyEvent` stubs it:
 * without it a regression would die on Lexical's own bare reference to the missing global before
 * reaching the clipboard, hiding what actually got written.
 */
describe("copying an empty selection leaves the clipboard alone in a hidden-marker view", () => {
  const execCommand = execCommandSpy();

  beforeEach(() => {
    vi.stubGlobal("ClipboardEvent", StubClipboardEvent);
  });

  afterEach(async () => {
    // Drain `@lexical/clipboard`'s module-level `EVENT_LATENCY` (50ms) handle so a test that
    // reached the real copy path cannot silence the next test's assertion.
    await new Promise((resolve) => setTimeout(resolve, 60));
    vi.unstubAllGlobals();
  });

  /** Collapses the selection at the end of the loaded document. */
  async function collapseCaretAtEnd(editor: LexicalEditor): Promise<void> {
    await act(async () =>
      editor.update(() => {
        const last = $getRoot().getLastDescendant();
        if (!last) throw new Error("expected the loaded document to have content");
        const lastSize = "getTextContentSize" in last ? last.getTextContentSize() : 0;
        const point = $createPoint(last.getKey(), lastSize, "text");
        const selection = $createRangeSelection();
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      }),
    );
  }

  it("Ctrl+C at a collapsed caret in Formatted view writes nothing", async () => {
    const { editor } = await renderEditorWithRef(FORMATTED_VIEW_MODE);
    await collapseCaretAtEnd(editor);

    const rootElement = editor.getRootElement();
    if (!rootElement) throw new Error("editor has no root element to press a key on");
    await act(async () => {
      rootElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(execCommand()).not.toHaveBeenCalled();
  });

  it("EditorRef.copy() at a collapsed caret writes nothing", async () => {
    const { editor, ref } = await renderEditorWithRef(FORMATTED_VIEW_MODE);
    await collapseCaretAtEnd(editor);

    await act(async () => ref.current?.copy());

    expect(execCommand()).not.toHaveBeenCalled();
  });

  it("EditorRef.cut() at a collapsed caret writes nothing and removes nothing", async () => {
    const { editor, ref } = await renderEditorWithRef(FORMATTED_VIEW_MODE);
    await collapseCaretAtEnd(editor);
    let before = "";
    editor.getEditorState().read(() => {
      before = $getRoot().getTextContent();
    });

    await act(async () => ref.current?.cut());

    expect(execCommand()).not.toHaveBeenCalled();
    editor.getEditorState().read(() => expect($getRoot().getTextContent()).toBe(before));
  });

  it("EditorRef.copy() right after a programmatic selection still copies", async () => {
    // The public API's ordinary shape — select, then copy — and the case a guard reading the last
    // COMMITTED selection would silently turn into a no-op, since Lexical commits on a microtask.
    const { editor, ref } = await renderEditorWithRef(FORMATTED_VIEW_MODE);

    await act(async () => {
      selectWholeDocument(editor);
      ref.current?.copy();
    });

    expect(execCommand()).toHaveBeenCalledWith("copy");
  });
});
