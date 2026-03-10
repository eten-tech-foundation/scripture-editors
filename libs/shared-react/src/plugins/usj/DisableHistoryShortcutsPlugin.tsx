import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IS_APPLE } from "@lexical/utils";
import { COMMAND_PRIORITY_CRITICAL, KEY_DOWN_COMMAND } from "lexical";
import { useEffect } from "react";

/**
 * Prevent undo and redo keyboard shortcuts while preserving command-based undo/redo.
 * @returns `null`. This plugin has no DOM presence.
 */
export function DisableHistoryShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const { key, shiftKey, metaKey, ctrlKey, altKey } = event;
        if (!(IS_APPLE ? metaKey : ctrlKey) || altKey) return false;

        const normalizedKey = key.toLowerCase();
        const isUndo = normalizedKey === "z" && !shiftKey;
        const isRedo = normalizedKey === "y" || (normalizedKey === "z" && shiftKey);

        if (!isUndo && !isRedo) return false;

        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
