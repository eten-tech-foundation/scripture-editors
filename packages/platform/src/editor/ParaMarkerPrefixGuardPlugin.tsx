import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { $isParaMarkerPrefix, LoggerBasic, ParaNode, PARA_MARKER_DEFAULT } from "shared";
import { ViewOptions } from "shared-react";

/**
 * Reverts a paragraph back to the default `\p` marker when the user deletes the visible
 * USFM-marker label (e.g. `\s2`, `\q1`) at the start of the paragraph.
 *
 * In views that render a paragraph's marker as a visible node — either inline (markerMode
 * "editable"/"visible") or in the gutter (`hasGutterParaMarkers`) — the adaptor injects that
 * marker as the first child of every non-`\p` paragraph. That visible marker is the only
 * thing the user can directly select and delete to act on the paragraph's type, so when it
 * disappears we read that as "make this a plain paragraph" and rewrite the paragraph's
 * marker to `\p`. The plugin is a no-op in views that don't render the marker (markerMode
 * "hidden" without a gutter), since the user never has the affordance to delete one.
 *
 * In editable marker mode the MarkerEditPlugin owns marker-deletion semantics (merge into
 * the previous paragraph, spec §5.5), so this guard stands down there.
 */
export function ParaMarkerPrefixGuardPlugin({
  viewOptions,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled =
    viewOptions?.markerMode === "visible" || (viewOptions?.hasGutterParaMarkers ?? false);

  useEffect(() => {
    if (!isEnabled) return;
    return editor.registerNodeTransform(ParaNode, (para) =>
      $resetMarkerIfPrefixDeleted(para, logger),
    );
  }, [editor, isEnabled, logger]);

  return null;
}

/**
 * Resets `para`'s marker to `\p` if it's a non-default paragraph whose first child is no
 * longer the visible USFM-marker node the adaptor injected.
 *
 * `createPara` (usj-editor.adaptor.ts) always injects that visible marker as the first
 * child of every paragraph in views that render one, so a non-default paragraph that has
 * content but no marker as its first child must have had it deleted by the user — and the
 * marker is the only direct affordance the user has for the paragraph's type, so deleting
 * it reads as "revert to default." Empty paragraphs are skipped because they're a transient
 * state during edits (e.g. select-all-then-type before the new content lands) where the
 * marker is also missing without user intent to demote the paragraph.
 *
 * The optional logger surfaces this: in normal use it fires when the user deletes a marker
 * on purpose, so the debug line is just informational. If it fires on initial document
 * load (before any typing), the adaptor failed to inject a marker for this paragraph type
 * — that is the bug to chase.
 */
export function $resetMarkerIfPrefixDeleted(para: ParaNode, logger?: LoggerBasic): void {
  if (para.getMarker() === PARA_MARKER_DEFAULT) return;
  if (para.isEmpty()) return;
  if ($isParaMarkerPrefix(para.getFirstChild())) return;
  logger?.debug(
    `[ParaMarkerPrefixGuard] Resetting paragraph "${para.getMarker()}" → "${PARA_MARKER_DEFAULT}" (key ${para.getKey()})`,
  );
  para.setMarker(PARA_MARKER_DEFAULT);
}
