import { GetMarkerAction, ScriptureReference } from "shared";
import useUsfmMarkersForMenu from "./PerfNodesItems/useUsfmMarkersForMenu";
import NodesMenu from "./NodesMenu";

export default function UsfmNodesMenuPlugin({
  trigger,
  scriptureReference,
  contextMarker,
  getMarkerAction,
}: {
  trigger: string;
  scriptureReference: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: GetMarkerAction;
}) {
  const { markersMenuItems } = useUsfmMarkersForMenu({
    scriptureReference,
    contextMarker,
    getMarkerAction,
  });

  return <NodesMenu trigger={trigger} items={markersMenuItems} />;
}
