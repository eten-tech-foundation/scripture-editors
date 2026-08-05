/**
 * Regression: an undone literal must NOT re-settle when the editor merely RE-RENDERS.
 *
 * The marker-edit engine arms an app-placed-caret suppression window on an undo (historic) commit
 * so the just-restored literal stays literal until the user's next real in-editor gesture. That
 * window, and the pending set, live on the plugin's effect. TJ's field repro: type `|stuff="thing"`
 * into a closed `\nd …\nd*` span, arrow-up to settle, then Ctrl+Z — and ~1s later the literal
 * re-settles with no input. The culprit is a host re-render (the one a scrRef echo triggers
 * ~100-200ms after the undo) that changes the plugin's viewOptions/getMarker/logger IDENTITY: the
 * effect tore itself down and rebuilt, resetting the window to "released" and — because
 * re-registering the node transforms marks every node dirty — re-firing the transforms across the
 * whole document, which re-settled the undone literal. The window must release only on a genuine
 * KEY_DOWN/CLICK, never on a re-render.
 *
 * These tests model that echo-driven re-render as a viewOptions-identity change (the deterministic
 * cause; the scrRef echo is just one of its triggers) and assert the literal survives it, then that
 * a genuine gesture still settles normally.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  CLICK_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import { createRef, RefObject } from "react";
import {
  $charAttributeDisplayNode,
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  CharNode,
  NBSP,
  TypedMarkNode,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes, ViewOptions } from "shared-react";

if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

const rawViewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!rawViewOptions) throw new Error("Standard view options are required for these tests.");
const baseViewOptions: ViewOptions = rawViewOptions;

async function flushResolution() {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  });
}

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefinedInTest<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Depth-first search for the first CharNode with `marker` anywhere under `root`. */
function $findFirstChar(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findFirstChar(child, marker);
    if (found) return found;
  }
  return undefined;
}

/** The text node whose content includes `substring` (throws if absent). */
function $textNodeWith(substring: string): TextNode {
  return requireDefinedInTest(
    $getRoot()
      .getAllTextNodes()
      .find((node) => node.getTextContent().includes(substring)),
    `text node containing '${substring}' not found`,
  );
}

/** Build the initial state: a closed `\nd text\nd*` span plus a second paragraph to depart to. */
function $buildInitialState(): void {
  const para = $createParaNode("p");
  const char = $createCharNode("nd");
  para.append(
    $createMarkerNode("p"),
    $createTextNode(NBSP),
    char.append(
      $createMarkerNode("nd"),
      $createTextNode(`${NBSP}text`),
      $createMarkerNode("nd", "closing"),
    ),
  );
  $getRoot().append(
    para,
    $createParaNode("p").append($createMarkerNode("p"), $createTextNode("elsewhere")),
  );
}

function TestEditor({
  viewOptions,
  editorRef,
}: {
  viewOptions: ViewOptions;
  editorRef: RefObject<LexicalEditor | null>;
}) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "TestEditor",
        nodes: [TypedMarkNode, ...usjReactNodes],
        onError: (error) => {
          throw error;
        },
        theme: {},
        editorState: $buildInitialState,
      }}
    >
      <EditorRefPlugin editorRef={editorRef} />
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <HistoryPlugin />
    </LexicalComposer>
  );
}

function assertPipeSettled(editor: LexicalEditor) {
  editor.getEditorState().read(() => {
    const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    expect(nd.getUnknownAttributes()).toEqual({ stuff: "thing" });
    const run = requireDefinedInTest(
      $charAttributeDisplayNode(nd),
      "attribute display run not found",
    );
    expect(run.getTextContent()).toBe('|stuff="thing"');
  });
}

function assertPipeLiteral(editor: LexicalEditor) {
  editor.getEditorState().read(() => {
    const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    expect(nd.getUnknownAttributes()).toBeUndefined();
    expect($charAttributeDisplayNode(nd)).toBeUndefined();
    expect($getRoot().getTextContent()).toContain('|stuff="thing"');
  });
}

/** Type the pipe literal into the span, then depart (a real keydown clears the window) to settle. */
async function settleThePipe(editor: LexicalEditor) {
  await act(async () => editor.update(() => $textNodeWith("text").select(5, 5)));
  for (const character of `|stuff="thing"`) {
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      }),
    );
  }
  await act(async () =>
    editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "ArrowUp" })),
  );
  await act(async () => editor.update(() => $textNodeWith("elsewhere").select(0, 0)));
  await flushResolution();
}

/** Mount, returning the editor and a re-render that hands MarkerEditPlugin a FRESH viewOptions
 * object identity — the deterministic stand-in for the host re-render a scrRef echo triggers. */
async function mountRerenderable() {
  initializeSerialize(undefined, undefined);
  reset();
  const editorRef = createRef<LexicalEditor | null>();
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<TestEditor viewOptions={baseViewOptions} editorRef={editorRef} />);
  });
  const editor = requireDefinedInTest(editorRef.current ?? undefined, "editor not mounted");
  return {
    editor,
    rerenderPlugin: async () => {
      await act(async () => {
        result.rerender(
          <TestEditor
            viewOptions={{ ...(baseViewOptions as object) } as ViewOptions}
            editorRef={editorRef}
          />,
        );
      });
    },
  };
}

describe("undo → re-render (echo) must not re-settle the undone literal", () => {
  it("a plugin re-render after undo leaves the literal literal (no gesture, no re-settle)", async () => {
    const { editor, rerenderPlugin } = await mountRerenderable();
    await settleThePipe(editor);
    assertPipeSettled(editor); // positive control: the departure settle worked

    await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
    await flushResolution();
    assertPipeLiteral(editor);

    // The echo-driven re-render. Pre-fix, this tore down + rebuilt the plugin effect, releasing
    // the suppression window and re-firing the transforms — the literal re-settled with no gesture.
    await rerenderPlugin();
    await flushResolution();
    assertPipeLiteral(editor); // the literal must SURVIVE the re-render

    // Even a follow-on commit (a scrRef selection reconcile, say) must not settle it either.
    await act(async () => editor.update(() => $getRoot().getLastChild()?.markDirty()));
    await flushResolution();
    assertPipeLiteral(editor);
  });

  it("after the re-render, a genuine gesture still releases the window and settles", async () => {
    const { editor, rerenderPlugin } = await mountRerenderable();
    await settleThePipe(editor);
    await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
    await flushResolution();
    assertPipeLiteral(editor);

    await rerenderPlugin();
    await flushResolution();
    assertPipeLiteral(editor);

    // A real in-editor gesture (click) releases the window; the following departure settles.
    await act(async () => editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click")));
    await act(async () => editor.update(() => $textNodeWith("elsewhere").select(4, 4)));
    await flushResolution();
    assertPipeSettled(editor);
  });
});
