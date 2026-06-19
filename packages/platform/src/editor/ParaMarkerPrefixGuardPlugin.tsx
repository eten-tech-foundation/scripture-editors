import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalNode } from "lexical";
import { useEffect } from "react";
import {
  $isImmutableTypedTextNode,
  $isMarkerNode,
  LoggerBasic,
  ParaNode,
  PARA_MARKER_DEFAULT,
} from "shared";
import { ViewOptions } from "shared-react";

/**
 * Resets a paragraph's marker to default when the user deletes its leading marker-prefix child.
 *
 * Only mounted in views that render a marker-prefix child (markerMode "editable"/"visible" or
 * `hasGutterParaMarkers`). In those views the prefix is the user's handle for the paragraph's
 * type, so removing it should revert the paragraph to a default `\p`.
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
    viewOptions?.markerMode === "editable" ||
    viewOptions?.markerMode === "visible" ||
    (viewOptions?.hasGutterParaMarkers ?? false);

  useEffect(() => {
    if (!isEnabled) return;
    return editor.registerNodeTransform(ParaNode, (para) =>
      $resetMarkerIfPrefixDeleted(para, logger),
    );
  }, [editor, isEnabled, logger]);

  return null;
}

/**
 * Resets the paragraph's marker to default when the marker-prefix child has been removed.
 *
 * Relies on the invariant that `createPara` (usj-editor.adaptor.ts) always injects a marker-prefix
 * child as the first child of every paragraph in markerPrefix views. Given that invariant, a
 * non-default paragraph that has content but no prefix as first child must have had its prefix
 * deleted by the user — the prefix is the user's handle for changing paragraph type. Empty
 * paragraphs are skipped because they're a transient state during edits (e.g. select-all-then-type
 * before the new content lands) where the prefix is also missing without user intent to retype.
 *
 * The optional logger is used to surface invariant violations: in normal use this fires when the
 * user deletes a marker prefix on purpose, so the debug line is informational. If it fires on
 * initial document load (before the user has typed anything), the adaptor failed to inject a
 * prefix for this paragraph type — that's the bug to chase.
 */
export function $resetMarkerIfPrefixDeleted(para: ParaNode, logger?: LoggerBasic): void {
  if (para.getMarker() === PARA_MARKER_DEFAULT) return;
  if (para.isEmpty()) return;
  const firstChild = para.getFirstChild();
  if (firstChild && $isParaMarkerPrefix(firstChild)) return;
  logger?.debug(
    `[ParaMarkerPrefixGuard] Resetting paragraph "${para.getMarker()}" → "${PARA_MARKER_DEFAULT}" (key ${para.getKey()})`,
  );
  para.setMarker(PARA_MARKER_DEFAULT);
}

/**
 * True for the paragraph-marker-prefix nodes the adaptor injects as the first child of a
 * `\p`-style paragraph: an `ImmutableTypedTextNode` with `textType: "marker"` in gutter /
 * markerMode "visible" views, or a `MarkerNode` in markerMode "editable" view.
 */
function $isParaMarkerPrefix(node: LexicalNode): boolean {
  if ($isMarkerNode(node)) return true;
  if ($isImmutableTypedTextNode(node)) return node.getTextType() === "marker";
  return false;
}
