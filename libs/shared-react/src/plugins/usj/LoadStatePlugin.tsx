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
  onLoadingChange,
  logger,
}: {
  scripture?: unknown;
  scriptureRef?: RefObject<unknown>;
  nodeOptions?: NodeOptions;
  editorAdaptor: EditorAdaptor;
  viewOptions?: unknown;
  /**
   * Called `true` when a load starts and `false` once it settles — committed, skipped (nothing to
   * serialize), or failed. Calls are always balanced, so a caller may count them, and `false` is
   * never reported before the loaded document is live. Use it to defer work that has to address
   * the loaded content.
   *
   * Must be referentially stable (e.g. `useCallback` with stable dependencies): it is a dependency
   * of the load effect, so a fresh identity each render would reload the document each render.
   */
  onLoadingChange?: (isLoading: boolean) => void;
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

    onLoadingChange?.(true);
    // Every exit from this effect must report `false` exactly once, including a throw out of the
    // adaptor — otherwise a caller that gates work on the load waits forever.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      onLoadingChange?.(false);
    };
    // Set once the commit path owns settling (it reports from its own microtask, after the
    // loaded document is live); until then the `finally` below is responsible.
    let settlesAfterCommit = false;

    try {
      editorAdaptor.reset?.();
      const serializedEditorState = editorAdaptor.serializeEditorState(
        currentScripture,
        viewOptions,
      );
      if (serializedEditorState == null) {
        logger?.warn(
          "LoadStatePlugin: serializedEditorState was null or undefined. Skipping editor update.",
        );
        return;
      }

      const editorState = editor.parseEditorState(serializedEditorState);
      settlesAfterCommit = true;
      // Use queueMicrotask to defer the editor update outside of React's lifecycle,
      // preventing flushSync warnings when this is triggered by a parent component update
      queueMicrotask(() => {
        try {
          editor.update(
            () => {
              editor.setEditorState(editorState);
              editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
            },
            { tag: EXTERNAL_USJ_MUTATION_TAG },
          );
          // Deliberately NOT the update's `onUpdate` option: `setEditorState` runs an intermediate
          // commit of the OUTGOING state from inside the update, and that commit drains Lexical's
          // deferred callbacks — so `onUpdate` fires while the old document is still installed.
          // Lexical schedules the real commit with its own microtask before `update` returns, so a
          // microtask queued here lands strictly after the loaded document is live.
          queueMicrotask(settle);
        } catch {
          logger?.error("LoadStatePlugin: error setting editor state.");
          settle();
        }
      });
    } catch {
      logger?.error("LoadStatePlugin: error parsing or setting editor state.");
    } finally {
      // Covers the early return and any throw; the committed path settles from its own microtask.
      if (!settlesAfterCommit) settle();
    }
  }, [editor, editorAdaptor, logger, onLoadingChange, scripture, scriptureRef, viewOptions]);

  return null;
}
