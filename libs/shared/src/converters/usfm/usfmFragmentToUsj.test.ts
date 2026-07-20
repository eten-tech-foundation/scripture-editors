import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import { NBSP } from "../../nodes/usj/node-constants.js";
import { createMarkerLookup, StyleInfo } from "../../utils/usfm/styleInfo.js";

describe("usfmFragmentToUsjContent — core", () => {
  it("tokenizes a plain paragraph", () => {
    expect(usfmFragmentToUsjContent("\\p In the days of the judges")).toEqual([
      { type: "para", marker: "p", content: ["In the days of the judges"] },
    ]);
  });

  it("splits multiple paragraph markers into paragraphs", () => {
    expect(usfmFragmentToUsjContent("\\p one \\q1 two")).toEqual([
      { type: "para", marker: "p", content: ["one "] },
      { type: "para", marker: "q1", content: ["two"] },
    ]);
  });

  it("wraps leading bare content in a default paragraph", () => {
    expect(usfmFragmentToUsjContent("bare text \\p more")).toEqual([
      { type: "para", marker: "p", content: ["bare text "] },
      { type: "para", marker: "p", content: ["more"] },
    ]);
  });

  it("builds an explicitly closed char span", () => {
    expect(usfmFragmentToUsjContent("\\p before \\nd Lord\\nd* after")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["before ", { type: "char", marker: "nd", content: ["Lord"] }, " after"],
      },
    ]);
  });

  it("auto-closes an unclosed char span at the end of the paragraph", () => {
    expect(usfmFragmentToUsjContent("\\p before \\nd Lord")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["before ", { type: "char", marker: "nd", content: ["Lord"], closed: "false" }],
      },
    ]);
  });

  it("auto-closes an open char span when a new non-nested char marker starts", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\wj said")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "nd", content: ["Lord "], closed: "false" },
          { type: "char", marker: "wj", content: ["said"], closed: "false" },
        ],
      },
    ]);
  });

  it("nests a \\+ prefixed char marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\add added \\+nd Lord\\+nd* text\\add*")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "add",
            content: ["added ", { type: "char", marker: "nd", content: ["Lord"] }, " text"],
          },
        ],
      },
    ]);
  });

  it("auto-closes char spans at a paragraph marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\q1 line")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "nd", content: ["Lord "], closed: "false" }],
      },
      { type: "para", marker: "q1", content: ["line"] },
    ]);
  });

  it("splits an unknown marker into a paragraph (PT9 DetermineUnknownTokenType)", () => {
    expect(usfmFragmentToUsjContent("\\p a \\zzz b")).toEqual([
      { type: "para", marker: "p", content: ["a "] },
      { type: "para", marker: "zzz", content: ["b"] },
    ]);
  });

  it("turns an unmatched closer into an unmatched element (PT9 sink.Unmatched)", () => {
    expect(usfmFragmentToUsjContent("\\p a \\nd* b")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["a ", { type: "unmatched", marker: "nd*" }, " b"],
      },
    ]);
  });

  it("maps ~ to NBSP in text content", () => {
    expect(usfmFragmentToUsjContent("\\p 3~000 men")).toEqual([
      { type: "para", marker: "p", content: [`3${NBSP}000 men`] },
    ]);
  });

  it("regularizes whitespace runs in text", () => {
    expect(usfmFragmentToUsjContent("\\p a  b\tc\nd")).toEqual([
      { type: "para", marker: "p", content: ["a b c d"] },
    ]);
  });

  it("passes the U+FFFC sentinel through as text", () => {
    expect(usfmFragmentToUsjContent("\\p before ￼ after")).toEqual([
      { type: "para", marker: "p", content: ["before ￼ after"] },
    ]);
  });

  it("accepts an empty paragraph", () => {
    expect(usfmFragmentToUsjContent("\\b")).toEqual([{ type: "para", marker: "b" }]);
  });
});

describe("usfmFragmentToUsjContent — verse, chapter, note, milestone, attributes", () => {
  it("tokenizes verses with numbers, segments, and bridges", () => {
    expect(usfmFragmentToUsjContent("\\p \\v 1 one \\v 2a two \\v 3-4 three")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "verse", marker: "v", number: "1" },
          "one ",
          { type: "verse", marker: "v", number: "2a" },
          "two ",
          { type: "verse", marker: "v", number: "3-4" },
          "three",
        ],
      },
    ]);
  });

  it("closes an open char span at a verse marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\v 2 next")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "nd", content: ["Lord "], closed: "false" },
          { type: "verse", marker: "v", number: "2" },
          "next",
        ],
      },
    ]);
  });

  it("tokenizes a chapter marker", () => {
    expect(usfmFragmentToUsjContent("\\c 2 \\p text")).toEqual([
      { type: "chapter", marker: "c", number: "2" },
      { type: "para", marker: "p", content: ["text"] },
    ]);
  });

  it("builds a closed footnote with caller and char content", () => {
    expect(usfmFragmentToUsjContent("\\p text\\f + \\fr 1.1 \\ft A note.\\f* after")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [
              { type: "char", marker: "fr", content: ["1.1 "], closed: "false" },
              { type: "char", marker: "ft", content: ["A note."], closed: "false" },
            ],
          },
          " after",
        ],
      },
    ]);
  });

  it("marks an unterminated note closed=false", () => {
    expect(usfmFragmentToUsjContent("\\p text\\f + \\ft open note")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [{ type: "char", marker: "ft", content: ["open note"], closed: "false" }],
            closed: "false",
          },
        ],
      },
    ]);
  });

  it("tokenizes a terminated milestone with attributes", () => {
    expect(usfmFragmentToUsjContent('\\p one \\ts-s |sid="ts.GEN.1"\\* two')).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["one ", { type: "ms", marker: "ts-s", sid: "ts.GEN.1" }, " two"],
      },
    ]);
  });

  it("keeps an unterminated milestone as literal text", () => {
    expect(usfmFragmentToUsjContent("\\p one \\ts-s two")).toEqual([
      { type: "para", marker: "p", content: ["one \\ts-s two"] },
    ]);
  });

  it("extracts named attributes from a closed char span", () => {
    expect(usfmFragmentToUsjContent('\\p \\w gracious|lemma="grace" strong="G5485"\\w*')).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "w",
            lemma: "grace",
            strong: "G5485",
            content: ["gracious"],
          },
        ],
      },
    ]);
  });

  it("maps a bare default attribute through the default-attribute table", () => {
    expect(usfmFragmentToUsjContent("\\p \\w gracious|grace\\w*")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "w", lemma: "grace", content: ["gracious"] }],
      },
    ]);
  });

  it("uses the USFM 3.0 default-attribute name link-href for xt and jmp (3.1 renamed it href)", () => {
    expect(
      usfmFragmentToUsjContent("\\p \\jmp here|2SA 1:1\\jmp* and \\xt 1 Kgs 2:35|ref\\xt*"),
    ).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "jmp", "link-href": "2SA 1:1", content: ["here"] },
          " and ",
          { type: "char", marker: "xt", "link-href": "ref", content: ["1 Kgs 2:35"] },
        ],
      },
    ]);
  });

  it("keeps a bare default-attribute value byte-exact, trailing space included (ParatextData)", () => {
    // `\w marker|stuff \w*` → lemma "stuff " — the space before the closer is part of the value.
    expect(usfmFragmentToUsjContent("\\p \\w marker|stuff \\w*")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "w", lemma: "stuff ", content: ["marker"] }],
      },
    ]);
    // Same rule for milestone default attributes: `\qt-s |TJ \*` → who "TJ ".
    expect(usfmFragmentToUsjContent("\\p a \\qt-s |TJ \\*b")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["a ", { type: "ms", marker: "qt-s", who: "TJ " }, "b"],
      },
    ]);
  });

  it("tokenizes // as an optbreak wherever it appears in text (PT9 spec-blind scan)", () => {
    expect(usfmFragmentToUsjContent("\\p before // after //")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["before ", { type: "optbreak" }, " after ", { type: "optbreak" }],
      },
    ]);
  });

  it("turns a stray \\* into an unmatched element (PT9 sink.Unmatched), not literal text", () => {
    expect(usfmFragmentToUsjContent("\\p body \\* tail")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["body ", { type: "unmatched", marker: "*" }, " tail"],
      },
    ]);
  });

  it("nests a note inside an open char span and continues the span after it (USX nesting)", () => {
    expect(usfmFragmentToUsjContent("\\p \\wj a \\f + \\fr 1:1 \\ft txt\\f* b\\wj* c")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "wj",
            content: [
              "a ",
              {
                type: "note",
                marker: "f",
                caller: "+",
                content: [
                  { type: "char", marker: "fr", content: ["1:1 "], closed: "false" },
                  { type: "char", marker: "ft", content: ["txt"], closed: "false" },
                ],
              },
              " b",
            ],
          },
          " c",
        ],
      },
    ]);
  });

  it("does not let a closer inside a note close a span enclosing the note", () => {
    const content = usfmFragmentToUsjContent("\\p \\wj a \\f + \\ft x\\wj* y\\f* b\\wj*");
    // The in-note `\wj*` has no in-note frame to close → unmatched INSIDE the note; the
    // enclosing wj span survives and is closed by the final `\wj*`.
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "wj",
            content: [
              "a ",
              {
                type: "note",
                marker: "f",
                caller: "+",
                content: [
                  {
                    type: "char",
                    marker: "ft",
                    content: ["x", { type: "unmatched", marker: "wj*" }, " y"],
                    closed: "false",
                  },
                ],
              },
              " b",
            ],
          },
        ],
      },
    ]);
  });

  it("treats bare ts/t-s/t-e as unknown markers (no stylesheet declares them), not milestones", () => {
    // ParatextData parses these as unknown → paragraph in body text; the orphan `\*` becomes
    // an unmatched element. Only `\qt#-s/-e` and `\ts-s/-e` are stylesheet-family milestones.
    expect(usfmFragmentToUsjContent("\\p has ts \\ts \\* here")).toEqual([
      { type: "para", marker: "p", content: ["has ts "] },
      { type: "para", marker: "ts", content: [{ type: "unmatched", marker: "*" }, " here"] },
    ]);
    expect(usfmFragmentToUsjContent("\\p x \\ts-s |sec\\* y")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["x ", { type: "ms", marker: "ts-s", sid: "sec" }, " y"],
      },
    ]);
  });

  describe("attribute-marker folding (ca/cp/va/vp/cat become attributes on their target)", () => {
    it("folds adjacent \\ca and \\cp onto the chapter, across structural line whitespace", () => {
      expect(usfmFragmentToUsjContent("\\c 1\n \\ca 1 ca\\ca*\n\\cp 1 cp\n\\p body")).toEqual([
        { type: "chapter", marker: "c", number: "1", altnumber: "1 ca", pubnumber: "1 cp" },
        { type: "para", marker: "p", content: ["body"] },
      ]);
    });

    it("keeps a non-adjacent \\ca standalone (its own char marker)", () => {
      expect(usfmFragmentToUsjContent("\\p a \\ca 2\\ca* b")).toEqual([
        {
          type: "para",
          marker: "p",
          content: ["a ", { type: "char", marker: "ca", content: ["2"] }, " b"],
        },
      ]);
    });

    it("keeps \\cp with markers in its content standalone (spec rule; Paratext 9.5 gets this wrong)", () => {
      expect(
        usfmFragmentToUsjContent("\\c 3\n\\ca 3 ca\\ca*\n\\cp 3 cp \\wj wj marker \\wj*\n\\p b"),
      ).toEqual([
        { type: "chapter", marker: "c", number: "3", altnumber: "3 ca" },
        {
          type: "para",
          marker: "cp",
          // The trailing " " is the newline before \p regularized to a space — pre-existing
          // paragraph-boundary behavior (engine fragments carry no line breaks).
          content: ["3 cp ", { type: "char", marker: "wj", content: ["wj marker "] }, " "],
        },
        { type: "para", marker: "p", content: ["b"] },
      ]);
    });

    it("folds \\cat right after the note caller into the note's category attribute", () => {
      expect(
        usfmFragmentToUsjContent("\\p x\\f + \\cat things\\cat*\\fr 1:12 \\ft Some\\f* y"),
      ).toEqual([
        {
          type: "para",
          marker: "p",
          content: [
            "x",
            {
              type: "note",
              marker: "f",
              caller: "+",
              category: "things",
              content: [
                { type: "char", marker: "fr", content: ["1:12 "], closed: "false" },
                { type: "char", marker: "ft", content: ["Some"], closed: "false" },
              ],
            },
            " y",
          ],
        },
      ]);
    });

    it("keeps \\cat with markup in its content standalone inside the note", () => {
      const content = usfmFragmentToUsjContent(
        "\\p \\f + \\cat \\+wj stuff \\+wj*\\cat* \\fr 1:2 \\ft t\\f*",
      );
      expect(content).toEqual([
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "note",
              marker: "f",
              caller: "+",
              content: [
                {
                  type: "char",
                  marker: "cat",
                  content: [{ type: "char", marker: "wj", content: ["stuff "] }],
                },
                " ",
                { type: "char", marker: "fr", content: ["1:2 "], closed: "false" },
                { type: "char", marker: "ft", content: ["t"], closed: "false" },
              ],
            },
          ],
        },
      ]);
    });

    it("folds \\va onto the preceding verse", () => {
      expect(usfmFragmentToUsjContent("\\p \\v 4 \\va 5\\va* text")).toEqual([
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "4", altnumber: "5" }, "text"],
        },
      ]);
    });

    it("folds \\cp at fragment end (the cp paragraph ended with plain text)", () => {
      expect(usfmFragmentToUsjContent("\\c 2\n\\cp 2 cp")).toEqual([
        { type: "chapter", marker: "c", number: "2", pubnumber: "2 cp" },
      ]);
    });
  });

  describe('closed="false" parity (ParatextData marks every implicitly-closed char span)', () => {
    it("marks a char span auto-closed at the paragraph end", () => {
      expect(usfmFragmentToUsjContent("\\p before \\nd Lord")).toEqual([
        {
          type: "para",
          marker: "p",
          content: ["before ", { type: "char", marker: "nd", content: ["Lord"], closed: "false" }],
        },
      ]);
    });

    it("marks a char span auto-closed by the next non-nested char opener", () => {
      expect(usfmFragmentToUsjContent("\\p \\it aa \\bd bb")).toEqual([
        {
          type: "para",
          marker: "p",
          content: [
            { type: "char", marker: "it", content: ["aa "], closed: "false" },
            { type: "char", marker: "bd", content: ["bb"], closed: "false" },
          ],
        },
      ]);
    });

    it("marks nested spans implicitly closed when the outer span closes explicitly", () => {
      expect(usfmFragmentToUsjContent("\\p \\add aa \\+nd bb\\add* cc")).toEqual([
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "char",
              marker: "add",
              content: ["aa ", { type: "char", marker: "nd", content: ["bb"], closed: "false" }],
            },
            " cc",
          ],
        },
      ]);
    });

    it("marks note-content chars implicitly closed by the note's explicit end", () => {
      // The classic footnote shape from real ParatextData USJ: \fr and \ft never carry their own
      // closers, so both get closed="false"; the explicitly-terminated note itself does not.
      expect(usfmFragmentToUsjContent("\\p \\f + \\fr 1.1 \\ft txt\\f* after")).toEqual([
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "note",
              marker: "f",
              caller: "+",
              content: [
                { type: "char", marker: "fr", content: ["1.1 "], closed: "false" },
                { type: "char", marker: "ft", content: ["txt"], closed: "false" },
              ],
            },
            " after",
          ],
        },
      ]);
    });

    it("leaves an explicitly closed char span unmarked", () => {
      expect(usfmFragmentToUsjContent("\\p \\nd Lord\\nd* after")).toEqual([
        {
          type: "para",
          marker: "p",
          content: ["", { type: "char", marker: "nd", content: ["Lord"] }, " after"].filter(
            (c) => c !== "",
          ),
        },
      ]);
    });
  });

  it("never lets an attribute named type/marker/content clobber the node's own keys", () => {
    // A malformed/hostile attribute list must not overwrite the USJ node's structural keys —
    // `type="x"` on a char span would otherwise break downstream node-type dispatch, and
    // `content="y"` would replace the content array with a string.
    expect(
      usfmFragmentToUsjContent('\\p \\w foo|type="x" marker="y" content="z" lemma="ok"\\w*'),
    ).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "w", lemma: "ok", content: ["foo"] }],
      },
    ]);
    expect(usfmFragmentToUsjContent('\\p one \\ts-s |type="x" sid="ts.GEN.1"\\* two')).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["one ", { type: "ms", marker: "ts-s", sid: "ts.GEN.1" }, " two"],
      },
    ]);
  });
});

const projectSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    zln: { marker: "zln", styleType: "character", endMarker: "zln*" },
    zpb: { marker: "zpb", styleType: "paragraph" },
  },
};

describe("stylesheet-first classification", () => {
  it("classifies a custom.sty character marker that matches the z-milestone wildcard", () => {
    const content = usfmFragmentToUsjContent("\\p text \\zln word\\zln* after", {
      getMarker: createMarkerLookup(projectSheet),
    });
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "char", marker: "zln", content: ["word"] }, " after"],
      },
    ]);
  });

  it("classifies a custom.sty paragraph marker", () => {
    const content = usfmFragmentToUsjContent("\\p one \\zpb two", {
      getMarker: createMarkerLookup(projectSheet),
    });
    expect(content).toEqual([
      { type: "para", marker: "p", content: ["one "] },
      { type: "para", marker: "zpb", content: ["two"] },
    ]);
  });
});

describe("PT9 unknown-marker handling", () => {
  it("unknown marker in body context becomes a paragraph (UsfmParser.DetermineUnknownTokenType)", () => {
    const content = usfmFragmentToUsjContent("\\p before \\zfoo after");
    expect(content).toEqual([
      { type: "para", marker: "p", content: ["before "] },
      { type: "para", marker: "zfoo", content: ["after"] },
    ]);
  });

  it("unknown marker in note context becomes a char run and consumes its closer", () => {
    const content = usfmFragmentToUsjContent("\\ft text \\zfoo word\\zfoo* after", {
      isNoteContext: true,
    });
    // Flat siblings, not nesting: PT9 closes open char styles unconditionally for any
    // non-`+` Character token (UsfmParser.cs:247, CharacterStyleShouldAutomaticallyClose).
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "ft", content: ["text "], closed: "false" },
          { type: "char", marker: "zfoo", content: ["word"] },
          " after",
        ],
      },
    ]);
  });

  it("keeps an unterminated suffix-convention z-milestone literal; other z-markers resolve as unknown", () => {
    // zmsc-s is on MilestoneNode's explicit list (-s/-e suffix convention): malformed milestone.
    expect(usfmFragmentToUsjContent("\\p one \\zmsc-s two")).toEqual([
      { type: "para", marker: "p", content: ["one \\zmsc-s two"] },
    ]);
    // zfoo matches only the generic z-prefix wildcard: unknown resolution, not milestone.
    expect(usfmFragmentToUsjContent("\\p one \\zfoo two")).toEqual([
      { type: "para", marker: "p", content: ["one "] },
      { type: "para", marker: "zfoo", content: ["two"] },
    ]);
  });

  it("bare unknown closer becomes an unmatched element (sink.Unmatched)", () => {
    const content = usfmFragmentToUsjContent("\\p text \\zfoo* after");
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "unmatched", marker: "zfoo*" }, " after"],
      },
    ]);
  });

  it("known closer without an opener becomes an unmatched element", () => {
    const content = usfmFragmentToUsjContent("\\p text \\nd* after");
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "unmatched", marker: "nd*" }, " after"],
      },
    ]);
  });

  it("esb stays a paragraph even in note context (UsfmToken.cs special case)", () => {
    const content = usfmFragmentToUsjContent("\\ft text \\esb more", { isNoteContext: true });
    expect(content[content.length - 1]).toMatchObject({ type: "para", marker: "esb" });
  });
});
