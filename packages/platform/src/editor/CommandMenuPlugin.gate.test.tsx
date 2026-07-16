import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { act, render } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { createRef } from "react";
import { KEY_DOWN_COMMAND, LexicalEditor } from "lexical";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { FORMATTED_VIEW_MODE, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";
import { describe, expect, it } from "vitest";

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
async function renderEditor(viewMode: string): Promise<LexicalEditor> {
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
  return lexicalRef.current;
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
