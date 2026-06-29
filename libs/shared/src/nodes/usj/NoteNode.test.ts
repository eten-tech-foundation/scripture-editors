import { describe, expect, it } from "vitest";
import { NoteNode } from "./NoteNode.js";

describe("NoteNode.isValidMarker", () => {
  it("returns true for a built-in marker", () => {
    expect(NoteNode.isValidMarker("f")).toBe(true);
  });

  it("returns false for an unknown marker when no extra list is given", () => {
    expect(NoteNode.isValidMarker("app")).toBe(false);
  });

  it("returns true for a marker supplied via extraValidMarkers", () => {
    expect(NoteNode.isValidMarker("app", ["app"])).toBe(true);
  });
});
