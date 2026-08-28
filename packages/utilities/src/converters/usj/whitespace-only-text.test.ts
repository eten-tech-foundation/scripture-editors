import type { MarkerObject } from "./usj.model.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";

/**
 * Pins that `usxStringToUsj` preserves whitespace-only TEXT NODES as document content.
 *
 * The serializer (`usjToUsxString`) already emits every USJ string verbatim, so any loss in a
 * USJ -> USX -> USJ round trip is the parser's. The parser must distinguish two kinds of
 * whitespace-only text node:
 *
 * - DOCUMENT whitespace — a run of spaces with no line break. USX running text never contains
 *   line breaks (USFM is line-based; a newline in the file means a new marker), so a space-only
 *   node is scripture content: the space between two char spans, a note's leading space, an
 *   empty span's single space. Dropping one deletes document bytes.
 * - FORMATTING whitespace — a whitespace-only node containing a line break. That is XML
 *   pretty-printing (newline + indent between block elements, or before a paragraph's first
 *   inline element) and must NOT become USJ text.
 *
 * The matrix below covers the boundary positions: first child, only child, last child, and
 * between elements, in single- and multi-space variants.
 */
describe("whitespace-only text nodes (USX -> USJ)", () => {
  const ND = (text: string): MarkerObject => ({ type: "char", marker: "nd", content: [text] });
  const WJ = (text: string): MarkerObject => ({ type: "char", marker: "wj", content: [text] });

  const cases: {
    name: string;
    usxInner: string;
    usjContent: (string | MarkerObject)[];
  }[] = [
    {
      name: "single space as first child",
      usxInner: ` <char style="nd">Lord</char>`,
      usjContent: [" ", ND("Lord")],
    },
    {
      name: "multi-space as first child",
      usxInner: `  <char style="nd">Lord</char>`,
      usjContent: ["  ", ND("Lord")],
    },
    {
      name: "single space as only child of an inline span",
      usxInner: `<char style="fk"> </char>`,
      usjContent: [{ type: "char", marker: "fk", content: [" "] }],
    },
    {
      name: "single space between two elements",
      usxInner: `<char style="nd">one</char> <char style="wj">two</char>`,
      usjContent: [ND("one"), " ", WJ("two")],
    },
    {
      name: "multi-space between two elements",
      usxInner: `<char style="nd">one</char>   <char style="wj">two</char>`,
      usjContent: [ND("one"), "   ", WJ("two")],
    },
    {
      name: "single space as last child",
      usxInner: `<char style="nd">Lord</char> `,
      usjContent: [ND("Lord"), " "],
    },
    {
      name: "multi-space as last child",
      usxInner: `<char style="nd">Lord</char>   `,
      usjContent: [ND("Lord"), "   "],
    },
  ];

  const wrap = (inner: string) => `<usx version="3.0"><para style="p">${inner}</para></usx>`;

  it.each(cases)("USX -> USJ preserves $name", ({ usxInner, usjContent }) => {
    const usj = usxStringToUsj(wrap(usxInner));
    const para = usj.content?.[0] as MarkerObject;
    expect(para.content).toEqual(usjContent);
  });

  it.each(cases)("USX -> USJ -> USX round-trips $name byte-faithfully", ({ usxInner }) => {
    const usj = usxStringToUsj(wrap(usxInner));
    const back = usjToUsxString(usj);
    expect(back).toBe(`<usx version="3.1"><para style="p">${usxInner}</para></usx>`);
  });

  // The user-visible shape: a note whose category folded to an attribute, leaving the space
  // after `\cat*` as the note's whitespace-only FIRST child. Paratext treats that space as note
  // text content, so dropping it on read-back deletes a document byte.
  it("preserves a note's leading space left by a folded category", () => {
    const usx =
      `<usx version="3.0"><para style="p">` +
      `<note style="fe" caller="+" category="things">` +
      ` <char style="fr" closed="false">1.1 </char>` +
      `<char style="ft" closed="false">Note text.</char>` +
      `</note></para></usx>`;
    const usj = usxStringToUsj(usx);
    const para = usj.content?.[0] as MarkerObject;
    const note = para.content?.[0] as MarkerObject;
    expect(note.content?.[0]).toBe(" ");
    // And the whole document round-trips: parse(serialize(usj)) is identity.
    expect(usxStringToUsj(usjToUsxString(usj))).toEqual(usj);
  });
});

/**
 * The other half of the rule: whitespace-only nodes CONTAINING A LINE BREAK are XML formatting,
 * not document content. These are green today and must stay green after the preservation fix —
 * they are the guard against over-preserving pretty-printed USX (ParatextData indents between
 * block elements, and real projects indent before a paragraph's first inline element).
 */
describe("formatting whitespace stays dropped (USX -> USJ)", () => {
  it("drops newline+indent between block elements", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0">\n  <para style="p">one</para>\n  <para style="p">two</para>\n</usx>`,
    );
    expect(usj.content).toEqual([
      { type: "para", marker: "p", content: ["one"] },
      { type: "para", marker: "p", content: ["two"] },
    ]);
  });

  it("drops newline+indent before a paragraph's first inline element", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><para style="ip">\n    <char style="bd">head</char> tail</para></usx>`,
    );
    const para = usj.content?.[0] as MarkerObject;
    expect(para.content).toEqual([{ type: "char", marker: "bd", content: ["head"] }, " tail"]);
  });

  it("drops newline+indent between inline elements", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><para style="p"><char style="nd">one</char>\n      ` +
        `<char style="wj">two</char></para></usx>`,
    );
    const para = usj.content?.[0] as MarkerObject;
    expect(para.content).toEqual([
      { type: "char", marker: "nd", content: ["one"] },
      { type: "char", marker: "wj", content: ["two"] },
    ]);
  });
});
