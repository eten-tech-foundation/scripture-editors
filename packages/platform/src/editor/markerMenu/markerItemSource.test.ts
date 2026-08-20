import {
  compareMarkerText,
  getEnterMenuItems,
  getMarkerMenuItems,
  MarkerMenuContext,
} from "./markerItemSource";
import { StyleInfo } from "shared";

/**
 * Shared fixture stylesheet. It deliberately includes a `c` (chapter)
 * paragraph marker: `p`/`q1`/`q2`/`s1` all declare `occursUnder: ["c"]`, and
 * without a `c` entry the validity stack (built by replaying
 * `previousParaMarkers`) could never contain "c", so none of those candidates
 * could ever validate (`isParagraphTagValid`, like PT9's
 * `TagValidator.IsParagraphTagValid`, only bypasses the occursUnder check
 * when the stack is completely empty). The `c` entry (paragraph, occursUnder
 * ["id"]) makes the stack-replay mechanics work as these cases require.
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

describe("getMarkerMenuItems — paragraph source (PT9 MarkerItemSource.GetParagraphTags)", () => {
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

  it("never offers the chapter marker `c` in the paragraph or Enter menus (it is structural)", () => {
    // `c` (occursUnder ["id"]) validates on an `id`-only stack, so without the `includeMarker`
    // guard it surfaces in both menus — and picking it from the Enter split menu produced a
    // malformed `<para marker="c">`. Real paragraph markers (e.g. `ip`) must still be offered.
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["id"] });
    const backslash = getMarkerMenuItems(sheet, context).map((item) => item.marker);
    const enter = getEnterMenuItems(sheet, context).map((item) => item.marker);
    expect(backslash).not.toContain("c");
    expect(enter).not.toContain("c");
    expect(backslash).toContain("ip");
  });
});

describe("getMarkerMenuItems — character source (PT9 MarkerItemSource.GetCharacterMarkerItems)", () => {
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
    "floats basic items above close tags via the final stable basic-first pass; close tags " +
      "keep innermost-first order, +-prefixed unless outermost (PT9 MarkerItemSource close-tag " +
      "insertion and basic-first OrderBy)",
    () => {
      const context = makeContext({
        source: "character",
        paraMarker: "p",
        openCharMarkers: ["nd", "wj"],
      });
      const items = getMarkerMenuItems(sheet, context);
      // Pre-pass order is [+nd*, wj*, wj, f, nd, v]; PT9's final stable
      // OrderBy(IsBasic) floats `wj` (basic) above the never-basic close tags
      // while preserving relative order within the non-basic group — close
      // tags (innermost first, `+nd*` then `wj*`) still ahead of the sorted
      // non-basic char/note items (`f`, `nd`, `v`), pinning stability.
      expect(items.map((item) => item.marker)).toEqual(["wj", "+nd*", "wj*", "f", "nd", "v"]);
      expect(items[1]).toMatchObject({ marker: "+nd*", kind: "closeTag", isBasic: false });
      expect(items[2]).toMatchObject({ marker: "wj*", kind: "closeTag", isBasic: false });
    },
  );

  it("falls back to the paragraph list when the character source yields nothing", () => {
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

  it("offers the same list for the book region whichever source it is asked for", () => {
    // The book region has no paraMarker, so the character source is empty and the fallback
    // above already produced the paragraph list there. Naming the region paragraph source is
    // therefore a correctness fix to the CONTEXT, not a change to what the user is offered —
    // pinned here so the two paths cannot silently diverge.
    const bookRegion = { previousParaMarkers: ["id"] };
    const asCharacter = getMarkerMenuItems(
      sheet,
      makeContext({ ...bookRegion, source: "character" }),
    );
    const asParagraph = getMarkerMenuItems(
      sheet,
      makeContext({ ...bookRegion, source: "paragraph" }),
    );
    expect(asParagraph.length).toBeGreaterThan(0);
    expect(asParagraph).toEqual(asCharacter);
  });
});

describe("getMarkerMenuItems — ordering (PT9 MarkerItemSource.TagComparer)", () => {
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

describe("getEnterMenuItems (PT9 KeyPressEditHandler SmartEnter marker choice)", () => {
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

  it("returns the paragraph ordering unchanged when the SmartEnter choice is not offered", () => {
    // Mid-book (a `c` was collected), so SmartEnter chooses `p` — but this sheet carries no
    // `p` entry at all, so the chosen marker is absent from the offered items. The list must
    // come back exactly as the plain paragraph source ordered it: a front-move that ran
    // anyway on the "not found" index would instead splice the LAST item to the front.
    const sheetWithoutP: StyleInfo = { markers: { ...sheet.markers } };
    delete sheetWithoutP.markers.p;
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["id", "c"] });
    const enter = getEnterMenuItems(sheetWithoutP, context).map((item) => item.marker);
    const plain = getMarkerMenuItems(sheetWithoutP, context).map((item) => item.marker);
    expect(enter).toEqual(plain);
    // `ip` is offered here (rank-less sheet, `id` on the stack) but must NOT be promoted:
    // mid-book the SmartEnter choice is `p`, and `p` alone is what this sheet lacks.
    expect(enter).toEqual(["ip", "q1", "q2", "s1"]);
  });

  it("chooses p (not ip) once a chapter has started, even on a rank-less sheet", () => {
    // The realistic snapshot: book id is pinned at the stack bottom for the whole book, and this
    // fixture's `ip`/`c` carry no `rank` (both optional). Pre-fix, the rank-0 bypass in
    // isParagraphTagValid let `\ip` validate mid-chapter and SmartEnter promoted it to first — QA
    // item 6 saw `ip` highlighted in GEN 1 where `p` is expected. SmartEnter's `\ip` default must be
    // gated on the actual introduction context (before any `\c`), not on the rank-fragile probe.
    const context = makeContext({ source: "paragraph", previousParaMarkers: ["id", "c", "p"] });
    const markers = getEnterMenuItems(sheet, context).map((item) => item.marker);
    expect(markers[0]).toBe("p");
  });
});

describe("getMarkerMenuItems — descriptions (PT9 ScrTag.IsBasic)", () => {
  it("strips the `(basic)` metadata token from the offered description but stays basic", () => {
    // The token is the ONLY thing that makes a marker basic, and the host renders `description`
    // as the palette entry's visible title — so it has to reach `isBasic` and NOT the screen.
    const paragraphItem = getMarkerMenuItems(
      sheet,
      makeContext({ source: "paragraph", previousParaMarkers: ["c", "p"] }),
    ).find((item) => item.marker === "p");
    expect(paragraphItem).toMatchObject({
      isBasic: true,
      description: "Paragraph text, with first line indent",
    });

    const characterItem = getMarkerMenuItems(
      sheet,
      makeContext({ source: "character", paraMarker: "p" }),
    ).find((item) => item.marker === "wj");
    expect(characterItem).toMatchObject({ isBasic: true, description: "Words of Jesus" });
  });

  it("emits no `(basic)` in any description, from either trigger", () => {
    const contexts = [
      makeContext({ source: "paragraph", previousParaMarkers: ["c", "p"] }),
      makeContext({ source: "character", paraMarker: "p", openCharMarkers: ["nd", "wj"] }),
      makeContext({ source: "character", noteMarker: "f" }),
    ];
    const items = contexts.flatMap((context) => [
      ...getMarkerMenuItems(sheet, context),
      ...getEnterMenuItems(sheet, context),
    ]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((item) => item.description?.includes("(basic)"))).toEqual([]);
  });

  it("leaves a description that carries no token unchanged, and a missing one undefined", () => {
    const plainSheet: StyleInfo = {
      markers: {
        ...sheet.markers,
        nd: { ...sheet.markers.nd, description: "For name of deity" },
      },
    };
    const items = getMarkerMenuItems(
      plainSheet,
      makeContext({ source: "character", paraMarker: "p" }),
    );
    expect(items.find((item) => item.marker === "nd")).toMatchObject({
      isBasic: false,
      description: "For name of deity",
    });
    expect(items.find((item) => item.marker === "f")?.description).toBeUndefined();
  });
});
