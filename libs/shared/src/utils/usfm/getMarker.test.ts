import { CategoryType, MarkerType } from "./usfmTypes.js";
import { describe, expect, it, vi } from "vitest";

// getMarker reads the generated marker table and the overwrites file. Mock the overwrites to add
// two markers ABSENT from the generated table (the base-marker-less "ADD" path): one a COMPLETE
// Marker shape, one an INCOMPLETE overwrite that carries `type` but is missing the other required
// fields. The complete one must be returned; the incomplete one must NOT be handed back as a
// Marker (the `overwrite as Marker` cast would otherwise lie about the shape).
vi.mock("./usfmMarkersOverwrites.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./usfmMarkersOverwrites.js")>();
  return {
    default: {
      ...actual.default,
      zztestcomplete: {
        category: CategoryType.SpecialFeatures,
        type: MarkerType.Character,
        description: "a complete add-only overwrite",
        hasEndMarker: false,
      },
      zztestincomplete: {
        // `type` present, but no category/description/hasEndMarker: not a full Marker.
        type: MarkerType.Character,
      },
    },
  };
});

// Imported after the mock so the mocked overwrites are in effect.
const { default: getMarker } = await import("./getMarker.js");

describe("getMarker (add-only overwrite shape guard)", () => {
  it("returns a complete overwrite that adds a marker missing from the generated table", () => {
    expect(getMarker("zztestcomplete")).toEqual({
      category: CategoryType.SpecialFeatures,
      type: MarkerType.Character,
      description: "a complete add-only overwrite",
      hasEndMarker: false,
    });
  });

  it("returns undefined for an add-only overwrite that lacks the full required Marker shape", () => {
    // Guards against `type !== undefined` alone being treated as a valid Marker.
    expect(getMarker("zztestincomplete")).toBeUndefined();
  });

  it("still returns a known base marker unchanged", () => {
    const p = getMarker("p");
    expect(p?.type).toBe(MarkerType.Paragraph);
  });
});

describe("getMarker inherited-property safety", () => {
  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"])(
    "returns undefined for the Object.prototype member name %s",
    (name) => {
      // Both marker tables are plain object literals. A bare index answered these with a Function,
      // which spread into a truthy Marker with no category/type/hasEndMarker — and every caller
      // that tests `getMarker(x) !== undefined` read that as "this marker is known".
      expect(getMarker(name)).toBeUndefined();
    },
  );

  it("hands back a copy of a stand-alone overwrite, not the shared table entry", () => {
    const first = getMarker("zztestcomplete");
    expect(first).toBeDefined();
    if (first) first.description = "mutated by a caller";

    expect(getMarker("zztestcomplete")?.description).toBe("a complete add-only overwrite");
  });
});
