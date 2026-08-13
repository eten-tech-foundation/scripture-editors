import { CURSOR_PLACEHOLDER_CHAR } from "./constants.js";
import { isCursorPlaceholderOnly } from "./index.js";

const ZWSP = CURSOR_PLACEHOLDER_CHAR;

describe("isCursorPlaceholderOnly", () => {
  it("is true for one or more placeholder characters only", () => {
    expect(isCursorPlaceholderOnly(ZWSP)).toBe(true);
    expect(isCursorPlaceholderOnly(`${ZWSP}${ZWSP}`)).toBe(true);
  });

  it("is false for empty text", () => {
    expect(isCursorPlaceholderOnly("")).toBe(false);
  });

  it("is false for text with no placeholder", () => {
    expect(isCursorPlaceholderOnly("abc")).toBe(false);
  });

  it("is false when a placeholder is embedded in real content (a Thai/Khmer line break survives)", () => {
    expect(isCursorPlaceholderOnly(`first${ZWSP}second`)).toBe(false);
    expect(isCursorPlaceholderOnly(`${ZWSP}x`)).toBe(false);
  });
});
