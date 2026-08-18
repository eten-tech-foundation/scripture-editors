# Feedback: settle-artifact rejoin and fold, and the palette-context boundary

Branch `sv/fb3/artifact-rejoin`. Three TJ-reported Standard-view defects: two more instances of
the settle-artifact paragraph class (the settle fabricates block structure the user never typed,
and a later edit cannot dissolve it), plus the `\` palette offering the wrong list at a
paragraph's content start. Governing: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.
All three landed strict red-green: each failing test was watched failing for the stated reason
against the pre-fix source, and each root cause was reproduced in a probe harness before any
engine code changed.

---

## Defect 1 — deleting the `\` of an unknown-split paragraph fabricates a `\p`

Repro: `\p stuff` → type `\asdf ` at the end → settles to `\p stuff` + unknown paragraph `\asdf`
(correct — the tokenizer defaults an unknown token to a paragraph in body context). Delete the
`\` of `\asdf` → on departure: `\p stuff` + **`\p asdf`** — a fabricated `\p` around the
now-plain word. Expected: ONE paragraph `\p stuff asdf` — in the file, a line without a leading
marker continues the previous paragraph.

### Root cause (probed)

The degraded glyph (`asdf`, no leading `\`) matches neither the terminated- nor the bare-opener
regex, so `$markerNodeTransform` pends it and the departure settle
(`$resolvePendingMarkers`'s marker arm) falls through to `$requestTier2ForNode` — the
single-paragraph scope. The fragment `asdf ` re-tokenizes under the tokenizer's body-context
default and gains a `\p` wrapper the user never typed. The existing artifact gate
(`$applyOpenerRename`'s widened `[previous, para]` scope, from the fb-engine-fixes track) fires
only on the RENAME path (unknown → char-kind); the marker-stops-being-a-marker path never
reached it.

### Fix shape

`markerEditTier1.utils.ts`: the rename gate's shape conditions moved into a shared helper,
**`$tryUnknownSplitRejoin`** — paragraph's own marker unknown-kind, edited glyph is the LEADING
glyph, a previous sibling `ParaNode` exists; refusal falls back to the single-scope route.
`$applyOpenerRename` keeps its extra char-kind check and calls the helper;
`$resolvePendingMarkers`'s marker-arm fallback gains the degradation arm: an OPENING glyph whose
text no longer starts with `\` attempts the same widened rejoin before the generic
`$requestTier2ForNode`. One gate, two triggers — the two dissolution edits cannot drift.

### The loaded-paragraph decision (pinned)

An unknown paragraph LOADED from file (not a split artifact) is indistinguishable from the
artifact by shape — and deliberately gets the SAME behavior, because the behavior is defined by
the joined bytes, not by provenance: ParatextData parses `\p stuff` + newline + `asdf more` as
one paragraph either way. Pinned both ways against the tokenizer on the joined bytes:

- with a paragraph predecessor → rejoins (`usfmFragmentToUsjContent("\p stuff asdf more")`);
- with NO predecessor → the degraded bytes re-tokenize alone and take the tokenizer's
  body-context default `\p` (`usfmFragmentToUsjContent("asdf more")`).

### Byte note

The settled USJ is `["stuff asdf "]` — the split's separator survives as a paragraph-final
space, which the USFM writer's newline consumes on save (invariants §3.3), giving TJ's stated
`\p stuff asdf` at the file level. The test's byte-exact oracle is the tokenizer over the joined
displayed bytes (`\p stuff asdf `), not the post-writer form.

### Tests (`unknownSplitRejoin.test.tsx`, +4 → 7)

Red: the full delete-the-backslash repro (ONE paragraph, byte-exact); the loaded-unknown-para
rejoin. Guards (green both sides): a REAL `\p` glyph's `\` deleted never merges (user-authored
blockness); the no-predecessor default-`\p` pin. The file's three existing tests (rename rejoin
and its two guards) stayed green untouched.

---

## Defect 2 — `\ca` typed as a literal after the chapter never folds

Repro: after `\c 1 `, type `\` → it settles into a literal after the chapter; type `ca 3 \ca*`
→ today it stays plain forever (no green char, no fold). Expected: the ca char forms and folds
onto the chapter as altnumber — the whole-file parse of `\c 1` + newline + `\ca 3 \ca*` folds
(tokenizer-verified: `[{chapter c 1 altnumber 3}]`).

### Root cause (probed — answers the brief's open question)

The typed `\` settles to **root-level text wrapped in an `implied-para`**, not a default-`\p`
paragraph: the chapter pend's departure settle runs `$rebuildChapter`, `\c 1 \` tokenizes to
`[chapter, "\\"]`, and the adaptor wraps the stranded root string in an `ImpliedParaNode`. That
wrapper extends Lexical's `ParagraphNode`, NOT the USJ `ParaNode` — so `$settleScopeForNode`
finds no Note/Para/Chapter ancestor for text inside it, and `$chapterOfAdjacentAttributeNode`
does not recognize it. Every later settle attempt (`$requestTier2ForNode`) returns false: the
terminated-marker arm fires on `\ca ` and on `\ca*` exactly as designed, but the rebuild it
requests has **no scope to run in**. The bytes accumulate as plain text and serialize as a root
string — reproduced char-by-char in the probe.

### Fix shape

`tier2Rebuild.utils.ts`: the chapter-adjacency REGION gains one member kind.
**`$isChapterAttributeImpliedPara`** — an `ImpliedParaNode` whose own fragment bytes
re-tokenize to ONLY `\ca`/`\cp` material (chars or paras, plus insignificant whitespace), with
the tokenizer's fabricated default-`\p` wrapper unwrapped (and NOT unwrapped when the bytes
literally start with `\p` — a typed `\p` is real paragraph material). Membership is decided by
the tokenizer itself, never a byte regex, so the region's meaning cannot drift from the fold
authority; classification uses the bundled marker table on both sides (region membership must be
identical for callers with no `MarkerLookup` in reach, and ca/cp folding is ParatextData parse
behavior, not stylesheet-configurable — the same reason `CHAPTER_ATTRIBUTE_CHAR_MARKERS` is a
literal set). A qualifying implied paragraph is a CONTINUING member like the first-class chars
(its bytes carry no paragraph marker, so nothing about it bounds the chapter's span);
`$chapterOfAdjacentAttributeNode`'s backward walk skips it symmetrically.

Everything else came for free, by construction: `$buildChapterFragment` flattens the implied
paragraph's bytes through the generic ElementNode branch (no `\p` glyph bytes — the fold sees
`\c 1 \ca 3 \ca*`); `$rebuildChapter`'s splice, caret anchor, and fixed-point compare already
span the region; the virtual settle (`$settledChapter`, `$settledUsj`'s region-sized splice) and
the trigger's pend arm (`$isChapterNode($settleScopeForNode(node))`) all route through the
shared helpers. No mirror code was written.

### Why a REAL `\p` stays out (the guard, strengthened)

The brief's rule was "a paragraph with real content does NOT fold". Implemented stronger: NO
real `\p` ParaNode joins the region, even one holding only ca material — its `\p` marker byte is
a document byte that blocks the fold in the file (`\c 1` + `\p \ca 3 \ca*` keeps the paragraph
in ParatextData; ca's receptivity is directly-after-chapter), so folding it would diverge from
reload. Typed ca material in a real paragraph settles to a green ca char INSIDE the paragraph,
exactly as before. And non-attribute material in an implied paragraph (`\nd hi\nd*`) stays
outside the region — without the material gate the chapter-scope splice would have restructured
it into a fabricated root char span; with it, the literal keeps its (deliberate, pre-existing)
no-scope rest, pinned.

### Timing

As with the ca-display and table-cp precedents, the fold lands at the gesture (the immediate
terminated-marker arm fires mid-typing: `\ca ` splices the implied paragraph into a first-class
unclosed root char, and the typed `\ca*` closer folds the whole region) — strictly earlier than
the "on settle" requirement. The journey test types char-by-char and pins the post-departure
state; the mid-flight caret rode the existing byte-anchor restore without adjustment.

### Tests

`chapterAttributeSettle.test.tsx` (+3 → 27): the end-to-end typed-literal journey (red:
`altnumber` stayed undefined pre-fix), byte-identical with a reload of `\c 1 \ca 3 \ca*`,
including the mid-journey implied-para pin; the real-`\p` guard; the non-attribute-material
guard. `tier2Rebuild.utils.test.tsx` (+3 → 66): `$settleScopeForNode` pins — chapter for text
inside a qualifying implied paragraph (and the node itself), undefined for one with real
content, chapter through an intervening `\ca` char. The two chapter-returning pins run in the
bare environment (no MarkerEditPlugin) because with the plugin mounted the seeded literal FOLDS
in the seeding commit itself — the fix working at transform speed. `settledGetUsj.test.tsx`
(+1 shape → 40): "typed ca literal in a chapter-adjacent implied paragraph" — equivalence and
Tier-2 fixed point; its vacuity guard (pend lands) held pre-fix, but the equivalence itself was
vacuously equal pre-fix (both halves equally stuck on the missing scope), so defect 2's red is
the journey test, and the shape is the standing equivalence pin.

---

## Architectural assessment: provenance vs the accumulating heuristics

TJ's question: should the gates (unknown→char, unknown→none, chapter-adjacent artifact) be
replaced by explicit artifact PROVENANCE — a node-state flag stamped on paragraphs the settle
fabricates, cleared on user retag?

**Decision: no provenance flag now; the heuristics do not conflict.** Assessment:

- The three gates are really TWO: the unknown-split pair share one helper
  (`$tryUnknownSplitRejoin`) and one shape test; the chapter gate keys on a different node kind
  entirely (`ImpliedParaNode`). They partition cleanly by node kind and by scope (paragraph
  rejoin vs chapter region) — no case reaches two gates, no gate contradicts another.
- Both places where provenance WOULD have disambiguated dissolved on inspection:
  - *Loaded unknown paragraph vs split artifact* (defect 1): the right behavior is IDENTICAL for
    both — the joined displayed bytes are the oracle and ParatextData parses them the same way —
    so the distinction does not need representing at all.
  - *Loaded root string vs settle-fabricated implied paragraph* (defect 2): the material gate is
    provenance-equivalent in practice. Both our tokenizer and ParatextData fold well-formed
    ca/cp at parse and load unfoldable ones as first-class chars/paras, so a FILE cannot load an
    implied paragraph of only-ca/cp material — the shape is settle-reachable only. The heuristic
    and the flag would classify the same trees.
- A flag would therefore be stamped and read by exactly one consumer today, while adding real
  surface: node-state serialization, undo/redo restore semantics, collab delta-apply, and a
  clearing rule of its own (each a place for the flag to go stale — the class of bug
  heal-by-provenance exists to prevent, reintroduced as data).

**Revisit trigger, recorded for the next track:** the day a gate needs artifact-vs-authored
where the BYTES are identical and the tokenizer cannot arbitrate — a true conflict, e.g. an
artifact `\p` (marker byte present) that should dissolve while an authored byte-identical `\p`
must not — implement the node-state provenance flag THEN, replacing these gates rather than
adding a fourth heuristic beside them.

---

## Defect 3 — `\` after the prefix separator opened the paragraph palette

TJ's spec: with the caret directly after `\p ` (after the separator space — where content
starts), `\` must open the INLINE (character) palette; the PARAGRAPH palette is right only
inside the marker glyph, at its edges, or directly right of the glyph BEFORE the separator.
Today `$getMarkerMenuContext` reported "paragraph" at content start.

### The probe split (the load-bearing decision)

`$isAtParagraphContentStart` had two consumers with different jobs: the `\` palette's SOURCE and
`markerMenuApply.utils.ts`'s retag-vs-split ROUTING of a paragraph PICK. Changing it in place
would have made a paragraph pick at content start SPLIT instead of retag. Split into two probes:

- **`$isAtParagraphMarkerPrefix`** (new, module-local to `markerMenuContext.utils.ts`) — the
  menu SOURCE boundary: anchored on the synthesized glyph (any offset — edges included), or on
  the separator node at offset 0 (directly right of the glyph, before the space). Everything
  after the separator — including offset 0 of a leading char span's opener glyph, the
  red-letter shape — is character source.
- **`$isAtParagraphContentStart`** — untouched, now documented as the APPLY-routing probe only:
  an Enter-menu or explicit paragraph pick still retags at content start. Its doc comment states
  the split's reason so the two cannot be silently re-merged.

The book-region rule is unchanged: a collapsed caret with NO paragraph at all (the `\id` region)
still offers the paragraph list — there is no paragraph to take a character style there.

### Tests

`markerMenuContext.utils.test.tsx` (+2 rows, 2 flips → 14): the content-start row and the
red-letter content-start row flipped to character (red pre-fix); new glyph-adjacency rows
(inside / leading edge / trailing edge / separator-offset-0 → paragraph; separator-offset-1 →
character). The book-region pin stayed green untouched. Full `markerMenuApply.utils.test.tsx`
(37) and `markerMenuHarness.test.tsx` (24) green — the harness has no content-start source pin
(its character-source pin is a mid-text case), and the apply suite pins retag-at-content-start,
which the split preserves.

---

## Deviations from the brief

- **Defect 2's artifact is an implied paragraph, not a default-`\p`** — the brief offered both
  guesses ("default-`\p` artifact paragraph? root text?"); the probe settled it (root string →
  `ImpliedParaNode` wrapper), and the fix is keyed on that node kind, which is what makes the
  no-`\p`-byte fold legitimate.
- **The region rule is implemented for implied paragraphs only.** The brief's "a paragraph
  directly following its chapter whose content re-tokenizes to ONLY ca/cp material" would, read
  literally, include a real `\p` holding only ca material — excluded here deliberately, because
  its `\p` byte blocks the fold in ParatextData and folding would diverge from reload (see the
  strengthened guard above).
- **The settledGetUsj equivalence shape is not independently red** (pre-fix both halves were
  equally stuck, so they compared equal); the journey test carries defect 2's red. Recorded
  rather than forced.
- **Defect 1's byte-exact oracle carries a paragraph-final space** (`\p stuff asdf `) — the
  split separator's byte, which the writer's newline consumes on save; TJ's `\p stuff asdf` is
  the file-level result.
- No tokenizer changes (fixed point), no C# changes (gate never approached), scribe untouched,
  no new corpus skips.

## Verification

- Red-green on every behavior change; failure reasons confirmed against the pre-fix source
  (defect 1: two paragraphs with the fabricated `\p`; defect 2: `altnumber` undefined, literal
  stranded; defect 3: "paragraph" at the three flipped positions).
- Targeted suites, all green, zero skips: unknownSplitRejoin 7; chapterAttributeSettle 27;
  tier2Rebuild.utils 66; settledGetUsj 40; markerMenuContext 14; markerMenuApply 37;
  markerMenuHarness 24; the settle-adjacent batch (typedMarkerResolution, debounceSettle,
  glyphDriftHeal, damagedGlyphSettle, unmatchedCloser, typedByteSettle) 43; the region batch
  (virtualSettle.utils, markerEditTier2Trigger, verseAttributeSettle, milestoneAttributeSettle,
  noteCategorySettle, charAttributeDeletionSettle, corpus-round-trip, corpus-testusfm-round-trip,
  corpus-transform-fixed-point, tier2Rebuild.corpus) 223.
- Full platform-editor suite: 71 files, 1282 tests, green.
- Full gate `nx run-many -t test lint typecheck`: numbers in the final report.
