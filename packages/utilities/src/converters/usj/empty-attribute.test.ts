import type { MarkerObject } from "./usj.model.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";

/**
 * Pins that an attribute whose value is the EMPTY STRING survives the USJ->USX->USJ round trip.
 *
 * `\qt-s |who=""\*` is a real authored shape, and the empty value is the author's own byte: it says
 * the attribute is present and its value not yet filled in, which is different from the attribute
 * being absent. `setAttributes` tested the value for truthiness, so `""` was indistinguishable from
 * `undefined` and the attribute was dropped on the way OUT to USX — before ParatextData ever saw
 * it. The read leg never had the bug, which is what made the loss so quiet: the editor parsed the
 * attribute, displayed it, and held it in node state, and only the saved file lacked it.
 *
 * The two shapes fail differently and both are pinned. A lone empty attribute leaves the element
 * with no attributes at all, so the marker appears to lose its attribute list entirely. An empty
 * attribute BESIDE a populated one is worse to diagnose: the file keeps the populated one, so the
 * document still looks structurally right while one field has silently gone missing.
 */
describe("an empty attribute value survives the round trip", () => {
  // USJ carries marker-specific attributes that `MarkerObject` does not declare individually, so
  // the fixtures are built as plain objects and widened, the same way the sibling converter suites
  // build theirs.
  const marker = (fields: { [key: string]: unknown }) => fields as unknown as MarkerObject;
  const cases: { name: string; content: MarkerObject[] }[] = [
    {
      name: "a lone empty attribute on a milestone",
      content: [marker({ type: "ms", marker: "qt-s", who: "" })],
    },
    {
      name: "an empty attribute beside a populated one on a milestone",
      content: [marker({ type: "ms", marker: "qt-s", sid: "stuff", who: "" })],
    },
    {
      name: "an empty attribute beside a populated one on a char span",
      content: [marker({ type: "char", marker: "w", strong: "G1", lemma: "", content: ["grace"] })],
    },
    {
      name: "a lone empty attribute on a char span",
      content: [marker({ type: "char", marker: "w", lemma: "", content: ["grace"] })],
    },
  ];

  it.each(cases)("keeps it: $name", ({ content }) => {
    const usj = { type: "USJ" as const, version: "3.1" as const, content };
    const usx = usjToUsxString(usj);
    // The attribute reaches the XML rather than being dropped on the way out...
    expect(usx).toContain('=""');
    // ...and reading it back yields the same USJ, empty value included.
    expect(usxStringToUsj(usx).content).toEqual(content);
  });

  it("still omits an attribute that is genuinely absent", () => {
    // The guard the truthiness check was really there for: `undefined` means no attribute, and
    // must not become `attr=""` in the XML — that would fabricate a value the author never wrote.
    const usj = {
      type: "USJ" as const,
      version: "3.1" as const,
      content: [marker({ type: "ms", marker: "qt-s", who: undefined })],
    };
    const usx = usjToUsxString(usj);
    expect(usx).not.toContain("who");
    expect(usxStringToUsj(usx).content).toEqual([{ type: "ms", marker: "qt-s" }]);
  });
});
