/**
 * Cross-oracle corpus test: run `usfmFragmentToUsjContent` over the vendored testUSFM fixtures
 * and diff the output against Paratext 9.5's own USJ for the same bytes (see
 * `testUsfmCorpus/README.md`). This pins ParatextData parse fidelity — the tokenizer's reference
 * semantics — against a corpus that deliberately exercises USFM's edges.
 *
 * The tokenizer diverges NOWHERE on this corpus — every fixture must produce an empty diff.
 * Any new divergence fails its test with a self-describing entry list.
 *
 * Two deliberate framing choices:
 *
 * - **2SA-3 uses the corrected oracle**, not Paratext's raw output (see README): the raw file
 *   contains Paratext 9.5's acknowledged `\cp`-with-markers bug (partial `pubnumber` fold + a
 *   stranded top-level char). The tokenizer intentionally produces the spec-correct shape; the
 *   serialized bytes are identical either way, so nothing breaks P9.
 * - **`\id` lines are stripped** before tokenizing (with the oracle's `book` node): fragments
 *   are paragraph-scoped by design and never contain book identification.
 */
import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";

// Vitest's module transform does not preserve a usable import.meta.url, so locate the corpus
// relative to the working directory (project root when run via nx, repo root otherwise).
const CORPUS_DIR = [
  "src/converters/usfm/testUsfmCorpus",
  "libs/shared/src/converters/usfm/testUsfmCorpus",
].find((dir) => existsSync(dir));

function readFixture(name: string): string {
  if (!CORPUS_DIR) throw new Error("testUsfmCorpus fixture directory not found from cwd");
  return readFileSync(join(CORPUS_DIR, name), "utf8");
}

/** Whitespace/positional normalization so the diff measures STRUCTURE and content bytes:
 * collapse whitespace runs (raw-USFM line joins), drop Paratext's positional attributes
 * (sid/eid/vid), and trim container-edge whitespace (line-break artifacts). */
function normalizeContent(items: MarkerContent[]): MarkerContent[] {
  const out: MarkerContent[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const text = item.replace(/[ \t\r\n\u200B]+/g, " ");
      if (typeof out[out.length - 1] === "string") {
        out[out.length - 1] = (out[out.length - 1] as string) + text;
      } else if (text !== "") out.push(text);
    } else {
      const object: MarkerObject & { sid?: string; eid?: string; vid?: string } = { ...item };
      delete object.sid;
      delete object.eid;
      delete object.vid;
      if (object.content) object.content = normalizeContent(object.content);
      out.push(object);
    }
  }
  const first = out[0];
  if (typeof first === "string") {
    const trimmed = first.replace(/^ +/, "");
    if (trimmed === "") out.shift();
    else out[0] = trimmed;
  }
  const last = out[out.length - 1];
  if (typeof last === "string") {
    const trimmed = last.replace(/ +$/, "");
    if (trimmed === "") out.pop();
    else out[out.length - 1] = trimmed;
  }
  return out;
}

function signature(item: MarkerContent): string {
  if (typeof item === "string") return "#text";
  return `${item.type}:${item.marker ?? ""}`;
}

/** LCS-align two content arrays by signature so one divergence does not cascade. */
function lcsAlign(
  a: MarkerContent[],
  b: MarkerContent[],
): [number | undefined, number | undefined][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        signature(a[i]) === signature(b[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number | undefined, number | undefined][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (signature(a[i]) === signature(b[j])) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) pairs.push([i++, undefined]);
    else pairs.push([undefined, j++]);
  }
  while (i < a.length) pairs.push([i++, undefined]);
  while (j < b.length) pairs.push([undefined, j++]);
  return pairs;
}

function describeItem(item: MarkerContent): string {
  if (typeof item === "string") return `"${item.length > 50 ? `${item.slice(0, 47)}...` : item}"`;
  const attrs = Object.entries(item)
    .filter(([key]) => key !== "type" && key !== "marker" && key !== "content")
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  return `<${item.type}:${item.marker ?? ""}${attrs ? ` ${attrs}` : ""}>`;
}

/** Collect divergences between the oracle (`a`) and tokenizer output (`b`). */
function diffContent(a: MarkerContent[], b: MarkerContent[], path: string, out: string[]): void {
  for (const [ai, bi] of lcsAlign(a, b)) {
    if (ai !== undefined && bi === undefined) {
      out.push(`${path}[${ai}] oracle has ${describeItem(a[ai])} — tokenizer lacks it`);
    } else if (ai === undefined && bi !== undefined) {
      out.push(`${path}[+${bi}] tokenizer emits ${describeItem(b[bi])} — oracle lacks it`);
    } else if (ai !== undefined && bi !== undefined) {
      const x = a[ai];
      const y = b[bi];
      if (typeof x === "string" || typeof y === "string") {
        if (x !== y)
          out.push(`${path}[${ai}] text: oracle ${describeItem(x)} vs ${describeItem(y)}`);
        continue;
      }
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      keys.delete("content");
      for (const key of keys) {
        // Read via entries: MarkerObject has no index signature, and a direct cast trips TS2352.
        const xValue = Object.entries(x).find(([name]) => name === key)?.[1];
        const yValue = Object.entries(y).find(([name]) => name === key)?.[1];
        if (JSON.stringify(xValue) !== JSON.stringify(yValue))
          out.push(
            `${path}[${ai}]<${x.type}:${x.marker ?? ""}>.${key}: oracle=${JSON.stringify(xValue)} tokenizer=${JSON.stringify(yValue)}`,
          );
      }
      diffContent(
        x.content ?? [],
        y.content ?? [],
        `${path}[${ai}]<${x.type}:${x.marker ?? ""}>`,
        out,
      );
    }
  }
}

function corpusDivergences(usfmFile: string, usjFile: string): string[] {
  // Fragments never contain \id — strip it (and the oracle's book node).
  const usfm = readFixture(usfmFile).replace(/^\\id [^\n]*\n/, "");
  const oracle = JSON.parse(readFixture(usjFile)) as { content?: MarkerContent[] };
  const oracleContent = (oracle.content ?? []).filter(
    (item) => typeof item === "string" || item.type !== "book",
  );
  const tokenized = usfmFragmentToUsjContent(usfm);
  const diffs: string[] = [];
  diffContent(normalizeContent(oracleContent), normalizeContent(tokenized), "$", diffs);
  return diffs;
}

const CASES: { label: string; usfm: string; usj: string }[] = [
  { label: "testUSFM 2SA 1", usfm: "testUSFM-2SA-1.usfm", usj: "testUSFM-2SA-1.usj" },
  { label: "testUSFM 2SA 2", usfm: "testUSFM-2SA-2.usfm", usj: "testUSFM-2SA-2.usj" },
  {
    label: "testUSFM 2SA 3 (corrected oracle)",
    usfm: "testUSFM-2SA-3.usfm",
    usj: "testUSFM-2SA-3-corrected.usj",
  },
  { label: "web matthew 1-2", usfm: "web-matthew-1-and-2.usfm", usj: "web-matthew-1-and-2.usj" },
  {
    label: "web matthew 5",
    usfm: "web-matthew-5-section-header.usfm",
    usj: "web-matthew-5-section-header.usj",
  },
];

describe("usfmFragmentToUsjContent — testUSFM cross-oracle corpus (Paratext 9.5 USJ)", () => {
  it.each(CASES)("$label: zero divergence from ParatextData's own USJ", ({ usfm, usj }) => {
    // Each diff entry names its path and both sides, so a failure is self-diagnosing.
    expect(corpusDivergences(usfm, usj)).toEqual([]);
  });
});
