import { DeltaOp } from "../../plugins/usj/collab/delta-common.utils";
import { baseTestEnvironment, sutUpdate } from "../../plugins/usj/react-test.utils";
import { $createImmutableNoteCallerNode, NoteCallerOnClick } from "./ImmutableNoteCallerNode";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import { MouseEvent } from "react";
import {
  $createCharNode,
  $createNoteNode,
  $createParaNode,
  $isNoteNode,
  $isParaNode,
} from "shared";

describe("getNoteOps via onClick callback", () => {
  it("should provide getNoteOps function that returns note delta ops", async () => {
    const { captureGetNoteOps, mockOnClick } = createNoteClickCapture();
    const { editor } = await baseTestEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createNoteNode("f", "a").append(
            $createImmutableNoteCallerNode("a", "1:1 Footnote text", mockOnClick),
            $createCharNode("fr").append($createTextNode("1:1 ")),
            $createCharNode("ft").append($createTextNode("Footnote text")),
          ),
        ),
      );
    });

    await simulateCallerClick(editor);
    const noteOps = captureGetNoteOps();

    expect(noteOps).toEqual([
      {
        insert: {
          note: {
            style: "f",
            caller: "a",
            contents: {
              ops: [
                { insert: "1:1 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
    ]);
  });

  it("should return ops with note contents for multi-child notes", async () => {
    const { captureGetNoteOps, mockOnClick } = createNoteClickCapture();
    const { editor } = await baseTestEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createNoteNode("f", "b").append(
            $createImmutableNoteCallerNode("b", "1:2 Complex note", mockOnClick),
            $createCharNode("fr").append($createTextNode("1:2 ")),
            $createCharNode("ft").append($createTextNode("Complex footnote ")),
            $createCharNode("fq").append($createTextNode("with quote")),
          ),
        ),
      );
    });

    await simulateCallerClick(editor);
    const noteOps = captureGetNoteOps();

    expect(noteOps).toEqual([
      {
        insert: {
          note: {
            style: "f",
            caller: "b",
            contents: {
              ops: [
                { insert: "1:2 ", attributes: { char: { style: "fr" } } },
                { insert: "Complex footnote ", attributes: { char: { style: "ft" } } },
                { insert: "with quote", attributes: { char: { style: "fq" } } },
              ],
            },
          },
        },
      },
    ]);
  });

  it("should handle notes with only caller (no additional children)", async () => {
    const { captureGetNoteOps, mockOnClick } = createNoteClickCapture();
    const { editor } = await baseTestEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createNoteNode("f", "c").append(
            $createImmutableNoteCallerNode("c", "Empty note", mockOnClick),
          ),
        ),
      );
    });

    await simulateCallerClick(editor);
    const noteOps = captureGetNoteOps();

    expect(noteOps).toEqual([
      {
        insert: {
          note: {
            style: "f",
            caller: "c",
          },
        },
      },
    ]);
  });
});

describe("getNoteIndex via onClick callback", () => {
  it("gives the document's first note index 0", async () => {
    const { captureGetNoteIndex, mockOnClick } = createNoteClickCapture();
    const { editor } = await threeNotesInTwoParasEnvironment(mockOnClick);

    await simulateCallerClick(editor, 0);

    expect(captureGetNoteIndex()).toBe(0);
  });

  it("counts notes across the whole document, not within the clicked note's paragraph", async () => {
    const { captureGetNoteIndex, mockOnClick } = createNoteClickCapture();
    const { editor } = await threeNotesInTwoParasEnvironment(mockOnClick);

    // The second note in the document, but the FIRST in its own paragraph: a count that restarted
    // per paragraph would report 0 here.
    await simulateCallerClick(editor, 1);

    expect(captureGetNoteIndex()).toBe(1);
  });

  it("keeps counting through later notes of the same paragraph", async () => {
    const { captureGetNoteIndex, mockOnClick } = createNoteClickCapture();
    const { editor } = await threeNotesInTwoParasEnvironment(mockOnClick);

    await simulateCallerClick(editor, 2);

    expect(captureGetNoteIndex()).toBe(2);
  });

  it("reports no index once the clicked note has left the document", async () => {
    const { captureGetNoteIndex, mockOnClick } = createNoteClickCapture();
    const { editor } = await baseTestEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createNoteNode("f", "a").append(
            $createImmutableNoteCallerNode("a", "1:1 Footnote text", mockOnClick),
            $createCharNode("ft").append($createTextNode("Footnote text")),
          ),
        ),
      );
    });

    await simulateCallerClick(editor);
    // Positive control: the captured accessor answers while the note is still attached, so the
    // undefined below is the removal talking and not a callback that never worked.
    expect(captureGetNoteIndex()).toBe(0);

    await sutUpdate(editor, () => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const note = para.getChildren().find($isNoteNode);
      if (!note) throw new Error("Expected a NoteNode in the paragraph");
      note.remove();
    });

    expect(captureGetNoteIndex()).toBeUndefined();
  });
});

describe("decorate - caller label", () => {
  it("renders a hidden caller (-) as * when collapsed", async () => {
    const dom = await renderCaller("-", true);
    expect(dom.querySelector("button")?.textContent).toBe("*");
  });

  it("renders a generator caller (+) empty when collapsed (CSS-generated)", async () => {
    const dom = await renderCaller("+", true);
    expect(dom.querySelector("button")?.textContent).toBe("");
  });

  it("renders a custom caller literally when collapsed", async () => {
    const dom = await renderCaller("a", true);
    expect(dom.querySelector("button")?.textContent).toBe("a");
  });

  it("renders a hidden caller (-) literally when the note is expanded", async () => {
    // PT9's `-` → `*` display substitution applies only while the note is collapsed; an
    // expanded note shows the hidden caller as itself.
    const dom = await renderCaller("-", false);
    expect(dom.querySelector("button")?.textContent).toBe("-");
  });
});

describe("decorate - caller tooltip", () => {
  it("exposes the note preview as the caller tooltip (title)", async () => {
    const dom = await renderCaller("+", true, "1:1 A footnote.");
    expect(dom.querySelector("button")?.getAttribute("title")).toBe("1:1 A footnote.");
  });
});

/**
 * Three notes over two paragraphs: `a` alone in the first, then `b` and `c` in the second. The
 * split matters — the second note in the document is the first in its own paragraph, so a
 * document-wide count and a per-paragraph one disagree on every note after the first.
 */
async function threeNotesInTwoParasEnvironment(mockOnClick: NoteCallerOnClick) {
  return baseTestEnvironment(() => {
    $getRoot().append(
      $createParaNode().append(
        $createTextNode("In the beginning "),
        $createNoteNode("f", "a").append(
          $createImmutableNoteCallerNode("a", "1:1 First note", mockOnClick),
          $createCharNode("ft").append($createTextNode("First note")),
        ),
      ),
      $createParaNode().append(
        $createTextNode("and the earth "),
        $createNoteNode("f", "b").append(
          $createImmutableNoteCallerNode("b", "1:2 Second note", mockOnClick),
          $createCharNode("ft").append($createTextNode("Second note")),
        ),
        $createTextNode(" was "),
        $createNoteNode("f", "c").append(
          $createImmutableNoteCallerNode("c", "1:3 Third note", mockOnClick),
          $createCharNode("ft").append($createTextNode("Third note")),
        ),
      ),
    );
  });
}

async function renderCaller(
  caller: string,
  collapsed: boolean,
  previewText?: string,
): Promise<HTMLElement> {
  const { editor } = await baseTestEnvironment(() => {
    $getRoot().append(
      $createParaNode().append(
        $createNoteNode("f", "a", collapsed).append(
          $createImmutableNoteCallerNode(caller, previewText ?? ""),
        ),
      ),
    );
  });

  const rootElement = editor.getRootElement();
  if (!rootElement) throw new Error("renderCaller: editor root element not found");
  return rootElement;
}

/**
 * Clicks the caller button at `callerIndex` in the rendered document's own order. Missing buttons
 * throw rather than no-op, so a test that names an index the document does not have fails instead
 * of passing on a click that never happened.
 */
async function simulateCallerClick(editor: LexicalEditor, callerIndex = 0) {
  const button = editor.getRootElement()?.querySelectorAll("button")[callerIndex];
  if (!button) throw new Error(`simulateCallerClick: no caller button at index ${callerIndex}`);

  await act(async () => {
    button.click();
  });
}

function createNoteClickCapture() {
  let capturedGetNoteOps: (() => DeltaOp[] | undefined) | undefined;
  let capturedGetNoteIndex: (() => number | undefined) | undefined;

  const mockOnClick: NoteCallerOnClick = (
    _event: MouseEvent<HTMLButtonElement>,
    _noteNodeKey: string,
    _isCollapsed: boolean | undefined,
    _getCaller: () => string,
    _setCaller: (caller: string) => void,
    getNoteOps: () => DeltaOp[] | undefined,
    getNoteIndex: () => number | undefined,
  ) => {
    capturedGetNoteOps = getNoteOps;
    capturedGetNoteIndex = getNoteIndex;
  };

  const captureGetNoteOps = () => {
    if (!capturedGetNoteOps) {
      throw new Error("getNoteOps was not captured. Did you click the note caller?");
    }
    return capturedGetNoteOps();
  };

  const captureGetNoteIndex = () => {
    if (!capturedGetNoteIndex) {
      throw new Error("getNoteIndex was not captured. Did you click the note caller?");
    }
    return capturedGetNoteIndex();
  };

  return { captureGetNoteOps, captureGetNoteIndex, mockOnClick };
}
