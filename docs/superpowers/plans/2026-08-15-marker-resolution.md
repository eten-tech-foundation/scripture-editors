# Marker resolution: timing and matching

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first.

This track supersedes the **Closers** row in the invariants doc's ownership table and widens it. The
row named the files; this names the behavior.

## Goal

Two questions the engine currently answers wrongly, and which turn out to be the same question:

1. **WHEN does a typed or edited marker resolve?** Today several paths resolve immediately, before the
   user has finished typing or while they are still editing a glyph. The result is a half-typed
   marker settling into something the user never asked for, usually unrecoverable by continuing to
   type.
2. **WHAT does a closer match?** Today an unmatched closer stays unmatched even when the document
   plainly supplies its opener, and a matched closer can be knocked loose by an edit that should have
   renamed it.

Both are marker RESOLUTION. Grouping them is the point of this track: fixing matching without fixing
timing produces markers that match correctly but at the wrong moment, and vice versa.

## Defects

### Group 1 — resolution timing

- **Editing a closer resolves instantly**: it changes, the caret jumps past it, and it becomes
  unmatched, at which point it can no longer be edited. Opening-glyph edits pend and settle on caret
  departure; closer edits do not. The owner's framing: *"should this be a tier-2 edit so it lets you
  edit it for a bit and then settles later?"* — yes.
- **Typing a marker resolves before the user finishes.** With the caret between the space and the `D`
  in `\v 2 Da`, typing `\va` resolves at `\v`: it settles into a red unknown `\vDa` on its own line,
  and the next keystroke degrades it further to `\p \v aDa`. Expected: `\v 2 \va Da` on Space, or
  `\v 2 \va \va* Da` on Enter. The engine committed to an interpretation two keystrokes early and
  could not revise it.
- **Typing at the end of a closer keeps the style** — the caret is outside the span but inherits it.

### Group 2 — matching

- **An unmatched closer inside a span's content should become that span's closer.** Repro: copy
  `\nd fruit\nd*`, paste, and the paste yields `\nd~fruit\nd*` (a tilde where the separator belongs),
  leaving `\nd*` unmatched. Deleting the tilde and typing a real space does NOT re-match it.

  **The rule the owner wants:** the FIRST unmatched closer inside an open span of the same marker
  becomes that span's closer; later ones stay unmatched. So `\nd asdf \nd* fdsa \nd*` resolves with
  the first `\nd*` matching and the second unmatched.

  Note this is a re-matching rule, not just an initial-parse rule — the document changed underneath
  an already-classified closer and nothing re-ran the classification.
- **Renaming a NESTED opening glyph unmatches its closer** instead of renaming it. Non-nested opener
  renames propagate correctly; the `+`-nested path does not.
- **Deleting an unmatched nested closer that follows a proper nested closer deletes everything inside
  the enclosing span.** The enclosing span had no closer of its own; the inner span was a `\w` with a
  default attribute.

### Group 3 — editor/file divergence on closer edits

Three reports, all the same shape: a closer edit leaves the screen and the file disagreeing.

- Editing a closer on a span **with attributes** removes the attributes from the file but leaves them
  on screen.
- Editing a closer and then typing a **new closer before it** removes the old closer from the screen
  but not from the file.
- **Deleting a closer that has trailing content** does not move that content into the now-open span,
  but the file round-trip does — because nothing closes the span there. This is the mechanism behind
  the reported log storms: the round-trip warn fires because the editor's structural model and the
  tokenizer's disagree.

## Why unmatched closers are hard today

`ImmutableUnmatchedNode` is a **DecoratorNode**. Decorators have no editable text by construction, so
an unmatched closer cannot be edited in place — only deleted. That is the root of "can't edit it
anymore," and it is also why inserting one moves the caret unexpectedly.

Under Invariant I (displayed bytes are the document) an unmatched closer should be ordinary editable
text that happens to re-tokenize to nothing yet. Making it text is likely a prerequisite for Group 1's
closer-edit pend, not a separate nicety.

## Scope

**In:** closer edit timing and pend/settle; typed-marker resolution timing; closer matching and
re-matching; the unmatched-closer representation; the three divergence reports.

**Out:** the close/reopen primitive (char-stack track — that is about splitting a stack, not about
what a closer matches); whitespace and separators; the display-run registry's piece classification,
which the settle-loop track already changed.

## TDD tasks

Diagnosis first for anything below marked undiagnosed — several of these have a reported symptom and
no verified mechanism.

1. **Red:** editing a closer glyph pends rather than resolving immediately; the caret stays where the
   user put it; the glyph remains editable across several keystrokes; it settles on caret departure.
2. **Red:** an unmatched closer is editable text, not a decorator. Expect this to touch the tokenizer
   output, node registration, collab, and caret behavior — size it before starting.
3. **Red:** the first unmatched closer inside an open span of the same marker becomes that span's
   closer; later ones stay unmatched. Cover both the initial parse and the RE-match after an edit
   changes the document under an already-classified closer.
4. **Red:** typing `\va` with the caret mid-text after a verse yields `\va` and not a resolved `\v`.
   **Undiagnosed** — establish why `\v` resolves at all here, given the terminated-marker trigger
   requires a space or `*`. The paragraph split in the observed output suggests a block-context
   misclassification as well; separate the two before designing.
5. **Red:** a nested opener rename renames its nested closer.
6. **Red:** deleting an unmatched nested closer removes only itself.
7. **Red:** each of the three divergence reports — assert the editor's USJ and the file agree after
   the edit. The deleted-closer-with-trailing-content case should assert the trailing content lands
   inside the now-open span, matching what the tokenizer does.
8. **Red:** typing at the end of a closer produces unstyled text.
9. **Regression:** the corpus suites and the transform fixed-point suite stay green throughout.

## Acceptance

- Closer edits behave like opener edits: pend, remain editable, settle on departure.
- Typed markers do not resolve before the user has supplied a terminator.
- Matching follows the first-unmatched-closer-inside-an-open-span rule, on parse and on re-parse.
- No repro leaves the editor and the file disagreeing.
- Corpus suites at full count; lint and typecheck clean in both contexts.

## Risks

- **This track shares `markerEditTier1.utils.ts` with the whitespace track**, and
  `markerEditDeletion.utils.ts` with it as well — the whitespace track's separator-absorb work lives
  in the para-prefix heal there. Agree a split before either starts.
- **Task 2 is the big one.** Turning a decorator into editable text is a representation change with
  collab and caret consequences. If it proves larger than the rest of the track combined, land tasks
  1 and 3 first and re-scope.
- **Task 4 may not be this track's bug.** If the diagnosis shows a block-versus-inline context
  misclassification rather than a timing defect, it may belong with the palette/apply context work
  instead. Decide after diagnosis, not before.
- Settle-loop changed run-piece classification for all eight registered kinds. Re-read that code
  before touching closer glyph handling — a closer glyph IS a run piece for several kinds.