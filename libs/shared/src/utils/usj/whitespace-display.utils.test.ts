import {
  displayTextToUsj,
  normalizeSpaceRuns,
  usjTextToDisplay,
} from "./whitespace-display.utils.js";
import { NBSP } from "../../nodes/usj/node-constants.js";

describe("usjTextToDisplay", () => {
  it("shows a stored NBSP as a tilde", () => {
    expect(usjTextToDisplay(`3${NBSP}000 men`)).toBe("3~000 men");
  });

  it("shows every space of a multi-space run as NBSP", () => {
    expect(usjTextToDisplay("a  b   c")).toBe(`a${NBSP}${NBSP}b${NBSP}${NBSP}${NBSP}c`);
  });

  it("leaves single spaces alone", () => {
    expect(usjTextToDisplay("a b c")).toBe("a b c");
  });

  it("shows paragraph-leading spaces as NBSP", () => {
    expect(usjTextToDisplay(" lead", true)).toBe(`${NBSP}lead`);
    expect(usjTextToDisplay(" lead", false)).toBe(" lead");
  });

  it("handles NBSP and runs together", () => {
    expect(usjTextToDisplay(`a${NBSP}  b`)).toBe(`a~${NBSP}${NBSP}b`);
  });
});

describe("displayTextToUsj", () => {
  it("maps tilde back to NBSP and display-NBSP back to space", () => {
    expect(displayTextToUsj(`3~000${NBSP}${NBSP}men`)).toBe(`3${NBSP}000  men`);
  });

  it("round-trips with usjTextToDisplay for normalized text", () => {
    const data = `In the days${NBSP}of the judges`;
    expect(displayTextToUsj(usjTextToDisplay(data))).toBe(data);
  });
});

describe("normalizeSpaceRuns", () => {
  it("collapses space runs to a single space", () => {
    expect(normalizeSpaceRuns("a  b   c")).toBe("a b c");
  });

  it("leaves a lone single-space string untouched", () => {
    expect(normalizeSpaceRuns(" ")).toBe(" ");
  });

  it("does not collapse NBSP", () => {
    expect(normalizeSpaceRuns(`a${NBSP}${NBSP}b`)).toBe(`a${NBSP}${NBSP}b`);
  });
});
