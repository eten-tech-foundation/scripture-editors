// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorOptions, EditorRef } from "./editor.model";
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
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import { createRef, RefObject, useEffect, useState } from "react";
import {
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  $isSynthesizedMarkerNode,
  closingMarkerText,
  MarkerNode,
  NBSP,
  openingMarkerText,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";
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

async function createReadonlyEditorRefForTesting(): Promise<RefObject<EditorRef | null>> {
  const ref = createRef<EditorRef>();
  await act(async () => {
    render(<Editor ref={ref} defaultUsj={sampleUsj} options={{ isReadonly: true }} />);
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

describe("removeCharacterMarker guards", () => {
  it("throws in readonly mode", async () => {
    const ref = await createReadonlyEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.removeCharacterMarker("nd")).toThrow(
      "Cannot remove character marker in readonly mode",
    );
  });

  it("throws for a para marker, which removal can never act on", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    // Note this is stricter than insertMarker's isUsjMarkerSupported, which accepts "p".
    expect(() => editor.removeCharacterMarker("p")).toThrow("Unsupported character marker 'p'");
  });

  it("throws for an unknown marker", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.removeCharacterMarker("zzz")).toThrow("Unsupported character marker 'zzz'");
  });

  it.each(["ft", "xt"])(
    "throws for the note-only character marker '%s', which removal always skips",
    async (marker) => {
      const ref = await createEditorRefForTesting();
      const editor = ref.current;
      if (!editor) throw new Error("Editor not mounted");

      // CharNode.isValidMarker accepts these — VALID_CHAR_MARKERS spreads in the footnote and
      // cross-reference markers — but they only ever occur inside a NoteNode, which
      // $getMatchingCharNode skips. Throwing beats accepting the call and silently doing nothing.
      expect(() => editor.removeCharacterMarker(marker)).toThrow(
        `Unsupported character marker '${marker}'`,
      );
    },
  );

  it("returns false without throwing when the marker is omitted and there is no selection", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    // The return value is what makes this more than a smoke test: a fresh editor has no selection,
    // so the call must report that it removed nothing rather than merely not crashing.
    expect(editor.removeCharacterMarker()).toBe(false);
  });
});

describe("replaceCharacterMarker guards", () => {
  it("throws in readonly mode", async () => {
    const ref = await createReadonlyEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.replaceCharacterMarker("bd")).toThrow(
      "Cannot replace character marker in readonly mode",
    );
  });

  it("throws for a para marker as the target", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    // Stricter than insertMarker's isUsjMarkerSupported, which accepts "p".
    expect(() => editor.replaceCharacterMarker("p")).toThrow("Unsupported character marker 'p'");
  });

  it("throws for an unknown target marker", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.replaceCharacterMarker("zzz")).toThrow(
      "Unsupported character marker 'zzz'",
    );
  });

  it("throws for an unknown source marker", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.replaceCharacterMarker("bd", "zzz")).toThrow(
      "Unsupported character marker 'zzz'",
    );
  });

  it.each(["ft", "xt"])(
    "throws for the note-only character marker '%s', which replacement always skips",
    async (marker) => {
      const ref = await createEditorRefForTesting();
      const editor = ref.current;
      if (!editor) throw new Error("Editor not mounted");

      // Same reason removeCharacterMarker rejects them: they only ever occur inside a NoteNode,
      // which $getMatchingCharNode skips, so neither direction of the call can do anything.
      expect(() => editor.replaceCharacterMarker(marker)).toThrow(
        `Unsupported character marker '${marker}'`,
      );
      expect(() => editor.replaceCharacterMarker("bd", marker)).toThrow(
        `Unsupported character marker '${marker}'`,
      );
    },
  );

  it("returns false without throwing when there is no selection", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    // The return value is what makes this more than a smoke test: a fresh editor has no selection,
    // so the call must report that it changed nothing rather than merely not crashing.
    expect(editor.replaceCharacterMarker("bd")).toBe(false);
  });
});

describe("extendCharacterMarker guards", () => {
  it("throws in readonly mode", async () => {
    const ref = await createReadonlyEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.extendCharacterMarker("bd")).toThrow(
      "Cannot extend character marker in readonly mode",
    );
  });

  it("throws for a para marker, which extension can never act on", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.extendCharacterMarker("p")).toThrow("Unsupported character marker 'p'");
  });

  it("throws for an unsupported conflicting marker", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    // The injected list is caller-supplied data (OQ-6), so it gets the same validation as the
    // target marker rather than being trusted.
    expect(() => editor.extendCharacterMarker("bd", ["zzz"])).toThrow(
      "Unsupported character marker 'zzz'",
    );
  });

  it("returns false without throwing when there is no selection", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(editor.extendCharacterMarker("bd")).toBe(false);
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

const usjWithCharMarker: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: ["the ", { type: "char", marker: "nd", content: ["Lord"] }, " said"],
    },
  ],
};

/** Selects the whole content of the first `CharNode` in the document. */
async function selectCharNodeContent(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.update(
      () => {
        const para = $getRoot().getChildren().find($isSomeParaNode);
        const charNode = para?.getChildren().find($isCharNode);
        // Not just `$isTextNode`: `MarkerNode` extends `TextNode`, so under
        // `markerMode: "editable"` the first match would be the opening `\nd` marker.
        const textNode = charNode
          ?.getChildren()
          .find(
            (child): child is TextNode => $isTextNode(child) && !$isSynthesizedMarkerNode(child),
          );
        if (!textNode) throw new Error("Expected a text node inside a CharNode");
        textNode.select(0, textNode.getTextContentSize());
      },
      { discrete: true },
    );
  });
}

const usjWithPartialCharMarker: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: ["kolo ", { type: "char", marker: "bd", content: ["Mulu"] }],
    },
  ],
};

/** Selects the whole first para, from its first text node to the end of its last. */
async function selectWholePara(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.update(
      () => {
        const para = $getRoot().getChildren().find($isSomeParaNode);
        if (!para) throw new Error("Expected a para node");
        // Text points, not element points: `getSelectionOffsets` reads `anchor.offset` verbatim,
        // so an element point's child index would be mistaken for a character offset.
        // Not just `$isTextNode`: `MarkerNode` extends `TextNode`, so a marker-visible mode would
        // otherwise put the synthesized marker text at either end.
        const textNodes = para.getAllTextNodes().filter((node) => !$isSynthesizedMarkerNode(node));
        const firstTextNode = textNodes[0];
        const lastTextNode = textNodes[textNodes.length - 1];
        if (!firstTextNode || !lastTextNode) throw new Error("Expected text nodes in the para");
        const selection = $createRangeSelection();
        selection.anchor.set(firstTextNode.getKey(), 0, "text");
        selection.focus.set(lastTextNode.getKey(), lastTextNode.getTextContentSize(), "text");
        $setSelection(selection);
      },
      { discrete: true },
    );
  });
}

/**
 * Asserts the rendered char span carries `toMarker` and no trace of `fromMarker`.
 *
 * `CharNode.updateDOM` writes these by hand, because Lexical reuses the existing element rather than
 * re-running `createDOM` when only the marker changed. Asserting on the live DOM is what covers that
 * reuse path - `CharNode.test.ts` exercises `updateDOM` against a detached element, which cannot see
 * whether the reconciler ever reached it.
 */
function expectRenderedCharMarker(
  editor: LexicalEditor,
  toMarker: string,
  fromMarker: string,
): void {
  const rootElement = editor.getRootElement();
  if (!rootElement) throw new Error("Editor has no root element");
  // Scoped to the `char` class `CharNode.createDOM` adds: para and chapter spans carry
  // `data-marker` too, and they come first in document order.
  const charElement = rootElement.querySelector("span.char[data-marker]");
  if (!charElement) throw new Error("No rendered char span found");
  expect(charElement.getAttribute("data-marker")).toBe(toMarker);
  expect(charElement.classList.contains(`usfm_${toMarker}`)).toBe(true);
  expect(charElement.classList.contains(`usfm_${fromMarker}`)).toBe(false);
}

describe("removeCharacterMarker through the editor ref", () => {
  // The guards above only prove the method throws when it should. This drives it end to end so
  // `Editor.tsx`'s wiring is covered too - in particular that it forwards its `viewOptions` as the
  // third argument. `viewOptions` is what enables the NBSP trim, and every adaptor-level test
  // passes its own view options directly, so a wiring that dropped that argument would leave all
  // of them green while leaving an NBSP in the text of the real editor.
  it("removes the marker and its NBSP under markerMode 'editable'", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjWithCharMarker}
          options={{
            view: {
              markerMode: "editable",
              noteMode: "expanded",
              hasSpacing: false,
              isFormattedFont: false,
            },
          }}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const editorRef = ref.current;

    // Precondition: the adaptor really did prepend the NBSP, so the trim below has something to do.
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toContain(NBSP);

    await selectCharNodeContent(editor);
    await act(async () => {
      editorRef.removeCharacterMarker("nd");
    });
    await flushQueuedEvents();

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    expect(JSON.stringify(para.content)).not.toContain('"char"');
    expect(para.content?.join("")).toBe("the Lord said");
  });
});

describe("replaceCharacterMarker through the editor ref", () => {
  it("changes the marker in the exported USJ, preserving the content", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithCharMarker}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const editorRef = ref.current;

    await selectCharNodeContent(editor);
    let didReplace = false;
    await act(async () => {
      didReplace = editorRef.replaceCharacterMarker("bd", "nd");
    });
    await flushQueuedEvents();

    expect(didReplace).toBe(true);

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    const serialized = JSON.stringify(para.content);
    expect(serialized).toContain('"marker":"bd"');
    expect(serialized).not.toContain('"marker":"nd"');
    expect(serialized).toContain('"Lord"');
  });

  // The default marker mode above renders no marker text, so it cannot see the synthesized-marker
  // retargeting `$setCharNodeMarker` does — the part of the change that `markerMode: "editable"` is
  // the whole point of. Every test that does cover it runs against hand-built node trees, so this
  // drives it end to end over a tree the real USJ adaptor produced, through `Editor.tsx`'s wiring.
  it("retargets the synthesized markers under markerMode 'editable'", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjWithCharMarker}
          options={{
            view: {
              markerMode: "editable",
              noteMode: "expanded",
              hasSpacing: false,
              isFormattedFont: false,
            },
          }}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    // Precondition: the adaptor really did synthesize the \nd opening and closing markers, so the
    // retarget below has something to do.
    expect(lexicalEditor.getEditorState().read(() => $getRoot().getTextContent())).toContain(
      openingMarkerText("nd"),
    );

    await selectCharNodeContent(lexicalEditor);
    let didReplace = false;
    await act(async () => {
      didReplace = editorRef.replaceCharacterMarker("bd", "nd");
    });
    await flushQueuedEvents();

    expect(didReplace).toBe(true);

    // Both synthesized children were retargeted, not stripped and not left stale.
    const text = lexicalEditor.getEditorState().read(() => $getRoot().getTextContent());
    expect(text).toContain(openingMarkerText("bd"));
    expect(text).toContain(closingMarkerText("bd"));
    expect(text).not.toContain(openingMarkerText("nd"));
    expect(text).not.toContain(closingMarkerText("nd"));

    expectRenderedCharMarker(lexicalEditor, "bd", "nd");

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    const serialized = JSON.stringify(para.content);
    expect(serialized).toContain('"marker":"bd"');
    expect(serialized).not.toContain('"marker":"nd"');
    expect(serialized).toContain('"Lord"');
  });

  // The "editable" counterpart above synthesizes `MarkerNode` children; "visible" synthesizes
  // `ImmutableTypedTextNode`s instead, which `$retargetSynthesizedMarkers` handles in a separate
  // branch - and the order-sensitive one, since it matches each child against the *old* marker's
  // text. That branch otherwise only runs against hand-built node trees.
  it("retargets the synthesized markers under markerMode 'visible'", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjWithCharMarker}
          options={{
            view: {
              markerMode: "visible",
              noteMode: "expanded",
              hasSpacing: false,
              isFormattedFont: false,
            },
          }}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    // Precondition: the adaptor really did synthesize the \nd opening and closing markers, so the
    // retarget below has something to do.
    expect(lexicalEditor.getEditorState().read(() => $getRoot().getTextContent())).toContain(
      openingMarkerText("nd"),
    );

    await selectCharNodeContent(lexicalEditor);
    let didReplace = false;
    await act(async () => {
      didReplace = editorRef.replaceCharacterMarker("bd", "nd");
    });
    await flushQueuedEvents();

    expect(didReplace).toBe(true);

    // Both synthesized children were retargeted, not stripped and not left stale.
    const text = lexicalEditor.getEditorState().read(() => $getRoot().getTextContent());
    expect(text).toContain(openingMarkerText("bd"));
    expect(text).toContain(closingMarkerText("bd"));
    expect(text).not.toContain(openingMarkerText("nd"));
    expect(text).not.toContain(closingMarkerText("nd"));

    expectRenderedCharMarker(lexicalEditor, "bd", "nd");

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    const serialized = JSON.stringify(para.content);
    expect(serialized).toContain('"marker":"bd"');
    expect(serialized).not.toContain('"marker":"nd"');
    expect(serialized).toContain('"Lord"');
  });
});

describe("extendCharacterMarker through the editor ref", () => {
  it("covers the whole selection with one marker, not a nested pair", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithPartialCharMarker}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    await selectWholePara(lexicalEditor);
    let didExtend = false;
    await act(async () => {
      didExtend = editorRef.extendCharacterMarker("bd");
    });
    await flushQueuedEvents();

    expect(didExtend).toBe(true);

    // The whole point of the ticket: a naive wrap over this selection yields
    // `\bd kolo \bd Mulu\bd*\bd*`. `$charNodeTransform` merges the new run into the existing one,
    // so exactly one `char` node comes out and nothing is nested inside it.
    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    expect(para.content?.length).toBe(1);
    const [charContent] = para.content ?? [];
    if (typeof charContent !== "object" || !("marker" in charContent))
      throw new Error("charContent is not a USJ char node");
    expect(charContent.marker).toBe("bd");
    expect(charContent.content).toEqual(["kolo Mulu"]);
  });

  it("coalesces several separate runs in the selection into one", async () => {
    const usjWithTwoRuns: Usj = {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
        { type: "chapter", marker: "c", number: "1" },
        {
          type: "para",
          marker: "p",
          content: [
            { type: "char", marker: "bd", content: ["kolo"] },
            " ana ",
            { type: "char", marker: "bd", content: ["Mulu"] },
          ],
        },
      ],
    };
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithTwoRuns}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    await selectWholePara(lexicalEditor);
    await act(async () => {
      editorRef.extendCharacterMarker("bd");
    });
    await flushQueuedEvents();

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    expect(para.content?.length).toBe(1);
    const [charContent] = para.content ?? [];
    if (typeof charContent !== "object" || !("marker" in charContent))
      throw new Error("charContent is not a USJ char node");
    expect(charContent.marker).toBe("bd");
    expect(charContent.content).toEqual(["kolo ana Mulu"]);
  });

  it("is a no-op on an already fully covered selection", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithCharMarker}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    const before = JSON.stringify(editorRef.getUsj());
    await selectCharNodeContent(lexicalEditor);
    let didExtend = false;
    await act(async () => {
      didExtend = editorRef.extendCharacterMarker("nd");
    });
    await flushQueuedEvents();

    expect(didExtend).toBe(false);
    expect(JSON.stringify(editorRef.getUsj())).toBe(before);
  });

  it("removes a conflicting marker passed through the ref before extending", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    await act(async () => {
      render(
        <Editor ref={ref} defaultUsj={usjWithCharMarker}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");
    const lexicalEditor = editor;
    const editorRef = ref.current;

    await selectCharNodeContent(lexicalEditor);
    let didExtend = false;
    await act(async () => {
      // The unit suite covers the conflict logic itself; what this pins down is that the caller's
      // list survives the `EditorRef` boundary at all — `Editor.tsx` validates every entry and
      // forwards the array, and nothing else proves that forwarding happens.
      didExtend = editorRef.extendCharacterMarker("bd", ["nd"]);
    });
    await flushQueuedEvents();

    expect(didExtend).toBe(true);

    // `\nd` is gone rather than nested inside `\bd`, and the surrounding plain text is untouched.
    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    expect(para.content).toEqual([
      "the ",
      { type: "char", marker: "bd", content: ["Lord"] },
      " said",
    ]);
  });
});

const blankUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [{ type: "book", marker: "id", code: "GEN", content: ["Test Book"] }],
};

describe("applyUpdate('local') undo-history retention", () => {
  // This test verifies that a value-equal (but reference-different) `view` object does NOT clear
  // undo history; the next test verifies the complementary case - that a genuinely different
  // `view` still does. See the comment on `viewOptions`'s memoization in Editor.tsx for why this
  // matters.
  it("stays undoable across a re-render that passes a fresh-but-equal `options.view` object", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    // Two different object references with the same content - simulates a parent re-render that
    // recomputes `options`/`view` without (or despite) its own memoization.
    const optionsA: EditorOptions = {
      view: { markerMode: "visible", hasSpacing: true, isFormattedFont: false },
    };
    const optionsB: EditorOptions = {
      view: { markerMode: "visible", hasSpacing: true, isFormattedFont: false },
    };

    let rerender: ((element: React.ReactElement) => void) | undefined;
    await act(async () => {
      const result = render(
        <Editor ref={ref} defaultUsj={blankUsj} options={optionsA}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
      rerender = result.rerender;
    });
    await flushQueuedEvents();
    if (!rerender) throw new Error("render did not return a rerender function");
    const rerenderEditor = rerender;
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");

    let canUndo = false;
    editor.registerCommand<boolean>(
      CAN_UNDO_COMMAND,
      (payload) => {
        canUndo = payload;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    await act(async () => {
      ref.current?.applyUpdate(
        [
          { insert: { chapter: { number: "1", style: "c" } } },
          { insert: { verse: { number: "1", style: "v" } } },
        ],
        "local",
      );
    });
    await flushQueuedEvents();
    expect(canUndo).toBe(true);

    // Mirror the paranext-core sequence: a later re-render (the PDP round-trip settling) passes a
    // fresh `options` object whose `view` is value-equal to the original but a different reference.
    await act(async () => {
      rerenderEditor(
        <Editor ref={ref} defaultUsj={blankUsj} options={optionsB}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();

    expect(canUndo).toBe(true);
  });

  it("clears undo history across a re-render that passes a genuinely different `view` object", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;
    const optionsA: EditorOptions = {
      view: { markerMode: "visible", hasSpacing: true, isFormattedFont: false },
    };
    // A real view-mode switch - `markerMode` differs from `optionsA` - so the memoized
    // `viewOptions` must produce a new value and let `LoadStatePlugin` reload as intended.
    const optionsDifferentView: EditorOptions = {
      view: { markerMode: "hidden", hasSpacing: true, isFormattedFont: false },
    };

    let rerender: ((element: React.ReactElement) => void) | undefined;
    await act(async () => {
      const result = render(
        <Editor ref={ref} defaultUsj={blankUsj} options={optionsA}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
      rerender = result.rerender;
    });
    await flushQueuedEvents();
    if (!rerender) throw new Error("render did not return a rerender function");
    const rerenderEditor = rerender;
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");

    let canUndo = false;
    editor.registerCommand<boolean>(
      CAN_UNDO_COMMAND,
      (payload) => {
        canUndo = payload;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    await act(async () => {
      ref.current?.applyUpdate(
        [
          { insert: { chapter: { number: "1", style: "c" } } },
          { insert: { verse: { number: "1", style: "v" } } },
        ],
        "local",
      );
    });
    await flushQueuedEvents();
    expect(canUndo).toBe(true);

    // A genuinely different `view` must still trigger LoadStatePlugin's reload and clear the
    // undo stack it just built - proving the memo isn't short-circuiting real changes to always
    // report "equal" (which would pass the previous test while breaking every real view-mode
    // switch in the app).
    await act(async () => {
      rerenderEditor(
        <Editor ref={ref} defaultUsj={blankUsj} options={optionsDifferentView}>
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>,
      );
    });
    await flushQueuedEvents();

    expect(canUndo).toBe(false);
  });

  // The two tests above prove the memo comparator itself works, by manually rerendering with a
  // hand-constructed `options` object. This test instead exercises the actual integration that
  // motivated the fix: `applyUpdate` invokes `onUsjChange` directly (see the call in
  // `applyUpdate`'s imperative handle above), and a parent that reacts to it - the real
  // paranext-core round trip is `applyUpdate` -> PDP save -> PDP echo -> parent re-render - can
  // recompute `options.view` as a fresh object with no memoization at all. `Wrapper` below
  // deliberately does not memoize `view`, so every one of its re-renders (including the one
  // `onUsjChange` triggers) constructs a brand new, value-equal object - reproducing the actual
  // bug shape rather than simulating its end state.
  it("stays undoable through a real onUsjChange-triggered parent re-render with an unmemoized `view`", async () => {
    const ref = createRef<EditorRef>();
    let editor: LexicalEditor | undefined;

    function Wrapper() {
      const [, forceParentRerender] = useState(0);
      return (
        <Editor
          ref={ref}
          defaultUsj={blankUsj}
          options={{ view: { markerMode: "visible", hasSpacing: true, isFormattedFont: false } }}
          onUsjChange={() => forceParentRerender((n) => n + 1)}
        >
          <GrabEditor onEditor={(e) => (editor = e)} />
        </Editor>
      );
    }

    await act(async () => {
      render(<Wrapper />);
    });
    await flushQueuedEvents();
    if (!ref.current || !editor) throw new Error("EditorRef did not mount");

    let canUndo = false;
    editor.registerCommand<boolean>(
      CAN_UNDO_COMMAND,
      (payload) => {
        canUndo = payload;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    // This alone triggers the full round trip: `applyUpdate` calls `onUsjChange`, which updates
    // `Wrapper`'s state, which re-renders `Wrapper` and `Editor` with a fresh `options.view`.
    await act(async () => {
      ref.current?.applyUpdate(
        [
          { insert: { chapter: { number: "1", style: "c" } } },
          { insert: { verse: { number: "1", style: "v" } } },
        ],
        "local",
      );
    });
    await flushQueuedEvents();

    expect(canUndo).toBe(true);
  });
});

describe("isFocused()", () => {
  // Editor-owned focus predicate: hosts must be able to ask THIS editor instance whether its
  // content-editable root holds DOM focus, instead of guessing via a global
  // `document.querySelector('.editor-input')` (which is coupled to the CSS class name and to the
  // main editor being the first `.editor-input` in document order — a footnote-editor popover
  // renders its own). `isFocused()` resolves the actual root of this instance and compares it to
  // the active element.
  it("is true only when the editor's own root holds DOM focus", async () => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(<Editor ref={ref} defaultUsj={sampleUsj} />);
    });
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    const root = document.querySelector<HTMLElement>(".editor-input");
    if (!root) throw new Error("Editor root not found");

    // An unrelated element holds focus: this editor is not focused.
    const other = document.createElement("input");
    document.body.appendChild(other);
    await act(async () => other.focus());
    expect(editor.isFocused()).toBe(false);

    // The editor root holds focus: isFocused() is true.
    await act(async () => root.focus());
    expect(editor.isFocused()).toBe(true);

    // Focus leaves the editor again: isFocused() is false.
    await act(async () => other.focus());
    expect(editor.isFocused()).toBe(false);

    document.body.removeChild(other);
  });
});

describe("insertMarker return value", () => {
  // GEN 1:1 with a verse preceding the seed text - the exact shape that makes the host's
  // "delta-doc" `getInsertedNodeKey` derivation (used only for the popover auto-open path, not
  // here) double-count the editable VerseNode and land past the note.
  const noteReference = { book: "GEN", chapterNum: 1, verseNum: 1 };

  /** Walks the tree to find the first TextNode whose content includes `substring`. */
  function $findTextNodeContaining(substring: string): LexicalNode | undefined {
    const walk = (node: LexicalNode): LexicalNode | undefined => {
      if ($isTextNode(node) && node.getTextContent().includes(substring)) return node;
      const element = node as unknown as { getChildren?: () => LexicalNode[] };
      if (typeof element.getChildren === "function") {
        for (const child of element.getChildren()) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk($getRoot());
  }

  /** Mounts a standard-view (markerMode "editable") `Editor` with `MarkerEditPlugin` active
   * (always mounted - see `Editor.tsx`), the same path `insertMarker` uses in the real app. */
  async function renderEditorWithVerseText() {
    const ref = createRef<EditorRef>();
    let container: HTMLElement | undefined;
    await act(async () => {
      const result = render(
        <Editor
          ref={ref}
          defaultUsj={sampleUsj}
          scrRef={noteReference}
          options={{ view: getViewOptions(STANDARD_VIEW_MODE) }}
        />,
      );
      container = result.container;
    });
    if (!ref.current) throw new Error("EditorRef did not mount");
    if (!container) throw new Error("Editor container did not mount");
    const editorInput = container.querySelector(".editor-input");
    if (!editorInput) throw new Error("editor-input element not found");
    const lexical = (editorInput as unknown as { __lexicalEditor?: LexicalEditor }).__lexicalEditor;
    if (!lexical) throw new Error("lexical editor handle not found");
    return { ref, lexical };
  }

  /** Collapses the caret right after "first" in the seed verse text. */
  function selectAfterFirstWord(lexical: LexicalEditor): void {
    act(() => {
      lexical.update(() => {
        const textNode = $findTextNodeContaining("first verse text");
        if (!textNode || !$isTextNode(textNode)) throw new Error("seed text node not found");
        textNode.select(5, 5);
      });
    });
  }

  it("returns the inserted note's true Lexical key for a note marker", async () => {
    const { ref, lexical } = await renderEditorWithVerseText();
    selectAfterFirstWord(lexical);

    let key: string | undefined;
    await act(async () => {
      // `insertMarker`'s return is populated synchronously (the note branch's `editor.update()`
      // callback runs synchronously - only the DOM reconciliation/commit is deferred), so `key`
      // doesn't need to wait for anything. The note itself only becomes visible via
      // `getEditorState()`/`$getNodeByKey` once Lexical's (microtask-deferred, non-discrete)
      // commit runs - flush it (and any state updates it cascades into, e.g. `ToolbarPlugin`)
      // before reading, still inside `act`.
      key = ref.current?.insertMarker("f");
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!key) throw new Error("insertMarker did not return a key");
    const noteKey = key;

    lexical.getEditorState().read(() => {
      expect($isNoteNode($getNodeByKey(noteKey))).toBe(true);
    });
  });

  it("returns undefined for a non-note marker", async () => {
    const { ref, lexical } = await renderEditorWithVerseText();
    selectAfterFirstWord(lexical);

    let key: string | undefined;
    await act(async () => {
      key = ref.current?.insertMarker("wj");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(key).toBeUndefined();
  });
});

describe("commitPendingMarkerEdits (abandonment window)", () => {
  /** Marker of the `\p` para in a USJ doc shaped like `sampleUsj` (book, chapter, para). */
  function paraMarkerOf(usj: Usj | undefined): string | undefined {
    const para = usj?.content[2];
    if (!para || typeof para === "string") return undefined;
    return (para as { marker?: string }).marker;
  }

  it("settles an abandoned mid-rename so getUsj returns what the screen shows", async () => {
    const ref = createRef<EditorRef>();
    let container: HTMLElement | undefined;
    await act(async () => {
      const result = render(
        <Editor
          ref={ref}
          defaultUsj={sampleUsj}
          options={{ view: getViewOptions(STANDARD_VIEW_MODE) }}
        />,
      );
      container = result.container;
    });
    const editorInput = container?.querySelector(".editor-input");
    if (!editorInput) throw new Error("editor-input element not found");
    const lexical = (editorInput as unknown as { __lexicalEditor?: LexicalEditor }).__lexicalEditor;
    if (!lexical) throw new Error("lexical editor handle not found");

    // Rename the `\p` glyph in place to `\q1` (no terminator typed) with the caret left
    // inside the glyph, then walk away (blur): the rename stays pending - the exact
    // window where a host save would serialize the OLD marker.
    await act(async () => {
      lexical.update(() => {
        const walk = (node: LexicalNode): MarkerNode | undefined => {
          if ($isMarkerNode(node) && node.getMarker() === "p") return node;
          const element = node as unknown as { getChildren?: () => LexicalNode[] };
          if (typeof element.getChildren === "function") {
            for (const child of element.getChildren()) {
              const found = walk(child);
              if (found) return found;
            }
          }
          return undefined;
        };
        const glyph = walk($getRoot());
        if (!glyph) throw new Error("para marker glyph not found");
        glyph.setTextContent("\\q1");
        glyph.select(3, 3);
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      (editorInput as HTMLElement).blur();
    });
    expect(paraMarkerOf(ref.current?.getUsj())).toBe("p"); // stale: screen shows \q1

    act(() => {
      ref.current?.commitPendingMarkerEdits();
    });

    // Synchronously fresh - the host save reads getUsj() right after committing.
    expect(paraMarkerOf(ref.current?.getUsj())).toBe("q1");
  });
});
