# Standard view: bug-register closeout handoff

Companion to `2026-08-19-reported-bug-register.md` (what was reported) and
`../plans/2026-08-19-bug-register-closeout.md` (how it was to be closed out). This says what
actually happened.

Branch: `sv/closeout`. Anchors used for the bisect: **`f0800f35`** (the Phase-3 branch point) and
**`85fec66d`** (the standard-view tip it was rebased onto). Bare paths are relative to
`packages/platform/src/editor/`.

---

## The short version

The premise held. Most of what was still open in the register was **not** broken — but almost none
of it was pinned, so nobody could have known that. The round converted the register into tests; the
tests then did the triage.

One real defect was found and fixed (**N1**), one more was found, measured, and left for an owner
decision (**W7/W8**), and one report remains open with no headless repro (**A2**).

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

Ordered by how much I think it matters.

1. **A2.** Give me the precise gesture (see above). This is the one open report where I have no repro
   and you do.
2. **W7/W8's caret.** Type a space at the very end of an opening char glyph — `\nd|` before its
   separator. The typed space is absorbed into the glyph and the caret advances past the structural
   separator as well, landing immediately before the content. Confirm that is what you originally
   saw, and confirm the fix you want is "caret stays immediately after the typed byte". The bytes are
   already right; this is purely the caret.
3. **The ParatextData round-trip leg**, if the deferral logs ever come back. Everything on this side
   of it is clean.
4. **M2** in a real project. It is fixed on `sv/fb5/milestone-edit` (merged to
   `sv/residual-backlog`) rather than by this round; I confirmed it RED at this branch's pre-rebase
   base by running that branch's own test here, so the register entry is now evidenced either way.
5. **N1 in the real app.** The fix is pinned headlessly across five caret positions, but note
   insertion in Platform.Bible goes through the popover and the host's editing-session plumbing, and
   this class has burned us before precisely where the headless harness stopped.

---

## Sequencing notes for whoever picks this up

- `sv/closeout` was branched before `sv/fb5/milestone-edit` and `sv/fb5/table-caret` merged. Both are
  in `sv/residual-backlog` now.
- `ArrowNavigationPlugin` was owned by `sv/fb5/table-caret` for the duration of this round, which is
  why **C5** and **C6** were not attempted here. C6 additionally has a pre-existing `TODO` in that
  plugin naming the structural gap — there is no text position after a trailing note — so it is a
  design question, not only a caret fix.
