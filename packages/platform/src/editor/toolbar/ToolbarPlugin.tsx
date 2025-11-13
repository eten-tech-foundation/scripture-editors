/**
 * Adapted from @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/ToolbarPlugin/index.tsx
 */

import { EditorRef } from "../editor.model";
import { BlockFormatDropDown } from "./BlockFormatDropDown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IS_APPLE } from "@lexical/utils";
import {
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
import { OnStateChange, StateChangePlugin } from "shared-react";

interface ToolbarPluginProps {
  editorRef: MutableRefObject<EditorRef | null>;
  isReadonly?: boolean;
  onStateChange?: OnStateChange;
}

function Divider(): ReactElement {
  return <div className="divider" />;
}

export const ToolbarPlugin = forwardRef<HTMLDivElement, ToolbarPluginProps>(function ToolbarPlugin(
  { editorRef, isReadonly = false, onStateChange },
  ref,
): ReactElement {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockMarker, setBlockMarker] = useState<string | undefined>();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleStateChange: OnStateChange = useCallback(
    ({
      canUndo: nextCanUndo,
      canRedo: nextCanRedo,
      blockMarker: nextBlockMarker,
      contextMarker,
    }) => {
      setCanUndo(nextCanUndo);
      setCanRedo(nextCanRedo);
      setBlockMarker(nextBlockMarker);
      onStateChange?.({
        canUndo: nextCanUndo,
        canRedo: nextCanRedo,
        blockMarker: nextBlockMarker,
        contextMarker,
      });
    },
    [onStateChange],
  );

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return (
    <>
      <StateChangePlugin onStateChange={handleStateChange} />
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
    </>
  );
});
