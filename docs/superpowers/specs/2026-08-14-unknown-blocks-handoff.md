# Unknown and opaque blocks — handoff

Track: unknown-blocks. Branch `sv/unknown-blocks`, based on `standard-view`.
Plan: `docs/superpowers/plans/2026-08-11-unknown-blocks.md`.
Governing: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

All four of the plan's defects are diagnosed to a root cause. Three are fixed, one is fixed by the
whitespace track from a fixture this track supplies, and one — the graying rule — was reviewed and
deliberately left alone. Two fixes needed a decision from the repo owner first; both were approved
and are included here.

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
no track.** No other track's function list touches it. Only `createTableRow` was edited.

Two smaller corrections to the plan's "what already works" list:

- **The sidebar `\cat` discrepancy is resolved in the plan's favour.** A sidebar's
  `\cat History\cat*` bytes DO render inside its read-only display, in standard view, both from a
  loaded document and from typed USFM. Pinned by a test. The "sidebar cat does not show up at all"
  report does not reproduce; nothing moves to the attribute-markers track on account of it.
- **`\periph` typed as USFM never becomes a `periph` node.** The tokenizer has no `periph` branch,
  so `\periph Title world` resolves to an ordinary `para` with marker `periph`. The `periph` case in
  `unknownUsfm.utils.ts` is reachable only from USX input. Not one of the four defects; recorded
  because the plan lists `\periph` among the kinds in scope.

### A correction the invariants doc should absorb

§8 fences `tier2Rebuild.utils.ts`, `virtualSettle.utils.ts` and `settledGetUsj*` as "actively being
edited on `standard-view-pt-4187`". That premise is stale for `tier2Rebuild.utils.ts`:
`git diff standard-view standard-view-pt-4187 -- packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts`
is **9 lines**, and standard-view is the AHEAD side — that branch's work on this file already landed
and standard-view has since refactored past it (`$isMarkerTrailingSeparator`). The fence cost this
track a full escalation cycle for a ten-line fix. Worth re-checking the other two files and
narrowing or dropping the entry.

---

## 2. Diagnosis

All of this is reproduced headlessly, both with the bundled marker table and with a project
`StyleInfo` shaped like a real Paratext `usfm.sty` (`fig` = character with `endMarker`, `tr` /
`esb` / `periph` = paragraph). The bundled table matters more than it looks: it carries 186 markers
generated from `usfm.sty` and contains **none** of `fig`, `tr`, `tc1`, `esb`, `esbe`, `periph`,
`cat`, so every headless test that does not pass a `StyleInfo` is exercising the unknown-marker
path. Both configurations were run for every finding below.

### Defect 1 — `\tr ` typed mid-paragraph. Fixed.

`createTableRow` rendered **no opening-marker glyph in any marker mode**, while `createTableCell`
fifteen lines below renders `\tc1` + NBSP in editable mode and an `ImmutableTypedTextNode` in
visible/gutter mode. Typing `\tr ` into `\p hello world`:

```
BEFORE                                   AFTER
immutable-table                          immutable-table
  immutable-table-row  marker="tr"         immutable-table-row  marker="tr"
    text "world"                             marker marker="tr" "\tr"
                                             text NBSP
                                             text "world"
```

The `\tr ` bytes were gone from the screen and from `root.getTextContent()`, and the rest of the
sentence had moved inside a read-only row. The absorption itself is faithful (everything after `\tr`
is table content until the next block marker, which is what ParatextData does); what made it read as
"hides the following content" is that nothing on screen explained the split and there was no glyph to
delete to undo it.

**Showing the glyph exposed a latent CSS defect, fixed with it.** The glyph and its NBSP separator
are the only non-cell children of the `<tr>`, so the browser wraps them in an ANONYMOUS table cell.
`.text-spacing .usfm_tr` carries a `-5vw` hanging indent — right for a `\tr` rendered as a block of
text, meaningless in a real table — which that anonymous box inherits, and which has no class to
reset it the way `.table-cell` resets the real cells. On screen the glyph flew off to the left of
the table. `ImmutableTableRowNode.createDOM` now stamps `text-indent: 0` inline.

Inline, not a stylesheet rule, because no static selector reliably wins: a project `StyleInfo` that
gives `tr` a `firstLineIndent` emits `.editor-input.usfm .usfm_tr { text-indent: … }`
(`generateUsjCss.ts:91`), injected after the static sheet at a specificity a static rule ties at
best. Paratext 9 resolves it identically — every `<tr>` it emits carries
`style="TEXT-INDENT: 0in;"`. Cells need nothing of their own: with the row at zero they inherit
zero, which is also why PT9 stamps the row and not the cells.

The indent itself is not a mistake to delete: `\Marker tr` in `usfm.sty` carries
`\LeftMargin .5` and `\FirstLineIndent -.25`, and our `10vw` / `-5vw` are exactly those at
CSSCreator's ×20 scaling. It is correct for a `\tr` rendered as a block — which happens here in note
content, where table assembly is disabled and a `\tr` stays a `ParaNode` carrying `usfm_tr`. PT9
keeps the rule and cancels it per row for the same reason, and its XSLT says so outright:
`<!-- Cancel any text indent so that the table markers are visible -->`
(`ScriptureViews/Standard.xslt:717`). The cancel is unconditional there — no marker mode, no view,
no stylesheet gates it.

One structural difference from PT9 remains, deliberately: PT9 puts the row's glyph in a REAL
`<td class="markercell">`, where ours rides in the browser's anonymous cell. Layout-equivalent — an
anonymous cell participates in the table's column structure like any other — but an anonymous box is
not a `td` ELEMENT, so it matches neither the `.usfm td` padding rule nor the `.usfm td.markercell`
border reset already ported into usj-nodes.css (that reset has therefore never matched anything).
The border it does not need; the horizontal padding it did miss, and a rule on the glyph itself now
supplies it. Making it a real `<td>` needs a node to hang the cell on — Lexical maps one node to one
element, and `getDOMSlot` cannot route SOME children into a wrapper and leave the rest as siblings —
so it means a new display-only node class in the document schema, through both adaptors, plus
fixture regeneration. Not worth 0.28em; recorded in case that column ever needs a width of its own.

### Adjacent defect found while checking PT9. Fixed.

PT9 emits every cell as a `<td>`, header cells included (`<td class="usfm_th1 align_start">`), so
`ScriptureBase.css` styles them with a single `td` selector. `ImmutableTableCellNode` renders a real
`<th>` for `th*` markers — better markup, but it matched no `td` selector, so **header cells had
neither the border nor the padding** the ported rule gives body cells. Fixed by naming `th` in the
selector rather than by giving up the semantic element. Pre-existing and outside the plan; one
selector, easily reverted.

### Defect 2 — `\fig ` does not gray out. Diagnosed; deliberately no code change.

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

So the affordance flips under the user mid-typing, on the same marker. **Reviewed and left as is**
(owner decision): a `\fig` with no attributes is genuinely not a figure yet — USFM 3.0 requires
`|src=` — and making a bare one gray would mean folding an attribute-less span into a `figure` object
in the tokenizer, diverging from ParatextData inside a fixed point other tracks depend on. If the
product wants "this marker is not fully formed" signalled while typing, that is a validation
affordance (the `status_unknown` family), not the opaque-block box, and it is separate work.

The rule is now pinned AS A RULE in the second `describe` of `unknownBlockTyping.test.tsx` and
asserted across the six shapes above, so any future change to it fails a test rather than drifting.

### Defect 3 — content loss on adding attributes to a typed `\fig`. Two mechanisms. Both fixed.

**3a — the caret was restored BEFORE the box, so continued typing landed on the wrong side.**
Type `\fig My caption|src="x.jpg"` then `\fig*` into `\p hello `, then keep typing ` world`:

```
BEFORE   \p hello  world\fig My caption|src="x.jpg"\fig*    ← wrong side, doubled space
AFTER    \p hello \fig My caption|src="x.jpg"\fig* world
```

Root cause: `$selectAtFragmentOffset` (`tier2Rebuild.utils.ts`) walks the rebuilt spans. The figure
is a SENTINEL span, which the forward scan skips as unaddressable. The caret offset ran past every
addressable span, so the fallback reverse-found the last addressable one and parked the caret at the
end of `"hello "`. There was already a sibling arm for the analogous case — `$selectAfterClosingSpan`,
for a typed closer at paragraph end — and the sentinel case had none. Fixed by adding it
(`$selectAfterSentinelRun`). It resolves the run's LAST node before appending, because a verse or
milestone rides in its sentinel together with its display run, and `selectNext` off the first node
would land inside that run.

Not figure-specific: any block that splits off the end of a paragraph stranded the caret the same
way, so `\esb ` and `\tr ` at a paragraph end are fixed by the same change.

**3b — a keystroke that reached an unknown block's content REPLACED all of it.**
`createUnknown` stamps `mode: "token"` on every serialized TextNode among an `UnknownNode`'s
children. The display bytes are `ImmutableTypedTextNode`s (a `DecoratorNode`, genuinely inert), so
that loop only ever hits the node's REAL CONTENT — the figure's caption. Token-mode text is atomic in
Lexical: inserting into a token node replaces the whole node. With the caret two characters into
`"My caption"` and one `Z` typed, through the real `CONTROLLED_TEXT_INSERTION_COMMAND` path:

```
BEFORE   \fig Z|src="x.jpg"\fig*              ← the entire caption, gone, for one keystroke
AFTER    \fig My caption|src="x.jpg"\fig*     ← refused; the character never appears
```

Fixed by the owner's decision — **blocks stay read-only, and the keystroke is refused** — in a new
`OpaqueBlockGuardPlugin` (shared-react), mounted in `Editor.tsx`. See §4 for the rule it applies and
what it deliberately does not claim.

### Defect 4 — the fabricated trailing space. Fixture supplied; whitespace track lands the fix.

`corpus-transform-fixed-point.test.tsx` already carries the two entries this track owes the
whitespace track, each naming its mechanism and its owner: `figure (USFM 3 attributes)` and
`table with header and cells` (plus `milestones (ts)`, which is theirs). Nothing to add. The table
entry was un-skipped once on this branch to confirm the row-glyph fix had not changed what it fails
on; it had not — still four cells gaining a trailing space, `$addTrailingSpace` inside the CELL,
exactly as the entry says.

### New finding, not in the plan — a closing glyph the document does not contain. Fixed.

`unknownDisplayParts` rendered a closer unconditionally. An unterminated sidebar (`closed="false"`,
which the tokenizer sets when the fragment or a chapter boundary auto-closes one, exactly as
ParatextData does) therefore displayed a `\esbe` that is not in the file — a byte the user can
neither edit away nor save. Char spans already have the opposite rule and say why
(`$charClosingGlyph`, `attributeDisplay.utils.ts`). `closed="false"` now suppresses the closing glyph
for sidebar, figure, and the generic unknown span alike.

---

## 3. What changed

| File | Change |
| --- | --- |
| `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` | `createTableRow` renders the row's `\tr ` glyph, mirroring `createTableCell`'s per-mode shape |
| `libs/shared/src/nodes/usj/ImmutableTableRowNode.ts` | zeroes the row's first-line indent inline, so the new glyph is not dragged outside the table |
| `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` | `$selectAfterSentinelRun` — the caret lands after an opaque construct the rebuild put at the end, not before it |
| `libs/shared-react/src/plugins/usj/OpaqueBlockGuardPlugin.tsx` | new — refuses an edit aimed inside an opaque construct |
| `libs/shared-react/src/plugins/usj/index.ts` | exports it |
| `packages/platform/src/editor/Editor.tsx` | mounts it, ungated by view |
| `libs/shared/src/nodes/features/unknownUsfm.utils.ts` | `closed="false"` suppresses the closing glyph; module doc records the rule |
| `libs/shared/src/nodes/features/unknownUsfm.utils.test.ts` | 3 cases for the unterminated-closer rule |
| `packages/platform/src/editor/markerEdit/unknownBlockTyping.test.tsx` | new — typed-block behaviour, the caret hand-off, the refusal, and the graying rule (13 tests) |
| `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts` | `dataChildren` also strips the marker separator, so a row's new prefix reads through like a cell's |
| `libs/test-data/src/data/2sa.lexical.{editable,visible}.ts` | regenerated for the row glyph (`pnpm generate:test-data`); hidden mode unchanged |

---

## 4. The refusal rule, and what it deliberately is not

`OpaqueBlockGuardPlugin` refuses an edit **only when both ends of the selection sit inside the SAME
opaque construct** — an `UnknownNode` or a table. Three deliberate limits:

- **A selection that spans a block from OUTSIDE is not touched.** That is a request to replace a
  region of the document, which is the structural-deletion track's question. Annexing it here would
  turn a targeted guard into a blanket one.
- **Navigation and copying are not touched.** A read-only block is selectable and copyable by
  design; only keys that insert or delete are refused, and any Ctrl/Meta/Alt chord is treated as a
  command rather than as text, so Ctrl+C, Ctrl+Z and the marker engine's Ctrl+Space all still reach
  their handlers.
- **Dragging OUT of a block is not blocked**, so drag-to-copy keeps working. The destructive
  clipboard directions — cut, and a drop landing inside — are refused by their own commands. A
  drag-MOVE out of a block is the one gap left open by that choice; it is narrow, and blocking
  `DRAGSTART` outright would cost a working affordance to close it.

Tables are included alongside `UnknownNode` because their cell content carries the same token mode
and the same hazard, and the rule is identical. If table editability (owned elsewhere) later lands,
one predicate — `$opaqueBlockAncestor` — is where it comes back out.

---

## 5. Verification

Foreground runs, no new skips.

- `nx test shared` — 32 files, 473 passed, 0 skipped.
- `nx test shared-react` — 26 files, 1533 passed, 2 skipped (both pre-existing).
- `nx test @eten-tech-foundation/platform-editor` — 55 files, 1037 passed, 5 skipped (all
  pre-existing: 2 in `corpus-testusfm-round-trip`, 3 in `corpus-transform-fixed-point`).
- Corpus round-trip: 111 passed, 0 skipped. Corpus testUSFM round-trip: 10 tests, 2 pre-existing
  skips. Corpus transform fixed point: 18 passed, 3 skipped.
- `nx run-many -t typecheck` — clean, 10 projects.
- `nx run-many -t lint` — 10 projects, 0 errors. 13 warnings, all pre-existing `no-console` in
  `packages/scribe`, untouched by this branch.
- Every fix landed red-then-green: the row glyph, the caret hand-off and the refusal each have a
  test that failed on the pre-fix source for the stated reason before it passed.

One test-harness note worth knowing: the Backspace refusal test's pre-fix failure in jsdom is a
throw from `domSelection.modify` (unimplemented in jsdom), not a visible wipe. The assertion is
still the right one — with the guard, the command never reaches the delete path at all — but a
reader comparing it to the typed-character test should not expect the same failure shape.

## 6. What I deliberately did not do

- Did not change the tokenizer (`usfmFragmentToUsj.ts`) — a fixed point. Both places it was
  implicated (defect 2's fold rule, `\periph`) are recorded above rather than edited.
- Did not touch `virtualSettle.utils.ts` or `settledGetUsj*`. The `tier2Rebuild.utils.ts` edit was
  made only after the owner lifted §8's fence for it; see §1 for why the fence's premise is stale.
- Did not change `createTableCell`, even though it now differs from `createTableRow` on one detail:
  the cell's NBSP separator is not tagged `marker-trailing-space` while every para prefix (and now
  the row prefix) is. Tables are read-only so nothing can type into either; recorded rather than
  fixed, since cell editability is owned elsewhere.
- Did not touch scribe (unmaintained; nothing here targets it), so its editor does not mount the
  guard. Its own opaque blocks keep today's behaviour.
- No C# was touched, and nothing in this track's diagnosis landed on the C# side — every byte
  discussed here is lost or fabricated inside the TypeScript editor, before any serialization.

## 7. Please test by hand

1. **The row glyph's layout**, in a running editor — the one thing no headless test reaches, since
   jsdom does no layout. Expect the `\tr ` as a narrow leading column, rows aligned with each other.
   The first cut of this fix got it wrong (the glyph flew off to the left of the table on the
   inherited `\tr` hanging indent); the inline `text-indent: 0` is what corrects it, so this is
   worth re-checking against a project whose stylesheet gives `tr` a `FirstLineIndent` as well as
   against the bundled one.
2. **Type `\tr ` mid-sentence** in standard view. Expect: the paragraph splits, the `\tr ` glyph is
   visible, the sentence tail is inside the row. Then try deleting the `\tr ` glyph — the row has no
   settle scope (`$settleScopeForNode` returns `undefined` inside a table), so I expect the deletion
   not to rejoin the paragraph. That is pre-existing for cells; worth seeing whether it is acceptable
   for rows.
3. **Type a complete `\fig …|src="…"\fig*` and keep typing.** Expect the continued text to land after
   the gray box, with no doubled space.
4. **Try to type into a figure's caption, and into a table cell.** Expect nothing to happen —
   specifically, expect the caption NOT to vanish. Then confirm Ctrl+C still copies from inside the
   block, and arrow keys still move across it.
5. **A document with an unterminated `\esb`** (no `\esbe` before the chapter end). Expect no `\esbe`
   on screen.
