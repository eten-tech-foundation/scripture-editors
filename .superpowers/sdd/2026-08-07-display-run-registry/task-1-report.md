# Task 1 report: display-run descriptor type and the four attribute-run descriptors

## Summary

Implemented per the brief, TDD (test written and confirmed failing before the implementation).
Followed the brief's file plan exactly:

- Created `libs/shared/src/nodes/usj/displayRunDescriptor.ts` — verbatim from the brief's Step 1
  (the descriptor type, `DisplayRunKind`, `ExpectedRun`, `ScannedRun`, `SettleScope`,
  `DeletionPolicy`, `RunByteFormat`, `DisplayRunOwnerRef`, `DisplayRunDescriptor`).
- Created `libs/shared/src/displayRun/displayRunRegistry.ts`, `libs/shared/src/displayRun/index.ts`.
- Modified `libs/shared/src/nodes/usj/index.ts` (added the descriptor export after
  `attributeDisplay.utils.js`, exactly at the brief's named line) and
  `libs/shared/src/index.ts` (added `displayRun/index.js` after `converters/index.js`).
- Created `libs/shared/src/displayRun/displayRunRegistry.test.ts`.

All anchor signatures the brief cited were verified against the actual codebase before use and
matched exactly: `canonicalAttributeText` (:92), `milestoneAttributes` (:112), `$charClosingGlyph`
(:129), `$charAttributeDisplayNode` (:167), `$verseAttributeRunPieces` (:330),
`$milestoneAttributeRunPieces` (:651), `defaultMarkerAttribute` (:356), `milestoneDefaultAttribute`
(:396). The `nodes/usj/index.ts:17` and `libs/shared/src/index.ts:3` insertion points were also
confirmed correct.

## Deviations from the brief's illustrative code (both required to make it compile/pass; shape of
every Interfaces-block type is unchanged)

1. **`milestoneDescriptor.scanPieces` field-name mismatch.** The brief's Step 4 code returns
   `$milestoneAttributeRunPieces(owner)` directly from `scanPieces`, but that function's return
   type (`MilestoneRunPieces`) uses the fields `opening`/`attribute`/`closing`/`wrapper` — a
   *different* vocabulary from `ScannedRun`'s `opener`/`value`/`closer`/`wrapper` (confirmed at
   `attributeDisplay.utils.ts:624`). `$verseAttributeRunPieces`'s return type happens to already use
   `opener`/`value`/`closer`/`wrapper`, so the verse descriptor's identical-looking line type-checks
   as written, but the milestone one does not. Fixed by destructuring and renaming:
   ```ts
   scanPieces: (owner) => {
     if (!$isMilestoneNode(owner)) return NO_PIECES;
     const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(owner);
     return { opener: opening, value: attribute, closer: closing, wrapper };
   },
   ```
   This would have been a TypeScript compile error (`Property 'opening' does not exist on type
   ScannedRun`, or a structural mismatch) had it been used verbatim — never actually run to confirm,
   since I found and fixed it during the type-check-driven write.

2. **Test's milestone default-attribute assumption.** The brief's Step 2 test comment claims
   `qt-s`'s default attribute is `sid` (predicting the collapsed bare form `|q1`) but flagged this
   explicitly as needing confirmation. `milestoneDefaultAttribute` (`usfmFragmentToUsj.ts:396`)
   actually returns `"who"` for any name starting with `"qt"` — `sid` is not the default for `qt-s`,
   so a sole `sid="q1"` attribute does NOT collapse to bare form. Confirmed against an existing,
   already-passing test at `attributeDisplay.utils.test.ts:826` that builds the identical
   `qt-s`/`sid="q1"` case and asserts `${NBSP}|sid="q1"`. Updated the expected string to match (per
   the brief's own instruction: "adjust the expected string, not the shape of the assertion, if it
   differs").

3. **Test fixture gaps.** The brief's Step 2 test code, run as-is, fails structurally (not just on
   values) for two of its three cases:
   - The char-span case creates bare `$createCharNode(...)` nodes with no children. But
     `expectedPieces`'s char branch (correctly, per the brief's own Step 4 code and the
     `$charClosingGlyph` doc comment) short-circuits to "no run" when the span has no closing
     `MarkerNode` child — the adaptor never builds a run on a closer-less span. A childless
     `$createCharNode` therefore always reports `NO_RUN` regardless of attributes, which would make
     the "wants a run" assertion fail. Fixed by appending `$createMarkerNode(marker)`, content, and
     `$createMarkerNode(marker, "closing")` to each span before testing — mirroring the pattern used
     throughout `attributeDisplay.utils.test.ts` (e.g. its line-783 span construction) for exactly
     this reason.
   - The verse case does `$getRoot().append(verse)` directly, but `VerseNode extends TextNode`
     (`VerseNode.ts:44`), and Lexical's root node refuses non-element/non-decorator children
     ("`rootNode.splice`: Only element or decorator nodes can be inserted to the root node" at
     runtime). Fixed by wrapping the verse in `$createParaNode("p").append(verse)` before appending
     to root, matching how every other verse-node test in the package does it.
   - The milestone case (`MilestoneNode extends DecoratorNode`) needed no fixture change — root-level
     append works as written, and this test passed on first implementation run.

None of these deviations touch the Interfaces block's named types, exports, or file layout — every
name in the brief's Interfaces section (`DisplayRunKind`, `ExpectedRun`, `ScannedRun`, `SettleScope`,
`DeletionPolicy`, `RunByteFormat`, `DisplayRunDescriptor`, `DisplayRunOwnerRef`,
`displayRunDescriptors`, `displayRunDescriptor`) is unchanged, so later tasks importing against the
brief's Interfaces block are unaffected.

## TDD sequence followed

1. Wrote `displayRunDescriptor.ts` (type only, no behavior to fail).
2. Wrote the registry test importing from the not-yet-existing `displayRunRegistry.js`.
3. Ran it — confirmed the expected failure: `Failed to resolve import "./displayRunRegistry.js"`.
4. Wrote `displayRunRegistry.ts` (with the milestone-field-mapping fix above) and the `displayRun/index.ts`
   barrel, and wired both index-export insertions.
5. Ran the registry test — 2 of 3 failed (char: wrong short-circuit result from missing glyph
   fixture; verse: root-append runtime error). Diagnosed both against the actual `CharNode`/`VerseNode`
   implementations and existing test patterns, fixed the test fixtures (not the implementation) as
   detailed above.
6. Re-ran — 3/3 passed.
7. Ran the full `libs/shared` suite — 25 files, 361 tests, all green (nothing else moved).
8. Ran `nx typecheck` for `shared`, `shared-react`, `platform` — all clean (cache hits for
   unaffected upstream deps, fresh run for `shared`/`shared-react`/`platform` itself).
9. Ran `nx lint` for `shared`, `shared-react`, `platform` — 0 errors on all three (pre-existing
   `no-console` / `no-loop-func` warnings only, all in files this task never touched).
10. Ran the full `packages/platform` suite (44 files, 775 tests) — all green, including:
    - `tier2Rebuild.corpus.test.tsx`: stdout confirms "checked 141 paragraph(s), 0 skip-listed" —
      the 141/141 corpus gate.
    - The wave-4 settle suites: `settledGetUsj.test.tsx` (20), `verseAttributeSettle.test.tsx` (8),
      `milestoneAttributeSettle.test.tsx` (7), `optbreakDeletionSettle.test.tsx` (1),
      `charAttributeDeletionSettle.test.tsx` (7) — all passing.
11. Ran the full `libs/shared-react` suite — 23 files, 1388 tests passed, 2 pre-existing skips.

## Verification evidence

- `pnpm vitest run displayRunRegistry` (libs/shared): 3/3 passed.
- `pnpm vitest run` (libs/shared): 25 files, 361/361 passed.
- `pnpm vitest run` (libs/shared-react): 23 files, 1388 passed, 2 skipped.
- `pnpm vitest run` (packages/platform): 44 files, 775/775 passed; corpus gate "checked 141
  paragraph(s), 0 skip-listed".
- `pnpm nx run shared:typecheck` / `shared-react:typecheck` / `platform:typecheck`: all clean.
- `pnpm nx run shared:lint` / `shared-react:lint` / `platform:lint`: 0 errors on all three.

## Files touched

- Created: `libs/shared/src/nodes/usj/displayRunDescriptor.ts`
- Created: `libs/shared/src/displayRun/displayRunRegistry.ts`
- Created: `libs/shared/src/displayRun/displayRunRegistry.test.ts`
- Created: `libs/shared/src/displayRun/index.ts`
- Modified: `libs/shared/src/nodes/usj/index.ts` (1 line inserted)
- Modified: `libs/shared/src/index.ts` (1 line inserted)

## Commit

`96d75fbd` — `feat(shared): display-run descriptor type and the four attribute-run descriptors`
(pre-commit hook ran prettier on the staged files, reformatting some line-wraps in
`displayRunRegistry.ts`; re-ran the registry test after the commit to confirm the reformatted file
still passes — it does).

## Status for downstream tasks

Nothing yet consumes `displayRunDescriptors` / `displayRunDescriptor()` — this task only adds the
type, the four descriptors, and their tests. Existing behavior is byte-identical (confirmed via the
full green suites above). `ownerOf` on all four descriptors is a stub (`() => undefined`) per the
brief's own comment — Task 2 ("one owner walk, marker-tightened") is expected to fill it in.

## Fix note (review round 1)

The task review approved the foundation's fidelity to the brief but flagged three coverage/hygiene
gaps, plus one wrong claim in this report. All four addressed; re-verified full green.

### Report correction: the "TypeScript would catch it" claim above (deviation 1) is WRONG

Deviation 1 above says the untranslated `scanPieces: (owner) => $milestoneAttributeRunPieces(owner)`
"would have been a TypeScript compile error... had it been used verbatim." **That is false, and the
review correctly called it out.** Proven directly: I reverted `milestoneDescriptor.scanPieces` to
exactly that untranslated one-liner and ran `pnpm nx run shared:typecheck --skip-nx-cache` —
**zero errors.** The reason: `MilestoneRunPieces` (`opening?`/`attribute?`/`closing?`/`wrapper?`)
and `ScannedRun` (`opener?`/`value?`/`closer?`/`wrapper?`) are both entirely optional-field types.
TypeScript's excess-property check — the mechanism that would normally reject an object with
unexpected keys — only fires on a *fresh object literal* being assigned or returned directly; it does
not fire on a value flowing through a function call like `$milestoneAttributeRunPieces(owner)`. And
since `ScannedRun` has no *required* field, there is nothing for the missing `opener`/`value`/`closer`
to violate either. The wrong shape is therefore structurally assignable and compiles silently — the
bug would have shipped as a descriptor whose `scanPieces` reads `opener`/`value`/`closer` as
`undefined` forever, with no compiler signal, ever. This is now recorded directly in
`displayRunRegistry.ts`'s `milestoneDescriptor.scanPieces` comment so the next reader doesn't rely on
the compiler to protect this translation, and the correction above supersedes the original,
inaccurate deviation-1 text (left in place, uncorrected, so the historical record of what the brief's
literal code actually does is intact — this note is the fix).

### Finding 1 (coverage): `scanPieces` had zero tests across all four descriptors — fixed

Added a new `describe("displayRunRegistry scanPieces", …)` block to
`displayRunRegistry.test.ts` with one test per registered kind, each building that kind's canonical
(post-flip, `AttributeRunNode`-wrapped where applicable) run shape and asserting the descriptor's
`scanPieces` output against an exact `opener`/`value`/`closer`/`wrapper`-named object via `toEqual`
(not `toMatchObject` — `toEqual` is what fails on both a missing correctly-named field AND a leftover
wrongly-named one, which is exactly what makes it catch the deviation-1 bug):

- **char**: a span with an attribute-tagged (`textTypeState === "attribute"`) `TextNode` child
  between its opening/closing `MarkerNode`s → `scanPieces` returns `{ value }` only (char's format
  never carries opener/closer/wrapper).
- **va**: a verse with its `\va` run built as the canonical `AttributeRunNode` wrapper (opener/
  value/closer children) riding directly after the verse → `scanPieces` returns
  `{ opener, value, closer, wrapper }` with the exact node references.
- **vp**: the same shape, but anchored after `\va`'s own wrapper (mirrors `$verseRunAnchor`'s
  `marker === "vp"` branch) — pins that the vp scan doesn't accidentally pick up va's pieces.
- **milestone**: a milestone with its run built as the canonical wrapper (`opening`/`attribute`/
  `closing` MarkerNode+TextNode+MarkerNode children) → `scanPieces` returns the TRANSLATED
  `{ opener, value, closer, wrapper }`. **Regression-proofed**: I temporarily reverted the
  implementation to the untranslated one-liner and re-ran the suite — this specific test failed
  (missing `opener`/`value`/`closer`, diff showed the raw `MarkerNode`/`TextNode` objects unmatched),
  confirming the test actually catches the exact bug this task introduced and fixed. Then restored
  the correct implementation and re-ran — 8/8 pass.

### Finding 2 (coverage): the throw-on-miss contract was untested — fixed

Added `describe("displayRunDescriptor lookup", …)` with one test: `displayRunDescriptor("optbreak")`
(a valid `DisplayRunKind` this task never registers) throws with message
`No display-run descriptor registered for kind "optbreak"`, pinning both the throw and the
documented message shape from `displayRunRegistry.ts`'s `displayRunDescriptor` doc comment.

### Finding 3 (trivial): `ownerOf: () => undefined` stub comment only on `verseDescriptor` — fixed

Rather than repeating the one-liner on `charDescriptor` and `milestoneDescriptor` too (verse's
comment already covers both `va` and `vp`, since both come from the single `verseDescriptor(marker)`
factory), hoisted the explanation into the module-level doc comment at the top of
`displayRunRegistry.ts` — it now states once, for all four descriptors, that `ownerOf` is a
deliberate `() => undefined` stub pending the owner-walk task. Removed the now-redundant inline
comment from `verseDescriptor`. All four `ownerOf` sites now read identically:
`ownerOf: () => undefined,` with no per-site comment, and the rationale lives in one place.

### Re-run verification (all foreground, same commands as before)

- `pnpm vitest run displayRunRegistry` (libs/shared): **8/8 passed** (was 3; +5 new: 4 scanPieces
  tests, 1 throw-on-miss test).
- `pnpm vitest run` (libs/shared, full suite): **25 files, 366/366 passed** (was 361; +5, nothing
  else moved).
- `pnpm nx run shared:typecheck --skip-nx-cache`: clean.
- `pnpm nx run shared:lint --skip-nx-cache`: **0 errors**, same 23 pre-existing `no-console`
  warnings in unrelated files (none in `displayRun/` or the new test additions) — import ordering
  for the four new imports (`textTypeState`, `$createAttributeRunNode`, `$setState`) passed lint
  as written, no `eslint --fix` reordering needed.

### Commit

`be78958b` — `test(shared): close scanPieces + throw-on-miss coverage gaps in the display-run
registry`, on top of `96d75fbd`, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`,
not pushed.
