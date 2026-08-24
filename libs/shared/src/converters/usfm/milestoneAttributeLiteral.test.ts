import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import type { MarkerObject } from "@eten-tech-foundation/scripture-utilities";

/**
 * A milestone cannot hold content, so it ENDS where content it cannot hold begins, and the bytes
 * follow it as siblings with the author's own `\*` left over as an unmatched closing marker.
 *
 * Content reaches a milestone by three routes, all the same rule: an attribute list that will not
 * parse (a list that will not parse is content, matching Paratext 9, which leaves such a span as
 * text), bytes typed BEFORE a list that does parse, and — with no `|` at all — everything between
 * the marker and the closer.
 *
 * The point of doing it this way is that both spellings converge:
 *
 *     \qt1-s |who=""\*      the author types this
 *     \qt1-s\*|who=""\*     and this is what it means, and what gets saved
 *
 * Both tokenize identically, so the settle that rewrites the first into the second is a FIXED
 * POINT — re-reading the saved bytes gives the same tree. Two rejected alternatives each lose
 * something: refusing the whole token drops the milestone the author did write, and building the
 * milestone while discarding the content drops those bytes instead. This keeps every byte, which
 * is the only reading that can round-trip.
 */
describe("a milestone ends where content it cannot hold begins", () => {
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

  it("ejects CONTENT typed into a milestone, keeping attributes that are valid", () => {
    // The same rule reached from the other side. The attributes are correct and belong to the
    // milestone, so they stay; only the content it cannot hold is ejected. Before this, the bytes
    // before the pipe were simply dropped and `things` vanished without trace.
    expect(content(`\\p \\qt1-s things|sid="asdf"\\*text`)).toEqual([
      { type: "ms", marker: "qt1-s", sid: "asdf" },
      "things",
      { type: "unmatched", marker: "*" },
      "text",
    ]);
  });

  it("reads the settled spelling of an ejected content run identically", () => {
    expect(content(`\\p \\qt1-s |sid="asdf"\\*things\\*text`)).toEqual(
      content(`\\p \\qt1-s things|sid="asdf"\\*text`),
    );
  });

  it("ejects content typed with NO attribute list at all", () => {
    // The third face of the same rule: no `|`, so every byte between the marker and the closer is
    // content. The milestone ends where it begins, and the author's `\*` is left unmatched.
    expect(content(`\\p \\qt1-s stuff\\*text`)).toEqual([
      { type: "ms", marker: "qt1-s" },
      "stuff",
      { type: "unmatched", marker: "*" },
      "text",
    ]);
  });

  it("reads the settled spelling of pipe-less content identically", () => {
    expect(content(`\\p \\qt1-s\\*stuff\\*text`)).toEqual(content(`\\p \\qt1-s stuff\\*text`));
  });

  it("ejects only the marker's separator space, keeping the content's own spacing", () => {
    // The space that ends the marker name belongs to the marker, so it goes with it; every space
    // inside the content is the content's own and stays. Convergence is what proves the count.
    expect(content(`\\p \\qt1-s some stuff\\*text`)).toEqual(
      content(`\\p \\qt1-s\\*some stuff\\*text`),
    );
  });

  it("leaves a milestone with nothing between marker and closer alone", () => {
    expect(content(`\\p \\qt1-s\\*text`)).toEqual([{ type: "ms", marker: "qt1-s" }, "text"]);
  });

  it("still parses a genuine attribute list as attributes, never as ejected content", () => {
    // Nothing follows the milestone but the text after the closer: no ejected run, and no
    // unmatched `\*`, because the closer is the milestone's own.
    expect(content(`\\p \\qt1-s |who="Jesus"\\*text`)).toEqual([
      { type: "ms", marker: "qt1-s", who: "Jesus" },
      "text",
    ]);
  });

  it("ejects content that precedes a bare pipe, which itself carries no bytes to keep", () => {
    expect(content(`\\p \\qt1-s things|\\*text`)).toEqual([
      { type: "ms", marker: "qt1-s" },
      "things",
      { type: "unmatched", marker: "*" },
      "text",
    ]);
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
