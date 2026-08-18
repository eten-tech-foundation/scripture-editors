# Feedback: idle (debounce) settle configuration — outcome

Branch pair: `sv/fb/settle-config` (scripture-editors + paranext-core), worked in the
`fb-settle-config` worktree pair. All four deliverables from TJ's feedback on the Standard-view
idle settle shipped.

## 1. Configurable idle settle delay (scripture-editors)

`EditorOptions.markerSettleDelayMs` (EXPERIMENTAL, public API report updated via extract-api),
plumbed `Editor.tsx` → `MarkerEditPlugin` as a wiring prop (a ref read at arm time — a changed
delay never tears the engine down or resets the app-placed-caret suppression window, and it takes
effect on the next arm rather than re-arming a ticking timer):

- `undefined` → the existing 1000ms default (`IDLE_SETTLE_DELAY_MS` is now the default, not the
  only value).
- `0` → the idle clock arms with zero delay: settles on the first timer tick after each editing
  commit (commit-adjacent, the departure settle's cadence on the timer clock).
- negative (canonically `-1`) → the idle clock is off entirely; only departure/Enter/blur/forced
  commit settle, the pre-idle-clock behavior.

Tests (debounceSettle.test.tsx, all red-then-green): custom 250ms replaces the default; `0`
settles on `advance(0)`; `-1` never idle-settles but departure still works; and a full-`<Editor>`
mount proving `options.markerSettleDelayMs` reaches the engine (would fail if any plumbing layer
dropped it).

## 2. Dev harness control (scripture-editors)

`demos/platform/src/app/app.tsx` (the `nx dev platform` harness): a "Marker settle delay" preset
select — Default (1000 ms) / Off (-1) / Immediate (0 ms) / 250 ms / 1000 ms — in the
defined-options block beside Structure protection, matching the harness's `.control` select style,
wired through the options memo. Verified by typecheck + lint + a production `nx build platform`
(the harness has no test convention).

## 3. Idle expiry overrides caret-position grace (scripture-editors)

TJ's repro: deleting the separator in `\wj asdf\wj*` (making `\wjasdf\wj*`) never settled on idle
— the idle clock passes `exceptKey=undefined`, but the grace arms re-pend based on CARET POSITION.
PT9's reformat settles globally on its tick; ours now does too.

Implementation: a `settleReason: "departure" | "idle"` threaded through `$resolvePendingMarkers`
into `$settlePendedDisplayOwner` (departure callers unchanged — the parameter defaults to
`"departure"`). On `"idle"`:

- the para-prefix separator re-pend arm (`$paraPrefixSeparatorCaretHeld`) does not re-pend, and
- the display-owner grace pre-pass (`$caretHoldsRunSite`) does not re-pend,

so held sites settle in place per the tokenize-identity rules. The caret does not move: both
rename cases restore the caret at the equivalent byte position inside the renamed glyph (asserted
at exact node + offset in the tests).

### Grace-override decision point (recorded per the task's escape hatch)

ONE grace arm proved load-bearing even on idle: a caret parked ON an emptied `AttributeRunNode`
husk (the element point Lexical collapses to when the user deletes a run's every byte — TJ's live
`\vp` deletion repro shape). Settling that shape destroys the caret's own node, and no
caret-preservation strategy held up:

- Plain skip: the rebuild cannot map an element point onto a rebuilt text offset → caret dumped at
  the paragraph start (the same live bug the grace originally fixed, now on the idle tick).
- Pre-parking the caret on the adjacent text node before removing the husk: the settle itself then
  restores the caret correctly, but a follow-on Lexical selection re-resolution (a queued commit
  with a dirty selection, one commit after the settle's fixed-point follow-up) snapped it back to
  the paragraph start anyway — reproduced deterministically under jsdom; root cause is in
  Lexical's DOM-selection re-derivation, not in the settle computation.

Decision: the husk shape KEEPS its grace on idle (`$caretOnEmptyHuskOf`, documented at the site
and on `SettleReason`); it settles on genuine departure exactly as before. Every other
caret-position grace yields to the idle tick. Pinned by a dedicated test (husk held through
`2 × delay`, caret untouched on the husk, then full settle on departure).

Tests: TJ's `\wj ⍽asdf\wj*` separator deletion settles on idle with the caret kept (exact glyph +
offset); twin test — partial advance + keep typing → no settle; para-prefix `\q2⍽body text` →
`q2body` rename on idle with caret kept; the husk carve-out test above.

## 4. Core experimental setting (paranext-core)

`platformScriptureEditor.markerSettleDelayMs` in the platform-scripture-editor extension:

- `contributions/settings.json`: property with `"default": null` (a JSON contribution cannot
  express `undefined`; the settings host requires a `default` key — `null` is the "unset" carrier).
- `contributions/localizedStrings.json`: en + es label ("Marker settle delay (ms)") and
  description, inserted preserving the file's existing key order.
- `src/types/platform-scripture-editor.d.ts` `SettingTypes`: `number | null`, TSDoc
  `@experimental`.
- `src/use-marker-settle-delay.hook.ts`: mirrors `useIsPowerMode`'s shape — `null`, loading, and
  PlatformError (warn) all → `undefined` (editor default); numbers (including `0`/`-1`) pass
  through.
- `src/platform-scripture-editor.web-view.tsx`: hook called beside the structure-protection state,
  value added to the `EditorOptions` memo (+ deps).

Test: `use-marker-settle-delay.hook.test.ts` (5 cases, red-then-green) per the extension's
mocked-`useSetting` hook-test convention. Typechecked against the devpub/yalc-linked editor
(0.8.15 local) carrying the new prop.

## Deviations from the brief

- Deliverable 3's "if some specific grace turns out load-bearing" clause was exercised: the
  emptied-husk carve-out above. Everything else settles on idle as specified.
- The demo control is a select with the suggested presets (off/-1, 0, 250, 1000) plus an explicit
  "Default" entry, rather than a numeric input — matches the harness's existing select style.

## Suite numbers

- scripture-editors: `nx run-many -t test lint typecheck` — all 10 projects green, 0 failures.
  Per-project tests: platform-editor 1209 passed; shared-react 1536 passed + 1 skipped
  (pre-existing table round-trip skip, editor-delta.adaptor.test.tsx, not this track's);
  shared 524; utilities 51; perf-react 3; scribe 2. `extract-api` clean across all 7 packages
  (platform API report gains the one new option).
  - debounceSettle.test.tsx: 12 passed (4 pre-existing idle tests + 4 delay-config + 4
    grace-override including the husk carve-out pin).
  - Targeted regression: damagedGlyphSettle, verseAdjacentTyping, typedMarkerResolution,
    verseAttributeSettle, charAttributeDeletionSettle, milestoneAttributeSettle,
    chapterAttributeSettle, markerEditComposed, markerEditTier1 — 122 passed, 0 failed.
  - Corpus: tier2Rebuild.corpus (141 paragraphs, 0 skip-listed), corpus-transform-fixed-point,
    corpus-round-trip, corpus-testusfm-round-trip, settledGetUsj — 183 passed, 0 new skips.
- paranext-core: `npm run typecheck` green (buildInfo.json regenerated first, per the known dev
  quirk); `npm test` 877/877 (62 files); extensions vitest suite (`npx vitest run` from
  `extensions/` — the root `--workspaces` pass does not cover it) 1487/1487 (100 files) including
  the 5 new hook tests; `npm run lint` green; the `extensions` webpack build compiled the web
  view against the yalc-linked editor 0.8.15 carrying the new prop.
