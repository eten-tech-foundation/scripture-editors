# Unknown and opaque blocks — handoff

Track: unknown-blocks. Branch `sv/unknown-blocks`, based on `standard-view`.
Plan: `docs/superpowers/plans/2026-08-11-unknown-blocks.md`.
Governing: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

Status: three of the plan's four defects are diagnosed to a root cause. Two fixes landed. Three
findings need your decision before anything else moves — two of them because the fix lives in a
file this track may not touch, one because it is the editability decision itself.

---

## 1. What the plan expected, and what the code actually is

The plan's framing is `UnknownNode` for every opaque kind. **Tables are no longer `UnknownNode`s.**
They are their own node family — `ImmutableTableNode` / `ImmutableTableRowNode` /
`ImmutableTableCellNode` (`libs/shared/src/nodes/usj/`), built by `createTable` / `createTableRow` /
`createTableCell` in `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts`. The
`table` / `table:row` / `table:cell` cases in `unknownUsfm.utils.ts` are now dead for the load path;
they still describe the intended bytes, and the row fix below implements exactly what the
`table:row` case says (`\tr `), but through the table adaptor rather than through
`unknownDisplayParts`.

Consequence for file ownership: **defect 1's fix is in `usj-editor.adaptor.ts`, which §8 assigns to
no track.** No other track's function list touches it. I edited `createTableRow` only. Flagging so
you can confirm nobody else is mid-flight there.

Two smaller corrections to the plan's "what already works" list:

- **The sidebar `\cat` discrepancy is resolved in the plan's favour.** A sidebar's
  `\cat History\cat*` bytes DO render inside its read-only display, in standard view, both from a
  loaded document and from typed USFM. Pinned by a test. The "sidebar cat does not show up at all"
  report does not reproduce; nothing moves to the attribute-markers track on account of it.
- **`\periph` typed as USFM never becomes a `periph` node.** The tokenizer has no `periph` branch,
  so `\periph Title world` resolves to an ordinary `para` with marker `periph`. The `periph` case in
  `unknownUsfm.utils.ts` is reachable only from USX input. Not one of the four defects; recorded
  because the plan lists `\periph` among the kinds in scope.

---

## 2. Diagnosis

All of this is reproduced headlessly, both with the bundled marker table and with a project
`StyleInfo` shaped like a real Paratext `usfm.sty` (`fig` = character with `endMarker`, `tr` /
`esb` / `periph` = paragraph). The bundled table matters more than it looks: it carries 186 markers
generated from `usfm.sty` and contains **none** of `fig`, `tr`, `tc1`, `esb`, `esbe`, `periph`,
`cat`, so every headless test that does not pass a `StyleInfo` is exercising the unknown-marker
path. Both configurations were run for every finding below; where they differ it is called out.

### Defect 1 — `\tr ` typed mid-paragraph. Root cause found, fixed.

`createTableRow` rendered **no opening-marker glyph in any marker mode**, while `createTableCell`
fifteen lines below renders `\tc1` + NBSP in editable mode and an `ImmutableTypedTextNode` in
visible/gutter mode. So typing `\tr ` into `\p hello world` produced:

```
para p            "\p", NBSP, "hello "
immutable-table
  immutable-table-row  marker=tr
    "world"
```

— the `\tr ` bytes gone from the screen and from `root.getTextContent()`, and the rest of the
sentence moved inside a read-only row. The absorption itself is faithful (everything after `\tr` is
table content until the next block marker, which is what ParatextData does); what made it read as
"hides the following content" is that nothing on screen explains the split and there is no glyph to
delete to undo it.

**Fixed** — `createTableRow` now builds the row's opening glyph on exactly the terms
`createTableCell` does. Test: `packages/platform/src/editor/markerEdit/unknownBlockTyping.test.tsx`.

### Defect 2 — `\fig ` does not gray out. Diagnosed; no code change, see §4.

Graying is not marker-driven at all. `.unknown-block` / `.unknown-inline` (usj-nodes.css) key off
the NODE KIND the adaptor builds, which keys off the USJ `type` the parser produced. A `\fig` span
becomes an opaque `figure` **only** when the tokenizer can fold it — which requires an explicit
`\fig*` closer AND at least one parseable `name="value"` attribute (`usfmFragmentToUsj.ts`, the
`figCapture` block). Every other `\fig` shape degrades to an ordinary editable char span (project
sheet) or paragraph (bundled table):

| typed | resolves to | gray? |
| --- | --- | --- |
| `\fig cap\|src="x.jpg"\fig*` | `figure` (UnknownNode) | yes |
| `\fig cap\fig*` | `char` / `para` marker `fig` | no |
| `\fig ` | `char` / `para` marker `fig` | no |
| `\fig \|x.jpg\|span\|1:31\|copy\|cap\|ref\fig*` (USFM 2.0 positional) | `char` / `para` | no |
| `\esb `, `\tr ` | `sidebar` / table | yes |
| `\zz ` | `para` marker `zz` | no |

So the affordance flips under the user mid-typing, on the same marker. The rule is pinned as a rule
in the second `describe` block of `unknownBlockTyping.test.tsx` and asserted across six shapes.

### Defect 3 — content loss on adding attributes to a typed `\fig`. Two mechanisms, both confirmed.

**3a — the caret is restored BEFORE the box, so continued typing lands in the wrong place.**
Type `\fig My caption|src="x.jpg"` then `\fig*` into `\p hello `. The closer terminates the run, Tier 2
rebuilds, the figure folds correctly — and the caret comes back at the END of `"hello "`, before the
box, not after it. Keep typing ` world` and the document becomes
`\p hello  world\fig My caption|src="x.jpg"\fig*`: the new text is on the wrong side of the figure
and the paragraph has a doubled space. The same stranding happens for `\esb ` and `\tr ` typed at
the end of a paragraph — the caret stays in the paragraph the block was split off, so the next thing
typed goes into the old block instead of the new one.

The caret restoration is `$restoreSelectionAtOffset` in `tier2Rebuild.utils.ts`, which invariants §8
puts **off limits** ("actively being edited on `standard-view-pt-4187`"). I did not touch it. See §4.

**3b — a keystroke that reaches an unknown block's content REPLACES all of it.**
`createUnknown` stamps `mode: "token"` on every serialized TextNode among an `UnknownNode`'s
children. The display bytes are `ImmutableTypedTextNode`s (a `DecoratorNode`, genuinely inert), so
that loop only ever hits the node's REAL CONTENT — the figure's caption. Token-mode text is atomic
in Lexical: `RangeSelection.insertText` with the caret inside a token node replaces the whole node.
Measured, with the caret at offset 2 inside `"My caption"` and one character typed:

```
before:  unknown figure > [ "\fig " ][ "My caption" ][ '|src="x.jpg"' ][ "\fig*" ]
after:   unknown figure > [ "\fig " ][ "Z"          ][ '|src="x.jpg"' ][ "\fig*" ]
```

The whole caption is gone for one keystroke. `UnknownNode.createDOM` sets `contentEditable=false`,
so the browser will not put a native caret there — the reachable routes are select-all-then-type, a
paste over a range covering the box, and any programmatic caret move. Narrow, but it is silent
destruction of neighbouring content, which Invariant I forbids outright.

This is the editability decision, so I did not change it unilaterally. See §4.

### Defect 4 — the fabricated trailing space. Fixture already supplied.

`packages/platform/src/editor/adaptors/corpus/corpus-transform-fixed-point.test.tsx` already carries
the two entries this track owes the whitespace track, each naming its mechanism and its owner:
`figure (USFM 3 attributes)` and `table with header and cells` (plus `milestones (ts)`, which is
theirs). Nothing to add. I re-ran the suite after the row fix and the table entry still fails for
the same stated reason — the row glyph does not change which node `$addTrailingSpace` appends to.

### New finding, not in the plan — a closing glyph the document does not contain

`unknownDisplayParts` rendered a closer unconditionally. An unterminated sidebar (`closed="false"`,
which the tokenizer sets when the fragment or a chapter boundary auto-closes one, exactly as
ParatextData does) therefore displayed a `\esbe` that is not in the file — a byte the user can
neither edit away nor save. Char spans already have the opposite rule and say why
(`$charClosingGlyph`, `attributeDisplay.utils.ts`: a `closed="false"` span never renders a closer and
the sync must not fabricate one).

**Fixed** — `closed="false"` suppresses the closing glyph for sidebar, figure, and the generic
default alike.

---

## 3. What changed

| File | Change |
| --- | --- |
| `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` | `createTableRow` renders the row's `\tr ` glyph, mirroring `createTableCell`'s per-mode shape |
| `libs/shared/src/nodes/features/unknownUsfm.utils.ts` | `closed="false"` suppresses the closing glyph; module doc records the rule |
| `libs/shared/src/nodes/features/unknownUsfm.utils.test.ts` | 3 cases for the unterminated-closer rule |
| `packages/platform/src/editor/markerEdit/unknownBlockTyping.test.tsx` | new — typed-block behaviour and the graying rule (9 tests) |
| `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts` | `dataChildren` also strips the marker separator, so a row's new prefix reads through like a cell's |
| `libs/test-data/src/data/2sa.lexical.{editable,visible}.ts` | regenerated for the row glyph (`pnpm generate:test-data`); hidden mode unchanged |

---

## 4. Three things that need your call

### A. Defect 3a — the caret lands before the new block. Fix is off limits to this track.

The repro is above and reproduces in three shapes (`\fig*`, `\esb `, `\tr `). The fix belongs in
`$restoreSelectionAtOffset` / `$rebuildParas` (`tier2Rebuild.utils.ts`), which invariants §8 fences
off. **Recommendation:** hand it to whoever owns `standard-view-pt-4187`, as one requirement — after
a rebuild that produces a node the caret cannot enter, the caret goes AFTER it, not before it.
Worth noting it is not figure-specific; any block that splits off the end of a paragraph strands the
caret the same way, so it may already be on their list under a different symptom.

### B. Defect 3b — token mode on unknown content. This is the editability decision.

Token mode is wrong under **both** answers: under "read-only" the keystroke must be refused, not
swallow the caption; under "editable" it must insert, not replace. So it goes either way, but which
way is your call. What the evidence says:

- **Editable is nearly free for CONTENT.** I edited a figure caption in the tree and it round-tripped
  to USJ correctly (`content: ["My captionX"]`). Content children need no settle path — they are
  plain text inside an opaque object, not USFM to re-tokenize — and `$inLiteralOnlyBlock` /
  `$settleScopeForNode` already keep the whole subtree out of the pend/settle machinery, which is
  the correct behaviour for content and stays correct.
- **Editable is NOT free for the block's own bytes.** Those are `ImmutableTypedTextNode`s and must
  stay inert; making them editable is the settle path the plan warns about
  (`$settleScopeForNode` returns `undefined` for anything under an `UnknownNode`, by design).
- **Read-only needs somewhere to refuse.** Lexical has no element-level "reject insertion"; the
  refusal has to be a command guard, which lands in `MarkerEditPlugin.tsx` — a file this track does
  not own.

**Recommendation: keep read-only, and add the refusal.** It preserves today's product behaviour,
fixes the loss, and satisfies the plan's task 6. But it needs an owner for the guard. The cheaper
interim, if you want the destruction gone this week without settling the product question, is to drop
the token mode: that converts "one keystroke wipes the caption" into "typing edits the caption", which
already round-trips, and `contentEditable=false` still keeps a native caret out. Say which and I will
do it — dropping token mode also means updating two pinned corpus anchors that currently assert
`mode: "token"` on figure captions and cell text.

### C. Defect 2 — is the affordance flip actually a defect?

My reading after the diagnosis: the graying rule as it stands is coherent — "gray means the editor
carries this opaquely" — and `\fig` straddles it because a `\fig` with no attributes is genuinely not
a figure yet (USFM 3.0 requires `|src=`). Making a bare `\fig` gray would mean folding an
attribute-less span into a `figure` object in the tokenizer, which diverges from ParatextData and
touches a fixed point other tracks depend on. The plan's own risk note says to escalate rather than
edit it here.

**Recommendation: do not change the tokenizer.** If the product wants "this marker is not fully
formed" signalled while typing, that is a validation affordance (the `status_unknown` family) rather
than the opaque-block box, and it is a different piece of work. The rule is now asserted across six
shapes so whichever way you go, a change is visible.

---

## 5. Verification

Foreground runs, no new skips.

- `nx test shared` — 32 files, 472 passed, 0 skipped.
- `nx test shared-react` — 26 files, 1533 passed, 2 skipped (both pre-existing).
- `nx test @eten-tech-foundation/platform-editor` — 55 files, 1033 passed, 5 skipped (all
  pre-existing: 2 in `corpus-testusfm-round-trip`, 3 in `corpus-transform-fixed-point`).
- Corpus round-trip: 111 passed, 0 skipped. Corpus testUSFM round-trip: 10 tests, 2 pre-existing
  skips. Corpus transform fixed point: 18 passed, 3 skipped.
- The `table with header and cells` fixed-point entry was un-skipped once, on this branch, to check
  the row glyph had not changed what it fails on. It had not: the diff is still four cells gaining a
  trailing space (`"Day"` → `"Day "`, and the same for `Tribe`/`First`/`Judah`) — `$addTrailingSpace`
  inside the CELL, exactly as the entry says, with no row-level fabrication added. Restored.
- `nx run-many -t typecheck` — clean, 10 projects.
- `nx run-many -t lint` — 10 projects, 0 errors. 13 warnings, all pre-existing `no-console` in
  `packages/scribe`, untouched by this branch.
- `npx eslint` from the repo root over the five changed source files — clean.

## 6. What I deliberately did not do

- Did not touch `tier2Rebuild.utils.ts`, `virtualSettle.utils.ts`, or `settledGetUsj*` (§8).
- Did not change the tokenizer (`usfmFragmentToUsj.ts`) — a fixed point; both places it was
  implicated (defect 2's fold rule, `\periph`) are escalations, not edits.
- Did not change `createTableCell`, even though it now differs from `createTableRow` on one detail:
  the cell's NBSP separator is normal mode while every para prefix (and now the row prefix) is
  tagged `marker-trailing-space`. Tables are read-only so nothing can type into either; recorded
  rather than fixed, since cell editability is owned elsewhere.
- Did not flip the editability model. See §4B.
- No C# was touched, and nothing in this track's diagnosis landed on the C# side — every byte
  discussed here is lost or fabricated inside the TypeScript editor, before any serialization.

## 7. Please test by hand

1. **The row glyph's layout.** `ImmutableTableRowNode.createDOM` builds a real `<tr>`, and the row's
   glyph is now a non-cell child of it, so the browser wraps it in an anonymous cell — the `\tr `
   should appear as a leading column. I could not check this headlessly. If it misaligns the
   columns, the alternative is rendering the row glyph outside the `<tr>` or styling it absolutely;
   say the word and I will.
2. **Type `\tr ` mid-sentence** in standard view. Expect: the paragraph splits, the `\tr ` glyph is
   visible, the sentence tail is inside the row. Then delete the `\tr ` glyph and confirm what
   happens — the row has no settle scope (`$settleScopeForNode` returns `undefined` inside a table),
   so I expect the deletion not to rejoin the paragraph. That is pre-existing for cells; worth
   seeing whether it is acceptable for rows.
3. **Type a complete `\fig …|src="…"\fig*`** and keep typing. Expect the wrong-side text of §4A —
   this is the one to confirm against a real browser before handing it to the pt-4187 owner.
4. **A document with an unterminated `\esb`** (no `\esbe` before the chapter end). Expect no `\esbe`
   on screen now.
