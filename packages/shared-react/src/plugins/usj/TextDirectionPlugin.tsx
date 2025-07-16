import { TextDirection } from "./text-direction.model";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import { getNodeElementTagName } from "shared/nodes/usj/node.utils";

export function TextDirectionPlugin({ textDirection }: { textDirection: TextDirection }): null {
  const [editor] = useLexicalComposerContext();
  useTextDirection(editor, textDirection);
  useArrowKeys(editor);
  return null;
}

function useTextDirection(editor: LexicalEditor, textDirection: TextDirection) {
  useEffect(() => {
    function updateTextDirection() {
      const rootElement = editor.getRootElement();
      if (!rootElement || textDirection === "auto") return;

      rootElement.dir = textDirection;
      const placeholderClassName = editor._config.theme.placeholder;
      const placeholderElement = document.getElementsByClassName(
        placeholderClassName,
      )[0] as HTMLElement;
      if (placeholderElement) placeholderElement.dir = textDirection;
    }

    updateTextDirection();
    return editor.registerUpdateListener(({ dirtyElements }) => {
      if (dirtyElements.size > 0) updateTextDirection();
    });
  }, [editor, textDirection]);
}

/**
 * Change the direction of the left and right arrow keys if the immediate text direction is
 * different than the property setting.
 * @param editor - The LexicalEditor instance used to access the DOM.
 */
function useArrowKeys(editor: LexicalEditor) {
  useEffect(() => {
    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;

      // Find the closest paragraph element
      const anchorNode = selection.anchor.getNode();
      const paragraphNode = $findMatchingParent(
        anchorNode,
        (node) => getNodeElementTagName(node, editor) === "p",
      );
      if (!paragraphNode) return false;

      // Get the DOM element corresponding to the paragraph node
      const paragraphElement = editor.getElementByKey(paragraphNode.getKey());
      if (!paragraphElement) return false;

      // Check if directions are different
      const inputDiv = paragraphElement.parentElement;
      const paragraphDir = paragraphElement.dir || "ltr";
      const inputDir = (inputDiv?.dir ?? "") || "ltr";
      if (!inputDiv || paragraphDir === inputDir) return false;

      // Move in the opposite direction
      const isBackward =
        (inputDiv.dir === "rtl" && event.key === "ArrowLeft") ||
        (inputDiv.dir === "ltr" && event.key === "ArrowRight");
      selection.modify("move", isBackward, "character");

      event.preventDefault();
      return true;
    };

    return editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH);
  }, [editor]);
}
