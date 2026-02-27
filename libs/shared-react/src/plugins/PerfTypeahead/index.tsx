import { getUsfmMarkerAction, ScriptureReference } from "shared";
import useUsfmMarkersForMenu from "../PerfNodesItems/useUsfmMarkersForMenu";
import TypeaheadPlugin from "../Typeahead/TypeaheadPlugin";

export default function PerfTypeaheadPlugin({
  trigger,
  scriptureReference,
  contextMarker,
}: {
  trigger: string;
  scriptureReference: ScriptureReference;
  contextMarker: string;
}) {
  const { markersMenuItems } = useUsfmMarkersForMenu({
    scriptureReference,
    contextMarker,
    getMarkerAction: getUsfmMarkerAction,
  });

  return <TypeaheadPlugin trigger={trigger} items={markersMenuItems} />;
}
