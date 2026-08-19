# Feedback round 6: the picked closer that saved nothing, and the regressed BookChapterControl

Owner-directed round (TJ, 2026-08-19), spanning BOTH repos on the `sv/fb6/closer-pick` worktree
pair. Two reported defects. Both are **decisions from earlier rounds that the owner has now
reversed**, and in both cases the earlier reasoning was not merely a matter of taste — it rested on
a measurement that was incomplete (defect 1) or on a claim about the code that does not hold
(defect 2).

---

## DEFECT 1 — a picked close-tag entry inserts nothing

**Report.** Text `\nd stuff| and things`, caret at `|` inside the open `\nd` span. Type `\nd`, press
Down to highlight the `\nd*` close-tag entry, press Enter. "It seems to close the `\nd` in editor
state without actually putting in an `\nd*`, so it doesn't save anything to file."

### The mechanism, re-measured — and worse than fb4 recorded

fb4 chose to land the literal for a TYPED `*` but keep the STRUCTURAL close
(`$closeCharSpanAtCaret`) for a PICKED entry, on the principle that "picking an entry is a
structural command; typing `\nd*` is text". It documented one divergence: at the span's **content
end** the structural close takes its "already effectively closed" branch — no split, no text
change, caret moves only.

That measurement was real but incomplete. Driving the picked entry through the mounted editor at
all three caret positions, on `\p \v 1 \nd stuff and things` with the span open
(`closed="false"`):

| caret | displayed bytes | USJ reaching the file |
| --- | --- | --- |
| content end | **unchanged** | **unchanged** — `closed="false"` intact |
| mid-content | **unchanged** | span truncated to `["st"]` + plain `"uff and things"`, **`closed="false"` KEPT**, no `\nd*` anywhere |
| after the span | **unchanged** | **unchanged** |

So two of three positions were total no-ops, and the third — the interesting one — silently
restructured the saved document while still writing no closing marker and still marking the span
unclosed. The owner's sentence describes that row exactly: the span "closes in editor state"
(the tree really did change) "without actually putting in an `\nd*`" (no bytes) so "it doesn't save
anything to file" (`closed="false"` survives into the USJ).

The past-the-span row is a third failure shape fb4 never named: outside the span
`$findCharNodeByEndMarker` finds nothing, `$closeCharSpanAtCaret` returns `false`, and the apply
**discards that return value** — the same discarded-refusal shape fb4 and fb5 had already flagged
for the over-a-selection case, still present at a caret.

Three ways to press one key, three ways to get nothing. A "No silent no-ops" violation
(invariant I) on all three.

### The fix: one closer, no second path

The `closeTag` branch of `$applyMarkerMenuSelection` now delegates to `$commitTypedCloser`
unconditionally — every selection shape, every caret position. `item.marker` is already the
endmarker, so the trailing `*` comes off before the primitive puts it back; a leading `+` is part of
a nested closer's bytes and stays (`+wj*` → `\+wj*`).

What the literal route produces at the same three positions, measured:

| caret | displayed bytes | USJ reaching the file |
| --- | --- | --- |
| content end | `\nd stuff and things\nd*` | `char nd content ["stuff and things"]`, `closed` GONE |
| mid-content | `\nd st\nd*uff and things` | `char nd content ["st"]` + plain `"uff and things"`, `closed` GONE |
| after the span | `\nd stuff and things\nd*` | `char nd`, `closed` GONE |

The engine, not the palette, decides what the bytes mean (invariant I), and its verdict matches
what the standalone tokenizer makes of the same displayed bytes — pinned by comparing against
`usfmFragmentToUsjContent` directly.

**The dead path is deleted, not left uncalled.** `$closeCharSpanAtCaret` had no other production
caller, and a well-tested helper whose doc comment calls itself "the marker-menu `closeTag` apply"
is an invitation to wire this defect straight back in. Gone with it, as they had no other callers
either: `$splitCharNodeAt` (exported, but only ever used here), `$findCharNodeByEndMarker`,
`$isLastContentChild`, `$selectAfterCharNode`. None was in the API report — no public API drift.

### Pinning the FILE, because a tree-only pin would have passed

The mid-content row is the reason the task insisted on this and the reason it mattered: the tree
genuinely changed there, so any assertion of the form "the span got shorter" was already green while
the saved document was still wrong. The new pins read the document the way a host save does:

- **`getUsj()`'s cached editor→USJ leg** — the read a settled document takes. Measured: the closer
  settles WITHIN the update for this shape (`getPendedDisplayOwners` stays empty), so this is the
  leg an ordinary save hits, and the pin asserts the empty pend set rather than assuming it.
- **`getUsj()`'s `$settledUsj` read-only leg** — reached by pending an UNRELATED edit elsewhere (a
  paragraph glyph rename with the caret left in it, the pend shape `settledGetUsj.test.tsx` uses),
  which models a host saving while another edit is still settling. `$settledUsj` returns `undefined`
  when nothing is pending, so this leg cannot be exercised on a fully settled document at all —
  worth knowing before trying to pin it directly.
- **the standalone tokenizer**, `usfmFragmentToUsjContent` over the displayed bytes, guarded by an
  assertion that the bytes actually contain `\nd*` so the comparison cannot pass by both sides
  agreeing the span is still open.

---

## DEFECT 2 — BookChapterControl regressed

**Report.** "BookChapterControl indeed does not work properly anymore; I believe it needs the Space
prop."

fb5 made `CommandInput`'s Space-on-empty-input synthesized click opt-in (`spaceSelectsHighlightedItem`,
default false) and deliberately left BCC out, on the reasoning that it "owns Space itself via its
`submitKeys` contract (`[' ', '-']`) plus its own `[cmdk-item][data-selected]` grid handler — a
second, independent implementation".

### What BCC's own handling actually does, and why it is not enough

**`handleInputKeyDown`** (the `onKeyDown` it passes to `CommandInput`) claims a key only when ALL
of: `submitKeys` is provided, AND it contains the key, AND `topMatch` exists, AND
`topMatch.chapterNum !== undefined`, AND `topMatch.verseNum !== undefined` — a **fully-qualified**
book+chapter+verse match. Three separate reasons that never fires on an empty input:

1. `submitKeys` has **no default**. It is `undefined` for every BCC embedding in the app except the
   scope-selector's range-**start** field (`RANGE_START_SUBMIT_KEYS = [' ', '-']`). Even the
   range-**end** field does not pass it.
2. An empty input has no top match at all (`calculateTopMatch('')` returns undefined).
3. A partial match ("GEN", "GEN 1") is deliberately declined as ambiguous.

**`handleCommandKeyDown`**, the `[cmdk-item][data-selected]` grid handler fb5 cited as the second
implementation, is gated on `viewMode === 'chapters' || viewMode === 'verses'`. The search input
renders **only in the books view**. It therefore never sees this key.

So both of BCC's own Space mechanisms are inert in exactly the state the shared patch served. fb5's
own correction note had the mechanism right — `onKeyDown` is destructured out of `props`, so the
spread cannot clobber it, and BCC "DID get the patch whenever its own handler declined" — it just
drew the wrong conclusion from it. Declining is not occasional here; on an empty input it is
universal. Without the patch, Space types a leading space into the book search.

**Fix:** BCC passes `spaceSelectsHighlightedItem`. The composition is unchanged — `CommandInput`
runs the caller's `onKeyDown` first and bails on `defaultPrevented` — so the range picker's
`submitKeys` still win when they apply.

### The regression test that did not exist

fb5 recorded that **no test anywhere asserted the patch**, which is precisely why removing it from
BCC escaped notice. Three now live in the component's own suite:

- **the regression itself** — Space on the empty input picks the highlighted book and the picker
  advances to chapters view. RED reproduced with the search input still mounted carrying
  `value=" "`: the space was typed as text.
- **Space stays ordinary once a query is typed** — the risk of opting in. `1 sam` must remain
  typeable or multi-word book names become unreachable.
- **`submitKeys` still win** — typing `MAT 5:3` then Space submits exactly ONCE, with the TYPED
  reference rather than the highlighted item's, proving the opt-in does not double-handle the key.

Per fb5's own cross-group finding, the visibility assertions use `toBeVisible()`, not
`toBeInTheDocument()`.

---

## Test changes (per the regression contract, per test)

**scripture-editors**

- `markerMenuApply.utils.test.tsx`, `closeTag kind`: the two collapsed-caret structural pins
  ("caret mid-span: left half styled, right half plain"; "closes the inner 'wj' … with '+wj*'") are
  **INVERTED** to literal-byte pins and joined by NEW content-end and outside-any-span cases. The
  trigger-cleanup pin (`literalPrefixLanded: true`) keeps its subject — cleanup ordering — with its
  assertion restated as the joined `Lo\nd*rd` shape. The over-a-selection pin is untouched.
- `commitTypedCloser.test.tsx`: NEW describe for the PICKED entry (4), covering the reported shape,
  both `getUsj()` legs, the tokenizer comparison, and mid-content/outside-the-span.
- `charFormatting.utils.test.tsx`: the whole `$closeCharSpanAtCaret` describe **DELETED** with the
  function.
- `settledGetUsj.test-helpers.tsx`: `mountStandardViewEditor` takes an optional `scrRef`
  (`applyMarkerMenuSelection` guards on it).

**paranext-core**

- `book-chapter-control.component.test.tsx`: NEW describe "Space on the empty search input" (3).

---

## Two things worth carrying forward

**A unit harness that runs the settle engine cannot pin "which bytes did this apply insert".** The
first attempt asserted the paragraph text after `$applyMarkerMenuSelection` returned, and the
marker-edit engine had already re-tokenized it — an open-span fixture with a trailing text sibling
had the sibling absorbed into the span on mount, and a nested `\+wj*` came back re-rendered as a
`\wj*` glyph. The pins now read the paragraph INSIDE the same `editor.update()`, right after the
apply. What the unit owns is which bytes go where; the engine's verdict on them belongs to the
end-to-end suite. (Same fixture lesson twice: an unclosed span is a shape the engine reworks on
mount, so node references captured in the fixture builder go stale — re-find from the root.)

**"It has its own implementation" needs to be checked against the state in question, not the
component.** BCC really does have two independent Space implementations; both are scoped to states
that are not the one the shared patch served. fb5's consumer census was right about every other row
and wrong about this one for that reason. When removing an app-wide behavior, the question is not
"does this consumer handle the key" but "does it handle the key in the state where the behavior
fired" — and the way to settle it is a test, which is what was missing.

---

## Gate

Editor link verified by md5 BEFORE trusting any core number — core's
`node_modules/@eten-tech-foundation/platform-editor/dist/index.js` matches
`packages/platform/dist/index.js` (`53e202ec…`) and exports `filterAndRankItems`. This round's
`npm install` wiped the link again, exactly as in fb5, and the symptom was again
`does not provide an export named 'filterAndRankItems'` — 10 core test files down before the relink,
zero after.

Ordering followed the toolchain rule: the SE test/lint/typecheck gate ran BEFORE `extract-api` and
`devpub`.

**scripture-editors**

- `nx run-many -t test --skip-nx-cache`: 9 projects — utilities 51, shared 537, shared-react 1550
  (+1 skipped), scribe 2, perf-react 3, platform-editor **1333 / 74 files / 0 skipped**.
  **145 files, 3476 passed, 1 skipped.** The single skip is the pre-existing shared-react
  unknown-items delta round-trip table case — **zero new skips**.
- `nx run-many -t lint typecheck --skip-nx-cache`: **exit 0**, warnings only, none in files this
  round touched.
- `nx run-many -t extract-api`: **no drift.** The whole change was internal —
  `$closeCharSpanAtCaret` was never in the API report.

**paranext-core**

- `npm test` (root): **exit 0 — 432 files, 5184 passed, 1 skipped** across 11 workspaces (renderer
  144/1887; platform-bible-react **143/1159**, up 3 from fb5's 1156 — the new BCC pins;
  platform-bible-utils 29/450 +1 pre-existing skip; and the rest). **Zero new skips.**
- `npx vitest run` from `extensions/`: **exit 0 — 100 files, 1486 passed, 0 skipped.**
- `npm run typecheck`: **exit 0**, after the standard `generate-dev-build-info.ts` fallback.
- `npm run lint`: **exit 0**; warnings only, and NONE of them in files this round touched
  (`eslint-plugin-paranext` needed its documented build fallback first, since the failed postinstall
  never reached that step).
- `platform-bible-react` dist rebuilt and committed with the source (fb2/fb3/fb4/fb5 precedent);
  verified the built bundle now carries BCC's `spaceSelectsHighlightedItem` call site, not just
  `CommandInput`'s declaration.

**Two toolchain notes for the next round.**

- `nx run-many -t test lint typecheck` in ONE invocation fails `@eten-tech-foundation/platform-editor:build`
  intermittently (Nx flags it flaky). `typecheck` is `tsc --build --emitDeclarationOnly` writing
  per-file `.d.ts` into `dist/`, while `build` is vite writing a rolled-up bundle to the SAME
  `dist/` — they collide. Running `-t test` and then `-t lint typecheck` as two invocations is
  green every time. The same collision is what makes a raw `npx tsc -p tsconfig.spec.json` in
  `packages/platform` produce a TS6305 wall while `nx typecheck` is green: the vite build has
  already replaced the per-file declarations the spec project references. Use the nx target.
- core's `npm install` postinstall fails at `link-dev-packages` when a sibling worktree already has
  `platform-yalc` checked out in the shared scripture-editors clone. Dependencies still install;
  only the yalc relink is skipped — which the editor→core loop redoes anyway.

---

## Cross-group findings

- **A structural command that writes no bytes cannot be saved.** This is the second time the
  standard-view engine's "displayed bytes ARE the document" invariant has been read as advice rather
  than as a constraint. Any apply that mutates tree structure without changing displayed bytes is
  invisible to serialization by construction. Worth sweeping the other structural applies for the
  same shape — the question to ask each is "what bytes does this write?", and a blank answer is the
  bug.
- **Pin the file, not the tree, wherever a fix is about "it doesn't save".** The mid-content row
  here is the proof: the tree really did change, so a tree assertion was already green while the
  saved USJ still carried `closed="false"`. Anywhere a defect is reported as a save/round-trip
  problem, the pin has to read through the same call the host's save does.
- **`$settledUsj` returns `undefined` when nothing is pending**, so the read-only save leg cannot be
  exercised on a settled document at all — a test that wants it must arrange a pend. Not obvious
  from the call site, and easy to write a green test that never touches the leg it names.
- **A unit harness that runs the settle engine cannot pin "which bytes did this apply write".**
  Read the tree inside the same `editor.update()` as the apply. Applies broadly to
  `markerMenuApply.utils.test.tsx`-shaped suites.
- **"This consumer implements it itself" must be checked against the STATE, not the component.**
  fb5's consumer census was right about six of seven rows and wrong about BCC because BCC does have
  two Space implementations — both scoped to states other than the one the shared patch served. The
  general form: when withdrawing an app-wide behavior, enumerate the states it fired in, not the
  components that have a handler. And write the test, which is the part that was missing.
- **fb5's `toBeVisible()` finding held up in use.** The new BCC pins assert visibility that way, and
  the chapters-view assertion is exactly the kind a hidden Radix ancestor could have faked.
- **The core side needed no change for defect 1, and that is a design result worth keeping.** Both
  hosts (the web view and the footnote popover) hand the original `MarkerMenuItem` straight to
  `EditorRef.applyMarkerMenuSelection`; the only place in all of core that inspects
  `kind === 'closeTag'` picks a display badge. One editor-side change fixed both surfaces, and
  core's own prose (`marker-palette-keydown.util.ts`: pressing `*` "commits the end state that entry
  would have applied") became true rather than aspirational.
