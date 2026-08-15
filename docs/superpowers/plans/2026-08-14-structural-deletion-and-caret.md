# Structural deletion and caret placement

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first — this track
serves Invariant I's no-silent-no-ops rule and Invariant II.

## Goal

Three defects that share a theme: the editor accepts a structural edit or a caret placement and then
quietly fails to honour it.

## The defects

### 1. Deleting a whole paragraph leaves an empty line and the marker in the file

Select every character in `\p stuff` including the visible marker and delete. The paragraph is not
removed, an empty line remains, and `\p` stays on disk.

**Cause, precisely located:** `$paraMarkerDeletionTransform` returns early when the paragraph is
empty, and that return sits BEFORE both the merge-into-previous branch and the reset-to-`\p`
fallback. Its own comment names this input — "a select-all-delete" — as the case it deliberately
skips, because the guard exists to protect TRANSIENT emptiness during rebuilds and cannot tell that
apart from a user's completed delete. The paragraph keeps `marker === "p"` in state with no visible
prefix, so it serializes as `\p`.

`ParaMarkerPrefixGuardPlugin` cannot help on two counts: it is disabled in editable marker mode, and
its only action is a marker RESET, never a removal. No other empty-paragraph reaper exists.

**The shape of the fix already exists elsewhere.** The display-run registry gives milestones and
optbreaks `deletionPolicy: "remove-owner"`, under the rule *"the display run is this owner's ENTIRE
visible byte representation, so deleting all of it deletes the owner."* `ParaNode` has no equivalent.
This track gives it one, or supplies an equivalent deletion-command-level signal. **A bare relaxation
of the empty guard would break the transient-emptiness cases the comment protects** — the fix must
distinguish provenance, not just state.

### 2. An element-point caret is dragged to the end of the paragraph

Enter, Enter mid-span, then the caret lands at the END of the new paragraph instead of where it was.
This is the third symptom of the char-stack track's bug 1, but a separate cause and a separate owner.

**Cause:** the Enter-menu apply places an ELEMENT point on the paragraph via `$placeCaretAtBoundary`,
which only produces a text point when the child at that index is a TextNode. When a same-commit
unwrap then reinserts children before removing the wrapper, Lexical advances any element point whose
offset is at or past the insertion index — but does not pull it back on the matching remove. The point
walks past every reinserted child and normalizes to the end.

This is general: **any element-point caret placement that survives a same-commit structural edit is
exposed.** It is not char-stack-specific, which is why it lives here.

Related and probably the same family: the owner reports Enter-Enter-then-backspace to delete a
paragraph marker also sends the caret to the paragraph end instead of back to where it was.

### 3. Escape makes the caret disappear

Pressing Escape while focused in the editor removes the caret — so dismissing the passive marker
palette with Escape costs the user their cursor.

**Not yet diagnosed.** Escape is claimed in the palette-session forwarding table, and the editor also
has app-wide overlay-dismiss handling on Escape. Establish which layer clears the selection before
designing; do not assume it is the palette.

### 4. A typed character lands with the caret before it, not after

With `\v 2 Da` and the caret between `2` and the following space, typing `\` leaves the caret BEFORE
the backslash rather than after it, so the next keystroke lands on the wrong side. Same with the caret
between the verse glyph and the first space.

The other half of that repro — a fabricated space appearing before the typed character — is the
whitespace track's (its task 14). **This track owns only the caret position.** Coordinate the shared
test with that chat rather than each writing one.

Worth checking against defect 2 before designing: both are "a caret placement that does not survive
what the commit does around it," and they may share a fix. If they do not, say so explicitly — the
verse-adjacent case may be a plain off-by-one at the insertion point rather than a point-drag.

## Scope

**In:** paragraph deletion semantics; element-point caret survival across same-commit structural
edits; the Escape caret loss.

**Out:** the char-stack close/reopen primitive (its own track — this track fixes only bug 1's caret
symptom, not its content symptoms); the display-run registry's piece classification (settle-loop
track).

## TDD tasks

1. **Red:** delete a paragraph's entire visible representation; assert the paragraph is removed and
   no marker survives to the serialized output.
2. **Red:** assert the transient-emptiness cases the current guard protects still work — a rebuild
   that empties a paragraph before refilling it must NOT reap it. Write this before task 3; it is the
   behavior most at risk.
3. **Green:** a provenance-bearing "the user deleted this owner's entire visible representation"
   signal for paragraphs, modelled on the registry's `remove-owner` deletion policy.
4. **Red:** an element-point caret placed on a paragraph survives a same-commit unwrap that
   reinserts children — assert the resulting point, not merely that "a selection exists".
5. **Green:** either place a text point where one is possible, or re-resolve the point after the
   structural edit. Prefer whichever keeps `$placeCaretAtBoundary` a single convention rather than
   adding a caller-side workaround.
6. **Diagnose then fix Escape.** Instrument which handler clears the selection; the fix follows the
   diagnosis.
7. **Regression:** the visible-stop arrow normalizer and shift-extend behavior that landed recently
   must stay green — this track edits caret code adjacent to it.

## Acceptance

- Deleting a paragraph's whole visible representation removes it, and transient emptiness still
  survives.
- Element-point carets survive same-commit structural edits, pinned by assertion on the resulting
  point.
- Escape dismisses without costing the caret.
- Corpus suites at full count; lint and typecheck clean in both contexts.

## Risks

- **Task 2 is the load-bearing pin.** The empty-paragraph guard exists for a reason and the comment
  says so. Removing it without first pinning what it protects is the most likely way this track
  causes a regression.
- **Caret code recently changed a lot** — a visible-stop normalizer replaced the per-shape arrow
  hops, plus shift-extend and atom-crossing work. Rebase before starting and re-read that code; the
  element-point defect may interact with it.
- Coordinates with the char-stack track on bug 1: that track owns the content symptoms, this one owns
  the caret symptom. Same repro, two owners — agree who writes the shared test.