// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(dir, "usj-nodes.css"), "utf-8");

/**
 * Collects all `.usfm_<marker>` names that appear in a `.psc-gutter-markers`
 * rule block containing `property`.
 */
function getGutterMarkers(property: string): Set<string> {
  const markers = new Set<string>();
  const ruleBlock = /([^{}]+)\{([^}]+)\}/g;
  let match;
  while ((match = ruleBlock.exec(css)) !== null) {
    const [, selectors, declarations] = match;
    if (!selectors.includes("psc-gutter-markers") || !declarations.includes(property)) continue;
    const markerName = /\.usfm_([a-z0-9]+)/g;
    let m;
    while ((m = markerName.exec(selectors)) !== null) markers.add(m[1]);
  }
  return markers;
}

// USFM standard LeftMargin values → vw (formula: inches × 20).
// Source: https://github.com/ubsicap/usfm/blob/master/sty/usfm.sty
// Every marker here must have a --para-indent entry in .psc-gutter-markers.text-spacing.
const PARA_INDENT_MARKERS = new Set([
  // 0.25" → 5vw
  "ipi",
  "imi",
  "pmo",
  "pm",
  "pmc",
  "pmr",
  "pi",
  "pi1",
  "mi",
  // 0.5" → 10vw
  "io",
  "io1",
  "ili",
  "ili1",
  "li",
  "li1",
  "pi2",
  // 0.75" → 15vw
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "io2",
  "ili2",
  "li2",
  "lim",
  "lim1",
  "pi3",
  // 1.0" → 20vw
  "qm",
  "qm1",
  "io3",
  "li3",
  "lim2",
  // 1.25" → 25vw
  "io4",
  "li4",
  "lim3",
  // 1.5" → 30vw
  "lim4",
]);

// Markers with a negative FirstLineIndent (hanging indent) → --verse-text-start.
// Source: https://github.com/ubsicap/usfm/blob/master/sty/usfm.sty
const VERSE_TEXT_START_MARKERS = new Set([
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "qm",
  "qm1",
  "qm2",
  "qm3",
  "iq",
  "iq1",
  "iq2",
  "iq3",
  "ili",
  "ili1",
  "ili2",
  "li",
  "li1",
  "li2",
  "li3",
  "li4",
  "lim",
  "lim1",
  "lim2",
  "lim3",
  "lim4",
]);

describe("usj-nodes.css .psc-gutter-markers.text-spacing coverage", () => {
  it("every USFM indented marker has a --para-indent entry", () => {
    const covered = getGutterMarkers("--para-indent");
    const missing = [...PARA_INDENT_MARKERS].filter((m) => !covered.has(m));
    expect(
      missing,
      `Add --para-indent entries to .psc-gutter-markers.text-spacing for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every hanging-indent marker has a --verse-text-start entry", () => {
    const covered = getGutterMarkers("--verse-text-start");
    const missing = [...VERSE_TEXT_START_MARKERS].filter((m) => !covered.has(m));
    expect(
      missing,
      `Add --verse-text-start entries to .psc-gutter-markers.text-spacing for: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
