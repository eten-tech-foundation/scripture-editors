import {
  compareMarkerText,
  getEnterMenuItems,
  getMarkerMenuItems,
  MarkerMenuContext,
} from "./markerItemSource";
import { StyleInfo } from "shared";

/**
 * Fixture per the brief, with one addition: a `c` (chapter) paragraph marker.
 * The brief's fixture list omits `c` even though `p`/`q1`/`q2`/`s1` all
 * declare `occursUnder: ["c"]` — without a `c` entry the validity stack
 * (built by replaying `previousParaMarkers`) can never contain "c", so none
 * of those candidates could ever validate (`isParagraphTagValid` only
 * bypasses the occursUnder check when the stack is completely empty,
 * TagValidator.cs:21-26). Added `c` (paragraph, occursUnder ["id"]) to make
 * the stack-replay mechanics work as the brief's assertions require.
 */
const sheet: StyleInfo = {
  markers: {
    id: { marker: "id", styleType: "paragraph" },
    c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
    p: {
      marker: "p",
      styleType: "paragraph",
      occursUnder: ["c"],
      rank: 4,
      description: "Paragraph text, with first line indent (basic)",
    },
    q1: { marker: "q1", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    q2: { marker: "q2", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 8 },
    ip: { marker: "ip", styleType: "paragraph", occursUnder: ["id"] },
    wj: {
      marker: "wj",
      styleType: "character",
      occursUnder: ["p", "q1", "q2"],
      endMarker: "wj*",
      description: "Words of Jesus (basic)",
    },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*" },
    f: { marker: "f", styleType: "note", endMarker: "f*" },
    fr: { marker: "fr", styleType: "character", occursUnder: ["f"], endMarker: "fr*" },
    ft: { marker: "ft", styleType: "character", occursUnder: ["f"], endMarker: "ft*" },
    "zpa-x": { marker: "zpa-x", styleType: "character" },
    v: { marker: "v", styleType: "character", occursUnder: ["p", "q1", "q2"] },
  },
};

/** Base context; individual cases override only what they need. */
function makeContext(overrides: Partial<MarkerMenuContext>): MarkerMenuContext {
  return {
    source: "paragraph",
    previousParaMarkers: [],
    openCharMarkers: [],
    hasTextSelection: false,
    inMarkerText: false,
    ...overrides,
  };
}

describe("getMarkerMenuItems — paragraph source (MarkerItemSource.cs:168-199)", () => {
  it("offers paragraph markers valid on the replayed stack, not character markers", () => {
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["c", "p"] });
    const markers = getMarkerMenuItems(sheet, context).map((item) => item.marker);
    expect(markers).toEqual(expect.arrayContaining(["p", "q1", "q2", "s1"]));
    expect(markers).not.toContain("fr");
    expect(markers).not.toContain("wj");
    expect(markers.every((m) => m !== "ip")).toBe(true); // ip needs `id`, not offered after c -> p
  });

  it("is empty inside a note — no fallback recursion", () => {
    const context = makeContext({
      source: "paragraph",
      previousParaMarkers: ["c", "p"],
      noteMarker: "f",
    });
    expect(getMarkerMenuItems(sheet, context)).toEqual([]);
  });
});

describe("getMarkerMenuItems — character source (MarkerItemSource.cs:109-147)", () => {
  it("offers character/note entries valid under the current paragraph", () => {
    const context = makeContext({ source: "character", paraMarker: "p" });
    const markers = getMarkerMenuItems(sheet, context).map((item) => item.marker);
    expect(markers).toEqual(expect.arrayContaining(["wj", "nd", "f"]));
    expect(markers).not.toContain("fr");
    expect(markers).not.toContain("zpa-x");
    expect(markers).not.toContain("id");
  });

  it("in a note, offers only character entries whose occursUnder includes the note marker", () => {
    const context = makeContext({ source: "character", noteMarker: "f" });
    const items = getMarkerMenuItems(sheet, context);
    expect(items.map((item) => item.marker).sort()).toEqual(["fr", "ft"]);
    expect(items.every((item) => item.kind === "character")).toBe(true);
  });

  it(
    "puts close tags first, innermost open span first, +-prefixed unless outermost " +
      "(MarkerItemSource.cs:149-159)",
    () => {
      const context = makeContext({
        source: "character",
        paraMarker: "p",
        openCharMarkers: ["nd", "wj"],
      });
      const items = getMarkerMenuItems(sheet, context);
      expect(items[0]).toMatchObject({ marker: "+nd*", kind: "closeTag" });
      expect(items[1]).toMatchObject({ marker: "wj*", kind: "closeTag" });
    },
  );

  it("falls back to the paragraph list when the character source yields nothing (FB 21054)", () => {
    const context = makeContext({
      source: "character",
      previousParaMarkers: ["c", "p"],
      // No paraMarker and no noteMarker -> character source is unconditionally empty.
    });
    const items = getMarkerMenuItems(sheet, context);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.kind === "paragraph")).toBe(true);
    expect(items.map((item) => item.marker)).toContain("p");
  });
});

describe("getMarkerMenuItems — ordering (TagComparer, MarkerItemSource.cs:201-294)", () => {
  it("sorts basic markers first (p), then the rest in natural alphanumeric order", () => {
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["c", "p"] });
    const markers = getMarkerMenuItems(sheet, context).map((item) => item.marker);
    expect(markers).toEqual(["p", "q1", "q2", "s1"]);
  });

  it("sorts basic character markers before non-basic ones", () => {
    const context = makeContext({ source: "character", paraMarker: "p" });
    const markers = getMarkerMenuItems(sheet, context).map((item) => item.marker);
    expect(markers[0]).toBe("wj");
  });

  // No real USFM marker in the supported allowlists reaches a 2-digit suffix (q1..q4,
  // s1..s4, etc.), so `s2 < s10`-style ordering can't surface through getMarkerMenuItems
  // today — verify the comparator's digit-aware tie-break directly instead.
  it("compareMarkerText sorts s2 before s10 (digit-aware, not lexicographic)", () => {
    expect(compareMarkerText("s2", "s10")).toBeLessThan(0);
    expect(compareMarkerText("s10", "s2")).toBeGreaterThan(0);
    expect(compareMarkerText("q2", "q10")).toBeLessThan(0);
    expect(["s10", "s2", "s1"].sort(compareMarkerText)).toEqual(["s1", "s2", "s10"]);
  });
});

describe("getEnterMenuItems (KeyPressEditHandler.cs:189-201 SmartEnter choice)", () => {
  it("moves ip to the front when valid at the current stack (right after \\id)", () => {
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["id"] });
    const markers = getEnterMenuItems(sheet, context).map((item) => item.marker);
    expect(markers[0]).toBe("ip");
  });

  it("moves p to the front when ip is not valid at the current stack", () => {
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["c", "p"] });
    const markers = getEnterMenuItems(sheet, context).map((item) => item.marker);
    expect(markers[0]).toBe("p");
  });
});
