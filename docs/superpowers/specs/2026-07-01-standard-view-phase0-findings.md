# Standard View Phase 0 — Round-Trip Findings

## Phase 0+1 completion summary

- Corpus: 14 fixtures × 4 view modes; 56 passing, 0 skipped-with-finding.
- Acceptance criterion (§7): table, figure, sidebar, periph, unclosed note — 5 of 5 lossless in
  standard mode (generic `UnknownNode`/`unknownAttributes` pass-through; no dedicated node types
  needed). See "Acceptance criterion status (spec §7)" below.
- Editable delta round-trip test: enabled and green — the skipped test's expected-ops fixture was
  stale (never regenerated since introduction); corrected to match current adaptor behavior, no
  adaptor source changed (commit 54941d2).
- Adaptor fixes landed: none in `libs/*/adaptors` proper. Two upstream converter/plugin fixes:
  `parseNumberFromMarkerText` preserved verse bridges/segments (commit 2aabcb9); note-caller
  rendering keyed off `noteMode` instead of `markerMode` (commit 3904573). One styling fix:
  Task 8's CSS retargeted to MarkerNode syntax classes (`.opening`/`.closing`/`.selfClosing`)
  instead of the lost `.marker` class (commit 1320947), with the underlying class-drop logged as
  a phase-2-engine finding below.
- Recommended Phase 2 plan inputs (top findings, most to least actionable):
  1. **MarkerNode lost its `marker` DOM class** (pre-existing, commit 5ef9976, #359) — cosmetic;
     decide whether to restore the class or standardize on syntax classes. See finding below.
  2. **Editable delta ops carry raw marker glyphs** (e.g. `\v`, `\nd`, NBSP) instead of stripping
     them — the corrected fixture (commit 54941d2) removed a `// TODO: NBSP and markers need to
     be removed.` comment because it no longer matched reality, not because the aspiration was
     resolved. Design question for the Phase 2 marker-editing engine: whether/how to strip marker
     glyph text from collab delta ops before they reach collaborators.
  3. **Book `\id` marker glyph is absent from editable delta ops** while other marker glyphs
     (`\c`, `\p`, `\v`, etc.) are present verbatim — pre-existing asymmetry in
     `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`; confirm intentional
     with the collab adaptor owner before Phase 2 design locks in delta-ops behavior.
  4. **Standard-view note shape in collab delta ops** — closing `\f*` glyph flows into note
     contents ops while the opening glyph and caller/NBSP produce none; now pinned by
     `opsGen1v1Standard`. See "Standard-view note shape in collab delta ops (pinned)" below.
  5. **`parseNumberFromMarkerText` segment-regex boundary** — the regex caps segments at one
     letter (`\d+[a-zA-Z]?`, `libs/shared/src/nodes/usj/node.utils.ts:409`); a nonstandard
     `\v 5abc` truncates to `"5a"` instead of widening to `[a-zA-Z]*` or falling back to the
     default on a partial match. Cheap Phase 2 follow-up, not a blocker (well-formed verse
     numbers/segments — the only case exercised by the corpus — are unaffected).
  6. **Manual visual QA — PERFORMED 2026-07-02 (browser verification, Psalm 1 WEB demo data,
     PT9 Standard view as baseline). Result: PASS with notes.**
     - Confirmed matching PT9: formatted text + inline small grey markers simultaneously
       (`\id`, `\ide`, `\h`, `\toc1-3`, `\mt1`, `\cl`, `\ms1`, `\q1/\q2`, `\v`); stylesheet
       layout (mt1 large centered, poetry hanging indents, toc colors); whole `\c 1` token in
       large chapter style (PT9 renders the whole `\c N` line in usfm_c too); notes collapsed
       to a superscript atomic caller with content hidden; markers are genuine editable text
       (caret verified inside a MarkerNode); Unformatted view unchanged (regression check).
     - **Superscripted whole verse token: matches PT9.** usfm.sty marks `\v` superscript and
       PT9's Standard.xslt wraps the whole `\v N` token in `usfm_v`, so whole-token
       superscript is the PT9 behavior. Cosmetic difference: PT10 adds a light background
       badge on the verse token that PT9 does not have — flag to PO as a deliberate PT10
       affordance or drop in Phase 2 CSS polish.
     - **Divergence (pre-existing, not Phase 0/1):** milestone/attribute runs render loudly —
       `\ts-s |sid="ts.PSA.tree"\*` shows its `|sid=...` attribute text near-black inline
       instead of PT9's dimmed `.attribute` grey (PT9 dims attributes until hover). Phase 2
       polish item: ensure attribute segments get the `.attribute` class/dim styling in
       editable mode.
- Unicode normalization (spec §4): applied host-side automatically on every PT10 save via
  `ScrText.PutText` (not a Phase 5 gap); NBSP↔`~` handling also already present host-side. See
  "Unicode normalization (spec §4)" below for the full evidence trail.

Corpus: `packages/platform/src/editor/adaptors/corpus/`. Each entry below is a
round-trip failure discovered by the harness and NOT fixed in its discovery
task, with enough detail to plan the fix. Format per finding:

## <fixture name> [<view mode>]

- **Symptom:** (assertion diff summary — what property/content changed or was lost)
- **Suspected site:** (adaptor function, file:line)
- **Severity:** data-loss | data-change | cosmetic
- **Disposition:** fix-in-phase-0 | phase-2-engine | needs-node-type (spec §7 opaque blocks)

---

Known scope limitation: normalized-USFM byte equality (spec §10) is not
assertable in this repo (no TS USFM serializer); USJ deep-equality is the
Phase 0 proxy. Byte-level verification happens host-side in a later phase.

## Task 3 baseline run (2026-07-01)

All 3 baseline fixtures × 4 view modes (12/12) passed with no adaptor changes
required — no findings entries needed below the template above.

One fixture-authoring issue was found and corrected (not an adaptor bug): the
"baseline: footnote and cross-reference" fixture originally split a
`<para>`'s inline content across source lines, placing a newline+indentation
text node between `and after.` and the second `<verse>` marker. `usxStringToUsj`
preserves inter-element whitespace verbatim as USJ text content (it only
discards whitespace-only text between block-level siblings), so the
multi-line template literal would have produced a USJ content string
containing a literal `\n  ` — not something a real single-line-authored USX
document would produce. Fixed by joining that `<para>`'s content onto one
source line in `corpus-data.ts` (a single space now separates the two
sentences, matching normal USX authoring). `usxStringToUsj` was not modified.

## Task 4 run (2026-07-01)

Added six fixtures covering verse bridges/segments, ca/cp/va/vp
alternate/publishing numbers, `ref` cross-references, `optbreak`,
milestones (`ms style="ts-s"`/`"ts-e"`), and RTL (Hebrew) text. All
9 fixtures × 4 view modes (36/36) passed with no adaptor changes
required — no findings entries needed below the template above.

The "verse bridges and segments" fixture (the one Step 2 required to pass,
per the Task 2 `parseNumberFromMarkerText` fix) passed in all 4 modes on the
first run, confirming the Task 2 fix already covers this path.

Passes were independently verified (not just `toEqual` succeeding
vacuously): a scratch test dumped the intermediate USJ and the
round-tripped USJ for the ca/cp/va/vp, ref, optbreak, and milestone
fixtures and confirmed `altnumber`, `pubnumber`, `loc`, and the `ms`
markers are genuinely present in both and structurally identical, not
both-sides-empty.

## Task 5 run (2026-07-01) — opaque-block constructs

Added five fixtures targeting the constructs the design spec explicitly
predicts may lose data because they lack dedicated USJ node types: a table
(`<table>`/`<row>`/`<cell>`), a figure (`<figure>` with USFM 3 `file`/`size`/
`ref` attributes), a sidebar (`<sidebar style="esb">` with a `category`
attribute and nested `<para>`), a `<periph>` element (with `id`/`alt`
attributes and a nested `<para>`, no `<chapter>` in the book), and a note
with `closed="false"` (an unterminated footnote).

**All 5 fixtures × 4 view modes (20/20) passed with no adaptor changes
required.** Combined with the prior 9 fixtures, the harness total is
56/56. No triage was needed: no fixture was deleted, no assertion was
loosened, no `skipModes` entries were added, and no code outside
`corpus-data.ts` was touched.

This is a genuinely surprising result given the task brief's framing
("failures are expected here"). The reason none of these constructs lose
data in this codebase: `table`, `figure`, `sidebar`, and `periph` have no
dedicated USJ node type in `libs/shared/src/nodes/usj/`, so they fall
through the `default` branch of `recurseNodes` in both
`usj-editor.adaptor.ts` and `editor-usj.adaptor.ts` into the generic
`UnknownNode` path (`createUnknown`/`createUnknownMarker`). That path is a
fully generic, symmetric pass-through: `createUnknown` captures `type` as
`tag`, `marker`, and *every other USJ property* (via
`getUnknownAttributes(markerObject, UNKNOWN_MARKER_OBJECT_PROPS)`, where
`UNKNOWN_MARKER_OBJECT_PROPS = ["type", "marker", "content"]`) into
`unknownAttributes`, and recurses into `content` using the same
`recurseNodes` dispatcher — so nested known constructs (e.g. the `<para>`
inside `<sidebar>`/`<periph>`, the `<char>` markers inside the unclosed
`<note>`) are still built as their proper node types, not swallowed as
opaque blobs. `createUnknownMarker` reverses this exactly, spreading
`unknownAttributes` back onto the output `MarkerObject`. Because
`table:row`/`table:cell` (renamed by `usxStringToUsj` itself, see
`packages/utilities/src/converters/usj/usx-to-usj.ts:49`), `figure`,
`sidebar`, and `periph` are all unrecognized `type` strings to the editor
adaptors, and `align`, `category`, `file`, `size`, `ref`, `id`, `alt`, and
`closed` are all unrecognized *properties* to `getUnknownAttributes`
(none of them appear in any node-specific `*_MARKER_OBJECT_PROPS` list),
every one of these values round-trips through `unknownAttributes`
generically, the same mechanism that already carried `altnumber`/
`pubnumber` losslessly in Task 4.

`closed="false"` on the note fixture is a related but separate case: USX
`<note>` maps directly to `NoteNode` (a *known* type, not `UnknownNode`),
but `NOTE_MARKER_OBJECT_PROPS` also doesn't list `closed`, so it takes the
same generic `unknownAttributes` path via `createNote`/`createNoteMarker`
rather than the `UnknownNode` path. Also note `usxStringToUsj` itself
special-cases `closed`: it explicitly does *not* strip it (unlike `vid`
and `status`, which it drops), per the comment at
`usx-to-usj.ts:63` ("Not dropping `attribs.closed` for backwards
compatibility") — so the construct was never at risk of being lost
upstream of the editor adaptors either.

Passes were independently verified (not just `toEqual` succeeding
vacuously): a scratch test round-tripped all 5 new fixtures in `standard`
mode and dumped `JSON.stringify` of both the intermediate USJ
(`usxStringToUsj` output) and the round-tripped USJ (serialize →
deserialize) side by side. Confirmed via console output that both sides
are identical and non-trivial, not both-empty — in particular:
- table: both sides contain the full 2×2 grid as nested
  `{"type":"table","content":[{"type":"table:row","marker":"tr","content":[{"type":"table:cell","marker":"th1","align":"start","content":["Day"]}, ...]}]}`.
- figure: both sides contain
  `{"type":"figure","marker":"fig","file":"cn01617.jpg","size":"span","ref":"1:31","content":["At once they left their nets."]}`.
- sidebar: both sides contain
  `{"type":"sidebar","marker":"esb","category":"History","content":[{"type":"para","marker":"p","content":["Sidebar paragraph content."]}]}`
  — the nested `<para>` is a real `para` node, not flattened into text.
- periph: both sides contain
  `{"type":"periph","id":"title","alt":"Title Page","content":[{"type":"para","marker":"mt1","content":["The Title"]}]}`.
- unclosed note: both sides contain
  `{"type":"note","marker":"f","caller":"+","closed":"false","content":[...]}`.

No findings entries were added below (no failures occurred). No fixture
was deleted, no `toEqual` was loosened, and no `skipModes` was added
without a corresponding finding (none were added at all — there was
nothing to skip).

## Acceptance criterion status (spec §7)

Table / figure / sidebar / periph / unclosed-note round-trip in `standard`
mode: 5 of 5 lossless as of this task. No failing constructs; no
dispositions to list — the generic `UnknownNode`/`unknownAttributes`
pass-through mechanism (see "Task 5 run" above) already makes all five
constructs lossless in `standard` mode without requiring dedicated node
types.

## MarkerNode lost its `marker` DOM class (pre-existing, commit 5ef9976)

- **Symptom:** CSS keyed on `.marker` no longer reaches editable-mode MarkerNodes; Task 8's rules target `.opening/.closing/.selfClosing` instead as a workaround.
- **Suspected site:** libs/shared/src/nodes/features/MarkerNode.ts createDOM (class list changed in #359).
- **Severity:** cosmetic
- **Disposition:** phase-2-engine — decide whether to restore the `marker` class on MarkerNode (and audit #359's motivation) or standardize on the syntax classes.

## Standard-view note shape in collab delta ops (pinned)

- **Symptom:** In standard view (editable+collapsed), a note's closing marker glyph (`\f*`) flows into the note embed's contents ops; the opening glyph is skipped (first-child rule) and the caller/NBSP produce no ops. Now pinned by `opsGen1v1Standard`.
- **Suspected site:** libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts (skip-first-child rule ~218).
- **Severity:** data-change (asymmetric glyph in ops; consumers must not assume glyph-free note contents)
- **Disposition:** phase-2-engine — decide the intended ops contract for marker glyphs in notes (relates to the "marker glyphs in collab ops" design question).

## Unicode normalization (spec §4)

Read-only investigation of `/home/lyonsm/paranext-core` (no code changes made there).

`grep -rn "Normalize" c-sharp/Projects/ParatextProjectDataProvider.cs` finds exactly one hit:
`ConvertUsxToUsfm` (the USX→USFM step of the save path, `ParatextProjectDataProvider.cs:2141-2158`)
calls `UsfmToken.NormalizeUsfm(scrText, verseRef.BookNum, usfm)` at line 2158. Reading
`UsfmToken.NormalizeUsfm`/`NormalizeTokenUsfm` (`/home/lyonsm/Paratext/ParatextData/UsfmToken.cs:795-920`)
shows this call only re-tokenizes and re-serializes USFM (CR/LF placement, double-space removal, RTL
direction marks) — it contains no `string.Normalize`/`NormalizationForm` call and is **not** Unicode
NFC/NFD normalization.

**Applied — one layer down, in `ScrText.PutText`, not in `ParatextProjectDataProvider.cs` itself.**
Every save path in `ParatextProjectDataProvider.cs` (`SetChapterUsfm:1830`, `SetBookUsfm:1807`, and
`SetChapterUsx`'s inline call at `:1985`, all reached after `ConvertUsxToUsfm` produces USFM)
funnels into `scrText.PutText(...)`. `ScrText.PutText`
(`/home/lyonsm/Paratext/ParatextData/ScrText.cs:1157-1250`) itself calls `text = Normalize(text, false)`
at **`ScrText.cs:1244`**, and `ScrText.Normalize` (`ScrText.cs:1573-1576`, the reference cited in the
task brief) delegates to `StringUtils.Normalize(text, Settings.NormalizationForm, forceUndefinedAsComposed)`
— the project's configured NFC/NFD form, exactly PT9's behavior. So: normalization is applied
automatically on every PT10 save, inherited "for free" from `ParatextData.dll` via `PutText`; no call
to `Normalize`/`NormalizationForm` exists directly in paranext-core's own C# and none is needed — this
is **not** a Phase 5 host-side gap.

**NBSP↔`~` handling:** a `FixNBSP`-equivalent transform *does* appear directly in the paranext-core
save path (not just transitively via `PutText`). `ConvertUsxToUsfm` calls
`UsxFragmenter.FindFragments(..., scrText.Settings.AllowInvisibleChars)` at
`ParatextProjectDataProvider.cs:2150-2156`; inside it, `UsxFragmenter.AddTextUsfm`
(`/home/lyonsm/Paratext/ParatextData/UsxFragmenter.cs:101-106`) does
`nav.Value.Replace(U+00A0, '~')` (NBSP to tilde) whenever `allowInvisibleChars` is false — the same
character mapping as `ScrText.FixNBSP` (`ScrText.cs:1467-1492`, `str.Replace(U+00A0, '~')`), inlined
rather than calling `FixNBSP` itself. The reverse direction (tilde to literal NBSP) happens on the
read/import side at `UsfmParser.cs:507` (`text.Replace('~', U+00A0)`). Net effect for Phase 2's §4
whitespace rules: NBSP in USX/USJ text round-trips to `~` in saved USFM (and back) at the host layer
already — the editor does not need to do this conversion itself, only needs to treat `~`/NBSP as the
same logical whitespace char when reasoning about marker-adjacent whitespace.

## Phase 2 browser verification (2026-07-02)

Task 15 acceptance-gate run. **Overall: DONE_WITH_CONCERNS** — the Phase 2
marker-editing engine performs every specified transformation correctly, but the
two user-facing input paths for introducing *new* markers (typing `\` and pasting
USFM) are blocked in the platform editor by the pre-existing `CommandMenuPlugin`.
See the finding at the end of this section.

> **UPDATE (2026-07-02, Task 15 fix round): the blocking finding is RESOLVED.**
> `CommandMenuPlugin` is now gated off in editable marker modes, so real typed `\`
> and real `\`-containing pastes reach the marker engine in Standard view. Checks
> 3/4/5/8 below were re-verified with real keyboard/paste input (see the inline
> "→ Real-input re-verification (post-fix)" addenda) and the resolution note at the
> end of this section. One residual, out-of-scope concern remains: toolbar Undo does
> not single-step-restore a real paste (check #8).

**Environment**
- Demo: `pnpm nx dev platform` → http://localhost:5173, "Standard" view selected
  in the Define-options → view-mode dropdown (editor class
  `editor-input usfm marker-editable text-spacing formatted-font`).
- Browser: Playwright-driven Chromium (headless), MCP tools.
- Data: default demo load — Psalm 1 (WEB), `WEB_PSA_CH1_USX`. Includes the demo's
  standing annotation milestones (`\zmsc-s/\zmsc-e` over "stand on the") and a
  seeded `unknown` node ("wat content?") in the verse-1 para.
- Note on input simulation: Playwright's synthetic `\` keystroke and `Ctrl+V` do
  not reach Lexical here (the `\` key is intercepted, see finding; `Ctrl+V` doesn't
  trigger a native headless paste). Engine behaviors that require literal backslash
  text were therefore exercised by `keyboard.insertText(...)`, which lands the same
  text a paste/typing would and drives the identical Tier-2 re-tokenization path.
  Marker-digit/letter edits (Tier 1) were done with real keystrokes.

**Step 1 whole-repo gates (cache bypassed): all PASS.**
`test` (9 projects), `lint` (10 projects; 2 pre-existing warnings, 0 errors),
`typecheck` (10 projects), `format:check` — all green. No source changes were made
during Task 15. (One transient `format:check` red was self-inflicted: Playwright
wrote snapshot `.yml` artifacts into a non-ignored `.playwright-mcp/` dir; removed,
re-ran clean.)

**Step 2 the 11 checks** (screenshots captured during the run, described here, not
committed):

1. **Tier 1 para rename — PASS.** Clicked the `\q1` glyph on the verse-1 para,
   selected the `1`, typed `2`: marker read `\q2`, para still `usfm_q1`; the trailing
   space committed the rename → para restyled to `usfm_q2`, toolbar block-type
   "q2 - Poetry - Indent Level 2", contextMarker "q2". Real keystrokes (no `\` typed).
   Undone via the toolbar Undo to restore baseline.
2. **Tier 1 char rename — PASS.** On a `\nd …\nd*` span, selected `nd` in the opener,
   typed `wj` + space → char restyled `usfm_nd`→`usfm_wj` and BOTH glyphs updated
   (`\wj` opener and `\wj*` closer). Real keystrokes.
3. **Tier 2 typed char marker — PASS (engine).** Inserting `\nd ` mid-text created a
   `char.usfm_nd` span whose following run auto-extended and auto-closed with `\nd*`
   at para end; a later `\nd*` inserted after "meditates" closed the span there
   (node tree: char nd = [marker `\nd`, " meditates", marker `\nd*`], " day and
   night." plain). The earlier auto-close became a literal unmatched `\nd*` (kept
   literal per the §5.2 degradation rule — no data loss). **Input-path caveat:** a
   real user's `\` keystroke is swallowed (see finding), so this is only reachable
   programmatically.
   **→ Real-input re-verification (post-fix, 2026-07-02):** with `CommandMenuPlugin`
   now gated off in editable marker modes, REAL keystrokes `\nd ` (backslash typed via
   the keyboard) land the literal `\` in the verse text (KEYDOWN → BEFORE_INPUT → INPUT
   all fire, no `preventDefault`) and the space commit builds a `char usfm_nd` span
   (`\nd \nd*`, auto-closed at para end). The `\`-typeahead menu does **not** open —
   `UsjNodesMenuPlugin` is gated `scrRef && !hasExternalUI`, and the demo runs with
   `hasExternalUI: true`, so the `\`-menu is simply not mounted in this composition
   (either outcome was acceptable per the fix dispatch). **Now reachable by real input.**
4. **Typed footnote — PASS (engine).** `\f + \ft test note\f* ` produced a
   `note usfm_f collapsed` with an inline `immutable-note-caller` (button title
   "test note", caller "+") rendering as a superscript caller ("②"). Same input-path
   caveat as #3.
   **→ Real-input re-verification (post-fix, 2026-07-02):** REAL character-by-character
   typing of `\f + \ft test\f* ` in verse text now produces a `note usfm_f collapsed`
   with an `immutable-note-caller` (collapsed footnote caller). **Now reachable by
   real input.**
5. **Paste split — PASS (engine) / BLOCKED (real paste).** The real paste path does
   nothing (finding). Feeding the same payload `\p New paragraph text \v 99 verse
   text` as literal text at a mid-para caret drove the engine correctly: paras 23→24,
   a new `usfm_p` paragraph, `\v 99` verse token rendered (nav → "Psalms 1:99"), the
   para split at the caret (text before stays, remainder flows into the new `\p`).
   **→ Real-input re-verification (post-fix, 2026-07-02):** a REAL paste event
   (synthesized `ClipboardEvent('paste')` carrying `\p New paragraph text \v 99 verse
   text` on the focused editor, caret at offset 38 of the verse-1 text) is no longer
   swallowed — Lexical handles it (`defaultPrevented === true`), the paragraph count
   goes 25→26, the para splits at the caret (`…doesn't walk in` stays; the remainder
   `the counsel of the wicked,` flows into the new para), a `\p` marker paragraph is
   created, and `\v 99` renders as a verse token. **Now reachable by real input.**
6. **Deletion — PASS.** (a) Selecting a para's `\q2` glyph + Delete merged the para
   into the previous one (paras 23→22, texts joined). (b) Deleting an `\nd*` closer
   extended the char span to para end (span absorbed the following " tailword" and
   re-closed at para end). Real keystrokes.
7. **Ctrl+Space — PASS.** Caret inside a styled span + Ctrl+Space split it
   styled/plain/styled; text typed in the gap is unstyled (not inside any char span).
   Real Ctrl+Space (the engine's KEY_DOWN handler for it is not blocked).
8. **Undo — PARTIAL / by-design nuance.** Undo restores the pre-paste state fully.
   Two nuances: (i) **`Ctrl+Z` keyboard is intentionally disabled** in the platform
   editor by `DisableHistoryShortcutsPlugin` (mounted when `hasExternalUI`, the demo
   default) — undo is command/toolbar-driven; the toolbar Undo works and restores in
   the expected granularity. (ii) The "single undo step for a paste" could not be
   browser-verified because the real paste path is blocked (#5/finding); the
   insertText-simulated equivalent took two Undo clicks (a simulation artifact — the
   raw insert and the async Tier-2 rebuild are separate history entries — whereas a
   real coalesced paste is unit-tested to be single-step in Task 11).
   **→ Real-input re-verification (post-fix, 2026-07-02) — CONCERN.** With the real
   paste now reaching the editor (#5), toolbar Undo does **not** cleanly restore the
   pre-paste state: after the paste, a single toolbar Undo leaves the pasted content in
   place and `CAN_UNDO` goes false (nothing left to undo). The editor's command log
   confirms the paste left **no undoable history entry** — after the paste, typing a
   `Z` then one Undo removed the `Z` and immediately drove `CAN_UNDO → false`, i.e. the
   paste itself was never on the undo stack. Root cause is the async Tier-2 rebuild,
   which finalizes the paste by **recreating** the affected paragraph nodes (fresh node
   keys) in an `editor.update` outside a history push, so the pre-paste snapshot is not
   recoverable. The toolbar Undo mechanism itself is sound — it reverts an ordinary
   typed edit (the `Z`) in a single click. This undo-granularity gap lives in the
   pre-existing paste / async-rebuild pipeline (untouched by the CommandMenuPlugin
   gate); it is merely now *observable* because paste is no longer swallowed. Task 11
   unit-tests a coalesced paste as single-step at the engine level; the end-to-end
   toolbar-undo granularity for a real paste is a separate follow-up, outside this fix's
   scope. **Logged as a concern.**
   **→ RESOLVED (2026-07-03).** Real Ctrl+V paste of `\p New paragraph text \v 99 verse
   text` mid-paragraph now Undoes to the exact pre-paste state in a **single** toolbar
   Undo, and Redo re-applies it (browser-verified via the app's own Ctrl+V →
   `pasteSelection` → `PASTE_COMMAND` path). The earlier "async rebuild outside a history
   push" hypothesis was **wrong**: instrumentation showed the paste + Tier-2 rebuild is a
   *single* `paste`-tagged update that already HISTORY_PUSHes. The real root cause was an
   interaction with `ScriptureReferencePlugin`: its `onVerseDestroyed` verse mutation
   listener dispatched `SELECTION_CHANGE_COMMAND` **synchronously** when the rebuild
   creates/destroys a verse (e.g. `\v 99`, and re-tokenizing the existing `\v 1`).
   Mutation listeners run mid-commit (before update/history listeners), so that dispatch
   spawned a no-dirty selection commit whose stock-`HistoryPlugin` entry advanced the undo
   baseline to the **post-rebuild** state *before* the paste update's own push ran — so the
   push captured the already-split state as the baseline and the pre-paste state was never
   stored (one Undo → no-op, `CAN_UNDO` false). Controls confirmed the mechanism: a plain
   paste (no rebuild) and a char-marker rebuild in a **verse-less** paragraph both Undo
   cleanly; a rebuild that creates *or* destroys a verse breaks. **Fix:** defer that
   dispatch to a microtask (`ScriptureReferencePlugin.tsx onVerseDestroyed`) so it lands as
   a fresh top-level update after the mutating commit's history push. Regression test in
   `ScriptureReferencePlugin.test.tsx` ("defers the verse-mutation reference re-eval until
   after the mutating commit"). The Task 11 engine-level coalescing test is unaffected and
   still passes.
9. **Whitespace display — PASS (+ noted copy gap).** Typing two spaces converts them
   to display-NBSP (raw codes U+00A0, U+00A0) so both stay visible; a typed `~`
   renders literally as `~` (the NBSP display form). Copy works: selecting "prosper"
   and `Ctrl+C` lands "prosper" on the clipboard via the stock path. **Per Task 12,
   the Standard-view copy normalization (`$handleCopyForStandardView`, NBSP→space) is
   confirmed unreachable** — `ClipboardPlugin` dispatches `COPY_COMMAND` with a `null`
   payload, so the handler returns at its `clipboardData == null` guard. Noted, not
   failed (per the amendment).
10. **Atomic-node refusal (§5.6) — PASS.** Caret placed right before a collapsed note
    caller; inserting "XXINS" landed it beside the caller ("Yahweh'sXXINS\f…"), never
    inside (note textContent excludes it); caller intact (data-caller "+", child count
    unchanged).
11. **Regression — PASS.** Unformatted view → full-size markers (15px, e.g. `\ide`,
    no `text-spacing`/`formatted-font` classes), editing works ("QQ" inserted).
    Formatted view → `marker-hidden`, zero marker glyphs, normal typing works ("TYPED
    scoffers" inserted), engine inert (`MarkerEditPlugin` is gated to
    `markerMode === "editable"`).

## CommandMenuPlugin blocks the Standard-view marker input paths (Task 15)

- **Symptom:** In the platform editor (Standard editable view), a real user cannot
  introduce a new marker by either specified path: (a) pressing `\` (or `/`) inserts
  nothing, and (b) pasting text containing `\`/`/` is silently dropped. The Phase 2
  engine (Tiers 1/2, deletion, Ctrl+Space, whitespace, atomic refusal) works
  correctly once literal backslash text reaches a `TextNode`, but neither user input
  path delivers it. Tier-1 renames of *existing* glyphs are unaffected (they edit the
  digit/letter, never type `\`).
- **Suspected site:** `libs/shared-react/src/plugins/usj/CommandMenuPlugin.tsx` —
  the `KEY_DOWN_COMMAND` handler (`COMMAND_PRIORITY_NORMAL`) does
  `preventDefault()`+return-true on `event.key === "\\" || "/"`, and the
  `PASTE_COMMAND`/`DROP_COMMAND` handlers `preventDefault()`+return-true when the
  payload text contains `\`/`/`. Mounted unconditionally at
  `packages/platform/src/editor/Editor.tsx:457`. Because it swallows the `\` before it
  can land as text, the co-mounted `UsjNodesMenuPlugin` (`Editor.tsx:427`, trigger
  `\`) — the spec's intended `\`-menu input path (design §5.2, lines ~166/238-247) —
  also never triggers; no marker menu was observed to appear via any path.
- **Severity:** blocks the user-facing typed/pasted-marker capability of Phase 2
  (engine sound, input plumbing blocked). Verified via: real `\` keydown observed
  (key `\`) with no insertion; real `Ctrl+V` no-op; a directly-dispatched
  `PASTE_COMMAND` (Lexical's own helper pattern) also swallowed.
- **Disposition:** design-level — reconcile `CommandMenuPlugin` with the Phase 2
  engine / `UsjNodesMenuPlugin` (e.g. gate `CommandMenuPlugin` off, or make its
  `\`/`/` block inert, when `markerMode === "editable"`; or route `\` through the
  marker menu whose literal-dismiss path §5.2 relies on). Not addressed by the Phase 2
  plan (the "context-aware marker menu" is deferred to Phase 4); no mechanical
  in-Phase-2 fix, so recorded here rather than changed under Task 15.
- **RESOLUTION (2026-07-02, Task 15 fix round).** Fixed in
  `packages/platform/src/editor/Editor.tsx`: `CommandMenuPlugin` is now rendered only
  when `viewOptions?.markerMode !== "editable"`. In editable marker modes (Standard,
  Unformatted) literal backslash input is required by the marker-edit engine (§5.2) and
  reserved for the `\`-menu (§5.4), so the guard must stand aside; in the non-editable
  views (Formatted, Paragraph Structure) a literal `\` would be garbage data, so
  `CommandMenuPlugin` keeps guarding them. `CommandMenuPlugin` itself was **not** modified
  (other editors consume it). The gate mirrors the Task 10 `ParaMarkerPrefixGuardPlugin`
  hand-off pattern. Regression test:
  `packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx` mounts the platform
  `Editor` with a render-spy replacing `CommandMenuPlugin` and asserts it is absent under
  the Standard (editable) view and present under the Formatted (hidden) view. Browser
  re-verification (Standard view, real keyboard/paste): typed `\nd ` builds a
  `char usfm_nd` span; typed `\f + \ft test\f* ` builds a collapsed footnote caller; a
  real paste of `\p … \v 99 …` splits the paragraph and renders `\v 99`; and the
  Formatted-view regression still blocks a typed `\` (no glyph lands). Gates:
  `test` / `typecheck` / `lint` on `@eten-tech-foundation/platform-editor` all green
  (`--skip-nx-cache`). One residual concern surfaced by the now-reachable paste path:
  toolbar Undo does not single-step-restore a real paste (see check #8 above) — a
  pre-existing paste/async-rebuild history gap, outside this gate's scope.
