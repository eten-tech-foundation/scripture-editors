import "./App.css";
import { Editor } from "./Editor";
import * as usj from "./tit.edit.json";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import AppBar from "./app/AppBar";
import { useResponsive } from "./utils/useResponsive";
import { UsjDocument } from "@scriptural/react/internal-packages/shared/converters/usj/core/usj";
import { EditorState } from "lexical";
import { useMemo } from "react";
import { AppReferenceHandler } from "./utils/AppReferenceHandler";

const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

type CachedData<T> = {
  timestamp: number;
  data: T;
};

const STORAGE_KEYS = {
  EDITOR_STATE: "scriptural-editor-state",
  USJ_CONTENT: "scriptural-usj-content",
} as const;

function App() {
  const isVertical = useResponsive(600);
  const editorState = useMemo(() => getInitialEditorState(), []);

  // Create a shared reference handler that will sync between the two editors
  const referenceHandler = useMemo(
    () =>
      new AppReferenceHandler({
        book: "TIT",
        chapter: 1,
        verse: 1,
      }),
    [],
  );

  console.log({ usj });

  return (
    <div className="flex flex-col max-h-screen">
      <AppBar referenceHandler={referenceHandler} />
      <PanelGroup
        className="workspace flex-grow"
        autoSaveId="example"
        direction={isVertical ? "vertical" : "horizontal"}
      >
        <Panel defaultSize={50}>
          <Editor
            usj={usj as UsjDocument}
            editable={false}
            bookCode={"TIT"}
            scriptureReferenceHandler={referenceHandler}
            referenceHandlerSource="left-panel"
            enableScrollToReference={true}
          />
        </Panel>
        <PanelResizeHandle className="resizable-handle" />
        <Panel defaultSize={50}>
          <Editor
            usj={editorState ? undefined : (getInitialUsj("TIT") ?? createEmptyUsj("TIT"))}
            initialState={editorState}
            editable={true}
            bookCode={"TIT"}
            scriptureReferenceHandler={referenceHandler}
            referenceHandlerSource="right-panel"
            enableScrollToReference={true}
            onSave={(newUsj: UsjDocument) => {
              const cachedUsj: CachedData<UsjDocument> = {
                timestamp: Date.now(),
                data: newUsj,
              };
              localStorage.setItem(STORAGE_KEYS.USJ_CONTENT, JSON.stringify(cachedUsj));
              localStorage.removeItem(STORAGE_KEYS.EDITOR_STATE);
              console.log("Saved USJ content successfully at:", new Date().toISOString());
            }}
            onHistoryChange={(history) => {
              if (history.editorChanged && !history.tags.has("history-merge")) {
                const cachedState: CachedData<unknown> = {
                  timestamp: Date.now(),
                  data: history.editorState.toJSON(),
                };
                localStorage.setItem(STORAGE_KEYS.EDITOR_STATE, JSON.stringify(cachedState));
                console.log("Updated editor state at:", new Date().toISOString());
              }
            }}
          />
        </Panel>
      </PanelGroup>
      <footer className="py-4 text-center text-sm text-gray-600">
        <a
          href="https://github.com/BiblioNexus-Foundation/scripture-editors/tree/scriptural-react/apps/scriptural"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-900 hover:underline"
        >
          View source code on GitHub
        </a>
      </footer>
    </div>
  );
}

export default App;

function createEmptyUsj(bookCode: string): UsjDocument {
  return {
    content: [
      {
        code: bookCode,
        content: [""],
        marker: "id",
        type: "book",
      },
      {
        marker: "c",
        number: "1",
        type: "chapter",
      },
    ],
    type: "USJ",
    version: "3.0",
  };
}

function getInitialUsj(bookCode: string): UsjDocument {
  // First check for editor state
  const savedState = localStorage.getItem(STORAGE_KEYS.EDITOR_STATE);
  if (savedState) {
    try {
      const cached = JSON.parse(savedState) as CachedData<EditorState>;
      const age = Date.now() - cached.timestamp;

      if (age <= CACHE_EXPIRATION) {
        // Return empty USJ since we have valid editor state
        return createEmptyUsj(bookCode);
      }
    } catch (e) {
      console.warn("Failed to parse saved editor state:", e);
    }
  }

  // If no valid editor state, check for saved USJ
  const savedUsj = localStorage.getItem(STORAGE_KEYS.USJ_CONTENT);
  if (savedUsj) {
    try {
      const cached = JSON.parse(savedUsj) as CachedData<UsjDocument>;
      const age = Date.now() - cached.timestamp;

      if (age <= CACHE_EXPIRATION) {
        console.log("Loading USJ content from:", new Date(cached.timestamp).toISOString());
        return cached.data;
      }
    } catch (e) {
      console.warn("Failed to parse saved USJ content:", e);
    }
  }

  // If neither editor state nor USJ found, create empty USJ
  console.log("Creating new empty USJ");
  return createEmptyUsj(bookCode);
}

function getInitialEditorState(): string | null {
  const savedState = localStorage.getItem(STORAGE_KEYS.EDITOR_STATE);
  if (savedState) {
    try {
      const cached = JSON.parse(savedState) as CachedData<EditorState>;
      console.log("Loading editor state from:", new Date(cached.timestamp).toISOString());
      return JSON.stringify(cached.data);
    } catch (e) {
      console.warn("Failed to parse saved editor state:", e);
    }
  }
  return null;
}
