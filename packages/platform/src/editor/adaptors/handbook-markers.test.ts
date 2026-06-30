import { describe, expect, it } from "vitest";
import { HANDBOOK_VALID_MARKERS } from "./handbook-markers";

describe("HANDBOOK_VALID_MARKERS", () => {
  it("includes representative handbook-only markers", () => {
    expect(HANDBOOK_VALID_MARKERS).toContain("app");
    expect(HANDBOOK_VALID_MARKERS).toContain("abb");
  });

  it("is a non-trivial, de-duplicated set", () => {
    expect(HANDBOOK_VALID_MARKERS.length).toBeGreaterThan(100);
    expect(new Set(HANDBOOK_VALID_MARKERS).size).toBe(HANDBOOK_VALID_MARKERS.length);
  });
});
