import { $createNoteNode, getNoteKind, NoteNode } from "./NoteNode.js";
import { withEditor } from "./test.utils.js";
import { describe, expect, it } from "vitest";

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

  it("returns false for a marker not in the extra list", () => {
    expect(NoteNode.isValidMarker("app", ["other"])).toBe(false);
  });
});

// PT9 Standard view rule (Standard.xslt lines 446-449): footnote iff the style starts with `f` or
// `ef`; everything else — including custom note markers — is a cross-reference.
describe("getNoteKind", () => {
  it.each([["f"], ["fe"], ["ef"], ["efe"], ["fz"]])("classifies %s as footnote", (marker) => {
    expect(getNoteKind(marker)).toBe("footnote");
  });

  it.each([["x"], ["ex"], ["xot"], ["zfn"]])("classifies %s as crossref", (marker) => {
    expect(getNoteKind(marker)).toBe("crossref");
  });
});

describe("NoteNode data-note-kind stamping", () => {
  it.each([
    ["f", "footnote"],
    ["fe", "footnote"],
    ["x", "crossref"],
    ["zfn", "crossref"],
  ])("createDOM stamps a %s note with data-note-kind=%s", (marker, kind) => {
    withEditor([NoteNode], () => {
      const dom = $createNoteNode(marker, "+", true).createDOM();
      expect(dom.getAttribute("data-note-kind")).toBe(kind);
    });
  });

  it("updateDOM restamps data-note-kind when the marker changes family", () => {
    withEditor([NoteNode], () => {
      const before = $createNoteNode("f", "+", true);
      const dom = before.createDOM();
      expect(dom.getAttribute("data-note-kind")).toBe("footnote");
      const after = $createNoteNode("x", "+", true);
      expect(after.updateDOM(before, dom)).toBe(false);
      expect(dom.getAttribute("data-note-kind")).toBe("crossref");
    });
  });
});
