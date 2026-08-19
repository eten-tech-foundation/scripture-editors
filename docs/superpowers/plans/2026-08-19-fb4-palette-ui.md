# Feedback round 4: palette UI — search bar, `*` closer commit, wrap-refusal audit

Owner-directed round (TJ, 2026-08-19), spanning BOTH repos on the `sv/fb4/palette-ui` worktree
pair. Four reports from testing the running app, three of which turned out to have root causes in
different places than the report suggested.

---

## ISSUE 1 — no search bar without a selection

**Report.** "Backslash in a paragraph WITHOUT a selection seems to open what looks like the passive
palette but without typing into the editor. I was hoping to see a search bar where the marker
you're typing gets put in. This already happens when you HAVE a selection."

**Root cause — rendering only; every byte of plumbing was already there.**
`overlay-command-palette.component.tsx` renders cmdk's `CommandInput` **only in the non-passive
branch** (was line 458). The collapsed-caret session is opened `passive: true` by both owners
(`platform-scripture-editor.web-view.tsx`'s `openMarkerPalette`, `footnote-editor.component.tsx`'s
ditto: `const passive = !ctx.hasTextSelection`), and the passive branch rendered a bare
`role="listbox"` div and nothing else. The typed query WAS already reaching the component — the
keydown table claims each filter char and calls `driver.update({ filterText })`, the store mirrors
it, and the component receives it as the `filterText` prop and filters with it. It was simply never
displayed. `MarkerPaletteSessionState.filter` even documents itself as a "Display-only mirror"
while nothing displayed it.

**Fix.** One `searchInput` element, hoisted out of the ternary and rendered by BOTH branches, so
the palette looks and reads the same however it was opened. The modes differ only in who owns the
query:

- Active: focused, edited directly, mirrors its value out via `onFilterTextChange`.
- Passive: `readOnly`, `tabIndex={-1}`, `value={filterText ?? ''}`, no `onValueChange`.

**Why the passive input must not be editable** (the load-bearing constraint, and the reason
"unify on the component that has the input" could not mean "make it interactive"): a focused input
means the requesting WebView is NOT focused, and **both** session owners gate their keydown tables
on editor focus (`editorRef.current?.isFocused()`; `document.activeElement !== editorInput`). An
interactive passive input would therefore stop every ratified Space/Enter/Escape/zero-match
semantic from running at all. The existing "never steals focus on mount" pin (the focus effect
already early-returns when `passive`) is what keeps this safe, and it stays green.

Also unified: the list's height budget. Both branches now subtract `SEARCH_INPUT_RESERVED_HEIGHT`
(44, previously an unexplained literal in the active branch only).

**Keydown semantics: unchanged.** Nothing in the table moved for this issue.

---

## ISSUE 2 — `*` as a closing-marker commit trigger

**Report.** "When the user types `*`, that should be another trigger to insert the marker they
typed and close the palette. Similar to Space but without inserting a space or such; this is just
inserting a closing marker at the caret."

**Before.** `*` was an ordinary filter character (`FILTER_CHAR_REGEX.backslash` included `*`, a
fb3 decision) so a user typed `nd*` to narrow to the close-tag entry and then pressed Space, which
committed the literal `\nd* ` — with an unwanted trailing space.

### The routing decision, and why

The task named two candidates: route `*` through the existing `closeTag` apply
(`$closeCharSpanAtCaret`, closing the OPEN span at the caret, PT9-style), or land the typed closer
literally. **Landing the literal won**, on measured evidence rather than preference.

I implemented the close-first-with-literal-fallback version first, and its test failed in a way
that settled the question. With the caret at the span's **content end** — the position a user
actually reaches by typing `\nd `, then the text, then `\nd*` — `$closeCharSpanAtCaret` takes its
documented "already effectively closed" branch: no split is performed, no text changes, the
selection just moves past the span. Measured end state:

```
after commitTypedMarker('nd'):     "\p \v 1 hello\nd world"   chars=[{marker:nd, closed:"false", markerNodes:1}]
after $closeCharSpanAtCaret path:  "\p \v 1 hello\nd world"   chars=[{marker:nd, closed:"false", markerNodes:1}]   <- NOTHING VISIBLE
after literal insertText('\nd*'):  "\p \v 1 hello\nd world\nd*" chars=[{marker:nd, closed absent, markerNodes:2}]  <- the closer appears
```

So the structural close is invisible precisely where TJ presses the key. Five reasons the literal
route is right:

1. **It is the only arm that puts `\nd*` on screen at the content end** — the whole point of the
   request. The other arm looks like the keystroke did nothing.
2. **Governing invariant I**: displayed bytes ARE the document. Typed bytes land and re-tokenize;
   the engine decides whether they match, rather than the palette deciding for it.
3. **Byte-fidelity**: identical to what typing `\nd*` by hand always produced, and identical to
   today's `commitTypedMarker("nd*")` Space route minus the unwanted trailing space.
4. **It is the ratified behavior for typed closers**, including the unmatched case (the engine
   flags it), which is also what keeps the commit from being a silent no-op — `$closeCharSpanAtCaret`
   alone mutates nothing when it finds no match, and its return value is discarded by the apply.
5. **Mid-span it still closes correctly**: the paragraph re-tokenize splits the span exactly as the
   structural close would.

`$closeCharSpanAtCaret` is untouched and remains the apply for a **picked** `closeTag` menu entry.
The distinction is principled: picking an entry is a structural command; typing `\nd*` is text.
(That the two diverge at the content end is documented at the new primitive, in
`markerMenuApply.utils.ts`.)

### Shared primitive + both surfaces

- `$commitTypedCloserAtCaret(typedMarker)` — `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts`.
  Collapsed range selection only (returns `false` without mutating otherwise); inserts
  `\` + typedMarker + `*`.
- `EditorRef.commitTypedCloser(typedMarker): boolean` — declared in `editor.model.ts`, implemented
  in `Editor.tsx`'s imperative handle (throws in readonly, warns on refusal — `commitTypedMarker`'s
  shape), delegated in `Marginal.tsx`. One-line api-report drift.
- **Editor palette** (`libs/shared-react` `UsjNodesMenuPlugin.tsx`): new `*` branch claims the key,
  closes the palette, calls the new harness op `commitTypedCloser`. `EditableMarkerMenuHarness`
  gains that op (wired in `Editor.tsx`'s harness). `*` added to the passthrough list so
  `NodeSelectionMenu`'s query capture declines it — via a SECOND module-level constant, because the
  list is now selection-shape dependent.
- **Host palette** (`marker-palette-keydown.util.ts`): `*` removed from `FILTER_CHAR_REGEX.backslash`
  and given its own branch (claim → `driver.commitTypedCloser(filter)` → `dismiss()` → `'ended'`).
  `MarkerPaletteSessionDriver` gains `commitTypedCloser`; both session owners implement it against
  their own editor ref.

### Scope decision: `*` commits at a COLLAPSED CARET only

Over a non-collapsed selection `*` stays a filter character, in both palettes (host: the
`'selection'` kind keeps `*` in its regex; editor: the branch is gated on `!hasTextSelection`, and
that shape keeps the old passthrough list). A closing marker is placed AT a caret and a selection
has none, so the alternative would be a commit key that could only ever refuse. This also leaves
every ratified selection-wrap semantic untouched.

**Consequence, deliberate and documented:** in the collapsed shape a close-tag entry can no longer
be narrowed to by typing its trailing `*` — pressing `*` commits the end state that entry would
have applied, so there is nothing left to narrow to.

**No `shouldSpaceCommit` exception for `*`.** That exception exists because a materialized `\f `
OPENING literal absorbs the following text as the note's caller; a closing marker materializes no
note and absorbs nothing. Pinned.

---

## ISSUE 3 — the residual selection-wrap Space refusal: **NOT REAL**

**Verdict: no session shape refuses when an exact typed match exists.** The fb2 residual ("the
focused selection-wrap session's Space refuses rather than wrapping") was closed by fb3's
`commitItem`, and the whole matrix is correct today. Every cell below was run; the ones that
already had pins passed unchanged, and the missing cells were added and passed on first run — i.e.
this section is regression-pinning, not bug-fixing.

Matrix, per surface (main editor palette / footnote popover / shared table):

| | Space | Enter |
| --- | --- | --- |
| exact typed match | wraps in the TYPED marker, closed span | commits the HIGHLIGHTED item |
| near-miss prefix (`n` while `nd` is offered) | refuses visibly, selection intact | commits the highlighted item |
| unknown (`zz`) | refuses visibly, selection intact | zero-match: no-op, palette STAYS OPEN |

Cells added this round:

- `marker-palette-keydown.util.test.ts`: selection + Enter exact; selection + Enter near-miss;
  selection + Enter zero-match stays open (the `'continue'` outcome — ending the session would
  orphan the still-mounted overlay).
- `markerMenuHarness.test.tsx`, new describe "selection-wrap matrix - typed vs highlighted":
  near-miss Space refuses; Enter over the same near-miss query wraps in the highlighted item. Both
  asserted against ONE query so the typed-vs-highlighted distinction is unambiguous.
- Already present and green, untouched: the exact-match and unknown cells on all three surfaces,
  including the popover's near-miss pin.

**One genuinely-open shape, unchanged and re-escalated (fb3's "SPLIT BRAIN").** The table only runs
while the EDITOR holds focus. The two focus-stealing kinds (`'selection'`, `'enter'`, shown
`passive: false`) render a real cmdk `CommandInput` that retries `focus()` across up to 20 animation
frames. When the overlay WINS that race and the filter is non-empty, Space is an ordinary character
appended to the cmdk filter (`"nd "` matches nothing in `'active'` containment mode) and the
ratified wrap does not happen; when the filter is empty, a project-custom `CommandInput` patch
synthesises a click on the highlighted item, bypassing exact-first resolution. Closing this needs
either an overlay-service/`papi.d.ts` change or making that app-wide `CommandInput` Space patch
opt-in per palette — the same owner decision fb3 escalated, still not this round's to make. The
collapsed-caret palette remains immune (`passive: true` renders no focus-stealing input), and
**this round's Issue 1 change does not alter that**: the passive input is read-only and
`tabIndex={-1}`, and the "never steals focus on mount" pin is still green.

---

## ISSUE 4 — caret after a closing-marker commit

**Report.** With `\c 1 \ca 3`, typing `\ca*` at the end (which today needs a trailing Space to
commit) leaves the caret BETWEEN the `3` and the backslash; it should land AFTER the asterisk.

**The `*` work delivers the requested end state.** Driven through TJ's own construction (open the
`ca` span, type `3`, then commit the closer):

```
after commitTypedCloser('ca'):  "\c 1 \ca 3\ca*"   caret offset 14 of 14  -> AFTER the asterisk
```

and the trailing space he had to type is gone by construction, since `*` commits no space.

**The caret contract is now pinned for BOTH construct shapes** in `commitTypedCloser.test.tsx`: a
character span (`\nd …\nd*`) and a **paragraph-direct** attribute run (`\va 3\va*`, the same family
as his `\ca`, which is not wrapped in a char span and so takes a different rebuild path).

**The thing that looked like a product bug, and was not.** The attribute-run pin initially failed
with the caret landing on the BOOK line — a different and worse symptom than reported. Root cause,
established by running four variants from an identical state:

| variant | caret |
| --- | --- |
| plain `selection.insertText("\\va*")` in a raw update | book line ❌ |
| pre-existing `commitTypedMarker("va*")` | book line ❌ |
| char-by-char `\`,`v`,`a`,`*` | book line ❌ |
| new `commitTypedCloser("va")` | book line ❌ |

All four fail identically, so the new method is innocent and Tier 2's restore is correct — it
places the caret properly and something later moves it. The mechanism is **jsdom-only**: jsdom's
`HTMLElement.focus()` unconditionally collapses the document Selection to the focused element's
start (a real browser preserves an existing in-element selection), Lexical's `updateDOMSelection`
calls `rootElement.focus({ preventScroll: true })` on its "DOM selection already matches" branch
whenever the root is not `document.activeElement`, and a later deferred native `selectionchange`
reads the collapsed selection back into the editor state. The marker-edit engine's deferred settle
pass is simply the first commit that takes that branch.

**Fix: a test-harness shim, not product code.** The identical shim, with a comment diagnosing this
exact mechanism, already existed privately in `ScriptureReferencePlugin.test.tsx`; it is now also in
the shared `settledGetUsj.test-helpers.tsx`. Verified blast radius across every suite importing that
harness: 82 tests, 81 passing before / 82 after, no product code touched.

**Explicitly NOT changed:** `$selectAfterClosingSpan` in `tier2Rebuild.utils.ts`. I had extended it
to handle paragraph-direct closers, then reverted that — instrumentation showed it is never reached
in this scenario (the byte-anchor walk finds a valid `best`), so the change had no failing test to
justify it. Its documented decision to decline for a paragraph-direct closer stands.

---

## Test changes (per the regression contract, per test)

**scripture-editors**

- NEW `packages/platform/src/editor/commitTypedCloser.test.tsx` (8): both caret shapes; no trailing
  space / no second opening glyph; literal landing when nothing matches; literal landing when the
  typed closer mismatches the span that IS open; non-collapsed refusal; no-range-selection refusal;
  readonly throw.
- `markerMenuHarness.test.tsx`: NEW describe "`*` over a collapsed caret" (3) — commits a closing
  marker and closes; lands literally when nothing is open; `*` still FILTERS over a selection. NEW
  describe "selection-wrap matrix - typed vs highlighted" (2). No existing pin touched.
- `settledGetUsj.test-helpers.tsx`: jsdom `focus()` shim (see Issue 4).

**paranext-core**

- `overlay-command-palette.component.test.tsx`: "should not render a search input" → **INVERTED** to
  "should render the same search input the active mode renders" (TJ's directive is precisely that
  this pin was wrong). NEW: filterText shown as the input value; updates live as filterText grows;
  read-only + `tabIndex=-1`; passive input reports no filter-text changes. "should never steal focus
  on mount" UNCHANGED and green — the safety property the whole design rests on.
- `marker-palette-keydown.util.test.ts`: "backslash session: `*` is a filter character" →
  **INVERTED** to "`*` COMMITS the typed marker as a closing marker and ends the session". NEW: `*`
  with zero matches still commits; `*` on an empty filter commits a bare closer; a note marker does
  NOT reroute `*` through the overlay commit; selection session `*` is STILL a filter char; the
  three selection+Enter matrix cells.
- `footnote-editor.component.test.tsx`: NEW popover `*` commit pin (proves the popover's driver
  wires `commitTypedCloser` to the editor ref — the web view has no component harness, pre-existing).
  `editorRef` mock gains `commitTypedCloser`.
- Untouched and green: the fb2 ranking pins, `marker-palette-filter.util`, the popover's
  selection-wrap and zero-match pins, `footnote-editor.palette-commit.test.tsx`.

---

## Gate

Both repos green (2026-08-19). Editor link verified by md5 BEFORE trusting any core number —
core's `node_modules/@eten-tech-foundation/platform-editor/dist/index.js` matches
`packages/platform/dist/index.js` and contains `commitTypedCloser` (the yalc store is shared
between tracks, and a `npm install` at the start of this round had wiped the link entirely,
surfacing as `filterAndRankItems is not a function`).

**scripture-editors**

- `nx run-many -t test --skip-nx-cache`: 9 projects — utilities 51, shared 536, shared-react 1536
  (+1 skipped), scribe 2, perf-react 3, platform-editor **1302 / 73 files / 0 skipped**.
  **3430 passed, 1 skipped**; the single skip is the pre-existing shared-react unknown-items
  round-trip table case — **zero new skips**.
- `nx run-many -t lint typecheck --skip-nx-cache`: 10 projects, **0 errors** (44 pre-existing
  warnings, none in files this round changed).
- `nx run-many -t extract-api`: one-line drift, `commitTypedCloser` on `EditorRef`, committed.

**paranext-core**

- `npm run typecheck`: green (after the standard `generate-dev-build-info.ts` fallback).
- `npm run lint`: **exit 0, 0 errors**; warnings only, in untouched files.
- `npm test` (root): renderer 1880 / 144 files; platform-bible-react **1143 / 142 files**;
  platform-bible-utils 450 (+1 pre-existing skip); plus the other workspaces — all green.
- `npx vitest run` from `extensions/`: **1486 passed, 100 files, 0 skipped**.
- `platform-bible-react` dist rebuilt and committed with the source (fb2/fb3 precedent);
  `eslint-plugin-paranext` needed its documented build fallback first.
- Prettier drift caught and fixed in `overlay-command-palette.component.tsx` (a renderer file the
  root prettier run reaches but PBR's own `lint-fix` does not) — the same class fb3 hit.

**One flaky test, characterized, not ours.**
`footnote-editor.palette-commit.test.tsx`'s `fp` focus-stolen-vs-live comparison failed in two
early runs and passed in every isolated run. Investigated rather than waved off: a trivial added
test does NOT reproduce it, and neither does a DUPLICATED existing rendering test, but with the
round's changes in place the file-pair passed 3/3 and the full PBR suite passed 2/2 afterwards. The
leaked value is the shared `placeDomCaretInsideNote` helper's `'note text'` string crossing into
the real-`Editorial` file, i.e. a latent cross-file DOM-state dependency in that suite. Left alone;
worth hardening separately.

---

## Cross-group findings

- **`MarkerPaletteSessionState.filter` documented itself as a "Display-only mirror" while nothing
  displayed it.** Worth a sweep for other "display-only" state that never reaches a renderer.
- **A `closeTag` item committed over a non-collapsed selection is a pre-existing SILENT no-op**:
  `commitItem` → `applyMarkerMenuSelection` → `$closeCharSpanAtCaret`, which requires a collapsed
  range selection and returns `false` while the apply discards the return value. Reachable in the
  `'selection'` kind, where close-tag entries are offered and `*` still filters. Not fixed here (it
  would touch ratified selection rows) but it violates the "No silent no-ops" derived rule.
- **`$closeCharSpanAtCaret` and a typed closer genuinely diverge** at a span's content end — the
  structural close changes no text there. Anyone assuming "picked `nd*` ≡ typed `nd*`" is wrong.
- **jsdom's `focus()` selection-collapse is a repo-wide test-fidelity hazard**, not a one-off: the
  shim now exists in two places (`ScriptureReferencePlugin.test.tsx` and the shared harness).
  Promoting it to `packages/platform/test-setup.ts` would cover every platform suite and let the
  private copy go — not done here because it was not verified against the full suite.
- **The focused-palette focus race (fb3's SPLIT BRAIN) is still open** and still needs an owner
  decision; see Issue 3.
