// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import Editorial from "../Editorial";
import { ContentJsonPath, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef, RefObject } from "react";
import { $getNodeByKey, $getRoot, $isTextNode, LexicalEditor, LexicalNode } from "lexical";
import { $isMarkerNode, $isNoteNode, MarkerNode } from "shared";
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
