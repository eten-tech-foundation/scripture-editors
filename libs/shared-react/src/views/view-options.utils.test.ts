import { getViewOptions, getViewMode, getVerseNodeClass, ViewOptions } from "./view-options.utils";
import {
  FORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  viewModeToViewNames,
} from "./view-mode.model";
import { VerseNode } from "shared";

describe("standard view mode", () => {
  it("maps 'standard' to editable markers with collapsed notes and formatting", () => {
    expect(getViewOptions(STANDARD_VIEW_MODE)).toEqual({
      markerMode: "editable",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
    });
  });

  it("inverts standard view options back to the 'standard' mode", () => {
    const viewOptions = getViewOptions(STANDARD_VIEW_MODE);
    expect(getViewMode(viewOptions)).toBe(STANDARD_VIEW_MODE);
  });

  it("keeps getViewMode invertible for all named modes", () => {
    for (const mode of [
      FORMATTED_VIEW_MODE,
      UNFORMATTED_VIEW_MODE,
      PARAGRAPH_STRUCTURE_VIEW_MODE,
      STANDARD_VIEW_MODE,
    ] as const) {
      expect(getViewMode(getViewOptions(mode))).toBe(mode);
    }
  });

  it("has a display name", () => {
    expect(viewModeToViewNames[STANDARD_VIEW_MODE]).toBe("Standard");
  });

  it("uses the editable VerseNode class in standard view", () => {
    expect(getVerseNodeClass(getViewOptions(STANDARD_VIEW_MODE))).toBe(VerseNode);
  });

  it("does not misclassify unformatted as standard", () => {
    const unformatted: ViewOptions | undefined = getViewOptions(UNFORMATTED_VIEW_MODE);
    expect(getViewMode(unformatted)).toBe(UNFORMATTED_VIEW_MODE);
  });
});
