import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { serializedLexicalToUsjNode } from "shared/converters/usj";
import type { UsjDocument, UsjNode } from "shared/converters/usj/core/usj";

/**
 * Simple checksum function for comparing USJ documents
 * Uses JSON.stringify which is deterministic for USJ output
 */
function getUsjChecksum(usj: UsjDocument | UsjNode | string | null): string {
  if (!usj) return "";
  const normalized = typeof usj === "string" ? usj : JSON.stringify(usj);
  return normalized;
}

interface SaveStateContextValue {
  hasUnsavedChanges: boolean;
  checkForChanges: () => boolean;
  markAsSaved: (usj?: UsjDocument | UsjNode | string) => void;
  getCurrentUsj: () => UsjDocument | UsjNode | string | null;
  getSavedUsj: () => string;
}

const SaveStateContext = createContext<SaveStateContextValue | null>(null);

/**
 * Provider that tracks save state by comparing USJ (deterministic)
 * rather than Lexical state (non-deterministic)
 */
export function SaveStateProvider({ children }: { children: React.ReactNode }) {
  const [editor] = useLexicalComposerContext();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const savedUsjChecksum = useRef<string>("");
  const isInitialized = useRef(false);

  // Get current USJ from editor state
  const getCurrentUsj = useCallback((): UsjDocument | UsjNode | string | null => {
    try {
      const serializedEditorState = editor.getEditorState().toJSON();
      const { result: usj } = serializedLexicalToUsjNode(serializedEditorState.root);
      return usj;
    } catch (error) {
      console.error("Error getting current USJ:", error);
      return null;
    }
  }, [editor]);

  // Get saved USJ checksum
  const getSavedUsj = useCallback(() => {
    return savedUsjChecksum.current;
  }, []);

  // Check if there are unsaved changes by comparing USJ
  const checkForChanges = useCallback((): boolean => {
    try {
      const currentUsj = getCurrentUsj();
      const currentChecksum = getUsjChecksum(currentUsj);
      const savedChecksum = savedUsjChecksum.current;

      // If not initialized, set the initial saved state
      if (!isInitialized.current) {
        savedUsjChecksum.current = currentChecksum;
        isInitialized.current = true;
        return false;
      }

      const hasChanges = currentChecksum !== savedChecksum;
      setHasUnsavedChanges(hasChanges);
      return hasChanges;
    } catch (error) {
      console.error("Error checking for changes:", error);
      return false;
    }
  }, [getCurrentUsj]);

  // Mark current state as saved
  const markAsSaved = useCallback(
    (usj?: UsjDocument | UsjNode | string) => {
      try {
        // If USJ is provided (from successful save), use that
        // Otherwise get current USJ from editor
        const usjToSave = usj ?? getCurrentUsj();
        savedUsjChecksum.current = getUsjChecksum(usjToSave);
        setHasUnsavedChanges(false);
        isInitialized.current = true;
      } catch (error) {
        console.error("Error marking as saved:", error);
      }
    },
    [getCurrentUsj],
  );

  // Initialize saved state when editor is ready
  useEffect(() => {
    if (editor && !isInitialized.current) {
      // Wait a tick for editor to be fully initialized
      const timer = setTimeout(() => {
        checkForChanges();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editor, checkForChanges]);

  const value: SaveStateContextValue = {
    hasUnsavedChanges,
    checkForChanges,
    markAsSaved,
    getCurrentUsj,
    getSavedUsj,
  };

  return <SaveStateContext.Provider value={value}>{children}</SaveStateContext.Provider>;
}

/**
 * Hook to access save state
 */
export function useSaveState() {
  const context = useContext(SaveStateContext);
  if (!context) {
    throw new Error("useSaveState must be used within a SaveStateProvider");
  }
  return context;
}

/**
 * Hook that can be used outside SaveStateProvider (returns null if not available)
 */
export function useSaveStateOptional() {
  return useContext(SaveStateContext);
}
