import { DeltaOp } from "../../plugins/usj/collab/delta-common.utils";
import { baseTestEnvironment } from "../../plugins/usj/react-test.utils";
import { $createImmutableNoteCallerNode, NoteCallerOnClick } from "./ImmutableNoteCallerNode";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import { MouseEvent } from "react";
import { $createCharNode, $createNoteNode, $createParaNode } from "shared";

describe("getNoteOps via onClick callback", () => {
  it("should provide getNoteOps function that returns note delta ops", async () => {
    const { captureGetNoteOps, mockOnClick } = createNoteOpsCapture();
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
    const { captureGetNoteOps, mockOnClick } = createNoteOpsCapture();
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
    const { captureGetNoteOps, mockOnClick } = createNoteOpsCapture();
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

async function simulateCallerClick(editor: LexicalEditor) {
  await act(async () => {
    const editorDiv = editor.getRootElement();
    const button = editorDiv?.querySelector("button");
    button?.click();
  });
}

function createNoteOpsCapture() {
  let capturedGetNoteOps: (() => DeltaOp[] | undefined) | undefined;

  const mockOnClick: NoteCallerOnClick = (
    _event: MouseEvent<HTMLButtonElement>,
    _noteNodeKey: string,
    _isCollapsed: boolean | undefined,
    _getCaller: () => string,
    _setCaller: (caller: string) => void,
    getNoteOps: () => DeltaOp[] | undefined,
  ) => {
    capturedGetNoteOps = getNoteOps;
  };

  const captureGetNoteOps = () => {
    if (!capturedGetNoteOps) {
      throw new Error("getNoteOps was not captured. Did you click the note caller?");
    }
    return capturedGetNoteOps();
  };

  return { captureGetNoteOps, mockOnClick };
}
