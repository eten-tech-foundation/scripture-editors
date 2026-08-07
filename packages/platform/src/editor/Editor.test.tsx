// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import Editorial from "../Editorial";
import { flushQueuedEvents } from "./editor-test.utils";
import { ContentJsonPath, Usj } from "@eten-tech-foundation/scripture-utilities";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { act, render } from "@testing-library/react";
import { $getRoot, $isTextNode, KEY_DOWN_COMMAND, LexicalEditor, TextNode } from "lexical";
import { createRef, RefObject, useEffect } from "react";
import { $isCharNode, $isSomeParaNode, $isSynthesizedMarkerNode, NBSP } from "shared";
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

describe("removeCharacterMarker guards", () => {
  async function createReadonlyEditorRefForTesting(): Promise<RefObject<EditorRef | null>> {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(<Editor ref={ref} defaultUsj={sampleUsj} options={{ isReadonly: true }} />);
    });
    if (!ref.current) throw new Error("EditorRef did not mount");
    return ref;
  }

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
  async function createReadonlyEditorRefForTesting(): Promise<RefObject<EditorRef | null>> {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(<Editor ref={ref} defaultUsj={sampleUsj} options={{ isReadonly: true }} />);
    });
    if (!ref.current) throw new Error("EditorRef did not mount");
    return ref;
  }

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

  it("does not throw when there is no selection", async () => {
    const ref = await createEditorRefForTesting();
    const editor = ref.current;
    if (!editor) throw new Error("Editor not mounted");

    expect(() => editor.replaceCharacterMarker("bd")).not.toThrow();
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
    await act(async () => {
      editorRef.replaceCharacterMarker("bd", "nd");
    });
    await flushQueuedEvents();

    const para = editorRef.getUsj()?.content[2];
    if (typeof para !== "object" || !("content" in para))
      throw new Error("para is not a USJ para node");
    const serialized = JSON.stringify(para.content);
    expect(serialized).toContain('"marker":"bd"');
    expect(serialized).not.toContain('"marker":"nd"');
    expect(serialized).toContain('"Lord"');
  });
});
