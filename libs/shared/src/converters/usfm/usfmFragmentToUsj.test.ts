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
        content: ["before ", { type: "char", marker: "nd", content: ["Lord"] }],
      },
    ]);
  });

  it("auto-closes an open char span when a new non-nested char marker starts", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\wj said")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "nd", content: ["Lord "] },
          { type: "char", marker: "wj", content: ["said"] },
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
        content: [{ type: "char", marker: "nd", content: ["Lord "] }],
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
          { type: "char", marker: "nd", content: ["Lord "] },
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
              { type: "char", marker: "fr", content: ["1.1 "] },
              { type: "char", marker: "ft", content: ["A note."] },
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
            content: [{ type: "char", marker: "ft", content: ["open note"] }],
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
});

const projectSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    zln: { marker: "zln", styleType: "character", endMarker: "zln*" },
    zpb: { marker: "zpb", styleType: "paragraph" },
  },
};

describe("stylesheet-first classification (Phase 4)", () => {
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

describe("PT9 unknown-marker handling (Phase 4)", () => {
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
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "ft",
            content: ["text ", { type: "char", marker: "zfoo", content: ["word"] }, " after"],
          },
        ],
      },
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
