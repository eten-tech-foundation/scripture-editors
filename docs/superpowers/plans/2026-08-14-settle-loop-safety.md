# Settle-loop safety

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first.

**Severity: this is the only track whose bug freezes the application.** Two keystrokes reach it.

## The bug

Delete the `*` from a `\va*` closing glyph, then move the caret down into `\v 2`. The editor spins
forever, logging `[MarkerValidation] pass: 0 flagged`, and the app becomes unusable.

`MarkerValidationPlugin` is the **witness, not the cause**. Its pass is strictly read-only and it
logs once per commit that has dirty nodes, so sustained spam means commits are cycling. `0 flagged`
is itself informative: document validation keys on node MARKERS, never on glyph TEXT, so a damaged
glyph is invisible to it.

## Mechanism

Four independent facts combine. Each is defensible alone; together they are a loop.

1. **The pend cannot settle.** Deleting the `*` leaves a `MarkerNode` whose `markerSyntax` is still
   `"closing"` and whose marker is still `va`, but whose text is `\va`. The marker transform's closer
   branch sees text not ending in `*` and re-pends it. There is no in-transform resolution for that
   shape, so every commit re-pends.

2. **The display-run registry cannot see the damage.** Run pieces are identified by NODE STATE —
   `markerSyntax === "closing"` and a matching marker — never by rendered bytes. So `scanPieces`
   still reports a complete run, `$runDiverges` returns false, the sync neither heals nor rewrites
   the glyph, and the grace pre-pass never fires. **The registry considers the run canonical while
   the marker engine considers the glyph pending.** That standing disagreement is the core defect.

3. **Caret departure routes the pend to a whole-paragraph re-tokenize**, and the fragment builder
   emits the marker's LITERAL text — so the tokenizer receives a `\va` opener where a closer belongs
   and produces a genuinely different structure. Because the structure differs, the fixed-point
   refusal does not fire and the splice happens.

4. **There is no cross-commit loop guard.** The only repeat suppression, `rebuildAttempted`, is
   cleared by the update listener after every commit. The engine's own termination argument rests
   entirely on the fixed-point refusal — which fact 3 bypasses whenever each rebuild yields different
   structure.

Facts 1, 2 and 4 are read directly off the code. Fact 3's specific tokenizer output — and therefore
that the oscillation is A-to-B-to-A rather than unbounded growth — is inference; it was not executed.
What is certain is that the fixed-point refusal is the ONLY thing between this pend and an unbounded
resolve-rebuild-repend cascade, and that a damaged closer glyph is invisible to every guard except
the one that only ever re-pends it.

## Scope

**In:** classifying run pieces by rendered bytes as well as node state; a cross-commit
rebuild-oscillation guard; the specific `\va*` repro and its siblings (`\vp*`, `\ca*`, char closers,
milestone closers).

**Out:** the whitespace transforms; the char-stack primitive; anything that merely reduces logging.
Silencing the log would hide the freeze, not fix it.

## TDD tasks

1. **Red, headless:** reproduce the loop without a UI — build the damaged-closer state, dispatch a
   caret departure, and assert the update count stabilizes. A test that hangs is not a useful
   failure, so bound it: assert a maximum number of commits, not merely eventual quiescence.
2. **Red:** assert the registry NOTICES a damaged closer glyph — `$runDiverges` must be true when the
   glyph's rendered bytes are not canonical, even though node state is intact.
3. **Green, piece classification:** run-piece identity considers rendered bytes, not node state
   alone. This is the root fix; expect it to make the pend settleable because the sync can now heal
   or rewrite the glyph.
4. **Green, loop guard:** a cross-commit guard so that a scope which rebuilds to a DIFFERENT structure
   repeatedly cannot cycle forever. The existing per-commit `rebuildAttempted` is the wrong lifetime;
   this needs a bounded oscillation detector that survives commits and gives up rather than spins.
   **Failing safe means leaving the document unsettled with a warning, never freezing.**
5. **Sweep the siblings:** the same damage on `\vp*`, `\ca*` once chapters display, a char span's
   closer, and a milestone's closer. Each is the same shape — node state intact, bytes damaged.
6. **Regression:** the whole corpus stays green, and the transform fixed-point suite stays green.

## Acceptance

- The repro terminates, with the document either settled or explicitly left pending with a warning.
- No test hangs; the loop test asserts a commit bound.
- Damaged glyph bytes are visible to the registry.
- Corpus suites at full count; lint and typecheck clean in both contexts.

## Risks

- **Piece classification is load-bearing for every registered kind** — eight of them. Changing it
  touches `separator`, `char`, `va`, `vp`, `milestone`, `optbreak`, `opaqueUnknown`, and
  `nestedGlyph` at once. This is the highest-blast-radius change in the whole track set; it wants its
  own branch and a full corpus run at each step.
- **A loop guard can mask a real defect.** It is a backstop, not the fix — land task 3 first, and
  make the guard log loudly enough that a masked oscillation is still discoverable.
- Overlaps the attribute-markers track if chapters gain display before this lands; `\ca*` would then
  be a fifth sibling.