# Feedback: the settle's second pass, the third dissolution edit, and the duplicated milestone

Branch `sv/fb4/settle-rejoin` (worktree `fb4-settle-rejoin`). Three TJ-reported Standard-view
defects, all in the settle engine, all reproduced and MEASURED against the pre-fix source before
any engine code changed. Governing:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md` — Invariant I (displayed bytes are
the document) and Invariant V (a loaded document is a transform fixed point) throughout, plus
Invariant IV ("all three paths run the SAME settle computation; divergence is a defect"), which
turns out to be the through-line for two of the three.

---

## Defect 1 — the rejoin took TWO settles, and the intermediate one reached the FILE

Repro (reported): `\p stuff` → type `\asdf ` → it settles to its own line → delete the backslash →
the `asdf` rejoins the previous line ON SCREEN at the first settle, but what goes to FILE at that
moment still carries a fabricated `\p `; a second settle ~a second later takes it back out.
Notably it does NOT happen when the marker is corrected to `\w` instead.

### Root cause (measured, not inferred)

The brief listed three suspects. A probe drove the real gesture through the mounted `Editor` and
read both legs at every step, which settles it: **the third suspect is the actor, and the first two
are exonerated.**

| Moment | tree (screen) | `getUsj()` (save path) |
| --- | --- | --- |
| after `\asdf ` | `\p stuff` + `\asdf` | 2 paras (correct — unknown-token default) |
| **after deleting the `\`** | `\p stuff` + `asdf` (pending) | **2 paras, second `{marker:"p", content:["asdf "]}`** |
| after departure settle | ONE `\p stuff asdf ` | ONE `\p stuff asdf ` |

The mutating settle already rejoined in ONE pass — the rejoin gate was never the problem. The
divergence is that **`$settledUsj` (virtualSettle.utils.ts), the read-only settle behind
`getUsj()`, had no mirror of the widened rejoin scope at all.** It derives every scope from
`$settleScopeForNode(node)`, which always returns the ONE containing paragraph, and
`$settledParaNodes` rebuilt exactly that paragraph — so the artifact re-tokenized alone and gained
the tokenizer's default `\p` wrapper. Any host save landing anywhere in the pend window (the whole
interval between the user's Backspace and the settle) writes that fabricated paragraph to the file;
the later settle then emits a corrected document, which is TJ's "second settle ~a second later".

**Why `\w` does not show it** — and this is the useful half of the diagnosis: `\w ` is a
TERMINATED opener, so `$markerNodeTransform` matches `TERMINATED_OPENER_REGEX` and applies the
rename (and with it the rejoin) IMMEDIATELY, inside the typing commit. No pend ever exists, so
`getUsj()` takes its `pendedKeys.size === 0` cached fast path and never reaches `$settledUsj`.
The degrade path leaves a glyph (`asdf`) that matches no regex, so it pends and waits for
departure — and the pend window is exactly where the two legs disagree. The bug was never about
"two passes"; it was about a pend window in which the save path and the screen answered
differently.

### Fix

`virtualSettle.utils.ts` now mirrors the widened scope, through the SAME gate the mutating side
uses (see the provenance section for why that sharing is the architectural point):

- `$settledParaNodes` takes `ParaNode[]` instead of one `ParaNode`, and joins their fragments with
  the identical single-space newline stand-in `$rebuildParas` uses, rebasing sentinel spans the
  same way. Its fixed-point comparison (`$signatureOf`, `$structuralMarkersAgree`) spans the whole
  scope.
- `$settledUsj` consults the shared `$unknownSplitRejoinScope` for every pended `MarkerNode` and
  registers `[previous, artifact]` when it qualifies. Widened scopes are applied LAST, deleting the
  single-paragraph entries they subsume and skipping any that would overlap an already-claimed
  paragraph, so every paragraph is rebuilt by exactly one scope and no two splices can target
  overlapping slots. The splice replaces `paras.length` sibling slots rather than one.

---

## Defect 2 — a split whose glyph regains a NON-block marker still fabricated a `\p`

Repro (reported): mid-paragraph, type `\wj things\wj*`, delete the space so it reads
`\wjthings\wj*`, move the caret away → it settles onto a new line as an unknown marker (correct;
the closer gains the separator and becomes an unmatched `\wj*` — also correct). Add the space back
so it reads `\wj things \wj*` → today it settles to `\p \wj things \wj*`.

### Root cause (measured)

The departure arm's degradation test in `$resolvePendingMarkers` was spelled
`!text.startsWith("\\")` — literally "the backslash is gone". `\wj things` still starts with `\`,
so it fell through to `$requestTier2ForNode`'s single-paragraph scope and the artifact
re-tokenized alone, fabricating the `\p`. Probed end to end: the settle produced
`{marker:"p", content:[{char wj …},"stuff"]}` where the previous paragraph should have absorbed it.

This is the third instance of the same artifact class, and the important observation is that the
three triggers are not three facts — they are one fact asked three ways.

### Fix — the gate stopped accumulating conditions and started asking the tokenizer's question

`markerEditTier1.utils.ts` gains `openerBytesEndTheSplit(text, getMarkerFn)`: extract the leading
marker name by the tokenizer's own name-scan rule (`OPENER_NAME_REGEX`, terminating at whitespace
or end of bytes, mirroring `TERMINATED_OPENER_REGEX`'s existing spelling) and ask what KIND that
marker is. All three dissolution edits reduce to it:

| Edited bytes | Name scanned | Verdict |
| --- | --- | --- |
| `asdf` (backslash deleted) | none — no marker interpretation | rejoin |
| `\w `, `\wj` (corrected to a known char marker) | `w`, `wj` → Character | rejoin |
| `\wj things` (separator retyped into the name) | `wj` → Character | rejoin |
| `\q1 things` | `q1` → Paragraph | **keep the split** (authored blockness) |
| `\wjthings` | `wjthings` → not in the sheet | **keep the split** (unknown-token default IS a block) |
| `\f `, `\qt-s` | Note / milestone | keep today's routing, unchanged |

`$applyOpenerRename`'s separate `isCharKindMarker(newMarker)` check is GONE — the gate reads the
glyph's own bytes, which already carry `newMarker` on every path into that function, so the two
call sites now share one condition instead of maintaining two. Verified equivalent case by case for
notes, milestones, `v`/`c`, and unknown markers (an unknown rename never reaches the branch at all:
`isParaKindMarker` returns true for it and the in-place rename applies first).

---

## Defect 3 — a milestone duplicated itself into the FILE

Repro (reported): with `\qt-s|\*` on screen (the pipe typed inside the glyph, correctly staying
pending since the fb2 byte-preservation guard), the FILE gets `\qt-s\*\qt-s\*`.

### Root cause (measured to the byte)

Instrumenting the serialization leg directly gives the whole mechanism in one line — the paragraph
fragment for the pended state is:

```
"\p before ￼\qt-s|\* after"        (1 sentinel recorded)
```

Both the U+FFFC sentinel AND the glyph bytes are in it. The chain:

1. `$milestoneAttributeRunPieces` (shared, `attributeDisplay.utils.ts`) reports a byte-damaged
   glyph as ABSENT — deliberately, and correctly for the self-healing sync, which needs the damage
   to read as run divergence so the caret can grace the mid-edit shape.
2. `$milestoneDisplayRun` (tier2Rebuild.utils.ts) turned that into "this milestone has NO run"
   (`if (wrapper) return opening ? [wrapper] : []`), so the milestone took the non-re-tokenizable
   branch and was pushed as a preserved SENTINEL — and, because the run was reported as zero
   length, `index += run.length` advanced past nothing.
3. The next loop iteration therefore visited the `AttributeRunNode` wrapper as an ordinary
   transparent element and flattened its glyph bytes into the fragment as literal text.
4. The tokenizer re-derived a milestone from those bytes; `replaceSerializedSentinels` restored the
   preserved one. Two milestones out of one.

**It is the READ-ONLY leg only.** Measured: with the byte pending, the tree holds one milestone
and `getUsj()` returns two; on genuine caret departure the mutating settle produces one and one.
The mutating path is spared because the pended glyph maps to its display OWNER and
`$settlePendedDisplayOwner` heals the run canonically before any paragraph rebuild sees it — the
read-only settle has no display-owner settle and goes straight to the fragment.

### Fix

`$milestoneDisplayRun` is SLOT accounting, so it no longer requires canonicality — the question it
answers is "how many sibling slots does this milestone's run occupy", and a wrapper occupies its
slot whether or not the glyphs inside it are mid-edit. `if (wrapper) return [wrapper]`, plus the
same slot-claim for the loose (unwrapped) shape taken from the sibling directly, so an undo-stack
or pre-flip tree cannot reach the identical doubling.

The protection the old zero-length return was really providing — never splice away a bare
milestone that has no displayable bytes — moves to where it belongs, an explicit byte gate
`milestoneRunRendersBytes(run)` replacing `run.length > 0` at both call sites (fragment builder and
signature builder, which must mirror each other or the fixed-point check diverges). An empty
wrapper now still claims its slot AND still degrades to a sentinel, which is strictly safer than
before: previously an empty wrapper's slot was left unconsumed too.

---

## Architectural re-assessment: provenance vs the heuristics, with two new instances in hand

TJ's standing question, re-opened by defects 1 and 2 being the third and fourth instances of "an
artifact paragraph is not recognized as an artifact": replace the gates with explicit artifact
PROVENANCE — a node-state flag stamped when the settle fabricates a paragraph, cleared on genuine
user retag — or keep heuristics?

**Decision: keep heuristics. This round made them SIMPLER, not more tangled, and provenance would
not have answered either new instance.**

The re-assessment, instance by instance:

- **The four instances are not four gates.** Instances 1-3 (unknown→char rename, unknown→plain,
  unknown→char-with-content) are one predicate asked about different bytes. Before this round they
  were two hand-written conditions (`isCharKindMarker(newMarker)` at one call site,
  `!text.startsWith("\\")` at the other) that had to be extended in lockstep — and defect 2 is
  exactly what happens when one of them is extended and the other is not. They are now a single
  `openerBytesEndTheSplit` reading the tokenizer's name-scan rule, and the accumulation TJ was
  worried about ran backwards: three triggers, one condition, one fewer call-site check than
  before.
- **Instance 4 (defect 1) is not a gate problem at all.** The gate was right; it existed on only
  ONE of the two settle legs. A provenance flag would have been read by that same single leg and
  the save path would have written the fabricated `\p` exactly as it did. The actual fix is the
  structural one Invariant IV asks for: `$unknownSplitRejoinScope` is now EXPORTED and both legs
  consult it, so the mutating settle and the read-only settle cannot disagree about which
  paragraphs the tokenizer sees together. That is the durable answer to "the gates keep growing" —
  one gate, two consumers, enforced by sharing rather than by mirroring.
- **Provenance still would not decide the question.** Even with a flag, the gate must ALSO ask
  whether the leading bytes are block-shaped right now: the requested guard pin ("an unknown-split
  artifact whose content still starts with a genuine BLOCK marker still does not merge") is a case
  where provenance says "artifact" and the correct answer is "keep the split". So provenance would
  be an ADDITIONAL input, never a replacement — a fourth heuristic beside the others, which is the
  outcome the question was trying to avoid.
- **Provenance would contradict a pinned decision.** fb3 established, and pinned both ways, that a
  LOADED unknown paragraph rejoins identically to a split artifact, because ParatextData parses the
  joined bytes the same either way. A provenance-gated rejoin would not fire there (no flag on a
  loaded paragraph) and would regress that pin. The bytes are the oracle precisely because
  provenance is not observable in the file.
- The cost side is unchanged from fb3's assessment and still real: node-state serialization,
  undo/redo restore semantics, collab delta-apply, and a clearing rule of its own — four places for
  a flag to go stale, reintroducing as data the class of bug heal-by-provenance exists to prevent.

**Revisit trigger, carried forward and now sharpened:** implement the node-state flag the day a
gate needs artifact-vs-authored where the BYTES ARE IDENTICAL and the tokenizer cannot arbitrate —
e.g. an artifact `\p` (marker byte present) that must dissolve while a byte-identical authored `\p`
must not. Every instance so far has been decidable from bytes. Additionally: **a new gate that
lands on only one settle leg is now the louder smell** — defect 1 cost a corrupted save for a
second, and no gate heuristic caused it.

---

## Tests

Strict red-green; every failure watched against the pre-fix source with its reason confirmed.

**`unknownSplitRejoin.test.tsx` (7 → 10).**

- *Defect 1, the brief's pin:* the full gesture through the public `Editor` — type `\asdf `,
  delete the backslash, read `getUsj()` INSIDE the same `act()` (with a vacuity guard that the pend
  actually landed, or the read takes the cached fast path and proves nothing), then depart. Asserts
  the save path already carries the rejoined document DURING the pend, and after the one settle
  both the tree (ONE paragraph) and `getUsj()` agree — byte-identical to
  `usfmFragmentToUsjContent("\\p stuff asdf ")`. **Red:** the pended read returned two paragraphs,
  the second `{marker:"p", content:["asdf "]}` — TJ's fabricated `\p ` verbatim.
- *Defect 2:* the artifact shape as the first settle leaves it (`\p some ` + unknown `\wjthings`
  holding an unmatched `\wj*`), glyph retyped to `\wj things`, departure. Asserts the artifact
  paragraph is gone, the `wj` span rides in the previous paragraph, and the settled USJ is
  byte-exactly `usfmFragmentToUsjContent("\\p some  \\wj things \\wj*stuff")` — the tokenizer over
  the JOINED displayed bytes, double space included (the previous paragraph's own trailing space
  plus the joiner's newline stand-in; the writer's newline consumes one on save, invariants §3.3).
  **Red:** three paragraphs — the fabricated `\p` survived.
- *Defect 2's guard:* the same artifact whose glyph is retyped to `\q1 things` does NOT merge.
  Green both sides (it pins the gate's ceiling, not a fix).
- The file's seven existing pins — including "a user-authored `\p` paragraph starting with a char
  span never merges" and the no-predecessor default-`\p` pin — stayed green untouched.

**`virtualSettle.utils.test.tsx` (13 → 14).** Defect 3 at the serialization level, as the brief
asked: build the pended state (milestone + wrapped run, `|` pended into the opening glyph via
`$pendGlyphEdit`, no caret needed), read `$settledUsj`, assert EXACTLY ONE `ms` object and no
`\qt-s` literal surviving in the text. **Red:** `expected [ Array(2) ] to have a length of 1`.

**`settledGetUsj.test.tsx` (19 → 22 shapes, ×2 suites = +6 tests).** Three shapes added to the
equivalence + fixed-point contract: the backslash-loss artifact, the non-block-marker artifact, and
the milestone typed byte. **Red on two of the three** — the backslash-loss shape (virtual said two
paragraphs, real said one) and the milestone shape (virtual said two milestones, real said one).
The non-block-marker shape was **vacuously equal pre-fix**, both legs fabricating the same `\p`
(recorded rather than forced — defect 2's red is the behavior pin above); it is a genuine standing
pin now, since it holds only because BOTH legs widen.

---

## Deviations from the brief

- **Defect 1's diagnosis is the brief's third suspect, and the first two are positively
  exonerated.** The widened rebuild is not refused as a fixed point on the first pass, and the
  rejoin does not happen in a later transform pass: the mutating settle rejoins in ONE pass, on the
  first one, measured. There was never a second settle on the SCREEN — only a save that read a
  different answer than the screen showed.
- **The brief's phrasing "the rejoin takes TWO settles" is precise about the file and not about the
  engine.** The pin is written accordingly: it asserts the save path DURING the pend window, which
  is where the divergence actually lives, in addition to the post-settle state the brief named.
  Asserting only "after the first settle" would have passed pre-fix.
- **Defect 3 is a read-only-leg defect, not a shared one.** The brief offered "the editor→USJ leg
  for a pended milestone glyph, or the virtual settle's splice"; it is neither exactly — it is the
  shared FRAGMENT BUILDER's slot accounting, which only the read-only leg reaches in this state
  (the mutating leg heals the run at its display owner first). Fixing it in the fragment builder
  repairs both legs uniformly and also closes the same doubling for the loose (unwrapped) run
  shape, which was reachable by the identical path.
- **Defect 2's byte-exact oracle carries a double space** (`\p some  \wj things \wj*stuff`) — the
  previous paragraph's own trailing space plus the fragment joiner's newline stand-in. Pinned as
  the tokenizer produces it rather than hand-normalized.
- No tokenizer changes, no C# changes (the gate was never approached), scribe untouched, no new
  corpus skips, no API report drift.

## Verification

- Targeted suites, all green, zero skips: unknownSplitRejoin 10; virtualSettle.utils 14;
  settledGetUsj 46; milestoneAttributeSettle 13; typedByteSettle 9.
- Corpus safety net re-run on the final tree: corpus-round-trip 116,
  corpus-transform-fixed-point 22, corpus-testusfm-round-trip 10, tier2Rebuild.corpus 1 —
  **141 paragraphs checked, 0 skip-listed**.
- Full gate `nx run-many -t test lint typecheck`: **all 10 projects green**.
  - platform-editor: **72 files, 1299 passed, 0 skipped** (+10 from this branch: 3
    unknownSplitRejoin, 1 virtualSettle.utils, 3 settledGetUsj shapes × the 2 `it.each` suites)
  - shared-react: 26 files, 1536 passed + 1 skipped (the pre-existing table round-trip skip in
    `editor-delta.adaptor.test.tsx` — not this branch's)
  - shared: 37 files, 536 passed; utilities: 6 files, 51 passed; perf/scribe unchanged
- `nx run-many -t extract-api`: working tree clean afterward — **no API report drift**. The one
  new export (`$unknownSplitRejoinScope`) is marker-edit-internal, not barreled through
  `src/index.ts`. (api-extractor's `settledGetUsj.test-helpers` / `./editor.model` warning was
  confirmed pre-existing by re-running it against a stashed clean HEAD.)

### Environment finding — `platform-editor:typecheck` fails from a stale `dist`, independent of any change

Worth passing to the other groups, because it costs a confusing gate failure. On a fresh worktree
following the standard setup (`build` + `extract-api` for `shared shared-react utilities
test-data` only), `nx typecheck platform-editor` fails with **172 errors** — almost all TS6305
("output file has not been built from source file"), cascading into a few spurious TS7006s where
the missing declarations strip a lambda's contextual type.

Cause: `packages/platform`'s `build` (`vite build`) and `typecheck` (`tsc --build
--emitDeclarationOnly`) share the SAME output directory. The vite/api-extractor build leaves a
ROLLED-UP `dist/index.d.ts` plus a `dist/tsconfig.lib.tsbuildinfo` that claims the project is up
to date, so `tsc --build` emits nothing while its project references look for per-file
declarations that are not there.

**Confirmed not caused by this branch:** measured at 172 errors on a stashed clean HEAD.
**Fix that works and touches no source:** `npx tsc --build --emitDeclarationOnly --force` in
`packages/platform` once, after which the full gate is green. Note that a later
`nx run-many -t extract-api` re-rolls `dist` and re-arms the condition, so run the gate before
extract-api or repeat the `--force` between them.
