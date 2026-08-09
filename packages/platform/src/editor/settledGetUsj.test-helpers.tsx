/**
 * Shared harness for the settled-output suites: one Standard-view `Editor` mount behind its public
 * `EditorRef`, plus the raw Lexical editor the tests drive edits through. A plain helper module
 * rather than an export from one of the suites, so a suite that needs it does not re-register the
 * other suite's tests by importing it.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import { LexicalEditor } from "lexical";
import { createRef, ReactElement, RefObject } from "react";
import { getViewOptions, STANDARD_VIEW_MODE, ViewOptions } from "shared-react";

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

/** Mount `Editor` in Standard view and hand back its public ref plus the raw Lexical editor. */
export async function mountStandardViewEditor(
  usj: Usj,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  const capture: ReactElement = <EditorRefPlugin editorRef={lexicalRef} />;
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={usj} options={{ view: requireStandardViewOptions() }}>
        {capture}
      </Editor>,
    );
  });
  if (!lexicalRef.current) throw new Error("lexical editor was not captured");
  return { ref, lexical: lexicalRef.current };
}
