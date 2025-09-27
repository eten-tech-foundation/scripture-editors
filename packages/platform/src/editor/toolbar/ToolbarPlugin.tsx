/**
 * Adapted from @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx
 */

import { EditorRef } from "../editor.model";
import { BlockFormatDropDown } from "./BlockFormatDropDown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, IS_APPLE, mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  forwardRef,
  MutableRefObject,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from "react";
import { $isBookNode, $isImmutableChapterNode, $isParaNode } from "shared";

interface ToolbarPluginProps {
  editorRef: MutableRefObject<EditorRef | null>;
  isReadonly?: boolean;
}

function Divider(): ReactElement {
  return <div className="divider" />;
}

export const ToolbarPlugin = forwardRef<HTMLDivElement, ToolbarPluginProps>(function ToolbarPlugin(
  { editorRef, isReadonly = false },
  ref,
): ReactElement {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockMarker, setBlockMarker] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const $updateToolbar = useCallback(() => {
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
      )
        setBlockMarker(node.getMarker());
    }
  }, [activeEditor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        $updateToolbar();
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      activeEditor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateToolbar, activeEditor, editor]);

  return (
    <div className="toolbar">
      <button
        disabled={!canUndo || isReadonly}
        onClick={() => {
          activeEditor.dispatchCommand(UNDO_COMMAND, undefined);
        }}
        title={IS_APPLE ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
        type="button"
        className="toolbar-item spaced"
        aria-label="Undo"
      >
        <i className="format undo" />
      </button>
      <button
        disabled={!canRedo || isReadonly}
        onClick={() => {
          activeEditor.dispatchCommand(REDO_COMMAND, undefined);
        }}
        title={IS_APPLE ? "Redo (⌘Y)" : "Redo (Ctrl+Y)"}
        type="button"
        className="toolbar-item"
        aria-label="Redo"
      >
        <i className="format redo" />
      </button>
      <Divider />
      {activeEditor === editor && (
        <>
          <BlockFormatDropDown
            editorRef={editorRef}
            blockMarker={blockMarker}
            disabled={isReadonly}
          />
          <Divider />
        </>
      )}
      <div ref={ref} className="end-container"></div>
    </div>
  );
});
