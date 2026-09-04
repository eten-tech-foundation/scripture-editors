// No `@vitest-environment` pragma on purpose: this file runs in the package's default `node`
// environment, which has no DOM. The converters use the platform's `DOMParser` and
// `XMLSerializer`, so a Node caller has to supply an implementation — paranext-core's
// `platform-scripture` project data provider is one such caller. This proves that supplying
// `@xmldom/xmldom` is enough to run them there (#541 review).
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { usjGen1v1, usxGen1v1 } from "./converter-test.data.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";

// Read before anything installs the globals, so the file fails loudly if it is ever moved to a
// jsdom environment and quietly stops testing what it claims to.
const hasNativeDom = typeof globalThis.DOMParser !== "undefined";

describe("USJ/USX converters with a supplied DOM implementation", () => {
  beforeAll(() => {
    vi.stubGlobal("DOMParser", DOMParser);
    vi.stubGlobal("XMLSerializer", XMLSerializer);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("runs in an environment that has no DOM of its own", () => {
    expect(hasNativeDom).toBe(false);
  });

  it("converts USX to USJ", () => {
    expect(usxStringToUsj(usxGen1v1)).toEqual(usjGen1v1);
  });

  it("converts USJ to USX", () => {
    // Compared through a parse rather than string equality: whitespace between elements is the
    // serializer's own choice and differs between implementations, while the content must not.
    expect(usxStringToUsj(usjToUsxString(usjGen1v1))).toEqual(usjGen1v1);
  });
});
