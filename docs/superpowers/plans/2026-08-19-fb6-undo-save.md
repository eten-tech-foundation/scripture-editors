# Feedback: an UNDO left the pre-undo content in the saved file

Branch `sv/fb6/undo-save` (worktree pair `fb6-undo-save`). One TJ-reported Standard-view
data-integrity defect: undoing a milestone marker rename restored the original name on screen but
left the RENAMED name in the file. Governing:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md` — Invariant I (displayed bytes are
the document; the screen and the file must not disagree), Invariant II (display bytes are excluded
from document positions in one place), Invariant IV (all settle paths run the same computation).

This is the undo counterpart of `2026-08-19-fb5-milestone-edit.md`'s defect 1. It is **not** the
same bug, and notably it is not in the settle machinery at all.

---

## The measurement

Reproduced through the public `Editor` before writing a line of fix: load a milestone `\qt-s`, type
`1` into its opening glyph, depart to settle, then press Ctrl+Z, recording after each press what the
screen shows, what each of the two USJ legs says, and whether the host was notified.

| Step | glyph bytes (screen) | tree leg (`deserializeEditorState`) | save leg (`getUsj()`) | `onUsjChange` fired? |
| --- | --- | --- | --- | --- |
| after settle | `\qt1-s` | `qt1-s` | `qt1-s` | yes |
| **undo #1** | `\qt1-s` | `qt-s` | `qt1-s` | yes |
| **undo #2** | `\qt-s` | `qt-s` | **`qt-s`** | **NO** |
| undo #3, #4 | `\qt-s` | `qt-s` | `qt-s` | no (nothing left to undo) |

Undo #2 is the press that restores the document the user asked for, and it is silent.

### Root cause

**The trigger and the payload are computed from two different documents, and across an undo they
change on OPPOSITE presses.**

- A host schedules a save ONLY in response to `onUsjChange`
  (paranext-core `platform-scripture-editor.web-view.tsx:2949` → `handleEditorialUsjChange` →
  `saveUsjToPdpDebounced.schedule`).
- `onUsjChange` is driven by `DeltaOnChangePlugin`'s delta diff over the TREE leg, which reads node
  state. Engine-owned display bytes — marker glyphs, attribute runs, separators — are excluded from
  delta coordinates by design (Invariant II) and contribute nothing to the tree leg.
- But the host SAVES `EditorRef.getUsj()`, the read-only SETTLED leg, which re-tokenizes exactly
  those display bytes. (That line is annotated LOAD-BEARING in the host for an unrelated reason —
  transient-input exclusion — and it is what makes the mismatch reachable.)

A marker edit occupies two history entries: the typed glyph bytes, then the Tier-2 settle that moves
the rename into node state. Undo walks them back in reverse, so:

- **undo #1** restores NODE STATE (`marker` back to `qt-s`) while the glyph still reads `\qt1-s`.
  The tree leg changes → delta ops are non-empty → the host is notified. But the settled leg is
  unchanged: the restored glyph is a legitimately pending literal, `$rependPendShapedNodes` re-pends
  it, and `$settledUsj` re-derives `qt1-s` from the displayed bytes. Nothing to save.
- **undo #2** restores the GLYPH BYTES (`\qt1-s` → `\qt-s`). Node state was already `qt-s`, so the
  tree leg is byte-identical and the delta diff is empty — `DeltaOnChangePlugin` returns at its
  `ops.length === 0` gate, `handleChange` never runs, `onUsjChange` never fires. Yet the settled
  document just changed from `qt1-s` to `qt-s`.

So the one press that changes what a save would write is the one press that cannot produce a delta.
Nothing scheduled a save; the file kept the pre-undo content. Invariant I violated across undo.

**The editor state was already correct after the undo.** Both legs converge on the pre-edit document
once the undo completes. Nothing needed fixing in the settle, in the re-pend scan, or in node state
— the defect is purely that nobody was told.

### It generalizes beyond milestones

Measured on three shapes, same harness:

| Shape | Undo behavior |
| --- | --- |
| milestone marker rename (`\qt-s` → `\qt1-s`) | **broken** — press that restores glyph bytes is silent |
| paragraph marker retag (`\p` → `\q1`) | **broken** — identical shape; save leg goes `q1` → `p` with `newChanges: 0` |
| plain text edit (`hello world` → `hello brave world`) | healthy — undo and redo both notify |

The class is precisely **any undo/redo step whose only document effect is on engine-owned display
bytes** — i.e. the glyph-bytes half of every marker edit. Ordinary text is unaffected because it is
real document content, so its undo produces genuine delta ops. Redo is affected identically (the
first redo press re-applies the glyph bytes and was silent).

This falsifies the brief's leading suspect in its strong form: HISTORIC-tagged commits are **not**
filtered anywhere along the notification path (`HISTORIC_TAG` is absent from
`blackListedChangeTags`, and `DeltaOnChangePlugin` has no historic guard). The save is not
"filtered out as non-user" — it is never triggered because the diff it is computed from is
structurally blind to the change. Suspect 2 is half-true and was the visible symptom at undo #1
(the legs genuinely disagree there), but the cached `editedUsjRef` was measured CORRECT at every
step, so nothing serialized stale bytes. Suspect 3 is false: node state and display bytes both
restore correctly.

---

## The fix

`packages/platform/src/editor/Editor.tsx`, two parts.

1. **One settled-document computation.** `getUsj()`'s body moved into a `readSettledUsj` callback
   that both the public ref method and the new notifier call, so the document a host is TOLD about
   and the document it then SAVES are the same computation (Invariant IV). No behavior change to
   `getUsj()` itself.

2. **A historic-commit notifier.** An update listener that, on `HISTORIC_TAG` commits only, computes
   the settled document and emits `onUsjChange` when it differs from what was last announced.
   Undo/redo are rare, so the settle recompute costs nothing on the typing path, which keeps its
   existing delta-driven notification untouched.

Supporting: `lastNotifiedUsjRef` records the document most recently announced, written on EVERY
emission (typed, applied, historic). Recording only historic emissions would be a lost save — an
ordinary edit followed by an undo back to an earlier state would compare equal to that earlier state
and suppress the one notification that matters. Because the stored value is always something the
host was told, the comparison can only produce EXTRA notifications, never a miss; the host's own
equality guard (`resolveUsjToSaveToPdp`) and 700 ms debounce absorb those.

Deferred to a microtask, for two reasons worth recording:

- **Ordering.** `MarkerEditPlugin` re-derives the pend set from the restored bytes on this same
  historic commit (`$rependPendShapedNodes`), and `readSettledUsj` reads that set. A synchronous
  notification would race it: `DeltaOnChangePlugin` registers its listener in a `useLayoutEffect`
  while `MarkerEditPlugin` uses `useEffect`, so the delta listener runs FIRST and would read a stale
  pend set. Deferring past the commit makes the read correct regardless of registration order.
- **Frozen state.** It keeps host work — which calls back into `getUsj()` — out of
  `$commitPendingUpdates`, the same hazard family the marker-edit engine already defers for.

The notification carries no `ops` and no `insertedNodeKey`: a history restore is not an incremental
edit, so there is no delta for a collaborator and no newly inserted node. Verified safe against the
host, whose note-popover branches are keyed on `insertedNodeKey && ops` and no-op when both are
absent.

### The undo-trap protections are untouched

The suppression window (`appPlacedCaret = true` on historic commits, so an undone settle is not
immediately re-settled) and the read-only re-pend are both unchanged. The fix reads the pend set
that branch produces; it never mutates, never commits, and never resolves a pending. Both undo-trap
suites stay green (`markerEditUndoResettle` 14, `markerEditUndoRerenderResettle` 2), and the new
suite additionally pins the owner's "even after I moved the caret away": a departure after the undo
must not re-settle the restored bytes back to the renamed name.

---

## Tests

**`packages/platform/src/editor/markerEdit/undoReachesFile.test.tsx`** (new, 4 pins), driven through
the public `Editor` with a real `onUsjChange` subscriber, so both legs and the host notification are
read exactly as a host reads them.

The load-bearing assertion is `assertEveryDocumentChangeWasNotified`: for every history press that
CHANGED the document the host would save, the host must have been notified; a press that changes
neither leg must stay silent. It is deliberately independent of how many presses a given edit
occupies — multi-step undo for applies and settles is ratified behavior, so hard-coding a press
count would pin the wrong thing.

| Pin | Red before | Green after |
| --- | --- | --- |
| milestone rename: undo restores the pre-edit doc in BOTH legs, and tells the host | `press 2 … expected { notified: false } to equal { notified: true }` | ✓ |
| milestone rename: redo reaches the file too | `press 1 … expected { notified: false } to equal { notified: true }` | ✓ |
| paragraph marker retag: undo reaches the file (the class is not milestone-specific) | `press 2 … expected { notified: false } to equal { notified: true }` | ✓ |
| plain text undo + redo reach the file (control) | green both sides — records that the class is display-byte-only | ✓ |

Both legs are asserted **byte-for-byte** against the document as it stood before the edit, captured
from the editor itself rather than hand-written, so the pin cannot drift from what a real load
produces. Per fb5's vacuity finding, equivalence is never asserted alone: every shape also names the
expected marker VALUE (`qt-s` / `qt1-s`, `["p","p"]` / `["q1","p"]`).

**`packages/platform/src/editor/settledGetUsj.test-helpers.tsx`** — `mountStandardViewEditor` takes
an optional `onUsjChange`, so a test can observe that a change actually REACHED the host as distinct
from merely being true of the editor's state. Additive; no existing caller changes.

**paranext-core `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`**
(+4 pins) — the save path an undo notification lands in has no notion of where a change came from,
which is the property worth pinning: an undone document must flow through both decision points
identically to a typed one. Pins the equality guard does not swallow an undone marker rename, that
it still suppresses a genuine no-op, that the fire-time branch saves the LIVE undone editor content
rather than the pre-undo snapshot captured at schedule time, and that undo-sourced and typed
documents produce byte-identical outcomes.

---

## Deviations from the brief

- **The brief's suspect 1 is right about the symptom and wrong about the mechanism.** It predicted
  the historic commit is "filtered out as non-user"; measured, nothing filters on `HISTORIC_TAG`
  anywhere in the path. The notification is missing because the delta the trigger is computed from
  cannot see display bytes — a blindness, not a filter. Recorded because the difference decides the
  fix: a tag exemption would not have helped.
- **The host-side pins are contract guards, not red-green pins.** The cause is entirely on the
  editor side, so the host tests pass before and after. A host test that could go red would need a
  component-level harness mounting the web view with a real editor; the source itself records that
  no such harness exists (`platform-scripture-editor.web-view.tsx:2508-2515`), and building one
  (papi mocks) is out of proportion to this defect. The red-green evidence lives in the SE suite,
  which drives the real `Editor` and a real subscriber.
- **`getUsj()` at undo #1 returning `qt1-s` is CORRECT, not a second defect.** At that press the
  screen still shows `\qt1-s`; the settled leg agreeing with the screen is Invariant I satisfied.
  The tree leg is the one that disagrees there, which is just the ordinary pre-settle pending state.
  No change made.
- No tokenizer changes, **no C# changes** (the approval gate was never approached), scribe
  untouched, no new skips, no API report drift (`extract-api` clean on both projects).

### Environment note for the other groups

`fb6-undo-save/paranext-core` had the PUBLISHED `@eten-tech-foundation/platform-editor@0.8.14` from
the registry in `node_modules`, not a linked local build — `npm install`'s `link-dev-packages` step
fails in this worktree (a `checkoutRevision` error). The symptom is 9 failures in
`platform-scripture-editor.web-view.utils.test.ts` with `getMarkerMenuItems is not a function`,
which has nothing to do with any change under test. Fix is the documented loop: `devpub` from
`packages/platform` and `packages/utilities` each from its own directory, then `npm run editor:link
&& npm run utils:link` in core, then md5-verify. Verified here: linked `dist/index.js` md5
`4d69cfca…` == the SE build's.

Also worth flagging: `devpub` from `packages/platform` pushes the built editor into EVERY sibling
worktree's `paranext-core` (`standard-view-integration`, `hooks-to-main`, `standard-view-closeout`,
and others), not just this pair. Groups running concurrently may see their linked editor change
underneath them.

Two further environment gaps, both with fallbacks the brief supplied and both confirmed needed here:
`npm run typecheck` fails on a missing `release/app/buildInfo.json` until
`npx ts-node ./.erb/scripts/generate-dev-build-info.ts` runs, and `npm run lint` fails to resolve
`eslint-plugin-paranext` until `npm run build --workspace=eslint-plugin-paranext` runs.

---

## Verification

Targeted regression contract, run on the finished tree — 9 files, **108 passed, zero skips**:
`damagedGlyphSettle` 5, `milestoneMarkerEdit` 5, `milestoneAttributeSettle` 13, `typedByteSettle`
10, `glyphDriftHeal` 7, `markerEditUndoResettle` 14, `markerEditUndoRerenderResettle` 2,
`settledGetUsj` 48, `undoReachesFile` 4.

Corpus stays at full strength — `tier2Rebuild.corpus` checked 141 paragraphs, 0 skip-listed;
`corpus-round-trip`, `corpus-transform-fixed-point` 22, `corpus-testusfm-round-trip` 10 all green.

**scripture-editors** — `nx run-many -t test lint typecheck`: all 10 projects green.

- platform-editor: 75 files, **1337 passed, 0 skipped**
- shared-react: 26 files, 1550 passed + 1 skipped (the pre-existing table round-trip skip in
  `editor-delta.adaptor.test.tsx` — not this branch's)
- shared: 37 files, 537 passed; utilities: 6 files, 51 passed; scribe 2; perf-react 3

**paranext-core** — `npm test`: 62 files, **880 passed**. `npx vitest run` from `extensions/`:
100 files, **1490 passed** (+4 from this branch). `npm run typecheck`: green. `npm run lint`:
exit 0, warnings only, none in touched files.
