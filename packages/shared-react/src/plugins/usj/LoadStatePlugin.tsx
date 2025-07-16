import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CLEAR_HISTORY_COMMAND } from "lexical";
import { useEffect } from "react";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import { EditorAdaptor, NodeOptions } from "shared/adaptors/editor-adaptor.model";
import { EXTERNAL_USJ_MUTATION_TAG } from "shared/nodes/usj/node-constants";

/**
 * A plugin component that updates the state of the lexical editor when incoming Scripture changes.
 * @param props.scripture - Scripture data.
 * @param props.nodeOptions - Options for each node.
 * @param props.editorAdaptor - Editor adaptor.
 * @param props.viewOptions - View options of the editor.
 * @param props.logger - Logger instance.
 * @returns null, i.e. no DOM elements.
 */
export function LoadStatePlugin<TLogger extends LoggerBasic>({
  scripture,
  nodeOptions,
  editorAdaptor,
  viewOptions,
  logger,
}: {
  scripture?: unknown;
  nodeOptions?: NodeOptions;
  editorAdaptor: EditorAdaptor;
  viewOptions?: unknown;
  logger?: TLogger;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorAdaptor.initialize?.(nodeOptions, logger);
  }, [editorAdaptor, logger, nodeOptions]);

  useEffect(() => {
    editorAdaptor.reset?.();
    const serializedEditorState = editorAdaptor.serializeEditorState(scripture, viewOptions);
    if (serializedEditorState == null) {
      logger?.warn(
        "LoadStatePlugin: serializedEditorState was null or undefined. Skipping editor update.",
      );
      return;
    }

    try {
      const editorState = editor.parseEditorState(serializedEditorState);
      editor.update(
        () => {
          editor.setEditorState(editorState);
          editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
        },
        { tag: EXTERNAL_USJ_MUTATION_TAG },
      );
    } catch {
      logger?.error("LoadStatePlugin: error parsing or setting editor state.");
    }
  }, [editor, editorAdaptor, logger, scripture, viewOptions]);

  return null;
}
