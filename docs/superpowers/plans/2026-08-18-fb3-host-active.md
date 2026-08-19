# Feedback round 3: the HOST marker palette becomes ACTIVE

Owner-directed round (TJ, 2026-08-18), spanning BOTH repos on the `sv/fb3/host-active` worktree
pair. The last mile of the palette directive: the editor-internal palette was already active
(fb round), the host palette had ranking/zero-match/session work (fb2 round) but was still
PASSIVE — typing after `\` in the app landed in the document, and selection + `\nd` + Space
closed the palette without wrapping. This round makes the host palette (paranext-core's overlay,
main scripture editor AND footnote popover) fully ACTIVE with semantics identical to the editor
palette, closing fb2's named residual ("committing a SPECIFIC item is not expressible through
`PaletteDriver`").

## The capture mechanism: HOST-CLAIMS, not editor-side suppression

The task offered two designs — the host claims printable keys in its existing keydown table, or
the editor suppresses document typing under a host-declared session. **Host-claims won**, for
three reasons:

1. **The mechanism was already proven in production for two of the three session kinds.** The
   shared capture-phase table (`marker-palette-keydown.util.ts`, platform-bible-react) already
   claims typed keys for `'enter'` and `'selection'` sessions, and those keys demonstrably never
   land: a capture-phase `preventDefault` + `stopPropagation` at the window/document level runs
   before Lexical's root-element listener and cancels the browser's subsequent
   beforeinput/keypress for that key. Extending the claim to `'backslash'` is a
   consistency-restoring change, not new machinery.
2. **The editor cannot suppress the trigger anyway.** No session exists when `\` is pressed —
   the host must claim the trigger itself before opening the session, in every design.
3. **An editor-side blanket suppressor would duplicate the per-key policy.** The table's
   decisions (IME composition and pure modifiers pass through; chords dismiss unclaimed;
   resumed-typing keys land) must hold under any design; an editor-side suppressor would either
   re-implement that table or contradict it. The claim IS the suppression, applied by the same
   code that decides.

The editor package therefore needed no session/suppression API — only a commit primitive
(below). `EditorRef.setTransientInput` stays (its contract is unchanged, and hosts whose
palettes DO land literals still exist), but this host no longer declares palette transient input
anywhere: nothing of the palette's is ever in the document, so there is nothing for a mid-session
save to exclude. `transientInputForPaletteSession` (extension utils) and its tests are deleted.

## The editor-side API: `EditorRef.commitTypedMarker`

```ts
// packages/platform/src/editor/editor.model.ts
commitTypedMarker(typedMarker: string): boolean;
```

The host palette's Space commit ("commit what was typed"): materializes `\` + typedMarker + space
at the collapsed caret in ONE update — the same literal bytes passive typing would have
accumulated — and the marker-edit engine's transforms resolve them within that update. The
ratified Space end states hold BY CONSTRUCTION, identical to the editor palette's own Space
commit (which uses the same materialization internally): open span `closed="false"` for an
inline marker, unknown settles as typed, empty query materializes the bare `\ ` literal.
Refuses (returns `false`, document untouched) for a non-collapsed or missing range selection —
the selection commit is the item WRAP via the pre-existing
`applyMarkerMenuSelection(item, { trigger: "backslash", literalPrefixLanded })`, which needed no
change. Throws in readonly (family convention). Implemented in `Editor.tsx`'s imperative handle,
delegated in `Marginal.tsx`, one-line api-report drift, pinned in
`packages/platform/src/editor/commitTypedMarker.test.tsx` (7 tests).

## The core-side seam: `MarkerPaletteSessionDriver` grows two editor-side ops

`PaletteDriver` (platform-bible-utils, experimental), `FootnoteEditorMarkerPalette`, and
`IOverlayService` are all UNTOUCHED — papi.d.ts has zero drift. The extension point is the
table's own driver type, previously a bare alias of `PaletteDriver`:

```ts
export interface MarkerPaletteSessionDriver extends PaletteDriver {
  commitTyped(typed: string): void; // backslash Space -> EditorRef.commitTypedMarker
  commitItem(marker: string): void; // selection Space exact match -> applyMarkerMenuSelection wrap
}
```

`update`/`commit`/`dismiss` remain overlay ops; the two new ops are EDITOR applies that each
session owner implements against its own editor ref (the main web view and the footnote popover
each hold one). The table calls `dismiss()` itself right after either op, so the overlay closes
by resolving the show promise `undefined` — which both owners' `.then` handlers already treat as
a dismissal, so nothing double-applies.

## The new keydown table (all three kinds now ACTIVE)

- **Trigger `\`:** claimed in EVERY selection shape by both session owners (was: only over a
  selection). `literalPrefixLanded` is now constant `false` at every host apply site and was
  removed from both session shapes.
- **Filter chars:** claimed AND routed to the query for every kind (was: mirrored-unclaimed for
  backslash). `*` moved into the backslash filter set (close-tag endmarkers like `nd*`; the
  passive `*`-closes-the-span route is gone — Space then commits the typed `nd*` literal).
- **Space:** backslash → claim; `shouldSpaceCommit` (note markers) still routes through the
  overlay commit (like Enter, exact-first resolution — see the `\f` finding below); otherwise
  `commitTyped(filter)`. Selection → claim; exact typed match against the offered entries →
  `commitItem`, else visible refusal (dismiss, selection intact). Enter-menu → claim + append to
  the filter (editor Enter-menu parity: its only commit is the highlighted item).
- **Zero-match:** Enter no-op/stays open (fb2, unchanged); Space commits typed (the materialized
  unknown settles as typed); Escape closes untouched — now trivially, nothing ever landed.
- **Backspace on an empty filter:** claimed + close, for every kind (was: unclaimed dismiss for
  backslash — correct only when a landed `\` was there to delete; and stay-open for the focused
  kinds). Editor-palette parity: `NodeSelectionMenu` closes on Backspace-at-empty-query.
- Unchanged: IME/modifier passthrough, chord dismiss-unclaimed, arrows, Enter commit, Escape,
  the zero-match counting modes (`passive` prefix for backslash, `active` containment for
  focused — display consistency with the overlay's own filtering).

The backslash palette keeps the overlay's `passive: true` DISPLAY (non-focus-stealing listbox;
caret stays visible in the editor) — `passive` is now purely a display mode, not a typing mode.

## The `\f` mid-text finding (cross-group, owner-relevant)

Probed while porting: `commitTypedMarker("f")` mid-text settles as
`{"type":"note","marker":"f","caller":"world","closed":"false"}` — the tokenizer absorbs the
word AFTER the caret as the note's CALLER. This is byte-identical to passive typing (the
primitive's whole contract) but it is NOT "commits like Enter" (empty note, default caller,
paragraph text untouched). **The editor package's own active palette has exactly this behavior
for `\f` + Space at a mid-text caret** — its harness pin covers only the caret-at-end shape,
where the two coincide. The invariants §4 row ("commits like Enter, emergent from the
tokenizer") is only accurate at end-of-text. The HOST is immune: fb2's `shouldSpaceCommit` route
(note markers commit the palette item like Enter) was KEPT for precisely this reason, so in the
app `\f` + Space inserts an empty footnote in every caret position. Recommended owner decision:
either ratify the editor palette's mid-text absorption or give the editor palette the same
note-marker Space routing the host has. `commitTypedMarker`'s TSDoc and test pin the absorption
explicitly so the sharp edge is documented, not latent.

## Test changes (per the regression contract, per test)

scripture-editors — new file `commitTypedMarker.test.tsx` only; no existing pins touched.

paranext-core, `marker-palette-keydown.util.test.ts` (29 tests; every change justified by the
passive→active axis):

- "filter chars are MIRRORED, never claimed" → INVERTED (claimed + routed).
- "Space/`*` land unclaimed and end the session" → REPLACED: Space claims + `commitTyped`
  (+ zero-match variant); `*` is a filter char.
- "Space still lands + dismisses when shouldSpaceCommit declines" → INVERTED (claimed,
  `commitTyped`, no overlay commit). The approves-pin (note markers commit like Enter) is
  UNCHANGED.
- "Backspace on empty filter deletes the trigger `\`" → REPLACED: claimed + closes, all kinds.
- NEW: selection Space exact-match `commitItem`; no-match visible refusal; exact-match is
  full-code not prefix; enter-menu Space keeps filtering.
- Unchanged and green: IME, modifiers, chords, arrows, Enter commit/zero-match (both modes),
  Escape, selection-claims-everything, unrelated-keys-land.

`footnote-editor.component.test.tsx` (37 tests):

- "opens a passive palette without preventing default" → INVERTED (trigger claimed; the
  `passive: true` display request is still pinned).
- "applies the resolved item…" now pins `literalPrefixLanded: false`.
- "mirrors typed marker characters" → typed chars now claimed too.
- "lets Space land and dismisses" → REPLACED by an Escape-document-untouched pin (ratified row).
- The `\nd`+Space owner-report pin now asserts `commitTypedMarker('nd')` claimed — the END STATE
  contract (nd commits as typed nd, never fq, never the highlighted item) is preserved.
- NEW: selection wrap exact-match applies THAT item (`applyMarkerMenuSelection`, wrap opts);
  no-match visible refusal. Zero-match Enter stay-open pin unchanged.
- "never shows a palette when there are no items" is deliberately KEPT as-is: with zero offered
  entries there is no overlay to show, so the `\` still lands (pass-through degradation),
  matching the no-markerPalette degradation.

`footnote-editor.palette-commit.test.tsx` (4 tests, real `Editorial`): the literal-typing
simulation was removed — under the active palette no literal exists at commit time, so the
"literal consumed" half of those pins is retired; the load-bearing contracts remain (focus-stolen
commit ≡ live commit tree-identical; exactly one span, nothing strands; the `fp` break shape
`['fr','ft','fp']` with the tail riding the break).

`platform-scripture-editor.web-view.utils.test.ts`: `transientInputForPaletteSession` describe
deleted with the function.

fb2 contract pins NOT touched and green: overlay service exact-first ranking (`\f`→`f`,
`\nd`→`nd`, active label-only, zero-match commit dropped), `overlay.service-model` ranking,
`marker-palette-filter.util`, `overlay-command-palette.component` (258 renderer overlay tests).

## Deviations / notes

- **The main web view has no component-test harness** (pre-existing: `extensions/src/…` carries
  only pure-helper tests). Its palette delta is composition-only — the same driver shape the
  popover composes, where the flow IS component-tested against the real keydown table — plus the
  trigger claim, which is the same one-line change the popover pins. Building a full web-view
  harness (papi mocks for a 3,000-line component) was out of scope for this round.
- **Punctuation divergence (pre-existing class):** the editor palette's query capture swallows
  ANY single character into the query; the host table dismisses on characters outside the marker
  filter set (unclaimed for backslash/enter — the key lands as resumed typing; claimed for
  selection). fb2 shipped and pinned this shape for the focused kinds; this round extended the
  backslash kind to the same sets rather than widening all three to any-char.
- **Focused-palette focus handoff (SPLIT BRAIN — the round's one genuine semantic gap):** the
  session table only runs while the EDITOR holds focus. Both owners gate it — the web view on
  `editorRef.current?.isFocused()`, the popover on `document.activeElement !== editorInput`. For
  the two focus-stealing kinds (`'selection'`, `'enter'`, both shown `passive: false`) the overlay
  renders a real cmdk `CommandInput` and retries `focus()` across up to 20 animation frames to win
  the race against the editor iframe. Whoever wins owns Space:
  - **Overlay wins, filter NON-EMPTY** — Space is an ordinary character appended to the cmdk
    filter. So `selection` + `\nd` + Space types a space instead of wrapping the selection: in
    `'active'` containment mode `"nd "` matches nothing. The ratified selection-wrap Space does
    NOT happen on this path.
  - **Overlay wins, filter EMPTY** — a project-custom patch inside `CommandInput`
    (`lib/platform-bible-react/src/components/shadcn-ui/command.tsx`, the Space-on-empty-input
    branch, added by the markers-checklist work and applied to EVERY `CommandInput` in the app)
    synthesises a click on the highlighted cmdk item. That commits the HIGHLIGHTED entry, locally,
    bypassing `commitCommandPaletteSelection` entirely — so the overlay's exact-first and
    disabled-skip resolution never runs. For a `'selection'` session that wraps the selection in an
    arbitrary highlighted marker where the table would have refused; for an `'enter'` session it
    commits where the table would have kept filtering.
  - **Editor wins (the safety-net path)** — the table's ratified semantics run, and those are what
    this round's tests pin.

  Closing this needs a decision that is NOT this round's to make: either the overlay stops owning
  Space for marker palettes (an overlay-service/`papi.d.ts` change, explicitly out of scope here),
  or the `CommandInput` Space patch becomes opt-in per palette (it is shared app-wide with the
  markers-checklist consumers). Left unchanged and escalated rather than patched unilaterally.
  Note the collapsed-caret `'backslash'` palette is IMMUNE: it is shown `passive: true`, which
  renders no `CommandInput` at all and never steals focus, so its Space always reaches the table —
  which is the flow the four ratified semantics are mainly about.
- The e2e spec (`marker-palette-trigger-focus.spec.ts`) drives only the selection palette, whose
  trigger claim is unchanged; e2e was not run (requires a packaged build; not part of the gates).
- papi.d.ts: regenerated via `npm run build:types`, zero drift (no overlay service model
  change). platform-bible-react dist regenerated and committed with the source (fb2 precedent).

## Gate

Both repos green (2026-08-19). Every number below is from a real run — the nx targets were
re-run with `--skip-nx-cache` because a plain `run-many` replayed all 34 tasks from cache.

**scripture-editors**

- `nx run-many -t build -p shared shared-react utilities test-data`, then `nx run-many -t
  extract-api`: both clean, and `git status` stayed EMPTY afterwards — the one-line api-report
  change committed with the feature is exactly what extract-api regenerates, so there was no
  report drift left to commit.
- `nx run-many -t test --skip-nx-cache`: **143 files, 3403 passed, 1 skipped**, 9 projects.
  `@eten-tech-foundation/platform-editor` alone is 72 files / 1275 passed / **0 skipped**. The
  single skip is pre-existing in shared-react (the unknown-items delta round-trip's table case)
  and predates this branch — **zero new skips**.
- `nx run-many -t lint typecheck --skip-nx-cache`: 10 projects, **0 errors** (2 pre-existing
  `no-console` warnings in perf-vanilla).

**paranext-core**

- `npm run typecheck`: green, after the standard
  `npx ts-node ./.erb/scripts/generate-dev-build-info.ts` fallback for the missing
  `release/app/buildInfo.json`.
- `npm run lint`: **exit 0, 0 errors**. The remaining warnings (prettier reflow, `no-console`,
  `import/no-duplicates`) are all in files this round never touched.
- `npm test` (root): **431 files, 5149 passed, 1 skipped** across 11 workspaces. The skip is
  pre-existing in platform-bible-utils.
- `npx vitest run` from `extensions/` (the root `npm test` does NOT cover this suite in full):
  **100 files, 1486 passed, 0 skipped**.
- Editor link verified BEFORE trusting any core number: core's
  `node_modules/@eten-tech-foundation/platform-editor/dist/index.js` md5-matches
  `packages/platform/dist/index.js` and contains `commitTypedMarker` — the shared yalc store had
  not been stolen by a sibling track.

**One fix the gates surfaced.** `footnote-editor.palette-commit.test.tsx` (a stale doc-comment
reflow plus a double blank line where the deleted `typeLiteral` helper had been) and
`platform-scripture-editor.web-view.tsx` (reflowed JSDoc) had drifted from prettier. Both live in
workspaces the ROOT prettier run deliberately excludes — `.prettierignorerun` skips `extensions`
and `lib/platform-bible-react` as "directories that have separate eslint project" — so only their
own workspace scripts see them, which is how the drift escaped. Reformatted with each workspace's
own prettier; all 8 changed core source files now pass `prettier --check`. This is warning-level
for `npm run lint`, but `format:check` and the repo's lint-staged hook both enforce it.
