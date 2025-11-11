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
import {
  $getCommonAncestorCompatible,
  $isParaNode,
  $isBookNode,
  $isImmutableChapterNode,
} from "shared";
import { $isReactNodeWithMarker } from "../../nodes/usj/node-react.utils";

/**
 * Snapshot of externally used state.
 * @public
 */
export interface StateChangeSnapshot {
  /** Can undo the last change. */
  canUndo: boolean;
  /** Can redo the last undone change. */
  canRedo: boolean;
  /** The block marker that the current selection is contained in. A block is paragraph-like. */
  blockMarker: string | undefined;
  /** The actual marker of the current selection. */
  contextMarker: string | undefined;
}

/**
 * Callback for state changes
 * @public
 */
export type OnStateChange = (snapshot: StateChangeSnapshot) => void;

/** Plugin to track state and update parent component state */
export function StateChangePlugin({ onStateChange }: { onStateChange?: OnStateChange }): null {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const canUndoRef = useRef(false);
  const canRedoRef = useRef(false);
  const blockMarkerRef = useRef<string | undefined>();
  const contextMarkerRef = useRef<string | undefined>();

  const $updateState = useCallback(() => {
    const selection = $getSelection();
    let contextMarker: string | undefined;
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      const focusNode = selection.focus.getNode();
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

      const contextNode = $getCommonAncestorCompatible(anchorNode, focusNode);
      if (contextNode && $isReactNodeWithMarker(contextNode)) {
        contextMarker = contextNode.getMarker();
      }

      if (
        elementDOM !== null &&
        ($isParaNode(node) || $isBookNode(node) || $isImmutableChapterNode(node))
      ) {
        blockMarkerRef.current = node.getMarker();
        contextMarkerRef.current = contextMarker;
        onStateChange?.({
          canUndo: canUndoRef.current,
          canRedo: canRedoRef.current,
          blockMarker: blockMarkerRef.current,
          contextMarker,
        });
        return;
      }
    }

    contextMarkerRef.current = contextMarker;
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
          onStateChange?.({
            canUndo: canUndoRef.current,
            canRedo: canRedoRef.current,
            blockMarker: blockMarkerRef.current,
            contextMarker: contextMarkerRef.current,
          });
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          canRedoRef.current = payload;
          onStateChange?.({
            canUndo: canUndoRef.current,
            canRedo: canRedoRef.current,
            blockMarker: blockMarkerRef.current,
            contextMarker: contextMarkerRef.current,
          });
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateState, activeEditor, onStateChange]);

  return null;
}
