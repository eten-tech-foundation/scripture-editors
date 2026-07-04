import { defaultStyleInfo } from "./defaultStyleInfo.js";
import { describe, expect, it } from "vitest";

describe("defaultStyleInfo (generated from vendored usfm.sty)", () => {
  it("classifies core markers", () => {
    expect(defaultStyleInfo.markers.p?.styleType).toBe("paragraph");
    expect(defaultStyleInfo.markers.nd?.styleType).toBe("character");
    expect(defaultStyleInfo.markers.f?.styleType).toBe("note");
    expect(defaultStyleInfo.markers.f?.endMarker).toBe("f*");
  });

  it("includes previously-excluded categories (Tables, SpecialFeatures)", () => {
    expect(defaultStyleInfo.markers.tr?.styleType).toBe("paragraph");
    expect(defaultStyleInfo.markers.w?.styleType).toBe("character");
  });

  it("includes milestones", () => {
    const milestones = Object.values(defaultStyleInfo.markers).filter(
      (entry) => entry.styleType === "milestone",
    );
    expect(milestones.length).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers["qt1-s"]?.styleType).toBe("milestone");
  });

  it("carries validation fields", () => {
    expect(defaultStyleInfo.markers.p?.occursUnder).toContain("c");
    expect(defaultStyleInfo.markers.ft?.occursUnder).toContain("f");
    expect(defaultStyleInfo.markers.s1?.rank).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers.v?.occursUnder).toContain("p");
  });

  it("carries presentation fields with .sty units", () => {
    // \q1 has a hanging indent: positive left margin, negative-ish or smaller first-line.
    expect(defaultStyleInfo.markers.q1?.leftMargin).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers.s1?.bold).toBe(true);
    // \v is superscript in the default sheet.
    expect(defaultStyleInfo.markers.v?.superscript).toBe(true);
  });
});
