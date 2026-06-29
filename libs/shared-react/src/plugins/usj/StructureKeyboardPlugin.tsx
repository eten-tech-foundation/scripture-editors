import {
  $isArmedSelection,
  $mergeParaIntoPrevious,
  $placeCaretAtEnd,
  $shouldBlockSelectionReplacement,
  $shouldBlockStructuralEdit,
  $structuralDeleteTarget,
  ArmedDelete,
  keyDownToIntent,
} from "./structureProtection.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createNodeSelection,
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useEffect, useRef } from "react";

/**
 * Governs structural keystrokes (Backspace/Delete/Enter/typing) at verse- and paragraph-marker
 * boundaries. When `isStructureProtected`, blocks them (PT-4013). When not protected, makes
 * deletion a deliberate two-step gesture: first press selects the marker/section, second press
 * deletes it. Registers a KEY_DOWN handler at COMMAND_PRIORITY_HIGH, mirroring ArrowNavigationPlugin.
 *
 * @param isStructureProtected - When true, structural keystrokes are blocked; when false, the
 *   two-step intentional-delete behavior is active.
 * @returns Always `null`; this component has no UI.
 */
export function StructureKeyboardPlugin({
  isStructureProtected,
}: {
  isStructureProtected: boolean;
}): null {
  const [editor] = useLexicalComposerContext();
  const armedRef = useRef<ArmedDelete | undefined>(undefined);

  useEffect(() => {
    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      const intent = keyDownToIntent(event);
      if (!intent) return false;
      const selection = $getSelection();
      if (isStructureProtected) {
        if (selection && $shouldBlockStructuralEdit(selection, intent)) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      // Unprotected: two-step intentional delete (delete intents only).
      if (intent !== "deleteBackward" && intent !== "deleteForward") return false;
      return $handleTwoStepDelete(intent, event);
    };

    const $handleTwoStepDelete = (
      intent: "deleteBackward" | "deleteForward",
      event: KeyboardEvent,
    ): boolean => {
      const selection = $getSelection();
      const armed = armedRef.current;

      // FIRE / cancel: a target is armed.
      if (armed && selection && $isArmedSelection(selection, armed)) {
        armedRef.current = undefined;
        event.preventDefault();
        if (intent !== armed.intent) return true; // mismatched direction: cancel, no delete
        const node = $getNodeByKey(armed.key) ?? undefined;
        if (armed.kind === "verse") {
          if (node) {
            const parent = node.getParent();
            const prev = node.getPreviousSibling();
            const next = node.getNextSibling();
            node.remove();
            if (prev) $placeCaretAtEnd(prev);
            else if (next && $isTextNode(next)) next.select(0, 0);
            else parent?.selectStart();
          }
        } else if (node && $isElementNode(node)) {
          $mergeParaIntoPrevious(node);
        }
        return true;
      }

      // ARM: caret at a structural boundary.
      if (!selection) return false;
      const target = $structuralDeleteTarget(selection, intent);
      if (!target) return false;
      if (target.kind === "verse") {
        const ns = $createNodeSelection();
        ns.add(target.node.getKey());
        $setSelection(ns);
      } else {
        const range = $createRangeSelection();
        range.anchor.set(target.node.getKey(), 0, "element");
        range.focus.set(target.node.getKey(), target.node.getChildrenSize(), "element");
        $setSelection(range);
      }
      armedRef.current = { key: target.node.getKey(), kind: target.kind, intent };
      event.preventDefault();
      return true;
    };

    // Guard for vectors that bypass KEY_DOWN (cut, paste, drop, IME-composed input).
    const $blockUnsafeSelection = (payload: unknown): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (!selection || !$shouldBlockSelectionReplacement(selection)) return false;
      if (payload instanceof Event) payload.preventDefault();
      return true;
    };

    // Drop the latch as soon as the live selection no longer encodes the armed target
    // (arrow key, click, typing, etc.). Reads only; never mutates the editor.
    const clearStaleLatch = () => {
      const armed = armedRef.current;
      if (!armed) return;
      editor.getEditorState().read(() => {
        if (!$isArmedSelection($getSelection(), armed)) armedRef.current = undefined;
      });
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
      editor.registerUpdateListener(clearStaleLatch),
    );
  }, [editor, isStructureProtected]);

  return null;
}
