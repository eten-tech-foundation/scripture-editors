# Standard view: track execution, ordering, and handoff

How to run the six tracks, what may run in parallel, and how the branches converge.

## Branch model

Base for everything: **`standard-view`** in each repo. The end state is one branch per repo
containing all the work.

Two things land on the base BEFORE the parallel phase: the planning nets, and the settle-loop fix.
They travel together in a single merge.

```
standard-view-planning ──> sv/settle-loop ──┐
                                            ├──> merge to standard-view ──┐
     (invariants doc + corpus nets)  ───────┘                             │
                                                                          v
                             ┌── sv/whitespace ────────┐
                             ├── sv/char-stack ────────┤
                             ├── sv/structural-caret ──┼──> sv/integration ──> PR
                             ├── sv/attribute-markers ─┤
                             └── sv/unknown-blocks ────┘

paranext-core/standard-view ──┬── sv/core-capture-tests ┐
                              └── sv/core-followups ────┴──> sv/integration ──> PR
```

## Phase 1 — settle-loop-safety, alone (SERIAL, blocks everything)

Branch `sv/settle-loop` off **`standard-view-planning`**, not off `standard-view` — it needs the
invariants doc, its own plan, and the corpus nets, all of which live there.

Why this goes first rather than last:

- It is the only defect that **freezes the app**, from two keystrokes. No track should inherit a base
  where that is true.
- It changes **run-piece classification for all eight registered kinds** — the highest blast radius
  in the set. Landing it in the base means the four parallel tracks branch from a state that already
  has it, instead of each merging across it afterward.
- It **dissolves the grace collision** with the whitespace track rather than managing it. Both
  rewrite how grace is decided across `$caretHoldsRunSite` and its six call sites; sequencing removes
  the conflict instead of coordinating it.

## Phase 2 — the merge (SERIAL)

Merge `sv/settle-loop` into `standard-view-planning`, then `standard-view-planning` into
`standard-view`. One event, carrying:

- the invariants doc and shared vocabulary,
- the transform fixed-point suite and the testUSFM corpus editor legs,
- the skip-list entries naming mechanism and owner,
- the settle-loop fix.

Every remaining track branches after this, so all of them inherit the nets, the vocabulary, and the
freeze fix.

## Phase 3 — the parallel phase

| Group | Tracks | Notes |
| --- | --- | --- |
| **A (fully parallel)** | whitespace · char-stack · unknown-blocks · attribute-markers Stage 0 | Disjoint primary files; remaining collisions are listed below |
| **B (parallel, slight lag)** | structural-deletion-and-caret | Start once char-stack has claimed its half of bug 1, so the shared test has one owner |

With settle-loop already in the base, the whitespace track's provenance-grace work has no competitor
and Group A is genuinely concurrent.

## Known collisions

| Files | Between | Resolution |
| --- | --- | --- |
| `markerEditDeletion.utils.ts` (para-prefix absorb) | whitespace ↔ closers/char-stack | Whitespace hands the absorb half over, or they agree a split before starting |
| `markerEditTier1.utils.ts` | whitespace ↔ char-stack | Split by function |
| `$caretHoldsRunSite` + 6 call sites | whitespace (provenance grace) ↔ settle-loop (piece classification) | **Resolved by phasing.** Settle-loop lands in the base first, so whitespace builds on the new classification rather than racing it. Whitespace must re-read that code after phase 2 |
| bug 1 repro | char-stack (content) ↔ structural-caret (caret) | One shared test; agree who writes it |
| `\ca*` damaged closer | settle-loop ↔ attribute-markers | Only if chapters gain display first |

## The chat prompts

Each track gets its own chat. Every prompt should open with this preamble:

> Workspace: create a git worktree off `standard-view` in
> `~/source/repos/workspaces/<track>/scripture-editors` (and `.../paranext-core` if the track touches
> core). Never commit to `standard-view` directly.
>
> Read FIRST, in full: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`, then your
> track plan named below. The invariants doc governs; where your plan and it disagree, the invariants
> doc wins and you flag the discrepancy.
>
> Conventions: TDD red-then-green per behavior. Foreground test runs only. The corpus suites must
> stay at full count with zero NEW skips. Lint and typecheck clean in both root and nx contexts
> (`env -u _VOLTA_TOOL_RECURSION` prefixes pnpm/nx). Comments stand on their own — no plan-task or
> ticket breadcrumbs. Commit messages end with the repo's `Co-Authored-By` convention.
>
> **Approval gate — C# serialization.** Do not change C# serialization code without discussing it
> with the repo owner first. If you find a defect in the USJ/USFM or USX/USFM conversion paths that
> lives in C#, stop before editing and bring the owner the problem and your proposed solution
> together, then wait for a decision. Capture tests that RECORD ParatextData's behavior are
> encouraged and are not covered by this gate — the gate is on changing serialization behavior.
>
> Do not implement before presenting your reading of the plan and getting sign-off. If the plan is
> wrong about the code, say so and stop — several of its claims were already corrected once.
>
> Deliverable at the end: a handoff note at `docs/superpowers/specs/<date>-<track>-handoff.md`
> recording what changed, what you verified, what you deliberately did not do, and what a human
> should manually test.

Then the per-track line:

**Phase 1, run this one alone and first:**

1. **settle-loop-safety** — plan `docs/superpowers/plans/2026-08-14-settle-loop-safety.md`. Branch off
   `standard-view-planning`. Highest severity and highest blast radius. Land task 3 (piece
   classification by rendered bytes) before task 4 (the loop guard) — the guard is a backstop and can
   mask the real defect if it goes first.

**Phase 3, after the merge — branch these off the updated `standard-view`:**

2. **whitespace** — plan `docs/superpowers/plans/2026-08-11-whitespace-ownership.md`. Start with
   tasks 1-3 (the USX parser); they are independent of everything else. Re-read
   `$caretHoldsRunSite` and its call sites first — settle-loop changed that code in phase 1.
3. **char-stack** — plan `docs/superpowers/plans/2026-08-11-char-stack-split.md`. This is an
   EXTRACTION of working code, not a new build; characterize the reference implementation first.
4. **structural-deletion-and-caret** — plan
   `docs/superpowers/plans/2026-08-14-structural-deletion-and-caret.md`. Write the
   transient-emptiness pin before touching the guard. Coordinate the bug-1 shared test with
   char-stack.
5. **attribute-markers** — plan `docs/superpowers/plans/2026-08-11-attribute-markers.md`. Stage 0 is
   startable immediately and is mostly in paranext-core; the display stages need the chapter settle
   scope.
6. **unknown-blocks** — plan `docs/superpowers/plans/2026-08-11-unknown-blocks.md`. Diagnose before
   designing; three of its four defects have no root cause yet.
7. **marker-resolution** — plan `docs/superpowers/plans/2026-08-15-marker-resolution.md`. Added after
   the first Phase 3 worktrees were cut, so it needs its own. This is the original list's LARGEST
   cluster: closer edit timing, closer matching, and typed-marker resolution timing. It shares
   `markerEditTier1.utils.ts` AND `markerEditDeletion.utils.ts` with whitespace — agree the split
   before either starts.

## Handoff and integration

The final chat does not write features. Its job:

1. Merge each track branch into `sv/integration` per repo, resolving conflicts with the invariants
   doc as the tiebreaker.
2. Run the full gate in both repos — all suites, lint, typecheck, and the C# tests.
3. **Confirm every skip-list entry is either deleted or still has a named owner.** An orphaned skip
   is a regression that was normalized.
4. Read the six handoff notes and produce ONE summary: what changed, what is verified, what is
   deliberately deferred, and a manual-test script for the human.
5. Flag anything two tracks changed in incompatible ways that the merge resolved silently.

Give the final chat every handoff note plus the invariants doc, and tell it explicitly that its
deliverable is the summary and the manual-test script — not more code.

## What to manually test at the end

Seeded from the reported bugs, so the final chat can extend rather than invent:

- Enter twice mid-span, with and without attributes, and mid-nested-span — content re-wrapped, caret
  at the start of the new paragraph.
- Delete the `*` from `\va*`, then arrow down into the next verse — must not freeze.
- Select and delete a whole paragraph including its marker — paragraph gone, no `\p` on disk.
- Escape with the passive palette open — caret survives.
- Ctrl+Space mid-word inside `\wj \+nd …` — space unstyled, stack reopened in order.
- Delete the space after `\nd` — marker renames; before `\wj` or `|` — heals back; before `*` — becomes
  a closer.
- A note containing `\cat` with a trailing space — round-trips to disk unchanged.
- Type `\tr ` mid-paragraph, and `\fig ` with attributes — no content loss.