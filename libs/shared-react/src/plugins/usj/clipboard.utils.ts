import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
} from "lexical";

function cleanupText(text: string): string {
  return text.replaceAll("\t", " ");
}

/**
 * Whether the selection holds content a copy could put on the clipboard: one exists and covers
 * something. A collapsed caret — or no selection at all — does not.
 *
 * Reads the ACTIVE editor state, so it must be called inside an update or a command listener. That
 * is the whole point: the committed state is a microtask behind, so a selection made earlier in the
 * same tick is invisible to `editor.getEditorState().read()` — a `copy()` right after a
 * programmatic select would read "nothing selected" and silently do nothing.
 */
export function $hasCopyableSelection(): boolean {
  const selection = $getSelection();
  return !!selection && !selection.isCollapsed();
}

/**
 * Stops a copy or cut that has nothing to copy, wherever it was dispatched from.
 *
 * A copy with no clipboard event of its own — the keyboard shortcuts below, the context menu's
 * Cut/Copy, an editor-ref `copy()` call — has to have one synthesized before anything can be
 * written: `@lexical/clipboard` appends a hidden placeholder element to the editor, points the DOM
 * selection at it, and runs `document.execCommand("copy")` to provoke a real clipboard event it can
 * fill in. With nothing selected, that filling step declines — and declines BEFORE suppressing the
 * browser's own copy — so the browser copies what it was pointed at, the placeholder, and the user
 * loses whatever the clipboard already held to a character that was never in the document.
 *
 * So the command is CLAIMED here and does nothing, which is what copying an empty selection means.
 * The guard lives on the command rather than in front of each dispatch for two reasons: a command
 * listener runs inside the update, where the selection is authoritative for both pending and
 * committed state, and every dispatcher is covered by the one registration.
 *
 * Registered at `COMMAND_PRIORITY_LOW` — above `@lexical/rich-text`'s own copy/cut fallback at
 * EDITOR, which is the thing that synthesizes the event, and below every feature handler, so a view
 * with its own clipboard payload (Standard view's USFM copy) still claims first and this never runs.
 */
export function registerEmptyCopyGuard(editor: LexicalEditor): () => void {
  const $claimWhenNothingToCopy = () => !$hasCopyableSelection();
  return mergeRegister(
    editor.registerCommand(COPY_COMMAND, $claimWhenNothingToCopy, COMMAND_PRIORITY_LOW),
    editor.registerCommand(CUT_COMMAND, $claimWhenNothingToCopy, COMMAND_PRIORITY_LOW),
  );
}

/** Copies the selection. Dispatched unconditionally; an empty selection copies nothing because
 * {@link registerEmptyCopyGuard} claims the command, not because the dispatch is withheld. */
export const copySelection = (editor: LexicalEditor) => {
  editor.dispatchCommand(COPY_COMMAND, null);
};

/** Cuts the selection, under the same guard as {@link copySelection} — a cut copies first, so it
 * reaches the identical synthesized-copy path. */
export const cutSelection = (editor: LexicalEditor) => {
  editor.dispatchCommand(CUT_COMMAND, null);
};

export const pasteSelection = (editor: LexicalEditor) => {
  navigator.clipboard.read().then(async (items) => {
    const permission = await navigator.permissions.query({
      // @ts-expect-error These types are incorrect.
      name: "clipboard-read",
    });
    if (permission.state === "denied") {
      alert("Not allowed to paste from clipboard.");
      return;
    }

    const data = new DataTransfer();
    const item = items[0];
    for (const type of item.types) {
      const dataString = await (await item.getType(type)).text();
      data.setData(type, cleanupText(dataString));
    }

    const event = new ClipboardEvent("paste", {
      clipboardData: data,
    });
    editor.dispatchCommand(PASTE_COMMAND, event);
  });
};

export const pasteSelectionAsPlainText = (editor: LexicalEditor) => {
  navigator.clipboard.read().then(async () => {
    const permission = await navigator.permissions.query({
      // @ts-expect-error These types are incorrect.
      name: "clipboard-read",
    });

    if (permission.state === "denied") {
      alert("Not allowed to paste from clipboard.");
      return;
    }

    const data = new DataTransfer();
    const text = await navigator.clipboard.readText();
    data.setData("text/plain", cleanupText(text));

    const event = new ClipboardEvent("paste", {
      clipboardData: data,
    });
    editor.dispatchCommand(PASTE_COMMAND, event);
  });
};
