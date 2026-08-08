# Display-run consolidation: design

Status: APPROVED design (TJ, 2026-08-06). Companion to
`2026-08-05-display-run-consolidation-handoff.md` (the hand-off this design answers),
`.superpowers/sdd/2026-07-30-attribute-display/architecture-assessment.md` (the inventory/costing),
and `2026-07-30-attribute-display-design.md` (the governing attribute-display spec; its rules
stand). Bare repo paths are relative to this repository (`scripture-editors`, branch
`standard-view-pt-4187`); paranext-core paths (`extensions/…`) are called out explicitly.

## 1. Goal and diagnosis

Every engine-owned display kind (char attribute runs, milestone runs, verse `\va`/`\vp` runs,
opener separators, nested glyphs, optbreak/unknown bytes, marker literals) owes the same four
duties — construct, self-heal-with-grace, pend-on-edit/delete, settle-on-departure — and each
kind hand-wires its own quartet across ~8 files. The recurring regressions are missing-quadrant
errors: a kind (or a new edit shape on an old kind) lands in a cell that was never wired.

The consolidation makes the four duties run through the SAME code paths for every kind, in three
phases, such that the three live bugs are fixed BY the consolidation (phase 1), a missing
quadrant becomes structurally impossible (phase 2), and consumers always receive canonical USJ
(phase 3).

The code survey behind this design sharpened the assessment's framing: the four
"caret-boundary" predicates are not four implementations of one function but four compensations
for THREE different tree shapes — char's run is a CHILD of an ElementNode (transform fires
naturally, grace is simple); verse/milestone runs are LOOSE SIBLINGS of leaf nodes (hence the
`$milestoneOfOpeningGlyph`/`$verseOfAttributeGlyph` owner-walks, the tolerant piece-scanners,
and the multi-arm deletion-site geometry where bug 1 lives); optbreak's display lives INSIDE an
UnknownNode container — already the wrapper shape, it just never got deletion wiring (bug 2).
The live bugs sit exactly where loose-sibling geometry and textType-tag-keyed pend decisions
miss. That is why phase 2 normalizes the tree (wrapper) BEFORE unifying the predicates.

## 2. Decisions log (TJ, 2026-08-06)

- **Wrapper-first phase 2**: verse and milestone display runs get a dedicated inline
  `AttributeRunNode` element (one sibling after the owner); the wrapper migration lands BEFORE
  the registry, so the registry never encodes loose-sibling geometry. Char spans keep their run
  as a tagged child (the span is already its container); UnknownNode already holds its display
  children.
- **No interim `\va`/`\vp` glyph styling patch** (handoff backlog item 8): the wrapper styles
  the whole run with one class; patching the three-piece styling a second time only to delete
  it is not worth it.
- **Assessment phase-1 item 3 (the parameterized caret-held/grace-site helper) is SKIPPED in
  phase 1**: collapsing four tuned predicates into one parameterized helper is medium-risk churn
  that the wrapper deletes for free one phase later. The unified reporter lands in phase 2b,
  where grace is containment-trivial.
- **Assessment phase-1 item 4 is already DONE**: `$selectAfterClosingSpan`'s `$isCharNode`
  guard landed at `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts:621`
  (commits 98d7cbf0 + af31b0bd, including the milestone-closer analog pin). Nothing to fold in.
- **Suppression-window state machine stays out of scope** (post-W6-A it is hygiene): absorbed
  in phase 2 only if it falls out naturally, else skipped.

## 3. The three live bugs, and the consolidation mechanism that fixes each

1. **Stale invisible attribute** (char): deleting a span's `|…` run fails to arm a pend when
   the caret lands somewhere the per-kind boundary heuristic does not cover, so
   `unknownAttributes` silently keeps the old value and saves emit both old and new bytes.
   Fixed by phase 1a+1b: pend-on-deletion becomes key-based (destruction-driven), and the sync
   consults the pend set — the caret plays no role in WHETHER a deletion pends.
2. **Undead optbreak** (UnknownNode): deleting the `//` display text leaves an empty invisible
   UnknownNode that still serializes an optbreak; UnknownNode has no deletion transform
   registered anywhere. Fixed by phase 1a+1c: the destroyed display child pends its UnknownNode
   owner, and the uniform deletion-semantics resolution removes the husk (owner-removal policy).
3. **Empty `\va` never re-folds** (verse): typing a value into an empty `\va \va*` char span is
   an ordinary content edit that nothing pends, so it never re-tokenizes back to `altnumber`.
   Fixed by phase 1d: the pend decision keys on "this node is at a display-run SOURCE site owned
   by kind K" (the verse claims adjacent `va`/`vp` char spans), not on the typed node's textType
   tag; departure re-tokenizes and the tokenizer's existing attrCapture fold restores
   `altnumber`.

TDD pins each bug from TJ's exact repro, with caret-landing variants (select-and-delete,
backspace-through, element-point collapse), BEFORE the mechanism lands.

## 4. Phase 0 — slipped approvals (first; small and independent)

1. **Editable-para `\p`-prefix delta leak** (TJ approved 2026-08-04): extend the glyph
   exclusion in `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` (the
   `$isMarkerNode` gate currently exempts only in-note and bare-attribute glyphs, so a
   paragraph's own `\p ` prefix flows into content ops on the produce side while the apply side
   re-synthesizes it) and align the position helpers, mirroring the verse OT unification per the
   `OTCoordinateSystem` doc in `delta-common.utils.ts`.
2. **Log-noise quick fix** (TJ approved): log-inspection session for the recurring
   `optbreak-undefined`/`figure-fig` pattern (suspected style-lookup miss for those markers in
   paranext-core's styling pipeline); fix if small, else document and defer.
3. **`scripts/mcp-launcher.js` lint** (TJ chose the ignore-comment option): justified
   eslint-disable for `no-require-imports` (the `require("child_process")` at line 6) — the
   last root-context error.
4. Riders: the handoff item-6 verification (one headless per-keystroke check of mid-sentence
   typed-marker settle; fix or close), and item 7 (`$getTextContentExcludingMarkers` explicit
   decorator-display exclusion) only if phase 1 touches `node.utils.ts` anyway.

## 5. Phase 1 — the uniform deletion/pend driver

### 5a. Destruction-driven owner pend (robust arming)

One mutation listener in `MarkerEditPlugin` watches destroyed nodes. For each destroyed key it
reads the PREVIOUS editor state, classifies "was this a display-run piece, and whose?":

- a TextNode tagged textType `"attribute"` → its owner: parent CharNode, or the
  VerseNode/MilestoneNode reached by the run's sibling chain (prev-state walk);
- a MarkerNode run glyph (`va`/`vp` opener/closer chained to a VerseNode; milestone
  opening/self-closing adjacent to a MilestoneNode) → that owner;
- an ImmutableTypedText display child of an UnknownNode → that UnknownNode.

If the owner still exists in the current state, its key is pended. Guards (all three required):

- skip `HISTORIC_TAG` commits — `$rependPendShapedNodes` owns undo/redo re-pends;
- skip `DELTA_CHANGE_TAG` commits — collab applies are not local deletions;
- skip when the owner was destroyed too — whole-construct deletion needs no pend, and this
  guard also covers Tier-2 rebuild splices for free (rebuilds always replace the owner node).

The caret plays NO role in whether a deletion pends. Opener separators are deliberately not in
this classifier: their "deletion" is a text mutation (an NBSP prefix edit), not node
destruction, and their existing caret-grace path works; the phase-2 registry absorbs them
formally.

### 5b. Pend-aware grace

The syncs must not resurrect a deleted run before departure settles it. Each sync
(`$syncCharAttributeDisplay`, `$syncVerseAttributeRun`, `$syncMilestoneDisplayRun`) gains one
guard ahead of its caret arms: **owner is pended → leave alone**. The syncs live in
`shared`/`shared-react` and `pendingKeys` lives in the platform plugin, so `MarkerEditPlugin`
publishes its live pend set through an editor-scoped side channel in `shared`
(`WeakMap<LexicalEditor, ReadonlySet<NodeKey>>`, read via `$getEditor()`), registered on engine
mount and unregistered on cleanup. Multiple editors (main + footnote popover) each get their own
entry. The existing caret-grace arms stay — they cover mid-edit divergence where nothing was
destroyed. No predicate is collapsed or re-tuned in phase 1.

### 5c. Uniform deletion-semantics resolution

`$resolvePendingMarkers`' per-kind arms collapse into one `$settlePendedDisplayOwner`:

- still caret-held (per-kind reporter, unchanged in phase 1) → re-pend (grace unchanged);
- run ENTIRELY absent → per-kind policy:
  - **owner-removal** for milestone (existing behavior, now routed) and inline unknowns —
    optbreak's empty husk is removed with no rebuild needed (the flanking significant spaces
    stay exactly as typed; displayed bytes win);
  - **attribute-clear via re-tokenize** for char and verse;
- otherwise → re-tokenize (`$requestTier2ForNode`).

This adds the UnknownNode resolver arm that today would dead-end in `$requestTier2ForNode`'s
opaque-block bail. Marker literals and plain pending text keep their existing else-branch
re-tokenization.

### 5d. Content-edit-in-source pend (bug 3)

In `$textNodeTier2Transform`, before a plain-text edit deletes its key: ask whether the node is
at a display-run SOURCE site a kind claims. For the empty-`\va` case: a content edit inside a
char span whose marker is an attribute-fold marker (`va`/`vp`) sitting in its verse's run
position pends the VERSE. Departure re-tokenizes the paragraph; attrCapture folds `\va 3\va*`
back onto the verse; `altnumber` updates and the canonical triplet re-materializes. The rule is
deliberately NARROW — keyed on the owner's claimed site, not on every closed span — so ordinary
content edits do not start splice-churning on departure. A standalone `va` span not adjacent to
a verse re-tokenizes to itself (fixed-point refusal; harmless). The `ca`/`cat` analogues become
one descriptor entry each if they ever gain surfaces.

### 5e. Phase-1 test plan (TDD)

- Failing pins first for bugs 1/2/3 as in §3, each with caret-landing variants.
- Mutation-listener guards pinned: no pend on HISTORIC commits (the undo-resettle pins in
  `markerEditUndoResettle.test.tsx` / `markerEditUndoRerenderResettle.test.tsx` must stay
  green), no pend on DELTA_CHANGE applies (delta invariance tests), no spurious pend across a
  Tier-2 splice.
- Pend-aware grace pinned: deleted run does not resurrect while pended; a caret-elsewhere drift
  (collab heal case) still heals.
- Corpus `tier2Rebuild.corpus.test.tsx` 141/141, zero skips, at every commit; lint+typecheck 0
  errors in root and nx contexts.

## 6. Phase 2a — the `AttributeRunNode` wrapper

A new inline `ElementNode` in `shared` wrapping each verse `\va`/`\vp` run and each milestone
run as ONE sibling after its owner.

- **Shape**: `AttributeRunNode(runKind: "va" | "vp" | "milestone")`; children are the SAME
  nodes as today — MarkerNode glyphs + the attribute-tagged value TextNode (token glyphs stay
  token; the value stays editable). Ownership stays position-derived (the wrapper directly
  follows its owner, `vp` follows `va`'s wrapper or the verse) — no stored keys to go stale.
- **What it simplifies**: `$verseAttributeRunPieces`/`$milestoneAttributeRunPieces` become an
  ordered scan of `wrapper.getChildren()`; the `$milestoneOfOpeningGlyph`/
  `$verseOfAttributeGlyph` owner-walks die (edits inside the wrapper dirty the wrapper, whose
  transform knows its owner); Tier-2's `$milestoneDisplayRun`/`$verseAttributeRun` collectors
  become "next sibling is a run wrapper → its children" (the `index += run.length` arithmetic
  goes); the delta gate's `$isBareAttributeGlyph` triplet-walk and the editor→USJ per-piece
  checks become one "inside an AttributeRunNode" subtree skip; grace geometry becomes "caret
  inside the wrapper" plus one just-removed arm; deletion becomes atomic wrapper removal, and
  phase 1's destruction-pend classifier gains a one-line arm ("destroyed AttributeRunNode →
  pend previous-sibling owner") replacing the piece-walks. An EMPTY wrapper husk takes the same
  policy as optbreak's husk — remove + pend owner — so the wrapper cannot reintroduce the
  undead-node class.
- **Styling**: `createDOM` puts `attribute-run` + the marker's own class (`usfm_va`/`usfm_vp`;
  milestone classes) on the wrapper — handoff backlog item 8 fixed structurally; the per-piece
  verse-value styling in `MarkerEditPlugin`'s mutation listener is deleted.
- **Fragment/byte behavior unchanged**: the wrapper contributes no bytes; its children flow
  into the fragment exactly as the loose siblings did, so tokenizer inputs are byte-identical —
  the corpus staying 141/141 through the migration is the acceptance. Sentinel-absorption arms
  (a sentinel verse/milestone absorbs its run into its own sentinel) keep their shape, reading
  the wrapper's children.
- **Migration mechanics**: adaptor builders (`addVerseAttributes`, `addAttributes`) emit
  wrapped runs; collab materializers stay bare (syncs heal to the wrapped shape); the
  `$appendSignature` verse/milestone branches simplify; 2SA lexical fixtures regenerate (the
  always-on freshness pin catches staleness); OT length-invariance pins prove collab lengths
  never shift.

## 7. Phase 2b — the display-run registry

Per kind, one descriptor:

```
{ ownerPredicate, ownerOf(dirtiedNode), expectedPieces(ownerState), scanPieces,
  graceSite, settleScope, deletionPolicy, byteFormat }
```

- Byte formats (`canonicalAttributeText` wrapping, NBSP rules, `unknownDisplayParts`) stay
  per-kind CALLBACKS with their exact logic. The tokenizer and the entire Tier-2
  fragment/signature machinery stay OUT of the registry.
- ONE shared sync transform, ONE caret-held reporter (`$caretHoldsRunSite(descriptor, owner)` —
  the assessment's item 3, landing here where the wrapper has made grace containment-trivial),
  ONE pend/settle driver (the 6-branch `$resolvePendingMarkers` switch AND
  `$rependPendShapedNodes`' parallel switch both become descriptor dispatch — the three copies
  of divergence knowledge die), and phase 1's deletion-semantics function now
  descriptor-driven.
- Descriptors needing converter imports (`defaultMarkerAttribute`, `milestoneDefaultAttribute`)
  are ASSEMBLED in the platform layer and passed in — the existing import-cycle pattern
  (`$syncCharAttributeDisplayNode` in CharNodePlugin, `$milestoneAttributeDisplayText` in
  Tier-1) generalized.
- Registration homes keep their current mode-gating (char/verse syncs in the ungated
  shared-react plugins, milestone in the editable-gated MarkerEditPlugin) via thin per-kind
  registration wrappers over the shared driver.
- Separators and nested glyphs join as descriptors where they fit (separator's text-mutation
  deletion keeps its caret-grace path; nested glyphs have no pend duty — their descriptor
  simply has no edit surface).
- Adding a kind = one descriptor + one registration line; a missing quadrant becomes a type
  error, not a runtime bug.
- Existing per-kind unit tests re-point at the driver with per-kind descriptor fixtures; the
  corpus property tests are descriptor-agnostic and carry over unchanged.

## 8. Phase 3 — settled `getUsj()` output

Independent of phase 2; can land any time after phase 1.

- **Virtual settle**: `getUsj()` returns SETTLED USJ without mutating the editor. Inside
  `editorState.read()`: serialize as today, then for each paragraph (or expanded note)
  containing pended keys, run the SAME `$buildParaFragment` (`$buildNoteFragment` for notes) +
  `usfmFragmentToUsjContent` a real settle uses — both are read-safe — and splice the tokenized
  content into the OUTPUT USJ only, substituting each preserved node's own serialized USJ for
  its U+FFFC placeholder (sentinels serialize in place, never move). `MarkerEditPlugin` exposes
  its pending set to `Editor.tsx` through the phase-1 side channel.
- **Uniform** — no caret-held exception: a half-typed `|stuf` settles to literal content in
  the OUTPUT, which is what those bytes mean. Pending edits stay pending on screen.
- **One-code-path guarantee**: the shared risk is the materialize half (real settles splice
  nodes then serialize; virtual settle emits USJ directly). Pinned by an equivalence property
  test: for a corpus of pending-edit shapes, `getUsj()` output === USJ after driving the real
  settle. Standing acceptance: `getUsj()` output is always a Tier-2 fixed point.
- **Host changes (paranext-core)**: `performDebouncedPdpSave` (wired from
  `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx`) stops
  calling `commitPendingMarkerEdits()` — the mutating pre-save settle (the third undo-resettle
  trigger, currently gated by the suppression window) is RETIRED, not gated. The sync hook's
  (`use-editor-pdp-sync.hook.ts`) save-snapshot timing warn class disappears; the lossy-warn
  machinery stays and now signals REAL round-trip defects; transient handling that existed
  solely for unsettled-save echoes is simplified away. `commitPendingMarkerEdits` itself
  remains on the editor API (P9-parity call cadence is optional later polish, NOT required).
- **Backlog item 4 rides here**: the verse-9 `\nd come togedda\nd*` lossy divergence in the E2E
  sample project (both static pipelines proven byte-faithful; prime suspect
  inner-trailing-space handling before the closer) gets its deterministic capture + fix before
  phase 3's acceptance, so the strict warn lands on a warn-clean sample project.

## 9. Fixed points (must not change)

Tokenizer/losslessness core (`usfmFragmentToUsjContent`, `extractAttributes`, `scanMilestone`,
NBSP↔space flattening); `canonicalAttributeText`; the editor→USJ and delta exclusion gating
semantics (the gates' IMPLEMENTATION simplifies in phase 2a, their behavior — display bytes
never in ops or saved USJ — is pinned); Tier-2's preserve-or-refuse machinery (fixed-point
signature, sentinel symmetry, guard rails, termination); the corpus losslessness + round-trip
property tests — extended, never weakened.

## 10. Testing strategy and risk register

TDD red→green per behavior; every wave reviewed (spec + quality) with named risks; corpus
141/141 zero skips at every commit; lint+typecheck 0 errors in root and nx contexts;
FOREGROUND-only test runs for subagents; commit messages end with the repo's Co-Authored-By
convention; comments stand on their own.

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Destruction-pend misfires on undo/collab/rebuild | The three §5a guards; undo-resettle pins; delta invariance tests; splice-crossing pin |
| 2 | Wrapper migration shifts OT coordinates or fragment bytes | Length-invariance pins; corpus byte-identity is the migration acceptance |
| 3 | Virtual settle diverges from real settle | §8 equivalence property test; both halves share fragment-build + tokenize |
| 4 | Registry regresses the battle-tested caret races | Sequencing (predicates die only after the wrapper trivializes them); existing race pins; corpus |
| 5 | Pend side-channel leaks across editors/mounts | WeakMap keyed per editor; registered/unregistered with the engine effect |

## 11. Wave ordering

Each wave independently shippable and green:

- **Wave 0** — phase 0 backlog items (§4).
- **Wave 1** — phase 1 driver (§5): fixes bugs 1–3.
- **Wave 2** — phase 2a wrapper (§6): item 8 styling falls out.
- **Wave 3** — phase 2b registry (§7).
- **Wave 4** — phase 3 settled `getUsj()` + host changes + verse-9 fix (§8).
