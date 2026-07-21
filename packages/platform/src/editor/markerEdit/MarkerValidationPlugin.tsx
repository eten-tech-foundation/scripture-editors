import { $validateDocument, MarkerValidity } from "./markerValidation.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { NodeKey } from "lexical";
import { useEffect } from "react";
import { defaultStyleInfo, LoggerBasic, StyleInfo } from "shared";
import { ViewOptions } from "shared-react";

const STATUS_CLASSES = ["status_unknown", "status_invalid"] as const;

/**
 * Marker validation decoration. Runs a
 * PT9-ValidateUsxStyles-shaped full-document pass after every committed update
 * and decorates marker glyph DOM elements with status_unknown/status_invalid.
 * Validity is DERIVED, VIEW-ONLY state: it lives in this plugin and the DOM,
 * never in the editor document (no undo pollution, no serialization, no collab
 * deltas). Classes are (re)applied for every entry each pass, so reconciler
 * DOM re-creation self-heals; removal is diffed against the previous pass.
 *
 * PT9 revalidates the whole visible text on every reformat; this pass is a
 * cheap read-only walk (chapter-sized documents), so it runs unconditionally
 * per commit rather than trying to prove marker-neutrality of an edit.
 */
export function MarkerValidationPlugin({
  viewOptions,
  styleInfo,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  styleInfo?: StyleInfo;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled) return;
    const effectiveStyleInfo = styleInfo ?? defaultStyleInfo;
    let decorated = new Map<NodeKey, MarkerValidity>();

    const applyPass = () => {
      if (editor.isComposing()) return; // next commit after composition covers it
      editor.getEditorState().read(() => {
        const next = $validateDocument(effectiveStyleInfo);
        for (const [key] of decorated) {
          if (next.has(key)) continue;
          const element = editor.getElementByKey(key);
          if (element) element.classList.remove(...STATUS_CLASSES);
        }
        for (const [key, validity] of next) {
          const element = editor.getElementByKey(key);
          if (!element) continue;
          element.classList.toggle("status_unknown", validity === "unknown");
          element.classList.toggle("status_invalid", validity === "invalid");
        }
        decorated = next;
        logger?.debug(`[MarkerValidation] pass: ${next.size} flagged`);
      });
    };

    applyPass(); // initial pass: covers setEditorState loads (no transforms fire there)
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      applyPass();
    });
    return () => {
      unregister();
      // Leave no stale decoration behind when the plugin unmounts or styleInfo changes.
      for (const [key] of decorated)
        editor.getElementByKey(key)?.classList.remove(...STATUS_CLASSES);
    };
  }, [editor, isEnabled, styleInfo, logger]);

  return null;
}
