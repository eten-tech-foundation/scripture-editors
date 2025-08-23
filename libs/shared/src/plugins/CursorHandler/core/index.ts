import { $addUpdateTag, LexicalEditor, LexicalNode } from "lexical";
import { mergeRegister } from "@lexical/utils";
import { registerCursorInsertion } from "./insertionHandlers/index.js";
import { registerCursorRemoval } from "./removalHandlers/index.js";

export { CURSOR_PLACEHOLDER_CHAR } from "./utils/constants.js";

export function registerCursorHandlers(
  editor: LexicalEditor,
  canHavePlaceholder: (node: LexicalNode) => boolean = () => true,
  updateTags?: string[],
) {
  function editorUpdate(update: (() => void) | (() => void), tag?: string) {
    const options = tag ? { tag: tag } : undefined;
    editor.update(() => {
      update();
      updateTags?.forEach((tag) => $addUpdateTag(tag));
    }, options);
  }

  const unRegisterCursorHandlers = mergeRegister(
    registerCursorRemoval(editor, editorUpdate),
    registerCursorInsertion(editor, canHavePlaceholder, editorUpdate),
  );

  return unRegisterCursorHandlers;
}
