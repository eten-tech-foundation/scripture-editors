import { mergeRegister } from "@lexical/utils";
import {
  $getPreviousSelection,
  $getSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $getCursorSelectionContext, CursorPosition } from "../utils/CursorSelectionContext";
import { CURSOR_PLACEHOLDER_CHAR } from "../utils/constants";
import { $removeCursorPlaceholder } from "../utils";

export function registerCursorRemoval(
  editor: LexicalEditor,
  editorUpdate: (update: (() => void) | (() => void), tag?: string) => void,
) {
  const unregisterCursorRemovalHandlers = mergeRegister(
    registerCursorRemovalOnEditorBlur(),
    registerCursorRemovalOnTextTransform(),
    registerCursorRemovalOnSelectionChange(),
  );

  function registerCursorRemovalOnEditorBlur(): () => void {
    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        const editorSate = editor.getEditorState();
        editorSate.read(() => {
          const selection = $getSelection();
          if (!selection) return false;
          const selectionData = $getCursorSelectionContext(selection);
          if (!selectionData) return false;

          const node = selectionData.node;
          const textContent = node.getTextContent();
          if (textContent.includes(CURSOR_PLACEHOLDER_CHAR)) {
            editorUpdate(() => {
              $removeCursorPlaceholder(node);
            });
          }
        });
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }

  function registerCursorRemovalOnSelectionChange(): () => void {
    return editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyLeaves, dirtyElements, tags }) => {
        if (tags.has("history-merge")) return;

        const previousSelectionData = prevEditorState.read(() =>
          $getCursorSelectionContext($getSelection()),
        );
        // Skip if there's no previous selection or if there are dirty nodes
        if (!previousSelectionData || dirtyLeaves.size > 0 || dirtyElements.size > 0) return;

        editorState.read(() => {
          const currentSelectionData = $getCursorSelectionContext($getSelection());
          if (!currentSelectionData) return;

          // Helper function to remove placeholder characters from a node
          const removePlaceholders = (data: ReturnType<typeof $getCursorSelectionContext>) => {
            if (data?.placeholders.count) {
              editorUpdate(() => {
                $removeCursorPlaceholder(data.node);
              });
            }
          };

          // Remove placeholders from the current node
          removePlaceholders(currentSelectionData);

          // If the selection has moved to a different node, remove placeholders from the previous node
          if (currentSelectionData.node.getKey() !== previousSelectionData.node.getKey()) {
            removePlaceholders(previousSelectionData);
          }
        });
      },
    );
  }

  function registerCursorRemovalOnTextTransform(): () => void {
    return editor.registerNodeTransform(TextNode, (node) => {
      const textContent = node.getTextContent();
      const previousSelectionData = $getCursorSelectionContext($getPreviousSelection());
      if (!previousSelectionData) return;
      const helperOffset = textContent.indexOf(CURSOR_PLACEHOLDER_CHAR);
      if (helperOffset === -1) return;
      if (previousSelectionData.node.getKey() !== node.getKey()) return;
      if (previousSelectionData.cursor.position === CursorPosition.Start) {
        const currentSelectionData = $getCursorSelectionContext($getSelection());
        if (!currentSelectionData) return;
        const { selection } = currentSelectionData;
        const anchorOffset = selection.anchor.offset;
        const focusOffset = selection.focus.offset;
        $removeCursorPlaceholder(node);
        if (helperOffset < focusOffset) {
          node.select(anchorOffset - 1, focusOffset - 1);
        }
      }
    });
  }

  return unregisterCursorRemovalHandlers;
}
