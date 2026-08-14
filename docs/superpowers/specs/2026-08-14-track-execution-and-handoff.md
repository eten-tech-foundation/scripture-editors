# Standard view: track execution, ordering, and handoff

How to run the six tracks, what may run in parallel, and how the branches converge.

## Branch model

Base for everything: **`standard-view`** in each repo. Every track branches from it and merges back
into one integration branch per repo, so the end state is one branch per repo containing all the
work.

```
scripture-editors/standard-view ──┬── sv/whitespace ────────┐
                                  ├── sv/char-stack ────────┤
                                  ├── sv/settle-loop ───────┼──> sv/integration ──> PR
                                  ├── sv/structural-caret ──┤
                                  ├── sv/attribute-markers ─┤
                                  └── sv/unknown-blocks ────┘

paranext-core/standard-view ──────┬── sv/core-capture-tests ┐
                                  └── sv/core-followups ────┴──> sv/integration ──> PR
```

Track 0's output is a prerequisite for everyone, so it lands on `standard-view` directly (or is the
first merge into integration) before the others branch.

## Track 0 — land the nets first (SERIAL, blocks everything)

Small, and it is what makes the parallel phase safe. Already written and committed on
`standard-view-planning`:

- the invariants doc,
- the transform fixed-point suite,
- the testUSFM corpus editor legs,
- five skip-list entries naming mechanism and owner.

**Action:** merge `standard-view-planning` into `standard-view` first. Every other track branches
after that, so all six inherit the net and the shared vocabulary.

## Parallel groups

| Group | Tracks | Why they can share a phase |
| --- | --- | --- |
| **A (fully parallel)** | whitespace · char-stack · unknown-blocks · attribute-markers Stage 0 | Disjoint primary files; the known collisions are listed below and are all resolvable by ordering within a track, not between them |
| **B (parallel, but start after A's owners are known)** | structural-deletion-and-caret | Shares the bug-1 repro with char-stack and edits caret code the recent normalizer work touched |
| **C (serialized against A)** | settle-loop-safety | Changes run-piece classification for all eight registered kinds — the highest blast radius in the set |

**Recommended:** run A's four in parallel now, B alongside once char-stack has claimed its half of
bug 1, and C either first-and-alone or last-and-alone. C's blast radius is the deciding factor, not
its difficulty.

## Known collisions

| Files | Between | Resolution |
| --- | --- | --- |
| `markerEditDeletion.utils.ts` (para-prefix absorb) | whitespace ↔ closers/char-stack | Whitespace hands the absorb half over, or they agree a split before starting |
| `markerEditTier1.utils.ts` | whitespace ↔ char-stack | Split by function |
| `$caretHoldsRunSite` + 6 call sites | whitespace (provenance grace) ↔ settle-loop (piece classification) | **Real conflict.** Both rewrite how grace is decided. Sequence them; do not run concurrently |
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
> Do not implement before presenting your reading of the plan and getting sign-off. If the plan is
> wrong about the code, say so and stop — several of its claims were already corrected once.
>
> Deliverable at the end: a handoff note at `docs/superpowers/specs/<date>-<track>-handoff.md`
> recording what changed, what you verified, what you deliberately did not do, and what a human
> should manually test.

Then the per-track line:

1. **whitespace** — plan `docs/superpowers/plans/2026-08-11-whitespace-ownership.md`. Start with
   tasks 1-3 (the USX parser); they are independent of everything and of the moving branch.
2. **char-stack** — plan `docs/superpowers/plans/2026-08-11-char-stack-split.md`. This is an
   EXTRACTION of working code, not a new build; characterize the reference implementation first.
3. **settle-loop-safety** — plan `docs/superpowers/plans/2026-08-14-settle-loop-safety.md`. Highest
   severity and highest blast radius. Do not run concurrently with the whitespace track's grace work.
4. **structural-deletion-and-caret** — plan
   `docs/superpowers/plans/2026-08-14-structural-deletion-and-caret.md`. Write the
   transient-emptiness pin before touching the guard.
5. **attribute-markers** — plan `docs/superpowers/plans/2026-08-11-attribute-markers.md`. Stage 0 is
   startable now and is mostly in paranext-core; the display stages need the chapter settle scope.
6. **unknown-blocks** — plan `docs/superpowers/plans/2026-08-11-unknown-blocks.md`. Diagnose before
   designing; three of its four defects have no root cause yet.

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