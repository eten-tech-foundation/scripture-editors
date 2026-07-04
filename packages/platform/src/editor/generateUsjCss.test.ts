import { generateUsjCss } from "./generateUsjCss";
import { StyleInfo } from "shared";
import { describe, expect, it } from "vitest";

const styleInfo: StyleInfo = {
  defaultFont: "Charis SIL",
  defaultFontSize: 12,
  markers: {
    s1: {
      marker: "s1",
      styleType: "paragraph",
      bold: true,
      color: "#003380",
      fontSize: 14,
      spaceBefore: 8,
      spaceAfter: 4,
      justification: "center",
    },
    q1: {
      marker: "q1",
      styleType: "paragraph",
      firstLineIndent: -0.5,
      leftMargin: 1.25,
      lineSpacing: 1,
    },
    v: {
      marker: "v",
      styleType: "character",
      superscript: true,
      textProperties: ["verse"],
    },
    nd: { marker: "nd", styleType: "character", smallCaps: true },
  },
};

describe("generateUsjCss (PT9 CSSCreator port)", () => {
  it("emits the base rule and per-marker rules (ltr, zoom 1)", () => {
    expect(generateUsjCss(styleInfo)).toBe(
      [
        '.editor-input { font-family: "Charis SIL"; font-size: 12pt; }',
        ".editor-input .usfm_s1 { font-weight: bold; color: #003380; font-size: 116%; margin-top: 8pt; margin-bottom: 4pt; text-align: center; }",
        ".editor-input .usfm_q1 { text-indent: -10vw; margin-left: 25vw; line-height: 1.5; }",
        ".editor-input .usfm_v { vertical-align: text-top; font-size: 66%; white-space: nowrap; unicode-bidi: embed; }",
        ".editor-input .usfm_nd { font-variant: small-caps; }",
      ].join("\n"),
    );
  });

  it("flips margins and justification under rtl and scales with zoom", () => {
    const css = generateUsjCss(styleInfo, { zoom: 2, rtl: true });
    expect(css).toContain('.editor-input { font-family: "Charis SIL"; font-size: 24pt; }');
    expect(css).toContain("margin-right: 50vw"); // q1 leftMargin flipped + zoomed
    expect(css).toContain("text-indent: -20vw");
    expect(css).toContain("margin-top: 16pt"); // s1 spaceBefore zoomed
    // s1 fontSize stays a percentage — zoom is inherited from the base rule.
    expect(css).toContain("font-size: 116%");
  });

  it("respects a custom containerSelector", () => {
    expect(generateUsjCss({ markers: {} }, { containerSelector: ".x" })).toBe("");
    expect(
      generateUsjCss(
        { markers: { p: { marker: "p", styleType: "paragraph", bold: true } } },
        { containerSelector: ".x" },
      ),
    ).toBe(".x .usfm_p { font-weight: bold; }");
  });
});
