import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { UpdateListener } from "lexical/LexicalEditor";
import { useOnChange } from "./useOnChange";

export const OnChangePlugin = ({ onChange }: { onChange: UpdateListener }) => {
  const [editor] = useLexicalComposerContext();
  useOnChange(editor, onChange);
  return null;
};
