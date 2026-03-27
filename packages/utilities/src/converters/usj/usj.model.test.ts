import { usjGen1v1 } from "./converter-test.data.js";
import { EMPTY_USJ, getBookCodeFromUsj } from "./usj.model.js";

describe("getBookCodeFromUsj()", () => {
  it("returns book code from USJ with book element", () => {
    expect(getBookCodeFromUsj(usjGen1v1)).toBe("GEN");
  });

  it("returns undefined for empty USJ", () => {
    expect(getBookCodeFromUsj(EMPTY_USJ)).toBeUndefined();
  });

  it("returns undefined for null or undefined", () => {
    expect(getBookCodeFromUsj(null)).toBeUndefined();
    expect(getBookCodeFromUsj(undefined)).toBeUndefined();
  });

  it("returns book code when book has different code (PSA)", () => {
    const usjWithPsa = {
      type: "USJ" as const,
      version: "3.1" as const,
      content: [{ type: "book", marker: "id", code: "PSA" as const, content: ["Psalms"] }],
    };
    expect(getBookCodeFromUsj(usjWithPsa)).toBe("PSA");
  });

  it("returns undefined when content has no book element", () => {
    const usjWithoutBook = {
      ...usjGen1v1,
      content: usjGen1v1.content.filter((c) => {
        const item = c as { type?: string; marker?: string };
        return !(item.type === "book" && item.marker === "id");
      }),
    };
    expect(getBookCodeFromUsj(usjWithoutBook)).toBeUndefined();
  });
});
