import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CLEAR_HISTORY_COMMAND } from "lexical";
import { RefObject, useEffect } from "react";
import { EditorAdaptor, EXTERNAL_USJ_MUTATION_TAG, LoggerBasic, NodeOptions } from "shared";

/**
 * A plugin component that updates the state of the lexical editor when incoming Scripture changes.
 * @param scripture - Scripture data.
 * @param scriptureRef - Optional ref to scripture data. If provided, reads from ref at update time
 *   to get the most current value (useful when options change triggers state updates).
 * @param nodeOptions - Options for each node.
 * @param editorAdaptor - Editor adaptor.
 * @param viewOptions - View options of the editor.
 * @param logger - Logger instance.
 * @returns null, i.e. no DOM elements.
 */
export function LoadStatePlugin<TLogger extends LoggerBasic>({
  scripture,
  scriptureRef,
  nodeOptions,
  editorAdaptor,
  viewOptions,
  logger,
}: {
  scripture?: unknown;
  scriptureRef?: RefObject<unknown>;
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
    // Read scripture from ref if available (to get latest value after state updates),
    // otherwise fall back to the prop value
    const currentScripture = scriptureRef?.current ?? scripture;

    editorAdaptor.reset?.();
    const serializedEditorState = editorAdaptor.serializeEditorState(currentScripture, viewOptions);
    if (serializedEditorState == null) {
      logger?.warn(
        "LoadStatePlugin: serializedEditorState was null or undefined. Skipping editor update.",
      );
      return;
    }

    try {
      const editorState = editor.parseEditorState(serializedEditorState);
      // Use queueMicrotask to defer the editor update outside of React's lifecycle,
      // preventing flushSync warnings when this is triggered by a parent component update
      queueMicrotask(() => {
        editor.update(
          () => {
            editor.setEditorState(editorState);
            editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
          },
          { tag: EXTERNAL_USJ_MUTATION_TAG },
        );
      });
    } catch {
      logger?.error("LoadStatePlugin: error parsing or setting editor state.");
    }
  }, [editor, editorAdaptor, logger, scripture, scriptureRef, viewOptions]);

  return null;
}
