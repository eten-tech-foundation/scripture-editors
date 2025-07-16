import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLayoutEffect } from "react";

export function EditablePlugin({ isEditable }: { isEditable: boolean }): null {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editor.setEditable(isEditable);
  }, [editor, isEditable]);

  return null;
}
