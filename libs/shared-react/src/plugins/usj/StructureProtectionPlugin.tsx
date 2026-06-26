import {
  $sanitizeNodesForProtectedStructure,
  $shouldBlockSelectionReplacement,
  $shouldBlockStructuralEdit,
  keyDownToIntent,
} from "./structureProtection.utils";
import { $generateNodesFromDOM } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
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
 * When `isStructureProtected`, blocks keyboard-driven changes to paragraph and verse markers,
 * and sanitizes paste/drop payloads so structural markers (paragraph breaks, verse markers,
 * chapter markers) cannot be inserted. Text, inline character formatting, and notes are kept.
 *
 * @param isStructureProtected - When true, structural edits are intercepted; when false, inert.
 * @returns Always `null`; this component has no UI.
 */
export function StructureProtectionPlugin({
  isStructureProtected,
}: {
  isStructureProtected: boolean;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      if (!isStructureProtected) return false;
      const intent = keyDownToIntent(event);
      if (!intent) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockStructuralEdit(selection, intent)) {
        event.preventDefault();
        return true;
      }
      return false;
    };

    // Guard for vectors that bypass KEY_DOWN (cut, dragstart, IME-composed input).
    // Rule 1: block when the selection spans a boundary or contains a verse marker.
    const $blockUnsafeSelection = (payload: unknown): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (!selection || !$shouldBlockSelectionReplacement(selection)) return false;
      if (payload instanceof Event) payload.preventDefault();
      return true;
    };

    // Sanitize a paste/drop payload: strip structural markers from the HTML and insert the rest.
    // Returns true (consume) when we handled an HTML payload; false to let the default handler run.
    const $sanitizeAndInsert = (html: string | undefined, event: Event): boolean => {
      if (!html) return false; // plain-text-only (or empty) payload carries no markers
      const dom = new DOMParser().parseFromString(html, "text/html");
      const sanitized = $sanitizeNodesForProtectedStructure($generateNodesFromDOM(editor, dom));
      // For DROP, the browser pre-positions the DOM selection at the drop point before the event fires, so $getSelection() reflects the drop target.
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertNodes(sanitized);
      event.preventDefault();
      return true;
    };

    const $handlePaste = (event: ClipboardEvent): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockSelectionReplacement(selection)) {
        event.preventDefault();
        return true;
      }
      return $sanitizeAndInsert(event.clipboardData?.getData("text/html"), event);
    };

    const $handleDrop = (event: DragEvent): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockSelectionReplacement(selection)) {
        event.preventDefault();
        return true;
      }
      return $sanitizeAndInsert(event.dataTransfer?.getData("text/html"), event);
    };

    return mergeRegister(
      editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(PASTE_COMMAND, $handlePaste, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DRAGSTART_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DROP_COMMAND, $handleDrop, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        $blockUnsafeSelection,
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, isStructureProtected]);

  return null;
}
