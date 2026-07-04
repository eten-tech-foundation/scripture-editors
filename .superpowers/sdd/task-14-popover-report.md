# Task 14 report — Canonical glyph-free note ops in editable marker mode (popover delta round-trip)

**Status: DONE_WITH_CONCERNS** — the sanctioned note-serialization contract fix is complete,
TDD'd, gated, propagated, and re-verified in-app (QA item 7 → PASS); one NEW pre-existing
host-path defect was found and documented per the charter's "unrelated host paths" clause
(popover-Save replace-position displacement — body OT-coordinate asymmetry, NOT the note
contract; details in §7).

Report filename note: the brief said `task-14-report.md`, but that file is Phase 2's Task 14
(attribute dimming) — writing there would clobber history. This report lives at
`task-14-popover-report.md`; the ledger entry links it.

**Commits**
- scripture-editors `standard-view`: **2a09b69** `fix(platform): canonical glyph-free note ops
  in editable marker mode (popover delta round-trip)` (adaptor both ends + pinned-fixture
  updates + new tests), plus the docs/ledger commit carrying this report.
- paranext worktree `standard-view`: **9fc945fff82** `fix(platform-bible-react): suppress
  FootnoteEditor backslash menu trigger in editable marker mode` (+ rebuilt tracked dist,
  ~950 changed line-pairs in `dist/index.js` — same scale as the Phase 3 precedent commit).
- NOT pushed (either repo). `/home/lyonsm/paranext-core` untouched.

## 1. Contract redefinition (old vs new, both ends)

Scope: **note contents ops in editable marker mode** (the shape pinned as finding #4). Body
ops (marker glyph text `\c`/`\p`/`\v`/`\nd…`, the `\id` asymmetry) remain the pinned Phase 2
contract — byte-identical, untouched. Non-editable marker modes were already glyph-free for
notes (glyphs are DecoratorNodes there) — byte-identical, untouched.

**OLD (editable markerMode), for `\f + \fr 3:2 \fk \ft text\f*`:**

```
contents.ops: [
  { insert: " + " },                                  // expanded-editable caller text
  { insert: "\\fr",        char: {style:"fr"} },           // glyph MarkerNode as text
  { insert: " 3:2 ",  char: {style:"fr"} },           // structural NBSP separator included
  { insert: "\\fk",        char: {style:"fk"} },           // glyph-only for the empty span
  { insert: "\\ft",        char: {style:"ft"} },
  { insert: " text",  char: {style:"ft"} },
  { insert: "\\f*" },                                      // synthesized closing glyph, bare
]
```

`$applyUpdate` re-synthesizes glyphs when materializing (`$createWholeNote` /
`$createNestedChars`), so applying these ops produced doubled glyph MarkerNodes per span plus
an `ImmutableUnmatchedNode` from the bare `\f*` op; the note Tier-2 rebuild then refused
("sentinel/preserved-node count mismatch") and popover typing settled literal. Note
unknownAttributes (e.g. unclosed `closed="false"`) were silently dropped by `$getNoteOp`.

**NEW — canonical, glyph-free (identical to what non-editable modes already produce):**

```
contents.ops: [
  { insert: "3:2 ",  char: {style:"fr"} },
  { insert: "",      char: {style:"fk"} },                 // empty-char op (placeholder path)
  { insert: "text",  char: {style:"ft"} },
]
```

Serialize end (`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`):
- `$handleTextNodes`: inside a note (any NoteNode ancestor — `$hasNoteAncestor`), MarkerNode
  glyphs are skipped; the expanded-editable caller text (glyph-fronted notes only, text ===
  `getEditableCallerText(caller)`) is skipped; the single structural NBSP separator glued
  after a glyph-fronted char span's opening glyph is stripped from content text (mirrors the
  reverse USJ adaptor's `createCharMarker`). Glyph-only/placeholder spans no longer mark
  `charContentProduced`, so they emit `$getEmptyCharOp` like other modes.
- `$getNoteOp`: carries the note's unknownAttributes into the embed (same `Object.assign`
  pattern as `$getUnknownOp`) so `closed="false"` survives. Mode-independent, but inert for
  every pinned fixture (none has note unknownAttributes); the apply side already read them
  back via `getUnknownAttributes(…, OT_NOTE_PROPS)` — this closes a lossy gap, not a new
  vocabulary item.

Apply end (`libs/shared-react/src/plugins/usj/collab/delta-apply-update.utils.ts`,
`$createNote` — editable markerMode only):
- Re-adds the structural NBSP separator to non-empty char-span content text (mirrors the USJ
  adaptor's `createChar`; empty content stays on the `EMPTY_CHAR_PLACEHOLDER_TEXT` path).
- Extracts `closed` from the op's unknownAttributes and passes it to `$createWholeNote`, so an
  unclosed note materializes without a closer glyph and renders expanded inline — the same
  shape the USJ adaptor builds (this also resolves the Phase 3 carryover "OT-collab `closed`
  threading").

Result: for any note, editable-mode `getNoteOps → applyUpdate` reproduces the exact canonical
editor shape (single glyphs, NBSP-glued content, caller from `note.caller`), and note contents
ops are now **markerMode-invariant** (deep-equal `opsGen1v1`'s).

## 2. Pinned-test expectations changed (each mapped to the redefinition)

All in `packages/utilities/src/converters/usj/converter-test.data.ts`; no other pinned test
changed, and no non-editable expectation changed anywhere:

1. `opsGen1v1Editable` note `contents.ops` → canonical three ops (caller-text op removed:
   caller is presentation of `note.caller`; `\fr`/`\fk`/`\ft` glyph ops removed: presentation;
   NBSP prefixes stripped: structural separator; bare `\f*` op removed: synthesized closer;
   `{insert:"", char:{style:"fk"}}` added: empty span now serializes as an empty-char op).
   Doc comment rewritten to state the new contract.
2. `opsGen1v1Standard` note `contents.ops` → identical canonical ops (same mapping; the old
   comment explicitly documented the closing-`\f*` leak — replaced with the contract note).
   Both fixtures' note contents now deep-equal formatted-mode `opsGen1v1`'s.

Everything else stayed pinned and green: all body-op expectations in both editable fixtures,
all non-editable delta tests (`opsGen1v1`, visible-marker note tests, unknown-embed tests),
`$getReplaceEmbedOps`/OT-position tests, and the whole apply-update suite (existing tests are
formatted/visible-mode; new editable-mode apply tests added rather than modified).

## 3. TDD evidence (red first, then green)

RED (before any source change):
- `editor-delta.adaptor.test.tsx`: 3 new serialize tests FAILED showing the old shape (glyph
  text ops `\\ft`, NBSP-prefixed `" 1:2 "`, missing `closed`): expanded-editable canonical
  contents; nested char (`\fv` inside `\ft` → `char:[ft,fv]` array attrs); unclosed note
  (no closer, `closed:"false"` in the embed).
- `delta-apply-update.utils.test.tsx`: 2 new apply tests FAILED (missing NBSP separator —
  `"2.1 "` vs `" 2.1 "`; unclosed note wrongly materialized WITH a closer, childrenSize
  5 vs 4).
- `note-ops-popover-roundtrip.test.tsx` (new, platform): 3 tests FAILED with the exact 13b
  defect — popover ops carried `"\\ft unterminated"`+`{insert:"\\f*"}`, and the host/popover
  state grew an `ImmutableUnmatchedNode{marker:"f*"}`.

GREEN: after the two adaptor changes + fixture updates, all the above pass. One test-design
correction en route: a USJ-*nested* `\fv` is not a `$rebuildNoteContent` fixed point even when
loaded straight from USJ with no ops involved (probe: rebuild returns true and flattens it to
a sibling — valid footnote char markers render no closer glyph, so nesting isn't representable
in display text); the round-trip test uses the engine-canonical sibling `\fv`, and the
nested-char ops coverage lives in the serialize unit test.

Round-trip acceptance property (the brief's key test), pinned by
`packages/platform/src/editor/adaptors/note-ops-popover-roundtrip.test.tsx` driving two real
`Editorial` instances through the exact FootnoteEditor flow (host standard view → `getNoteOps`
→ popover options exactly as the memo builds them → `applyUpdate`):
- ops→apply→ops is a fixed point (`popover.getNoteOps(0)` deep-equals the host op);
- popover serialized USJ deep-equals the source note (`\fr`/`\ft` + `\fv` verse-ref char case,
  and the unclosed `closed="false"` case, which also keeps no closer glyph);
- a subsequent `$rebuildNoteContent` returns false with the "no-op (fixed point)" log — and
  neither "sentinel/preserved-node count mismatch" nor "excluded by guard rails";
- Save leg: `replaceEmbedUpdate` writes a note whose USJ deep-equals the popover note, and
  every note in the host is well-formed (single glyphs, zero unmatched). Replace POSITION is
  deliberately not asserted — see §7.1.

## 4. Gates (all `--skip-nx-cache`)

- Tests: shared 156/156, shared-react 1080/2-skip (incl. all OT/collab suites: DeltaOnChange,
  editor-delta, delta-common, delta-apply-update — 233 collab tests), platform-editor
  314/3-skip, utilities 19/19; full-workspace `run-many -t test` green (9 projects).
- typecheck + lint: green for shared, shared-react, platform-editor, utilities.
- extract-api: run for the affected projects — **no api.md drift** (public surface unmoved).
- No collab test failed for any reason other than the contract redefinition (the only
  expectation changes are the two fixtures in §2).

## 5. Propagation evidence (runbook order)

| Hop | Command | Evidence |
| --- | --- | --- |
| src → platform/dist | `pnpm nx build platform-editor --skip-nx-cache` | success; dist/index.js 548,639 B (was 548,037 pre-fix) |
| dist → worktree node_modules | `pnpm -C packages/platform devpub` | `Buffer.equals` → byte-identical (548,639 both) |
| node_modules → extension bundle | `npm stop` → `npm run build:extensions` (fresh invocation) | webpack "compiled successfully in 3870 ms"; main.js 16,675,477 B; two 48-byte probes sampled from the FRESH library build found ×3 each in main.js (webpack-escaped form); the platform-bible-react `\`-gate (`…markerMode) === "editable") return () => {`) found ×3 |
| → running app | `./.erb/scripts/refresh.sh` (headless xvfb, CDP 9223) | all ports up; all QA below ran against this instance |

C# unchanged — no dotnet rebuild. The post-propagation library commit amend touched only a
test file (not shipped in dist), so no re-propagation was needed.

## 6. In-app QA (project wgPIDGIN GEN 1; state + getComputedStyle; error hooks installed first)

Prior QA custom.sty still live (verified: `\s1` red, `zln` blue) — not recreated.

- **Popover loads well-formed (the core fix):** clicked note 0's caller → FootnoteEditor
  popover; state dump: note = `[marker/f "\f", text " + ", char/fr [marker "\fr", " 1:1 "],
  char/ft [marker "\ft", " "], marker/f "\f*"]` — SINGLE glyphs, NO unmatched node, NO
  doubling (direct contrast with 13b's `\fr \fr … \f*` dump). Container classes
  `editor-input usfm marker-editable text-spacing formatted-font`.
- **Tier-1 rename `\ft`→`\fq` — PASS:** selected the `t` in the `\ft` glyph, typed `q`
  (real keypress); on caret departure the span restyled: char marker `fq`, glyph `\fq`
  (DOM `char usfm_fq`), note closer `\f*` still last.
- **Typed `\zln …\zln* ` in note content — PASS (classification):** literal `\` reached the
  editor (worktree gate working); engine built `char/zln [marker "\zln", " link", marker
  "\zln*"]`, DOM `span.char.usfm_zln` computed rgb(0,0,255) (project custom.sty). Key-by-key
  typing with per-keystroke commits also left a stray `unmatched zln*` from an intermediate
  Tier-2 rebuild (engine caret-restoration interplay; single-commit insertText of the same
  sequence resolves cleanly per Task 13 item 3) — recorded as an engine follow-on in
  phase4-notes, not an ops-contract issue (this popover session was CANCELed, never saved).
- **Typed `\zfoo ` in note content — PASS:** became `char/zfoo` (unknown-in-note→char per
  PT9) with opening+closing glyphs classed `status_unknown`, computed rgb(204,30,20)/700.
- **`\` in popover → literal — PASS:** all backslashes above reached the document; the
  FootnoteEditor menu never opened (gate active; menu remains for non-editable hosts).
- **Popover Save → clean note content — PASS (content), displaced (position, pre-existing):**
  fresh popover on note 0, typed `pau` into `\ft`, clicked Save. The written note content was
  CLEAN in host state (single glyphs, `char/ft` = " pau", 0 unmatched anywhere) and ON
  DISK: `\f + \fr 1:1 \fr*\ft pau\ft*\f*` in `01GENwgPIDGIN.SFM` — no doubled markers, no NBSP
  bytes, no literal `\f*` junk. BUT the replace landed 5 OT units past the original note
  (between `time|wen`, eating the space; original note not deleted; note count 17→18) — the
  §7.1 pre-existing coordinate asymmetry (+5 = the editable chapter's `\c 1 ` glyph text
  length). **Undo/restore:** host Ctrl+Z fully reverted the displaced write — state (17 notes,
  `time wen` restored) AND disk (line 10 back to baseline; 0 remnants of
  wow/zln/zfoo/pau-in-note file-wide) verified.
- **Main-editor regressions:**
  - `\zfoo ` in body (insertText, task-13 methodology) → para split: `para/zfoo = [marker
    "\zfoo" (`opening status_unknown`, rgb(204,30,20)/700), " ", "an da world."]`; undone,
    0 remnants.
  - `\s1` computed rgb(255,0,0)/700/center — custom.sty merge live.
  - Ctrl+T note insert → canonical `\f + \fr 1:2 \ft \f*` note (single glyphs), popover
    auto-opened on the new note (the isNewNote flow — another live round-trip through the
    fixed contract); Cancel + undo restored 17 notes.
- **Console:** error hooks (`console.error`/`onerror`/`unhandledrejection`) captured only one
  benign browser notice ("ResizeObserver loop completed with undelivered notifications") —
  zero application errors across the whole session.
- App stopped (`npm stop`, CDP confirmed down). No settings were modified this session
  (custom.sty was pre-existing from Task 13 and left as-is; Settings.xml untouched).

## 7. Concerns

1. **Popover-Save replace-position displacement (pre-existing, out of sanctioned scope,
   NEW finding).** `$getReplaceEmbedOps`' retain comes from `$getOTPositionOfNode`, which
   DFS-descends into an editable ChapterNode and counts embed(1) + its `\c 1 ` glyph text
   child (5) = 6, while `$applyUpdate`'s insert/delete traversals treat the chapter as an
   opaque embed (1). Every editable-mode document with a chapter therefore applies the
   replace 5 units late: the clean note is inserted into following text and the `delete 1`
   eats a text character instead of the old note. Both functions predate this task (diff
   provably touches neither); in non-editable modes chapters are decorators (no text child),
   which is why formatted-mode collab never hit it. Two irreconcilable-without-an-owner
   repairs exist: make `$getOTPositionOfNode` treat chapter contents as opaque (host-local
   replace becomes correct, but retains then disagree with the pinned delta-DOC coordinates
   where body glyph text counts), or make the apply side honor doc coordinates (changes the
   editable body apply semantics wholesale). That is findings #2/#3 territory — the body
   glyph-ops contract the charter pins — so per the "unrelated host paths" clause this is
   reported, documented (phase4-notes limitation + a comment in the round-trip test's
   Save leg), and not attempted. Note 13b predicted Save would write the malformed shape;
   post-fix the content is clean — the displacement is the remaining (previously masked)
   half.
2. **Popover wrapper-para glyph artifact (pre-existing, display-only):** `applyUpdate([op])`
   inserts at index 0, before the wrapper para's `\p` glyph; the para-prefix guard injects a
   fresh prefix and the original `\p `+NBSP pair remains as visible junk after the note (the
   trailing `\p` in the qa7 screenshot). USJ/ops stay clean (presentation nodes); never
   saved. Candidates recorded in phase4-notes.
3. **Mid-typing interleaving in note content** can leave a stray unmatched node from
   intermediate rebuilds (see QA `\zln`); engine caret-restoration behavior, recorded.
4. **Report path deviation:** brief said `task-14-report.md`; that name belongs to Phase 2's
   Task 14 report, so this file is `task-14-popover-report.md` (ledger links it).
5. Worktree `dev-packages.json`/`package-lock.json` local diffs remain uncommitted
   (pre-existing, per runbook housekeeping). `.npmrc` NODE_AUTH_TOKEN warnings persist
   (pre-existing, harmless).

## 8. Self-review

- The mechanism is exactly the 13b candidate design, implemented at both ends with the
  reverse-USJ-adaptor rules as the mirror (glyph skip ↔ glyph synthesis; NBSP strip ↔ NBSP
  glue; caller skip ↔ caller synthesis; unknownAttributes carry ↔ read-back + `closed`
  materialization). Gating is note-scoped and editable-only by construction (MarkerNodes and
  glyph-fronted spans exist only in editable mode), so non-editable op shapes are untouched
  by mechanism, not just by test assertion.
- The idempotence property is enforced end-to-end against the REAL app flow (two mounted
  Editorials, FootnoteEditor's exact option memo), not just adaptor units, and each in-app
  claim above is state-verified (no DOM-only or screenshot-only evidence).
- The Save-leg test was initially vacuous (asserted note[0], which the displacement leaves
  untouched); it was reworked to assert the contract-owned invariants explicitly and to
  document what it deliberately does not assert — no green-but-meaningless assertions remain.
- Honest accounting: two pre-existing defects surfaced by making the popover usable
  (displacement, wrapper-para junk) are reported as concerns with mechanisms and evidence,
  not folded into the fix or silently skipped.
