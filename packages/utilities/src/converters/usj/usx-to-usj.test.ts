import {
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjGen1v1Whitespace,
  usxGen1v1,
  usxGen1v1ImpliedPara,
  usxGen1v1ImpliedParaEmpty,
  usxGen1v1Nonstandard,
  usxGen1v1Whitespace,
} from "./converter-test.data.js";
import { EMPTY_USJ } from "./usj.model.js";
import { usxStringToUsj } from "./usx-to-usj.js";
import { EMPTY_USX } from "./usx.model.js";

describe("USX to USJ Converter", () => {
  it("should convert from empty USX to USJ", () => {
    const usj = usxStringToUsj(EMPTY_USX);
    expect(usj).toEqual(EMPTY_USJ);
  });

  it("should convert from USX to USJ", () => {
    const usj = usxStringToUsj(usxGen1v1);
    expect(usj).toEqual(usjGen1v1);
  });

  it("should convert from USX to USJ with empty implied paragraphs", () => {
    const usj = usxStringToUsj(usxGen1v1ImpliedParaEmpty);
    expect(usj).toEqual(usjGen1v1ImpliedParaEmpty);
  });

  it("should convert from USX to USJ with implied paragraphs", () => {
    const usj = usxStringToUsj(usxGen1v1ImpliedPara);
    expect(usj).toEqual(usjGen1v1ImpliedPara);
  });

  it("should convert from USX to USJ with special whitespace", () => {
    const usj = usxStringToUsj(usxGen1v1Whitespace);
    expect(usj).toEqual(usjGen1v1Whitespace);
  });

  it("should convert from USX to USJ with nonstandard features", () => {
    const usj = usxStringToUsj(usxGen1v1Nonstandard);
    expect(usj).toEqual(usjGen1v1Nonstandard);
  });
});
