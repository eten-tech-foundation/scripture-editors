import {
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usxGen1v1,
  usxGen1v1ImpliedPara,
  usxGen1v1ImpliedParaEmpty,
  usxGen1v1Nonstandard,
} from "./converter-test.data.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { EMPTY_USJ } from "./usj.model.js";
import { usxStringToUsj } from "./usx-to-usj.js";
import { EMPTY_USX } from "./usx.model.js";

const SELF_CLOSING_ELEMENT_WHITESPACE = /(?!")\s+(?=\/>)/g;
const INTER_ELEMENT_WHITESPACE = /(?!>)\s{2,}(?=<)/g;
const LAST_ELEMENT_WHITESPACE = /(?!>)\s+(?=<\/usx>)/g;

function removeXmlWhitespace(xml: string): string {
  return xml
    .replaceAll(SELF_CLOSING_ELEMENT_WHITESPACE, "")
    .replaceAll(INTER_ELEMENT_WHITESPACE, "")
    .replaceAll(LAST_ELEMENT_WHITESPACE, "")
    .trim();
}

describe("USJ to USX Converter", () => {
  it("should convert from empty USJ to USX", () => {
    const usx = usjToUsxString(EMPTY_USJ);
    expect(usx).toEqual(removeXmlWhitespace(EMPTY_USX));
  });

  it("should convert from USJ to USX", () => {
    const usx = usjToUsxString(usjGen1v1);
    expect(usx).toEqual(removeXmlWhitespace(usxGen1v1));
  });

  it("should convert from USJ with empty implied paragraphs to USX", () => {
    const usx = usjToUsxString(usjGen1v1ImpliedParaEmpty);
    expect(usx).toEqual(removeXmlWhitespace(usxGen1v1ImpliedParaEmpty));
  });

  it("should convert from USJ with implied paragraphs to USX", () => {
    const usx = usjToUsxString(usjGen1v1ImpliedPara);
    expect(usx).toEqual(removeXmlWhitespace(usxGen1v1ImpliedPara));
  });

  it("should convert from USJ with nonstandard features to USX", () => {
    const usx = usjToUsxString(usjGen1v1Nonstandard);
    expect(usx).toEqual(removeXmlWhitespace(usxGen1v1Nonstandard));
  });

  it("should convert from USJ to USX and back", () => {
    const usx = usjToUsxString(usjGen1v1);
    const usj = usxStringToUsj(usx);
    expect(usj).toEqual(usjGen1v1);
  });
});
