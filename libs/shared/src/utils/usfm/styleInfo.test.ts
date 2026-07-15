import getMarker from "./getMarker.js";
import { createMarkerLookup, StyleInfo } from "./styleInfo.js";
import { CategoryType, MarkerType } from "./usfmTypes.js";
import { describe, expect, it } from "vitest";

const projectStyleInfo: StyleInfo = {
  defaultFont: "Charis SIL",
  defaultFontSize: 12,
  markers: {
    p: { marker: "p", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    zln: {
      marker: "zln",
      styleType: "character",
      endMarker: "zln*",
      description: "Custom link",
    },
    "qt1-s": { marker: "qt1-s", styleType: "milestone", endMarker: "qt1-e" },
    f: { marker: "f", styleType: "note", endMarker: "f*" },
  },
};

describe("createMarkerLookup", () => {
  it("returns the bundled getMarker when no styleInfo is given", () => {
    expect(createMarkerLookup(undefined)).toBe(getMarker);
  });

  it("classifies by project styleType, not the bundled table", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.type).toBe(MarkerType.Paragraph);
    expect(lookup("zln")?.type).toBe(MarkerType.Character);
    expect(lookup("zln")?.hasEndMarker).toBe(true);
    expect(lookup("qt1-s")?.type).toBe(MarkerType.Milestone);
    expect(lookup("f")?.type).toBe(MarkerType.Note);
  });

  it("returns undefined for markers absent from the project sheet (sheet is authoritative)", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    // `s1` exists in the bundled table but not in this project sheet.
    expect(lookup("s1")).toBeUndefined();
  });

  it("takes category from the bundled table when known, else Uncategorized", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.category).toBe(CategoryType.Paragraphs);
    expect(lookup("zln")?.category).toBe(CategoryType.Uncategorized);
  });

  it("defaults description to empty string", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.description).toBe("");
    expect(lookup("zln")?.description).toBe("Custom link");
  });

  it("memoizes: a repeated lookup returns the same built object without rebuilding", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    const first = lookup("zln");
    const second = lookup("zln");
    // Each miss builds a fresh Marker object literal, so identity would break on a rebuild.
    // Same reference proves the second call hit the `cache.has(marker)` cached-return branch.
    expect(second).toBe(first);
  });
});
