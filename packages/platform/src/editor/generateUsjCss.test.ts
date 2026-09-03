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

  // Review-fix coverage: the "both" → justify mapping is unexercised by the fixtures (which only
  // use "center"/"left"/"right"). Pin it so a regression in the justify branch can't slip through.
  it('maps justification "both" to text-align: justify', () => {
    const justifyStyleInfo: StyleInfo = {
      markers: { pmo: { marker: "pmo", styleType: "paragraph", justification: "both" } },
    };
    expect(generateUsjCss(justifyStyleInfo)).toContain("text-align: justify");
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

  // The per-marker percentage divisor is fixed at 12 BY DESIGN, not derived from the project's
  // defaultFontSize: .sty FontSize values are expressed against the nominal 12pt base (PT9
  // CSSCreator divides by 12 unconditionally), while the project's actual base size applies
  // through the container rule's font-size in pt, which the percentages then scale against.
  it("keeps the marker font-size divisor fixed at 12 when defaultFontSize differs", () => {
    const smallBaseStyleInfo: StyleInfo = {
      defaultFont: "Charis SIL",
      defaultFontSize: 10,
      markers: {
        s1: { marker: "s1", styleType: "paragraph", fontSize: 14 },
        sc: { marker: "sc", styleType: "character", fontSize: 9 },
      },
    };
    expect(generateUsjCss(smallBaseStyleInfo)).toBe(
      [
        // The base rule carries the non-default project size…
        '.editor-input.usfm { font-family: "Charis SIL"; font-size: 10pt; }',
        // …and the marker percentages stay /12: floor(14*100/12) = 116, NOT floor(14*100/10) = 140.
        ".editor-input.usfm .usfm_s1 { font-size: 116%; }",
        // floor(9*100/12) = 75, NOT floor(9*100/10) = 90.
        ".editor-input.usfm .usfm_sc { font-size: 75%; }",
      ].join("\n"),
    );
  });

  it("swaps rightMargin and left-justification under rtl", () => {
    const css = generateUsjCss(branchStyleInfo, { rtl: true });
    expect(css).toContain(".editor-input.usfm .usfm_pr { margin-left: 5vw; text-align: right; }");
  });

  // The host serializer delivers explicit stylesheet zeros (e.g. custom.sty `\FirstLineIndent 0`
  // overriding usfm.sty); those must EMIT a zero declaration so it can override the static base
  // sheet, while an absent field must emit nothing so the base sheet applies.
  describe("explicit zero vs absent", () => {
    it("emits zero declarations for explicit-zero length fields", () => {
      const zeroStyleInfo: StyleInfo = {
        markers: {
          p: {
            marker: "p",
            styleType: "paragraph",
            firstLineIndent: 0,
            leftMargin: 0,
            rightMargin: 0,
            spaceBefore: 0,
            spaceAfter: 0,
          },
        },
      };
      expect(generateUsjCss(zeroStyleInfo)).toBe(
        ".editor-input.usfm .usfm_p { text-indent: 0vw; margin-left: 0vw; margin-right: 0vw; margin-top: 0pt; margin-bottom: 0pt; }",
      );
    });

    it("emits nothing for absent numeric fields (rule omitted entirely)", () => {
      const absentStyleInfo: StyleInfo = {
        markers: { p: { marker: "p", styleType: "paragraph" } },
      };
      expect(generateUsjCss(absentStyleInfo)).toBe("");
    });

    it("deliberately drops fontSize 0 (would blank the text) and lineSpacing 0 (PT9 single spacing)", () => {
      const destructiveZeroStyleInfo: StyleInfo = {
        defaultFontSize: 0,
        markers: {
          p: { marker: "p", styleType: "paragraph", fontSize: 0, lineSpacing: 0, bold: true },
        },
      };
      const css = generateUsjCss(destructiveZeroStyleInfo);
      expect(css).toBe(".editor-input.usfm .usfm_p { font-weight: bold; }");
      expect(css).not.toContain("font-size");
      expect(css).not.toContain("line-height");
    });

    it("keeps PT9's exclusion of negative margins while negative text-indent still emits", () => {
      const negativeStyleInfo: StyleInfo = {
        markers: {
          q1: {
            marker: "q1",
            styleType: "paragraph",
            firstLineIndent: -0.5,
            leftMargin: -1,
            rightMargin: -1,
            spaceBefore: -4,
            spaceAfter: -4,
          },
        },
      };
      expect(generateUsjCss(negativeStyleInfo)).toBe(
        ".editor-input.usfm .usfm_q1 { text-indent: -10vw; }",
      );
    });
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

    // The generated CSS may be injected as element text (e.g. a <style> tag via innerHTML),
    // where the HTML parser ends the style element at any literal "</style" regardless of CSS
    // string context — so angle brackets must never survive into the output.
    it("escapes angle brackets so a defaultFont cannot close an injected <style> element", () => {
      const css = generateUsjCss({
        defaultFont: "</style><script>alert(1)</script>",
        defaultFontSize: 12,
        markers: {},
      });
      expect(css).not.toContain("</style>");
      expect(css).not.toContain("<script>");
      expect(css).toContain('font-family: "\\3C /style\\3E \\3C script\\3E ');
    });

    it("escapes angle brackets in a marker fontName", () => {
      const css = generateUsjCss({
        markers: { x: { marker: "x", styleType: "character", fontName: "</style>" } },
      });
      expect(css).not.toContain("</style>");
      expect(css).toContain('font-family: "\\3C /style\\3E "');
    });

    it("escapes special characters in the marker used for the .usfm_<marker> selector", () => {
      const css = generateUsjCss({
        markers: { "x{}": { marker: "x{}", styleType: "character", bold: true } },
      });
      expect(css).toContain(".usfm_x\\{\\}"); // braces escaped, cannot terminate the rule early
      expect(css).not.toContain(".usfm_x{} {");
    });

    it("warns and falls back to the default scope when containerSelector could break out", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const css = generateUsjCss(
        { markers: { p: { marker: "p", styleType: "paragraph", bold: true } } },
        { containerSelector: ".x { } body" },
      );
      expect(css).toBe(".editor-input.usfm .usfm_p { font-weight: bold; }");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
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

describe("generateUsjCss justification safety", () => {
  const injectedStyleInfo = {
    markers: {
      zz: {
        marker: "zz",
        styleType: "paragraph",
        // The declared union is a compile-time claim only; this value really can arrive over the
        // JSON wire from a project's stylesheet.
        justification: "left; } .usfm { display: none; } .x {",
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately off-contract wire data
  } as any as StyleInfo;

  it("drops a justification that is not one of the known values instead of emitting it", () => {
    const css = generateUsjCss(injectedStyleInfo);

    expect(css).not.toContain("display: none");
    expect(css).not.toContain("text-align: left;");
  });

  it("still mirrors left/right in a right-to-left project", () => {
    const rtlStyleInfo: StyleInfo = {
      markers: { zz: { marker: "zz", styleType: "paragraph", justification: "left" } },
    };

    expect(generateUsjCss(rtlStyleInfo, { rtl: true })).toContain("text-align: right");
    expect(generateUsjCss(rtlStyleInfo)).toContain("text-align: left");
  });
});

// Paratext 9 sizes every marker's text against the BASE text, never against its container: with a
// 16px base it renders `\c` at 24px, `\ca` at 21.28px and `\cp` at 24px whether or not the
// attribute runs ride inside the chapter. CSS percentages resolve against the PARENT, so without
// these rules a `\ca` inside `\c` compounds to 133% × 150% ≈ 200% of base.
describe("generateUsjCss chapter-nested attribute runs", () => {
  const chapterMarker = (marker: string, fontSize: number) => ({
    [marker]: { marker, styleType: "character" as const, fontSize },
  });

  it("emits nothing when the sheet sizes none of the chapter family", () => {
    // The static sheet's own division already lands on PT9's sizes, so there is nothing to correct.
    expect(
      generateUsjCss({
        markers: { nd: { marker: "nd", styleType: "character", smallCaps: true } },
      }),
    ).toBe(".editor-input.usfm .usfm_nd { font-variant: small-caps; }");
  });

  it("divides the runs back down to their base-relative sizes", () => {
    // FontSize 18 → 150%, 16 → 133% (the same sizes the static sheet carries).
    const css = generateUsjCss({
      markers: {
        ...chapterMarker("c", 18),
        ...chapterMarker("ca", 16),
        ...chapterMarker("cp", 18),
      },
    });

    // 133 / 150 of the chapter → 133% of base, matching PT9's 21.28px against a 16px base.
    expect(css).toContain(".editor-input.usfm .usfm_c .usfm_ca.usfm_ca { font-size: 88.667%; }");
    // 150 / 150 → the run renders at the chapter's own size, PT9's 24px.
    expect(css).toContain(".editor-input.usfm .usfm_c .usfm_cp.usfm_cp { font-size: 100%; }");
  });

  it("tracks a project chapter size the static sheet knows nothing about", () => {
    // Only `\c` is sized (FontSize 24 → 200%); `\ca`/`\cp` fall back to the static percentages, so
    // the divisor moves and the runs must follow it to stay base-relative.
    const css = generateUsjCss({ markers: chapterMarker("c", 24) });

    // 133 / 200 of a 200% chapter → 133% of base.
    expect(css).toContain(".editor-input.usfm .usfm_c .usfm_ca.usfm_ca { font-size: 66.5%; }");
    // 150 / 200 of a 200% chapter → 150% of base.
    expect(css).toContain(".editor-input.usfm .usfm_c .usfm_cp.usfm_cp { font-size: 75%; }");
  });

  it("outweighs both the static nested rules and its own flat per-marker rule", () => {
    const css = generateUsjCss({ markers: chapterMarker("ca", 16) });

    // The flat rule is (0,3,0) and the static nested rule (0,4,0); the doubled run class plus the
    // scope puts this at (0,5,0), so the project's size wins wherever the run is.
    expect(css).toContain(".editor-input.usfm .usfm_ca { font-size: 133%; }");
    expect(css).toContain(".editor-input.usfm .usfm_c .usfm_ca.usfm_ca { font-size: 88.667%; }");
  });

  it("carries the caller's container selector", () => {
    expect(
      generateUsjCss({ markers: chapterMarker("c", 18) }, { containerSelector: ".x" }),
    ).toContain(".x .usfm_c .usfm_ca.usfm_ca");
  });
});
