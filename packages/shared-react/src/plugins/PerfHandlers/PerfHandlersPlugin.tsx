import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { usePerfHandlers } from "./usePerfHandlers";

export function PerfHandlersPlugin(): null {
  const [editor] = useLexicalComposerContext();
  usePerfHandlers(editor);
  return null;
}
