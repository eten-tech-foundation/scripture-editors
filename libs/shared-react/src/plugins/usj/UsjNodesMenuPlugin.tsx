import UsfmNodesMenuPlugin from "../UsfmNodesMenuPlugin";
import { useMemo } from "react";
import { GetMarkerAction, ScriptureReference } from "shared";

export interface UsjNodesMenuPluginProps {
  trigger: string;
  scrRef: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: GetMarkerAction;
}

export function UsjNodesMenuPlugin({
  trigger,
  scrRef,
  contextMarker,
  getMarkerAction,
}: UsjNodesMenuPluginProps) {
  const { book, chapterNum, verseNum, verse, versificationStr } = scrRef;
  // Recompute when individual fields change without relying on scrRef identity.
  const scriptureReference = useMemo<ScriptureReference>(
    () => ({ book, chapterNum, verseNum, verse, versificationStr }),
    [book, chapterNum, verseNum, verse, versificationStr],
  );

  return (
    <UsfmNodesMenuPlugin
      trigger={trigger}
      scriptureReference={scriptureReference}
      contextMarker={contextMarker}
      getMarkerAction={getMarkerAction}
    />
  );
}
