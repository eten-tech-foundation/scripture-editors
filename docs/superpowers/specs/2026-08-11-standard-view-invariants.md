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

| Behavior | `\marker` + Space | `\marker` + Enter |
| --- | --- | --- |
| Palette | Passive; dismisses, literal lands | Focused; commits the highlighted item |
| Who completes the marker | Tier 2, from the typed literal | The apply path |
| Closing marker | **none** — span records `closed="false"` | **inserted** |
| Marker chosen | whatever was literally typed | whatever is highlighted |
| Unknown marker | settles as unknown | cannot commit one not in the list |
| `\f` specifically | special-cased to commit like Enter | commits |
| Escape | leaves the typed literal | leaves the typed literal |

The one row that is a DEFECT, not a decision: **Space with a non-collapsed selection currently does
nothing.** It should wrap the selection the way Enter does.

Also intentional and previously ratified: type-through-split versus palette-retag; multi-step undo
for palette applies and settles. See `2026-07-07-standard-view-followups.md`.

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

- **ParatextData is NOT exonerated.** The save path is
  `editor USJ -> usjToUsxString() -> setChapterUSX() -> ParatextData`, and it never calls
  `usxStringToUsj`. Since the serializer preserves the space, the space IS present in the USX handed
  to C#. So the user-visible loss is either on the LOAD leg
  (`getChapterUSX() -> usxStringToUsj -> editor`) or inside ParatextData. **Re-derive which before
  estimating the fix**, and do not skip the C# capture test on the strength of the earlier claim.
- **`UsjReaderWriter.toUsfm()` remains irrelevant** — byte-exact green on this fixture and not in the
  save path at all. That much still holds; do not use it to reason about save behavior.

The regression net is still a USJ-to-USX-to-USJ suite over the existing fixtures, and it will still
go red — but it conflates both converters, so a failure there localizes nothing on its own. Pair it
with a direct USX-to-USJ assertion.
`packages/utilities/src/converters/usj/optbreak-whitespace.test.ts` is the precedent.

---

## 8. File ownership

One owner per file. If a track needs a file it does not own, coordinate rather than edit.

| Track | Owns |
| --- | --- |
| Closers | `markerEditTier1.utils.ts` (closer paths), `ImmutableUnmatchedNode.ts`, `markerEditDeletion.utils.ts` |
| Whitespace | `TextSpacingPlugin.tsx`, `markerSeparators.utils.ts`, `whitespaceDisplay.plugin.utils.ts`, the fixed-point test |
| Char-stack split | `charFormatting.utils.ts`, `markerEditNote.utils.ts` (Enter-in-note), the new shared primitive |
| Attribute markers | `ATTRIBUTE_MARKERS` in `usfmFragmentToUsj.ts`, `attributeDisplay.utils.ts`, the new descriptors |
| Unknown blocks | `UnknownNode.ts`, `unknownUsfm.utils.ts` |
| Host (paranext-core) | `extensions/src/platform-scripture-editor/**`, the collab `closed="false"` test |
| Coordinates | `delta-common.utils.ts`, `editor-delta.adaptor.ts`, caret anchoring |
| Glyph kinds | Extending the display-run registry to opener, closer, nested `+`, separator, and para prefix |

**Not a track — already in flight.** The display-run registry itself (`libs/shared/src/displayRun/`,
`displayRunSync.utils.ts`, the descriptor shape) is being built on `standard-view-pt-4187` right now.
Its descriptor already carries eight REQUIRED fields, so omitting a duty for a new kind is a type
error rather than a silently dead quadrant — Invariant III enforced by the compiler. The remaining
work is the **Glyph kinds** track above: the registry today covers display runs (attribute,
milestone, verse), not glyphs. Do not re-plan the registry; extend its reach.

**Contended, needing explicit coordination:**

- `markerEditTier1.utils.ts` — Closers and Whitespace both reach into it. Split by function, or
  sequence them.
- The trailing-space transform's block-unknown exemption — Whitespace owns the transform; Unknown
  blocks owns the failing fixture. Whitespace lands the fix.

**Off limits until the settled-`getUsj()` work lands:** `tier2Rebuild.utils.ts`,
`virtualSettle.utils.ts`, `settledGetUsj*`. They are actively being edited on
`standard-view-pt-4187`.

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
