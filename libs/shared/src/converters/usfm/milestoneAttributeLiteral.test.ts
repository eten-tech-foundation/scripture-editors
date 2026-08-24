import { milestoneEjectionPending, usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
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

/**
 * The pend predicate answers the EJECTION SIGNATURE, not "something follows the milestone".
 *
 * Ejection moves bytes, so the rebuild that performs it waits for the caret to depart rather than
 * rearranging the line mid-keystroke. Everything else about a milestone applies where it stands:
 * the moment the author closes `\qt1-s\*` they should see a milestone, even though ordinary body
 * text follows it — which is the common case, not an ejection.
 *
 * The two halves together are what distinguish them: an ejection leaves content immediately after
 * the milestone AND the author's own `\*` stranded past that content as an unmatched closing
 * marker. A well-formed milestone with body text after it has the first half and never the second.
 */
describe("only an EJECTING milestone rebuild waits for the settle", () => {
  it.each([
    ["a bare milestone with body text after it", `\\p before \\qt1-s\\*after`],
    ["an attributed milestone with body text after it", `\\p before \\qt1-s |stuff\\*after`],
    ["a milestone at the end of its paragraph", `\\p before \\qt1-s\\*`],
  ])("applies at once: %s", (_label, usfm) => {
    expect(milestoneEjectionPending(usfm)).toBe(false);
  });

  it.each([
    ["content typed into the milestone", `\\p before \\qt1-s things|sid="asdf"\\*after`],
    ["an attribute list that will not parse", `\\p before \\qt1-s |who=""\\*after`],
    ["the already-settled spelling of the same", `\\p before \\qt1-s\\*|who=""\\*after`],
  ])("waits for the settle: %s", (_label, usfm) => {
    expect(milestoneEjectionPending(usfm)).toBe(true);
  });
});

/**
 * The inverse rule: a FIXED-UP attribute list sitting after a milestone folds back INTO it.
 *
 * The ejection above is what an author sees after typing an attribute list Paratext cannot read —
 * the milestone closes and the bytes land outside it. Correcting those bytes has to put them back,
 * or the author is left staring at a repaired list the milestone will not take.
 *
 * The boundary is the author's own trailing `\*`. It is the byte that says "this list was meant to
 * end a milestone", and requiring it is what keeps ordinary content safe: body text that merely
 * begins with `|` has no closer after it and is never absorbed.
 *
 * The second requirement is that the list PARSES, and that is what keeps absorption and ejection
 * from chasing each other forever. `|who=""` does not parse, so the ejected spelling stays
 * ejected rather than being absorbed into a milestone whose bytes would only eject it again.
 */
describe("a milestone re-absorbs an attribute list that parses", () => {
  function content(usfm: string) {
    const [para] = usfmFragmentToUsjContent(usfm) as MarkerObject[];
    return para.content;
  }

  it.each([
    ["directly after the closer", `\\p \\qt1-s\\*|who="person"\\*text`],
    ["past whitespace after the closer", `\\p \\qt1-s\\* |who="person"\\*text`],
  ])("absorbs a list closed by its own `\\*`: %s", (_label, usfm) => {
    expect(content(usfm)).toEqual([{ type: "ms", marker: "qt1-s", who: "person" }, "text"]);
  });

  it("leaves a list with NO closer alone — it is ordinary content", () => {
    expect(content(`\\p \\qt1-s\\*|who="person"text`)).toEqual([
      { type: "ms", marker: "qt1-s" },
      `|who="person"text`,
    ]);
  });

  it("MERGES onto attributes the milestone already has, the absorbed list winning", () => {
    expect(content(`\\p \\qt1-s |sid="a"\\*|sid="b" who="c"\\*text`)).toEqual([
      { type: "ms", marker: "qt1-s", sid: "b", who: "c" },
      "text",
    ]);
  });

  it("reads the absorbed spelling identically, so absorption is a fixed point", () => {
    expect(content(`\\p \\qt1-s\\*|who="person"\\*text`)).toEqual(
      content(`\\p \\qt1-s |who="person"\\*text`),
    );
  });

  it("refuses a list that will not parse, which is what stops the oscillation", () => {
    // Both directions, in one place, because it is the pair that terminates and neither half
    // proves it alone. Ejection sends an unparseable list OUT of the milestone; absorption must
    // not send it back IN, or the two would trade the same bytes forever. Refusing on the parse
    // is what settles it — the ejected spelling reads as the ejected shape, unchanged.
    const ejected = [
      { type: "ms", marker: "qt1-s" },
      `|who=""`,
      { type: "unmatched", marker: "*" },
      "text",
    ];
    expect(content(`\\p \\qt1-s |who=""\\*text`)).toEqual(ejected);
    expect(content(`\\p \\qt1-s\\*|who=""\\*text`)).toEqual(ejected);
  });
});
