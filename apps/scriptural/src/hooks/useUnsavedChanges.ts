import { useCallback, useRef, useState, useEffect } from "react";
import { LexicalEditor, EditorState } from "lexical";
import { UsjDocument } from "@scriptural/react/internal-packages/shared/converters/usj/core/usj";
import { HistoryMergeListener } from "shared/plugins/History";

/**
 * Hook to track unsaved changes in the editor
 *
 * @param editor - The LexicalEditor instance
 * @param onSave - Callback to save content
 * @param onHistoryChange - Optional callback for history changes
 * @returns Object with hasUnsavedChanges state, handleSave function, trackHistoryChanges function, and reset function
 */
export function useUnsavedChanges(
  editor: LexicalEditor,
  onSave?: (newUsj: UsjDocument) => void,
  onHistoryChange?: HistoryMergeListener,
) {
  const savedEditorState = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize the saved state when the editor is first mounted
  useEffect(() => {
    try {
      if (editor) {
        savedEditorState.current = JSON.stringify(editor.getEditorState().toJSON());
      }
    } catch (error) {
      console.error("Error initializing saved editor state:", error);
    }
  }, [editor]);

  const checkForChanges = useCallback(() => {
    try {
      const currentState = editor.getEditorState();
      const currentStateJson = JSON.stringify(currentState?.toJSON());
      const savedState = savedEditorState.current;

      if (!savedState) {
        return;
      }

      setHasUnsavedChanges(currentStateJson !== savedState);
    } catch (error) {
      console.error("Error checking for unsaved changes:", error);
    }
  }, [editor]);

  const trackHistoryChanges: HistoryMergeListener = useCallback(
    ({ editorChanged, editorState, history, ...rest }) => {
      if (editorChanged) {
        checkForChanges();
      }
      onHistoryChange?.({ editorChanged, editorState, history, ...rest });
    },
    [onHistoryChange, checkForChanges],
  );

  const handleSave = useCallback(
    (usj: UsjDocument) => {
      if (onSave) {
        try {
          onSave(usj);
          savedEditorState.current = JSON.stringify(editor.getEditorState().toJSON());
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error("Error saving document:", error);
        }
      }
    },
    [editor, onSave],
  );

  const reset = useCallback(() => {
    try {
      savedEditorState.current = JSON.stringify(editor.getEditorState().toJSON());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error resetting unsaved changes state:", error);
    }
  }, [editor]);

  return {
    hasUnsavedChanges,
    handleSave,
    trackHistoryChanges,
    reset,
    checkForChanges,
  };
}
