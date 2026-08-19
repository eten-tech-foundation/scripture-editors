# Feedback round 5: palette filter display, key ownership, closing markers over a selection

Owner-directed round (TJ, 2026-08-19), spanning BOTH repos on the `sv/fb5/palette-keys` worktree
pair. Three reported defects plus a fourth added mid-round by the owner. Two of the three had root
causes in a different layer than the report suggested, and one of them was invisible to the existing
tests by construction.

---

## DEFECT 1 — the collapsed-caret palette's search bar filters to nothing

**Report.** `\` mid-paragraph with no selection, type `nd`: the search bar shows `nd` but the list is
EMPTY — yet Enter still correctly inserts `\nd \nd*`. Typing `asdf` correctly shows "No results
found". So the session's filtering and commit were right while the rendered LIST was wrong.

**The prime suspect was wrong.** The task suspected double filtering — the visible `CommandInput`
feeding cmdk's own containment filter IN ADDITION to the session filter. That is not what happens:
passive mode renders its items as PLAIN `div`s (`PassivePaletteItem`), never `CommandItem`s, so
cmdk's filter has nothing registered to filter and cannot eliminate anything.

**The real mechanism: cmdk hides the GROUP, not the items.** From the installed cmdk (`Group`'s
render predicate, `node_modules/cmdk/dist/index.mjs`):

```js
render = forceMount || context.filter() === false ? true
       : state.search ? state.filtered.groups.has(id)
       : true
```

Three facts compose into the bug:

1. `GroupedItems` wraps items in a real cmdk `CommandGroup` in BOTH modes — including the
   single-default-group case.
2. cmdk's `Input` pushes a CONTROLLED `value` into the store's `search` state. Hoisting the search
   input into the passive branch (fb4's Issue 1) therefore made `state.search` non-empty for the
   first time in passive mode, even though the input is `readOnly`.
3. The passive `Command` did not pass `shouldFilter={false}` (only the active branch did), so
   `context.filter()` is cmdk's default filter — not `false`. With `search` non-empty and no
   cmdk-registered items, `filtered.groups` is empty, so **every group renders `hidden`**.

The items were in the DOM the whole time, just inside a hidden group. That also explains the exact
asymmetry TJ described: the passive "No results found" element is rendered OUTSIDE the group (it is
the `filteredItems.length === 0` branch), so it kept displaying correctly.

**Why no test caught it, and the test-shape lesson.** Every existing passive-filter pin asserts
`toBeInTheDocument()`, which is true of a node inside a `hidden` ancestor. The new pins assert
`toBeVisible()` — jest-dom's visibility check walks ancestors and honors `hidden`. Reproduced RED
with `Received element is not visible`.

**Fix.** One prop: `shouldFilter={false}` on the passive `Command`, so BOTH branches bypass cmdk
filtering entirely and the rendered list is exactly the session's own filtered+ranked
`filteredItems`. Nothing else moved.

**Not regressed** (all still green): exact-first ranking, the "No results found" state, zero-match
Enter staying open, and the "never steals focus on mount" pin.

---

## DEFECT 2 — key ownership (the split brain)

### 2a. The `CommandInput` Space patch becomes opt-in

`lib/platform-bible-react/src/components/shadcn-ui/command.tsx` carried an UNCONDITIONAL patch:
Space on an EMPTY input synthesises a click on the highlighted cmdk item. `git log -L` shows a
single author commit — the markers-checklist P3 work — and it has applied to every `CommandInput` in
the app ever since.

Now a prop, `spaceSelectsHighlightedItem`, **defaulting to false**.

**Consumer census (7 production call sites) and who opted in:**

| Call site | Opted in? | Why |
| --- | --- | --- |
| `ProjectSelector` | **yes** | markers-checklist picker; list is the point, a leading space is meaningless |
| `SelectBooksPicker` | **yes** | created by the same markers-checklist commit; same picker semantics |
| `BookChapterControl` | no | owns Space itself via its `submitKeys` contract (`[' ', '-']`) plus its own `[cmdk-item][data-selected]` grid handler — a second, independent implementation |
| `MarkerMenu` | no | marker-palette family; its owner claims Space |
| `OverlayCommandPalette` | no | marker-palette family; Space is forwarded to the session (2b) |
| `ComboBox` | no | generic combobox; Space-picks-highlighted here was collateral from the app-wide patch |
| `MultiSelectComboBox` | no | same, and it backs the generic `Filter` component |

**No test anywhere asserted the patch** — verified by sweeping for `data-selected`, `key: ' '`,
`code: 'Space'`, `keyCode: 32` across all non-`node_modules` source, including e2e. Every hit was
something else (the document-level marker-palette table, native button activation). The e2e helpers
that wait on `[cmdk-item][data-selected="true"]` commit with **Enter**, so they are insensitive to
this change. A new `command.test.tsx` now pins all four cells: off by default, on when opted in,
inert on a non-empty input, and vetoable by a caller's own `onKeyDown`.

**One correction to the pre-round analysis.** It was suggested that `{...props}` overwrites the
custom `onKeyDown`, leaving `BookChapterControl` already opted out. It does not: `onKeyDown` is
destructured out of `props`, so the spread cannot contain it, and the composition
(`onKeyDown?.(event)` then bail on `defaultPrevented`) has always worked. BCC therefore DID get the
patch whenever its own handler declined the key — which is exactly the empty-input case, since its
handler only claims a submit key once the typed text resolves to a full reference. Leaving it out is
a real behavior change there, and a deliberate one.

### 2b. Forwarded keys — how much plumbing this actually needed

**Nothing existed.** Traced end to end: `CommandPaletteRequest` had no callback of any kind and no
function-typed field; `IOverlayService` had no method reporting anything from the overlay back to
the requester. The only requester-visible channel was the `showCommandPalette` promise resolving
once with a selected id. Every existing use of the word "forward" in this codebase is
requester → overlay (`updateCommandPalette` carrying keystrokes the extension already claimed). The
one keystroke transport in the app, `platform.onDidAppWindowInput`, is main → renderer, deliberately
carries NO key identity (documented security constraint), and does not reach the requester anyway.
So this is genuinely new plumbing.

**It is small, because the overlay is in-process.** WebViews are same-origin `srcdoc` iframes that
share the renderer's `papi` object, and `papi.overlays` is the plain host object rather than a
network proxy — so a callback can be passed directly, with no serialization step. Total new
plumbing:

1. `ForwardedPaletteKeyEvent` + `PaletteKeyForwarding` in `platform-bible-utils`'s
   `palette.types.ts`, beside the existing `PaletteDriver` (exported from `experimental.ts`).
2. One optional field on `CommandPaletteRequest`: `keyForwarding?: PaletteKeyForwarding`.
   `papi.d.ts` drift: **21 added lines, nothing changed or removed.**
3. One prop on `OverlayCommandPalettePresentational`, passed through by the store-connected
   component, plus one branch at the top of the palette's existing `handleKeyDown`.
4. `getMarkerPaletteClaimedKeys(kind)` exported from the shared keydown table.
5. Each session owner: pass `keyForwarding` when showing, and route its own capture-phase listener
   through the SAME handler.

**One reuse that mattered.** `handleMarkerPaletteSessionKeyDown` already centralized every
while-open key semantic. Its parameter type was widened from DOM `KeyboardEvent` to the structural
`MarkerPaletteKeyEvent` (= `ForwardedPaletteKeyEvent`) — a real `KeyboardEvent` is structurally
assignable to it, so ONE handler now serves both entry points and the focused and unfocused halves
of a session cannot diverge in semantics. That is the whole reason the change stayed this small.

**The design decision the task left open: which keys to declare.** The task named a minimum of
Space, Enter, Escape, Tab and `*`. That minimum is not sufficient, and the reason is worth
recording: the session's `filter` is the ONLY record of what the user typed, and every commit
resolves from it (`commitTyped`, `commitItem`'s exact match, `commitTypedCloser`). Forwarding only
the commit keys would leave typed characters in the palette's own input, and Space would then commit
an EMPTY query while the screen showed a full one. So a session declares the FULL set it claims —
control keys plus its filter alphabet — which makes it the single owner of the query in both focus
states, exactly as the passive palette already is. `getMarkerPaletteClaimedKeys` derives the list
from `FILTER_CHAR_REGEX` and the table's own branches so the two cannot drift; pure modifiers are
excluded (the table only passes them, and claiming them would break `+` chords).

**The overlay forwards; it never claims on the session's behalf.** The session decides, via the
forwarded event's `preventDefault`/`stopPropagation`. An unclaimed forwarded key still behaves
normally, and cmdk's own navigation is skipped only because cmdk checks `defaultPrevented` after
calling the root `onKeyDown`.

**The two previously-broken branches, pinned end-to-end** through the REAL keydown table (not a
stand-in), in `overlay-command-palette.component.test.tsx`. Both confirmed RED by disabling the
forwarding branch:

- overlay-focused + NON-EMPTY filter + Space → `commitItem('nd')`, the ratified selection wrap.
  RED reason: `expected "spy" to be called with arguments: [ 'nd' ]` — the wrap never happened.
- overlay-focused + EMPTY filter + Space → no commit of the highlighted entry, and the session's own
  visible refusal runs. RED reason: `expected "spy" to be called at least once` (`dismiss`) — the
  key never reached the session at all.

Plus: typed characters route into the SESSION filter; Escape reaches the session instead of
dismissing locally; and an un-declared key still gets the palette's local handling.

---

## DEFECT 3 — closing markers over a selection

Two paths that disagreed; they now agree, and **collapsed-caret behavior of both is untouched** —
including the measured content-end divergence fb4 documented.

**(a) TYPED `*` over a selection.** Was scoped to a collapsed caret and merely filtered. Now:
delete the selection, insert the typed closer. Paratext 9 behavior — the closer is unmatched unless
an open `\nd` precedes it.

**(b) PICKED `closeTag` entry over a selection.** Was a SILENT NO-OP: `applyMarkerMenuSelection` →
`$closeCharSpanAtCaret`, which requires a collapsed selection and whose `false` return the apply
discards. RED reproduced the no-op exactly — document unchanged at `\p \nd Lord God\nd*`. Now the
same delete-then-insert as (a). A "No silent no-ops" violation closed.

**One implementation.** `$commitTypedCloserAtCaret` was renamed `$commitTypedCloser` (the caret
restriction is gone; internal, not in the API report) and now refuses only when there is no range
selection at all. Lexical's `insertText` already replaces a non-collapsed range, so the delete and
the insert are literally the same call. The `closeTag` branch strips the entry's trailing `*`
(`nd*` → `nd`, `+wj*` → `+wj`) and delegates, so a picked closer and a typed one produce identical
bytes over a selection.

**Both surfaces pinned.** Editor palette: `commitTypedCloser.test.tsx` (selection replaced, caret
after the closer, and a closer over a selection INSIDE an open span still closes that span);
`markerMenuApply.utils.test.tsx` (the picked entry); `markerMenuHarness.test.tsx` (`*` over a
selection deletes and commits — the fb4 pin "`*` still FILTERS over a selection" is INVERTED, owner-
directed). Host palette: `marker-palette-keydown.util.test.ts` (the `'selection'` kind's `*` pin
inverted the same way) and a new `footnote-editor.component.test.tsx` popover pin proving the
`applyMarkerMenuSelection` wrap is NOT taken.

`*` is consequently no longer a filter character in any session kind.

---

## DEFECT 4 — `\` commits what was typed and reopens the palette

Added mid-round by the owner: "typing `\qt-s` then backslash just inserts a backslash. I'd like it
to insert the full `\qt-s` and then open a new palette for the new backslash… But if you type
backslash and then backslash again, insert the backslash but don't open the palette again."

**Semantics.** With a NON-EMPTY filter, `\` commits what was typed exactly as Space does — same
passive-Space end states — but with NO terminating space, then opens a FRESH session at the
resulting caret. With an EMPTY filter there is nothing to commit: the backslash lands as an ordinary
character and no palette reopens.

### The byte shape, measured rather than assumed

The open question was whether the trigger backslash should LAND (making the bytes `\qt-s\`, which
would terminate the marker name unambiguously). Six probes against the real engine settled it:

| typed | settled |
| --- | --- |
| `\nd ` at a caret (today's Space commit) | `char nd closed="false"` |
| `\nd` at a caret (no space) | `char nd closed="false"` — **identical** |
| `\nd\` at a caret | `char nd closed="false"` with **content `["\\"]`** — the backslash becomes span content ❌ |
| `\nd\world` mid-text | `char nd` and **"world" dropped from the USJ** ❌ |
| `\ndworld` mid-text (unseparated, letters follow) | glued; `ndworld` unknown, dropped |
| `\nd` then `\wj ` mid-text | recovers to `nd` + `wj` spans with "world" intact |

So landing the trigger is strictly WORSE than not landing it, and the active-palette rule ("the
trigger never lands") is confirmed by measurement rather than convention. No trailing space is
byte-equivalent at a caret; the one shape where it differs is mid-text with marker-name characters
immediately following, where the literal glues until the next commit lands — and the reopened
session's own commit supplies the terminating `\`, which the last row shows resolves it. If the user
escapes instead, what remains is exactly the bytes they typed (governing invariant I).

**One implementation, parameterized.** The opener commit was extracted to `$commitTypedMarker(typed,
{ trailingSpace })` beside `$commitTypedCloser`, and `EditorRef.commitTypedMarker` gained
`options?: CommitTypedMarkerOptions`. In `UsjNodesMenuPlugin` the harness's Space branch and the new
`\` branch share one `commitTypedQuery(typed, items, trailingSpace)` helper, so the note-marker
routing cannot apply to one key and not the other.

**Two implementation findings worth carrying forward:**

- **The reopened menu must be REMOUNTED.** `NodeSelectionMenu` keeps its own internal query, so a
  reopen that only replaced `menuState` started the new session pre-filtered by the marker just
  committed (observed: `\nd` then `wj` + Space produced no `wj` span, because the query was
  `ndwj`). `MenuState` now carries a monotonic `session` id used as the component's React `key`.
- **The unspaced commit settles on the DEFERRED clock.** With no terminating separator the bytes
  land immediately but the span materializes on the engine's later settle pass (invariant IV, two
  clocks), so the pins await the end state instead of reading it synchronously. The spaced Space
  commit settles inside the update; this is a real, documented difference between the two keys.

**Scope.** `\` commit-and-reopen is scoped to the collapsed-caret `\` palette. Over a selection the
opening commit is the WRAP, which consumes the selection and leaves nothing for a second marker to
attach to.

**One pre-existing pin inverted, owner-directed.** `markerMenuHarness.test.tsx`'s re-entrancy guard
asserted that a second `\` while open keeps the menu open and is swallowed. The owner's stated
(and liked) behavior is the host palette's: the backslash LANDS and no palette reopens. The harness
now matches; the re-entrancy property the test actually guards (the trigger branch never rebuilds
menu state mid-session) is unchanged and still asserted.

---

## Test changes (per the regression contract, per test)

**scripture-editors**

- `commitTypedCloser.test.tsx`: "refuses a non-collapsed selection" → **INVERTED** to
  delete-and-insert, plus a new closer-over-a-selection-inside-an-open-span case.
- `commitTypedMarker.test.tsx`: NEW — `trailingSpace: false` emits no separator; and settles to the
  SAME open span the spaced commit produces (the measured equivalence the design rests on).
- `markerMenuApply.utils.test.tsx`: NEW closeTag-over-a-selection case (the silent no-op).
- `markerMenuHarness.test.tsx`: "`*` still FILTERS over a selection" → **INVERTED**; NEW describe
  "`\` commits the typed marker and reopens the palette" (3); re-entrancy guard's first half
  **INVERTED** (see Defect 4).
- Not touched: every other ratified pin, including the selection-wrap matrix and the `*`
  collapsed-caret describe.

**paranext-core**

- `overlay-command-palette.component.test.tsx`: NEW visibility pins (ungrouped + grouped) that the
  old `toBeInTheDocument` shape could not have caught; NEW describe "key forwarding" (5), including
  the two previously-broken Space branches.
- NEW `command.test.tsx` (4): the opt-in matrix for the Space patch.
- `marker-palette-keydown.util.test.ts`: selection `*` pin **INVERTED** to a commit; NEW `\`
  commit-and-reopen, `\` on an empty filter, and `\` declining in a selection session; NEW describe
  `getMarkerPaletteClaimedKeys` (3).
- `footnote-editor.component.test.tsx`: `show()` assertion extended with the forwarding declaration;
  NEW `*` over a selection, `\` commit-and-reopen, `\` on an empty filter.

---

## Gate

Editor link verified by md5 BEFORE trusting any core number: core's
`node_modules/@eten-tech-foundation/platform-editor/dist/index.js` matches
`packages/platform/dist/index.js` and contains `filterAndRankItems`. The round's initial
`npm install` had wiped the link, which surfaced exactly as fb4 predicted
(`filterAndRankItems is not a function`).

Ordering followed the toolchain rule: the SE test/lint/typecheck gate ran BEFORE `extract-api` and
`devpub`, so no stale rolled-up `dist` produced bogus TS6305 errors.

**scripture-editors**

- `nx run-many -t test --skip-nx-cache`: 9 projects — utilities 51, shared 537, shared-react 1541
  (+1 skipped), scribe 2, perf-react 3, platform-editor **1325 / 73 files / 0 skipped**.
  **144 files, 3459 passed, 1 skipped.** The single skip is the pre-existing shared-react
  unknown-items delta round-trip table case — **zero new skips**.
- `nx run-many -t lint typecheck --skip-nx-cache`: **exit 0**.
- `nx run-many -t extract-api`: two-line drift (`CommitTypedMarkerOptions`, the `commitTypedMarker`
  signature), committed with the feature.

**paranext-core**

- `npm test` (root): **exit 0 — 432 files, 5181 passed, 1 skipped** across 11 workspaces (renderer
  144/1887; platform-bible-react 143/1156; platform-bible-utils 29/450 +1 pre-existing skip; and
  the rest). Zero new skips.
- `npx vitest run` from `extensions/`: **100 files, 1486 passed, 0 skipped** — re-run AFTER the web
  view refactor, not before it.
- `npm run typecheck`: green, after the standard `generate-dev-build-info.ts` fallback.
- `npm run lint`: **exit 0**; warnings only, and after a prettier pass NONE of them are in files this
  round touched. (`eslint-plugin-paranext` needed its documented build fallback first.)
- `npm run build:types`: papi.d.ts regenerated, +21 lines, committed.
- `platform-bible-react` and `platform-bible-utils` dists rebuilt and committed with the source
  (fb2/fb3/fb4 precedent).

**Suite flakiness, characterized rather than waved off.** Mid-round, two standalone PARALLEL runs of
`platform-bible-react` failed a ROTATING pair of files — `footnote-editor.palette-commit.test.tsx`
both times, and once `book-chapter-control.component.test.tsx`. Both passed in isolation, and the
identical suite with `--no-file-parallelism` was fully green, which is what identified it as an
environment interaction rather than a regression: this is the latent cross-file DOM-state
dependency fb4 characterized in this suite (vitest's thread pool reuses a worker across files), now
shown to reach a second file. It did NOT reproduce in the final root `npm test` run, where
platform-bible-react passed 143/1156 in parallel. Not introduced here; worth hardening separately.

---

## Cross-group findings

- **`toBeInTheDocument()` cannot see a hidden ancestor.** An entire family of passive-palette filter
  pins was green while the feature was visibly broken. Anywhere a test asserts "the right things are
  shown", `toBeVisible()` is the assertion that means it. Worth a sweep.
- **cmdk's `Group` hides on `search` alone.** Any component that renders non-cmdk children inside a
  `CommandGroup` while a `CommandInput` is present MUST pass `shouldFilter={false}`, or its list
  empties as soon as anything is typed. This is a trap for every future "custom list inside cmdk
  chrome" component, not just this palette.
- **A shared UI primitive silently owning a key is a whole bug class.** The Space patch was added
  for one feature and applied app-wide; it then quietly outranked a palette that had its own Space
  semantics. Worth auditing the other shadcn wrappers for unconditional key handling — several
  components (`BookChapterControl`) have since grown their own duplicate implementations of the same
  behavior, which is the usual symptom.
- **The overlay service is one-directional by design, and that was the split brain.** Requester →
  overlay had three methods; overlay → requester had only the resolve promise. Any host-rendered UI
  that takes focus from its requester has this problem; `keyForwarding` is a reusable shape, not a
  marker-palette special case.
- **Structural event types beat DOM event types at a boundary.** Widening the keydown table to a
  structural `MarkerPaletteKeyEvent` is what let one handler serve both entry points; a DOM
  `KeyboardEvent` parameter would have forced either a second implementation or a cross-realm event
  hand-off.
- **A reopened React-owned menu keeps its internal state unless keyed.** The `NodeSelectionMenu`
  remount finding likely applies to any "commit and immediately reopen" flow in the app.
- **fb4's "display-only state that never reaches a renderer" sweep is still worth doing** — this
  round's Defect 1 was the same family: state that did reach a renderer, but rendered invisibly.
