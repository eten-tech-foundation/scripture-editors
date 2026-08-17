import { separatorRemovalTokenizesIdentically } from "./usfmFragmentToUsj.js";
import { NBSP, ZWSP } from "../../nodes/usj/node-constants.js";

/**
 * Pins the tokenize-identity predicate against the name scan's own terminator rule: removing an
 * engine-owned separator is invisible to the tokenizer iff the next byte would terminate the
 * marker-name scan WITHOUT changing the token. `*` is the deliberate counterexample — it
 * terminates the scan but completes a CLOSING marker, so it must never heal.
 */
describe("separatorRemovalTokenizesIdentically", () => {
  it.each([
    ["a following marker", "\\wj stuff"],
    ["a following attribute pipe", '|x="y"'],
    ["more plain-space whitespace", " already spaced"],
    ["an NBSP", `${NBSP}text`],
    ["a zero-width space", `${ZWSP}text`],
    ["end of bytes", ""],
  ])("heals before %s", (_name, followingBytes) => {
    expect(separatorRemovalTokenizesIdentically(followingBytes)).toBe(true);
  });

  it.each([
    ["plain text (the marker renames through it)", "things"],
    ["a digit", "5 more"],
    ["a hyphen (marker names include them)", "-s"],
    ["a `*` (that would be a CLOSING marker)", "*stuff"],
  ])("does not heal before %s", (_name, followingBytes) => {
    expect(separatorRemovalTokenizesIdentically(followingBytes)).toBe(false);
  });
});
