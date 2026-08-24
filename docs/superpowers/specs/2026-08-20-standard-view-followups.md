# Standard view: consolidated follow-ups (2026-08-20)

Everything deliberately left open after the `/review-paratext` pass over the two `standard-view`
branches — paranext-core [#2565](https://github.com/paranext/paranext-core/pull/2565) and
scripture-editors [#545](https://github.com/eten-tech-foundation/scripture-editors/pull/545).

**Why this file exists.** The open items were scattered across three places with different lifetimes:
the reported-bug register (this directory), the marker-styles re-sync plan's "Follow-ups" section
(paranext-core, `docs/superpowers/plans/2026-08-06-standard-view-marker-styles-resync.md`), and the
review summary at `paranext-core/.review/summary.md` — which is **gitignored**, so its only durable
copy was a PR description. This is the durable list. Items are recorded here whether they belong to
this repo or the host.

Nothing here blocks the branches except where marked. Each item says what it is, what it costs, and
what is recommended — a recommendation is not a decision.

---

## Blocking

### 1. Release sequencing — the host branch cannot build until this repo publishes

paranext-core's CI fails on all three platforms today: `dev-packages.json` pins this repo at
`platform-yalc`, which is 642 commits behind `standard-view`, and the npm pins (`~0.8.14` /
`~0.1.6`) resolve to published tarballs that export none of the new API. **Neither package version
here has been bumped**, and `manual-publish.yml` publishes straight off the committed
`package.json`.

Sequence: merge this repo → move `platform-yalc` onto its new `origin/main` → re-run host CI →
merge the host. Watch `paranext-core/.github/workflows/chromatic.yml`, which hardcodes
`ref: platform-yalc` independently of `dev-packages.json`.

---

## Needs an owner ruling

### 2. M3 — a milestone with content but no attribute bar

Deleting the `|` from `\qt1-s |stuff\*` dissolves the milestone into literal text. See the M3 entry
in `2026-08-19-reported-bug-register.md` for the measurement. The fix — eject as the pipe-present
branches do — reverses a deliberate "keep it literal" decision, and a C# capture test should first
confirm what ParatextData writes for this shape (the editor's USJ and the file on disk appear to
disagree, downstream of anything these repos can test).

### 3. Marker glyph contrast vs Paratext 9 parity

`rgba(140,140,140,1)` at `0.7em` is ≈3.4:1, and `.attribute-run` at `rgba(170,170,170,1)` is
≈2.3:1 — both below WCAG AA for text at that size, and these glyphs are the thing a user must read
and click precisely in Standard view. The small gray look is PT9 parity, so this is parity-vs-AA
rather than a defect.

**Recommended:** fold into item 5 — move the whole gray family onto theme tokens and pick a
light-theme value around `#767676` (4.54:1 on white), which still reads as "small gray". It diverges
visibly from PT9's exact color, so it wants sign-off.

### 4. Marker descriptions are user-visible labels but raw English

`defaultStyleInfo`'s descriptions come verbatim from `usfm.sty` and are rendered as the marker
palette's visible title, so every non-English user reads English marker names. They are not
localization keys, and their capitalization is inconsistent within one list ("File identification
information (BOOKID, …)" beside "Book Abbreviation"). An upstream-data question, not a code bug.

---

## Recommended, not yet done

### 5. Ship this package's CSS instead of hand-vendoring it

`packages/platform/src/usj-nodes.css` is hand-copied into **three** places in paranext-core, each of
which has drifted at least once (two were re-synced during this review; the third,
`platform-enhanced-resources`, is still drifted and out of scope — a read-only viewer that never uses
`marker-editable`). This is the root cause of the whole drift class. A subpath export, or importing
the CSS into the bundle, ends it.

Fold in at the same time: the `hsl(var(--muted-foreground, …) / α)` declarations, which are invalid
under Platform.Bible's token contract (`--muted-foreground` there is a complete `oklch(...)`, so the
wrapper resolves to `hsl(oklch(…) / 0.5)` and the read-only frame does not render). Both host copies
work around it with literal `rgba()` and a comment. `color-mix(in oklab, var(--muted-foreground) 50%,
transparent)` works with a complete color *and* with shadcn-style hosts, and would let the host drop
its divergence.

### 6. RTL arrow navigation under `dir="auto"`

`ArrowNavigationPlugin` reads `rootElement.dir || "ltr"`, but `TextDirectionPlugin` returns early and
never sets `dir` when the direction is `"auto"` — and the host forwards `"auto"`. So in an
auto-direction project every direction-sensitive behavior assumes LTR and arrows move the wrong
logical way for an RTL script.

**Pre-existing** — the `|| "ltr"` read predates the `standard-view` branch — but the branch added a
second read in the new shift-extend code, widening what depends on it.

**Recommended:** read `getComputedStyle(rootElement).direction` instead, which reflects what
`dir="auto"` resolved to and picks up CSS-set direction. Two lines, fixes old and new call sites at
once, but it changes caret behavior for RTL users and jsdom cannot validate it — do it with a real
RTL project on screen.

### 7. `generateUsjCss` emits physical properties

Physical `margin-left`/`margin-right` and `text-align: left|right`, swapped by an `rtl` option,
rather than logical `margin-inline-start`/`margin-inline-end` and `text-align: start|end`. Logical
properties would let one generated sheet serve both directions and stay correct if the container's
`dir` and the `rtl` flag ever disagree. The branch shows the habit elsewhere
(`toLogicalTextAlign`, the `padding-inline-start` table-row rule), which makes this look like an
oversight.

### 8. Host: state and affordances worth a second look

- **"Switch Scripture view" is a blind three-way cycle** in power mode with no indication of the
  current or next view; the code calls it "a temporary affordance… for QA".
- **`toggleFootnotesAutoShow` is per-tab** (`useWebViewState`) and shows no checked state, so a
  preference-worded toggle does not survive close/reopen. Consistent with its siblings — worth
  confirming that is intended.
- **Note-caller accessibility**: the caller `<button>` takes its accessible name from a native
  `title`, renders empty DOM text when the caller comes from a CSS counter, and carries no
  `aria-expanded` though `noteIsCollapsed` is available. Read-only opaque regions likewise carry
  `contentEditable="false"` with no role or label.

---

## Verification the headless suites cannot do

### 9. The hand-verification backlog

`2026-08-19-closeout-handoff.md` § "What you should verify by hand" — eight items, ordered by
importance, each with a note on why no headless test can answer it. Several were closed by the
owner's 2026-08-20 pass; the rest stand.

### 10. Task 7 of the marker-styles re-sync plan

`e2e-tests/tests/isolated/scripture-editor/standard-marker-glyph-styling.spec.ts` was specified in
full and never written. Task 6 (live visual check) was verified by hand on 2026-08-20, so the styling
is known-good *today* — but nothing automated will catch it regressing. No stylesheet is loaded in
any unit test in the host repo, so the existing pins can only assert the rules exist in the file,
never that they survive SCSS compilation, WebView style inlining, and the cascade.

### 11. Storybook's Chromium project is an intermittent CI failure source

A *different* handful of story files fails on each full-suite run in paranext-core — each taking
~22s (a timeout) under load versus <1s standalone, and every one passing in isolation. Run serially
(`--no-file-parallelism`) the project is 91/91 files green. CI parallelizes too, so this is a latent
flake source independent of these branches.

---

## Hygiene

Small, low-risk, and individually not worth a decision — listed so they are not rediscovered.
The full annotated list is in the review summary's "Minor" section (PR #2565's description).

- Barrel exports in `libs/shared/src/nodes/usj/index.ts` and `utils/usfm/index.ts` lost their
  alphabetical ordering for the newly added entries.
- `Justification.Both` is dead in the generated output — the vendored `usfm.sty` has no
  `\Justification Both`.
- `generate-2sa-lexical-states.test.ts` and `tools/usfm-markers/README.md` cite an `nx
  generate:test-data` target that does not exist (`pnpm generate:test-data` is the real one).
- `corpusRendering.test-helpers.ts` was not added to the lib-build `exclude` / spec `include` lists
  its three siblings were added to by name, and `package.json`'s `files` negations do not match
  `*.test-helpers.*`, so all four helpers ship in the tarball. A glob would be self-maintaining.
- `expectEveryTextBearingNodeRendered` and `expectTier2FixedPoint` assert `toEqual([])` with no guard
  that the traversal visited anything (latent — every current caller backstops it).
- `containerSelector` is the only caller-supplied string interpolated into `generateUsjCss`'s output
  without validation, while `fontName`, `color`, and the marker identifier all are.
- `defaultStyleInfo.ts.template` hard-codes its `styleInfo.js` import while `outputPath` is a schema
  option.
- Host: `navigation-history.spec.ts`'s new directory is reachable from `playwright-cdp.config.ts` but
  is not registered in `playwright.config.ts`, whose own convention comment requires it.
- Host: `footnote-editor.stories.tsx` is the first file to carry `tags: ['test']`, which activates
  real-Chromium Storybook tests inside `npm test`; a developer without `npx playwright install` hits
  a new failure mode.
- `"governing invariant I"` (5 sites) and `"Phase 1"` (5 uses in `tier2Rebuild.corpus.test.tsx`) are
  consistent terms of art rather than one-off breadcrumbs, so they were left alone; sweeping them
  partially would create inconsistency. Worth a repo-wide decision.

## Deliberately not doing

- **`virtualSettle.utils.ts` ↔ `tier2Rebuild.utils.ts`** — a 1,379-line hand-maintained serialized-JSON
  mirror. Two pieces are genuinely extractable, and `expectTier2FixedPoint` pins the mirror from only
  ~3 assertions. Real, large, and not worth the risk on this branch.
- **`markerEdit/`'s test layout** — 42 of 54 test files are scenario suites with no matching source
  module, against the repo's stated co-location convention. A `scenarios/` subdirectory would help;
  the churn would not.
- **`usfmFragmentToUsjContent`'s 632-line body** over ~15 mutable closure variables. A pure grouping
  refactor with zero user benefit on an already-large branch.
- **`MarkerEditPlugin`'s idle-settle clock** — left inline when the surrounding effect was split. It
  registers nothing and reads five effect-scoped `let`s that other handlers mutate, so extracting it
  means injecting ~6 getters for ~25 lines and risking a settle-timing change the suite may not catch.
