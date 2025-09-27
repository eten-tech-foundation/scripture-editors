import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  CAN_REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
} from "lexical";
import { useRef, useEffect, useState, useCallback } from "react";
import { $isParaNode, $isBookNode, $isImmutableChapterNode } from "shared";

export type OnStateChange = (
  canUndo: boolean,
  canRedo: boolean,
  blockMarker: string | undefined,
) => void;

/** Plugin to track state and update parent component state */
export function StateChangePlugin({ onStateChange }: { onStateChange?: OnStateChange }): null {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const canUndoRef = useRef(false);
  const canRedoRef = useRef(false);
  const blockMarkerRef = useRef<string | undefined>();

  const $updateState = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      let node =
        anchorNode.getKey() === "root"
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (node === null) {
        node = anchorNode.getTopLevelElementOrThrow();
      }

      const nodeKey = node.getKey();
      const elementDOM = activeEditor.getElementByKey(nodeKey);

      if (
        elementDOM !== null &&
        ($isParaNode(node) || $isBookNode(node) || $isImmutableChapterNode(node))
      ) {
        blockMarkerRef.current = node.getMarker();
        onStateChange?.(canUndoRef.current, canRedoRef.current, blockMarkerRef.current);
      }
    }
  }, [activeEditor, onStateChange]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        $updateState();
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateState]);

  useEffect(() => {
    return mergeRegister(
      activeEditor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateState();
        });
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          canUndoRef.current = payload;
          onStateChange?.(canUndoRef.current, canRedoRef.current, blockMarkerRef.current);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          canRedoRef.current = payload;
          onStateChange?.(canUndoRef.current, canRedoRef.current, blockMarkerRef.current);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateState, activeEditor, onStateChange]);

  return null;
}
