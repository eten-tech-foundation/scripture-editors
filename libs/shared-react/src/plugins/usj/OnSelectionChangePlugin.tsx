import { SelectionRange } from "./annotation/selection.model";
import { $getUsjSelectionFromEditor } from "./annotation/selection.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import { useEffect } from "react";

export function OnSelectionChangePlugin({
  onChange,
}: {
  onChange: ((selection: SelectionRange | undefined) => void) | undefined;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const usjSelection = editor.read($getUsjSelectionFromEditor);
          onChange?.(usjSelection);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, onChange],
  );

  return null;
}
