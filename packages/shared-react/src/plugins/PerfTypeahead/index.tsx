import { ScriptureReference } from "shared/utils/get-marker-action.model";
import { getUsfmMarkerAction } from "shared/utils/usfm/getUsfmMarkerAction";
import useUsfmMakersForMenu from "../PerfNodesItems/useUsfmMarkersForMenu";
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
  const { markersMenuItems } = useUsfmMakersForMenu({
    scriptureReference,
    contextMarker,
    getMarkerAction: getUsfmMarkerAction,
  });

  return <TypeaheadPlugin trigger={trigger} items={markersMenuItems} />;
}
