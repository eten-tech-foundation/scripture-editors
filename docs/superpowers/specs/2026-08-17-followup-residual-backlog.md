# Residual backlog after the follow-up round

What remains open after the seven implementation groups merged into `sv/residual-backlog`.
Supersedes `2026-08-17-residual-backlog.md` (every low-to-high item there either shipped or
is re-listed here with its new state). Ordering is rough priority within sections.

---

## 1. Needs TJ's decision (new this round)

1. **Palette-session signal for the debounce clock.** The idle settle (1000 ms) cannot see
   an open palette — palette state is host-local React state, sometimes cross-frame. An
   idle palette session can settle the typed trigger literal underneath; a subsequent apply
   would then insert without consuming the literal (`$removeLiteralTriggerPrefix` refuses
   glyphs). Natural shape: a host-declared palette-session signal wired into the engine's
   suppression (the `setTransientInput` machinery). Decide before the debounce ships in a
   palette-bearing host. Until then the exposure is: palette open + 1 s idle + commit.
2. **Milestone attribute order needs an ordered attribute map on `MilestoneNode`.** The
   settle preserves order (pinned), but `createMilestone` normalizes to sid-first at LOAD,
   so authored non-canonical order is already gone before any edit. Fixing it is a node
   schema change (both adaptors + fixtures). Is byte-fidelity for non-canonical milestone
   attribute order worth that? (ParatextData's own behavior worth capturing first.)
3. **The debounce delay value.** 1000 ms shipped as the PT9-style default, exported as
   `IDLE_SETTLE_DELAY_MS`. Confirm against real PT9 feel in the manual pass.

## 2. Carried decisions from the integration round (unchanged, still TJ's)

- Adjacent same-marker char spans stay TWO USJ objects (recommended: accept).
- `\tr` glyph column layout; empty-`\ca` root char rendering; Enter-mid-span caret feel —
  manual-script items 33, 29, 15.
- Drag-MOVE out of an opaque block (recommended: accept the gap).
- The `\ca` newline-vs-same-line churn note (capture-resolved; review as
  serialization-adjacent).

## 3. Deferred work — the very-low bucket (unchanged scope, one addition each)

- **Coordinates / Invariant II proper** — one position language; OT apply vs delta-doc;
  the table OT embed representation (now the workspace's ONLY remaining `it.skip`);
  Tier-2 caret-restore byte-offset fallback. Needs a design phase. NEW datapoint: the
  unknown-attribute passthrough closed the other collab-wire gap, so this cluster is now
  purely positional/structural.
- **Table settle story** — `\tr` glyph deletion still does not rejoin; cells read-only.
  Product decision first.
- **Cross-block `\cp` fold-back** — needs a cross-block rebuild scope.
- **`$signatureOf` post-splice blind spot** — direction still open
  (compare-post-transform vs normalizing signature); backstop bounds it loudly.
- **Internal (`application/x-lexical-editor`) multi-paragraph paste mid-span** — still
  tears; needs node-preserving replay design.
- **`\periph` tokenizer branch** — capture ParatextData first.
- **`\fig` "not fully formed" affordance** — validation family, separate product design.
- **Host-side empty-palette orphan** (NEW): core's cmdk marker menu keeps its popover open
  on Enter-with-zero-candidates; the editor-side fix's rationale applies verbatim; the
  web-view guards only the open, not filtering-to-empty. Small, host-owned.
- **Scribe** — unchanged: no unmatched editing, no `cat`, no opaque guard; port nothing
  piecemeal.

## 4. Watch items (no action unless they recur)

- **`footnote-editor.palette-commit.test.tsx` `[fr,ft,fp,ft]`** — failed for group 5
  against the pre-merge base under load (bisect-verified independent of their change);
  does NOT reproduce on the final merged editor on a quiet machine. If it recurs: suspects
  are the in-note `\fp` break path and test-order pollution in `platform-bible-react`.
- **Load-sensitive suites**: `platform-bible-react`'s browser project and the platform
  editor suite both produce spurious failures at load average >80 (measured twice this
  round). Full-repo gates want a quiet machine; rerun failing files in isolation before
  attributing.
- **Nx tsconfig sync drift** (platform/scribe `tsconfig.lib.json` references): gates ran
  `--skip-sync`; resolve once deliberately, repo-wide.

## 5. Cheap follow-ons (worth batching into any nearby PR)

- Wire the whitespace transforms' node handling past the Lexical stale-instance
  `setTextContent` hazard (one instance fixed in charFormatting; the transforms hold node
  references in the same shape). Audit `TextSpacingPlugin.tsx` for `setTextContent` on
  possibly-stale references; write one pin per site touched.
- The pre-existing tracker-ref test name (`FB 21054`) in the palette tests — rename next
  time that file is edited (repo rule: no tracker refs).
- `2026-08-17-residual-backlog.md` §7's remaining doc correction: the recommendations doc
  and backlog now both undercount the registry (eleven kinds); the invariants doc is
  already corrected — sweep the other two docs if they are ever revised.
