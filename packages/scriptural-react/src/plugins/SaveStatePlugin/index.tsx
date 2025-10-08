import { useCallback, useRef, useEffect } from "react";
import type { HistoryMergeListener } from "shared/plugins/History";
import { useSaveStateOptional } from "../../context/SaveStateContext";

/**
 * Hook that returns an enhanced onChange callback for HistoryPlugin
 * that automatically tracks save state based on USJ changes
 *
 * @param onChange - Optional user callback to be called after save state is checked
 * @returns Enhanced onChange callback to pass to HistoryPlugin
 */
export function useSaveStateTracking(onChange?: HistoryMergeListener): HistoryMergeListener {
  const saveState = useSaveStateOptional();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const enhancedOnChange: HistoryMergeListener = useCallback(
    (args) => {
      const { editorChanged, tags } = args;

      // Only check for changes if the editor actually changed
      // Skip if this is a history-merge operation (just cursor/selection changes)
      if (editorChanged && !tags.has("history-merge")) {
        // Clear any pending check
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Debounce check slightly to batch rapid changes
        timeoutRef.current = setTimeout(() => {
          saveState?.checkForChanges();
          timeoutRef.current = null;
        }, 100);
      }

      // Call the user's onChange callback
      onChange?.(args);
    },
    [saveState, onChange],
  );

  return enhancedOnChange;
}
