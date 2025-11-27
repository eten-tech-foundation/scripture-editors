import { TextDirection } from "./text-direction.model";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalEditor } from "lexical";
import { useEffect } from "react";

export function TextDirectionPlugin({ textDirection }: { textDirection: TextDirection }): null {
  const [editor] = useLexicalComposerContext();
  useTextDirection(editor, textDirection);
  return null;
}

function useTextDirection(editor: LexicalEditor, textDirection: TextDirection) {
  useEffect(() => {
    updateTextDirection(editor, textDirection);
    return editor.registerUpdateListener(({ dirtyElements }) => {
      if (dirtyElements.size > 0) updateTextDirection(editor, textDirection);
    });
  }, [editor, textDirection]);
}

function updateTextDirection(editor: LexicalEditor, textDirection: TextDirection) {
  if (textDirection === "auto") return;

  const rootElement = editor.getRootElement();
  if (rootElement) rootElement.dir = textDirection;

  const placeholderClassName = editor._config.theme.placeholder;
  const placeholderElement = document.getElementsByClassName(
    placeholderClassName,
  )[0] as HTMLElement;
  if (placeholderElement) placeholderElement.dir = textDirection;
}
