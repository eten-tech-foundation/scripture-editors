# Settle-loop safety: handoff

Branch `sv/settle-loop`. Plan: `docs/superpowers/plans/2026-08-14-settle-loop-safety.md`. Governing
invariants: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

The freeze is fixed. The plan was right about the shape of the defect and wrong about which change
removes it — details below, because the correction is the useful part of this document.

---

## 1. What the repro actually does

The plan's four mechanism facts were all confirmed against the code. Fact 3 — the one labelled
inference — was executed, and it revealed a fifth actor the plan did not have.

Reproduced headlessly in `packages/platform/src/editor/markerEdit/damagedGlyphSettle.test.tsx`. The
freeze needs all three of `CharNodePlugin`, `MarkerEditPlugin` and `TextSpacingPlugin` mounted (the
app's real stack); on any two of them the cascade terminates and the bug is invisible. That is why
the existing `verseAttributeSettle`/`markerEditLoop` suites never caught it.

**Two independent defects met on the damaged `\va*`.**

### Defect A — the registry could not see the damage (the plan's fact 2)

`$verseAttributeRunPieces` and `$milestoneAttributeRunPieces` classified a glyph by
`markerSyntax` + `marker` only. Those are stored fields; editing a glyph's characters rewrites
`__text` and nothing else. So a `\va` whose `*` the user just deleted still counted as the run's
closer, `$runDiverges` reported the run canonical, and — the part the plan did not spell out —
`$caretHoldsRunSite` therefore returned **false**, because it gates on divergence.

With no divergence there is no grace, so the settle fired **on the damage commit itself**, not on
departure: two keystrokes in, with the caret still inside the glyph being edited, the whole
paragraph re-tokenized and `altnumber` was silently cleared. The reported "move the caret down into
`\v 2`" step is not actually required to reach the damage.

### Defect B — the settle never reached a fixed point (the freeze)

Those re-tokenized bytes (`\va 2\va In the beginning`) legitimately produce **two adjacent
`char va` spans**. `$charNodeTransform` in `CharNodePlugin.tsx` — "Combine adjacent CharNodes with
the same attributes" — then merged them, moving BOTH spans' glyphs into the survivor. The merged
span displays `\va 2\va In the beginning` while being one span, and those bytes re-tokenize into two
spans again.

So each rebuild produced a genuinely different structure from the tree it was derived from, which is
exactly the condition `$rebuildParas`' fixed-point refusal cannot detect. Measured signatures, one
cycle:

```
old (live)  … char{"closed":"false"} marker\va 2 marker\va In the beginning …
new (fresh) … char{"closed":"false"} marker\va 2 char{"closed":"false"} marker\va In the beginning …
```

Stable, unequal, forever. The probe hit the 40-commit circuit breaker every time; unbounded, it
hangs the main thread.

This is the plan's predicted A→B→A oscillation — but the actor is the **merge transform**, not the
tokenizer, and the loop is reachable from any edit that leaves two same-attribute glyph-bearing
spans adjacent. The damaged closer is one route in, not the only one.

---

## 2. Where the plan was wrong

**Task 3 (piece classification) does not fix the freeze.** Verified by disabling each change
independently:

| Piece classification | Merge fix | Result |
| --- | --- | --- |
| off | off | settles on the DAMAGE commit; spins forever (44+ commits, breaker-capped) |
| **on** | off | grace works, settle waits for departure — **still spins** (44+ commits) |
| off | on | terminates, but still settles under the caret with no grace |
| on | on | graces, settles on departure, terminates in 5 commits |

The reason is structural: the cascade's fuel is the damaged `MarkerNode`'s own pending key, and
`$resolvePendingMarkers` routes a pended `MarkerNode` straight to `$requestTier2ForNode`
(`markerEditTier1.utils.ts`, the `$isMarkerNode` branch) *before* the piece→owner mapping. The
display-run registry is never consulted on that path.

**The plan's stated mechanism for task 3 was also unsound.** It expected the sync to "heal or rewrite
the glyph". Rewriting `\va` back to `\va*` is healing against a user edit, which the invariants
forbid twice (§2 "Heal by provenance, never by caret proximity"; Invariant I's no-silent-no-ops).
It would not run anyway — `$syncDisplayRun` returns early while the owner is pended or caret-graced.
What piece classification actually buys is the **grace**, which is Invariant III's third and fourth
duties working as designed. That is worth having on its own, and it is what the plan's task 2
assertion was really pointing at.

**Task 5's sibling sweep found two of four siblings were already fine.** A damaged char `\nd*` and a
damaged milestone `\*` both terminated before any change (3 commits each) — the char closer because
`$charClosingGlyph` is not a display-run piece scanner, the milestone because an unterminated
milestone run is one of the tokenizer's literal-degradation cases and degrades to a fixed point in
one pass. Only the verse runs (`\va`, `\vp`) froze. `\ca*` remains unreachable (§7a: chapters have no
settle path).

---

## 3. What changed

### `libs/shared/src/nodes/features/MarkerNode.ts`

New exported `$isCanonicalMarkerNode(node)` — whether a glyph's rendered bytes still spell what its
state describes. It lives beside `getMarkerText`, the `__text` writer it mirrors, so the two cannot
drift.

This also **retired a duplicate**: `$markerCanonicalText` in `markerEditTier1.utils.ts` computed the
same canonical bytes by a second, independently-maintained implementation, and all five of its call
sites were `text === $markerCanonicalText(node)`. They now call the shared predicate. Two definitions
of "canonical glyph bytes" is the drift hazard this whole bug class lives on; there is now one.

### `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` — piece classification (plan task 3)

Both glyph-bearing run scanners now require `$isCanonicalMarkerNode` before accepting a glyph as a
piece. A byte-damaged glyph is reported **absent**, so the run diverges, the caret graces it, and
departure settles it.

Scope is deliberately exactly the glyph-bearing scanners. Of the eight registered kinds, only
`va`/`vp`/`milestone` scan glyphs at all — `char` scans a TextNode, `optbreak` a first child, and
`separator`/`opaqueUnknown`/`nestedGlyph` scan nothing. **`$charClosingGlyph` was deliberately left
alone**: it is not a run piece but the anchor deciding whether a char span may carry a run, and
gating it on bytes would make a damaged `\nd*` flip `expectedPieces` to "no run wanted", whose sync
arm is `$clearRun` — deleting the user's attribute bytes. The char closer does not need it (it
already terminates), so the blast radius stays at three kinds.

### `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx` — the freeze fix

`$charNodeTransform` no longer combines spans that render their own marker glyphs. In editable
marker views the glyphs ARE the displayed bytes, so merging is not a normalization but a byte
change that contradicts the resulting structure. Glyph-less spans still merge — that is every other
view mode, and it is the case the merge exists for.

The collab path is unaffected: `$createNestedChars`
(`delta-apply-update.utils.ts`) does its own adjacent-span merging at construction, before glyphs are
siblings, so it never relied on this transform.

### `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` — the backstop (plan task 4)

`MAX_SETTLE_CASCADE_DEPTH = 8` consecutive *mutating* deferred settles with no user gesture between
them. Past it the engine logs a `warn` naming the surviving pending keys and returns without
mutating — which produces no commit, so nothing re-queues and the cascade ends. The pends stay
pending and serialize as literal bytes ParatextData parses. Reset by `KEY_DOWN`/`CLICK`, so the bound
is per gesture, not per session.

Landed after the root fix, as the plan required. Verified to convert the un-fixed freeze from 44+
commits into 12 plus a warning.

---

## 4. What was verified

Every test below was confirmed **red** by reverting the specific production change it covers, then
green with it restored.

- `packages/platform/.../damagedGlyphSettle.test.tsx` (new, 5 tests) — the bounded repro plus the
  `\vp*`, char `\nd*` and milestone `\*` siblings, and the backstop's own test.
- `libs/shared/src/displayRun/displayRunRegistry.test.ts` (+4) — plan task 2: `$runDiverges` is true
  for a damaged closer/opener/self-closer though node state is intact, and a nested `\+va*` is NOT
  mistaken for damage.
- `libs/shared-react/.../CharNodePlugin.test.tsx` (+1) — glyph-bearing adjacent spans are not
  combined. The 29 existing merge tests all build glyph-less spans and are untouched.

Full sweep, all green:

- `nx run-many -t test` — 9 projects. Platform 989 passed / 5 skipped; shared 453; shared-react 1519
  passed / 2 skipped.
- Corpus at full count with **no new skips**: the same five pre-existing entries, all
  `$addTrailingSpace` fabrications owned by the whitespace track.
  `corpus-transform-fixed-point.test.tsx` matters most here — it mounts the identical three-plugin
  stack and dirties every node, so it is the direct check that the merge change alters no fixture.
- `nx run-many -t lint typecheck` clean (0 errors; the `no-console` warnings are pre-existing in
  files I did not touch), and clean in root context: `npx eslint <changed files>`,
  `npx tsc --build` over the lib and **spec** tsconfigs.
- `nx run-many -t extract-api` produces no diff — nothing changed in a published API surface.

### Two notes on how the tests are built

**The commit bound is load-bearing, not decoration.** A non-terminating cascade re-queues itself as a
microtask, which starves the macrotask queue — vitest's own per-test timeout can never fire, so a
regression *hangs the run* instead of failing it. `withCommitBound` counts commits and stops
forwarding deferrals past the bound, turning the freeze back into an ordinary assertion failure.

**The settle tests also assert the backstop stayed silent.** The backstop's ceiling is below the test
bound, so without that assertion a regressed root fix that only the backstop catches would slip
through the commit count looking healthy. Caught this for real: the first version of these tests let
the `\vp` and milestone cases pass under a reverted merge fix.

---

## 5. What I deliberately did not do

- **Did not gate `$charClosingGlyph` on rendered bytes.** Reasoning above — it would delete attribute
  bytes on a damaged `\nd*`, and the char closer already terminates.
- **Did not make the sync heal a damaged glyph back to canonical.** The plan suggested it; the
  invariants forbid it (never heal against a user edit).
- **Did not touch the whitespace transforms, the char-stack primitive, or logging volume** — all
  explicitly out of scope.
- **Did not fix `$signatureOf`'s blind spot.** The fixed-point refusal compares the fresh parse
  against the live tree, so it is defeated by ANY transform that deterministically rewrites the
  rebuild's output. The merge was one such transform; a normalizing signature would be a more general
  fix, but it would have masked the byte/structure disagreement rather than removing it. Recorded
  below as a follow-up.
- **No C# touched.** The approval gate was not reached; nothing here goes near the USJ/USFM or
  USX/USFM conversion paths.
- **Did not update the plan or invariants docs.** Corrections are recorded here.

---

## 6. What TJ should manually test

The headless repro cannot exercise real key handling, the scrRef echo, or the app-placed-caret
window, so these are the ones worth doing by hand in Standard view:

1. **The original repro.** Delete the `*` from a `\va*` closer, then arrow down into `\v 2`. Expect:
   no freeze; while the caret is still in the glyph nothing changes on screen; on departure the run
   degrades to two `\va` char spans and the verse's alt number is gone. Watch the console for
   `[MarkerValidation] pass:` spam — it should stop, and any `[MarkerEdit] settle cascade exceeded`
   warning means something still oscillates.
2. **Undo it.** Ctrl+Z after the settle. The historic re-pend path (`$rependPendShapedNodes`) shares
   the retired duplicate's rule, so this exercises the consolidation.
3. **The same damage on `\vp*`,** on a verse that has both `\va` and `\vp`. The `\va` run and the
   alt number must be untouched.
4. **Adjacent same-marker char spans**, which is the merge change's real blast radius. Apply `\nd` to
   two adjacent words separately so the spans end up neighbours, then save and reload: they now stay
   two spans instead of merging into one. Both round-trip losslessly, but the USJ has two `char`
   objects where it used to have one — worth an eyeball on whether that is acceptable in the file.
5. **Collab**, if a second client is easy to arrange: apply char formatting from the remote side next
   to an existing span of the same marker, in Standard view. `$createNestedChars` merges at
   construction so this should be unchanged, but it is the one path the reasoning above is inferred
   for rather than measured.

---

## 7. Follow-ups this leaves open

- **`$signatureOf` is blind to post-splice transforms.** The fixed-point refusal compares a fresh
  parse against a live tree that other plugins' transforms will immediately rewrite. Any future
  transform that deterministically alters a rebuild's output reintroduces this class. The backstop
  now bounds it, loudly, instead of freezing — but the general fix is either to compare
  post-transform, or to make the signature normalize the differences transforms are allowed to
  introduce.
- **A damaged closer with no space after the run absorbs the following word.** `\va 2\va*In the
  beginning` with the `*` deleted tokenizes `\vaIn` as the marker name. That is correct tokenizer
  behaviour for those bytes — identical to typing `\vaIn` — but it is startling, and the underlying
  question (does the adaptor emit a space after a `\va*` run?) belongs to the attribute-markers
  track.
- **The `char` and `optbreak` scanners still classify by node state**, which is correct today because
  neither scans a glyph. If the Glyph-kinds track extends the registry to openers, closers and the
  nested `+` as the invariants doc plans, those new descriptors must classify by rendered bytes from
  the start — `$isCanonicalMarkerNode` is the predicate to use.
