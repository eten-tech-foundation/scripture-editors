import { ScriptureReference } from "shared/utils/get-marker-action.model";
import { getUsfmMarkerAction } from "shared/utils/usfm/getUsfmMarkerAction";
import UsfmNodesMenuPlugin from "./UsfmNodesMenuPlugin";

export default function PerfNodesMenuPlugin({
  trigger,
  scriptureReference,
  contextMarker,
}: {
  trigger: string;
  scriptureReference: ScriptureReference;
  contextMarker: string;
}) {
  return (
    <UsfmNodesMenuPlugin
      trigger={trigger}
      scriptureReference={scriptureReference}
      contextMarker={contextMarker}
      getMarkerAction={getUsfmMarkerAction}
    />
  );
}
