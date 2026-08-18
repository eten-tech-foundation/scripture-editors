# Feedback: typed-byte settle contract, Enter after inline markers, sweep — outcome

Branch `sv/fb2/engine-three` (worktree `fb2-engine-three`). Two reported defects fixed red-green,
a six-plan completeness sweep, and two bounded verifications. Governing rules:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md`, Invariant I (displayed bytes are
the document; no silent no-ops) throughout.

---

## Defect 1 — a byte typed into a milestone glyph was silently discarded, caret teleported

Repro (reported): `\qt-s\*` on screen, caret between the `s` and the closer's `\`, type `|`, wait
~a second. The idle settle removed the `|` and moved the caret after the `*`.

### Root cause (reproduced under jsdom, then traced function by function)

1. The typed `|` lands in the run's opening `MarkerNode` (`\qt-s|`). Only the GLYPH's key pends
   (`$markerNodeTransform`, `markerEditTier1.utils.ts`); the milestone owner never enters
   `pendingKeys`, and the departure clock shields the caret's own node — so the pend waits for the
   idle clock.
2. On the idle tick (`exceptKey: undefined` — shields nothing, by design since the
   idle-overrides-grace change), `$resolvePendingMarkers`'s `$isMarkerNode` arm routes the glyph
   straight to a Tier-2 paragraph rebuild, bypassing the display-owner settle and all of its grace
   machinery.
3. The rebuild fragment DOES carry the typed byte (`… \qt-s|\* …`). It dies in the tokenizer —
   correctly: `scanMilestone` reads `|` as the attribute-list delimiter and `parseAttributeText`
   returns no attributes for an empty tail, so `\qt-s|\*` MEANS a milestone with no attributes.
   The rebuilt canonical run therefore has no `|` — the settle accepted a keystroke and discarded
   it later, mid-composition, the exact shape the no-silent-no-ops rule forbids.
4. The caret restore then had no byte to restore into: the old cumulative-offset walk resolved the
   captured offset past the skipped `\*` span (live browsers: caret after the `*`; jsdom: further
   fallbacks).

### Fix

Two changes in `packages/platform/src/editor/markerEdit/`:

- **Idle byte-preservation guard** (`$idleSettleWouldDiscardCaretHeldBytes`,
  `tier2Rebuild.utils.ts`, wired into both settle arms of `$resolvePendingMarkers`): an idle-clock
  settle whose paragraph-scope re-tokenization would LOSE non-whitespace bytes while the collapsed
  caret holds that scope re-pends instead — the same family as the emptied-husk carve-out. The
  site stays visibly pending; genuine caret departure settles it per the tokenizer (the `|`
  resolves away then, with no held caret to betray — pinned as correct). The comparison is a
  non-whitespace character count between the fragment text and the tokenized output folded back to
  approximate bytes; the fold deliberately over-emits (a false positive merely defers that one
  settle to departure — the pre-idle-clock behavior).
- **Byte-anchored caret restore** (`caretSpanByteAnchor` / `$selectAtFragmentByteAnchor`,
  `tier2Rebuild.utils.ts`, all three scopes — para, note, chapter): capture and restore now use
  "N non-whitespace characters before the caret, plus a trailing whitespace run" instead of a raw
  cumulative character offset. The engine legitimately inserts/moves display whitespace across a
  rebuild (NBSP separators, paragraph joiners), which shifted cumulative offsets to the wrong side
  of the typed byte (the char-opener and closer cases restored the caret one byte BEFORE the byte
  the user just typed). The caret now follows its byte through glyph-to-content migrations, span
  splits, and paragraph splits. All pre-existing exact-caret pins (`\wjasdf` offset 3, para-prefix
  rename offset 3, damaged-glyph settles) stay green — where whitespace is stable the two
  coordinate systems agree.

Tests: `typedByteSettle.test.tsx` (new, 9 pins, red first with confirmed failure reasons — the
lone-`|` pin failed on the discarded byte; the char pins failed with the exact off-by-one).

## The kind-by-kind typed-byte matrix

Probed by driving each shape through the real command path (gesture keydown + `insertText`, fake
timers for the idle clock). "Resolve" means the settled bytes equal what
`usfmFragmentToUsjContent` produces for the displayed bytes — the mandated authority, checked
directly against the tokenizer for every row.

| Kind / site | Typed byte | Idle-settle outcome (after fix) | Caret | Pinned |
| --- | --- | --- | --- | --- |
| milestone opener glyph | lone `\|` (tokenizer drops it) | **stays visibly pending** (guard re-pends); resolves away on genuine departure | stays at the byte, exact offset | typedByteSettle 1-2 |
| milestone opener glyph | complete `\|x="y"` | resolves: milestone gains the attribute, run heals canonical | at the byte (value-node end), via the settle's own restore | typedByteSettle 3 |
| milestone opener glyph | letter (`\qt-sa`) | resolves: paragraph split per tokenizer (unknown para `qt-sa` + unmatched `\*`), milestone dissolves | in the renamed glyph after the typed byte | typedByteSettle 4 |
| char opener glyph (`\nd\|`) | `\|` | resolves: `\|` becomes span CONTENT (nd carries no attributes) | immediately after the typed byte (was one byte short before the fix) | typedByteSettle 5 |
| char closer glyph (`\nd\|*`) | `\|` | resolves: tokenizer's span split (two unclosed spans, second holds `\|*`) | immediately after the typed byte | typedByteSettle 6 |
| `\va` run value | `\|` | resolves: byte joins `altnumber` verbatim, display unchanged | never moves (no rebuild needed) | typedByteSettle 7 |
| chapter `\ca` run value | `\|` | resolves: byte joins the chapter's `altnumber` verbatim | see the jsdom note under Verification (b) | typedByteSettle 8 (bytes) |
| note `\cat` run value | `\|` | resolves: byte joins `category` verbatim | see the jsdom note under Verification (b) | typedByteSettle 9 (bytes) |
| `\ca` opener glyph | `\|` | byte survives as a loose text node beside the run (pending-visible; not discarded) | on the byte | probe-verified, not pinned |
| `\va` opener glyph | `\|` | under jsdom the caret at this token boundary normalizes to the para prefix, so the byte lands there and resolves per tokenizer (paragraph split). Byte never vanishes. | environmental placement | probe-verified, not pinned |

No kind discards a typed byte any more. The only byte that ever leaves the document is one the
TOKENIZER resolves away, and only on caret departure — never under a held caret.

---

## Defect 2 — Enter after a paragraph-final closer glyph did not open the Enter menu

Repro: `\p text \nd word\nd*`, caret at the very end (after the closer glyph), Enter → nothing.
At the end of a plain-text paragraph the same Enter opens the paragraph menu.

### Root cause

The caret there is a TEXT point ON the closer `MarkerNode` at `offset === size`, and every Enter
guard was a pure anchor-node-type test with no offset component:

- `MarkerEditPlugin`'s `KEY_ENTER_COMMAND` claim (HIGH) swallowed the key via
  `$isSelectionInMarkerNode()` — so rich-text never dispatched `INSERT_PARAGRAPH_COMMAND` and the
  menu plugin's CRITICAL handler never ran at all;
- the menu context's `inMarkerText: $isMarkerNode(anchorNode)` would have declined independently;
- `$splitParagraphAtCharStack` declined `MarkerNode` anchors, so even a menu commit would have
  fallen to a generic `insertParagraph()` INSIDE the char span.

### Fix

New shared predicate `$isPointInMarkerGlyphText(node, offset)` (`markerEditTier1.utils.ts`): the
TRAILING EDGE of a CANONICAL closing (or self-closing) glyph is genuinely AFTER the marker's
construct and does not count as "inside marker text". A pended, mid-edit closer keeps its trailing
edge inside — Enter still settles that edit (the mid-glyph-edit flows are untouched). Both guards
route through it, and `$splitParagraphAtCharStack` normalizes a closer-trailing-edge caret past
the enclosing span before deciding, so the split — from the menu commit or any non-menu path —
lands AFTER the intact span (a nested closer's caret lands in the outer span's content and the
close-and-reopen split proceeds from there).

Tests (`markerMenuHarness.test.tsx`, red first — the menu did not open): menu opens at the
closer's trailing edge; menu opens at the paragraph-end ELEMENT point (was already correct —
pinned); committing the item splits after the intact span, no char husk, caret in the new
paragraph.

---

## Verification (a) — milestone attribute order under USER EDIT

Load `\qt-s |who="P" sid="X"\*` (authored non-canonical order), retype the run's displayed value
to `|sid="X" who="P"`, depart. **Red**: the serialized key order was still `who,sid` — the stale
`attributeOrder` survived, because a pure REORDER compared as a fixed point (typed bytes identical
to their own re-tokenization, field values identical) and the refusal path never updates the node.

**Fix**: both fixed-point signature folds — the live `$appendSignature` milestone branch
(`tier2Rebuild.utils.ts`) and virtualSettle's JSON-side mirror — now fold `attributeOrder`. A
reorder is a genuine difference; the splice rebuilds the milestone through `createMilestone`,
which re-derives the order from the freshly tokenized object. An unedited non-canonical load stays
a fixed point (both sides re-derive the same authored order from the same bytes) — the three
pre-existing order pins and the corpus fixed-point suite stay green.

Pinned end to end in `milestoneAttributeSettle.test.tsx` ("a USER EDIT reordering the run's
attributes settles to the TYPED order end to end"): serialized JSON text (key order is the
assertion) and the displayed run both follow the typed bytes.

## Verification (b) — the latent caret-jump: minimal deterministic repro, outside the husk case

Found and reproduced deterministically under jsdom, in FOUR shapes outside the graced-husk case.
Minimal repro: the milestone letter-rename idle settle (typedByteSettle pin 4's shape) —

1. `\qt-s\*` + caret in the opener glyph; type `a`; idle-settle. The Tier-2 splice commits with
   the caret correctly restored into the new `\qt-sa` glyph at offset 6 (verified in the commit
   trace).
2. One MUTATING follow-up commit later (the bare-milestone cleanup), the caret is still correct.
3. The NEXT commit has **zero dirty nodes and no tags** — a pure selection commit in which Lexical
   re-derives the selection from the DOM — and the caret snaps to the paragraph's prefix glyph at
   offset 0. Under jsdom the DOM selection is stale (jsdom never carried the programmatic caret),
   so the re-derivation lands at the region start.

The same zero-dirty selection commit yanks the caret after the chapter `\ca` and note `\cat`
value settles (to the BOOK node there — those settles' fixed-point-plus-state-catch-up path never
touches the selection at all, so only the re-derivation can have moved it) and after the
milestone attribute-resolve splice.

**Decision: documented, not fixed here.** The actor is Lexical's DOM-selection re-derivation in a
commit the editor code does not initiate and cannot tag; every mutating commit the engine makes
places the caret correctly (asserted via a dirty-set-gated commit tracker,
`trackMutatingCommits` in `typedByteSettle.test.tsx`, which is also the pattern for writing caret
assertions that are immune to the phantom). This matches the settle-config track's husk-case
finding ("root cause is in Lexical's DOM-selection re-derivation, not in the settle
computation"); what is new here is a minimal repro that needs no husk, no deletion, and no
grace — any paragraph splice under a live caret followed by any queued commit reproduces it under
jsdom. In a live browser the reconciled DOM selection makes the re-derivation a no-op in the
traced shapes; the hazard window is a commit that fires while the DOM selection genuinely lags
(the husk case's live observation). A Lexical-level follow-up should look at
`updateEditor`'s selection read-back for commits with empty dirty sets.

---

## Sweep — the six plans' original defect rows against the current tree

Method: each plan's ORIGINAL defect/task list extracted, the handoff's claim noted, then the
CURRENT tree checked (code and test citations verified fresh — several handoff claims turned out
stale in the good direction, fixed by later groups). Rows whose handoff claim "fixed, test X" was
confirmed by the test existing and the full suites passing are compressed; every row that was
deferred, contradicted between documents, or unclaimed is listed individually.

### Whitespace ownership (2026-08-11)

| Row | Status |
| --- | --- |
| Four-jobs table (preserve/fabricate/delete/absorb) | **fixed + pinned** (whitespacePreservation, corpus fixed-point 22/22, TextSpacingPlugin pins) |
| 1/3 parser drops whitespace-only text | **fixed + pinned** — `whitespace-only-text.test.ts` covers a SEVEN-row matrix twice over (preservation + byte-faithful round trip) plus newline-formatting guards |
| 2 round-trip net | **fixed** (testusfm net + the PT-9.5 empty-attr canonicalization it uncovered) |
| 4 `\cat*` space blame | **settled** — the C# capture file exonerates ParatextData; the marker-resolution handoff's later "NOT exonerated" note predates that capture and is stale. Loss was `usxStringToUsj`, fixed |
| 5 five corpus skips | **fixed** — zero skips confirmed again this branch (21/21 + 10/10) |
| 6 lone-space deletion / whitespace-only wrap | **fixed BOTH halves** — the deferred wrap-selection end-to-end test landed later in `markerMenuApply.utils.test.tsx` ("wraps a whitespace-only selection into a span holding exactly that space", full harness) |
| 7-10 job split, tokenize-identity, `*` never heals | **fixed + pinned** |
| 11-12 verse space / leading-attribute collapse | **fixed as behavior**; the map-derived generalization landed HALF-way — `leadingAttributeGlyphRegexes(marker)` now derives the SHAPE from the vendored `leadingAttributes` map, but the set of markers with a Tier-1 arm is still enumerated per marker (`v`, `c`, note callers). **deferred-with-record** (this doc) |
| 13 space at opener separator | byte half **fixed + pinned**; caret half **narrowed but open**: probed fresh this branch — the caret no longer teleports to the para prefix; it lands ONE byte past the typed space (after the NBSP separator, at offset 1 of `⍽Lord`, expected between the two spaces). No caret pin exists anywhere for this gesture. **recorded here as the remaining residue; no track owns it** |
| 14 fabricated space at verse-adjacent `\` | **fixed** — the deferred work item B landed: `verseAdjacentTyping.test.tsx` now mounts the full plugin trio and pins "fabricates no space anywhere" |

### Char-stack split (2026-08-11)

| Row | Status |
| --- | --- |
| CD-1/2/3 Ctrl+Space core | **fixed + pinned** |
| `\fp` + Enter caller | **fixed** (with the owner's ends-implicitly correction) |
| New bug 1/2 paragraph split mid-span | **fixed**, and the handoff contradiction (C2) about the PRODUCTION menu path is stale: `$splitParagraphWithMarker` now routes through `$splitParagraphAtCharStack` first (work item D landed), pinned in `charStackParagraphSplit.test.tsx`'s Enter-menu apply block. This branch extends the same primitive with the closer-trailing-edge normalization (defect 2) |
| Range depth-2 stack-awareness | **fixed** — the handoff self-contradiction (C3) resolves in favor of DONE: "clears EVERY level of the stack over a range" pins `\p thing` with zero spans remaining; the partial-coverage sibling pins the intended outer-kept shape |
| Ctrl+Space at paragraph END loses the space (6d) | **fixed** — the test now mounts the FULL harness with a comment recording that the transform no longer deletes the paragraph-final lone space; the "move once the transform is fixed" note is gone |
| Internal rich paste mid-span | **deferred-with-record** — the paste claim explicitly declines `application/x-lexical-editor` with its rationale in code (`MarkerEditPlugin.tsx`), decline pinned |

### Structural deletion and caret (2026-08-14)

| Row | Status |
| --- | --- |
| 1 whole-representation delete | **fixed + pinned** (paraWholeDeletion, ratified semantics) |
| 2 Enter-Enter caret to paragraph end | **fixed** |
| 2-related Enter-Enter-backspace restore (work item C) | **fixed** by the engine-fixes feedback branch (heal-by-provenance in `$healMarkerTrailingSeparator` + junction caret in the merge; paraWholeDeletion extended) |
| 3 Escape kills the caret | **fixed** (EscapeKeyPlugin) |
| 4 verse-adjacent `\` caret | **fixed** |
| Work item A: Tier-2 restore drops unmappable carets at paragraph start | **improved + still open (recorded)** — this branch replaced the cumulative-offset mapping with byte anchors, fixing every TEXT-point misrestore probed; an ELEMENT-point anchor (or an anchor span not in the fragment) still falls back to `selectStart`, unchanged (`$restoreSelectionAtOffset`). The husk grace covers the known live shape |
| Work item D: menu-commit split bypasses the char-stack primitive | **fixed** (see char-stack above) |

### Attribute markers (2026-08-11)

| Row | Status |
| --- | --- |
| Tasks 1-9 (captures, agreement test, `ca` fold + chapter settle scope, `cat` note display) | **fixed + pinned** (chapterAttributeSettle 19, noteCategorySettle, capture tests in paranext-core) |
| Task 10 `cp` block display | **partial, deferred-with-record** — still INLINE (adaptor builds the `\cp` run closerless in the chapter's children); own-line display remains ticketed separately |
| Task 11 `cp` fold/unfold | **half fixed** — unfold to a real `\cp` paragraph pinned; folding a real `cp` PARAGRAPH back to `pubnumber` confirmed absent (the chapter settle region walks only adjacent first-class CHARs, never paras) — **deferred-with-record**, needs a cross-block rebuild scope |
| Scribe `cat` | **deferred-with-record** — scribe still builds no category run (correct per the corruption rationale; scribe unmaintained) |

### Unknown blocks (2026-08-11)

| Row | Status |
| --- | --- |
| 1 `\tr` hides content | **fixed** (row glyph + CSS) |
| 2 `\fig` graying | **pinned as a rule, deliberately unfixed** (owner decision, recorded) |
| 3 `\fig` attribute typing loses content | **fixed** (sentinel caret restore + read-only refusal via OpaqueBlockGuardPlugin) |
| 4 fabricated space before block unknowns | **fixed** (by whitespace, fixture supplied) |
| Drag-move-out of an opaque block | **deferred-with-record** — still no DRAGEND handling; the plugin's header documents the deliberate limit (drag-to-copy kept working) |

### Marker resolution (2026-08-15)

| Row | Status |
| --- | --- |
| G1-a/b/c, G2-a/b, G3-a/b/c, representation v2 | **fixed + pinned** (closerResolution, closerDivergence, unmatchedCloser, typedMarkerResolution) |
| G2-c nested-closer delete ate content | **forward pin only** (unreproducible after the representation change — as the handoff recorded) |
| Deferral: Space-wrap over a selection | **fixed** by the palette group and re-confirmed green this branch (markerMenuHarness "wraps the selection in the typed marker's closed span") |
| Deferral: `closeTag endMarker` spelling | **still open, recorded** in `2026-07-07-standard-view-followups.md`, unowned — unchanged |

### Untracked findings from this branch

- **Defect 2 (Enter after a paragraph-final char span) was UNTRACKED** — reported by no plan's
  defect list. Fixed here (see above).
- **Whitespace item 13's caret residue** (above) is the one sweep row that ends this branch
  neither fixed nor owned; recorded precisely with the fresh probe result.
- The latent-caret-jump repro corpus (Verification b) now includes four deterministic non-husk
  shapes; recorded for a Lexical-level follow-up.

---

## Suite numbers

Full gate `nx run-many -t test lint typecheck`: **all 10 projects green** (test, lint, typecheck).

- platform-editor: 71 files, **1249 passed, 0 skipped** (13 tests added by this branch: 9
  typed-byte pins, 3 Enter-after-closer pins, 1 attribute-order pin)
- shared-react: 26 files, 1536 passed + 1 skipped (the pre-existing table round-trip skip in
  `editor-delta.adaptor.test.tsx` — not this branch's)
- shared: 37 files, 536 passed
- utilities: 6 files, 51 passed
- perf-react 3, scribe 2
- Corpus safety net re-run explicitly on the final tree: corpus-round-trip 116,
  corpus-transform-fixed-point 22, corpus-testusfm-round-trip 10, tier2Rebuild.corpus 1,
  settledGetUsj 36 — **zero skips** (the corpus stays at full strength; no new `.skip` anywhere on
  the branch diff)
- `nx run-many -t extract-api`: working tree clean afterward — no API report drift (every new
  export is marker-edit-internal, not barreled)

Commits (scripture-editors only; paranext-core untouched):

1. `fix(platform): typed display-run bytes survive the idle settle; caret restores byte-anchored`
2. `fix(platform): Enter after a paragraph-final closer glyph opens the Enter menu`
3. `fix(platform): a user's attribute REORDER settles into the milestone's attributeOrder`
4. `fix(platform): scope the closer trailing-edge Enter carve-out to char-parented closers`
5. `docs(platform): correct the typedByteSettle header to the membership assertion`
6. `fix(platform): type the attribute-list byte fold over MarkerObject`
