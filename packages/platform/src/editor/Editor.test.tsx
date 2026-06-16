// Import test fixture USJ from utilities via a deep path (not the published package entry); Nx `enforce-module-boundaries` would forbid this without the next line.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { usjGen1v1 } from "../../../utilities/src/converters/usj/converter-test.data";
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import Editorial from "../Editorial";
import { ContentJsonPath, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef, RefObject } from "react";
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
