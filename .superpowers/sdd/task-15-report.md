# Task 15 report — Integration: whole-repo suites + in-browser verification

**Status: DONE_WITH_CONCERNS.** The Phase 2 marker-editing engine performs every
specified transformation correctly (all 11 browser checks exercised and observed),
but the two user-facing input paths for introducing *new* markers — typing `\` and
pasting USFM — are blocked in the platform editor by the pre-existing, unconditionally
mounted `CommandMenuPlugin`. Engine sound; input plumbing blocked. No source changes
were made under Task 15 (the concern is design-level; recorded, not patched).

**Commit:** `1d30331` docs: record Phase 2 browser verification results (findings doc,
`git add -f`). Branch `standard-view`, not pushed.

---

## Step 1 — whole-repo gates (cache bypassed): ALL PASS

Command run per dispatch: `test`, `lint`, `typecheck`, `format:check`, each with
`--skip-nx-cache`.

| Gate | Result |
| --- | --- |
| `nx run-many -t test --skip-nx-cache` | PASS — Successfully ran target test for 9 projects (platform has no test files; others green) |
| `nx run-many -t lint --skip-nx-cache` | PASS — 10 projects; 2 pre-existing warnings, 0 errors |
| `nx run-many -t typecheck --skip-nx-cache` | PASS — 10 projects |
| `nx format:check` | PASS |

Fixes made: **none to source.** One self-inflicted transient `format:check` failure:
the Playwright MCP tools wrote accessibility-snapshot `.yml` artifacts into a
non-`.gitignore`d `.playwright-mcp/` directory (plus screenshot PNGs at repo root),
which prettier then flagged. Removed all QA artifacts and re-ran `format:check` clean
(exit 0). No product code or tests were touched; every existing assertion is intact.

## Step 2 — browser verification (11 checks)

Environment: `pnpm nx dev platform` → http://localhost:5173, "Standard" view
(editor `marker-editable text-spacing formatted-font`); Playwright/Chromium; default
data Psalm 1 (WEB, `WEB_PSA_CH1_USX`, incl. the demo's annotation milestones and a
seeded `unknown` "wat content?" node).

Input-method note: Playwright's synthetic `\` keystroke and `Ctrl+V` do not reach
Lexical here (the `\` key is intercepted — see concern; `Ctrl+V` doesn't fire a native
headless paste). Engine behaviors needing literal backslash text were driven via
`keyboard.insertText(...)`, which lands the identical text a paste/typing would and
exercises the same Tier-2 re-tokenization. Tier-1 digit/letter edits used real
keystrokes.

| # | Check | Outcome |
| --- | --- | --- |
| 1 | Tier 1 para rename `\q1`→`\q2` | **PASS** — digit edit + space committed; para restyled `usfm_q1`→`usfm_q2`, marker `\q2`. Real keystrokes. |
| 2 | Tier 1 char rename `\nd`→`\wj` | **PASS** — opener edit + space; both glyphs updated (`\wj`/`\wj*`), span restyled `usfm_nd`→`usfm_wj`. Real keystrokes. |
| 3 | Tier 2 typed `\nd …\nd*` | **PASS (engine)** — `\nd ` opened a `char.usfm_nd`, auto-extended + auto-closed at para end; later `\nd*` closed it early (leftover auto-closer degrades to literal per §5.2). Input path blocked for real `\` (concern). |
| 4 | Typed footnote `\f + \ft … \f* ` | **PASS (engine)** — collapsed `note usfm_f` with inline caller (superscript "②", title "test note"). Input path blocked for real `\` (concern). |
| 5 | Paste `\p … \v 99 …` mid-para | **PASS (engine) / BLOCKED (real paste)** — real paste is swallowed (concern); same payload as literal text split the para (23→24), new `usfm_p` para, `\v 99` token (nav "Psalms 1:99"). |
| 6 | Deletion | **PASS** — (a) deleting a `\q2` glyph merged the para into the previous (23→22); (b) deleting a `\nd*` closer extended the span to para end. Real keystrokes. |
| 7 | Ctrl+Space | **PASS** — split styled/plain/styled; text typed in the gap is unstyled. Real Ctrl+Space (not blocked). |
| 8 | Undo (post-paste, one step) | **PARTIAL / by-design** — undo restores pre-paste state. `Ctrl+Z` is intentionally disabled by `DisableHistoryShortcutsPlugin` (mounted when `hasExternalUI`); toolbar Undo works. "Single step for paste" not browser-verifiable (paste blocked); insertText-simulated equivalent took 2 Undo clicks (insert + async Tier-2 rebuild = 2 history entries; a real coalesced paste is unit-tested single-step in Task 11). |
| 9 | Whitespace display + copy | **PASS (+ noted gap)** — two spaces → both visible display-NBSP (U+00A0 ×2); typed `~` → literal `~`. Copy lands content on clipboard via stock path. Standard-view copy normalization (`$handleCopyForStandardView`) confirmed **unreachable** — `ClipboardPlugin` dispatches `COPY_COMMAND` with `null` (Task 12). Noted, not failed (per amendment). |
| 10 | Atomic-node refusal (§5.6) | **PASS** — inserting text just before a collapsed note caller landed it beside the caller ("Yahweh'sXXINS\f…"), never inside; caller intact. |
| 11 | Regression (Unformatted / Formatted) | **PASS** — Unformatted: full-size markers (15px), editing works. Formatted: `marker-hidden`, zero glyphs, normal typing works, engine inert (`MarkerEditPlugin` gated to `markerMode==="editable"`). |

Screenshots captured during the run (viewport PNGs), described in the findings doc and
**not committed** (removed to keep the tree/format clean): initial Formatted load;
Standard editable load; checks 1, 2, 3, 4, 5, 6a, 6b, 7, 9, 11a (Unformatted), 11b
(Formatted).

## Concerns

1. **[Primary, design-level] `CommandMenuPlugin` blocks Standard-view marker input.**
   `libs/shared-react/src/plugins/usj/CommandMenuPlugin.tsx` (mounted unconditionally,
   `packages/platform/src/editor/Editor.tsx:457`, `COMMAND_PRIORITY_NORMAL`):
   its `KEY_DOWN` handler `preventDefault()`s the `\` and `/` keys, and its
   `PASTE`/`DROP` handlers swallow any payload text containing `\`/`/`. In Standard
   editable view this blocks both spec'd ways to introduce a new marker (type `\nd `…,
   paste `\p …`). Because the `\` key never lands as text, the co-mounted
   `UsjNodesMenuPlugin` (`Editor.tsx:427`, trigger `\`) — the design's intended
   `\`-menu path (§5.2) — also never triggers; no marker menu was observed. Tier-1
   renames of *existing* glyphs are unaffected (they edit the digit/letter, no `\`
   typed) and pass with real keystrokes. Verified via: real `\` keydown (key `\`) with
   no insertion; real `Ctrl+V` no-op; a directly-dispatched `PASTE_COMMAND` (Lexical's
   own helper shape) also swallowed. Not addressed by the Phase 2 plan; the
   context-aware marker menu is deferred to Phase 4. Recommended resolution: gate
   `CommandMenuPlugin` off (or make its `\`/`/` block inert) when
   `markerMode === "editable"`, or route `\` through the marker menu whose
   literal-dismiss path §5.2 relies on. Logged as a finding in the findings doc.

2. **[Noted, by-design] `Ctrl+Z` keyboard is intentionally disabled** by
   `DisableHistoryShortcutsPlugin` (active when `hasExternalUI`, the platform default).
   Undo is command/toolbar-driven; the toolbar Undo works. Not a Phase 2 regression
   (plugin pre-dates Phase 2).

3. **[Noted, per Task 12] Standard-view copy normalization is unreachable** —
   `ClipboardPlugin` dispatches `COPY_COMMAND` with a `null` payload, so
   `$handleCopyForStandardView` returns at its `clipboardData == null` guard and never
   normalizes display-NBSP → space on copy. Copy itself still works via the stock path.
   Per the dispatch amendment, this is expected and not a failure.

## Verdict

Phase 2's engine is sound and every specified transformation was observed working.
However, because the typed-`\` and paste input paths are blocked in the shipped
platform editor composition, I do **not** claim "Phase 2 works" end-to-end for a real
user without resolving concern #1. Reporting **DONE_WITH_CONCERNS** per the dispatch's
handling of design-level check failures.

---

# Task 15 — fix round (2026-07-02): gate CommandMenuPlugin off in editable marker modes

**Status: RESOLVED (with one out-of-scope residual concern).** Concern #1 above is
fixed. Real typed `\` and real `\`-containing pastes now reach the Phase 2 marker
engine in Standard (editable) view; `CommandMenuPlugin` still guards the non-editable
views.

## Code change

- `packages/platform/src/editor/Editor.tsx` — `<CommandMenuPlugin logger={logger} />`
  is now rendered only when `viewOptions?.markerMode !== "editable"`, with a comment
  citing §5.2 (marker-edit engine) and §5.4 (`\`-menu). Alphabetical position kept
  (between `ClipboardPlugin` and `ContextMenuPlugin`). `CommandMenuPlugin` itself was
  NOT modified — other editors consume it. Mirrors the Task 10
  `ParaMarkerPrefixGuardPlugin` editable-mode hand-off pattern.
- `packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx` (new) — mounts the
  platform `Editor` with a `vi.mock`/`vi.hoisted` render-spy replacing only
  `CommandMenuPlugin` (all other `shared-react` exports preserved via spread) and
  asserts: absent under Standard (editable) view, present under Formatted (hidden) view.
  Two tests, both green.

## Gates (all `--skip-nx-cache`, project `@eten-tech-foundation/platform-editor`)

| Gate | Result |
| --- | --- |
| `test` | PASS — 17 files, 241 tests (+2 new), 3 skipped |
| `typecheck` | PASS |
| `lint` | PASS (0 errors) |
| `format:check` (whole-repo, bonus) | PASS |

## Browser re-verification (Playwright/Chromium, `nx dev platform`, Standard view, real input)

1. **Real typed `\nd ` — PASS.** Backslash typed on the keyboard lands as literal text
   (KEYDOWN → BEFORE_INPUT → INPUT fire, no `preventDefault`); space commit builds a
   `char usfm_nd` span (`\nd \nd*`, auto-closed at para end).
2. **Real typed `\f + \ft test\f* ` — PASS.** Character-by-character typing builds a
   `note usfm_f collapsed` with an `immutable-note-caller`.
3. **Real paste `\p New paragraph text \v 99 verse text` mid-para — PASS.** Synthesized
   `ClipboardEvent('paste')` on the focused editor is handled (`defaultPrevented`),
   paras 25→26, para splits at the caret (`…walk in` stays; `the counsel of the wicked,`
   flows into the new para), new `\p` marker paragraph, `\v 99` verse token rendered.
4. **Undo after the paste — CONCERN (out of scope).** A single toolbar Undo does NOT
   restore the pre-paste state; `CAN_UNDO` goes false afterward (paste left no undo
   entry). Command log proof: after the paste, typing `Z` + one Undo removed the `Z`
   and drove `CAN_UNDO → false` — the paste itself was never on the undo stack. Root
   cause: the async Tier-2 rebuild recreates the affected paragraph nodes (fresh keys)
   in an `editor.update` outside a history push. Toolbar Undo itself is sound (reverts
   an ordinary typed edit in one click). This is the pre-existing paste/async-rebuild
   history pipeline (untouched by this gate), now merely *observable* because paste is
   no longer swallowed. Task 11 unit-tests coalesced paste as single-step at the engine
   level; end-to-end toolbar granularity for a real paste is a separate follow-up.
5. **Regression, Formatted view — PASS.** With the editor in `marker-hidden`
   (Formatted), a real typed `\` does NOT land (verse text unchanged) —
   `CommandMenuPlugin` still active and guarding the non-editable views.

**`\`-typeahead menu:** does NOT open on `\` in this composition — `UsjNodesMenuPlugin`
is gated `scrRef && !hasExternalUI` and the demo runs `hasExternalUI: true`, so the
`\`-menu is not mounted here (either outcome was acceptable per the dispatch).

## Docs

- `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md` — amended checks
  3/4/5/8 with "→ Real-input re-verification (post-fix)" addenda, added a resolution
  banner under the section header, and a **RESOLUTION** bullet closing the
  CommandMenuPlugin finding.

## Residual concern

- **Real-paste toolbar Undo is not single-step (nor currently restorable).** See check
  #4. Pre-existing paste/async-rebuild history behavior, outside the CommandMenuPlugin
  gate's scope; recommend a follow-up to make the async Tier-2 rebuild coalesce into the
  paste's history transaction so a real paste is a single undoable step end-to-end.
