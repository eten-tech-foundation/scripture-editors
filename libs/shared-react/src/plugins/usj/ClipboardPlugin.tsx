import {
  copySelection,
  cutSelection,
  pasteSelection,
  pasteSelectionAsPlainText,
} from "./clipboard.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IS_APPLE } from "@lexical/utils";
import { useEffect } from "react";

export function ClipboardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { key, shiftKey, metaKey, ctrlKey, altKey } = event;
      if (!(IS_APPLE ? metaKey : ctrlKey) || altKey) return;

      // Copy/cut suppress the browser's own handling only when this plugin actually replaces it.
      // With nothing selected there is nothing to replace, and leaving the browser to it is what
      // keeps the clipboard untouched — see `copySelection` for what happens when a copy with no
      // content behind it is synthesized anyway.
      if (!shiftKey && key.toLowerCase() === "c") {
        if (copySelection(editor)) event.preventDefault();
      } else if (!shiftKey && key.toLowerCase() === "x") {
        if (cutSelection(editor)) event.preventDefault();
      } else if (key.toLowerCase() === "v") {
        event.preventDefault();
        if (shiftKey) pasteSelectionAsPlainText(editor);
        else pasteSelection(editor);
      }
    };

    return editor.registerRootListener(
      (rootElement: HTMLElement | null, prevRootElement: HTMLElement | null) => {
        if (prevRootElement !== null) {
          prevRootElement.removeEventListener("keydown", onKeyDown);
        }
        if (rootElement !== null) {
          rootElement.addEventListener("keydown", onKeyDown);
        }
      },
    );
  }, [editor]);

  return null;
}
