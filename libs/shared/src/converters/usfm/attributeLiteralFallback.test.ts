import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import type { MarkerObject } from "@eten-tech-foundation/scripture-utilities";

/**
 * An attribute list that does not parse cleanly stays LITERAL TEXT, whole — it is never partly
 * parsed. This matches Paratext 9, and more importantly it is the only lossless answer.
 *
 * USFM has no way to escape a quote inside an attribute value, so `gloss="st"uff"` is genuinely
 * ambiguous. The pair regex is global, so it used to match `gloss="st"` and then silently ignore
 * the leftover `uff"` — the document lost bytes nobody could see go. Refusing the whole list
 * instead keeps every byte on screen and in the file, where the author can see the problem and fix
 * it.
 *
 * The literal path itself is not new: `extractAttributes` already returns without touching content
 * when the parse yields nothing. What was missing was failing the parse rather than returning a
 * partial one.
 */
describe("an attribute list that does not fully parse stays literal", () => {
  /**
   * The first paragraph's only content item. Widened with an index signature because USJ carries
   * marker-specific attributes (`lemma`, `gloss`, …) that `MarkerObject` does not declare.
   */
  function only(usfm: string): MarkerObject & { [attribute: string]: unknown } {
    const [para] = usfmFragmentToUsjContent(usfm) as MarkerObject[];
    return para.content?.[0] as MarkerObject & { [attribute: string]: unknown };
  }

  it("keeps a stray quote's whole attribute run as text", () => {
    const span = only(`\\p \\w holy|lemma="things" gloss="st"uff"\\w*`);
    expect(span).toEqual({
      type: "char",
      marker: "w",
      content: [`holy|lemma="things" gloss="st"uff"`],
    });
  });

  it("keeps a stray quote in the FIRST attribute literal too", () => {
    const span = only(`\\p \\w holy|lemma="th"ings" gloss="stuff"\\w*`);
    expect(span.content).toEqual([`holy|lemma="th"ings" gloss="stuff"`]);
    expect(span.lemma).toBeUndefined();
    expect(span.gloss).toBeUndefined();
  });

  it("keeps trailing junk after a well-formed pair literal", () => {
    const span = only(`\\p \\w holy|lemma="things" oops\\w*`);
    expect(span.content).toEqual([`holy|lemma="things" oops`]);
    expect(span.lemma).toBeUndefined();
  });

  describe("still parses everything that is well formed", () => {
    it("one attribute", () => {
      expect(only(`\\p \\w holy|lemma="things"\\w*`)).toEqual({
        type: "char",
        marker: "w",
        content: ["holy"],
        lemma: "things",
      });
    });

    it("several attributes, with irregular spacing", () => {
      const span = only(`\\p \\w holy|lemma="things"   gloss="stuff"  \\w*`);
      expect(span.lemma).toBe("things");
      expect(span.gloss).toBe("stuff");
      expect(span.content).toEqual(["holy"]);
    });

    it("a value containing spaces and an equals sign", () => {
      const span = only(`\\p \\w holy|lemma="a b = c"\\w*`);
      expect(span.lemma).toBe("a b = c");
      expect(span.content).toEqual(["holy"]);
    });

    it("an EMPTY value, which is well formed and must keep parsing", () => {
      // Deliberately divergent from Paratext 9, which leaves this literal. An empty value is
      // unambiguous — the author wrote a present attribute with no value yet — so parsing it
      // preserves the bytes on both sides, which the literal fallback exists to protect.
      const span = only(`\\p \\w holy|lemma="things" gloss=""\\w*`);
      expect(span.lemma).toBe("things");
      expect(span.gloss).toBe("");
      expect(span.content).toEqual(["holy"]);
    });

    it("a bare default-attribute value", () => {
      expect(only(`\\p \\w holy|G5485\\w*`).lemma).toBe("G5485");
    });
  });
});
