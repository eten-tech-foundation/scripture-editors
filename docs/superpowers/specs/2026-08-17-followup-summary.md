# Residual backlog round: follow-up summary

Seven implementation groups ran in parallel worktrees off `sv/residual-backlog` (created from
the six-track integration tip) and are now merged back into `sv/residual-backlog` in both
repos. This is the follow-up wrap-up: what shipped, how it was verified, the merge account,
and what the round surfaced. The companion `2026-08-17-followup-residual-backlog.md` carries
everything still open; the manual-test script gained a follow-up section for the new
behaviors.

Branches merged: `sv/rb/settle-debounce`, `sv/rb/palette-menus`, `sv/rb/split-and-stack`,
`sv/rb/whitespace-paste-tests`, `sv/rb/host-collab` (both repos), `sv/rb/glyph-kinds-audit`,
`sv/rb/tier1-deletion`. Plans with per-group Outcome notes:
`docs/superpowers/plans/2026-08-17-group-*.md`.

---

## 1. What shipped, by group

**Settle-debounce.** Invariant IV's second clock exists: `IDLE_SETTLE_DELAY_MS = 1000` in
`MarkerEditPlugin`, armed on every non-suppressed commit and at the gesture reset points,
firing the SAME settle computation as caret departure (shared `settlePendingNow` helper, so
the clocks cannot drift) with no except-key — an idle caret-held pend settles. One deliberate
deviation from the plan, correct on review: the timer RESPECTS the undo/scrRef-yank
suppression window (firing inside it would re-settle a just-undone literal ~1s later); two
tests pin the window's behavior. No IME guard — investigated, not constructible faithfully in
jsdom, and a timer-only guard would itself be clock divergence; recorded at the call site.

**Palette-menus.** All three defects fixed. Space over a non-collapsed selection now wraps
(closed span, overlay dismissed; marker = exact match of the typed text, taking the ACTION
from the defect row and the MARKER from Space's own "whatever was typed" row — they diverge
only on a near-miss). The zero-candidate commit dismisses through Escape's teardown instead of
orphaning the overlay (root cause: `useMenuCore.select()` returned early on an empty list, so
the close callback never ran). The book/header region reports paragraph source — a one-line
`source` fix; the item list was already right via an existing fallback, so the fix pins the
context/list equivalence. Discovery worth knowing: Space wasn't "dismissing" before — the
uncontrolled menu's query capture swallowed it as a filter character; the §4 table's Space row
was implemented only in the legacy typeahead.

**Split-and-stack.** The Enter-menu split rides `$splitParagraphAtCharStack` with the
ratified caret point (inside the innermost reopened span) — retagging via `setMarker` +
`$injectMarkerPrefix` rather than the helper whose caret re-park would have overridden it.
The unwrap's reinsert-AFTER ordering got a mutation-verified pin. Outer-boundary range
Ctrl+Space: the child-index structure had already landed with char-stack (plan drift — the
handoff's §3 predated its own §6a); the REAL defect was one leaked separator byte from
Lexical's stale-instance `setTextContent` short-circuit, fixed by shedding on
`getLatest()`. Also took two routed items: made the flaky caret test deterministic (asserts
committed state), and fixed the whitespace-only wrap (`$moveLeadingSpaceToPreviousNode`
declines when the space is the node's entire content).

**Whitespace-paste-tests.** NBSP-carrying multi-line paste now replays line-by-line through
INSERT_PARAGRAPH_COMMAND — no more literal `\n` bytes, and pastes into char stacks
close-and-reopen per line for free (the handler turned out to live in platform, not
shared-react as planned). Table ROW and cell separators both gained the tagged token shape
(the plan named the cell and assumed the row was right; both were wrong). Test debts: the
paragraph-end Ctrl+Space pin moved to the full harness and was born green (composition had
fixed it); the whitespace-only wrap pin was born red, parked with the diagnosed cause, and is
now UN-SKIPPED green against split-and-stack's fix; the milestone attribute-order pin came
out green at the settle but revealed the order is lost at LOAD (see §4).

**Host-collab.** The unknown-attribute passthrough now covers all seven embed kinds through
one `$assignUnknownAttributes` helper (the emit side wrote three of the seven the receive
side accepted; the forward pin un-skipped red-then-green exactly as its comment predicted).
paranext-core gained the collab `closed="false"` end-to-end pin — born green, strengthened
against vacuity: `\fr`/`\ft` closers are optional so their absence proves nothing; the
decisive pin is `\nd` (required closer) with an unflagged control — and the round-trip warn
is now a tested detector (`usj-content-divergence.util.ts`, extracted from the existing
private comparison, 15 direct tests, same warning text).

**Glyph-kinds-audit.** The audit found all three machine-drift heal cells EMPTY — drift on
an opener, closer, or para-prefix glyph was misattributed as a user edit and settled INTO
the document (e.g. `\nd`→`\n` auto-renamed the span on the next departure). All three heal
in place now through one provenance-gated branch atop `$markerNodeTransform` (pend-ledger +
caret-at-edit-time provenance, surviving undo via the re-pend walk), with
`$restoreCanonicalMarkerText` living beside `MarkerNode`'s one `__text` writer. Run glyphs
(`\va*`, milestone `\*`) get the same in-place drift heal. The optbreak scanner was
classifying BACKWARDS on both sides and now derives its piece from rendered bytes; the char
anchor stays state-classified per settle-loop §3's reasoning, now pinned explicitly. The
invariants-doc corrections landed (stale fence removed; registry note now says ELEVEN kinds
— the backlog's "ten" undercounted; §7c load-leg question marked settled; the
chapter/verse whitespace-skip asymmetry recorded).

**Tier1-deletion.** The two verse rest-extraction arms share one helper (the predicted red
never materialized — Lexical normalization already merged the fresh node — so this is a
make-it-explicit refactor with a pin). The fabricated-space question is CLOSED: pinned moot,
byte-for-byte (structural-caret work item B done). Enter-Enter-then-backspace dissolution
landed via a second provenance set (`collapsedDeleteCaretParas`); the transient-emptiness
guards never moved. Leading attributes are now map-derived (`leadingAttributeNames` vendored
into shared, verse/chapter byte-identical through the generalized path), which genuinely
fixed `\f`: a diverged expanded-note caller was previously unreachable by ANY settle and
leaked caller text into note content; `\id` deliberately unchanged (uneditable decorator,
literal-only by policy, pinned with rationale).

## 2. Verification — the follow-up gate

All on the MERGED `sv/residual-backlog`, after all seven merges plus the un-skip:

- **scripture-editors:** `nx run-many -t test` green across 9 projects
  (`--skip-nx-cache`); a quiet-machine platform rerun confirms **68 files / 1201 passed /
  0 failed / 0 skipped**; shared 524; shared-react 1536 passed / **1 skipped** (down from
  2 — the unknown-attributes pin is live; the table-OT pin remains, deliberately);
  utilities 51. `lint typecheck`: 10 projects, 0 errors.
- **paranext-core:** full `npm test` exit 0 on a quiet machine — including the
  footnote-editor palette-commit test (see §4); `typecheck` exit 0; `lint` exit 0;
  `dotnet test c-sharp-tests/` 1652 passed / 0 failed / 6 pre-existing `[Ignore]`s.
- One flake note, consistent with the repo's known class: a platform run executed WHILE
  core's suite saturated the machine showed 5 load-induced failures; the identical tree
  passes 1201/1201 quiet. Attribute nothing to a loaded run.

**Follow-up skip-list audit:** platform 0 skips; shared-react exactly 1 — the table-OT
forward pin, documented, owned by the Coordinates item in the very-low bucket. No orphans.

## 3. Merge account

Seven merges, ONE textual conflict total (a comment-adjacency in `MarkerEditPlugin.tsx`'s
KEY_DOWN handler where settle-debounce's timer arm sits beside tier1-deletion's new
collapsed-deletion arm; both kept). The cross-group routing worked as designed: group 4's
diagnosed wrap defect was fixed by group 3 mid-flight, and the integration chat un-skipped
group 4's parked pin after verifying the fix satisfies it (37/37 in the file). No merge
resolution needed correcting.

## 4. What this round surfaced (new information, routed in the follow-up backlog)

- **The debounce clock has no palette-open signal to respect.** An idle palette session (or
  a cross-frame palette click plus one idle period) can settle the typed trigger literal
  under the open palette, after which an apply would insert without consuming it. Needs a
  host-declared palette-session signal (`setTransientInput` wiring is the natural shape) and
  TJ's call — BEFORE the debounce reaches a palette-bearing host.
- **Milestone attribute order is lost at LOAD, not in the fold**: `createMilestone`
  normalizes to sid-first, so no authored order survives for the settle to preserve.
  Restoring it means an ordered attribute map on `MilestoneNode`. Recorded for TJ.
- **The host-side empty-palette orphan exists too** (core's cmdk menu: Enter on an empty
  filtered list does nothing, popover stays). Same rationale as the editor-side fix.
- **The footnote-editor `[fr,ft,fp,ft]` failure did not reproduce** on the final merged
  editor on a quiet machine (core's full suite is green). Group 5 measured it against the
  pre-merge base under load with a bisect. Treat as watch-item, not defect: if it recurs,
  the suspects are the fp-break path under the group-5-era editor build or load-order
  test pollution.
- **Lexical stale-instance `setTextContent` short-circuit** — a general hazard class for
  transforms holding node references across cloning mutations; one measured instance fixed;
  the whitespace transforms are the likeliest other habitat.
- **Nx sync drift**: platform/scribe `tsconfig.lib.json` carry references Nx wants to
  remove; group gates ran `--skip-sync`. Resolve once, deliberately.
- New shared test idioms: `$retypeGlyph` / `$pendGlyphEdit` (markerEdit.test-helpers) — a
  caret-less `setTextContent` on a glyph now means MACHINE drift and heals; test drives
  must say which provenance they mean. Seven files were converted; future tests should use
  the helpers.
