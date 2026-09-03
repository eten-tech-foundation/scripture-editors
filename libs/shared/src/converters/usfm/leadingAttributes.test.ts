/**
 * Pins for the vendored `leadingAttributes` slice — the declarative side of the
 * leading-attribute whitespace rule (see leadingAttributes.ts). The slice must track
 * paranext-core's markers map verbatim, so these pins freeze the exact relation a re-copy is
 * allowed to change deliberately, never silently.
 */
import { leadingAttributeNames } from "./leadingAttributes.js";

describe("leadingAttributeNames (vendored markers-map slice)", () => {
  it("declares the number for chapters and verses", () => {
    expect(leadingAttributeNames("c")).toEqual(["number"]);
    expect(leadingAttributeNames("v")).toEqual(["number"]);
  });

  it("declares the caller for the whole note-marker family", () => {
    for (const marker of ["ef", "efe", "ex", "f", "fe", "x"])
      expect(leadingAttributeNames(marker), marker).toEqual(["caller"]);
  });

  it("declares the code for the book id", () => {
    // Declarative coverage only: the editor renders the `\id CODE` glyph as an uneditable
    // DecoratorNode and keeps book bytes literal-by-policy (no settle scope), so no Tier-1 arm
    // consumes this entry today. It is vendored anyway because the slice mirrors the map
    // verbatim — dropping the one unconsumed row would turn a verbatim copy into a curated
    // list, the exact drift hazard the vendoring convention exists to avoid.
    expect(leadingAttributeNames("id")).toEqual(["code"]);
  });

  it("declares nothing for markers without the map field", () => {
    for (const marker of ["p", "nd", "ca", "cp", "va", "vp", "cat", "esb", "qt-s"])
      expect(leadingAttributeNames(marker), marker).toBeUndefined();
  });
});
