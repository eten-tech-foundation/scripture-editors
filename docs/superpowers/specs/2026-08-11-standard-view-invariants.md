# Standard view: shared invariants

Status: reference card (2026-08-11). Read this before starting any Standard-view track; every track
plan references it.

This is deliberately short. It records the rules that MORE THAN ONE track depends on, so parallel
work cannot drift. It is not a design doc — the per-track plans carry the designs, and the older
specs in this directory carry the history.

Path convention: bare repo paths are relative to `scripture-editors`. paranext-core paths are
labeled as such.

---

## 1. Governing invariants

### I. Displayed bytes are the document

Every byte the user can place a caret in is document text. Changing it changes the file, by
**re-tokenizing the displayed bytes**.

The one exception is insignificant whitespace that the USFM writer normalizes away anyway (§3) — a
trailing space at the end of a paragraph is legal and useful in the editor, because the writer's
newline consumes it.

Corollaries, each of which has its own derived rule in §2:

- Never heal against a user edit. Healing exists for drift introduced by non-user code paths.
- Structural truth is re-tokenization. In-place mutation is an optimization, valid only where
  re-tokenization is provably identity.
- No silent no-ops. A keystroke either changes the document or is visibly refused. Accepting a
  keystroke and discarding it later is the failure this rule exists to prevent.

### II. One position language

Display bytes (marker glyphs, separators, attribute-run text, verse glyphs, para prefixes) are
excluded from document positions in exactly ONE place. Caret anchoring across a rebuild, OT content
op offsets, and delta-doc positions all resolve through it.

Today they do not, and the cost is visible in history: each new display-byte class had to be
excluded separately, each after a bug.

### III. One lifecycle for engine-owned display things

Every kind the engine owns — attribute runs, milestone runs, verse `\va`/`\vp` runs, opener
glyphs, closing glyphs, the nested `+`, opener separators, para-marker prefixes, optbreak bytes —
carries the same four duties:

1. **construct** canonically,
2. **heal** non-user drift,
3. **pend** on user edit or deletion,
4. **settle** on departure.

A kind wired for some duties and not others is the recurring defect shape ("missing quadrant"). New
kinds join the registry; they do not hand-wire a fifth quartet.

### IV. Settle has two clocks and one definition

- **On screen**: caret departure, OR a Paratext-9-style debounce timer.
- **For consumers**: `getUsj()` returns settled output without mutating the editor.

All three paths run the SAME settle computation. Divergence between them is a defect, not a
trade-off.

### V. A loaded document is a transform fixed point

Load a document, dirty every node, run the update, serialize. The output must equal the input.

Any difference means a transform fabricated content, deleted content, or the load shape was not
canonical. All three are bugs. This invariant is machine-checkable and has a test (§6).

---

## 2. Derived rules

Each of these was settled by investigation or product decision. Do not re-derive them per track.

### Heal by provenance, never by caret proximity

Whether to restore an engine-owned byte depends on WHO removed it, not on where the caret is.
Caret-proximity heuristics are what let deletions silently miss their pend (the stale-attribute
class). Machine drift heals; a user edit pends.

### The tokenize-identity predicate

> Restore a removed engine-owned byte iff the bytes tokenize IDENTICALLY without it.

Applied to the opener separator:

| Bytes | Without the space | Same meaning? |
| --- | --- | --- |
| `\nd` + `\wj stuff` | `\nd\wj stuff` | yes — name scan stops at `\` either way. **Heal.** |
| `\nd` + `\|x="y"` | `\nd\|x="y"` | yes — name scan stops at `\|` either way. **Heal.** |
| `\nd` + `things` | `\ndthings` | no — the marker is now `ndthings`. **Rename.** |
| `\nd` + `*stuff` | `\nd*stuff` | **no — that is a CLOSING marker.** Do not heal. |

The last row is why this rule must be defined by MEANING and not by a character class. `*` is one of
the tokenizer's four name-scan terminators (`\`, `|`, whitespace, `*`), so an allowlist built from
terminators would wrongly heal it and silently prevent the user from typing a closer.

Cost: the question is local — it depends only on the bytes around the site — so the common path is
O(1) using the tokenizer's own name-scan rule, with a paragraph-scoped tokenize only for ambiguous
shapes. Paragraph-scoped tokenization already runs at keystroke rate on the terminated-marker path,
so the ceiling is proven affordable.

The predicate belongs in `shared`, beside the tokenizer, so it cannot drift from it.

### Leading-attribute whitespace collapses

Whitespace between a marker and its leading-attribute value is structural and collapses to one.

Which markers have leading attributes, and in what order, comes from paranext-core's markers map
field `leadingAttributes` — **not** from a list maintained here. The map defines them as
"attributes in USJ/USX that are listed in USFM directly after the marker and separated only by a
space," and the list is ordered.

So `\v  5` is verse 5, `\c  3` is chapter 3, `\f  +` has caller `+`, `\id  MAT` has code `MAT` — one
rule, no per-marker exceptions.

Consequence: a space typed next to a verse cannot demote its number. Only a non-space character
after the number does that: `\v 7 5` is verse 7 followed by body text `5`.

### Note callers are atomic in Standard view

A collapsed note caller is ONE unit: arrow keys step over it whole, deletion removes it whole, and
its text is not editable by typing. This matches Paratext 9, and the caller is changed through the
footnote editor's UI instead.

This is a VIEW-level rule, not a node-level one — a future Paratext-9-parity unformatted view will
want direct caller editing.

Key it on `noteMode === "collapsed"`. The future unformatted view will not use collapsed notes, so
the two axes cannot collide and no separate flag is needed.

### No silent no-ops

Restated from Invariant I because it is the most-violated rule and the easiest to test. Concrete
failures it forbids: a typed space that vanishes; an edit to a preserved-sentinel node that is
accepted on screen and discarded on the next rebuild; a palette commit with no candidates that
leaves an orphaned overlay.

### Prefer a declared property over a new exception list

Before adding a per-marker special case, check whether paranext-core's markers map already declares
the property. `leadingAttributes`, `attributeMarkers`, `textContentAttribute`, and
`defaultAttribute` are all declared there, ordered, and versioned (3.0/3.1, spec/Paratext).

But do not assume the map can express everything. The editor's `ATTRIBUTE_MARKERS` table and the
markers map were checked against each other and **agree on every marker, attribute name, shape, and
host** — the problem is duplication, not divergence. Each side holds facts the other cannot
represent:

- **Map only:** `hasStructuralSpaceAfterCloseAttributeMarker` (true for `ca`/`va`/`vp`, absent for
  `cp`/`cat`); the map-level `isSpaceAfterAttributeMarkersContent` spec-vs-Paratext switch; version
  and spec/Paratext variants.
- **Editor only, and load-bearing:** a same-line space before an attribute marker BLOCKS the fold
  (Paratext parse behavior, no map representation); markup inside the content aborts the fold; an
  empty span is never an empty attribute; `cat` is receptive only directly after `\esb` or right
  after a note's caller.

The map models the SERIALIZER (USJ to USFM, spec-declarative). The editor's table models the PARSER
(USFM to USJ, deliberately matching ParatextData rather than the spec). So the rule is: **derive the
shared facts from the map; keep the parser-behavior deltas local, explicit, and named.** Do not
collapse one into the other.

---

## 3. The USJ-to-USFM writer contract

`UsjReaderWriter.toUsfm()` — paranext-core, `lib/platform-bible-utils/src/scripture/usj-reader-writer.ts`.
Three tracks depend on this and none of it is obvious from the editor side.

1. **No separators between content items.** Text chunks are concatenated verbatim
   (`usj-reader-writer.ts:1735`: *"Note that there are no spaces between the text chunks. If we need
   spaces inserted between verses, chapters, etc. then we should adjust how we walk through the tree
   to insert extra spaces at the right times."*).

   **Consequence:** word separation between a text run and whatever follows it lives entirely inside
   the USJ text strings. A text node that loses its trailing space before a verse, char span, or
   note produces jammed words in the file. This is why trailing-space maintenance exists and why it
   cannot simply be deleted.

2. **A structural space is emitted after an opening marker** (`:2206`). It is removed only when the
   marker's type has an EMPTY closing marker — milestones — and the marker closes with no content
   and no closing attributes (`:2697`).

3. **A newline before a block marker consumes one trailing space** (`:2727`: *"If there's supposed to
   be a newline before the marker, it should eat the last space if there is one"*).

   **Consequence:** a trailing space at the end of a paragraph is free in the file. The editor should
   allow it and let the writer normalize it, rather than deleting it early.

4. **End of file always gets a newline**, likely replacing a space (`:3355`).

**Open question, owned by the attribute-markers track:** `:2733-2741` hardcodes a `\n ` before `ca`
following a chapter marker, with its own comment doubting the behavior. Resolve it by pinning
ParatextData's actual output with a capture test, following the existing capture-test pattern —
not by reasoning from the comment.

---

## 4. Confirmed-intentional behavior

Do not "fix" these. They were reviewed and ratified.

**Revised 2026-08-18, owner-directed: the `\` palette is ACTIVE.** The owner retired the passive
palette by direct instruction: the trigger `\` never lands in the document (preventDefaulted in
every selection shape), and subsequent typing filters the palette — it does not reach the
document in any context (collapsed caret, selection, note content alike). The Space/Enter APPLY
semantics below are unchanged from the original ratified table; only the PASSIVE/ACTIVE axis
(where typed characters go before commit) and the Escape row changed.

| Behavior | `\marker` + Space | `\marker` + Enter |
| --- | --- | --- |
| Palette | Active; typed query filters, commits on Space | Active; commits the highlighted item |
| Who completes the marker | Tier 2 — the commit materializes the typed query as the passive literal bytes (`\` + query + space) in one update and Tier 2 resolves them | The apply path |
| Closing marker | **none** — span records `closed="false"` | **inserted** |
| Marker chosen | whatever was literally typed (the palette query) | whatever is highlighted |
| Unknown marker | settles as unknown (the materialized literal settles as typed) | cannot commit one not in the list |
| `\f` specifically | commits like Enter (emergent from the tokenizer: `\f ` tokenizes to the full note) | commits |
| Zero matches (typed filter matches nothing) | commits the typed text as the marker and closes (unknown settles as typed) | **no-op — the palette stays open** (Backspace widens the filter, Space commits typed, Escape closes) |
| Escape | **closes the palette, document untouched** | **closes the palette, document untouched** |
| Space over a non-collapsed selection | wraps the selection in the typed marker's closed span (exact match against the offered entries; a marker not offered refuses visibly — palette closed, selection intact) | n/a (Enter commits the highlighted item, wrapping the selection) |

**Escape row change (2026-08-18, owner-directed):** the original ratified row was "leaves the
typed literal". That row described the passive palette, where the literal was already in the
document before Escape; under the active palette nothing lands, so Escape leaves the document
byte-identical. This is a deliberate ratified-table update, not a regression.

**Zero-match row (2026-08-18, owner-directed, P9 parity — revises the earlier zero-candidate
dismiss):** in Paratext 9, Enter over a palette with zero matches does nothing and the palette
stays open — that was intentional; Space inserts the typed marker and closes; Escape closes
without inserting. The earlier behavior (Enter dismissing the zero-match palette) was this
project's invention and is retired. Applies to both the `\` palette and the Enter-triggered
paragraph menu.

**Closing markers over a selection (2026-08-19, owner-directed, P9 parity).** Typing `\nd*` with
text selected DELETES the selected content and lands the literal `\nd*` in its place — unmatched
unless an open `\nd` precedes it. This is a different gesture from Space's WRAP, so the two keys
are not interchangeable over a selection, and `*` is therefore a commit key in EVERY selection
shape (it is no longer a filter character anywhere). The same end state now applies to a PICKED
`closeTag` entry over a selection, which was previously a silent no-op: `$closeCharSpanAtCaret`
required a collapsed selection and the apply discarded its `false`. **Collapsed-caret behavior of
both paths is unchanged**, including their documented divergence — a typed closer lands literally,
while a picked entry runs the structural close, which at a span's content end changes no text.

**`\` as a third commit key (2026-08-19, owner-directed).** With a palette open and a NON-EMPTY
filter, `\` commits what was typed exactly as Space does — same passive-Space end states — but with
NO terminating space byte, and then opens a FRESH palette for the backslash just pressed. Typing
`\qt-s\qt-e` is therefore one continuous flow instead of losing the first marker to a stray
backslash. Dropping the separator is safe because a marker-name scan terminates at the next `\` (and
at end-of-text): measured, `\nd` and `\nd ` settle to the same open span at a caret. With an EMPTY
filter there is nothing to commit, so `\` stays an ordinary character — it lands in the document and
no replacement palette opens. The trigger itself still never lands (the active-palette rule above):
landing it was measured to be strictly worse, since `\nd\` makes the backslash the span's CONTENT
and, mid-text, drops the following text entirely.

The former defect row — "Space with a non-collapsed selection does nothing" — was fixed by the
residual-backlog palette group (Space wraps like Enter, closed span) and holds under the active
palette.

Also intentional and previously ratified: type-through-split versus palette-retag; multi-step undo
for palette applies. See `2026-07-07-standard-view-followups.md`. (Under the active palette a Space
commit is fewer history steps than passive per-keystroke typing was — the materialize-and-settle
happens in one gesture — while item applies remain multi-step.)

**Settles are no longer part of that row (2026-08-19, owner-directed).** The ratified entry read
"multi-step undo for palette applies AND SETTLES"; the settle half is retired. **A settle is never
its own undo entry.** Undo undoes what the USER did — a typed character, a deletion — so every
settle merges into the history entry of the edit that provoked it, and one Ctrl+Z takes the edit
and its settle away together. The reported gesture: delete a char marker's backslash, let the
settle degrade the span to normal text, retype the backslash, let it settle back into a real
marker — the first Ctrl+Z undid that settle and left the typed backslash on screen.

All four settle paths merge (the caret-departure clock, the idle clock, blur, and the host's forced
pre-save commit); Enter's settle already rode in the update carrying the user's own keystroke. The
counter-argument the old behavior rested on — "undo must restore the pre-settle literal" — is
weaker now that marker resolution made openers and closers editable in place, but not gone: the
literal form is still the only way to edit some shapes as raw bytes. That cost is the accepted
trade. A settle commit is still a real content change and must reach USJ-change consumers, so it
carries `MARKER_SETTLE_TAG` alongside the merge tag — `DeltaOnChangePlugin` skips merge-tagged
commits, and without the exemption `getUsj()` would return the pre-settle document.

A narrower gate — merge only settles that are USFM-equivalent, by comparing canonical USJ before
and after — was considered and REJECTED on cost: two full-document serializations per settle, on
both the departure and the idle clock. Do not reintroduce it.

---

## 5. Fixed points

Extend these; never weaken them.

- The tokenizer and losslessness core: `usfmFragmentToUsjContent`, `extractAttributes`,
  `scanMilestone`, NBSP/space flattening.
- `canonicalAttributeText`.
- The editor-to-USJ and delta exclusion gating.
- Tier 2's preserve-or-refuse machinery: fixed-point signature, sentinel symmetry, guard rails.
- The corpus losslessness and round-trip property tests. The corpus must stay 141/141 with zero
  skips throughout every track.

---

## 5a. Approval gate: C# serialization

**Do not change C# serialization code without discussing it with the repo owner first.** This is a
human approval gate, not a technical constraint, and it binds every track.

Several tracks legitimately investigate the USJ-to-USFM and USX-to-USFM paths, and at least one open
question — where the `\cat*` space is actually lost — may well land on the C# side. That is expected.
What is not permitted is fixing it unilaterally.

If you find a defect in the USJ/USFM conversion paths that lives in C#:

1. Stop before editing.
2. Bring the owner the PROBLEM and your PROPOSED SOLUTION together — what the defect is, how you
   established it, and what you would change.
3. Wait for a decision.

Capture tests that RECORD ParatextData's behavior are encouraged and are not covered by this gate —
pinning what the C# side does today is how these questions get settled. The gate is on changing the
serialization behavior itself.

---

## 6. The fixed-point test

Invariant V's enforcement arm, and the safety net every other track relies on. It belongs to the
whitespace track and should land before the others begin editing.

Today `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts` calls
`serializeEditorState` and `deserializeSerializedEditorState` directly, with no editor instance and
no plugins mounted. The ADAPTORS are in the round-trip net; the TRANSFORM layer never has been.

The gap matters because transforms do not run on `setEditorState` — they run when a node is
dirtied. So a transform that fabricates or deletes content does so on the user's first edit to a
region, not at load, and nothing currently catches it.

Shape:

- Mount the production plugin set (the composed-test harness in
  `packages/platform/src/editor/markerEdit/markerEdit.test-helpers.tsx` already does this).
- Per corpus fixture, load, `markDirty()` every node, run the update, serialize, diff against the
  loaded USJ.
- `markDirty()` rather than an edit, so transforms fire without content changing and any diff is
  unambiguously the transform's doing.
- Assert with all nodes dirtied in one pass — that is the regression net. Fall back to
  one-node-at-a-time only as a diagnostic when it fails, to localize the culprit.
- Scope the dirty sweep to Standard view; the other view modes stay on the existing pure-function
  path, so the fixture matrix does not multiply.

Write it red first. It is expected to fail on the two confirmed defects below.

---

## 7. Confirmed defects this work removes

Reproduced, not theorized.

**Deleting a lone space.** `$textNodeTrailingSpaceTransform` sets a TextNode whose entire content is
one space to empty, unless the next sibling is a verse. Reachable at the end of an empty paragraph,
and when wrapping a whitespace-only selection. The codebase already navigates around this hazard —
`markerEditComposed.test.tsx`'s header reasons about whether it would eat the Ctrl+Space separator.

**Fabricating a space.** Two sources: `$addTrailingSpace` appends to a dirtied text node that is not
exempt and is not the paragraph's last child; `$verseNodeTransform` inserts a real `" "` TextNode
before a dirtied verse whose previous sibling is not plain text. Under writer rule 1 that inserted
space is genuine USJ content, so editing one word rewrites a byte elsewhere in the paragraph.

The fixed-point test (§6) catches this today. On first run, 2 of 21 corpus fixtures fail, both
`$addTrailingSpace` fabrications on the two unexempted next-sibling classes:

| Fixture | Loaded | After dirtying | Next sibling |
| --- | --- | --- | --- |
| milestones | `"Translator section text."` | `"Translator section text. "` | `MilestoneNode` (`ts-e`) |
| figure (USFM 3 attributes) | `"Text with figure."` | `"Text with figure. "` | block `UnknownNode` |

The DELETION half does not surface in the corpus — the fixtures are authored USX and contain no
lone-space text nodes — so it needs targeted tests rather than corpus coverage. Both of its
reproductions are user actions: a space typed into an empty paragraph, and wrapping a
whitespace-only selection.

The transform's legitimate job — preserving a space the source file had, across a rebuild, collab
apply, or paste — stays. Fabricating, deleting, and absorbing a typed space do not.

---

## 7a. Known structural blockers

Prerequisites that are larger than the work that needs them. Discover these before scoping, not
during.

**Chapters have no settle path.** Chapter nodes are top-level and Tier 2 never rebuilds them, so
edited chapter bytes have nowhere to settle. Any display of a chapter's `\ca`/`\cp` would recreate
the milestone edit-loss class: editable on screen, silently discarded on save. Already recorded as a
deferral in `2026-07-30-attribute-display-design.md`. **A chapter-edit settle story is a prerequisite
for `ca` and `cp`, independent of their block-versus-inline difference.**

**`cp` is not an inline run.** `AttributeRunNode` is an inline element sitting as a sibling of a
leaf owner. `cp` folds and unfolds to a real block, so it needs either a block-level wrapper or a
`byteFormat.writer` value that does not exist. It also has no closing marker — its fold terminates at
the next block boundary — which the descriptor's `glyphs`/`closerSyntax` vocabulary has no slot for.
And editing it to contain a marker must convert an attribute into a real `ParaNode` and back: a
node-KIND change, where `va`/`vp`'s worst case is only degrading to a standalone char span.

**Note `\cat` is invisible because collapsed note bodies are sentinels.** Sidebar `\cat`, by
contrast, is already rendered inside the sidebar's read-only `UnknownNode` bytes. So the two halves
of "make `cat` visible and editable" have different owners: the note half needs note-content display,
the sidebar half needs `UnknownNode` editability.

**Paratext is wrong about `cp` with markup, and our tokenizer is already right.** In the 2SA-3
fixture ParatextData folds a `cp` containing markers into `pubnumber` and strands the rest at
document root; our tokenizer produces the corrected shape. The corresponding TypeScript test is
`skip`ped with a Discord reference. Any capture test written here must pin the DIVERGENCE
deliberately — do not "fix" our tokenizer to match ParatextData.

---

## 7b. Deliberate divergences from Paratext 9

Places where we knowingly do NOT match PT9. Recorded so a later reader does not "restore parity" and
reintroduce the defect.

**Ctrl+Space reopen order.** PT9's `StyleApplicator` closes the character-style stack
innermost-to-outermost (correct) but REOPENS it innermost-first, which inverts the nesting: a caret
inside `\wj \+nd thing\+nd*\wj*` yields `\nd \+wj …` rather than `\wj \+nd …`. The path is untested in
PT9 — its own test suite only covers single-level cases. We reopen outermost-to-innermost, so the
stack round-trips. Port PT9's INTENT here, not its code.

**`cp` containing markup.** ParatextData folds it into `pubnumber` and strands the remaining markers
at document root; our tokenizer produces the corrected shape (a real `cp` block). The matching
TypeScript fixture test is `skip`ped with a Discord reference. Pin the divergence; do not converge on
ParatextData.

**Closing-glyph spelling.** PT9's `CloseAllCharStyles` builds closers as `Marker + "*"` while its own
marker menu uses the stylesheet's `Endmarker`. The two differ for any tag where `Endmarker` is not
`marker*`. We use one spelling everywhere; see the `closeTag endMarker` follow-up in
`2026-07-07-standard-view-followups.md`.

---

## 7c. Whitespace loss in the USX converters

**The loss is on the PARSE side, not the serialize side.** An earlier revision of this section said
the opposite; it was derived from a round-trip probe that could not tell the two halves apart, and
running the converters separately settles it.

The converters are `packages/utilities/src/converters/usj/` IN THIS REPO — `@eten-tech-foundation/
scripture-utilities` is `packages/utilities`, a sibling of `platform`, `shared`, and `shared-react`.
**Owned by the whitespace track.**

- `usj-to-usx.ts` **elides nothing.** It creates and appends a text node for every string
  unconditionally, and the XML serializer writes whitespace-only nodes verbatim. Unchanged since
  2025.
- `usx-to-usj.ts` drops them. Its first-child branch requires the trimmed value to be non-empty, so a
  whitespace-only first child never becomes text. Its tail-text branch is more careful and rescues an
  exact single space — which is why the loss is asymmetric.

Measured boundary matrix (serialize always correct; every loss is on read-back):

| Shape | Round-trips? |
| --- | --- |
| whitespace-only FIRST child | **lost** |
| whitespace-only ONLY child | **lost** (content is then deleted entirely) |
| whitespace-only LAST child, single space | preserved |
| single space BETWEEN two elements | preserved |
| **multi-space between two elements** | **lost** — only an exact single space is rescued |
| multi-space first child | **lost** |

User-visible form: `\fe + \cat things\cat* \fr …` loses the space after the attribute marker's
closer, which Paratext treats as note text content.

### Two corrections that change what to do next

- **SETTLED (2026-08-17): the loss is on the LOAD leg.** The save path is
  `editor USJ -> usjToUsxString() -> setChapterUSX() -> ParatextData`, and it never calls
  `usxStringToUsj`. The open question was whether the user-visible loss sat on the LOAD leg
  (`getChapterUSX() -> usxStringToUsj -> editor`) or inside ParatextData; the C# capture test
  `NoteLeadingSpaceRoundTripCaptureTests.cs` (paranext-core, `c-sharp-tests/Projects/`) exonerates
  ParatextData, so the loss is `usx-to-usj.ts`'s dropped-whitespace branches — the load leg,
  owned by the whitespace track per the matrix above.
- **`UsjReaderWriter.toUsfm()` remains irrelevant** — byte-exact green on this fixture and not in the
  save path at all. That much still holds; do not use it to reason about save behavior.

### Chapter/verse whitespace-skip asymmetry (ParatextData parse; upgrade tripwire)

ParatextData's attribute-marker folds treat post-close whitespace ASYMMETRICALLY, pinned in
`VerseAttributeFoldRoundTripCaptureTests.cs` (paranext-core, `c-sharp-tests/Projects/`, run
against real ParatextData 9.5.0.22): the CHAPTER path consumes ONE whitespace-only token after a
folded `\ca`, unconditionally (pinned both with and without a `\cp` following), while the VERSE
path does not — a same-line space between `\va*` and `\vp` BLOCKS the `\vp` fold and survives as
content. Post-9.5 ParatextData generalizes the chapter-side skip to the verse side, so the verse
row of that capture test doubles as the upgrade tripwire: when a ParatextData upgrade flips it,
re-derive the editor's fold rules rather than patching the one failing pin.

The regression net is still a USJ-to-USX-to-USJ suite over the existing fixtures, and it will still
go red — but it conflates both converters, so a failure there localizes nothing on its own. Pair it
with a direct USX-to-USJ assertion.
`packages/utilities/src/converters/usj/optbreak-whitespace.test.ts` is the precedent.

---

## 8. File ownership

One owner per file. If a track needs a file it does not own, coordinate rather than edit.

| Track | Owns |
| --- | --- |
| Marker resolution (was "Closers") | `markerEditTier1.utils.ts` (closer paths), `ImmutableUnmatchedNode.ts`, `markerEditDeletion.utils.ts` — plan `2026-08-15-marker-resolution.md` |
| Whitespace | `TextSpacingPlugin.tsx`, `markerSeparators.utils.ts`, `whitespaceDisplay.plugin.utils.ts`, the fixed-point test |
| Char-stack split | `charFormatting.utils.ts`, `markerEditNote.utils.ts` (Enter-in-note), the new shared primitive |
| Attribute markers | `ATTRIBUTE_MARKERS` in `usfmFragmentToUsj.ts`, `attributeDisplay.utils.ts`, the new descriptors |
| Unknown blocks | `UnknownNode.ts`, `unknownUsfm.utils.ts` |
| Host (paranext-core) | `extensions/src/platform-scripture-editor/**`, the collab `closed="false"` test |
| Coordinates | `delta-common.utils.ts`, `editor-delta.adaptor.ts`, caret anchoring |
| Glyph kinds | Extending the display-run registry to opener, closer, nested `+`, separator, and para prefix |

**Not a track — already landed.** The display-run registry (`libs/shared/src/displayRun/`,
`displayRunSync.utils.ts`, the descriptor shape) shipped. Its descriptor carries NINE required
members — `kind` plus eight duties — so omitting a duty for a new kind is a type error rather than a
silently dead quadrant: Invariant III enforced by the compiler. Eleven kinds are registered
(`separator`, `char`, `va`, `vp`, `cat`, `ca`, `cp`, `milestone`, `optbreak`, `opaqueUnknown`,
`nestedGlyph`), and registration order is load-bearing — `cat`/`ca`/`cp` are listed before
`milestone` for the loose-glyph classification reason documented at the descriptor array
(`displayRunRegistry.ts`, the comment on `displayRunDescriptors`). The remaining work is the
**Glyph kinds** track above — the registry covers display runs, not the opener/closer/para-prefix
glyphs. Do not re-plan the registry; extend its reach. (2026-08-17: the glyph-kinds HEAL quadrant
landed as a Tier-1 engine arm — `$markerNodeTransform` heals un-pended, non-caret-held byte drift
in place via `$restoreCanonicalMarkerText` — and the `char`/`optbreak` scanners classify by
rendered bytes; the wholesale descriptor migration for opener/closer/para-prefix glyphs remains
open, mechanical, and optional.)

**Contended, needing explicit coordination:**

Two files are contended by multiple tracks running concurrently. **Split by FUNCTION, not by file.**
The proposals below are the starting point — a track that needs to deviate says so in its chat and
agrees it with the other claimants before editing, rather than discovering the conflict at merge.

**`markerEditDeletion.utils.ts` — three claimants:**

| Function | Owner |
| --- | --- |
| `$healMarkerTrailingSeparator` (the para-prefix absorb site) | Whitespace |
| `$charNodeDeletionTransform`, `$unwrapCharNode` | Marker resolution |
| `$paraMarkerDeletionTransform` (the empty-paragraph guard) | Structural deletion and caret |

Char-stack may also reach `$unwrapCharNode` — the paragraph-split bugs run through it today. If its
fix stops the split from producing a glyph-less span at all, it never needs to touch the unwrap;
confirm which before assuming.

**`markerEditTier1.utils.ts` — two claimants:**

| Concern | Owner |
| --- | --- |
| Separator grace and pend reporting; the tokenize-identity routing | Whitespace |
| Closer-glyph resolution; typed-literal resolution timing | Marker resolution |

`$resolvePendingMarkers` is reachable from both. Neither track should restructure it unilaterally —
if either needs to, raise it with the other first.
- The trailing-space transform's block-unknown exemption — Whitespace owns the transform; Unknown
  blocks owns the failing fixture. Whitespace lands the fix.
- The verse-adjacent typed-character repro — Whitespace owns the fabricated space, Structural
  deletion and caret owns the caret position. One shared test.

**Fence removed (2026-08-17):** an earlier revision fenced `tier2Rebuild.utils.ts`,
`virtualSettle.utils.ts`, and `settledGetUsj*` as off limits until the settled-`getUsj()` work
landed. That work landed and merged; the premise was measured stale during the unknown-blocks
track, and both files have since been edited with owner approval. No fence remains — coordinate
through ordinary file ownership above.

---

## 9. Glossary

Six parallel tracks using these words differently is a real and expensive failure mode.

- **Tier 1** — in-place rename that keeps node state and visible glyph text in agreement. Cannot
  express structural change.
- **Tier 2** — paragraph-scoped re-tokenization, run inside the triggering update so the rebuild and
  the user's edit form one history entry.
- **Pend** — mark a node's divergence from canonical as a user edit in progress, to be resolved
  later. Held in `pendingKeys`.
- **Settle** — resolve pending edits by re-tokenizing, producing the canonical form.
- **Sentinel** — a `U+FFFC` placeholder standing in for a node that cannot survive as text in a
  Tier-2 fragment; reinserted verbatim afterward.
- **Preserve-or-refuse** — the sentinel contract. Preserve the node through the rebuild; if sentinel
  count or symmetry does not survive, abandon the whole rebuild. A refusal is currently SILENT,
  which Invariant I forbids.
- **Display run** — engine-owned display bytes attached to an owner node: attribute runs, milestone
  runs, verse `\va`/`\vp` runs.
- **Separator** — the NBSP after an opening char glyph. Presentation in the file (the writer emits it
  structurally), but editable on screen, which is why the tokenize-identity rule governs it.
- **Attribute marker** — a marker stored as an attribute on its host when it follows certain hosts,
  and as a standalone marker otherwise: `ca`, `cp`, `cat`, `va`, `vp`.
- **Leading attribute** — a value written directly after a marker, separated only by a space, and
  stored as an attribute rather than as text: `\v`'s number, `\f`'s caller, `\id`'s code.
