# Feedback: the caret lost at the boundary between text and a table

Branch `sv/fb5/table-caret`. One item against the Standard-view editor. Governing:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md`. Immediately preceding:
`2026-08-19-fb4-glyph-caret.md` (the row glyph as an atom) and `2026-08-18-fb2-table-cp.md` (the
row-glyph delete refusal). Landed strict red-green: six failing tests were watched failing on the
pre-fix source, for the stated reason, before they passed.

TJ's report: arrowing DOWN through a table works (fb4). But place the caret at the END of the text
immediately BEFORE a table and press Right several times — the caret is lost. Left and Right do not
bring it back, and Up/Down scroll the view instead of moving anything.

**Verdict: reproduces, deterministically, and the fix is editor-side.** It is not a browser
behaviour we cannot control. The browser never sees the press at all.

---

## The measured selection state, per keypress

Fixture: `\p before`, a one-cell table (`\tr` glyph, NBSP separator, `\tc1` cell), `\p after`;
standard view, editable markers. Driven through the real command path — a `keydown` dispatched on
the editor's root element, so Lexical's own `onKeyDown` routing runs (`KEY_DOWN_COMMAND` first, then
`KEY_ARROW_*`), exactly as a browser key does.

### Before the fix

```
start           text:"before"@6            (end of the text before the table)
Right 1         text:"\tr"@0               <-- INSIDE the table, and unclaimed by any of our plugins
Right 2         text:"\tr"@3
Right 3         element:row@2
Right 4         element:cell@1
Right 5         text:NBSP@1
Right 6         text:"cell"@1
Left  1         text:NBSP@1
Left  2         element:cell@1
Left  3         text:"\tc1"@0              <-- the cell's leading edge
Left  4         text:"\tc1"@0              STUCK — nothing claims, nothing moves
Left  5         text:"\tc1"@0              STUCK
Left  6         text:"\tc1"@0              STUCK
```

Backward entry is the same defect mirrored: from `text:"after"@0` a single ArrowLeft lands on
`text:"cell"@4`, inside the table, and sticks there.

The selection is a perfectly ordinary **collapsed range selection on an addressable node**. It is
not null, not a node selection, not a broken point. That is what makes it invisible rather than
crashy: Lexical is entirely happy with it, and the browser cannot render it.

### After the fix

```
start           text:"before"@6
Right 1         text:"after"@0             (the whole table crossed in ONE press)
Right 2..6      unchanged (jsdom performs no native intra-text move)
Left  1         text:"before"@6            (exact round trip)
Left  2..6      unchanged
```

Never inside the table at any point, in either direction, at any press count.

---

## Root cause

**Two independent facts meet, and each is invisible from the other's side.**

### 1. A read-only construct is not a place a caret can BE

`ImmutableTableNode.createDOM()` sets `contenteditable="false"` on the whole `<table>` (the same
treatment `UnknownNode` gives figures, sidebars and `\periph`). Inside such an island the browser
draws no caret, and its own arrow handling will not move one out again — the editing-boundary rules
say there is no visible caret position there to move between. So a caret that lands inside is
invisible AND inert: Left and Right do nothing, and Up/Down fall through to the scroller, which is
exactly the "Up/Down scroll the editor view" half of TJ's report.

This was true before fb4 and before fb2. It is a property of `contenteditable="false"`, and it is
the reason the caret's arrival matters at all.

### 2. Lexical puts it there itself, and the browser is never consulted

This is the part that made the bug look like a host problem. It is not.

`RangeSelection.modify` (Lexical core, 0.43) begins with
`$modifySelectionAroundDecoratorsAndBlocks`. When the caret is at the edge of its block, that
function walks forward from the focus and — on the first **ChildCaret into a non-inline element** —
moves the focus INTO it, then `$normalizeCaret`s down to the first text position inside:

```js
for (const nextCaret of $extendCaretToRange(initialFocus).iterNodeCarets(...)) {
  if ($isChildCaret(nextCaret)) {
    if (!nextCaret.origin.isInline()) focus = nextCaret;   // <-- descends into the next BLOCK
  } ...
  break;
}
```

`@lexical/rich-text` reaches it through the matching gate, `$shouldOverrideDefaultCharacterSelection`
(`@lexical/selection`), which in 0.43 is no longer decorator-only — it returns
`!nextCaret.origin.isInline()` for a ChildCaret. So `KEY_ARROW_RIGHT_COMMAND` claims the press at
`COMMAND_PRIORITY_EDITOR`, calls `event.preventDefault()`, and applies the descent.

Measured, bracketing the press with CRITICAL-priority observers on both commands:

| Point | Selection |
| --- | --- |
| at `KEY_DOWN_COMMAND` (CRITICAL) | `text:"before"@6` |
| at `KEY_ARROW_RIGHT_COMMAND` (CRITICAL) | `text:"before"@6` |
| after the event, synchronously | `text:"before"@6`, **`event.defaultPrevented === true`** |
| after the flush | `text:"\tr"@0` |

And with **no usj plugins mounted at all** — no `ArrowNavigationPlugin`, no
`OpaqueBlockGuardPlugin` — the same press produces the same landing. The descent is Lexical's,
start to finish.

So: the editor asks Lexical to move the caret one character; Lexical decides the next block is where
that character is; the block happens to be one the browser cannot render a caret in; and because
Lexical `preventDefault`ed, the browser never gets the chance to apply its own (correct) rule of
skipping the island.

### Why fb4 did not cause this, and did not fix it either

fb4 made a read-only construct's marker GLYPH an atom crossed whole, which is about traversal
already inside the construct. It never touched arrival from outside — `$moveOneVisibleStop` is
bounded by `$blockOf`, so at a block edge it declines and always has. The pre-fix trace confirms it:
press 1 is logged **unclaimed by every one of our handlers**. fb4's own doc predicted this shape
exactly ("a construct can be perfectly delete-proof and still trap or crash a caret"); this is the
third face of it, and the one that arrives from outside.

---

## The fix, and its level

**Navigation level, in `ArrowNavigationPlugin`.** `$crossOpaqueConstruct` claims the press that would
otherwise enter a read-only construct and lands the caret on the far side — the construct crossed
WHOLE, which is the same treatment fb4 already gives its marker glyphs, applied one level up.

Three helpers, all module-private, all in the normalizer's existing vocabulary:

- `$isAtEdgeOf(point, direction, bound)` — "no rendered content is left to cross within `bound`",
  asked with the same `$scanSeed`/`$scanForRendered`/`$isTraversableText` the visible-stop rules use,
  so "this press leaves the block" cannot drift from "the normalizer found nothing more to cross".
- `$renderedBeyondConstructs(construct, direction)` — the first node rendering anything beyond it,
  stepping OVER any further construct. Two tables back to back have no position between them, so
  they are crossed together rather than one per press.
- `$crossOpaqueConstruct(selection, direction)` — the rule itself.

Keyed on `$opaqueBlockAncestor`, the predicate fb2 exported and fb4 already reuses. That is now the
one place three separate behaviours are decided from: the edit refusal, the glyph atom, and the
crossing. When table editability lands it is still the single seam.

### Decisions inside the rule

**Runs FIRST in both arrow chains**, ahead of the note, `\fp` and visible-stop handlers — a
deliberate departure from fb4's "the normalizer runs LAST" precedence note, and for a reason that
note does not cover. It decides whether the press leaves the block at all, and one of the handlers
below it would otherwise place the caret inside the construct itself: `$handleForwardNavigation`'s
hop past a collapsed note at a paragraph's end does `nextPara.selectStart()` on whatever follows,
and when that is a table it selects into it. The predicate is narrow enough to take first position
safely — it claims only when the caret is at its own block's edge AND the block's neighbour is a
construct, which is a press no other handler here has an opinion about. Verified: with a note ahead
of the caret the scan finds rendered content, `$isAtEdgeOf` is false, and the note handlers run
unchanged (their tests are green).

**Not gated on marker mode.** A construct the editor cannot model is read-only in every view — the
same reasoning `OpaqueBlockGuardPlugin` records for taking no `viewOptions` at all. The visible-stop
normalizer beside it IS gated, because display runs and glyph text only exist in editable-marker
mode; this rule depends on neither.

**Scoped by the caret's BLOCK EDGE**, which is what keeps an INLINE read-only construct out of it.
An `\optbreak` or a `\ref` sitting among the words of a paragraph is inside the caret's own block,
never the block's sibling, so it is never what this rule sees and the visible-stop rules continue to
own it. This scoping is structural rather than a list, so it does not need maintaining.

**A refusal when nothing beyond can hold a caret** (a document ending in a table): the press is
claimed and the caret stays put. That follows the precedent already in this file —
`$handleBackwardNavigation` returns `true` without moving when a chapter node is the only thing at
the beginning. It is a caret rule, not a document edit, so the no-silent-no-ops rule (invariants §I,
which governs keystrokes that change the file) is not in play; and a caret the user can still see is
strictly better than one lost inside.

**Collapsed moves only.** Shift-extension is untouched, so a selection still reaches into a table and
its bytes stay selectable and copyable — which is what read-only is FOR, and what
`OpaqueBlockGuardPlugin`'s doc says explicitly. Modified arrows (word/line) keep native semantics, as
every other plain-arrow rule in this file does.

---

## Tests

`ArrowNavigationPlugin.test.tsx`, +9 in a new describe, `a read-only table is crossed whole from
outside`.

| Test | Pre-fix | Role |
| --- | --- | --- |
| lands past the table in ONE press forward, never inside it | **red** | the defect |
| lands before the table in ONE press backward, never inside it | **red** | the defect, mirrored |
| never leaves the caret inside the table, however many times Right is pressed (×6) | **red** | per-press, not just the final state |
| never leaves the caret inside the table, however many times Left is pressed (×6) | **red** | mirror |
| crosses two consecutive tables together | **red** | no stop exists between them |
| refuses the move when the table is the last thing in the document | **red** | the nothing-beyond arm |
| returns to the identical position after N out and N back | passes | closure guard — see below |
| returns to the identical position from the far side, Left then Right | passes | closure guard |
| still crosses to an ordinary paragraph when no table is between | passes | control: does not over-claim |

The six red ones all failed on `caretIsInsideOpaqueConstruct` — measured on the pre-fix source,
which is the defect stated as an assertion rather than as a position.

**The two round trips are honest guards, not regression pins, and are commented as such.** They hold
pre-fix, because jsdom performs no native caret movement: the caret Lexical put inside the table came
back out of it just as symmetrically. In a browser it would not. They earn their place by failing if
the crossing is ever made asymmetric, which is the shape of every caret trap this file has met.

Two harness notes:

- **`pressKey` cannot see this bug.** It dispatches `KEY_DOWN_COMMAND` alone, so Lexical's own
  `onKeyDown` routing — and therefore `KEY_ARROW_RIGHT_COMMAND`, where the whole defect lives — never
  runs. A new `pressKeyThroughDom(editor, key)` in `react-test.utils.tsx` dispatches a real `keydown`
  on the root element instead, with its TSDoc saying when to prefer which. Any future pin about a
  press LEXICAL claims needs it; a pin about a press one of our plugins claims does not.
- **Every landing here is a position BETWEEN nodes**, so the assertions reduce both spellings to the
  seam, copying the `seamOf` helper the fb4 glyph suite already carries for the same race.

---

## Deliberately not done, and deviations

- **No node change.** `ImmutableTableNode` keeps `contenteditable="false"` and keeps
  `isShadowRoot()`. Tables are not editable, nothing is hidden, and the fb2 delete refusal is
  untouched.
- **No Lexical fork or patch.** The core descent is correct for ordinary blocks — it is what makes
  paragraph-to-paragraph arrowing work at all, and the control test pins that it still does. It is
  only wrong for blocks the browser cannot host a caret in, and that is our knowledge, not Lexical's.
- **`$blockOf` NOT widened** — see the residual finding below. Widening it is the fix for the OTHER
  half of this area, and it re-bases an fb4 pin, so it is recorded rather than annexed.
- **No C# change**; the approval gate was never approached. **No tokenizer change.**
- **Scribe untouched** (unmaintained; it mounts neither the guard nor this plugin's editable-mode
  branch).
- **No fixture regeneration** — no serialized shape changed; this rule only decides which caret
  position a key produces.

---

## Residual finding, measured and deliberately left: the intra-table backward asymmetry

The brief asked whether the forward and backward walks disagree. **They do, and it is a second,
separate defect** — the one that produced the `STUCK` rows in the pre-fix trace. It is now
unreachable by arrow keys (nothing enters a table that way any more) but still reachable by CLICK,
so it is worth recording precisely.

`$blockOf` returns the nearest non-inline element ancestor. Inside a table that is the ROW for the
row glyph and the CELL for anything in a cell. `$scanForRendered` DESCENDS into elements, so a
forward press from the row glyph walks down into the cell quite happily; `$stepOver` is BOUNDED by
the block, so a backward press from the cell's leading edge cannot climb back out to the row. Hence:

```
forward   \tr glyph -> row@1 -> row@2 -> cell@1 -> cell@2 -> "cell"@1   (crosses into the cell)
backward  ... -> cell@1 -> "\tc1"@0 -> STUCK                            (cannot leave the cell)
```

The fix is to make `$blockOf` return the whole opaque construct for content inside a block-level one
— guarded on `!construct.isInline()`, or an inline `\optbreak` would confine the caret to itself.
That is a two-line change. It is not taken here because it re-bases exactly one fb4 pin: `crosses the
CELL glyph whole in one press backward` asserts the landing seam is `cell@0`, and with the wider
block the canonicalizer resolves the same SCREEN location to its outermost spelling, `row@2`. That is
arguably the more correct answer by the canonicalizer's own stated rule ("the outermost, earliest in
document order"), but it is a deliberate re-basing of a green pin and belongs in a change that says
so, not as a side effect of this one. The brief for this branch required the fb4 pins to stay green.

**Worth knowing alongside it:** a caret anywhere inside a table is invisible in the real app
regardless of which stop it is on, because the whole block is `contenteditable="false"`. So fb4's
intra-table traversal work is about the correctness of the model, not about anything the user can
watch. That is not an argument against it — a wrong model is how the caret got lost in the first
place — but it does mean the intra-table asymmetry is a lower-priority defect than its trace makes it
look.

---

## Verification

Foreground targeted runs, no new skips, no fixture regeneration.

- `nx test shared-react` — 26 files, **1550 passed, 1 skipped** (pre-existing), up 9 from 1541.
- `nx test @eten-tech-foundation/platform-editor` — 73 files, **1318 passed, 0 skipped**.
- `nx test shared` — 37 files, 537 passed. `nx test utilities` — 6 files, 51 passed.
  `perf-react` — 3 passed. `scribe-editor` — 2 passed. `test-data`, `perf-vanilla` — green.
- Corpus specifically — **149 passed across the four corpus suites, zero skips**, unchanged.
- Lint: **0 errors**. The 4 `shared-react` warnings (`no-console`, `no-loop-func`) were confirmed
  identical on the pristine branch by linting a `git stash`ed tree — this change adds none. The two
  `perf-react` `no-console` warnings are likewise pre-existing.
- Full gate `nx run-many -t test lint typecheck --skip-nx-cache` — **green, all 10 projects**, with
  nothing else touching the tree while it ran (the concurrent-`tsc --build` hazard fb4 recorded).
- No `extract-api` run and no API report change: nothing was added to a package's public surface.
  `pressKeyThroughDom` lives in `plugins/usj/react-test.utils.tsx`, which no index re-exports.

**A real-browser confirmation was attempted and is not available in this environment**: there is no
Chrome binary for the devtools bridge under this WSL install. It is not needed for the mechanism —
the descent is Lexical's own and reproduces headlessly and deterministically, with `defaultPrevented`
measured true — and the browser half of the story is exactly what TJ observed by hand (invisible
caret, Up/Down scrolling). The manual steps below close that loop.

---

## Cross-group findings

- **Lexical 0.43's arrow gate is no longer decorator-only.** `$shouldOverrideDefaultCharacterSelection`
  now claims a press into any non-inline ELEMENT, not just a decorator, and
  `$modifySelectionAroundDecoratorsAndBlocks` applies the descent. Any reasoning in this repo of the
  form "Lexical only overrides arrows around decorators, so our element node is safe" is stale and
  should be rechecked against the source rather than against memory.
- **`contenteditable="false"` makes a subtree caret-hostile, not merely edit-hostile.** Every node
  class that sets it — `ImmutableTableNode`, `UnknownNode` — needs its NAVIGATION story decided in
  the same breath as its read-only story. fb4 said this about deletion; this is the same sentence
  about arrival, and the third time the pattern has been paid for.
- **A test helper that dispatches only `KEY_DOWN_COMMAND` cannot see a press Lexical claims.** The
  whole suite's `pressKey` is that helper, so a defect living in Lexical's own arrow handling is
  invisible to every existing arrow test. `pressKeyThroughDom` exists now; the choice between them is
  "who claims the press", and it should be made deliberately.
- **"Unclaimed by our plugins" is not "unhandled".** The pre-fix press was declined by every one of
  our handlers and still moved the caret. Priority-ordered sentinels only prove nothing at or above
  their own priority claimed; `COMMAND_PRIORITY_EDITOR` (0) runs LAST, after `LOW`, and that is where
  Lexical's own handlers sit.
- **A collapsed range selection on a perfectly valid node can still be an unusable caret.** The
  failure mode here has no null, no node selection and no detached node — the diagnosis has to ask
  whether the DOM can RENDER the position, not whether the tree can express it.

---

## Please test by hand

1. **Put the caret at the end of the text immediately before a table and press Right repeatedly.**
   Expect the caret to appear at the start of the content after the table on the first press, and to
   keep moving through that text afterwards — never disappearing. This is the reported bug.
2. **Press Left the same number of times.** Expect to arrive back exactly where you started.
3. **From the start of the text after a table, press Left, then Right.** Same round trip, mirrored.
4. **With a document that ends in a table**, press Right at the end of the last paragraph before it.
   Expect the caret not to move, and to stay visible.
5. **Shift+Right from before a table.** Expect the selection to extend into the table and Ctrl+C to
   still copy its text — read-only means selectable, not untouchable.
6. **Arrow across an ordinary paragraph boundary** with no table involved, and confirm nothing about
   it changed.
7. **Click directly inside a table cell.** The caret is invisible there (the block is
   `contenteditable="false"`) and arrows walk it within the cell — that is the residual finding
   above, unchanged by this branch.
