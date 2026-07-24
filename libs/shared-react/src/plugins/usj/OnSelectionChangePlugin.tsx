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
          // Called as a bare `$` function, NOT via `editor.read()` or a committed-state read:
          // command listeners always run inside the active update, so `$getSelection()` sees the
          // CURRENT (pending) selection. `editor.read()` here would force-flush an in-flight
          // `editor.update()` mid-dispatch (`$commitPendingUpdates` runs unconditionally) — the
          // enabler of the frozen-commit crash class (see OnSelectionChangePlugin.test.tsx) —
          // while reading the last committed state instead would report every ordinary selection
          // change one interaction late, because Lexical dispatches SELECTION_CHANGE from inside
          // a not-yet-committed update on the normal DOM path too.
          const usjSelection = $getUsjSelectionFromEditor();
          onChange?.(usjSelection);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, onChange],
  );

  return null;
}
