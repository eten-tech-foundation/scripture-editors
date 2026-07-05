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
          // `editor.read()` force-flushes any in-flight `editor.update()` mid-dispatch
          // (`$commitPendingUpdates` runs unconditionally), which is reachable when this handler
          // is invoked from a nested `dispatchCommand(SELECTION_CHANGE_COMMAND, ...)` call inside
          // another plugin's update — the enabler of the Task 9 frozen-commit crash class (see
          // OnSelectionChangePlugin.test.tsx). Reading the last COMMITTED state instead never
          // triggers a commit, so it's safe to call from any context; it just means a selection
          // change that is still mid-update-in-flight is reported on the next commit instead.
          const usjSelection = editor.getEditorState().read($getUsjSelectionFromEditor);
          onChange?.(usjSelection);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, onChange],
  );

  return null;
}
