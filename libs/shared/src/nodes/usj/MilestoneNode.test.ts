import { describe, expect, it } from "vitest";
import { MilestoneNode } from "./MilestoneNode.js";

describe("MilestoneNode.isValidMarker", () => {
  it("returns true for a built-in marker", () => {
    expect(MilestoneNode.isValidMarker("ts-s")).toBe(true);
  });

  it("returns true for any z-prefixed marker without an extra list", () => {
    expect(MilestoneNode.isValidMarker("zfoo")).toBe(true);
  });

  it("returns false for an unknown non-z marker when no extra list is given", () => {
    expect(MilestoneNode.isValidMarker("app")).toBe(false);
  });

  it("returns true for a marker supplied via extraValidMarkers", () => {
    expect(MilestoneNode.isValidMarker("app", ["app"])).toBe(true);
  });

  it("returns false for a marker not in the extra list", () => {
    expect(MilestoneNode.isValidMarker("app", ["other"])).toBe(false);
  });
});
