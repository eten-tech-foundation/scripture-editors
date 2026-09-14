import { AnnotationPlugin, AnnotationRef } from "./AnnotationPlugin";
import { AnnotationRange } from "./selection.model";
import { baseTestEnvironment } from "../react-test.utils";
import { createEmptyHistoryState, HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  LexicalEditor,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { createRef } from "react";
import { $createParaNode, $isTypedMarkNode, COMMENT_MARK_TYPE } from "shared";
import { afterAll, beforeAll, vi } from "vitest";

// jsdom has no layout API for a DOM Range; Lexical reads it when restoring a focused selection.
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
beforeAll(() =>
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  }),
);
afterAll(() => {
  if (rangeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

const range = (start: number, end: number): AnnotationRange => ({
  start: { jsonPath: "$.content[0].content[0]", offset: start },
  end: { jsonPath: "$.content[0].content[0]", offset: end },
});

async function setup(content = "the man who stands") {
  const ref = createRef<AnnotationRef>();
  const error = vi.fn();
  const history = createEmptyHistoryState();
  const { editor } = await baseTestEnvironment(
    () => {
      $getRoot().append($createParaNode().append($createTextNode(content)));
      $getRoot().selectEnd();
    },
    <>
      <HistoryPlugin externalHistoryState={history} />
      <AnnotationPlugin
        ref={ref}
        logger={{ error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }}
      />
    </>,
  );
  // The composer creates the initial state before HistoryPlugin mounts. Seed its baseline with
  // a selection update, just as the loaded editor does before the first user edit.
  await act(async () =>
    editor.update(() => {
      $getRoot().selectEnd();
    }),
  );
  if (!ref.current) throw new Error("AnnotationPlugin did not mount");
  return { editor, annotations: ref.current, error, history };
}

function marks(editor: LexicalEditor) {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getAllTextNodes()
      .map((node) => {
        const parent = node.getParent();
        return {
          text: node.getTextContent(),
          ids: $isTypedMarkNode(parent)
            ? Object.fromEntries(
                Object.entries(parent.getTypedIDs()).filter(([, ids]) => ids.length > 0),
              )
            : {},
        };
      }),
  );
}

function text(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

function append(editor: LexicalEditor, suffix: string) {
  editor.update(
    () => {
      $getRoot().selectEnd();
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("Expected range selection");
      selection.insertText(suffix);
    },
    { tag: HISTORY_PUSH_TAG },
  );
}

describe("batch annotations", () => {
  it("commits 128 diagnostics once instead of once per annotation", async () => {
    const content = "word ".repeat(128);
    const { editor, annotations } = await setup(content);
    const update = vi.spyOn(editor, "update");
    const committed = vi.fn();
    const unregister = editor.registerUpdateListener(committed);
    try {
      await act(async () =>
        annotations.setAnnotations(
          Array.from({ length: 128 }, (_, index) => ({
            selection: range(index * 5, index * 5 + 4),
            type: "spelling",
            id: String(index),
          })),
        ),
      );
      expect(update).toHaveBeenCalledTimes(1);
      expect(committed).toHaveBeenCalledTimes(1);
      expect(editor.getRootElement()?.querySelectorAll("mark")).toHaveLength(128);
      expect(text(editor)).toBe(content);
    } finally {
      unregister();
    }
  });

  it("keeps type/id pairs distinct when either contains a colon", async () => {
    const { editor, annotations } = await setup();
    await act(async () =>
      annotations.setAnnotations([
        { selection: range(4, 7), type: "review:one", id: "two" },
        { selection: range(12, 18), type: "review", id: "one:two" },
      ]),
    );
    await act(async () => annotations.removeAnnotations([{ type: "review:one", id: "two" }]));
    expect(marks(editor)).toEqual([
      { text: "the man who ", ids: {} },
      { text: "stands", ids: { review: ["one:two"] } },
    ]);
  });

  it("applies overlapping ranges in one editor update without changing the text", async () => {
    const { editor, annotations } = await setup();
    const update = vi.spyOn(editor, "update");
    await act(async () => {
      annotations.setAnnotations([
        { selection: range(4, 7), type: "spelling", id: "s1" },
        { selection: range(4, 11), type: "grammar", id: "g1" },
      ]);
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(marks(editor)).toEqual([
      { text: "the ", ids: {} },
      { text: "man", ids: { spelling: ["s1"], grammar: ["g1"] } },
      { text: " who", ids: { grammar: ["g1"] } },
      { text: " stands", ids: {} },
    ]);
  });

  it("removes a batch in one update and keeps unrelated overlapping marks", async () => {
    const { editor, annotations } = await setup();
    await act(async () => {
      annotations.setAnnotations([
        { selection: range(4, 7), type: "spelling", id: "s1" },
        { selection: range(4, 11), type: "grammar", id: "g1" },
        { selection: range(12, 18), type: "spelling", id: "s2" },
      ]);
    });
    const update = vi.spyOn(editor, "update");
    await act(async () => {
      annotations.removeAnnotations([
        { type: "spelling", id: "s1" },
        { type: "spelling", id: "s2" },
        { type: "spelling", id: "missing" },
      ]);
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(marks(editor)).toEqual([
      { text: "the ", ids: {} },
      { text: "man who", ids: { grammar: ["g1"] } },
      { text: " stands", ids: {} },
    ]);
  });

  it("uses the last entry for a repeated type/id and replaces an existing annotation", async () => {
    const { editor, annotations } = await setup();
    await act(async () => annotations.setAnnotation(range(0, 3), "review", "r1"));
    await act(async () =>
      annotations.setAnnotations([
        { selection: range(4, 7), type: "review", id: "r1" },
        { selection: range(12, 18), type: "review", id: "r1" },
      ]),
    );
    expect(marks(editor)).toEqual([
      { text: "the man who ", ids: {} },
      { text: "stands", ids: { review: ["r1"] } },
    ]);
  });

  it("preserves callback behavior through overlapping batches and removal", async () => {
    const { editor, annotations } = await setup();
    const onClick = vi.fn();
    const onRemove = vi.fn();
    await act(async () =>
      annotations.setAnnotations([
        { selection: range(4, 7), type: "review", id: "r1", onClick, onRemove },
        { selection: range(4, 11), type: "grammar", id: "g1" },
      ]),
    );
    expect(onRemove).not.toHaveBeenCalled();
    editor.getRootElement()?.querySelector("mark")?.dispatchEvent(new MouseEvent("click"));
    expect(onClick).toHaveBeenCalledWith(expect.anything(), "review", "r1", "man");
    await act(async () => annotations.removeAnnotations([{ type: "review", id: "r1" }]));
    expect(onRemove).toHaveBeenCalled();
    expect(text(editor)).toBe("the man who stands");
  });

  it("skips invalid ranges and still applies the remaining entries", async () => {
    const { editor, annotations, error } = await setup();
    await act(async () =>
      annotations.setAnnotations([
        {
          selection: {
            start: { jsonPath: "$.content[99]", offset: 0 },
            end: { jsonPath: "$.content[99]", offset: 1 },
          },
          type: "review",
          id: "bad",
        },
        { selection: range(4, 7), type: "review", id: "good" },
      ]),
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(marks(editor)).toContainEqual({ text: "man", ids: { review: ["good"] } });
  });

  it("validates all reserved types before applying or removing any entries", async () => {
    const { editor, annotations } = await setup();
    expect(() =>
      annotations.setAnnotations([
        { selection: range(4, 7), type: "review", id: "r1" },
        { selection: range(4, 7), type: COMMENT_MARK_TYPE, id: "c1" },
      ]),
    ).toThrow(/reserved annotation type/);
    expect(marks(editor)).toEqual([{ text: "the man who stands", ids: {} }]);
    await act(async () => annotations.setAnnotation(range(4, 7), "review", "r1"));
    expect(() =>
      annotations.removeAnnotations([
        { type: "review", id: "r1" },
        { type: COMMENT_MARK_TYPE, id: "c1" },
      ]),
    ).toThrow(/reserved annotation type/);
    expect(marks(editor)).toContainEqual({ text: "man", ids: { review: ["r1"] } });
  });

  it("does no editor work for empty batches", async () => {
    const { editor, annotations } = await setup();
    const update = vi.spyOn(editor, "update");
    annotations.setAnnotations([]);
    annotations.removeAnnotations([]);
    expect(update).not.toHaveBeenCalled();
  });
});

describe.each(["single", "batch"] as const)("%s annotation history", (mode) => {
  it("undoes and redoes the real edit after adding and removing annotations", async () => {
    const { editor, annotations, history } = await setup();
    await act(async () => append(editor, "!"));
    const current = history.current;
    const undoEntries = [...history.undoStack];
    await act(async () => {
      if (mode === "single") annotations.setAnnotation(range(4, 7), "review", "r1");
      else annotations.setAnnotations([{ selection: range(4, 7), type: "review", id: "r1" }]);
    });
    expect(history.current).toBe(current);
    expect(history.undoStack).toEqual(undoEntries);
    await act(async () => {
      if (mode === "single") annotations.removeAnnotation("review", "r1");
      else annotations.removeAnnotations([{ type: "review", id: "r1" }]);
    });
    expect(history.current).toBe(current);
    expect(history.undoStack).toEqual(undoEntries);
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(text(editor)).toBe("the man who stands");
    // Refresh diagnostics while redo is available. It must stay available.
    await act(async () => {
      if (mode === "single") annotations.setAnnotation(range(4, 7), "review", "r2");
      else annotations.setAnnotations([{ selection: range(4, 7), type: "review", id: "r2" }]);
    });
    await act(async () => {
      editor.dispatchCommand(REDO_COMMAND, undefined);
    });
    expect(text(editor)).toBe("the man who stands!");
  });

  it("keeps real edits undoable on both sides of an annotation call in the same tick", async () => {
    const { editor, annotations } = await setup();
    await act(async () => {
      append(editor, "!");
      if (mode === "single") annotations.setAnnotation(range(4, 7), "review", "r1");
      else annotations.setAnnotations([{ selection: range(4, 7), type: "review", id: "r1" }]);
      append(editor, "?");
    });
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(text(editor)).toBe("the man who stands!");
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(text(editor)).toBe("the man who stands");
  });
});
