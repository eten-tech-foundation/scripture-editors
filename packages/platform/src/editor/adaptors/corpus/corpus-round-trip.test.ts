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
import { HANDBOOK_VALID_MARKERS } from "../handbook-markers";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
} from "shared-react";

const VIEW_MODES = [
  STANDARD_VIEW_MODE,
  FORMATTED_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
] as const;

describe("corpus round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize({ extraValidMarkers: HANDBOOK_VALID_MARKERS }, undefined);
  });

  for (const fixture of corpusFixtures) {
    for (const viewMode of VIEW_MODES) {
      const skip = fixture.skipModes?.find((entry) => entry.startsWith(`${viewMode}:`));
      const run = skip ? it.skip : it;
      run(`${fixture.name} [${viewMode}]${skip ? ` (${skip})` : ""}`, () => {
        const usj = usxStringToUsj(fixture.usx);
        reset();
        initializeDeserialize(undefined, getViewOptions(viewMode));
        const editorState = serializeEditorState(usj, getViewOptions(viewMode));
        const roundTripped = deserializeSerializedEditorState(editorState);
        expect(roundTripped).toEqual(usj);
      });
    }
  }
});
