import { ImmutableVerseNode } from "../nodes/usj/ImmutableVerseNode";
import {
  BLOCK_VERSE_VIEW_MODE,
  FORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  ViewMode,
  viewModeToViewNames,
} from "./view-mode.model";
import {
  getDefaultViewMode,
  getVerseNodeClass,
  getViewClassList,
  getViewMode,
  getViewOptions,
  hasStandardViewWhitespace,
  ViewOptions,
} from "./view-options.utils";
import { VerseNode } from "shared";

/** Every view mode the package knows about. New modes join these tests automatically. */
const allViewModes = Object.keys(viewModeToViewNames) as ViewMode[];

describe("getViewOptions", () => {
  // These literals are pinned deliberately. Every consumer's editor state derives from them, so a
  // change here is a change to what every existing caller renders - it should never happen as a
  // side effect of adding a new mode.
  it("returns the pinned formatted options", () => {
    expect(getViewOptions(FORMATTED_VIEW_MODE)).toEqual({
      markerMode: "hidden",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
    });
  });

  it("returns the pinned unformatted options", () => {
    expect(getViewOptions(UNFORMATTED_VIEW_MODE)).toEqual({
      markerMode: "editable",
      noteMode: "expanded",
      hasSpacing: false,
      isFormattedFont: false,
    });
  });

  it("returns the pinned paragraph structure options", () => {
    expect(getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE)).toEqual({
      markerMode: "hidden",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
      hasGutterParaMarkers: true,
      hasActiveTextFocusBox: true,
    });
  });

  it("returns the pinned standard options", () => {
    expect(getViewOptions(STANDARD_VIEW_MODE)).toEqual({
      markerMode: "editable",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
    });
  });

  it("returns the pinned block verse options", () => {
    expect(getViewOptions(BLOCK_VERSE_VIEW_MODE)).toEqual({
      markerMode: "hidden",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
      verseLayout: "block",
    });
  });

  // Block verse differs from formatted only by `verseLayout`, so that field is what keeps the two
  // modes distinguishable in both directions.
  it("distinguishes block verse from formatted by verse layout alone", () => {
    expect(getViewOptions(BLOCK_VERSE_VIEW_MODE)).toEqual({
      ...getViewOptions(FORMATTED_VIEW_MODE),
      verseLayout: "block",
    });
  });

  it("falls back to the default view mode when the view mode is undefined", () => {
    expect(getViewOptions()).toEqual(getViewOptions(getDefaultViewMode()));
  });

  it("returns undefined for an unrecognized view mode", () => {
    expect(getViewOptions("not-a-view-mode")).toBeUndefined();
  });
});

describe("getViewMode", () => {
  it.each(allViewModes)("round-trips '%s' back through getViewOptions", (viewMode) => {
    expect(getViewMode(getViewOptions(viewMode))).toBe(viewMode);
  });

  // The round-trip above resolves each mode by comparison, so two modes sharing an options object
  // would make one of them unreachable. Catch that at the source rather than as a confusing
  // round-trip failure.
  it("gives every view mode a distinct options object", () => {
    allViewModes.forEach((viewMode, index) => {
      allViewModes.slice(index + 1).forEach((otherViewMode) => {
        expect(getViewOptions(viewMode)).not.toEqual(getViewOptions(otherViewMode));
      });
    });
  });

  it("returns undefined for undefined view options", () => {
    expect(getViewMode(undefined)).toBeUndefined();
  });

  it("returns undefined for view options matching no mode", () => {
    const viewOptions: ViewOptions = {
      markerMode: "visible",
      hasSpacing: false,
      isFormattedFont: false,
    };

    expect(getViewMode(viewOptions)).toBeUndefined();
  });

  // Matching is exact. A mode's options that have since been tweaked describe a view that is not
  // that mode any more, so they resolve to no mode rather than to the one they started from.
  it.each([
    ["noteMode", { noteMode: "expanded" }],
    ["showCharMarkerTitles", { showCharMarkerTitles: false }],
  ] as const)(
    "returns undefined once %s diverges from the mode it came from",
    (_field, override) => {
      const formattedViewOptions = getViewOptions(FORMATTED_VIEW_MODE);
      if (!formattedViewOptions) throw new Error("formatted view options are not defined");
      const viewOptions: ViewOptions = { ...formattedViewOptions, ...override };

      expect(getViewMode(viewOptions)).toBeUndefined();
    },
  );
});

describe("viewModeToViewNames", () => {
  it("gives the standard view mode a display name", () => {
    expect(viewModeToViewNames[STANDARD_VIEW_MODE]).toBe("Standard");
  });
});

describe("getVerseNodeClass", () => {
  it.each([UNFORMATTED_VIEW_MODE, STANDARD_VIEW_MODE])(
    "returns VerseNode for the editable-marker '%s' view",
    (viewMode) => {
      expect(getVerseNodeClass(getViewOptions(viewMode))).toBe(VerseNode);
    },
  );

  it.each(["hidden", "visible"] as const)(
    "returns ImmutableVerseNode when markers are %s",
    (markerMode) => {
      const viewOptions: ViewOptions = { markerMode, hasSpacing: true, isFormattedFont: true };

      expect(getVerseNodeClass(viewOptions)).toBe(ImmutableVerseNode);
    },
  );

  it("returns ImmutableVerseNode for the block verse layout", () => {
    expect(getVerseNodeClass(getViewOptions(BLOCK_VERSE_VIEW_MODE))).toBe(ImmutableVerseNode);
  });

  // The layout is checked before the marker mode, so a block layout stays immutable even if a
  // caller hands it the editable marker mode that would otherwise select `VerseNode`.
  it("returns ImmutableVerseNode for a block layout even with editable markers", () => {
    const viewOptions: ViewOptions = {
      markerMode: "editable",
      hasSpacing: true,
      isFormattedFont: true,
      verseLayout: "block",
    };

    expect(getVerseNodeClass(viewOptions)).toBe(ImmutableVerseNode);
  });

  it("returns undefined without view options", () => {
    expect(getVerseNodeClass(undefined)).toBeUndefined();
  });
});

describe("getViewClassList", () => {
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
