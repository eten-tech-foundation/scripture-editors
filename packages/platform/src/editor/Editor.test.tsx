// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import Editorial from "../Editorial";
import { flushQueuedEvents } from "./editor-test.utils";
import { ContentJsonPath, Usj } from "@eten-tech-foundation/scripture-utilities";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
// Deep import: the marker-menu list component isn't exposed from shared-react's package entry.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NodeSelectionMenu, OptionItem } from "../../../../libs/shared-react/src/plugins/NodesMenu";
import { getUsjMarkerAction } from "./adaptors/usj-marker-action.utils";
import { act, fireEvent, render } from "@testing-library/react";
import {
  $createPoint,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
} from "lexical";
import { $isCharNode, $isNoteNode } from "shared";
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

async function pressDelete(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(
      KEY_DOWN_COMMAND,
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

const usjWithFootnote: Usj = {
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
        "first verse text ",
        {
          type: "note",
          marker: "f",
          caller: "+",
          content: [
            { type: "char", marker: "fr", content: ["1:1 "] },
            { type: "char", marker: "ft", content: ["existing footnote text"] },
          ],
        },
      ],
    },
  ],
};

/** Mounts the editor with a footnote and returns the real Lexical editor plus the public ref. */
async function mountFootnoteEditor(): Promise<{
  lexicalEditor: LexicalEditor;
  editorRef: EditorRef;
}> {
  const ref = createRef<EditorRef>();
  let editor: LexicalEditor | undefined;
  await act(async () => {
    render(
      <Editor
        ref={ref}
        defaultUsj={usjWithFootnote}
        scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
        onScrRefChange={vi.fn()}
      >
        <GrabEditor onEditor={(e) => (editor = e)} />
      </Editor>,
    );
  });
  await flushQueuedEvents();
  if (!editor || !ref.current) throw new Error("Editor did not mount");
  return { lexicalEditor: editor, editorRef: ref.current };
}

/** Depth-first walk of the current editor state (call inside an editor read/update). */
function $walk(node: LexicalNode, visit: (node: LexicalNode) => void): void {
  visit(node);
  if ($isElementNode(node)) node.getChildren().forEach((child) => $walk(child, visit));
}

/** The text node inside the note's char with the given marker (e.g. the "ft" content). */
function $findNoteCharText(marker: string): LexicalNode | undefined {
  let text: LexicalNode | undefined;
  $walk($getRoot(), (node) => {
    if (!text && $isCharNode(node) && node.getMarker() === marker)
      text = node.getChildAtIndex(0) ?? undefined;
  });
  return text;
}

/** The note's own trailing spacer text node (a direct child of the note, not inside a char). */
function $findNoteTrailingSpacer(): LexicalNode | undefined {
  let note: LexicalNode | undefined;
  $walk($getRoot(), (node) => {
    if (!note && $isNoteNode(node)) note = node;
  });
  if (!$isNoteNode(note)) return undefined;
  const textChildren = note.getChildren().filter($isTextNode);
  return textChildren[textChildren.length - 1];
}

/** Place a collapsed caret at `offset` in the text node the finder returns, then insert `marker`. */
async function insertMarkerAtCaret(
  lexicalEditor: LexicalEditor,
  editorRef: EditorRef,
  $findTarget: () => LexicalNode | undefined,
  offset: number,
  marker: string,
): Promise<void> {
  await act(async () => {
    lexicalEditor.update(() => {
      const target = $findTarget();
      if (!target) throw new Error("Caret target text node not found");
      const selection = $createRangeSelection();
      selection.anchor = $createPoint(target.getKey(), offset, "text");
      selection.focus = $createPoint(target.getKey(), offset, "text");
      $setSelection(selection);
    });
  });
  await act(async () => {
    editorRef.insertMarker(marker);
  });
  await flushQueuedEvents();
}

/** Assert the caret is collapsed inside a note's char with the given marker. */
function $expectCaretInsideNoteMarker(marker: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) throw new Error("Expected a range selection");
  expect(selection.isCollapsed()).toBe(true);
  // The caret lands inside the new marker (not stolen onto a note spacer by a transform)...
  const caretChar = selection.anchor.getNode().getParent();
  if (!$isCharNode(caretChar)) throw new Error("Caret is not inside a char");
  expect(caretChar.getMarker()).toBe(marker);
  // ...and the new marker stays inside the note rather than escaping into the paragraph.
  expect($isNoteNode(caretChar.getParent())).toBe(true);
}

// End-to-end guard for PT-3780: the marker-action test file runs on a bare editor with no
// plugins, so it can't see the NoteNode/CharNode transforms. Those transforms are what previously
// stole the caret out of the new marker onto a note spacer, so these cases must be covered with
// the real plugins mounted.
describe("insert char inside a footnote (PT-3780, end-to-end)", () => {
  it("keeps the marker in the note and the caret inside it — caret in existing footnote text", async () => {
    const { lexicalEditor, editorRef } = await mountFootnoteEditor();
    await insertMarkerAtCaret(lexicalEditor, editorRef, () => $findNoteCharText("ft"), 8, "fk");
    lexicalEditor.getEditorState().read(() => $expectCaretInsideNoteMarker("fk"));
  });

  it("keeps the marker in the note and the caret inside it — caret on a note spacer", async () => {
    const { lexicalEditor, editorRef } = await mountFootnoteEditor();
    await insertMarkerAtCaret(lexicalEditor, editorRef, $findNoteTrailingSpacer, 1, "fk");
    lexicalEditor.getEditorState().read(() => $expectCaretInsideNoteMarker("fk"));
  });

  // The demo (and the real note-editing flow) uses an expanded-note view; earlier cases used the
  // default collapsed view. Cover the expanded view with a different marker too.
  it("keeps the marker in the note and the caret inside it — expanded notes + fq", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjWithFootnote}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          onScrRefChange={vi.fn()}
          options={{
            view: {
              markerMode: "hidden",
              noteMode: "expanded",
              hasSpacing: true,
              isFormattedFont: true,
            },
          }}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    const lexicalEditor = editor;
    const editorRef = ref.current;
    if (!lexicalEditor || !editorRef) throw new Error("Editor did not mount");

    // Caret at offset 8 splits "existing footnote text" into "existing" | fq | " footnote text".
    await insertMarkerAtCaret(lexicalEditor, editorRef, () => $findNoteCharText("ft"), 8, "fq");
    lexicalEditor.getEditorState().read(() => {
      $expectCaretInsideNoteMarker("fq");
      // End-to-end (with transforms) the ft char is split at the caret and fq sits between the
      // halves: the note's char runs are fr, ft("existing"), fq, ft(" footnote text").
      let note: LexicalNode | undefined;
      $walk($getRoot(), (n) => {
        if (!note && $isNoteNode(n)) note = n;
      });
      if (!$isNoteNode(note)) throw new Error("note not found");
      const charRuns: { marker: string; text: string }[] = [];
      $walk(note, (n) => {
        if ($isCharNode(n)) charRuns.push({ marker: n.getMarker(), text: n.getTextContent() });
      });
      expect(charRuns.map((c) => c.marker)).toEqual(["fr", "ft", "fq", "ft"]);
      expect(charRuns[1].text).toBe("existing");
      expect(charRuns[3].text).toBe(" footnote text");
    });
  });
});

// The floating marker menu (typeahead) can't be opened/positioned in jsdom, but its list component
// renders plain <button role="menuitem"> options. This drives the real menu -> option-action seam
// (Editor.tsx wires the menu's action to the same getUsjMarkerAction that insertMarker uses) with
// the real plugins mounted, so a click ends up inside the new marker rather than on a note spacer.
describe("insert char via the marker menu (PT-3780, popover path)", () => {
  it("clicking the fk option inserts it in the note with the caret inside it", async () => {
    const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };
    const expandedNoteKeyRef = { current: undefined as string | undefined };
    // Mirrors Editor.tsx's `getMarkerAction={(marker) => getUsjMarkerAction(marker, ...)}` wiring.
    const fkOption: OptionItem = {
      name: "fk",
      label: "fk",
      description: "",
      action: (editor: LexicalEditor) =>
        getUsjMarkerAction("fk", expandedNoteKeyRef).action({ editor, reference: scrRef }),
    };

    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithFootnote} scrRef={scrRef} onScrRefChange={vi.fn()}>
          <GrabEditor onEditor={(e) => (editor = e)} />
          <NodeSelectionMenu options={[fkOption]} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    const lexicalEditor = editor;
    if (!lexicalEditor) throw new Error("Editor did not mount");

    // Place a collapsed caret inside the existing footnote text.
    await act(async () => {
      lexicalEditor.update(() => {
        const target = $findNoteCharText("ft");
        if (!target) throw new Error("ft char text not found");
        const selection = $createRangeSelection();
        selection.anchor = $createPoint(target.getKey(), 8, "text");
        selection.focus = $createPoint(target.getKey(), 8, "text");
        $setSelection(selection);
      });
    });

    const fkButton = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes("fk"),
    );
    if (!fkButton) throw new Error("fk menu option did not render");
    await act(async () => {
      fireEvent.click(fkButton);
    });
    await flushQueuedEvents();

    lexicalEditor.getEditorState().read(() => $expectCaretInsideNoteMarker("fk"));
  });
});

describe("undo after a verse-spanning delete (PT-4102 regression)", () => {
  // A guarded two-step delete over a range containing a verse marker used to leave undo dead:
  // ScriptureReferencePlugin's verse mutation listener dispatched SELECTION_CHANGE_COMMAND
  // synchronously mid-commit, corrupting the history stack. A single deletion must be a single
  // undoable step that a single undo fully restores.
  it("restores the deleted text and verse marker with a single undo", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjWithVerseInParagraphMiddle}
          scrRef={{ book: "GEN", chapterNum: 1, verseNum: 1 }}
          onScrRefChange={vi.fn()}
          options={{ structureProtectionMode: "guarded" }}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    // Select "pha " + verse marker + "Bra" — a range that spans the verse marker.
    await act(async () => {
      editorRef.setSelection({
        start: { jsonPath: "$.content[2].content[0]", offset: 2 },
        end: { jsonPath: "$.content[2].content[2]", offset: 3 },
      });
    });

    // Guarded two-step delete: the first Delete arms the range, the second removes it.
    await pressDelete(lexicalEditor);
    await pressDelete(lexicalEditor);
    await flushQueuedEvents();

    // Precondition: the range (verse marker + surrounding text) was actually deleted.
    const afterDelete = JSON.stringify(editorRef.getUsj());
    expect(afterDelete).not.toContain('"number":"2"');
    expect(afterDelete).not.toContain("Alpha ");

    // A single undo must bring the text and the verse marker back.
    await act(async () => {
      editorRef.undo();
    });
    await flushQueuedEvents();

    const afterUndo = JSON.stringify(editorRef.getUsj());
    expect(afterUndo).toContain("Alpha ");
    expect(afterUndo).toContain("Bravo");
    expect(afterUndo).toContain('"number":"2"');
  });
});
