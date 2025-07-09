/**
 * Inspired by code in @see https://github.com/facebook/lexical/
 */

import type { LexicalEditor } from "lexical";

import { registerOnChange } from "./";
import { useEffect } from "react";
import { UpdateListener } from "lexical/LexicalEditor";

export function useOnChange(editor: LexicalEditor, onChange: UpdateListener): void {
  useEffect(() => {
    return registerOnChange(editor, onChange);
  }, [onChange, editor]);
}
