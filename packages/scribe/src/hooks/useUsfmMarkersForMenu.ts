import { LexicalEditor } from "lexical";
import { useMemo } from "react";
import { getMarker, GetMarkerAction, ScriptureReference } from "shared";

// getMarker() takes a marker string and gets its data from a usfm markers map object that is merged with overwrites that fit the PERF editor context.
// getMarkerAction() returns a function to generate a LexicalNode and insert it in the editor, this lexical node is a custom node made for the PERF editor
// NOTE: You can create your own typeahead plugin by creating your own getMarker() and getMarkerAction() functions adapted to your editor needs.
export default function useUsfmMarkersForMenu({
  scriptureReference,
  contextMarker,
  getMarkerAction,
  autoNumbering,
}: {
  scriptureReference: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: GetMarkerAction;
  autoNumbering?: boolean;
}) {
  const markersMenuItems = useMemo(() => {
    if (!contextMarker || !scriptureReference) return;
    const marker = getMarker(contextMarker);
    if (!marker?.children) return;

    return Object.values(marker.children).flatMap((markers) =>
      markers.map((marker) => {
        const markerData = getMarker(marker);
        const { action } = getMarkerAction(marker, markerData);
        return {
          name: marker,
          label: marker,
          description: markerData?.description ?? "",
          action: ({
            editor,
            newVerseRChapterNum,
            noteText,
          }: {
            editor: LexicalEditor;
            newVerseRChapterNum?: number;
            noteText?: string;
          }) => {
            action({
              editor,
              reference: scriptureReference,
              autoNumbering,
              newVerseRChapterNum,
              noteText,
            });
          },
        };
      }),
    );
  }, [autoNumbering, contextMarker, getMarkerAction, scriptureReference]);

  return { markersMenuItems };
}
