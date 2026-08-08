import { corpusFixtures } from "./corpus-data";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../editor-usj.adaptor";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
} from "shared-react";

const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!standardViewOptions) throw new Error("standard view options not found");

// The named view modes, plus standard view with expanded notes — the combination that made
// getViewMode return undefined and silently disabled the standard-view whitespace machinery. The
// label doubles as the `skipModes` key prefix (`<label>: <reason>`).
const VIEW_CONFIGS: { label: string; viewOptions: ViewOptions | undefined }[] = [
  { label: STANDARD_VIEW_MODE, viewOptions: standardViewOptions },
  { label: FORMATTED_VIEW_MODE, viewOptions: getViewOptions(FORMATTED_VIEW_MODE) },
  { label: UNFORMATTED_VIEW_MODE, viewOptions: getViewOptions(UNFORMATTED_VIEW_MODE) },
  {
    label: PARAGRAPH_STRUCTURE_VIEW_MODE,
    viewOptions: getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
  },
  { label: "standard-expanded", viewOptions: { ...standardViewOptions, noteMode: "expanded" } },
];

describe("corpus round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize(undefined, undefined);
  });

  for (const fixture of corpusFixtures) {
    for (const { label, viewOptions } of VIEW_CONFIGS) {
      const skip = fixture.skipModes?.find((entry) => entry.startsWith(`${label}:`));
      const run = skip ? it.skip : it;
      run(`${fixture.name} [${label}]${skip ? ` (${skip})` : ""}`, () => {
        const usj = usxStringToUsj(fixture.usx);
        reset();
        initializeDeserialize(undefined);
        const editorState = serializeEditorState(usj, viewOptions);
        const roundTripped = deserializeSerializedEditorState(editorState, viewOptions);
        expect(roundTripped).toEqual(usj);
      });
    }
  }
});
