/**
 * Adapted from https://github.com/facebook/lexical/blob/d0456a81955bc6fef7cc7f87907f2a172d41bbf2/packages/lexical-react/src/LexicalOnChangePlugin.ts
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorState, LexicalEditor } from "lexical";
import { HISTORY_MERGE_TAG } from "lexical";
import { Op } from "quill-delta";
import { useLayoutEffect } from "react";

export function OnChangePlugin({
  ignoreHistoryMergeTagChange = true,
  ignoreSelectionChange = false,
  onChange,
}: {
  ignoreHistoryMergeTagChange?: boolean;
  ignoreSelectionChange?: boolean;
  onChange: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>, ops: Op[]) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    if (onChange) {
      return editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
          if (
            (ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
            (ignoreHistoryMergeTagChange && tags.has(HISTORY_MERGE_TAG)) ||
            prevEditorState.isEmpty()
          ) {
            return;
          }

          const ops: Op[] = [];
          onChange(editorState, editor, tags, ops);
        },
      );
    }
  }, [editor, ignoreHistoryMergeTagChange, ignoreSelectionChange, onChange]);

  return null;
}
