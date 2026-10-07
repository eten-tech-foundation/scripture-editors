// @vitest-environment node
// This file runs without a DOM. The converters use the platform's `DOMParser` and
// `XMLSerializer`, so a Node caller has to supply an implementation — paranext-core's
// `platform-scripture` project data provider is one such caller. This proves that supplying
// `@xmldom/xmldom` is enough to run them there.
import { DOMParser, ParseError, XMLSerializer } from "@xmldom/xmldom";
import { usjGen1v1, usxGen1v1 } from "./converter-test.data.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";

// Read before anything installs the globals, so the file fails loudly if it is ever moved to a
// jsdom environment and quietly stops testing what it claims to.
const hasNativeDom = typeof globalThis.DOMParser !== "undefined";

describe("USJ/USX converters with a supplied DOM implementation", () => {
  beforeEach(() => {
    vi.stubGlobal("DOMParser", DOMParser);
    vi.stubGlobal("XMLSerializer", XMLSerializer);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs in an environment that has no DOM of its own", () => {
    expect(hasNativeDom).toBe(false);
  });

  it("converts USX to USJ", () => {
    expect(usxStringToUsj(usxGen1v1)).toEqual(usjGen1v1);
  });

  it("round-trips USJ through USX", () => {
    // Compared through a parse rather than string equality: whitespace between elements is the
    // serializer's own choice and differs between implementations, while the content must not.
    expect(usxStringToUsj(usjToUsxString(usjGen1v1))).toEqual(usjGen1v1);
  });

  it("reports malformed USX consistently and preserves the parser error", () => {
    const convert = () => usxStringToUsj('<usx version="3.1"><para style="p">unclosed</usx>');
    expect(convert).toThrow(/^Invalid USX:/);
    expect(convert).toThrow(expect.objectContaining({ cause: expect.any(ParseError) }));
  });

  it("parses with only DOMParser supplied", () => {
    vi.stubGlobal("XMLSerializer", undefined);
    expect(usxStringToUsj(usxGen1v1)).toEqual(usjGen1v1);
    expect(() => usjToUsxString(usjGen1v1)).toThrow(/DOMParser and XMLSerializer/);
  });
});
