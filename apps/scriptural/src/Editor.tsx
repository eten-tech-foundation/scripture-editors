import { useMemo, useEffect, useState, useCallback, useRef } from "react";

import {
  ScripturalEditorComposer,
  HistoryPlugin,
  CursorHandlerPlugin,
  ScripturalNodesMenuPlugin,
  DEFAULT_SCRIPTURAL_BASE_SETTINGS,
  useBaseSettings,
  ScripturalInitialConfigType,
  ScriptureReferenceHandler,
  ScrollToReferencePlugin,
  MarkersMenuProvider,
} from "@scriptural/react";
import "@scriptural/react/styles/scriptural-editor.css";
import "@scriptural/react/styles/nodes-menu.css";

import "./editor.css";
import { CustomToolbar } from "./CustomToolbar";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { UsjDocument } from "@scriptural/react/internal-packages/shared/converters/usj/core/usj";
import { EditorState, LexicalEditor } from "lexical";
import { AppReferenceHandler } from "./utils/AppReferenceHandler";
import { HistoryMergeListener } from "shared/plugins/History";
import { useUnsavedChanges, useBeforeUnload } from "./hooks";

function onError(error: any) {
  console.error(error);
}

export function Editor({
  usj,
  initialState,
  bookCode,
  editable = true,
  children,
  onSave,
  onHistoryChange,
  scriptureReferenceHandler,
  referenceHandlerSource,
  enableScrollToReference = true,
}: {
  usj?: UsjDocument;
  initialState?: null | string | EditorState | ((editor: LexicalEditor) => void);
  bookCode: string;
  editable?: boolean;
  children?: React.ReactNode;
  onSave?: (newUsj: UsjDocument) => void;
  onHistoryChange?: Parameters<typeof HistoryPlugin>[0]["onChange"];
  scriptureReferenceHandler?: ScriptureReferenceHandler;
  referenceHandlerSource?: string;
  enableScrollToReference?: boolean;
}) {
  const initialConfig = useMemo<ScripturalInitialConfigType>(() => {
    return {
      bookCode,
      usj,
      onError,
      editable,
      initialLexicalState: initialState,
      initialSettings: {
        ...DEFAULT_SCRIPTURAL_BASE_SETTINGS,
        onSave,
      },
    };
  }, [usj, editable, onSave, bookCode]);

  // Set the source identifier on the reference handler if both are provided
  useEffect(() => {
    if (
      scriptureReferenceHandler &&
      referenceHandlerSource &&
      scriptureReferenceHandler instanceof AppReferenceHandler
    ) {
      scriptureReferenceHandler.setSource(referenceHandlerSource);
    }
  }, [scriptureReferenceHandler, referenceHandlerSource]);

  return (
    <div className="editor-wrapper prose relative">
      <ScripturalEditorComposer
        initialConfig={initialConfig}
        scriptureReferenceHandler={scriptureReferenceHandler}
      >
        <EditorPlugins
          onSave={onSave}
          onHistoryChange={onHistoryChange}
          enableScrollToReference={enableScrollToReference}
        />
        {children}
      </ScripturalEditorComposer>
    </div>
  );
}

function EditorPlugins({
  onSave,
  onHistoryChange,
  enableScrollToReference,
}: {
  onSave?: (newUsj: UsjDocument) => void;
  onHistoryChange?: Parameters<typeof HistoryPlugin>[0]["onChange"];
  enableScrollToReference?: boolean;
}) {
  const { enhancedCursorPosition, contextMenuTriggerKey } = useBaseSettings();
  const [editor] = useLexicalComposerContext();
  const editable = useMemo(() => editor.isEditable(), [editor]);

  const {
    hasUnsavedChanges,
    handleSave,
    trackHistoryChanges,
    reset: resetUnsavedChanges,
    checkForChanges,
  } = useUnsavedChanges(editor, onSave, onHistoryChange);

  // Add beforeunload handler to warn about unsaved changes
  useBeforeUnload(hasUnsavedChanges);

  // Check for changes when the editor mode changes
  useEffect(() => {
    // Brief delay to ensure editor state is stable
    const timer = setTimeout(() => {
      checkForChanges();
    }, 100);
    return () => clearTimeout(timer);
  }, [editable, checkForChanges]);

  // Reset tracking when editor changes
  useEffect(() => {
    if (editor) {
      resetUnsavedChanges();
    }
  }, [editor, resetUnsavedChanges]);

  return (
    <>
      <MarkersMenuProvider>
        <CustomToolbar onSave={handleSave} hasUnsavedChanges={hasUnsavedChanges} />
        {editable && (
          <>
            {enhancedCursorPosition && (
              <CursorHandlerPlugin
                updateTags={["history-merge", "skip-toggle-nodes"]}
                canContainPlaceHolder={(node) => node.getType() !== "graft"}
              />
            )}

            <ScripturalNodesMenuPlugin trigger={contextMenuTriggerKey} />
            <HistoryPlugin onChange={trackHistoryChanges} />
          </>
        )}

        {enableScrollToReference && (
          <ScrollToReferencePlugin scrollBehavior="smooth" scrollOffset={80} />
        )}
      </MarkersMenuProvider>
    </>
  );
}
