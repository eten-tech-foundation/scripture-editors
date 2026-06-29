import { describe, expect, it } from "vitest";
import { ParaNode } from "./ParaNode.js";

describe("ParaNode.isValidMarker", () => {
  it("returns true for a built-in marker", () => {
    expect(ParaNode.isValidMarker("ip")).toBe(true);
  });

  it("returns false for an unknown marker when no extra list is given", () => {
    expect(ParaNode.isValidMarker("app")).toBe(false);
  });

  it("returns true for a marker supplied via extraValidMarkers", () => {
    expect(ParaNode.isValidMarker("app", ["app"])).toBe(true);
  });
});
