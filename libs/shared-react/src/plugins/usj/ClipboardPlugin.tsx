import {
  copySelection,
  cutSelection,
  pasteSelection,
  pasteSelectionAsPlainText,
  registerEmptyCopyGuard,
} from "./clipboard.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IS_APPLE, mergeRegister } from "@lexical/utils";
import { useEffect } from "react";

export function ClipboardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { key, shiftKey, metaKey, ctrlKey, altKey } = event;
      if (!(IS_APPLE ? metaKey : ctrlKey) || altKey) return;

      if (!shiftKey && key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection(editor);
      } else if (!shiftKey && key.toLowerCase() === "x") {
        event.preventDefault();
        cutSelection(editor);
      } else if (key.toLowerCase() === "v") {
        event.preventDefault();
        if (shiftKey) pasteSelectionAsPlainText(editor);
        else pasteSelection(editor);
      }
    };

    return mergeRegister(
      // Every copy/cut this plugin's shortcuts synthesize — and every one the context menu or an
      // editor ref synthesizes against the same editor — passes through this guard.
      registerEmptyCopyGuard(editor),
      editor.registerRootListener(
        (rootElement: HTMLElement | null, prevRootElement: HTMLElement | null) => {
          if (prevRootElement !== null) {
            prevRootElement.removeEventListener("keydown", onKeyDown);
          }
          if (rootElement !== null) {
            rootElement.addEventListener("keydown", onKeyDown);
          }
        },
      ),
    );
  }, [editor]);

  return null;
}
