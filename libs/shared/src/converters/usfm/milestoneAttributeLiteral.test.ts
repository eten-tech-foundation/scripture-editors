import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import type { MarkerObject } from "@eten-tech-foundation/scripture-utilities";

/**
 * A milestone whose attribute list will not parse ENDS THERE, and the bytes follow it as siblings.
 *
 * The chain is: a list that will not parse is content (matching Paratext 9, which leaves such an
 * attribute span as text), and a milestone cannot hold content — it is self-closing. So the
 * milestone closes immediately and the bytes become its siblings, with the author's own `\*` left
 * over as an unmatched closing marker.
 *
 * The point of doing it this way is that both spellings converge:
 *
 *     \qt1-s |who=""\*      the author types this
 *     \qt1-s\*|who=""\*     and this is what it means, and what gets saved
 *
 * Both tokenize identically, so the settle that rewrites the first into the second is a FIXED
 * POINT — re-reading the saved bytes gives the same tree. Two rejected alternatives each lose
 * something: refusing the whole token drops the milestone the author did write, and building the
 * milestone while discarding the attribute text drops those bytes instead. This keeps every byte,
 * which is the only reading that can round-trip.
 */
describe("a milestone with an unparseable attribute list ends before the bytes", () => {
  function content(usfm: string) {
    const [para] = usfmFragmentToUsjContent(usfm) as MarkerObject[];
    return para.content;
  }

  it.each([
    ["an empty value", `\\p \\qt1-s |who=""\\*text`, "qt1-s", `|who=""`],
    ["a stray quote", `\\p \\qt-s |gloss="st"uff"\\*text`, "qt-s", `|gloss="st"uff"`],
    [
      "a stray quote beside a good pair",
      `\\p \\qt-s |sid="a" who="b"c"\\*text`,
      "qt-s",
      `|sid="a" who="b"c"`,
    ],
  ])("closes the milestone and ejects the bytes: %s", (_label, usfm, marker, literal) => {
    expect(content(usfm)).toEqual([
      { type: "ms", marker },
      literal,
      { type: "unmatched", marker: "*" },
      "text",
    ]);
  });

  it("reads the ALREADY-SETTLED spelling identically, so the settle is a fixed point", () => {
    expect(content(`\\p \\qt1-s\\*|who=""\\*text`)).toEqual(content(`\\p \\qt1-s |who=""\\*text`));
  });

  it("still builds the milestone with its attributes when the list parses", () => {
    expect(content(`\\p \\qt-s |who="TJ"\\*text`)?.[0]).toEqual({
      type: "ms",
      marker: "qt-s",
      who: "TJ",
    });
  });

  it("still drops a bare pipe, which carries no bytes to keep", () => {
    // The ratified reading for a `|` typed into a milestone glyph: the tokenizer drops it and the
    // settle resolves to that, rather than preserving a byte the file cannot represent.
    expect(content(`\\p \\qt-s |\\*text`)).toEqual([{ type: "ms", marker: "qt-s" }, "text"]);
  });
});
