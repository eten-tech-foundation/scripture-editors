# Standard view: bug-register closeout handoff

Companion to `2026-08-19-reported-bug-register.md` (what was reported) and
`../plans/2026-08-19-bug-register-closeout.md` (how it was to be closed out). This says what
actually happened.

Branch: `sv/closeout`. Anchors used for the bisect: **`f0800f35`** (the Phase-3 branch point) and
**`85fec66d`** (the standard-view tip it was rebased onto). Bare paths are relative to
`packages/platform/src/editor/`.

---

## Second round: what the owner's review changed

The first round's report was wrong in a way worth recording, because the mistake has a shape.

The owner read the report and found **W6 still broken**. It had been declared green on a test that
drove the gesture at ONE caret position — the very end of the verse glyph, the one place a typed
space does land. Inside the glyph, where the report actually pointed, the byte was discarded. One
report, two positions, opposite answers.

That prompted a systematic re-audit of every verdict at every interior caret position, and **two
more verdicts fell**:

- **K12** — with the caret one character left of the tested spot, the closing glyph is SPLIT: the
  left half heals back to a whole `\add*` and the right half is stranded as literal content, so
  `\p \add word\add*` becomes `\p \add word\add*\nd \nd*add*`. Four bytes nobody typed, in the file.
- **N4** — at verse-glyph offsets 2 and 3 the verse keeps its number AND the digit arrives again as
  body text; at offset 1 the verse is destroyed outright.
- **W4**'s separator claim survived, but the gesture did not: a selection anchored at the opening
  glyph's start or end — visually identical to anchoring at content start — dissolves the span.

**All three were one defect**: a marker glyph is a plain `TextNode`, so any generic Lexical
operation that splits at an offset cuts one in half. Invariant II says display bytes are excluded
from document positions in exactly ONE place, and says outright that they are not today. These were
that bill. Fixed at the root — see below — rather than three times.

**The lesson for anyone writing these tests:** a glyph has several interior positions and they do
not behave alike. Driving the gesture at one of them, especially the convenient one, is how a bug
survives a green suite. Where a report names a marker, enumerate the positions.

---

## The short version

The premise held. Most of what was still open in the register was **not** broken — but almost none
of it was pinned, so nobody could have known that. The round converted the register into tests; the
tests then did the triage.

Scoreboard:

- **Fixed:** **N1** (a footnote insert destroyed a char span's closer) — the one production defect
  the round found on its own.
- **Implemented from your rulings:** **X2** (Ctrl+Space inside `\ft` emits `\ft*`) and **S1** (a
  settle is never its own undo entry).
- **Found by implementing S1, and dangerous:** the delta plugin was swallowing settled bytes, so
  `getUsj()` returned the pre-settle document — editor showing one thing, save writing another.
- **Found while pinning something else, not fixed:** **V3** — a half-typed verse bridge (`\v 5-`) is
  silently dropped on save. Pinned as a divergence; the fix is a decision about what a verse number
  may contain.
- **Also fixed:** **C5** (Up/Down on a verse marker jumped paragraphs) and the contained half of
  **C6** (the forward arrow stepped into a collapsed note).
- **Turned out to be deliberate design, so it needs a ruling rather than a patch:** **W7/W8**.
- **Needs a design ruling:** **C6**'s missing caret position after a trailing note.
- **Still open with no headless repro:** **A2**. I need your gesture.
- **Diagnosed here, repair belongs to the host:** **P4**.
- **Never broken at either anchor, pinned forward:** A1, K12, N4, W4, and the whole log-storm
  cluster (S4-S7, A6, S8-log).

---

## What turned green on its own

These reproduce nowhere at HEAD, and were **green at both anchors** — so nothing in this effort
repaired them and they were never broken at either base. Each is pinned forward anyway, because an
unpinned behavior that merely happens to work is exactly the risk the register was written against.

| Report | Pin |
| --- | --- |
| **A1** typing `\w*` deletes the default attribute | `markerEdit/charAttributeTypedSettle.test.tsx` |
| **K12** `\nd` + Enter after a closer fabricates a third glyph | `markerMenu/markerMenuApply.utils.test.tsx` |
| **N4** Ctrl+T on a verse marker duplicates the digit | `markerEdit/noteInsertion.test.tsx` |
| **W4** a wrapped selection emits no separator | `markerMenu/markerMenuApply.utils.test.tsx` |

Two of these are worth more than a checkbox:

- **K12** was checked under **both palette eras**. The active palette lands nothing in the document
  before the commit; the passive one — which the report was filed against — left the typed `\nd`
  there for the commit to clean up first, and that cleanup was the plausible source of the reported
  third glyph. Both are green. Note also that an empty `\nd \nd*` pair IS the correct outcome of an
  Enter commit; the report was about a third glyph, not about the empty pair.
- **W4** already had a pin at the anchor, but only for DISPLAY — it asserts the NBSP is shown and
  says outright that the saved bytes were already right. That was true when a missing separator was
  cosmetic. Under the tokenize-identity rule `\ndone` now scans as a marker named `ndone`, so the new
  pin departs the caret to force a settle and asserts the emitted USJ still says marker `nd` with
  content `one`. Same gesture, different and now load-bearing claim.

**The whole log-storm cluster (S4, S5, S6, S7, A6, and S8's log half) also turned green on its own —
in the host, before Phase 3 branched.** That is why no track here owns it and why the editor-side
bisect is green at both anchors. See "How the log storms were diagnosed" below.

---

## What needed a fix

### The one exclusion point — three reported bugs, one root

`libs/shared/src/nodes/usj/glyphPositions.utils.ts` now decides which rendered bytes are display, by
the PROPERTY that a node's text is a picture of its own state — covering `MarkerNode`, an editable
`VerseNode`, the attribute display run and the marker-trailing separator, with nothing wired in
per-type at any call site. `$normalizeSelectionOutOfGlyphText` re-expresses a point so no glyph is an
operand of the edit about to run, and note insertion plus the marker-action apply both route through
it.

The landing differs by gesture, deliberately, because a range endpoint drags its own node into the
range and an insertion point does not. A collapsed caret inside a glyph resolves to the glyph's
trailing end — the spelling arrow traversal already prefers for that screen location. A range
endpoint AT a glyph's end steps inward onto the neighbouring node, all-or-nothing; an endpoint
strictly inside a glyph is left alone, because the highlight visibly covers those bytes and
re-tokenizing them is Invariant I working as intended.

Only the caret/selection half of Invariant II has landed. OT content-op offsets and delta-doc
positions still resolve through their own exclusions; the invariants doc carries a dated note saying
so.

### The typed-space class — W6, W7, W8, and the five display runs

One rule, owner-ruled: **a space typed beside a marker is inserted, stays visible, and leaves the
caret immediately after it.** The file is unaffected either way because the writer emits structural
whitespace itself.

Two mechanisms had to change. In a verse glyph the byte was DISCARDED by a canonicalizing rewrite.
After a char opener it survived but the caret advanced past the structural separator as well, from
`$moveCaretPastMarker` — which exists so that COMPLETING a marker name lands the caret in the
content, and could not tell that gesture from a space typed beside a name already finished.

I argued this position was illegal under Invariant II, since the separator is a display byte. **The
owner overruled that, correctly:** while the user is typing there really are two spaces on screen, so
between them is a real position. The same licence then went to all five display runs (`va`, `vp`,
`ca`, `cp`, `cat`), which had the identical defect and were never reported.

Worth knowing for the next person: fixing the display-run divergence predicate alone left the bug
fully intact. The byte was dying on a different route — the Tier-2 trigger pended every dirtied
attribute-run value node's own key unconditionally, and a pended value node matches no descriptor,
so the settle fell through to a paragraph rebuild that re-tokenized the run canonical.

### Attribute values: two fixes with opposite answers

**An empty value now survives the way out to USX.** `setAttributes` tested for TRUTHINESS, so `""`
was indistinguishable from `undefined` and `\qt-s |who=""\*` lost its attribute before ParatextData
ever saw it. The read leg never had the bug, which is what made it quiet: editor right, file wrong.
Alone it looks like the marker lost its attribute list; beside a populated attribute it is worse to
diagnose, because the document still looks structurally right with one field silently missing.

**A value the parser cannot read now keeps the whole list literal.** USFM cannot escape a quote
inside a value, so `gloss="st"uff"` is genuinely ambiguous — and the global pair regex matched
`gloss="st"` and silently skipped the leftover. The literal path already existed in
`extractAttributes`; what was missing was FAILING the parse rather than returning a partial one.

These point opposite ways on purpose. An empty value is unambiguous — a present attribute not yet
filled in — so parsing it loses nothing. An unparseable one has no correct reading, so the only
lossless answer is to keep every byte visible where the author can fix it. Paratext 9 makes both
literal; we diverge on the first, deliberately.

### N1 — a footnote inserted at a char span's content end destroyed the closer

The only production defect this round found and fixed.

Reported against two consecutive non-nested inline markers, but the trigger is far more ordinary
than that framing suggests: **put the caret at the end of the word, or select the word, then add a
footnote.** Both land the insertion point on the boundary immediately before the span's closing
glyph.

Lexical's generic `selection.insertNodes()` treats that boundary as a place to SPLIT the enclosing
char span — it is a child boundary with nothing but the closer beyond it. The split leaves a content
half plus a second span holding nothing but the orphaned `\nd*`. `$charNodeDeletionTransform` then
reads that half's missing opener as "opener deleted", and `$unwrapCharNode` drops every marker glyph
on unwrap — so the closer was destroyed. The screen kept showing a styled word while the file lost
the span's end, and the serialized USJ picked up a derived `closed="false"` nobody asked for.

Fixed in `libs/shared-react/src/nodes/usj/note.utils.ts`: `$insertNoteWithSelect` now places the note
at that one boundary itself instead of delegating placement to `insertNodes`. That is the same shape
the `\fp` break in `markerEditNote.utils.ts` already uses, for the same reason.

**Why placement and not the unwrap.** Teaching `$unwrapCharNode` to spare closing glyphs was the
other candidate and is wrong: dropping the glyphs is correct when the user really did delete an
opener, and is pinned that way. The defect is the fragment, not the dissolve.

**One caret position was left as-is deliberately.** With the caret PAST the closing glyph the note
lands outside the span, and mid-content it nests with the closer intact. Both were already correct
and are now pinned so the fix cannot drift into them.

### X2 — Ctrl+Space inside `\ft` now emits `\ft*` (owner ruling, implemented)

The two gestures **did** share the char-stack primitive, as the plan suspected. `$liftOutOfChar` /
`$liftOutOfCharStack` already diverged inside themselves at `$endsImplicitly` — a `\fq` takes the
absorb branch, Ctrl+Space's space takes close-and-reopen — but the close-and-reopen branch never gave
the left half a real closer. That is the whole bug.

They now take an options object with an explicit `closeImplicitSpans`, and **only the two Ctrl+Space
call sites pass it**. The three marker-insertion callers do not, so inserting `\fq`/`\fp` inside
`\ft` still emits nothing extra. Per the plan's instruction, the insertion behavior was pinned FIRST,
in its own commit, before the primitive changed — in `markerMenuApply.utils.test.tsx` and
`noteEnterFp.test.tsx`, both asserting serialized USJ against the tokenizer's reading of the expected
bytes.

**A derived rule was considered and rejected on evidence.** "Emit the closer whenever the node after
the left half cannot terminate it" reads correctly, but the marker-menu RANGE apply lifts a *text*
node and inserts the `\fq` afterwards — so a derived rule would have started emitting `\ft*` on
marker insertion, which the constraint forbids. Per-caller is not a compromise here; it is the only
shape that distinguishes the two gestures.

The fix keys on the span's own `closed` state, never on a marker or node-class list, so an unclosed
`\nd` in a paragraph gets the same treatment for the same reason. PT9's reopen-order divergence
(close innermost-out, reopen outermost-in) is untouched.

**One judgement call you should know about: the ruling was extended to the RANGE gesture.** The
report only covered the collapsed caret, but range Ctrl+Space inside `\ft` had the identical silent
no-op — the "unformatted" middle re-read as `\ft` content. Same gesture, same ruling, and leaving it
would knowingly keep a silent no-op that Invariant I forbids. It is pinned. Say the word if you want
it reverted to caret-only.

Also surfaced and deliberately left alone: a continuation span whose content BEGINS with a space
loses one on round-trip (the writer emits its own structural space and the tokenizer consumes both).
It affects `\nd` identically and predates this work — whitespace-ownership territory, noted at the
test fixture.

### S1 — a settle is never its own undo entry (owner ruling, implemented)

The condition is gone: every settle is tagged now, mutated or not. One Ctrl+Z undoes the user's edit
together with whatever settle it caused, which is the ruling. The USJ-comparison gate was **not**
reintroduced — the rationale for both halves is recorded at the code, including the
"undo must restore the pre-settle literal" argument that is knowingly traded away.

**The blast radius was not the undo tests. It was the delta plugin, and it was a real bug.**

`DeltaOnChangePlugin` skips every commit carrying Lexical's `HISTORY_MERGE_TAG` — a guard aimed at
Lexical's own bookkeeping commits, which really do change nothing. The moment a settle carried that
tag to stay out of the undo stack, the two meanings the tag was doing double duty for came apart: the
settle's bytes really did change. That plugin is what refreshes the cached USJ and emits collab
deltas, so settled bytes stopped reaching the host — **`getUsj()` returned the pre-settle document,
with the editor showing one thing and the save writing another.** Nineteen `settledGetUsj`
equivalence cases and both `transientInput` reads caught it.

Fixed with a `MARKER_SETTLE_TAG` the delta plugin exempts. Dropping `ignoreHistoryMergeTagChange`
instead would have let Lexical's transform-registration sweep through — it dirties every node, so a
full-document delta diff on every host re-render.

This is worth remembering beyond S1: **`HISTORY_MERGE_TAG` is overloaded in this codebase**, meaning
both "do not push a history entry" and "nothing to report". Anything else that reaches for it needs
to say which.

**Scope extension, in its own revertible commit.** The blur handler and the host's forced pre-save
commit still pushed their own entries — the same defect shape (click away and back, and the first
Ctrl+Z undoes the blur's settle; on the save path a background timer eats the press). Both now use
the shared wrapper. The Enter handler deliberately does not: its update already carries the user's
own keystroke.

**Existing tests whose expectations changed**, all classified as encoding the old behavior rather
than catching a problem: six in `markerEditUndoResettle`, one in `markerEditUndoRerenderResettle`,
the A2 undo test, one in `debounceSettle`, one in `glyphDriftHeal`. Most are setup-only — the
departure now edits the destination paragraph, because a caret-only departure dirties nothing and the
settle correctly merges into the typing entry. Three are genuine step-count changes (a re-settle no
longer adds an entry). **No test lost user content**, and nothing was blanket-updated to pass.

Redo stayed coherent, and is slightly better: `HISTORY_MERGE` does not clear the redo stack, where
the old push did.

The invariants doc needed updating and was: §4's ratified line read *"multi-step undo for palette
applies and settles"*. The apply half stands; the settle half is retired, with the new rule, the four
settle paths, the retained counter-argument, and the explicit rejection of the USJ-comparison gate.

### P4 — the top dropdown failed silently

The chain is fully wired and works whenever a selection exists. The dropdown is the **only** one of
the four marker-apply surfaces that does not call `restoreSelectionIfLost` first, and its Radix
popover takes focus off `.editor-input`, where Lexical's blur processing can null the selection.
`formatPara` then returned **silently** — which is exactly why this bug left no log evidence for
anyone to find.

`formatPara` now refuses out loud, matching `commitTypedMarker` and `replaceEmbedUpdate`. That is
deliberately a diagnostic, not a cure: **the repair is host-side** (the dropdown should restore the
selection like its three siblings do), and the host is a separate repo. The manual step names the
console line that distinguishes the two hypotheses.

### C5 — Up/Down on a verse marker jumped to the next paragraph

Reproduces deterministically, and it was a **node-class question standing in for a property** — the
exact shape the plan warned this register is full of.

`$shouldAttemptVerticalVerseNavigation` asked `$isSomeVerseNode(anchorNode)`. The verse jump exists
to substitute for a position the browser genuinely *cannot* move a visual line from: an element point
between blocks, or a spot beside a verse number that is a childless decorator hosting no caret of its
own. With editable markers a verse marker is ordinary rendered text the caret walks a character at a
time — the browser's own line movement is right there, and the substitute was overriding it. The
branch could only ever fire in editable-marker mode, and it arrived with no test.

Restated as the property it always meant: the position must host no caret of its own
(`$isDecoratorNode`). The one text spelling still claimed — offset 0 after a caret-less verse number
— is the same screen location as the element point Lexical normalizes to it, and where the marker is
glyph text Lexical resolves that offset back onto the glyph's end, so the location cannot answer
twice. Measured, not assumed.

The six new tests assert the **decision** (whether the press was claimed), not the landing: jsdom
performs no visual-line move, so "the caret did not move" would pass for the wrong reason.

### C6 — the caret after a trailing footnote: half fixed, half needs a ruling

**Fixed, contained:** the forward arrow used to step INTO a collapsed note that ends its paragraph,
landing on the hidden closing `\f*` glyph. Inside a collapsed note the caret is invisible *and*
typing silently edits the note body — the wrong bytes change. It now lands past the note, where
nothing changes and one backward press recovers. The pre-existing `TODO` is replaced by a documented
known-gap comment.

**Still open, and it is a design question, not a caret fix.** The position past a trailing note is an
element point with **no text node**, and a browser draws no insertion point where there is no
rendered text — which is why the next keypress becomes the page's rather than the editor's ("Space
scrolls the page"). Closing that means giving the position something to render in.

What jsdom could and could not establish is worth stating precisely. Established: the position past
the note is element-only; the forward arrow rests there and claims the press; one backward press
recovers to the text before the note (matching your "arrow-left works"); and a caret placed *inside*
the note is NOT recovered by one backward press — which is the discriminator saying the click lands
on the element point rather than inside the note. Not established, and inferred from your symptoms
rather than measured: which DOM position a real click actually produces, and whether a browser paints
a caret at an element point. No layout, no hit testing, no `caretRangeFromPoint` in jsdom.

**Options, with the recommendation:**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | A transient zero-width caret host after a trailing note | ~120 lines + tests. Decisively: every exclusion path already exists AND already covers that node — the save tag, the delta/OT offset exclusion, the USJ serializer. It is the `EmptyVerseCaretGuardPlugin` pattern, already shipped here for the identical reason. The only option that supplies the missing position, and it does not depend on which click landing turns out to be real. |
| **B (stop-gap)** | Correct the click, as the para-prefix guard already does via `CLICK_COMMAND` | ~20 lines, no new node/serialization/delta surface. Fixes the symptom but makes "type after a footnote at paragraph end" permanently unreachable — which is the status quo, but ratifying it is a product decision. Compatible with A later. |
| C | A DOM-only caret box | Rejected — fights the reconciler; the browser needs a real text node, which is A. |
| D | A real trailing space (free in the *file* per the writer's newline rule) | Rejected — still a fabricated USJ byte, exactly the `$addTrailingSpace` fabrication this effort removed, and it would turn the fixed-point test red. |

Full analysis in `../plans/2026-08-19-co-caret.md`.

---

## New defect found while pinning something else

### V3 — a half-typed verse bridge is silently dropped on save

> **RESOLVED — this section is superseded (2026-08-20).** The owner ruled that `\v 5-` is legal on
> screen, and the branch had already gone further than the narrow proposal below: `727f6a5c` made a
> verse or chapter number the whole WORD the user typed (PT9's `GetNextWord`), superseding
> `a32bcc6a`'s `[-,]?` fix. The divergence pin now asserts the byte survives on all three legs. See
> the V3 entry in `2026-08-19-reported-bug-register.md` for the current record; the analysis below is
> kept for the mechanism it explains.

Verse bridging works and is now pinned. But with a bridge HALF typed — `\v 5-`, mid-keystroke — the
glyph and `VerseNode.__number` both carry the trailing separator and **the serializer does not**:
`parseNumberFromMarkerText` matches the last COMPLETE verse-number token and then overrides the
node's faithful number with the truncated parse. A save at that moment silently drops a byte the
screen is showing, which is Invariant I's core prohibition. It is also a round-trip loss, since our
own tokenizer keeps `5-` (a verse number is the whole word, valid or not).

Pinned as the divergence it is, **not** as desired behavior, with the test comment naming which
assertion flips when a fix lands.

**Not fixed, because it is a decision about what a verse number may contain.** The narrowest
candidate is to let the token end on a trailing `-`/`,`:
`/^(\d+[a-zA-Z]*(?:[-,]\d+[a-zA-Z]*)*[-,]?)/`. That leaves the shapes the sibling suites pin
untouched — `\v 7 5` stays verse 7 plus body text `5`, and `\v 2\ Da` stays verse 2 plus the
literal. Your call.

---

## Wave 6 triage, in brief

| Report | Verdict |
| --- | --- |
| **E3** Enter's temporary line | **Half of it does not exist.** Enter never inserts anything — the in-editor menu claims `INSERT_PARAGRAPH_COMMAND` at CRITICAL, and in production the host claims Enter in the capture phase and only splits on commit. So "disappears if no marker is chosen" already holds and was already pinned; "shows a temporary new line" was never built. Needs your decision on whether you still want it. |
| **P4** dropdown does not retag | Diagnosed; see above. Repair is host-side. |
| **U5** cannot copy the marker name | **Reproduces, but not for the recorded reason.** The handoff that called the name "genuinely inert" was wrong — it IS real DOM text, and a selection spanning the block carries the block's full USFM in `text/plain`. Two real halves survive: `text/html` drops the whole block (so a paste into a word processor loses the marker name AND the figure's caption), and the block cannot be selected alone because it is read-only per the U6 ruling. All three payloads are now pinned. |
| **V1** Simple mode | **Shipped — does not reproduce.** Standard is unreachable in Simple mode by three mechanisms in paranext-core, unit-tested there. Made MOOT rather than fixed: structure protection is still derived independently of view type. The decision was never written down anywhere. |
| **V3** verse bridging | Works, pinned; one new defect found — see above. |
| **V4** corpus rendering check | **Built, and it was genuinely cheap.** Both corpus suites already mount the editor and throw the DOM away; the new leg reads what they already produce. A node that reports text content must render it, at load and after the dirty pass — stated over `TextNode`/`DecoratorNode` rather than a class list, so CSS-generated glyphs fall out of scope by construction rather than by exemption. Verified discriminating by blanking a decorator's `createDOM`. |

**What V4 cannot do, stated plainly:** it cannot check anything the stylesheet paints. No stylesheet
is loaded in any test in this repo, and whole view modes are painted with `content: attr(...)` over
`font-size: 0` text. A jsdom assertion there would pass on markup the user cannot see and fail on
markup they can. That needs a browser or visual-regression harness this repo does not have.

---

## What could not be practically tested, and why

### A2 — typed attribute text never settles into real attribute state

**Still open. It did not reproduce under any reading I could construct**, and the register's recorded
explanation for it was wrong.

The register says all attribute-settle work was scoped to attribute *markers*, never char attribute
runs. That is not so: the display-run registry carries a `char` descriptor with all nine duties, and
the exact reported gesture — settle, undo, move off — was already pinned in
`markerEdit/markerEditUndoResettle.test.tsx`.

What that pin genuinely lacked is the app's real plugin stack. This run kind is jointly owned by
`CharNodePlugin`'s self-healing sync, and its documented failure mode is the two plugins interacting:
a historic restore re-derives pends caret-lessly while the sync re-derives the run from the span's
attribute state, and either could undo the other's work without being wrong alone. Re-run with both
syncs around the engine in `Editor.tsx`'s mount order: **still green.**

Also green, and now pinned: a named attribute typed at a closed span's content end, `\w`'s BARE
default attribute (`|G5485` — the one spelling where the attribute name is nowhere in the bytes), and
a second attribute appended to an existing run.

One case looks like the bug and is **correct**: on an UNCLOSED span the `|…` bytes stay content and
never become attributes. With no closing marker there is no attribute position, the tokenizer says
so, and a settle that parsed them would invent attributes the file never had. Unclosed spans are
ordinary here — a Space palette commit builds one, and note content is unclosed throughout — so this
is probably the single most likely thing to be mistaken for the report.

Every assertion in that suite is checked against `usfmFragmentToUsjContent` rather than a
hand-written expectation, because settle IS re-tokenization: a pin that hard-codes its own answer can
drift away from the tokenizer without ever failing.

**What I need from you:** the precise gesture. Which marker, whether the span was closed, whether the
attribute text was typed or already present, and what the file showed afterwards.

### The ParatextData leg of the log-storm question

The round-trip evidence below covers `usj -> usx -> usj`, both converters living in this repo.
Whatever ParatextData does to the USX in between — `USX -> USFM -> USX` — is invisible from here. If
you want that closed, it is a C# capture test in paranext-core, which the approval gate explicitly
permits (capture tests that RECORD behavior are encouraged; only changing serialization is gated).

---

## W7/W8 — the caret is deliberate, and the reported "correct" position may not exist

I set out to fix this and stopped, because the measurement says the behavior is designed rather than
accidental. **No code changed. This is a decision for you.**

**What happens.** Put the caret at the very end of an opening char glyph — `\nd|`, before its
separator — and type one space. The space is absorbed into the glyph (`\nd `), and the caret lands at
offset 1 of the NBSP-prefixed content: past both the typed space and the structural separator,
immediately before the content. The emitted USJ is unchanged, correctly — the writer emits the
structural space regardless. So this is purely a caret question.

**Where it comes from.** `$moveCaretPastMarker` in `markerEdit/markerEditTier1.utils.ts`, called from
both arms of Tier 1's in-place rename, with a comment saying exactly what it intends: *"Both para
trailing-space and char NBSP-prefixed content put the caret after offset 1 of the following text
node."* The engine reads a space typed at a complete marker's end as a **terminated opener edit** —
the same gesture as finishing `\s1` and typing the space that ends the name — and lands the caret
where you would type content next. For a real rename that is plainly right. Here the rename is a
no-op (`nd` to `nd`), and the only visible effect is the caret moving two positions for one keystroke.

**Why I am not just "fixing" it.** The position the report asks for — between the typed space and the
NBSP separator — is *inside engine-owned display bytes*. Invariant II says display bytes are excluded
from document positions, so that may not be a position the caret is allowed to hold at all. And both
call sites are shared with the genuine rename path, so changing it changes that too.

**The options:**

| | Behavior | Cost |
| --- | --- | --- |
| **A — leave it** | Caret lands at content start | None. Consistent with the rename path. Requires deciding the report is a misreading of display bytes. |
| **B — special-case the no-op rename** | When the marker name did not change, leave the caret at the glyph's end | Small and contained, but splits one gesture into two behaviors on a distinction the user cannot see. |
| **C — refuse the keystroke** | A space at a complete marker's end changes nothing, so visibly refuse it | Most consistent with "no silent no-ops" — today the keystroke is accepted and discarded, which Invariant I explicitly forbids. Biggest behavior change. |

I lean **C**, then **A**. C is the only option that squarely answers what the invariants say about
this shape: the byte genuinely does not reach the file, and Invariant I's corollary is that a
keystroke either changes the document or is visibly refused. What is happening now — accept, absorb,
move the caret — is precisely the "accepting a keystroke and discarding it later" failure that rule
exists to prevent. But C is a behavior change beyond what the report asked for, so it is yours to
call.

W7 and W8 are the same defect, confirmed by measurement: on a `\+nd` nested inside `\wj` the bytes
and the caret are identical to the flat case. Whatever you choose applies to both.

---

## How the log storms were diagnosed

Worth recording because the answer is "somewhere else, already", and the next person to see those
logs should not re-derive it.

The host line `useEditorPdpSync: deferring an incoming PDP update…` fires once per PDP update that
disagrees with the editor while the editor is focused. An endless run of them therefore needs an
endless run of PDP updates — and those come from the editor saving. Three candidate drivers:

1. **A non-idempotent `usj -> usx -> usj` round-trip**, which the host's own damping comment names as
   the shape that sustains the loop. Every reported byte pattern was run through both converters
   twice. All reach a fixed point. The only differences are USJ key ORDER (`content` before
   `closed`), which the host compares structurally, not as text. **Ruled out.**
2. **The editor cycling commits.** Bounded for all six gestures — and equally bounded at the Phase-3
   anchor, so nothing here changed it. **Ruled out.**
3. **The deferral path logging without a bound.** This was the real one, and paranext-core already
   fixed it: a single warn at the non-convergence threshold with debug otherwise (2026-07-15), plus
   idempotency damping that terminates the echo loop outright (2026-08-03). Both predate the anchor.
   The host already pins all three behaviors in `use-editor-pdp-sync.hook.test.ts`.

The editor half of that evidence landed as `markerEdit/logStormGestures.test.tsx` — one commit bound
per reported gesture. They assert a BOUND, never "eventually quiesces": the engine defers each settle
with `queueMicrotask`, so a cascade that re-queues on every commit never yields to the macrotask
queue and no timer — vitest's own timeout included — ever runs again. A regression has to fail, not
hang.

---

## What you should verify by hand

Ordered by how much I think it matters. Everything below needs a real browser or a real project —
each is something the headless suite provably cannot answer, not something I skipped.

1. **The typed-space class, in the app.** `\v| 6`, `\v |6`, `\nd| things`, a nested `\+nd`, and a
   `\va`/`\cat` value's end. In each the space should appear and the caret should sit right after
   it. This is the change with the widest reach and the one your report drove.
2. **C6's caret, which is the whole point of the host.** Click to the right of a footnote caller that
   ends a paragraph. Does a caret appear, and does Space type a space rather than scrolling the
   page? jsdom has no layout, no hit testing and no `caretRangeFromPoint`, so whether a browser
   PAINTS a caret in the host, and which DOM position a real click resolves to, are the two things
   only you can establish.
3. **Empty attributes end to end.** `\qt-s |who=""\*` and `\qt-s |sid="stuff" who=""\*` now reach
   the USX as `who=""`. Whether ParatextData writes them back out is the C# side and invisible from
   here.
4. **The glyph-position fix at the reported gestures.** Insert a footnote with the caret inside a
   verse marker; apply `\nd` with the caret inside a `\add*`; drag a selection that starts at an
   opening glyph. None should fabricate or destroy bytes.
5. **U5's browser half** — whether a real browser lets you select an unknown block's marker name
   alone. Copying across the block and pasting into a word processor loses the marker name and the
   caption, because `text/html` drops the block entirely.
6. **P4 in the app**, watching the console. `formatPara` now says out loud when it refuses; that line
   distinguishes "the selection was lost" from "the retag ran and did nothing".
7. **C1, M1, W3** — all three were triaged this round and do not reproduce headlessly, but none was
   on your spot-check list, so a hand pass would close them properly.
8. **N1 and M2 in a real project.** Both are pinned headlessly; note insertion in Platform.Bible goes
   through the popover and the host's editing-session plumbing, which is where this class has
   surprised us before.

## Sequencing notes for whoever picks this up

- `sv/closeout` was branched before `sv/fb5/milestone-edit` and `sv/fb5/table-caret` merged. Both are
  in `sv/residual-backlog` now.
- `ArrowNavigationPlugin` was owned by `sv/fb5/table-caret` until it merged, so C5 and C6 were taken
  last, on a branch based on `sv/residual-backlog` rather than on this one. Both are folded in.
- The pre-existing `TODO` in that plugin naming C6's structural gap is gone, replaced by a documented
  known-gap comment at the function that now lands the caret past a trailing note.
