# PT-4201 (WI-14) Copy/Paste USFM Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make copy/paste in P10 Standard view round-trip USFM faithfully — copy-out as valid USFM (including note callers), multi-paragraph and note-containing paste, external round trips — with the semantics documented and every clipboard path pinned by tests.

**Architecture:** Nearly all work lands in scripture-editors' marker-edit engine (`packages/platform/src/editor/markerEdit/`), which already owns Standard-view clipboard normalization (`whitespaceDisplay.plugin.utils.ts`) and paste re-tokenization (Tier 2 rebuild). paranext-core contributes one E2E spec exercising the real Electron clipboard. The strategy is: write the semantics document first (it is the spec), then close each gap test-first at the engine level, then pin the end-to-end path.

**Tech Stack:** Lexical 0.43 / React / vitest+jsdom (scripture-editors); Playwright isolated-Electron fixture (paranext-core); pnpm/nx with volta-shim workarounds.

**JIRA:** https://paratextstudio.atlassian.net/browse/PT-4201 (sub-task of PT-4186). Definition of Done: semantics documented, gaps implemented, automated tests per clipboard path, suites green.

**Status update (2026-08-07):** The four PO-check decisions below are **approved by TJ**. Hand repros were run on a second machine at paranext-core 4bd46750 / scripture-editors c7e666fa — c7e666fa is a direct ancestor of the plan base f14ee9b5 and none of the intervening commits touch the clipboard seams, so all results are valid against this plan. Findings are folded into Tasks 2–6: the dominant live bug is display-NBSP→`~` corruption on paste (Task 3), copy leaks phantom spaces at note-internal closing markers (Task 2), multi-line marker paste already behaves to spec (Task 4 downgraded to pins), pasted `\c` poisons the save loop (Task 4), and the hidden-view `/`-swallow is pre-existing upstream — not ours to fix (Task 6 reduced). The app is running under a separate session: engine work and unit tests proceed now; E2E runs, yalc/DLL builds, and live QA are deferred (see Tasks 8–9).

## Global Constraints

- **Two-repo workspace:** `/home/tj_co/source/repos/workspaces/standard-view-pt-4201/{paranext-core,scripture-editors}` (Task 0 — CREATED 2026-08-07). scripture-editors branch `standard-view-pt-4201` is off `standard-view-pt-4187` @ **8fd4dd74** — the branch advanced past the investigated f14ee9b5 and the display-run consolidation's `AttributeRunNode` wrapper has now LANDED (editable-mode verse/milestone display runs are wrapped inline elements). Clipboard-specific files are unchanged since the investigation, but `MarkerEditPlugin.tsx`/`tier2Rebuild.utils.ts`/`markerEditTier2Trigger.utils.ts` churned: **locate seams by symbol name, not by this plan's line numbers**, and the Task-2 walker must traverse `AttributeRunNode`-wrapped runs transparently (inline element, contributes children's text). paranext-core branch `standard-view-pt-4201` off `standard-view` (4bd46750989, as investigated).
- **dev-packages.json `revision` edits are working-only — never commit them** (branch-strategy convention).
- **New spec/plan `.md` files under `docs/superpowers/` in scripture-editors are gitignored — use `git add -f`.** A `lint-staged FAILED` line on commit is benign.
- **TDD everywhere:** every behavior change starts with a failing test. Characterization tests (pin current behavior) are written and committed BEFORE behavior-changing fixes.
- **Comments must stand on their own** — no "Task N" / plan / JIRA breadcrumbs in code comments (JIRA refs only for tracked deferrals).
- **One `test()` per E2E spec file** (documented dock-tab failure mode with a second Electron instance); sub-scenarios are `test.step()`s.
- **Undo invariant:** any paste (including its Tier-2 rebuild) is exactly ONE undo step. `$rebuildParas` runs inside the triggering update (`tier2Rebuild.utils.ts:2-4`); never dispatch commands synchronously from mutation listeners (see `ScriptureReferencePlugin.tsx:437-458` for the `queueMicrotask` precedent and its comment).
- **Pre-commit verification:** scripture-editors: `pnpm nx run-many -t test` + typecheck + lint (via volta shim, see Task 0); paranext-core: `npm run typecheck && npm run lint && npm test`.
- **AI attribution** on commits (`Co-authored-by:` + `Session-URL:`); squash-merge PRs; PR titles < 70 chars.
- **Coordination hazard:** the display-run consolidation work (in flight on `standard-view-pt-4187`, see `docs/superpowers/plans/2026-08-06-display-run-consolidation.md`) plans an `AttributeRunNode` inline wrapper in phase 2. That changes what `selection.getTextContent()` walks. Expect a rebase; keep clipboard tests behavior-level (assert clipboard strings/USJ, not node shapes) so they survive it.
- **yalc push updates ALL sibling paranext-core checkouts' node_modules** — only push when live QA in THIS workspace is intended; the other workspaces restore by re-pushing from their own scripture-editors checkout.
- **Ports 1212/8876/9223 are shared across parallel sessions** (`standard-view` and `standard-view-2` workspaces may be live). Before any `refresh.sh`: `lsof -ti:8876` + `readlink /proc/<pid>/cwd`. Never overlap refresh.sh runs.
- Live QA runs in Power mode (`platform.interfaceMode: power` in dev-appdata/data/settings.json) — structure protection is active in Simple mode and would contaminate results.

---

## Semantics decisions (the spec for Task 1's document)

These are the intended semantics this plan implements. Items marked **[PO-check]** are product-level calls TJ may want to veto before execution; the plan proceeds on the recommendation if unchallenged.

**S1. Copy (Standard view) — `text/plain` is valid USFM of the selection.**
Already ~true because markers are real text nodes; this plan closes the exceptions:
- Note callers: `\f` + caller + content + `\f*` with the note's USJ `caller` value (`+`, `-`, or literal) — currently the caller is silently dropped (and rewrites to `+` on re-paste). **[PO-check]** This deliberately *exceeds* P9, where plain-text copy carries only the caller glyph and full notes survive only in CF_HTML. Rationale: in P10 there is no CF_HTML fidelity carrier for external apps, and the ticket requires "copy from Standard → paste into a plain-text editor: markers present and correctly placed".
- Collapsed notes contribute their full (visually hidden) `\f …\f*` bytes. **[PO-check]** "What you copy" > "what you see", for fidelity. Documented, not changed.
- Display-NBSP → space; data-NBSP → `~`; `text/html` and `application/x-lexical-editor` stay unnormalized (existing, pinned).
- **Byte fidelity around note-internal markers:** copied text must not contain spaces the source USFM lacks. Live repro (2026-08-07): copying `\x - \xo 1:3: \xo*\xt 2Cor 4:6\xt*\x*Den` produced `… \xo* \xt 2Cor 4:6\xt* \x*Den` — phantom spaces after each closing marker (display-separator NBSPs leaking through the blanket NBSP→space mapping). The copy walker must be source-faithful, mirroring the serialization inverse, not a blanket `replaceAll`.
- Multi-block selections: one `\n` between blocks; a selection starting mid-paragraph omits that paragraph's own `\p ` glyph (matches P9's rendered-text copy). Pinned, not changed.

**S2. Paste (Standard view, internal):** same-namespace `application/x-lexical-editor` payload reconstructs the exact node tree (existing). Unchanged.

**S3. Paste (Standard view, external) — plain text IS the fidelity carrier.**
Any paste without a same-namespace Lexical payload is treated as a USFM text fragment: take `text/plain` (fall back to text derived from `text/html` with block boundaries → `\n`), normalize NBSPs **positionally**, insert as text, let Tier 2 re-tokenize markers. Foreign HTML formatting is dropped by design — Standard view is markers-as-text, exactly like P9's Standard view where the reformat pipeline re-tokenizes everything. This generalizes the existing NBSP-gated handler and kills both live-observed corruptions plus the latent doubled-glyph path (re-imported Standard-view HTML producing a `CharNode` via `data-marker` importDOM *and* literal `\nd` text, since MarkerNode has no importDOM).
- **Positional NBSP normalization (replaces the blanket NBSP→`~`):** an NBSP immediately adjacent to a marker token (following `\marker` or `\marker*`, or leading char-span content) is a display artifact → space; a remaining interior NBSP is user data → `~`. This is P9's `PostprocessUsfm` model. Live repro that mandates it (2026-08-07): pasting P10's own copied footnote back produced `\f~ \fr~1:1 ~ \ft~Caller test.~ \f*` (every display-NBSP became `~`, breaking marker recognition); a browser-hop paste of `\nd …\nd*` produced `\nd~light … \nd*` with an unmatched pair.
- **The private Lexical flavor is effectively dead on Ctrl+V:** the live tilde corruption on a same-editor paste shows the async `navigator.clipboard.read()` in `pasteSelection` does not return `application/x-lexical-editor`, so even internal pastes ride the html/plain flavors. Task 3 verifies this mechanically. Consequence: the USFM text carrier IS the internal path too — acceptable once S1's copy is byte-faithful — and the sync `ClipboardEvent` path keeps the node-tree fast path when the flavor is present (S2).
- Marker-bearing lines own their markers: a pasted line starting with a paragraph-marker literal does NOT also get the host paragraph's cloned prefix (no doubled/empty paragraphs). Marker-free lines inherit the host marker. **Live-verified correct on c7e666fa (2026-08-07)** — `\p one\n\p two` and `tail\n\q1 line` both produced exactly the target structure; Task 4 pins this, fixing only if the automated PASTE_COMMAND tests contradict the live result.
- Pasted `\c` / `\id`: **strip during paste normalization** (approved). Live-verified harm (2026-08-07): pasting `\c 2` mid-chapter put a chapter node in the editor and poisoned the save loop — PDP rejects every save with "Multiple chapter markers present", the error surfaces only in the renderer log, disk and other editors silently stop updating. (P9 destroys pasted `\c` at save with a user-facing error.)

**S4. Paste-as-plain-text (Ctrl+Shift+V / context menu):** narrows the payload to `text/plain` — under S3 this is semantically identical to a normal external paste in Standard view. There is NO "paste literally, don't tokenize" mode; P9 has none either (no Paste Special exists in P9). Live-confirmed identical 2026-08-07. Documented + pinned as equivalence, no new UI. TJ note: the equivalence is Standard-view-scoped — other views may legitimately differentiate the two commands later; out of scope here.

**S5. Hidden-marker views (`formatted`, `paragraph-structure`):**
- Copy-out is prose (no marker text) — existing, gets a gate test protecting our Standard-view handlers from leaking there.
- The paste gate (swallow anything containing `\` **or `/`**) is over-broad — it eats URLs, dates, "and/or" (live-confirmed 2026-08-07). **Pre-existing upstream behavior** (`CommandMenuPlugin` on `origin/main`, predates the standard-view branches) — per TJ, NOT fixed here; recorded in the semantics doc's deferred list. Structural apply-markers-on-paste in formatted views likewise out of scope.

**S6. Cut = copy + `removeText()`** (existing). The WI-2 filed quirk — a selection-delete ending exactly at a just-settled char-span boundary absorbing one adjacent character — gets a targeted regression pin.

**S7. Undo:** every paste, including rebuilds it triggers, is one undo step (existing pins extended to the new paths).

**Known accepted asymmetries vs P9 (documented, not implemented):** P9→P10 paste from P9's Formatted view carries markers only in CF_HTML (P9 classes), which P10 does not parse → pastes as prose. P9 Standard-view copy pastes into P10 perfectly via plain text. P10 formatted-view copy loses note callers in plain text (P9 kept the glyph); acceptable — prose copy stays clean.

---

## Current-state map (from investigation, 2026-08-06)

All paths scripture-editors-relative unless prefixed `core:`.

| Seam | Where |
|---|---|
| Copy/cut Standard-view handler | `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts:117` (`$getStandardViewClipboardData`), `:133` (`$handleCopyForStandardView`); registered Standard-view-only at `MarkerEditPlugin.tsx:506-530` (COPY/CUT, HIGH) |
| Standard-view gate | `hasStandardViewWhitespace(viewOptions)` — `libs/shared-react/src/views/view-options.utils.ts:254-266`; `MarkerEditPlugin.tsx:219` |
| Paste handler stack | CRITICAL in-note multi-line claim `MarkerEditPlugin.tsx:615-681`; HIGH NBSP-gated `$handlePasteForStandardView` `whitespaceDisplay.plugin.utils.ts:93-110` (registered `MarkerEditPlugin.tsx:531-541`); HIGH `StructureProtectionPlugin.tsx:82-105`; NORMAL `CommandMenuPlugin.tsx:29-40` (non-editable views only, `Editor.tsx:591`); LOW `splitExpected` arming `MarkerEditPlugin.tsx:682-700`; then Lexical RichText |
| Paste → tokenizer | `markerEditTier2Trigger.utils.ts:90` (`$textNodeTier2Transform`) → `tier2Rebuild.utils.ts:708` (`$rebuildParas`) / `:887` (`$rebuildNoteContent`) → `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts:460` (`usfmFragmentToUsjContent`) |
| Caller loss | `libs/shared-react/src/nodes/usj/ImmutableNoteCallerNode.tsx:56` — DecoratorNode, no `getTextContent()` override → contributes `""`; re-tokenize turns any caller into `+` (`usfmFragmentToUsj.ts:169-177`) |
| Async paste dispatch | `libs/shared-react/src/plugins/usj/clipboard.utils.ts:7` (`pasteSelection`), `:32` (`pasteSelectionAsPlainText`); Ctrl(+Shift)+V interception `libs/shared-react/src/plugins/usj/ClipboardPlugin.tsx:11-26` |
| Hidden-view paste block | `libs/shared-react/src/plugins/usj/CommandMenuPlugin.tsx:29-40` — swallows any `text/plain` containing `\` or `/`; html-only payloads bypass it |
| Main clipboard suite + event-stub idioms | `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` (`copyEvent()` :62-74, `pasteEvent()` :368-381); in-note paste stubs `noteEnterFp.test.tsx:752-765`; test env `markerEdit.test-helpers.tsx:59-68` (`testEnvironment`, `serializedState`) |
| Prior design statement | `docs/superpowers/specs/2026-07-01-standard-view-design.md:262-268` (§5.6) |
| core: editor E2E idiom | `core:e2e-tests/tests/isolated/scripture-editor/type-through-save-echo.spec.ts:34-83`; helpers `core:e2e-tests/fixtures/scripture-editor-helpers.ts` |
| core: clipboard environment | srcdoc same-origin iframe, nothing blocks clipboard (`core:src/renderer/components/web-view.component.tsx:566-592`); no Electron permission handlers; no clipboard menu items anywhere (macOS native `editMenu` role only) |

**Untested/missing today:** multi-paragraph copy; copy across a collapsed note; caller fidelity; `\f…\f*` body paste through PASTE_COMMAND; multi-line marker-bearing paste outside a note (behavior literally undefined — prefix injection collides with literal markers); external-HTML re-import (suspected doubled glyphs); paste-as-plain-text; hidden-view gate tests; any E2E clipboard test.

---

### Task 0: Workspace setup

**Files:** none in-repo except committing this plan.

**Interfaces:** Produces the `standard-view-pt-4201` workspace all later tasks run in.

- [ ] **Step 1: Create both worktrees**

```bash
git -C /home/tj_co/source/repos/workspaces/standard-view/scripture-editors worktree add \
  /home/tj_co/source/repos/workspaces/standard-view-pt-4201/scripture-editors \
  -b standard-view-pt-4201 standard-view-pt-4187
git -C /home/tj_co/source/repos/workspaces/standard-view/paranext-core worktree add \
  /home/tj_co/source/repos/workspaces/standard-view-pt-4201/paranext-core \
  -b standard-view-pt-4201 standard-view
```

Both commands must be run against the committed HEADs shown by `git log --oneline -1` (`f14ee9b5` / `4bd46750989`). If the source branches have moved since 2026-08-06, re-verify the scripture-editors tip still contains the clipboard seams above (`git log --oneline -5`) — the plan's line numbers were taken at f14ee9b5.

- [ ] **Step 2: Commit this plan into the scripture-editors worktree**

```bash
cd /home/tj_co/source/repos/workspaces/standard-view-pt-4201/scripture-editors
cp /home/tj_co/source/repos/workspaces/standard-view/scripture-editors/docs/superpowers/plans/2026-08-06-pt-4201-copy-paste-usfm-fidelity.md docs/superpowers/plans/
git add -f docs/superpowers/plans/2026-08-06-pt-4201-copy-paste-usfm-fidelity.md
git commit -m "docs: PT-4201 copy/paste USFM fidelity plan"
```

- [ ] **Step 3: Install scripture-editors deps and prove the test runner works**

```bash
cd /home/tj_co/source/repos/workspaces/standard-view-pt-4201/scripture-editors
env -u _VOLTA_TOOL_RECURSION pnpm install
```

Then build the volta shim dir once (needed for nx test runs; check exit codes, not output tails):

```bash
SHIM=/tmp/claude-1000/pt4201-shim; mkdir -p $SHIM
ln -sf ~/.volta/tools/image/node/22.22.0/bin/node $SHIM/node
printf '#!/bin/bash\nexec %s %s "$@"\n' ~/.volta/tools/image/node/22.22.0/bin/node ~/.volta/tools/image/pnpm/10.31.0/bin/pnpm.cjs > $SHIM/pnpm
chmod +x $SHIM/pnpm
env -u VOLTA_HOME PATH="$SHIM:$PATH" pnpm nx test @eten-tech-foundation/platform-editor -- whitespaceDisplay.plugin.utils.test.tsx
```

Expected: existing clipboard suite green. (Exact node/pnpm versions: verify against `~/.volta/tools/image/` if the paths changed.)

- [ ] **Step 4: Install paranext-core deps**

```bash
cd /home/tj_co/source/repos/workspaces/standard-view-pt-4201/paranext-core
npm install        # long: postinstall builds the renderer DLL
```

Edit `dev-packages.json` → `"revision": "standard-view-pt-4201"` — **do not commit this file**.

- [ ] **Step 5: Commit nothing else; verify clean status in both worktrees** (`git status --short` shows only the expected untracked/working files).

---

### Task 1: Semantics document

**Files:**
- Create: `docs/superpowers/specs/2026-08-06-clipboard-semantics.md` (scripture-editors)

**Interfaces:** Produces the written spec every later task's tests cite. Content = the "Semantics decisions" section of this plan (S1–S7), expanded with: the P9 reference behavior summary (3-format DataObject; plain text carries markers in Standard view because markers are rendered text; HTML-first unsanitized paste + reformat-pipeline normalization; no Paste Special; `\c` destroyed at save; callers glyph-only in plain text), the accepted asymmetries list, and a table mapping each semantic to its pinning test file (filled in as Tasks 2–8 land).

- [ ] **Step 1: Write the document** (S1–S7 verbatim from this plan + P9 summary + empty test-mapping table).
- [ ] **Step 2: Commit**

```bash
git add -f docs/superpowers/specs/2026-08-06-clipboard-semantics.md
git commit -m "docs: define Standard-view clipboard USFM semantics (PT-4201)"
```

---

### Task 2: Copy fidelity — note callers, multi-paragraph, collapsed-note straddling

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts` (`$getStandardViewClipboardData`)
- Test: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` (extend), or a new sibling `clipboardCopyFidelity.test.tsx` if the file grows unwieldy

**Interfaces:**
- Consumes: `testEnvironment`/`serializedState` (`markerEdit.test-helpers.tsx:59-68`), `copyEvent()` stub shape (`whitespaceDisplay.plugin.utils.test.tsx:62-74`).
- Produces: `$selectionToUsfmText(selection: RangeSelection): string` — exported from `whitespaceDisplay.plugin.utils.ts`, used by `$getStandardViewClipboardData` for the `text/plain` leg. Behavior: identical to `selection.getTextContent()` (single `\n` between blocks, anchor/focus offsets respected) EXCEPT (a) `ImmutableNoteCallerNode` contributes the enclosing `NoteNode`'s USJ caller text instead of `""`, and (b) NBSP handling is **source-faithful per node**, mirroring the serialization inverse (`editor-usj.adaptor.ts:88-90` consumes the same `hasStandardViewWhitespace` gate) — display-separator NBSP nodes that have no source counterpart (the separators between note-internal char spans and after closing markers) contribute NOTHING, marker-trailing display NBSPs that represent a real source space contribute a space, data-`~` stays `~`. The current blanket `.replaceAll(NBSP, " ")` turns separators into phantom spaces (live repro 2026-08-07, see Step 5 pins).

- [ ] **Step 1: Write failing copy-fidelity tests.** USJ fixture with a `+`-caller footnote mid-verse; select the whole paragraph; dispatch `COPY_COMMAND` with a `copyEvent()` stub; assert the `text/plain` payload. First run the test with a loose assertion to CHARACTERIZE the exact current bytes (expect caller missing), then set the strict expected string:

```tsx
const NOTE_USJ = {
  type: "USJ", version: "3.1",
  content: [
    { type: "para", marker: "p", content: [
      { type: "verse", marker: "v", number: "1" },
      "In the beginning",
      { type: "note", marker: "f", caller: "+", content: [
        { type: "char", marker: "fr", content: ["1.1 "] },
        { type: "char", marker: "ft", content: ["A note."] },
      ]},
      " God created.",
    ]},
  ],
};
// assertions (exact rendered glyph bytes pinned after characterization run):
expect(textPlain).toContain("\\f + ");     // caller present, correctly placed
expect(textPlain).toContain("\\f*");
expect(textPlain).toMatch(/^\\p \\v 1 In the beginning\\f \+ /);
```

Repeat for `caller: "a"` (literal) and `caller: "-"` (hidden) → `\f a ` / `\f - `. Note: the exact note-internal rendering (whether `\fr …\fr*` closers appear) is whatever Standard view renders — pin the characterized bytes and assert they re-tokenize to the same USJ in Step 5's round-trip test; the USJ round-trip, not the byte shape, is the invariant.

- [ ] **Step 2: Run to verify failure** (`… pnpm nx test @eten-tech-foundation/platform-editor -- <testfile>`): caller assertions FAIL (caller currently `""`).

- [ ] **Step 3: Implement `$selectionToUsfmText`.** In `whitespaceDisplay.plugin.utils.ts`, wrap the selection walk: get `selection.getNodes()`, and build text the way `RangeSelection.getTextContent()` does (respect anchor/focus text offsets on the boundary text nodes; single `\n` between non-inline elements; DecoratorNodes contribute `getTextContent()`), except when the node is an `ImmutableNoteCallerNode`, emit the nearest `NoteNode` ancestor's caller (read the accessor from `libs/shared-react/src/nodes/usj/NoteNode` — use its getter, falling back to `"+"` when unset). Implementation freedom: if replicating the offset walk proves fragile, an equally valid approach is `selection.getTextContent()` computed on a temporary basis where each caller node's contribution is spliced in by walking the selection's note nodes in document order — but the walk must be pure/read-only inside `editor.getEditorState().read()`/update context. Switch `$getStandardViewClipboardData:122-129` to use it for `text/plain` only. Do NOT touch `ImmutableNoteCallerNode.getTextContent()` itself — that node serves all views and formatted-view prose copy must stay caller-free.

- [ ] **Step 4: Run to verify caller tests pass.**

- [ ] **Step 5: Add the remaining copy pins** (byte-fidelity ones FAIL until the source-faithful walker lands; commit all regardless):
  - **Phantom-space pins from the 2026-08-07 live repro** (these are the New-Issue-1 bytes): a cross-reference `\x - \xo 1:3: \xo*\xt 2Cor 4:6\xt*\x*` copied whole → text/plain byte-identical to the source (currently produces `… \xo* \xt 2Cor 4:6\xt* \x*` — phantom space after each closing marker). A footnote `\f - \fr 1:1 \ft Caller test.\f*` copied whole → byte-identical (currently `\f \fr 1:1  \ft Caller test. \f*` — caller dropped, doubled space after `1:1`, phantom space before `\f*`).
  - Multi-paragraph full selection over `\p one` + `\q1 two` → `"\\p one\n\\q1 two"` (after NBSP mapping).
  - Selection starting mid-paragraph-1 → `"…tail\n\\q1 two"` (no leading `\p `).
  - Selection spanning a COLLAPSED note entirely inside it → hidden bytes present in the payload (S1 documented behavior).
  - Round trip: take the copied `text/plain`, paste it into a second `testEnvironment` editor via a `pasteEvent()` stub, settle (`await` microtasks ×2), export USJ, expect deep-equal to the source selection's USJ (whole-paragraph selection case).
  - Cut leg: `CUT_COMMAND` with the note selection → clipboard identical to copy AND note removed from the tree.

- [ ] **Step 6: Full suite for the package green** (`… pnpm nx test @eten-tech-foundation/platform-editor`), typecheck.

- [ ] **Step 7: Commit** — `fix(platform): include note callers in Standard-view clipboard USFM` (+ tests).

---

### Task 3: External paste consolidation — plain text is the carrier

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts` (`$handlePasteForStandardView:93-110`)
- Modify (only if gate ordering demands): `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:531-541`
- Test: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` (extend the existing "paste normalization" describe)

**Interfaces:**
- Consumes: `pasteEvent(payload)` stub (`:368-381`), `htmlPasteText` (`whitespaceDisplay.plugin.utils.ts:64`).
- Produces: `$handlePasteForStandardView` now claims EVERY paste lacking a same-namespace `application/x-lexical-editor` payload (was: only NBSP-bearing ones). Contract for later tasks: external `text/html` never reaches Lexical's HTML import path in Standard view.

- [ ] **Step 0: Verify the flavor-loss mechanism.** The 2026-08-07 live repro (same-editor paste of a just-copied footnote → `\f~ \fr~1:1 ~ …` tildes) implies `pasteSelection`'s `navigator.clipboard.read()` never returns `application/x-lexical-editor`. Confirm from code: read `clipboard.utils.ts:7-30` and check whether the rebuilt DataTransfer can ever contain the custom MIME (Chromium's async read exposes only standard types unless web-custom-formats were written). Record the answer in the semantics doc (S3's "flavor is dead on Ctrl+V" note); it determines whether the tilde corruption reproduces in jsdom via a payload WITHOUT the lexical flavor but WITH NBSP-bearing `text/html` — build the regression test that way.

- [ ] **Step 1: Write failing tests:**
  - **Tilde-corruption regression (the live bug):** payload = NBSP-bearing `text/html` of a copied footnote + normalized `text/plain`, NO lexical flavor (per Step 0) → final USJ equals the source note; no `~` characters introduced (currently produces `\f~ \fr~…` unknown-marker soup).
  - **Positional NBSP rule:** paste text containing `\nd` + NBSP + `Lord` + NBSP + `\nd*` (browser-hop shape) → settles to `\nd Lord\nd*` (currently `\nd~light`-style corruption + unmatched pair); paste `word` + NBSP + `word` with no adjacent marker → interior NBSP becomes `~` (user data preserved).
  - Paste of Standard-view-shaped HTML (a `<span data-marker="nd">`-bearing fragment as `text/html`, with matching `text/plain`) → exactly one `\nd` opening glyph — the latent doubled-glyph path stays closed once the handler claims externals.
  - Word-style external HTML (`<b>bold</b> text` + plain `"bold text"`) → inserts `bold text`, no formatting nodes.
  - html-only payload (no `text/plain`) → text derived via `htmlPasteText`, inserted with positional normalization.
  - Internal payload (`application/x-lexical-editor` present, namespace `platformEditor`, sync-event path) → handler declines (existing pin stays green; S2 fast path preserved where the flavor exists).
  - `isStructureProtected` editors: handler declines so `StructureProtectionPlugin` still governs (construct with structure protection on; assert sanitize path still runs).
  - Existing NBSP suite: update the blanket NBSP→`~` pins to the positional rule (they are wrong per the live evidence, not sacred).

- [ ] **Step 2: Run; expect the new externals to FAIL** (today they fall through to Lexical's HTML import, or hit the blanket `~` mapping).

- [ ] **Step 3: Implement.** In `$handlePasteForStandardView`: remove the NBSP-only gate; decline when the event carries a same-namespace Lexical payload or `isStructureProtected`; resolve text as `text/plain ?? htmlPasteText(text/html)`; normalize NBSPs positionally (marker-adjacent → space via a pass like `text.replace(/(\\[a-z0-9-]+\*?)\u00A0/gi, "$1 ")` plus the leading-char-span-content case, then remaining NBSP → `~`); insert as raw text. **Check the multi-line interplay:** the LOW-priority `splitExpected` arming (`MarkerEditPlugin.tsx:682-700`) never runs when a HIGH handler claims — arm `context.splitExpected` from inside this handler before inserting multi-line text (this may already be latently broken for NBSP-bearing multi-line pastes; if so, write the regression test for that too — it's in-scope collateral).

- [ ] **Step 4: Run to green; then the FULL platform-editor suite** (paste is load-bearing; watch `noteEnterFp` — the CRITICAL in-note claim outranks this handler and must be unaffected).

- [ ] **Step 5: Commit** — `fix(platform): route all external Standard-view pastes through USFM text carrier`.

---

### Task 4: Multi-line marker-bearing paste pins + `\c`/`\id` strip

**Live status (2026-08-07):** multi-line marker-bearing paste behaves to target semantics in the running app (`\p one\n\p two` → clean paragraphs; `tail\n\q1 line` → merge + own marker) — this task PINS that, and only fixes if the automated PASTE_COMMAND tests contradict the live result (jsdom and live can diverge; if they do, the live behavior is the spec). The `\c` strip is confirmed necessary: pasted `\c 2` poisoned the save loop (PDP "Multiple chapter markers present" on every save; editor↔disk divergence; error only in the renderer log).

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts` (paste normalization — `\c`/`\id` strip)
- Modify (only if pins contradict live behavior): the `splitExpected` prefix-injection site (find via `grep -rn "splitExpected" packages/platform/src/editor/markerEdit/`)
- Test: new `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx`

**Interfaces:**
- Consumes: `testEnvironment`, `pasteEvent`, Task 3's consolidated handler.
- Produces: pinned behavior for marker-bearing multi-line paste; `\c`/`\id` never survive paste normalization.

- [ ] **Step 1: Write the behavior pins (expected to PASS per the live result — investigate any failure before "fixing"):**

```tsx
// paste "\p one\n\p two" at end of "\p A" =>
expect(usj.content.map(p => [p.marker, textOf(p)])).toEqual([
  ["p", "A"], ["p", "one"], ["p", "two"],   // no doubled markers, no empty stray para (live-verified)
]);
// paste "one\ntwo" (marker-free) at end of "\p A" =>  [["p","Aone"],["p","two"]]  (existing behavior, re-pinned here)
// paste "tail\n\q1 line" at end of "\p A" => [["p","Atail"],["q1","line"]]  (live-verified)
// paste "\f + \ft note\f*" mid-verse => collapsed NoteNode materialized; USJ note with caller "+"
// paste "\v 2 rest" at para end => VerseNode created, chapter's verse sequence sane
// undo after EACH of the above: ONE UNDO_COMMAND dispatch restores the exact pre-paste USJ
```

If a pin FAILS in jsdom, first check whether the divergence is harness-induced (event stub vs Chromium native paste). Only touch the `splitExpected` injection site ("marker wins": skip cloning the host prefix when the split paragraph's leading text already starts with a paragraph-kind marker literal, per the terminated-marker regex family at `markerEditTier2Trigger.utils.ts:58`) if the engine genuinely misbehaves.

- [ ] **Step 2: Implement the `\c`/`\id` strip (failing test first):**

```tsx
// paste "\c 5" on its own line mid-chapter => NO chapter node created; text does not contain "\c";
//   exported USJ has exactly one chapter; a subsequent onUsjChange-style read yields saveable USJ
// paste "\id GEN" => stripped the same way
// paste "before\n\c 5\nafter" => "before"/"after" lines still paste per Step 1 rules; the \c line vanishes
```

Implement in the Task-3 handler's normalization: drop `\c`/`\id` tokens and their token payload (the number/code up to the next marker or newline), before insertion. Pin that the editor never enters the unsaveable state the live repro produced.

- [ ] **Step 3: Run the new suite + `noteEnterFp` + `markerEditDeletion` + `tier2Rebuild` suites to green.**

- [ ] **Step 4: Commit** — `fix(platform): strip pasted \c/\id; pin multi-line marker paste semantics`.

- [ ] **Step 5: File the non-clipboard sibling bug** (don't fix): TYPING `\c 2 ` mid-chapter in Standard view presumably reaches the same unsaveable PDP state via Tier 2 — that's an engine/save-path concern, not clipboard. Add it to the semantics doc's deferred list with the live error text so it lands in WI-10's audit.

---

### Task 5: Paste-as-plain-text equivalence

**Files:**
- Test only: extend `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx`

**Interfaces:** Consumes `pasteSelectionAsPlainText`'s payload shape (a DataTransfer with ONLY `text/plain` — simulate with a `pasteEvent` carrying just that flavor).

- [ ] **Step 1: Write the equivalence test:** for the Task-4 fixtures (`"\\p one\n\\p two"`, `"\\nd Lord\\nd* "`), dispatch once with a full payload (plain+html) and once with plain-only; assert identical final USJ. Also pin: plain-only payload with markers still tokenizes (there is no literal mode — S4).
- [ ] **Step 2: Run — expected to pass** given Tasks 3–4 (if it fails, the handler has an html-vs-plain divergence to fix under Task 3's contract).
- [ ] **Step 3: Corpus-style round-trip sweep** (ticket Testing Idea). Locate the branch's USJ round-trip corpus (`grep -ril "corpus" packages/platform/src libs/shared/src --include="*.test.*"` — WI-10's brief says it exists and pins editor↔USJ). Add one parameterized test: for each corpus USJ document that Standard view can host (skip multi-chapter/book-level fixtures), load it, select all, dispatch `COPY_COMMAND` (stub), paste the resulting `text/plain` into a fresh `testEnvironment` editor, settle, export USJ, expect deep-equal to the source. Every corpus failure is either a genuine fidelity bug (fix under the matching task above) or a documented-lossy construct — record those in the semantics doc's accepted-asymmetries list with the diff, mirroring how the C# converter documents its known losses.
- [ ] **Step 4: Commit** — `test(platform): pin paste-as-plain-text ≡ external paste; corpus clipboard round trip`.

---

### Task 6: Other-view gate tests (reduced scope)

**Scope reduction (2026-08-07):** the over-broad `/`-swallowing paste gate in `CommandMenuPlugin.tsx:29-40` is **pre-existing upstream** (present on scripture-editors `origin/main`; it rode the packages→libs move) — per TJ, pre-existing issues in non-Standard views are not fixed here. This task only proves OUR Standard-view clipboard changes don't leak into other views, and records the upstream issue.

**Files:**
- Test only: new gate cases beside the existing view suites in `packages/platform/src/editor/markerEdit/` (use `getViewOptions("formatted")`-style options with the `testEnvironment` helper family)

**Interfaces:** none new.

- [ ] **Step 1: Gate tests for Standard-view handlers:** formatted-view editor → `COPY_COMMAND` yields the Lexical-default payload with NO marker text and no `\f` bytes (prose only; caller absent — the Task-2 walker must not fire); a marker-bearing external paste is NOT claimed by the Task-3 consolidated handler (assert via behavior: the `CommandMenuPlugin` swallow or RichText default applies, not USFM tokenization).
- [ ] **Step 2: Record the upstream `/`-swallow** (URLs/"and/or" silently eaten, html-only bypass, log-only feedback) in the semantics doc's deferred list as pre-existing upstream behavior, with the live repro date.
- [ ] **Step 3: Run suites; commit** — `test(platform): gate Standard-view clipboard handlers out of other views`.

---

### Task 7: WI-2 boundary regression — selection-delete at a settled char-span edge

**Files:**
- Test only: extend `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.tsx` (or the deletion suite the char-span cases live in — read its structure first)

**Interfaces:** none new.

- [ ] **Step 1: Reproduce-or-pin test.** Fixture: `\p` para containing `“quote \wj words\wj*” after`. Build a `RangeSelection` whose anchor sits in `quote ` and whose focus is an ELEMENT point immediately after the closing `\wj*` `MarkerNode` (mirroring DOM `setEndAfter(spanElement)` → Lexical element-point mapping). Dispatch `CUT_COMMAND` (and a plain `removeText()` variant). Assert: the closing `”` and everything after survive byte-exactly; clipboard holds exactly the selected content.
- [ ] **Step 2: If it reproduces** (the filed quirk: one char after the boundary absorbed): fix the boundary mapping where the selection is normalized before `removeText()` in the cut path (`whitespaceDisplay.plugin.utils.ts:142-159`) — likely normalizing the element-point focus to the equivalent text-point at offset 0 of the next text node, not offset 1. If it does NOT reproduce at the Lexical level (the original repro was DOM-range-driven), the pin still lands, plus a note in the semantics doc that the DOM-level path is covered by Task 8's E2E selection steps.
- [ ] **Step 3: Commit** — `test(platform): pin selection-delete at settled char-span boundary (WI-2 filed)`.

---

### Task 8: E2E — real-clipboard round trip in paranext-core

**Files:**
- Create: `core:e2e-tests/tests/isolated/scripture-editor/clipboard-usfm-round-trip.spec.ts`
- Consumes: `core:e2e-tests/fixtures/isolated.fixture.ts` (read its exported fixture names first — the idiom below uses `mainPage` + the Electron app handle it exposes), helpers in `core:e2e-tests/fixtures/scripture-editor-helpers.ts` (`makeSampleProjectEditable`, `openEditableScriptureEditorForProject`, `navigateToolbarBcv`, `waitForHomeTab`, `SAMPLE_WEB_PROJECT_ID`).

**Prereq:** the scripture-editors changes must be in the built editor the app serves — rebuild platform-editor + yalc push + DLL rebuild first (Task 9 Step 1 does this; run Task 9 Step 1 before this task's Step 2, or run this spec knowing copy-caller/paste fixes are absent and expect only the baseline steps green). Foreground runs only for subagents; `npm run test:e2e:isolated scripture-editor/clipboard-usfm-round-trip` self-starts the dev server; first cold test ≈84s of the 120s budget — use `test.slow()`.

- [ ] **Step 1: Write the spec** — ONE `test()`, structured as steps:

```ts
test.use({
  interfaceMode: 'power',
  electronLaunchOptions: { isolatedProjectRoot: true, envOverrides: { DEV_NOISY: 'false' } },
});

test('Standard view clipboard round-trips USFM', async ({ /* fixture names per isolated.fixture.ts */ }) => {
  test.slow();
  // setup: waitForHomeTab, makeSampleProjectEditable, openEditableScriptureEditorForProject,
  // frameLocator(`iframe[data-web-view-id="${editorId}"]`), wait .editor-container,
  // editorInput = frame.locator('.editor-input.marker-editable'), navigateToolbarBcv(mainPage, 'Jonah 1:1')

  await test.step('copy out is valid USFM', async () => {
    await editorInput.click();
    await editorInput.press('Control+Home');
    await editorInput.press('Shift+Control+End');       // whole chapter — or a verse-scoped selection if flaky
    await editorInput.press('Control+C');
    const text = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
    expect(text).toMatch(/\\v 1 /);
    expect(text).toMatch(/\\p /);                        // markers survived to the OS clipboard
  });

  await test.step('external USFM paste lands and settles to disk', async () => {
    await electronApp.evaluate(({ clipboard }) => clipboard.writeText('\\nd Yahweh\\nd* '));
    await editorInput.press('Control+End');
    await editorInput.press('Control+V');
    await expect(editorInput).toContainText('Yahweh', { timeout: 20_000 });
    // settle char span: press End then a departure keystroke per the engine's settle-on-departure,
    // then assert the editor shows the settled \nd glyphs (span.opening[data-marker="nd"] idiom
    // from standard-default-power-mode.spec.ts)
  });

  await test.step('undo is one step', async () => {
    await editorInput.press('Control+Z');
    await expect(editorInput).not.toContainText('Yahweh', { timeout: 20_000 });
  });
});
```

The Electron clipboard bridge (`electronApp.evaluate(({ clipboard }) => …)`) is the "external application" — it reads/writes the real OS clipboard outside the renderer, which is exactly the external round-trip the ticket asks for. Disk assertion (SFM under the isolated project root) is a bonus: add it only if a helper already exposes the isolated root path; do not invent path plumbing.

- [ ] **Step 2 (DEFERRED — app in use by a separate session): Run** (`npm run test:e2e:isolated scripture-editor/clipboard-usfm-round-trip`, FOREGROUND) once TJ frees the app/ports AND Task 9 Step 1's build has run. Until then the spec is committed unrun and marked as such in the commit message. Iterate on selectors/timing only — behavior failures at this layer mean an engine task regressed; go back there.
- [ ] **Step 3: Commit in paranext-core** — `test(e2e): Standard-view clipboard USFM round trip (unrun; pending app slot)` — reword once it has actually run green.

---

### Task 9: Integration — build, live QA, suites, PRs, JIRA

**Files:** no new code; `dev-packages.json` stays uncommitted.

**Deferral note (2026-08-07):** the app is running under a separate session, so Steps 1–2 (yalc/DLL build + live QA) and Task 8's E2E run wait for TJ's go-ahead. Step 3's unit-suite verification, doc updates, and pushes proceed now; PRs can open with a note that live QA + E2E confirmation follow.

- [ ] **Step 1: Build the editor into the app** (from the pt-4201 workspace; check ports first — `lsof -ti:8876` + `readlink /proc/<pid>/cwd`; coordinate before yalc push, it rewires ALL sibling checkouts):

```bash
RB=~/.volta/tools/image/node/22.22.0/bin
cd /home/tj_co/source/repos/workspaces/standard-view-pt-4201/scripture-editors/packages/platform
env -u VOLTA_HOME PATH="$RB:$PATH" npx vite build
env -u VOLTA_HOME PATH="$RB:$PATH" npx api-extractor run --local
env -u VOLTA_HOME PATH="$RB:$PATH" npx tsx ../../scripts/prepare-publish.ts   # MUST run
env -u VOLTA_HOME PATH="$RB:$PATH" npx yalc push
cd ../.. && git restore packages/platform/package.json
cd /home/tj_co/source/repos/workspaces/standard-view-pt-4201/paranext-core
NODE_ENV=development TS_NODE_TRANSPILE_ONLY=true npx webpack --config ./.erb/configs/webpack.config.renderer.dev.dll.ts
```

Freshness check: grep a distinctive string LITERAL from the new code (e.g. a new log/warn message) in `packages/platform/dist/index.js` AND `.erb/dll/renderer.dev.dll.js` — identifiers are mangled, literals survive.

- [ ] **Step 2: Hand-run QA** (record results on PT-4201): copy a verse from Standard view → paste into a plain-text context (the E2E clipboard bridge or a scratch file) → verify USFM; paste PT9-exported USFM including `\f … \f*` and a multi-paragraph selection; paste into formatted view (URL text inserts; `\p` text refused); one-step undo each. Disk ground truth: `~/.platform.bible/projects/Paratext 9 Projects/<proj>/*.SFM` — grep for residue after QA.
- [ ] **Step 3: Full verification.** scripture-editors: `… pnpm nx run-many -t test` + typecheck + lint (shim). paranext-core: `npm run typecheck && npm run lint && npm test` (+ `dotnet test c-sharp-tests/` only if C# was touched — this plan touches none). Update the semantics doc's test-mapping table; commit.
- [ ] **Step 4: Push branches** (scripture-editors → eten-tech-foundation remote; paranext-core → origin). CI on these branches is manual-dispatch only — hand-run the SE dispatch; note core `build:dll` red is pre-existing on the committed platform-yalc revision.
- [ ] **Step 5: PRs** via the pr-creator skill. Targets: scripture-editors PR → `standard-view-pt-4187` if it is still unmerged, else `standard-view`; paranext-core PR → `standard-view`. AI-assisted footer + session links; squash-merge.
- [ ] **Step 6: JIRA:** comment on PT-4201 with the semantics summary (or link to the committed doc), QA results, and PR links; transition per the PT-board flow (Triage→ToDo is 3-hop 11/21/31 if status regressed; normally ToDo→Doing→review states).

---

## Explicitly deferred (file, don't fix)

- **`CommandMenuPlugin` `/`-swallow in hidden-marker views** — pre-existing upstream (`origin/main`); eats URLs/dates/"and/or" silently, html-only payloads bypass it. Live-confirmed 2026-08-07. Record in semantics doc; fix belongs upstream if anywhere.
- **Typing `\c` mid-chapter poisons the save loop** — same unsaveable-PDP state the paste repro hit (`Multiple chapter markers present`, error only in renderer log, editor↔disk divergence), but via Tier-2 typing, not clipboard. Belongs to WI-10's data-fidelity audit; record with the live error text.
- **Structural marker application on paste in hidden-marker views** — S5; out of scope (WI-10-adjacent). File a follow-up if PO wants it.
- **Popover expanded-note `isStandardView` false → whitespace/copy-NBSP normalization inactive on note content** — already OPEN at `docs/superpowers/specs/2026-07-07-standard-view-followups.md:214-217`; touches view-gating architecture, not clipboard. Leave filed there; note in semantics doc.
- **P9-CF_HTML class parsing** (P9 formatted-view copy → P10 markers) — accepted asymmetry.
- **`text/usfm` custom MIME / "Copy as USFM" command** — unnecessary once `text/plain` IS USFM; note as considered-and-rejected in the semantics doc.
