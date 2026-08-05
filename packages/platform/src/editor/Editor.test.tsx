// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorOptions, EditorRef } from "./editor.model";
import Editorial from "../Editorial";
import { flushQueuedEvents } from "./editor-test.utils";
import { ContentJsonPath, Usj } from "@eten-tech-foundation/scripture-utilities";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { act, render } from "@testing-library/react";
import { KEY_DELETE_COMMAND, KEY_DOWN_COMMAND, LexicalCommand, LexicalEditor } from "lexical";
import { createRef, RefObject, useEffect } from "react";
import { vi } from "vitest";

/** USJ with book PSA for Editor sync effect test (clone of usjGen1v1 with book code changed) */
const usjWithPsa: Usj = JSON.parse(JSON.stringify(usjGen1v1));
const bookEl = usjWithPsa.content[0] as { type: string; marker: string; code: string };
if (bookEl.type === "book" && bookEl.marker === "id") {
  bookEl.code = "PSA";
}

describe("Editor scrRef book sync", () => {
  it("should call onScrRefChange with book from USJ when scrRef.book mismatches", async () => {
    const mockOnScrRefChange = vi.fn();
    const scrRefWithWrongBook = { book: "GEN", chapterNum: 1, verseNum: 1 };

    await act(async () => {
      render(
        <Editorial
          defaultUsj={usjWithPsa}
          scrRef={scrRefWithWrongBook}
          onScrRefChange={mockOnScrRefChange}
        />,
      );
    });

    expect(mockOnScrRefChange).toHaveBeenCalledWith(
      expect.objectContaining({ book: "PSA", chapterNum: 1, verseNum: 1 }),
    );
  });

  it("should not call onScrRefChange for book sync when scrRef.book matches USJ", async () => {
    const mockOnScrRefChange = vi.fn();
    const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };

    await act(async () => {
      render(
        <Editorial defaultUsj={usjGen1v1} scrRef={scrRef} onScrRefChange={mockOnScrRefChange} />,
      );
    });

    expect(mockOnScrRefChange).not.toHaveBeenCalled();
  });
});

const sampleUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    {
      type: "book",
      marker: "id",
      code: "GEN",
      content: ["Test Book"],
    },
    {
      type: "chapter",
      marker: "c",
      number: "1",
    },
    {
      type: "para",
      marker: "p",
      content: [
        {
          type: "verse",
          marker: "v",
          number: "1",
        },
        "first verse text",
      ],
    },
  ],
};

const versePath: ContentJsonPath = "$.content[2].content[1]";
const verseTextLength = "first verse text".length;
const testRange = {
  start: { jsonPath: versePath, offset: 0 },
  end: { jsonPath: versePath, offset: verseTextLength },
};

async function createEditorRefForTesting(): Promise<RefObject<EditorRef | null>> {
  const ref = createRef<EditorRef>();
  await act(async () => {
    render(<Editor ref={ref} defaultUsj={sampleUsj} />);
  });
  if (!ref.current) throw new Error("EditorRef did not mount");
  return ref;
}

function getMarkElement(): HTMLElement {
  // Find the rendered <mark> element on the document. The editor renders the contenteditable to
  // the DOM, so any annotation will produce a <mark> we can dispatch events on.
  const mark = document.querySelector("mark");
  if (!(mark instanceof HTMLElement))
    throw new Error("Expected a <mark> element in the editor DOM");
  return mark;
}

function triggerClickOnMark(): void {
  const element = getMarkElement();
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

function triggerMouseEnterOnMark(): void {
  const element = getMarkElement();
  act(() => {
    element.dispatchEvent(new window.MouseEvent("mouseenter"));
  });
}

describe("setAnnotation overload", () => {
  it("accepts the deprecated positional form (onClick, onRemove)", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");
    const onClick = vi.fn();

    await act(async () => {
      editor.setAnnotation(testRange, "highlight", "id-1", onClick);
    });

    triggerClickOnMark();
    expect(onClick).toHaveBeenCalled();
  });

  it("accepts the new options-object form with onClick", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");
    const onClick = vi.fn();

    await act(async () => {
      editor.setAnnotation(testRange, "highlight", "id-1", { onClick });
    });

    triggerClickOnMark();
    expect(onClick).toHaveBeenCalled();
  });

  it("accepts the new options-object form with onMouseEnter", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");
    const onMouseEnter = vi.fn();

    await act(async () => {
      editor.setAnnotation(testRange, "highlight", "id-1", { onMouseEnter });
    });

    triggerMouseEnterOnMark();
    expect(onMouseEnter).toHaveBeenCalled();
  });

  it("accepts the no-callback form (4th arg omitted) and dispatches click harmlessly", async () => {
    // Exercises the `fourth === undefined` branch of the discriminator. Both forms - omitted
    // 4th arg and an empty options-object - should leave the mark functional but produce no
    // callback invocations (and no thrown errors when the user clicks/hovers it).
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    await act(async () => {
      editor.setAnnotation(testRange, "highlight", "id-1");
    });

    expect(() => triggerClickOnMark()).not.toThrow();
    expect(() => triggerMouseEnterOnMark()).not.toThrow();
  });
});

/** Grabs the underlying Lexical editor so tests can dispatch commands the public ref doesn't expose. */
function GrabEditor({ onEditor }: { onEditor: (editor: LexicalEditor) => void }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return null;
}

/** Renders the platform <Editor> and returns both the public ref and the underlying Lexical editor
 * (needed to dispatch key commands). Covers the setup every delete/undo test repeats. */
async function mountEditorForUndo(config: {
  usj: Usj;
  scrRef: SerializedVerseRef;
  structureProtectionMode: EditorOptions["structureProtectionMode"];
}): Promise<{ editorRef: EditorRef; lexicalEditor: LexicalEditor }> {
  const ref = createRef<EditorRef>();
  let editor: LexicalEditor | undefined;
  await act(async () => {
    render(
      <Editor
        ref={ref}
        defaultUsj={config.usj}
        scrRef={config.scrRef}
        onScrRefChange={vi.fn()}
        options={{ structureProtectionMode: config.structureProtectionMode }}
      >
        <GrabEditor onEditor={(e) => (editor = e)} />
      </Editor>,
    );
  });
  await flushQueuedEvents();
  if (!ref.current || !editor) throw new Error("EditorRef did not mount");
  return { editorRef: ref.current, lexicalEditor: editor };
}

/** Dispatches a synthetic Delete keydown as `command`. Guarded mode listens on KEY_DOWN_COMMAND
 * (StructureKeyboardPlugin drives the two-step delete from there); Power mode ("off") has no such
 * listener, so its native delete must go straight to KEY_DELETE_COMMAND — jsdom can't carry a real
 * DOM keydown far enough to reach RichTextPlugin on its own. */
async function pressDeleteKey(
  editor: LexicalEditor,
  command: LexicalCommand<KeyboardEvent>,
): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(
      command,
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
  });
}

const usjWithVerseInParagraphMiddle: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: ["Alpha ", { type: "verse", marker: "v", number: "2" }, "Bravo"],
    },
  ],
};

describe("undo after a verse-spanning delete (PT-4102 regression)", () => {
  // A guarded two-step delete over a range containing a verse marker used to leave undo dead:
  // ScriptureReferencePlugin's verse mutation listener dispatched SELECTION_CHANGE_COMMAND
  // synchronously mid-commit, corrupting the history stack. A single deletion must be a single
  // undoable step that a single undo fully restores.
  it("restores the deleted text and verse marker with a single undo", async () => {
    const { editorRef, lexicalEditor } = await mountEditorForUndo({
      usj: usjWithVerseInParagraphMiddle,
      scrRef: { book: "GEN", chapterNum: 1, verseNum: 1 },
      structureProtectionMode: "guarded",
    });
    // Snapshot the loaded document; a single undo must return to exactly this.
    const original = editorRef.getUsj();
    if (!original) throw new Error("editor did not load USJ");

    // Select "pha " + verse marker + "Bra" — a range that spans the verse marker.
    await act(async () => {
      editorRef.setSelection({
        start: { jsonPath: "$.content[2].content[0]", offset: 2 },
        end: { jsonPath: "$.content[2].content[2]", offset: 3 },
      });
    });

    // Guarded two-step delete: the first Delete arms the range, the second removes it.
    await pressDeleteKey(lexicalEditor, KEY_DOWN_COMMAND);
    await pressDeleteKey(lexicalEditor, KEY_DOWN_COMMAND);
    await flushQueuedEvents();

    // Precondition: the range (verse marker + surrounding text) was actually deleted.
    const afterDelete = JSON.stringify(editorRef.getUsj());
    expect(afterDelete).not.toContain('"number":"2"');
    expect(afterDelete).not.toContain("Alpha ");

    await act(async () => {
      editorRef.undo();
    });
    await flushQueuedEvents();

    expect(editorRef.getUsj()).toEqual(original);
  });
});

/** Mark 1 with two adjacent verses (7 and 8) inside one paragraph — the PT-4125 repro shape. */
const usjWithTwoAdjacentVerses: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "MRK", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        "Six ",
        { type: "verse", marker: "v", number: "7" },
        "Seven ",
        { type: "verse", marker: "v", number: "8" },
        "Eight ",
      ],
    },
  ],
};

describe("undo after a native verse delete (PT-4125 regression)", () => {
  // PT-4125 reproduced in PT10 Power mode, which maps to structureProtectionMode "off": the
  // StructureKeyboardPlugin registers nothing and deletion is fully native Lexical — not the guarded
  // two-step delete the PT-4102 test above exercises. The fix (deferring ScriptureReferencePlugin's
  // SELECTION_CHANGE dispatch off the verse mutation listener with queueMicrotask) is gesture-
  // agnostic, so native deletes must stay undoable too. This locks in the native path, previously
  // covered only for the guarded path.
  //
  // We delete a range, not a collapsed-caret backspace: the collapsed path routes through Lexical's
  // deleteCharacter, which needs domSelection.modify (unimplemented in jsdom). A range delete drives
  // the same verse-destruction -> mutation-listener -> history path.
  it("restores both deleted verse markers with a single undo (Mark 1:7-8 scenario)", async () => {
    const { editorRef, lexicalEditor } = await mountEditorForUndo({
      usj: usjWithTwoAdjacentVerses,
      scrRef: { book: "MRK", chapterNum: 1, verseNum: 6 },
      structureProtectionMode: "off",
    });
    // Snapshot the loaded document; a single undo must return to exactly this.
    const original = editorRef.getUsj();
    if (!original) throw new Error("editor did not load USJ");

    // Select from inside "Six " through the start of "Eight " — spans both verse markers (7 and 8).
    await act(async () => {
      editorRef.setSelection({
        start: { jsonPath: "$.content[2].content[0]", offset: 4 },
        end: { jsonPath: "$.content[2].content[4]", offset: 0 },
      });
    });

    await pressDeleteKey(lexicalEditor, KEY_DELETE_COMMAND);
    await flushQueuedEvents();

    // Precondition: both verse markers were actually deleted.
    const afterDelete = JSON.stringify(editorRef.getUsj());
    expect(afterDelete).not.toContain('"number":"7"');
    expect(afterDelete).not.toContain('"number":"8"');

    await act(async () => {
      editorRef.undo();
    });
    await flushQueuedEvents();

    expect(editorRef.getUsj()).toEqual(original);
  });
});
