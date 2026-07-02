import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import { NBSP } from "../../nodes/usj/node-constants.js";

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

  it("keeps an unknown marker as literal text (degradation property)", () => {
    expect(usfmFragmentToUsjContent("\\p a \\zzz b")).toEqual([
      { type: "para", marker: "p", content: ["a \\zzz b"] },
    ]);
  });

  it("keeps an unmatched closer as literal text", () => {
    expect(usfmFragmentToUsjContent("\\p a \\nd* b")).toEqual([
      { type: "para", marker: "p", content: ["a \\nd* b"] },
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
