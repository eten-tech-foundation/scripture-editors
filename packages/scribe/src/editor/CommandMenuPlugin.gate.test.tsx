import Editor from "./Editor";
import { act, render } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { ScriptureReference } from "shared";
import { KEY_DOWN_COMMAND, LexicalEditor } from "lexical";
import { FORMATTED_VIEW_MODE, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

// The Editor-level gate controls shared-react's `CommandMenuPlugin`, which `preventDefault`s a
// typed or pasted `\` and `/` so those characters never land in the document. Editable marker
// modes (Standard view) need a literal `\` to reach the editor - the marker-edit engine and the
// `\` marker menu both consume it - so the gate leaves CommandMenuPlugin UNMOUNTED there. In
// non-editable views (Formatted) a literal `\`/`/` is garbage, so the gate keeps CommandMenuPlugin
// mounted to swallow it. (Mirrors packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx.)
//
// These tests assert the gate's real, user-facing effect rather than merely which plugin mounts:
// they render the actual Editor (no mock) and dispatch a real `\`/`/` keydown through Lexical's
// command pipeline, then check whether a handler called `preventDefault`. The key is allowed to
// land in Standard view and is blocked in Formatted view.

// jsdom implements `getBoundingClientRect` on Element but not on Range. Scribe's Editor mounts
// `AutoFocusPlugin`, which focuses the editor root as soon as it renders; once focused, Lexical's
// post-commit scroll-into-view step reads a native `Range`'s bounding rect to decide whether to
// scroll, and jsdom's missing method throws (as an unhandled async rejection, after the render
// has already committed). Stub it the same way jsdom already stubs Element's version and the
// platform marker-edit tests already do (a zero rect nothing here asserts on) - see
// packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.tsx.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

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
const scrRef: ScriptureReference = { book: "GEN", chapterNum: 1, verseNum: 1 };

/** Reads the `LexicalEditor` out of the mounted `<Editor>` via the `.editor-input` DOM node's
 * `__lexicalEditor` back-reference.
 *
 * Platform's black-box `<Editor>` tests use a cleaner handle — a child `<EditorRefPlugin>` read
 * from composer context — but that needs `<Editor>` to render `children` inside its composer, and
 * scribe's `<Editor>` has no such slot. Hence this DOM reach-in, confined to one helper. */
function getEmbeddedLexicalEditor(container: HTMLElement | undefined): LexicalEditor {
  const editorInput = container?.querySelector(".editor-input");
  if (!editorInput) throw new Error("editor-input element not found");
  const lexical = (editorInput as unknown as { __lexicalEditor?: LexicalEditor }).__lexicalEditor;
  if (!lexical) throw new Error("lexical editor handle not found");
  return lexical;
}

/** Renders the real Editor in `viewMode` and returns its underlying Lexical editor. */
async function renderEditor(viewMode: string): Promise<LexicalEditor> {
  let container: HTMLElement | undefined;
  await act(async () => {
    const result = render(
      <Editor
        usjInput={sampleUsj}
        viewOptions={getViewOptions(viewMode)}
        scrRef={scrRef}
        onScrRefChange={() => undefined}
      />,
    );
    container = result.container;
  });
  return getEmbeddedLexicalEditor(container);
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
