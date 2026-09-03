import type { MarkerObject } from "./usj.model.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";

/**
 * Pins that the USX<->USJ converters treat the spaces around a USFM optional line break (`//`,
 * represented as `<optbreak/>` in USX and `{ type: "optbreak" }` in USJ) as SIGNIFICANT and
 * preserve them byte-faithfully in BOTH directions.
 *
 * The four spacing variants — `one//two`, `one // two`, `one //two`, `one// two` — must each
 * produce a distinct USJ content array (the surrounding text kept verbatim as separate string
 * entries around the optbreak object) and must round-trip (USX -> USJ -> USX) back to the same
 * paragraph content. None may collapse into another. This mirrors ParatextData's own behavior,
 * pinned on the C# side in paranext-core's OptBreakRoundTripCaptureTests.
 */
describe("optbreak whitespace significance (USX<->USJ)", () => {
  // Each row: USX <para> inner content, the expected USJ content around the optbreak, and the
  // paragraph content after a USX -> USJ -> USX round trip. The round-tripped element is
  // `<optbreak/>` (self-closing with no inner space) regardless of the `<optbreak />` input
  // spelling — that is element serialization, not the significant text around the element.
  const cases: {
    name: string;
    usxInner: string;
    usjContent: (string | { type: string })[];
    roundTripInner: string;
  }[] = [
    {
      name: "tight (one//two)",
      usxInner: "one<optbreak />two",
      usjContent: ["one", { type: "optbreak" }, "two"],
      roundTripInner: "one<optbreak/>two",
    },
    {
      name: "spaced both sides (one // two)",
      usxInner: "one <optbreak /> two",
      usjContent: ["one ", { type: "optbreak" }, " two"],
      roundTripInner: "one <optbreak/> two",
    },
    {
      name: "leading space only (one //two)",
      usxInner: "one <optbreak />two",
      usjContent: ["one ", { type: "optbreak" }, "two"],
      roundTripInner: "one <optbreak/>two",
    },
    {
      name: "trailing space only (one// two)",
      usxInner: "one<optbreak /> two",
      usjContent: ["one", { type: "optbreak" }, " two"],
      roundTripInner: "one<optbreak/> two",
    },
  ];

  const wrap = (inner: string) => `<usx version="3.0"><para style="p">${inner}</para></usx>`;

  it.each(cases)(
    "USX -> USJ keeps the exact surrounding spaces for $name",
    ({ usxInner, usjContent }) => {
      const usj = usxStringToUsj(wrap(usxInner));
      const para = usj.content?.[0] as MarkerObject;
      expect(para.content).toEqual(usjContent);
    },
  );

  it.each(cases)(
    "USX -> USJ -> USX round-trips $name byte-faithfully",
    ({ usxInner, roundTripInner }) => {
      const usj = usxStringToUsj(wrap(usxInner));
      const back = usjToUsxString(usj);
      expect(back).toBe(`<usx version="3.1"><para style="p">${roundTripInner}</para></usx>`);
    },
  );

  it("keeps all four spacing variants distinct through USX -> USJ -> USX", () => {
    const roundTripped = cases.map(({ usxInner }) =>
      usjToUsxString(usxStringToUsj(wrap(usxInner))),
    );
    expect(new Set(roundTripped).size).toBe(cases.length);
  });
});
