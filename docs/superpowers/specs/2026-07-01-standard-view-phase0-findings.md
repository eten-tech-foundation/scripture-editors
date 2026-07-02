# Standard View Phase 0 — Round-Trip Findings

Corpus: `packages/platform/src/editor/adaptors/corpus/`. Each entry below is a
round-trip failure discovered by the harness and NOT fixed in its discovery
task, with enough detail to plan the fix. Format per finding:

## <fixture name> [<view mode>]

- **Symptom:** (assertion diff summary — what property/content changed or was lost)
- **Suspected site:** (adaptor function, file:line)
- **Severity:** data-loss | data-change | cosmetic
- **Disposition:** fix-in-phase-0 | phase-2-engine | needs-node-type (spec §7 opaque blocks)

---

Known scope limitation: normalized-USFM byte equality (spec §10) is not
assertable in this repo (no TS USFM serializer); USJ deep-equality is the
Phase 0 proxy. Byte-level verification happens host-side in a later phase.

## Task 3 baseline run (2026-07-01)

All 3 baseline fixtures × 4 view modes (12/12) passed with no adaptor changes
required — no findings entries needed below the template above.

One fixture-authoring issue was found and corrected (not an adaptor bug): the
"baseline: footnote and cross-reference" fixture originally split a
`<para>`'s inline content across source lines, placing a newline+indentation
text node between `and after.` and the second `<verse>` marker. `usxStringToUsj`
preserves inter-element whitespace verbatim as USJ text content (it only
discards whitespace-only text between block-level siblings), so the
multi-line template literal would have produced a USJ content string
containing a literal `\n  ` — not something a real single-line-authored USX
document would produce. Fixed by joining that `<para>`'s content onto one
source line in `corpus-data.ts` (a single space now separates the two
sentences, matching normal USX authoring). `usxStringToUsj` was not modified.

## Task 4 run (2026-07-01)

Added six fixtures covering verse bridges/segments, ca/cp/va/vp
alternate/publishing numbers, `ref` cross-references, `optbreak`,
milestones (`ms style="ts-s"`/`"ts-e"`), and RTL (Hebrew) text. All
9 fixtures × 4 view modes (36/36) passed with no adaptor changes
required — no findings entries needed below the template above.

The "verse bridges and segments" fixture (the one Step 2 required to pass,
per the Task 2 `parseNumberFromMarkerText` fix) passed in all 4 modes on the
first run, confirming the Task 2 fix already covers this path.

Passes were independently verified (not just `toEqual` succeeding
vacuously): a scratch test dumped the intermediate USJ and the
round-tripped USJ for the ca/cp/va/vp, ref, optbreak, and milestone
fixtures and confirmed `altnumber`, `pubnumber`, `loc`, and the `ms`
markers are genuinely present in both and structurally identical, not
both-sides-empty.
