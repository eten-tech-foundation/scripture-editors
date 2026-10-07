import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  LexicalEditor,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import { createRef } from "react";
import { AnnotationRange, getViewOptions } from "shared-react";
import { vi } from "vitest";

const usj: Usj = {
  type: USJ_TYPE,
  version: USJ_VERSION,
  content: [{ type: "para", marker: "p", content: ["the man who stands"] }],
};
const range: AnnotationRange = {
  start: { jsonPath: "$.content[0].content[0]", offset: 4 },
  end: { jsonPath: "$.content[0].content[0]", offset: 7 },
};

it("exposes batched annotations with public types, callbacks, and same-tick removal", async () => {
  const ref = createRef<EditorRef>();
  const onClick = vi.fn();
  const onUsjChange = vi.fn();
  const result = render(<Editor ref={ref} defaultUsj={usj} onUsjChange={onUsjChange} />);
  await act(async () => undefined);
  onUsjChange.mockClear();
  await act(async () => {
    ref.current?.setAnnotations([
      { selection: range, type: "spelling", id: "s1", onClick },
      { selection: range, type: "grammar", id: "g1" },
    ]);
  });
  const mark = result.container.querySelector("mark");
  expect(mark?.textContent).toBe("man");
  mark?.dispatchEvent(new MouseEvent("click"));
  expect(onClick).toHaveBeenCalledWith(expect.anything(), "external-spelling", "s1", "man");
  expect(ref.current?.getUsj()).toEqual(usj);
  expect(onUsjChange).not.toHaveBeenCalled();

  await act(async () => {
    ref.current?.removeAnnotations([
      { type: "spelling", id: "s1" },
      { type: "grammar", id: "g1" },
    ]);
    ref.current?.setAnnotations([{ selection: range, type: "review", id: "r1" }]);
    ref.current?.removeAnnotations([{ type: "review", id: "r1" }]);
  });
  expect(result.container.querySelectorAll("mark")).toHaveLength(0);
  expect(ref.current?.getUsj()).toEqual(usj);
  expect(onUsjChange).not.toHaveBeenCalled();
});

it("keeps the block verse layout guard for the batch API", async () => {
  const ref = createRef<EditorRef>();
  const error = vi.fn();
  const view = getViewOptions("formatted");
  if (!view) throw new Error("Expected formatted view options");
  const result = render(
    <Editor
      ref={ref}
      defaultUsj={usj}
      options={{ view: { ...view, verseLayout: "block" } }}
      logger={{ error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }}
    />,
  );
  await act(async () => undefined);
  await act(async () =>
    ref.current?.setAnnotations([{ selection: range, type: "review", id: "r1" }]),
  );
  expect(error).toHaveBeenCalled();
  expect(result.container.querySelectorAll("mark")).toHaveLength(0);
});

it("keeps undo and redo working when a host refreshes annotations from onUsjChange", async () => {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  let refresh = false;
  await act(async () => {
    render(
      <Editor
        ref={ref}
        defaultUsj={usj}
        onUsjChange={() => {
          if (refresh)
            ref.current?.setAnnotations([{ selection: range, type: "review", id: "r1" }]);
        }}
      >
        <EditorRefPlugin editorRef={lexicalRef} />
      </Editor>,
    );
  });
  await act(async () =>
    lexicalRef.current?.update(
      () => {
        $getRoot().selectEnd();
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    ),
  );
  refresh = true;
  await act(async () =>
    lexicalRef.current?.update(
      () => {
        $getRoot().selectEnd();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("Expected range selection");
        selection.insertText("!");
      },
      { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG] },
    ),
  );
  expect(ref.current?.getUsj()?.content).toEqual([
    { type: "para", marker: "p", content: ["the man who stands!"] },
  ]);
  expect(lexicalRef.current?.getRootElement()?.querySelector("mark")?.textContent).toBe("man");
  await act(async () => ref.current?.undo());
  expect(ref.current?.getUsj()).toEqual(usj);
  await act(async () => ref.current?.redo());
  expect(ref.current?.getUsj()?.content).toEqual([
    { type: "para", marker: "p", content: ["the man who stands!"] },
  ]);
});
