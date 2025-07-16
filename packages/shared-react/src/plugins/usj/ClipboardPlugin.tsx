import { pasteSelection, pasteSelectionAsPlainText } from "./clipboard.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IS_APPLE } from "@lexical/utils";
import { COPY_COMMAND, CUT_COMMAND } from "lexical";
import { useEffect } from "react";

export function ClipboardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { key, shiftKey, metaKey, ctrlKey, altKey } = event;
      if (!(IS_APPLE ? metaKey : ctrlKey) || altKey) return;

      if (!shiftKey && key.toLowerCase() === "c") {
        event.preventDefault();
        editor.dispatchCommand(COPY_COMMAND, null);
      } else if (!shiftKey && key.toLowerCase() === "x") {
        event.preventDefault();
        editor.dispatchCommand(CUT_COMMAND, null);
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
