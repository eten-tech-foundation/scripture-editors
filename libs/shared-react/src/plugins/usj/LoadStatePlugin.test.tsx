/**
 * An external USJ mutation (PDP echo / chapter reload) is a whole-state `setEditorState` replace
 * whose parsed state carries a null selection. When the editor being replaced does NOT have DOM
 * focus (e.g. the user is typing in the footnote-editor POPOVER while the parent editor's PDP echo
 * lands ~150-250ms after an edit), reconciling that null selection writes to the SHARED document
 * selection anyway — clearing the popover's caret and dragging focus back into the parent editor
 * (observed live: popover focus stolen, Enter landing nowhere; a focusin trace shows the main
 * editor stealing focus at ~t+250ms). An editor without focus has no claim on the DOM selection, so
 * the external apply must skip DOM-selection reconciliation entirely (Lexical's
 * SKIP_DOM_SELECTION_TAG). An editor WITH focus keeps the current behavior.
 */

import { LoadStatePlugin } from "./LoadStatePlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import { $getRoot, LexicalEditor, SerializedEditorState, SKIP_DOM_SELECTION_TAG } from "lexical";
import { ReactElement, useEffect } from "react";
import { EditorAdaptor, EXTERNAL_USJ_MUTATION_TAG } from "shared";
import { vi } from "vitest";

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

/**
 * The `onLoadingChange` contract, which callers gate document-addressing work on (see the platform
 * editor's load gate, #515): calls are balanced, and when `false` is reported the document this
 * load leaves behind is already live — the loaded one, or the previous one when the load was
 * skipped or failed. A settle that lands before the commit is a silent regression for every such
 * caller, so it is pinned here rather than left to Lexical's internal scheduling.
 */

/** `mockAdaptor` with a spy, for suites that count how many times the document was loaded. */
function createCountingAdaptor(): EditorAdaptor & {
  serializeEditorState: ReturnType<typeof vi.fn>;
} {
  return {
    serializeEditorState: vi.fn((scripture: unknown) => serializedState(String(scripture))),
  };
}

function createLogger() {
  return {
    error: vi.fn<(...params: unknown[]) => void>(),
    warn: vi.fn<(...params: unknown[]) => void>(),
    info: vi.fn<(...params: unknown[]) => void>(),
    debug: vi.fn<(...params: unknown[]) => void>(),
  };
}

/**
 * Like `testEnvironment` above, but with the adaptor, logger and `onLoadingChange` callback under
 * the test's control, and a reader for whatever document is live at any moment.
 */
/**
 * The editor the reporting environment below is driving. Module scope, not a return value: the
 * first settle is reported from inside `loadReportingEnvironment`, before it has returned
 * anything a test could read.
 */
let reportingEditor: LexicalEditor | undefined;

/** What the document says right now, i.e. which load is live. */
function liveText(): string {
  if (!reportingEditor) throw new Error("editor was not grabbed");
  return reportingEditor.getEditorState().read(() => $getRoot().getTextContent());
}

async function loadReportingEnvironment(props: {
  scripture: string;
  editorAdaptor: EditorAdaptor;
  onLoadingChange?: (isLoading: boolean) => void;
  logger?: ReturnType<typeof createLogger>;
}) {
  reportingEditor = undefined;

  function GrabEditor() {
    const [composerEditor] = useLexicalComposerContext();
    useEffect(() => {
      reportingEditor = composerEditor;
    }, [composerEditor]);
    return null;
  }

  function App(appProps: typeof props): ReactElement {
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
        <LoadStatePlugin
          scripture={appProps.scripture}
          editorAdaptor={appProps.editorAdaptor}
          onLoadingChange={appProps.onLoadingChange}
          logger={appProps.logger}
        />
      </LexicalComposer>
    );
  }

  let rerender: (ui: ReactElement) => void = () => undefined;
  await act(async () => {
    ({ rerender } = render(<App {...props} />));
  });

  return {
    reload: async (nextProps: Partial<typeof props>) =>
      act(async () => {
        rerender(<App {...props} {...nextProps} />);
      }),
  };
}

describe("LoadStatePlugin onLoadingChange", () => {
  it("reports the load balanced, and the loaded document is live at the settle", async () => {
    const calls: boolean[] = [];
    const settledWith: string[] = [];
    await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor: createCountingAdaptor(),
      onLoadingChange: (isLoading) => {
        calls.push(isLoading);
        if (!isLoading) settledWith.push(liveText());
      },
    });

    expect(calls).toEqual([true, false]);
    expect(settledWith).toEqual(["first"]);
  });

  it("reports each reload the same way, with the new document live", async () => {
    const settledWith: string[] = [];
    const onLoadingChange = (isLoading: boolean) => {
      if (!isLoading) settledWith.push(liveText());
    };

    const environment = await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor: createCountingAdaptor(),
      onLoadingChange,
    });
    await environment.reload({ scripture: "second" });

    expect(settledWith).toEqual(["first", "second"]);
    expect(liveText()).toBe("second");
  });

  it("settles with the previous document live when there is nothing to serialize", async () => {
    const calls: boolean[] = [];
    const settledWith: string[] = [];
    const logger = createLogger();
    const editorAdaptor = createCountingAdaptor();
    const onLoadingChange = (isLoading: boolean) => {
      calls.push(isLoading);
      if (!isLoading) settledWith.push(liveText());
    };

    const environment = await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor,
      onLoadingChange,
      logger,
    });
    editorAdaptor.serializeEditorState.mockReturnValueOnce(
      undefined as unknown as SerializedEditorState,
    );
    await environment.reload({ scripture: "skipped" });

    expect(calls).toEqual([true, false, true, false]);
    // The invariant the prop documents: a settle means the document is stable, and a skipped load
    // leaves the previous one in place.
    expect(settledWith).toEqual(["first", "first"]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("settles when the adaptor throws", async () => {
    const calls: boolean[] = [];
    const logger = createLogger();

    await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor: {
        serializeEditorState: () => {
          throw new Error("adaptor exploded");
        },
      },
      onLoadingChange: (isLoading) => calls.push(isLoading),
      logger,
    });

    expect(calls).toEqual([true, false]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("settles when a consumer's own callback throws on the way in", async () => {
    const calls: boolean[] = [];

    await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor: createCountingAdaptor(),
      onLoadingChange: (isLoading) => {
        calls.push(isLoading);
        if (isLoading) throw new Error("consumer exploded");
      },
      logger: createLogger(),
    });

    // Balanced even so: a caller counting these must not be left waiting forever.
    expect(calls).toEqual([true, false]);
  });

  it("does not reload when only the callback's identity changes", async () => {
    // The callback is a dependency of nothing: an inline lambda would otherwise reload the
    // document — clearing undo/redo with it — on every render of the consumer.
    const editorAdaptor = createCountingAdaptor();
    const environment = await loadReportingEnvironment({
      scripture: "first",
      editorAdaptor,
      onLoadingChange: () => undefined,
    });
    expect(editorAdaptor.serializeEditorState).toHaveBeenCalledTimes(1);

    const laterCalls: boolean[] = [];
    await environment.reload({ onLoadingChange: (isLoading) => laterCalls.push(isLoading) });

    expect(editorAdaptor.serializeEditorState).toHaveBeenCalledTimes(1);
    expect(laterCalls).toEqual([]);

    // ...and the latest callback is the one a real reload reports to.
    await environment.reload({
      scripture: "second",
      onLoadingChange: (isLoading) => laterCalls.push(isLoading),
    });

    expect(editorAdaptor.serializeEditorState).toHaveBeenCalledTimes(2);
    expect(laterCalls).toEqual([true, false]);
  });
});
