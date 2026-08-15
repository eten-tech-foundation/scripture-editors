import { MarkerContent, MarkerObject, Usj } from "./usj.model.js";
import { usjToUsxString } from "./usj-to-usx.js";
import { usxStringToUsj } from "./usx-to-usj.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * USJ -> USX -> USJ round trip over the rich testUSFM oracles.
 *
 * This is a NET, not a localizer: a failure here conflates the serializer and the parser, so
 * diagnose against the direct parser assertions in `whitespace-only-text.test.ts` (the serializer
 * emits every USJ string verbatim — historically every loss in this pair has been the parser's).
 * The oracles are Paratext 9.5's own USJ output for the testUSFM corpus, so this pins the pair
 * against real-project shapes the hand-authored fixtures don't reach: attribute markers,
 * milestones, unclosed spans, figures, tables, sidebars, links.
 */

// Vitest's module transform does not preserve a usable `import.meta.url`, so locate the corpus
// relative to the working directory — the utilities project root under nx, the repo root
// otherwise. Same probing shape the platform-side corpus tests use.
const CORPUS_DIR = [
  "../../libs/shared/src/converters/usfm/testUsfmCorpus",
  "libs/shared/src/converters/usfm/testUsfmCorpus",
].find((dir) => existsSync(dir));

/**
 * The Paratext-flavored oracles, matching the shared-side corpus test's selection. `2SA-3` uses
 * the CORRECTED oracle rather than Paratext's raw output, which carries an acknowledged Paratext
 * 9.5 bug (a `\cp` with markers is partially folded into `pubnumber` and the remainder stranded
 * as an invalid top-level char).
 */
const FIXTURES = [
  "testUSFM-2SA-1.usj",
  "testUSFM-2SA-2.usj",
  "testUSFM-2SA-3-corrected.usj",
  "web-matthew-1-and-2.usj",
  "web-matthew-5-section-header.usj",
];

function readOracle(name: string): Usj {
  if (!CORPUS_DIR) throw new Error("testUsfmCorpus fixture directory not found from cwd");
  return JSON.parse(readFileSync(join(CORPUS_DIR, name), "utf8")) as Usj;
}

/**
 * Drops attributes whose value is the empty string, recursively. Paratext 9.5's USJ carries
 * `sid: ""` on verses and `vid: ""` on paras; the serializer omits empty attributes from USX and
 * the parser additionally drops para `vid` as inconsistent derived metadata, so `"" -> absent` is
 * the converter pair's deliberate normalization, not a loss — an empty attribute carries no
 * document bytes. Canonicalizing both sides keeps this net focused on the bytes and structure.
 */
function withoutEmptyAttributes(content: MarkerContent[]): MarkerContent[] {
  return content.map((item) => {
    if (typeof item === "string") return item;
    const entries = Object.entries(item).filter(([, value]) => value !== "");
    const cleaned = Object.fromEntries(entries) as MarkerObject;
    if (cleaned.content) cleaned.content = withoutEmptyAttributes(cleaned.content);
    return cleaned;
  });
}

describe("testUSFM corpus round trip (USJ -> USX -> USJ)", () => {
  it.each(FIXTURES)("%s", (name) => {
    const usj = readOracle(name);
    const roundTripped = usxStringToUsj(usjToUsxString(usj));
    // The oracles carry `version: "3.0"`; the converters emit 3.1. That is the documented output
    // version, not a round-trip loss, so compare CONTENT — the bytes and structure this net
    // exists to protect — rather than the version stamp.
    expect(withoutEmptyAttributes(roundTripped.content)).toEqual(
      withoutEmptyAttributes(usj.content),
    );
  });
});
