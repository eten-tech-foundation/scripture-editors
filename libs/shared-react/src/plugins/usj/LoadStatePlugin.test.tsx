/**
 * Task 15 (Standard view fix wave): an external USJ mutation (PDP echo / chapter reload) is a
 * whole-state `setEditorState` replace whose parsed state carries a null selection. When the
 * editor being replaced does NOT have DOM focus (e.g. the user is typing in the footnote-editor
 * POPOVER while the parent editor's PDP echo lands ~150-250ms after an edit), reconciling that
 * null selection writes to the SHARED document selection anyway — clearing the popover's caret
 * and dragging focus back into the parent editor (QA item 7 tail: popover focus stolen, Enter
 * landing nowhere; captured live via a focusin trace, MAIN-EDITOR steals at ~t+250ms). An editor
 * without focus has no claim on the DOM selection, so the external apply must skip DOM-selection
 * reconciliation entirely (Lexical's SKIP_DOM_SELECTION_TAG). An editor WITH focus keeps the
 * current behavior.
 */

import { LoadStatePlugin } from "./LoadStatePlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import { LexicalEditor, SerializedEditorState, SKIP_DOM_SELECTION_TAG } from "lexical";
import { useEffect } from "react";
import { EditorAdaptor, EXTERNAL_USJ_MUTATION_TAG } from "shared";

/** Minimal core-nodes serialized state whose text carries the scripture "content". */
function serializedState(text: string): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 0, mode: "normal", style: "", text, type: "text", version: 1 },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
    // The runtime shape is what matters here; the serialized-node typings are wider than this
    // hand-rolled literal.
  } as unknown as SerializedEditorState;
}

const mockAdaptor: EditorAdaptor = {
  serializeEditorState: (scripture) => serializedState(String(scripture)),
};

async function testEnvironment() {
  let editor: LexicalEditor | undefined;

  function GrabEditor() {
    const [composerEditor] = useLexicalComposerContext();
    useEffect(() => {
      editor = composerEditor;
    }, [composerEditor]);
    return null;
  }

  function App({ scripture }: { scripture: string }) {
    return (
      <LexicalComposer
        initialConfig={{
          namespace: "TestEditor",
          nodes: [],
          onError: (error) => {
            throw error;
          },
          theme: {},
        }}
      >
        <GrabEditor />
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <LoadStatePlugin scripture={scripture} editorAdaptor={mockAdaptor} />
      </LexicalComposer>
    );
  }

  let rerender: (ui: React.ReactElement) => void = () => undefined;
  await act(async () => {
    ({ rerender } = render(<App scripture="initial" />));
  });
  const setScripture = async (scripture: string) =>
    act(async () => {
      rerender(<App scripture={scripture} />);
    });

  // `editor` is defined on React render.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor: editor!, setScripture };
}

/** Tag sets of every EXTERNAL_USJ_MUTATION commit observed while registered. */
function recordExternalCommitTags(editor: LexicalEditor): { commits: string[][] } {
  const record: { commits: string[][] } = { commits: [] };
  editor.registerUpdateListener(({ tags }) => {
    if (tags.has(EXTERNAL_USJ_MUTATION_TAG)) record.commits.push([...tags]);
  });
  return record;
}

describe("LoadStatePlugin external-mutation DOM-selection containment", () => {
  it("skips DOM-selection reconciliation when the editor does not have focus", async () => {
    const { editor, setScripture } = await testEnvironment();
    const record = recordExternalCommitTags(editor);

    // No focus anywhere near the editor (jsdom activeElement = body).
    await setScripture("external update");

    expect(record.commits.length).toBeGreaterThan(0);
    record.commits.forEach((tags) => expect(tags).toContain(SKIP_DOM_SELECTION_TAG));
  });

  it("keeps DOM-selection reconciliation when the editor has focus", async () => {
    const { editor, setScripture } = await testEnvironment();
    const rootElement = editor.getRootElement();
    if (!rootElement) throw new Error("editor root element missing");
    // jsdom: contenteditable alone is not reliably focusable; tabIndex makes focus() stick.
    rootElement.tabIndex = 0;
    await act(async () => rootElement.focus());
    expect(document.activeElement).toBe(rootElement);
    const record = recordExternalCommitTags(editor);

    await setScripture("external update while focused");

    expect(record.commits.length).toBeGreaterThan(0);
    record.commits.forEach((tags) => expect(tags).not.toContain(SKIP_DOM_SELECTION_TAG));
  });
});
