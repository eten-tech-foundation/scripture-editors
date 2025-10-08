import React from "react";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalEditor } from "lexical";
import { ChapterVerseUpdatePlugin } from "./plugins/ChapterVerseUpdatePlugin";
import { MarkerWatcherPlugin } from "./plugins/MarkerWatcherPlugin";
import ContentEditablePlugin from "./plugins/ContentEditablePlugin";
import { ScripturalHandlersPlugin } from "shared-react/plugins/ScripturalHandlers/ScripturalHandlersPlugin";
import { ScriptureReferencePlugin } from "shared-react/plugins/ScriptureReferencePlugin";
import { scriptureNodes } from "shared/nodes/scripture/generic";
import {
  ScripturalEditorProvider,
  ScripturalInitialConfigType,
  ScriptureReferenceHandler,
} from "./context/ScripturalEditorContext";
import { useScripturalComposerContext } from "./context/ScripturalEditorContext";
import { SaveStateProvider } from "./context/SaveStateContext";

type ScripturalComposerProps = {
  initialConfig: ScripturalInitialConfigType;
  children: React.ReactNode;
  scriptureReferenceHandler?: ScriptureReferenceHandler;
};

function ScripturalComposerContent({ children }: { children: React.ReactNode }) {
  const { initialLexicalState, scripturalInitialConfig, setScriptureReference, editorRef } =
    useScripturalComposerContext();

  const initialConfig: InitialConfigType = {
    namespace: "ScriptureEditor",
    theme: scripturalInitialConfig.theme,
    editorState: initialLexicalState,
    onError: (error: Error, _editor: LexicalEditor) =>
      scripturalInitialConfig.onError(error, _editor),
    nodes: [...scriptureNodes],
    editable: scripturalInitialConfig.editable,
  };

  return (
    initialLexicalState && (
      <LexicalComposer initialConfig={initialConfig}>
        <SaveStateProvider>
          {children}
          <ScriptureReferencePlugin
            onChangeReference={(reference) => {
              setScriptureReference(reference, "editor_content");
            }}
            book={scripturalInitialConfig.bookCode}
            verseDepth={2}
            chapterDepth={1}
          />
          <MarkerWatcherPlugin />
          <ChapterVerseUpdatePlugin />
          <div className={"scriptural-editor"}>
            <ContentEditablePlugin ref={editorRef} />
            <ScripturalHandlersPlugin />
          </div>
        </SaveStateProvider>
      </LexicalComposer>
    )
  );
}

export default function ScripturalComposer({
  initialConfig,
  children,
  scriptureReferenceHandler,
}: ScripturalComposerProps) {
  // Merge the reference handler into the initial config if provided
  const mergedConfig = {
    ...initialConfig,
    scriptureReferenceHandler,
  };

  return (
    <ScripturalEditorProvider initialConfig={mergedConfig}>
      <ScripturalComposerContent children={children} />
    </ScripturalEditorProvider>
  );
}
