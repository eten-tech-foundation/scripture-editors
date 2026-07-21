import {
  getViewOptions,
  getViewMode,
  getVerseNodeClass,
  getViewClassList,
  hasStandardViewWhitespace,
  ViewOptions,
} from "./view-options.utils";
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

  it("puts both marker-editable and formatted-font on the class list, so the PT9 marker CSS (scoped to .formatted-font.marker-editable) applies", () => {
    const classList = getViewClassList(getViewOptions(STANDARD_VIEW_MODE));
    expect(classList).toContain("marker-editable");
    expect(classList).toContain("formatted-font");
  });

  it("omits formatted-font in unformatted view, so the PT9 marker CSS does not apply there", () => {
    const classList = getViewClassList(getViewOptions(UNFORMATTED_VIEW_MODE));
    expect(classList).toContain("marker-editable");
    expect(classList).not.toContain("formatted-font");
  });
});

describe("standard-view whitespace gate", () => {
  it("applies to the named standard mode (editable, collapsed notes)", () => {
    expect(hasStandardViewWhitespace(getViewOptions(STANDARD_VIEW_MODE))).toBe(true);
  });

  it("applies to editable markers with EXPANDED notes (spaced + formatted)", () => {
    // The whole point of the gate: expanded notes are still standard-view text, so the whitespace
    // rules must stay on in lockstep with the editable marker engine.
    const standard = getViewOptions(STANDARD_VIEW_MODE);
    if (!standard) throw new Error("standard view options not found");
    expect(hasStandardViewWhitespace({ ...standard, noteMode: "expanded" })).toBe(true);
  });

  it("does NOT apply to unformatted view (editable but unspaced/unformatted)", () => {
    // Unformatted view is also editable + expanded, so the noteMode axis alone cannot separate it;
    // the hasSpacing/isFormattedFont guards keep the whitespace rules from leaking there.
    expect(hasStandardViewWhitespace(getViewOptions(UNFORMATTED_VIEW_MODE))).toBe(false);
  });

  it("does NOT apply to formatted or paragraph-structure view (hidden markers)", () => {
    expect(hasStandardViewWhitespace(getViewOptions(FORMATTED_VIEW_MODE))).toBe(false);
    expect(hasStandardViewWhitespace(getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE))).toBe(false);
  });

  it("does NOT apply when view options are undefined", () => {
    expect(hasStandardViewWhitespace(undefined)).toBe(false);
  });
});
