import { LexicalEditor } from "lexical";
import { registerFocusableGrafts } from "./registerFocusableGrafts";

export function registerDefaultPerfHandlers(editor: LexicalEditor) {
  registerFocusableGrafts(editor);
}
