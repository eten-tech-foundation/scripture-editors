import { generateUsjCss } from "./generateUsjCss";
import { StyleInfo } from "shared";
import { describe, expect, it, vi } from "vitest";

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
        '.editor-input.usfm { font-family: "Charis SIL"; font-size: 12pt; }',
        ".editor-input.usfm .usfm_s1 { font-weight: bold; color: #003380; font-size: 116%; margin-top: 8pt; margin-bottom: 4pt; text-align: center; }",
        ".editor-input.usfm .usfm_q1 { text-indent: -10vw; margin-left: 25vw; line-height: 1.5; }",
        ".editor-input.usfm .usfm_v { vertical-align: text-top; font-size: 66%; white-space: nowrap; unicode-bidi: embed; }",
        ".editor-input.usfm .usfm_nd { font-variant: small-caps; }",
      ].join("\n"),
    );
  });

  it("flips margins and justification under rtl and scales with zoom", () => {
    const css = generateUsjCss(styleInfo, { zoom: 2, rtl: true });
    expect(css).toContain('.editor-input.usfm { font-family: "Charis SIL"; font-size: 24pt; }');
    expect(css).toContain("margin-right: 50vw"); // q1 leftMargin flipped + zoomed
    expect(css).toContain("text-indent: -20vw");
    expect(css).toContain("margin-top: 16pt"); // s1 spaceBefore zoomed
    // s1 fontSize stays a percentage — zoom is inherited from the base rule.
    expect(css).toContain("font-size: 116%");
  });

  // Review-fix coverage: the formula-table branches the first fixture leaves unexercised.
  const branchStyleInfo: StyleInfo = {
    markers: {
      pr: { marker: "pr", styleType: "paragraph", rightMargin: 0.25, justification: "left" },
      pd: { marker: "pd", styleType: "paragraph", lineSpacing: 2 },
      p3: { marker: "p3", styleType: "paragraph", bold: true, lineSpacing: 3 },
      em: { marker: "em", styleType: "character", italic: true, underline: true },
      wj: { marker: "wj", styleType: "character", fontName: "Andika" },
      zsub: { marker: "zsub", styleType: "character", subscript: true },
      fr: { marker: "fr", styleType: "character", fontSize: 14, superscript: true },
    },
  };

  it("covers the remaining formula branches (ltr, zoom 1)", () => {
    // Derivations: rightMargin 0.25in*20 = 5vw; lineSpacing 2 → 2, 3 → nothing;
    // fr emits font-size twice (116% then 66%) — deliberate cascade, later wins.
    expect(generateUsjCss(branchStyleInfo)).toBe(
      [
        ".editor-input.usfm .usfm_pr { margin-right: 5vw; text-align: left; }",
        ".editor-input.usfm .usfm_pd { line-height: 2; }",
        ".editor-input.usfm .usfm_p3 { font-weight: bold; }",
        ".editor-input.usfm .usfm_em { font-style: italic; text-decoration: underline; }",
        '.editor-input.usfm .usfm_wj { font-family: "Andika"; }',
        ".editor-input.usfm .usfm_zsub { vertical-align: text-bottom; font-size: 66%; }",
        ".editor-input.usfm .usfm_fr { font-size: 116%; vertical-align: text-top; font-size: 66%; }",
      ].join("\n"),
    );
  });

  it("swaps rightMargin and left-justification under rtl", () => {
    const css = generateUsjCss(branchStyleInfo, { rtl: true });
    expect(css).toContain(".editor-input.usfm .usfm_pr { margin-left: 5vw; text-align: right; }");
  });

  // Values from a project stylesheet flow straight into CSS text, so any value that could break
  // out of its declaration/selector must be neutralized (escaped or validated-and-skipped).
  describe("untrusted value handling", () => {
    it("escapes double quotes so a marker fontName cannot break out of the CSS string", () => {
      const css = generateUsjCss({
        markers: { x: { marker: "x", styleType: "character", fontName: 'Bad" }' } },
      });
      expect(css).toContain('font-family: "Bad\\" }"'); // quote escaped, stays inside the string
      expect(css).not.toContain('"Bad" }"'); // a raw quote would end the string early
    });

    it("escapes double quotes in the project defaultFont", () => {
      const css = generateUsjCss({ defaultFont: 'Bad" }', defaultFontSize: 12, markers: {} });
      expect(css).toContain('font-family: "Bad\\" }"');
    });

    it("keeps valid colors (hex, rgb(), named)", () => {
      expect(
        generateUsjCss({
          markers: { a: { marker: "a", styleType: "character", color: "#00aa33" } },
        }),
      ).toContain("color: #00aa33");
      expect(
        generateUsjCss({
          markers: { b: { marker: "b", styleType: "character", color: "rgb(1, 2, 3)" } },
        }),
      ).toContain("color: rgb(1, 2, 3)");
      expect(
        generateUsjCss({ markers: { c: { marker: "c", styleType: "character", color: "red" } } }),
      ).toContain("color: red");
    });

    it("warns and skips a color value that could break out of the declaration", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const css = generateUsjCss({
        markers: {
          x: {
            marker: "x",
            styleType: "character",
            bold: true,
            color: "red; } body { display: none",
          },
        },
      });
      expect(css).not.toContain("display: none");
      expect(css).not.toContain("body {");
      expect(css).toContain("font-weight: bold"); // the rest of the rule still emits
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("escapes special characters in the marker used for the .usfm_<marker> selector", () => {
      const css = generateUsjCss({
        markers: { "x{}": { marker: "x{}", styleType: "character", bold: true } },
      });
      expect(css).toContain(".usfm_x\\{\\}"); // braces escaped, cannot terminate the rule early
      expect(css).not.toContain(".usfm_x{} {");
    });
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
