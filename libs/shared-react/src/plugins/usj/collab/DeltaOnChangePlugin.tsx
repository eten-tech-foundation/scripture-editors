/**
 * Adapted from https://github.com/facebook/lexical/blob/d0456a81955bc6fef7cc7f87907f2a172d41bbf2/packages/lexical-react/src/LexicalOnChangePlugin.ts
 */

import { $getNodeOTPosition, DeltaOp } from "./delta-common.utils";
import { $getTextOp, getEditorDelta } from "./editor-delta.adaptor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorState, LexicalEditor, UpdateListenerPayload } from "lexical";
import { $getNodeByKey, $isTextNode, HISTORY_MERGE_TAG } from "lexical";
import Delta from "quill-delta";
import { useLayoutEffect } from "react";

/** Adapted from the LexicalOnChangePlugin to include collaborative editing operations. */
export function DeltaOnChangePlugin({
  ignoreHistoryMergeTagChange = true,
  ignoreSelectionChange = false,
  onChange,
}: {
  ignoreHistoryMergeTagChange?: boolean;
  ignoreSelectionChange?: boolean;
  onChange: (
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
    ops: DeltaOp[],
  ) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    if (!onChange) return;

    return editor.registerUpdateListener((payload) => {
      const { editorState, dirtyElements, dirtyLeaves, prevEditorState, tags } = payload;
      if (
        (ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
        (ignoreHistoryMergeTagChange && tags.has(HISTORY_MERGE_TAG)) ||
        prevEditorState.isEmpty()
      ) {
        return;
      }

      const ops = $getUpdateOps(editor, payload);
      // TODO: this may have been added because nodes are made dirty when they shouldn't be as a
      // result of NoteNode collapsing/expanding. If so, we should fix that instead.
      if (ops.length === 0) return;

      onChange(editorState, editor, tags, ops);
    });
  }, [editor, ignoreHistoryMergeTagChange, ignoreSelectionChange, onChange]);

  return null;
}

function $getUpdateOps(
  editor: LexicalEditor,
  { dirtyLeaves, prevEditorState }: UpdateListenerPayload,
): DeltaOp[] {
  let update = new Delta();
  editor.getEditorState().read(() => {
    const nodeKey = dirtyLeaves.values().next().value ?? "";
    if (dirtyLeaves.size === 1 && $isTextNode($getNodeByKey(nodeKey))) {
      // Handle the most common case of text changing in a single text node.
      const node = $getNodeByKey(nodeKey);
      const retain = $getNodeOTPosition(node);
      if ($isTextNode(node) && retain !== undefined) {
        const prevTextDoc = prevEditorState.read(() => {
          const prevNode = $getNodeByKey(nodeKey);
          return new Delta([$isTextNode(prevNode) ? $getTextOp(prevNode) : { insert: "" }]);
        });
        const textDoc = new Delta([$getTextOp(node)]);
        const nodePositionRetain = new Delta(retain > 0 ? [{ retain }] : []);
        update = update.concat(nodePositionRetain).concat(prevTextDoc.diff(textDoc));
      }
    } else {
      const prevDoc = getEditorDelta(prevEditorState);
      const currentDoc = getEditorDelta(editor.getEditorState());
      update = prevDoc.diff(currentDoc);
    }
  });
  return update.ops;
}
