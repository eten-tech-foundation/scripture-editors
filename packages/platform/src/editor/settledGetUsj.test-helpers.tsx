/**
 * Shared harness for the settled-output suites: one Standard-view `Editor` mount behind its public
 * `EditorRef`, plus the raw Lexical editor the tests drive edits through. A plain helper module
 * rather than an export from one of the suites, so a suite that needs it does not re-register the
 * other suite's tests by importing it.
 */
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "./adaptors/usj-editor.adaptor";
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { $rebuildParas, Tier2Context } from "./markerEdit/tier2Rebuild.utils";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import { $getRoot, LexicalEditor } from "lexical";
import { createRef, ReactElement, RefObject } from "react";
import { $isParaNode, getMarker as bundledGetMarker, TypedMarkNode } from "shared";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes, ViewOptions } from "shared-react";
import { expect } from "vitest";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing asserts on), same as the marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

export function requireStandardViewOptions(): ViewOptions {
  const options = getViewOptions(STANDARD_VIEW_MODE);
  if (!options) throw new Error("Standard view options are required for these tests.");
  return options;
}

export const spanUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "start ",
        { type: "char", marker: "nd", content: ["name"] },
        " end",
      ],
    },
    { type: "para", marker: "p", content: ["a second paragraph to depart to"] },
  ],
};

async function mountEditor(
  usj: Usj,
  view: ViewOptions,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  const capture: ReactElement = <EditorRefPlugin editorRef={lexicalRef} />;
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={usj} options={{ view }}>
        {capture}
      </Editor>,
    );
  });
  if (!lexicalRef.current) throw new Error("lexical editor was not captured");
  return { ref, lexical: lexicalRef.current };
}

/** Mount `Editor` in Standard view and hand back its public ref plus the raw Lexical editor. */
export async function mountStandardViewEditor(
  usj: Usj,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  return mountEditor(usj, requireStandardViewOptions());
}

/**
 * Like `mountStandardViewEditor`, but with `noteMode: "expanded"` — needed for any shape whose
 * pend targets a note's own glyph or its inline-editable content, both of which require the
 * note's content to be genuinely inline-editable in the mounted editor (the default Standard view
 * collapses notes to a caller preview, never inline-editable).
 */
export async function mountExpandedNoteEditor(
  usj: Usj,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  return mountEditor(usj, { ...requireStandardViewOptions(), noteMode: "expanded" });
}

/** Load `usj` into a fresh headless standard-view editor; mirrors tier2Rebuild.corpus.test.tsx. */
function loadHeadless(usj: Usj): LexicalEditor {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, requireStandardViewOptions());
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

/**
 * Assert `usj` is a Tier-2 fixed point: re-loaded on its own, every paragraph REFUSES a rebuild
 * (returns false) and mutates nothing. Anything else means a consumer was handed USJ that still had
 * settling left in it, which is the standing acceptance for settled output.
 */
export function expectTier2FixedPoint(usj: Usj): void {
  const headless = loadHeadless(usj);
  const context: Tier2Context = {
    viewOptions: requireStandardViewOptions(),
    getMarker: bundledGetMarker,
  };
  const changed: string[] = [];
  headless.update(
    () => {
      $getRoot()
        .getChildren()
        .filter($isParaNode)
        .forEach((para, index) => {
          if ($rebuildParas([para], context)) changed.push(`#${index} \\${para.getMarker()}`);
        });
    },
    { discrete: true },
  );
  expect(changed).toEqual([]);
}
