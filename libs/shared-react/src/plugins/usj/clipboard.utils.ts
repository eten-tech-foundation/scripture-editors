import { $getSelection, COPY_COMMAND, CUT_COMMAND, LexicalEditor, PASTE_COMMAND } from "lexical";

function cleanupText(text: string): string {
  return text.replaceAll("\t", " ");
}

/**
 * Whether the editor's selection holds content a copy could put on the clipboard: a selection
 * exists and covers something. A collapsed caret — or no selection at all — does not.
 *
 * This is the precondition for SYNTHESIZING a copy (see {@link copySelection}), not a general
 * "can the user copy" predicate: a real, browser-generated copy needs no such check because the
 * browser already knows an empty selection copies nothing.
 */
export function canCopySelection(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return !!selection && !selection.isCollapsed();
  });
}

/**
 * Copies the selection by dispatching `COPY_COMMAND` with no event of its own, and reports whether
 * it did. Callers that suppressed the browser's own copy to get here should suppress it only when
 * this returns `true`.
 *
 * Nothing is dispatched for a selection that cannot produce clipboard content. Without an event,
 * the copy has to be synthesized: `@lexical/clipboard` selects a hidden placeholder element it
 * appends to the editor and runs `document.execCommand("copy")` to provoke a real clipboard event
 * it can fill in. That filling step declines an empty selection — and declines it BEFORE
 * suppressing the browser's own copy — so the browser copies what it was pointed at, the
 * placeholder, and the user loses whatever the clipboard already held to a character that was
 * never in the document. Copying nothing must leave the clipboard alone, which is exactly what
 * not dispatching achieves.
 */
export const copySelection = (editor: LexicalEditor): boolean => {
  if (!canCopySelection(editor)) return false;
  editor.dispatchCommand(COPY_COMMAND, null);
  return true;
};

/** Cuts the selection, under the same "nothing selected, nothing dispatched" rule as
 * {@link copySelection} — a cut copies first, so it reaches the identical synthesized-copy path. */
export const cutSelection = (editor: LexicalEditor): boolean => {
  if (!canCopySelection(editor)) return false;
  editor.dispatchCommand(CUT_COMMAND, null);
  return true;
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
