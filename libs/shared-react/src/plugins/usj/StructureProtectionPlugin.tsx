import {
  $shouldBlockSelectionReplacement,
  $shouldBlockStructuralEdit,
  keyDownToIntent,
} from "./structureProtection.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";

/**
 * When `isProtected`, blocks keyboard-driven changes to paragraph and verse markers.
 * Registers a KEY_DOWN handler at COMMAND_PRIORITY_HIGH, mirroring ArrowNavigationPlugin.
 *
 * @param isProtected - When true, structural keystrokes are intercepted; when false, inert.
 * @returns Always `null`; this component has no UI.
 */
export function StructureProtectionPlugin({ isProtected }: { isProtected: boolean }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      if (!isProtected) return false;
      const intent = keyDownToIntent(event);
      if (!intent) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockStructuralEdit(selection, intent)) {
        event.preventDefault();
        return true;
      }
      return false;
    };

    // Guard for vectors that bypass KEY_DOWN (cut, paste, drop, IME-composed input).
    // Reuses Rule 1: block when the selection spans a boundary or contains a verse marker.
    // Inspecting pasted/dropped *content* for embedded markers is deferred (see spec §2.5).
    const $blockUnsafeSelection = (payload: unknown): boolean => {
      if (!isProtected) return false;
      const selection = $getSelection();
      if (!selection || !$shouldBlockSelectionReplacement(selection)) return false;
      if (payload instanceof Event) payload.preventDefault();
      return true;
    };

    return mergeRegister(
      editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(PASTE_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DRAGSTART_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DROP_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        $blockUnsafeSelection,
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, isProtected]);

  return null;
}
