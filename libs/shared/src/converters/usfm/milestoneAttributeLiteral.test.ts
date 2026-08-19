import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import type { MarkerObject } from "@eten-tech-foundation/scripture-utilities";

/**
 * A milestone whose attribute list will not parse keeps its bytes as literal text.
 *
 * This matters more for a milestone than for a char span, and it is why the refusal has to live in
 * `scanMilestone` as well: a char span has a `content` array that the literal `|…` run falls back
 * into, so refusing the parse there loses nothing. A milestone has no such array — building the
 * milestone anyway simply discards the attribute bytes, which is worse than the partial parse it
 * replaced. Refusing the whole token instead lets the tokenizer read the bytes as ordinary text.
 *
 * A bare `|` with nothing after it is deliberately excluded. It carries no bytes to lose, and
 * dropping it is the ratified reading for a `|` typed into a milestone glyph — the settle holds it
 * while the caret is there and then resolves to what the tokenizer says.
 */
describe("a milestone with an unparseable attribute list stays literal", () => {
  function content(usfm: string) {
    const [para] = usfmFragmentToUsjContent(usfm) as MarkerObject[];
    return para.content;
  }

  it.each([
    ["a stray quote", `\\p \\qt-s |gloss="st"uff"\\*text`, `\\qt-s |gloss="st"uff"`],
    [
      "a stray quote beside a good pair",
      `\\p \\qt-s |sid="a" who="b"c"\\*text`,
      `\\qt-s |sid="a" who="b"c"`,
    ],
    ["an empty value", `\\p \\qt-s |who=""\\*text`, `\\qt-s |who=""`],
  ])("keeps the bytes for %s", (_label, usfm, literal) => {
    const items = content(usfm);
    // No milestone was built, and the author's bytes are all still there as text.
    expect(items?.some((item) => (item as MarkerObject)?.type === "ms")).toBe(false);
    expect(items?.[0]).toBe(literal);
  });

  it("still builds the milestone when the list parses", () => {
    expect(content(`\\p \\qt-s |who="TJ"\\*text`)?.[0]).toEqual({
      type: "ms",
      marker: "qt-s",
      who: "TJ",
    });
  });

  it("still drops a bare pipe, which carries no bytes to keep", () => {
    // The ratified reading for a `|` typed into a milestone glyph: the tokenizer drops it, and the
    // settle resolves to that rather than preserving a byte the file cannot represent.
    expect(content(`\\p \\qt-s |\\*text`)?.[0]).toEqual({ type: "ms", marker: "qt-s" });
  });
});
