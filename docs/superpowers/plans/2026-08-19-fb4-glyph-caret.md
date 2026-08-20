# Feedback: the row glyph's caret crash, and the mid-text `\f ` verdict

Branch `sv/fb4/glyph-caret`. Two items against the Standard-view editor. Governing:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md`. Both landed strict red-green: each
failing test was watched failing on the pre-fix source, for the stated reason, before it passed.

---

## Item 1 — a caret on a table row's `\tr ` glyph threw

`2026-08-18-fb2-table-cp.md` made the row glyph delete-proof. It did not, and could not, stop the
caret from ARRIVING there — and arriving was itself fatal.

### The real mechanism

Not a detached node, and not a selection-derived walk meeting a shape it should tolerate. The tree
was genuinely illegal by Lexical's own rule, and had been since the row grew a glyph.

`LexicalNode.getTopLevelElement()` walks up to the first node whose PARENT is a root or shadow
root, then asserts what it stopped on:

```js
if (!($isElementNode(node) || (node === this && $isDecoratorNode(node))))
  formatDevErrorMessage(`Children of root nodes must be elements or decorators`);
```

`ImmutableTableRowNode` declared `isShadowRoot(): true`. That was written when a row's children were
cells and nothing else — all `ElementNode`s, so the walk always stopped on an element and the claim
cost nothing. The unknown-blocks track then gave the row its own `\tr ` glyph: in editable marker
mode `createTableRow` pushes a `MarkerNode` and an NBSP `TextNode` as DIRECT children of the row.
From that point the walk, started anywhere in those two nodes, stopped on a `TextNode` under a
shadow root and threw.

It throws on **every caret move**, because that walk is the first thing every caret-reactive plugin
does with `selection.anchor.getNode()`:

| Caller | Trigger |
| --- | --- |
| `$findThisChapter` (`node.utils.ts`) | `ScriptureReferencePlugin`'s `SELECTION_CHANGE_COMMAND` → `$resolvePosition` |
| `$getActiveVerseKey`, `$getParaFromSelection` (`ActiveTextPlugin`) | `registerUpdateListener`, on every commit |
| `$selectNextVerse` / `$selectPreviousVerse` (`node-react.utils.ts`) | `ArrowNavigationPlugin`, ArrowUp/ArrowDown |
| `$collectPreviousParaMarkers` (`markerMenuContext.utils.ts`) | the marker menu opening |

`StateChangePlugin` is the one that escapes it, by accident: its `$findMatchingParent` predicate is
"my parent is a root or shadow root", which the glyph itself satisfies, so it returns the glyph and
never reaches its `getTopLevelElementOrThrow()` fallback.

**This is the same defect the CELL already carries a post-mortem for, arrived at from the other
side.** `ImmutableTableCellNode` once declared `isShadowRoot(): true` and held text; the fix was to
drop the claim. The row held elements and later grew text. Two routes, one rule.

### The fix level chosen

`ImmutableTableRowNode` drops `isShadowRoot()`. One line, plus the comment that keeps the next
reader from restoring it.

The alternative — keep the row a shadow root and give the glyph an element (or decorator) wrapper,
as Paratext 9 does with a real `<td class="markercell">` — was rejected as disproportionate. The
unknown-blocks handoff had already costed it: a new display-only node class in the document schema,
through both adaptors, plus fixture regeneration. It buys a `<td>` we do not otherwise need, and it
leaves an illegal-shaped-tree hazard latent for the next kind of child a row acquires.

Nothing is lost by dropping the claim. The TABLE above is still a shadow root, so selection is still
isolated at the table boundary — which is the boundary that matters, and the same reasoning the
cell's own comment already records. Cross-row merging was never what a shadow root prevented in any
case: nodes merge within a parent, and rows are separate parents regardless.

One consequence, deliberate and pinned: `getTopLevelElement()` from table content now resolves to
the ROW rather than the cell. The cell's existing regression test was updated to say so. Its
load-bearing half — never stop on a `TextNode` — is unchanged; which ELEMENT it lands on was always
incidental, and the test now says that too.

### The caret could also enter the glyph

The second half of the pin. `ArrowNavigationPlugin`'s visible-stop normalizer had no notion of
opaque constructs at all (`OpaqueBlockGuardPlugin`'s doc says outright that navigation is not its
business). A `MarkerNode` is ordinary traversable text, so `$resolveOneVisibleStop` declined any
move inside it — "the browser's own grapheme and bidi handling is better than a tree walk" — and the
browser walked the caret through `\`, `t`, `r` one byte at a time.

Measured, forward from the row glyph's leading edge:

```
before          text:rowGlyph@0 -> (declined; browser walks the glyph byte by byte)
after           text:rowGlyph@0 -> text:rowGlyph@3 -> element:row@2 -> text:cellGlyph@4 -> ...
```

A read-only construct's marker glyph offers no edit from any position inside it: every gesture
aimed there is refused, and a table has no settle scope to reconcile a change with the file even if
one landed. So it is now a visible ATOM — crossed whole in either direction, never rested inside —
via `$isOpaqueConstructGlyph`, which is `$isMarkerNode` plus `$opaqueBlockAncestor`, the predicate
the edit guard already owns. That predicate is now exported rather than duplicated, which is what
the unknown-blocks handoff asked for ("one predicate is where this comes back out").

**Deliberately not generalized to all marker glyphs.** Outside an opaque construct the caret walking
through a glyph IS the affordance — retyping `\q1` to `\q2` is how a paragraph gets retagged — and
there is a control test pinning that it still does.

### Tests

`ImmutableTableRowNode.test.ts` (+1) — the mechanism, stated at the node level and mirroring the
cell's existing pin: `getTopLevelElement()` from the row's own glyph and from its separator does not
throw and returns the row. Red pre-fix.

`unknownBlockTyping.test.tsx` (+2) — the same thing on a table built by real typing, through the
live selection: red pre-fix with TJ's exact error string.

`ArrowNavigationPlugin.test.tsx` (+5) — the row glyph crossed whole forward, the cell glyph crossed
whole backward, a caret already stranded mid-glyph freed by the next press (3 red pre-fix), plus two
that hold either way and say so: the never-rests-inside guard, and the control that an ordinary
paragraph's glyph is still walked through.

Two harness notes worth carrying, both flakes in the TESTS rather than in the fixes, and both found
only by running the suites repeatedly rather than once.

- **Placing the caret and reading it in two different updates.** The app-level pin was green alone
  and red in the full suite: between the two updates the marker engine's idle-settle clock re-places
  the caret, so the assertion measured a caret in the previous paragraph's `\p` glyph. Placing and
  walking inside ONE update is deterministic and also more faithful, since the real listeners run
  inside the selection change itself.
- **Asserting a between-nodes caret by its raw anchor.** `crosses the CELL glyph whole in one press
  backward` failed about one run in three. A caret at a seam has two equally valid spellings — the
  element point between the nodes, and an edge offset of the text node on either side — and Lexical
  settles on one or the other depending on when its selection reconciliation has run. The landing is
  an element point that is usually, but not always, normalized to `text:glyph@0` first. The pins now
  reduce both spellings to the seam they name. The visible-stop suite already knew this and has its
  own `locationOf` helper saying so; it is worth knowing before writing the assertion, not after.

Five consecutive full `shared-react` runs and two full `platform-editor` runs green afterwards.

---

## Item 2 — mid-text `\f `: the verdict is REPRODUCES, on a surface TJ was never on

The brief was "produce a reproduction or retract the claim". It reproduces. Both candidate
explanations were tested; **(a) is correct, in a stronger form than stated.**

### The reproduction

`nx dev platform` (standard view), or any embedder of `<Editor>` that leaves `hasExternalUI` false.

1. Put the caret in the MIDDLE of a paragraph — text must follow it. `\p hello| world and more`.
2. Type `\`, then `f`, then Space.
3. Expected before this branch: one footnote swallows the rest of the sentence. Measured:
   `\f world and more` inside the note — `world` became the note's `caller`, `and more` its content,
   and the paragraph is left with nothing after `hello `.
4. Expected after: an empty footnote at the caret, `world and more` still in the paragraph.

Step 1 is the whole reason this went unseen: **every existing `\`-palette fixture places the caret
at the end of the document.** With no tail to absorb, the literal `\f ` produces exactly the empty
note the ratified table calls "commits like Enter", and the hazard is invisible in that position.

### Why TJ could not reproduce it in the app

Not merely "the host routes note markers differently". **The app never mounts the editor's palette
at all**: `Editor.tsx` renders `UsjNodesMenuPlugin` only under `{scrRef && !hasExternalUI && …}`,
and Platform.Bible sets `hasExternalUI`. Under the app the only palette is the host's overlay, and
the host has routed note markers through the item commit since fb2, with a comment saying why. So
the editor palette's Space branch was unreachable from the app — which is the same cross-cutting
finding `2026-08-19-feedback-rounds-summary.md` already records, applied to this bug.

The claim was therefore true and unreproducible at the same time, which is exactly the shape that
made it look retractable.

### The mechanism, confirmed rather than corrected

`2026-08-18-fb3-host-active.md` traced this by reading the engine and got it right; this branch only
replaced the trace with a measurement. `\f `'s caller is a LEADING ATTRIBUTE (invariants §2), so the
first word after the caret becomes `caller`; the note has no closing marker, so within the
paragraph-scoped rebuild fragment it stays the open container for everything after it, and the
remainder becomes note content.

The literal path itself is NOT changed — it is the tokenizer's, a fixed point (§5), and anyone who
types those bytes still gets that result. There is now a test asserting so, marked as evidence
rather than as a regression pin.

### The fix

The owner's leaning, implemented: the editor's palette gives note markers the host's routing.
`UsjNodesMenuPlugin`'s Space branch, before materializing the literal, looks for an offered item
with `kind === "note"` whose marker exactly equals the typed query, and commits it through
`harness.apply` — the same item commit Enter uses. Exact match on the TYPED query, never the
highlighted item, mirroring how the wrap case above it already resolves its marker.

This makes the ratified `\f` + Space row ("commits like Enter") true in every caret position instead
of only at end-of-paragraph. Non-note markers are untouched.

### Tests (`markerMenuHarness.test.tsx`, +4, with a new mid-text fixture)

| Test | Pre-fix | Role |
| --- | --- | --- |
| the raw `\f ` literal mid-text pulls the tail into the note | passes | evidence; the tokenizer behavior we do not change |
| `\f` + Space mid-text leaves the paragraph tail alone | **red** | the one red-to-green |
| caret-at-end `\f` + Space still yields an empty note, `+` caller | passes | proves the ratified row is byte-identical |
| `\nd` + Space mid-text still materializes the literal | passes | the non-note control |

---

## Verification

Foreground runs, no new skips, no fixture regeneration (no serialized shape changed).

- `nx test shared` — 37 files, 537 passed, 0 skipped.
- `nx test shared-react` — 26 files, 1541 passed, 1 skipped (pre-existing); five consecutive
  `--skip-nx-cache` runs after the seam fix, green every time.
- `nx test @eten-tech-foundation/platform-editor` — 72 files, 1295 passed, 0 skipped; two full
  `--skip-nx-cache` runs, green both times.
- `nx test utilities` — 6 files, 51 passed. `nx test perf-react` — 3 passed. `test-data` — 2 passed.
- Corpus specifically — 149 passed across all four corpus suites, **zero skips**.
- Full gate `nx run-many -t test lint typecheck --skip-nx-cache` — **green, all 10 projects**. Lint
  reports 0 errors; the warnings are all pre-existing `no-console`, untouched here.

One process note. An earlier attempt at this gate failed on
`@eten-tech-foundation/platform-editor:typecheck` and `:build`, and Nx labelled both "flaky". They
were not: a targeted `nx test` had been started in another shell WHILE the gate was running, and two
concurrent `tsc --build` runs share the same `tsbuildinfo` and `dist` and corrupt each other. Both
targets pass alone, and the gate passes with nothing else touching the workspace. Do not run
anything else in the tree while a gate is in flight, and do not accept Nx's "flaky" label as a
diagnosis.

## What I deliberately did not do

- **No tokenizer change** and **no C# change**; the approval gate was never approached. The
  mid-text `\f ` absorption is pinned as evidence, not edited.
- **No change to `EditorRef.commitTypedMarker`.** Its contract is byte-fidelity to passive typing,
  the host deliberately routes around it for notes, and its own test already pins the mid-text
  caller. Changing it would break the host's design and the ratified table at once.
- **No new node class for the row glyph**, and no `<td class="markercell">`. See the fix-level
  reasoning above; the layout gap this leaves (0.28em of cell padding, already supplied by a rule on
  the glyph) is unchanged and still recorded in the unknown-blocks handoff.
- **Tables are not editable**, the glyph is not hidden, and the delete refusal is untouched.
- **Scribe untouched** (unmaintained; it mounts neither the guard nor the arrow normalizer's
  editable-mode branch).

## Cross-group findings

- **A shadow root whose children are not all elements is a latent crash, not a style question.**
  Two node classes have now hit it from opposite directions. `GraftNode` also declares
  `isShadowRoot()`; it was not audited here because nothing on these branches gives it text
  children, but it is the third candidate if one ever does.
- **`OpaqueBlockGuardPlugin` refuses edits and says navigation is not its business.** That was right
  for deletion and left a real gap: a construct can be perfectly delete-proof and still trap or
  crash a caret. When a construct is made read-only, its NAVIGATION story needs deciding in the same
  breath.
- **Caret-at-end fixtures hide a whole class of bug.** Any palette or commit test whose fixture ends
  at the caret cannot see absorption of what follows. Worth checking the other commit paths against
  a mid-text fixture.
- **Two-update test choreography is a flake source with the settle clock running.** Place the caret
  and assert in the SAME update where the assertion is about the caret.
- **A caret at a seam has two spellings, and which one you read is a race.** Pins about a caret
  BETWEEN nodes must canonicalize before comparing; the visible-stop suite's `locationOf` already
  existed for this and is worth copying rather than rediscovering.
- **Nx's "flaky task" label is not a diagnosis.** Two concurrent `tsc --build` runs in one worktree
  corrupt each other's `tsbuildinfo`; the gate must have the tree to itself.

## Please test by hand

1. **Click directly on a table row's `\tr` glyph** in the app. Expect no error in the console and
   the editor to keep working — this is the crash TJ reported.
2. **Arrow left and right across a table.** Expect the `\tr` and `\tc1` glyphs to be crossed in one
   press each, never landing between the `\` and the marker name. Then confirm arrowing through an
   ordinary `\q1` paragraph glyph still steps character by character.
3. **In `nx dev platform`** (NOT the app — the app does not render this palette): mid-sentence, type
   `\`, `f`, Space. Expect an empty footnote and the rest of the sentence still in the paragraph.
   Then the same at the end of a paragraph, expecting no change from today.
4. **In the app**, the same mid-sentence `\f` + Space, confirming the host palette is unaffected.
