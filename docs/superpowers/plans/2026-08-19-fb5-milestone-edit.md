# Feedback: the milestone marker edit that never reached the file, the default-attribute
# re-spelling, and the caret that jumped on settle

Branch `sv/fb5/milestone-edit` (worktree `fb5-milestone-edit`). Three TJ-reported Standard-view
milestone-editing defects. Two were real and are fixed red-green; the third is **correct behavior,
recorded with the measurement that settles it** rather than changed. Governing:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md` — Invariant I (displayed bytes are
the document; no silent no-ops), Invariant II (one position language), Invariant IV (all settle
paths run the same computation).

---

## Defect 1 — a milestone MARKER rename never reached the file

Repro (reported): edit a milestone's marker in the glyph (`\qt-s` → `\qt1-s`); the screen shows the
new name, the file keeps the old one. TJ noted it "seemed fixed while testing the bar insertion,
but now seems broken again" — it was never fixed; the bar-insertion work exercised a different
branch of the same code, which is why it looked healthy.

### Root cause (measured, and narrower than the brief's three suspects)

Not a split between the two settle legs, and not a refusal to settle at all. The rename **is**
routed to a Tier-2 paragraph rebuild (`$resolvePendingMarkers`'s `$isMarkerNode` arm →
`$applyOpenerRename` → `$requestTier2ForNode`), and the rebuild's fragment carries the edited bytes.
It dies at the **fixed-point refusal**:

`$appendSignature`'s milestone branch (`tier2Rebuild.utils.ts`) folded the milestone's
`sid`/`eid`/`unknownAttributes`/`attributeOrder` into the signature — **but not its `marker`**.

That omission is exactly fatal for a rename, because a rename changes nothing else:

| Signature contributor | OLD side (live tree) | NEW side (re-tokenized) | Differs? |
| --- | --- | --- | --- |
| glyph bytes (recursed run) | `\qt1-s` (the user's edit) | `\qt1-s` (re-tokenized from it) | no |
| `sid`/`eid`/`unknownAttributes`/`attributeOrder` | unchanged | unchanged | no |
| **`marker`** | **`qt-s` (stale node state)** | **`qt1-s`** | **not folded in** |

Both sides therefore compare EQUAL, `$rebuildParas` returns false ("rebuild is a no-op (fixed
point)"), and the splice never happens. The `MilestoneNode.__marker` field keeps `qt-s` forever
while the glyph on screen keeps `\qt1-s`.

The file then follows node state, not the screen: `createMilestoneMarker`
(`editor-usj.adaptor.ts`) emits `SerializedMilestoneNode.marker` — the glyph `MarkerNode`s
contribute nothing to USJ at all. So the save path writes `qt-s`. Invariant I violated: displayed
bytes that are not the document.

**Both legs carried the identical omission.** `virtualSettle.utils.ts`'s JSON-side signature mirror
folds the same four fields and not `marker`. So this is not a leg-divergence defect like fb4's
defect 1 — it is one blind spot faithfully mirrored in two places, which is why the settledGetUsj
equivalence contract could never have caught it (see "Vacuity" below).

This is the same defect SHAPE the fb2 group fixed for `attributeOrder` ("Verification (a)"): a
field that the save leg serializes but the fixed-point check does not compare. `marker` was the
remaining one.

### Fix

One line in each signature fold, with `marker` first in both objects so the two `JSON.stringify`
outputs stay string-comparable:

- `tier2Rebuild.utils.ts`, `$appendSignature` milestone branch: `marker: node.getMarker(),`
- `virtualSettle.utils.ts`, `appendSerializedSignature`'s `type === "ms"` branch:
  `marker: milestone.marker ?? "",`

Verified load-bearing by reverting both lines against the finished tree: the two behavior pins go
red again with `expected 'qt-s' to be 'qt1-s'`.

---

## Defect 2 — `|who="stuff"` re-spells to `|stuff`: CORRECT, recorded, not changed

Repro (reported): type `\qt-s\*`, add `|who="stuff"`, arrow away → "it changes into the default
attribute `|stuff`".

The brief posed a dichotomy — either the tokenizer keeps the name (making the editor's re-display a
wrongful canonicalization to fix) or the tokenizer normalizes (making it correct-but-surprising).
**The measurement lands outside both branches, and the outcome is the second one.**

### What the tokenizer actually says (measured, not read)

`usfmFragmentToUsjContent` over the literal bytes, both spellings:

```
'\qt-s |who="stuff"\*'  →  {"type":"ms","marker":"qt-s","who":"stuff"}
'\qt-s |stuff\*'        →  {"type":"ms","marker":"qt-s","who":"stuff"}     ← byte-identical JSON
milestoneDefaultAttribute("qt-s")  = "who"
milestoneDefaultAttribute("qt1-s") = "who"
```

The tokenizer does not "normalize" anything: `parseAttributeText` tries `ATTRIBUTE_PAIR_REGEX`
first and keeps a NAMED attribute named, falling back to the default name only for a bare value —
exactly USFM's rule, correctly implemented. The point is that **`who` IS `qt-s`'s default
attribute**, so the two spellings are two renderings of ONE document. USJ has no slot for which
spelling the author used, and neither does USX (`<ms style="qt-s" who="stuff"/>`).

### Why the bare re-display is right, not a violation

Three independent facts agree:

1. **Nothing is lost.** Both spellings produce identical USJ (above), so the settle is a semantic
   fixed point — no content is discarded, which is what the no-silent-no-ops rule actually forbids.
2. **The markers map declares it.** paranext-core `markers-maps/markers-map-3.0.model.ts` (and 3.1)
   `'qt-s': { type: 'ms', defaultAttribute: 'who' }` — the same for `qt1-s`…`qt5-s`; `-e` variants
   take `eid`. Our `milestoneDefaultAttribute` heuristic agrees with the map on every one.
3. **The canonical writer collapses the same way.** paranext-core `usj-reader-writer.ts`
   ("Default attribute syntax if it is the only attribute present"): a lone attribute equal to the
   marker's `defaultAttribute` is emitted BARE. So the editor showing `|stuff` shows what the file
   is going to contain — displayed bytes and file bytes agree, which is Invariant I satisfied, not
   breached.

### Why "preserving the typed spelling" would be worse than the surprise

It would need new node state (the `attributeOrder` precedent), and — decisively — that state could
not be made durable: neither USJ nor USX carries the spelling, so it would survive editing within
the session and then silently flip to `|stuff` on the next load. That trades a consistent surprise
for an inconsistent one, and creates a display-vs-reload divergence class that does not exist
today. **Decision: record and pin, do not change.** No tokenizer change (it is a fixed point) and
no C# change.

**The one link not measured here** is ParatextData's own USX→USFM spelling choice, since the real
save path is `editor USJ → usjToUsxString → setChapterUSX → ParatextData` and `UsjReaderWriter`
is not in it. Every TypeScript-side authority points the same way, and the markers map mirrors
ParatextData, so the expected answer is "ParatextData collapses too". A C# capture test would
settle it definitively; capture tests are explicitly encouraged by the invariants doc and this one
is recommended as follow-up (not written here — C# changes are gated, and a capture test needs the
owner's C# test project).

**What WAS pinned as a correctness requirement:** the typed attribute must land under its proper
name and beat the loaded value — `who="stuff"` present, the old `sid` gone, and the whole milestone
byte-equal to `usfmFragmentToUsjContent("\\p \\qt-s |stuff\\*")`.

---

## Defect 3 — the departure settle dragged the caret forward

Repro (reported): edit the attribute run, then press Down into a later part of the SAME paragraph →
"my cursor jumps forward some when it settles. It's like the cursor is trying to stay in the same
physical location when the text moves instead of staying where it was when I pressed down."

**TJ's diagnosis is exactly right, and it is the byte anchor doing it.**

### Root cause (measured to the offset)

Order of operations (confirmed against `MarkerEditPlugin`'s update listener): ArrowDown is never
claimed by the engine; Lexical moves the caret and COMMITS; the update listener then defers the
settle to a microtask. So **the settle runs after the caret has already moved**, and
`$rebuildParas` captures the byte anchor from the POST-move caret.

`$restoreSelectionAtOffset` bails only when the caret is outside the rebuilt paragraphs
(`if (!anchorInParas) return;`). TJ's Down lands in the SAME paragraph, so the restore runs — and
`$caretSpanByteAnchor` counts non-whitespace characters across the WHOLE fragment, display bytes
included. When the settle re-spells the attribute run, every byte after it shifts.

Arithmetic for the reported gesture (caret at offset 3 of `" after"`):

```
before settle:  \p before \qt-s |who="stuff"\* after      nonWsBefore = 29
after settle:   \p before \qt-s |stuff\* after            run lost 6 non-ws bytes
restore walks 29 non-ws bytes → overruns " after" → the ran-off-the-end fallback
                                                 → caret parked at offset 6 (end)
```

Measured red: `expected 6 to be 3`. The run shrank by 6 bytes and the caret went forward — TJ's
report, reproduced deterministically.

`$settlePendedDisplayOwner` has NO caret machinery of its own (it only READS the selection for
grace), so the Tier-2 byte anchor is the only actor. The brief's "it may have its own restore" is
answered: it does not.

### Fix — give the anchor a coordinate system the settle cannot perturb

This is Invariant II's rule applied to caret anchoring: display bytes are excluded from document
positions. `CaretByteAnchor` now carries BOTH coordinate systems plus the fact needed to choose
between them safely:

- `nonWsBefore`/`wsRun` — today's full-byte anchor, unchanged.
- `documentCoords` — the same caret with attribute-run spans STEPPED OVER. Computed only when the
  caret is not inside a display-run piece (`$isDisplayRunPieceSpan`: a marker glyph or attribute-run
  text), since a caret inside one cannot be expressed in document coordinates at all.
- `attributeRunSpans` — how many attribute-run spans the CAPTURED fragment held.

The restore uses `documentCoords` only when the rebuilt fragment holds the **same number** of
attribute-run spans. That guard is the load-bearing part, and it is what two rounds of measured
regressions taught:

| Rebuild | Run population | Coordinates used | Why |
| --- | --- | --- | --- |
| run RE-SPELLS (`\|who="stuff"` → `\|stuff`) | unchanged | document | the caret's own bytes are untouched; skipping the run makes both walks agree |
| run CREATED (typed `\va 3\va*` literal becomes a real run) | grew | full byte | the caret's bytes MIGRATE into the new run and must be followed |
| run DESTROYED | shrank | full byte | same, in reverse |

**Two measured regressions shaped this, and both are worth recording** — the first design was
wrong in a way only the suite could reveal:

1. Keying the mode on "the anchor is an attribute run" regressed fb2's typedByteSettle 3, the
   glyph→attribute-run migration (`expected false to be true`, caret offset 7). Widening the
   predicate to any display-run PIECE fixed that one.
2. That still regressed `commitTypedCloser`'s verse-attribute pin (`expected 18 to be 17`) — a
   one-character drift. Diagnosis: **capture and restore walk two different trees.** There, the
   typed `\va 3\va*` is ordinary TEXT at capture (zero attribute runs) and a real attribute run
   after the rebuild, so "skip attribute runs" was applied on only one side of the comparison and
   swallowed the value's single byte. The run-population guard makes the choice symmetric by
   construction, and every byte-migration shape falls back to exactly today's behavior.

### Scope recorded, not fixed

Marker GLYPH spans still count toward the anchor for a caret in ordinary content, so a glyph RENAME
that changes length can still shift a following caret by the length difference. Same class, not
reported, and including glyphs would have widened the blast radius across many more caret pins.
Recorded here as the remaining residue; no track owns it.

---

## Vacuity: the settledGetUsj equivalence contract could not have caught defect 1

The brief warned about vacuous equivalence (both legs agreeing on a wrong answer), and this branch
hit it — **measured, not assumed**. A `settledGetUsj` shape for the marker rename was added and
then checked against the PRE-FIX source with both `marker` folds reverted:

```
settledGetUsj (equivalence + fixed-point, 48 tests): 48 passed  ← pre-fix, with the bug present
```

Both legs carried the identical omission, so both refused identically, both emitted `qt-s`, the
equivalence held and the output was even a genuine Tier-2 fixed point. **Structural conclusion: an
equivalence contract is blind by construction to any defect living in code that is MIRRORED across
the two legs.** It catches divergence (fb4's defect 1) and nothing else.

The shape is still worth keeping — it holds the two legs together for the future — but it is
labelled in-file as non-vacuous only because the behavior half lives in
`milestoneMarkerEdit.test.tsx`. The general rule this supports, for the orchestrator: **every
equivalence shape needs a behavior pin naming the expected VALUE, and a mirrored-code defect needs
that behavior pin or it ships.**

---

## Tests

New file `packages/platform/src/editor/markerEdit/milestoneMarkerEdit.test.tsx` — 5 pins, all driven
through the public `Editor` so both legs are read the way a host reads them. Strict red-green; every
failure watched against the pre-fix source with its reason confirmed.

| Pin | Red before | Green after |
| --- | --- | --- |
| rename reaches BOTH legs identically | `expected 'qt-s' to be 'qt1-s'` | ✓ |
| the renamed milestone's NODE STATE carries the new marker | `expected 'qt-s' to be 'qt1-s'` | ✓ |
| tokenizer reads `\|who="stuff"` and `\|stuff` as the SAME milestone | (green both sides — it records the tokenizer, deliberately) | ✓ |
| typed `\|who="stuff"` settles to `who="stuff"`, run re-spells to `\|stuff` | n/a (behavior record) | ✓ |
| a departure settle does not move a caret the user placed | `expected 6 to be 3` | ✓ |

`settledGetUsj.test.tsx`: +1 shape ("milestone marker renamed in its opening glyph") × 2 suites =
46 → 48 tests. Vacuous pre-fix, as measured above and recorded in the shape's own comment.

**A test-authoring trap worth passing on.** The first draft of the rename pins selected the glyph by
`getMarkerSyntax() === "opening"`, which matches the PARAGRAPH's own `\p` prefix first in tree
order — so the test renamed the paragraph, not the milestone, and stayed red after a correct fix.
The helper now matches by MARKER NAME and says why in its doc comment. Two of the four original reds
were this, not the product; the product reds are the ones tabulated above, re-confirmed by
reverting the fix against the corrected tests.

---

## Deviations from the brief

- **Defect 1 is not a split-leg bug.** The brief's leading suspect was the fb4 shape ("one settle
  leg mirrors it and the other does not — check `$settledUsj`'s milestone handling for the same
  shape"). Measured: both legs behave IDENTICALLY, before and after. The defect is a shared blind
  spot in the fixed-point signature, which is the brief's second suspect ("the settle refuses as a
  fixed point") — and the first suspect ("applied to display text but not to stored state") is the
  SYMPTOM that refusal produces, not the cause.
- **Defect 2 is not fixed, by design.** The brief's dichotomy did not cover the actual case (the
  tokenizer neither preserves nor normalizes the spelling — USJ cannot represent it), and the
  evidence puts the outcome on the "correct-but-surprising, do not change" branch. Reported with
  the measurements above rather than changed.
- **Defect 3's fix is narrower than "the settle's own restore applies only to carets inside the
  settled region".** Suppressing the restore outright for outside carets would strand them: the
  splice destroys their nodes, so they would fall back to `selectStart`. Changing the anchor's
  COORDINATE SYSTEM keeps every caret alive and moves only the ones that were being moved wrongly.
- No tokenizer changes, **no C# changes** (the approval gate was never approached; one C# capture
  test is RECOMMENDED as follow-up, not written), scribe untouched, no new skips, no API report
  drift.

---

## Verification

Targeted regression contract, run fresh on the finished tree — 12 files, **310 passed, zero skips**:
`milestoneMarkerEdit` 5, `milestoneAttributeSettle` 13, `damagedGlyphSettle`, `glyphDriftHeal`,
`typedByteSettle` 9, `settledGetUsj` 48, `commitTypedCloser`, `corpus-round-trip` 116,
`corpus-transform-fixed-point` 22, `corpus-testusfm-round-trip` 10, `tier2Rebuild.utils` +
`tier2Rebuild.corpus`. `displayRunRegistry` + `attributeDisplay.utils` (shared): 66 passed.

Corpus stays at full strength — 141 paragraphs checked, 0 skip-listed.

Full gate `nx run-many -t test lint typecheck`: **all 10 projects green.**

- platform-editor: 74 files, **1325 passed, 0 skipped** (+7 from this branch: 5 milestoneMarkerEdit
  pins, 1 settledGetUsj shape × the 2 `it.each` suites)
- shared-react: 26 files, 1541 passed + 1 skipped (the pre-existing table round-trip skip in
  `editor-delta.adaptor.test.tsx` — not this branch's)
- shared: 37 files, 537 passed; utilities: 6 files, 51 passed; perf-react 3, scribe 2

### Two toolchain notes for the other groups

- **`platform-editor:typecheck` fails from a stale `dist`, independent of any change.** The fb4
  group's environment finding reproduced exactly: TS6305 "output file has not been built from
  source file", cascading into spurious TS7006s in unrelated test files. Fix, touching no source:
  `npx tsc --build --emitDeclarationOnly --force` in `packages/platform`, after which the gate is
  green. Run the gate BEFORE `extract-api`, which re-rolls `dist` and re-arms the condition.
- **`@lexical/rules-of-lexical` propagates the `$` prefix up the call chain.** A new helper that
  resolves a node key must be `$`-prefixed, AND so must every function that calls it — the rule
  fired twice in sequence here (first on the two new span predicates, then on
  `$caretSpanByteAnchor` once it called one of them). Renaming transitively is the fix; the file's
  pre-existing `$isClosingMarkerSpan` is the precedent.

Corpus stays at full strength — 141 paragraphs checked, 0 skip-listed.

Full gate `nx run-many -t test lint typecheck`: see the final report for per-project numbers.
