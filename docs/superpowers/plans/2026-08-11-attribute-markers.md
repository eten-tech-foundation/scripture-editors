# Attribute markers: `ca`, `cp`, `cat`

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first — especially
§7a (structural blockers) and §7b (deliberate divergences), both of which govern this track.

## Goal

`ca`, `cp`, and `cat` display and edit in Standard view the way `va`/`vp` already do: visible as
written, editable, settling canonically, round-tripping byte-identically.

Today, standalone `ca`/`cp`/`cat` render correctly. As ATTRIBUTE markers — `ca`/`cp` on a chapter,
`cat` on a note — they do not appear at all.

## Sequencing

One genuine prerequisite, and it lives INSIDE this track.

| Target | Status |
| --- | --- |
| `cat` in the note editor and expanded mode | **Unblocked.** `cat` is note content and belongs wherever note content is shown. Collapsed notes correctly do not show it — that is not the requirement. |
| `cat` on a sidebar | **Not a defect.** It renders today; the contrary report came from a testUSFM copy that lacked sidebar `cat`. |
| Space after `\cat*` is being deleted | **Unblocked, and a live losslessness defect.** See below. |
| `ca` on a chapter | Needs the chapter settle scope (task 4). Near-mechanical afterward — the same shape as `va`. |
| `cp` on a chapter | The same scope, PLUS block-level display-run work. That work is SCOPE, not a blocker. |

### The chapter settle scope

Editing displayed marker bytes requires something to re-tokenize them. That machinery is scoped, and
`$settleScopeForNode` today resolves to `ParaNode | NoteNode`, with `$requestTier2ForNode`
dispatching to `$rebuildParas` or `$rebuildNoteContent`. Chapters are top-level siblings of
paragraphs, so no scope claims them and edited chapter bytes have nowhere to settle — displaying them
editable would recreate the milestone edit-loss class.

The fix is the third instance of an existing pattern, not a new one: a chapter fragment builder and
rebuild alongside the paragraph and note pair, the scope resolver widened, a third dispatch branch,
and the read-only mirror in the virtual settle. The note scope is the proof that a non-paragraph
scope works.

**The `$inLiteralOnlyBlock` question is settled — it is purely circular.** `tier2Rebuild.utils.ts`
contains ZERO references to chapter nodes: there is no chapter-specific guard rail, no bail, no
special case. Chapters are excluded from the trigger paths only because nothing rebuilds them, which
is the very gap the new scope closes. Its own doc comment says as much — it names
"`$rebuildParas` refuses to re-tokenize" as the reason, and `$rebuildParas` refuses only because a
chapter is not a paragraph.

So the exclusion entry for chapter comes out when the scope goes in. `book` sits in the same
circular position; `UnknownNode` does NOT — that one is an independent policy, since
`$settleScopeForNode` returns `undefined` for opaque blocks by design.

Nothing else about this scope is undecided. The remaining work is implementation.

### Decision: no read-only intermediate

`ca` and `cat` go straight to editable. `cp` follows in the same track, also straight to editable.

A read-only intermediate for `cp` would not avoid its expensive part: the chapter settle scope is
shared with `ca` and gets built regardless, so `cp`'s remaining cost is purely the block-level
display work — which a read-only pass would have to design once and then redesign. Sequence `cp`
last; do not stage it.

## Why `cp` is the hard one

Four distinct problems beyond the chapter-settle blocker:

1. `AttributeRunNode` is an inline element sitting beside a leaf owner. `cp` folds and unfolds to a
   real **block**, so it needs a block-level wrapper or a `byteFormat.writer` value that does not
   exist.
2. `cp` has **no closing marker**. Its fold terminates at the next block boundary, and the
   descriptor's glyph/closer vocabulary has no slot for "opens with a glyph, closed implicitly."
3. Ownership is not "following inline sibling" — a chapter's `cp` is a sibling BLOCK, so the
   owner-resolution walk crosses block boundaries the verse walk never does.
4. Editing `cp`'s text to contain a marker must convert an attribute into a real paragraph node and
   back — a node-KIND change. `va`/`vp`'s worst case is only degrading to a standalone span.

## Scope

**In:** the capture test; markers-map sourcing; `cat` display and editing once its prerequisites
land; `ca`/`cp` display and editing once the chapter-settle story exists.

**Out:** unknown-block editability (its own track).

### The display-run registry has LANDED — this track builds on it

No longer in flight. Verified against `standard-view`:

- Registry `libs/shared/src/displayRun/displayRunRegistry.ts`; descriptor type
  `libs/shared/src/nodes/usj/displayRunDescriptor.ts`; owner walk `displayRunOwner.utils.ts`; sync
  driver `displayRunSync.utils.ts`.
- The descriptor has **nine required members** — `kind` plus eight duties. Its own module doc says
  "eight fields," counting duties and excluding the identity key; do not scope from that sentence.
- **Eight kinds are registered**, not the four this plan assumed: `separator`, `char`, `va`, `vp`,
  `milestone`, `optbreak`, `opaqueUnknown`, `nestedGlyph`. Registration ORDER is load-bearing —
  three descriptors share `ownerPredicate: $isCharNode`, and `separator` must precede `char`.
- `verseDescriptor("va")` is the template a chapter `ca` descriptor copies: `settleScope: "owner"`,
  `deletionPolicy: "retokenize"`, `byteFormat: { writer: "wrapper", runKind, glyphs: "with-value",
  closerSyntax: "closing", insertRunAfter }`.

Two registry facts are direct, unchanged costs for `cp`: `byteFormat.writer` is
`"wrapper" | "owner-children" | "kind-owned" | "read-only"` — all inline, no block value — and
`closerSyntax` is `"closing" | "selfClosing"`, with no slot for "closed implicitly at the next block
boundary."

**Trap:** `scanPieces`'s field translation is NOT compiler-enforced — the fields are optional on both
sides — so a wrongly-shaped chapter `scanPieces` compiles clean and silently reads as permanently
empty. `displayRunRegistry.test.ts`'s scanPieces suite is the only net; extend it with the
descriptor.

## Two sources of truth — the intended resolution

The editor's `ATTRIBUTE_MARKERS` table and paranext-core's markers map were compared and **agree on
every marker, attribute name, shape, and host.** This is duplication, not divergence. But neither
can subsume the other:

- The markers map models the SERIALIZER and holds `hasStructuralSpaceAfterCloseAttributeMarker`, the
  `isSpaceAfterAttributeMarkersContent` spec-versus-Paratext switch, and version variants.
- The editor's table models the PARSER matching ParatextData, and holds behaviors the map cannot
  express: a same-line space before an attribute marker BLOCKS the fold (a line break is structural
  and still folds); markup in the content aborts the fold; an empty span is never an empty attribute
  AND clears the receptive target so a following attribute marker cannot fold across it; an empty
  `cp` materializes an empty para without clearing the target; `cat` is receptive only directly after
  `\esb` or right after a note's caller.

The empty-span rules landed after this plan was first written and are the parser-side twin of the
capture test's headline finding. The table itself is unchanged — same five markers, same shapes,
same hosts.

**Resolution: derive the shared facts from the map; keep the parser-behavior deltas local, explicit,
and named.** Do not collapse either into the other. A test asserting the two agree on the shared
facts is the guard against future drift — that drift is the real risk, since `cat`'s host set is
keyed by marker name in one and by USJ node type in the other, and they coincide today only by
coincidence.

## TDD tasks

### Stage 0 — no prerequisites, start here

1. **EXTEND the existing capture test — it is roughly 60% done, not missing.**
   `c-sharp-tests/Projects/VerseAttributeFoldRoundTripCaptureTests.cs` already exists (304 lines) and
   already uses exactly the three-assertion pattern this plan called for. What it pins today: the
   fold-versus-first-class rule for `va`/`vp`/`ca`/`cp`, the empty-span block, document-order
   preservation on disk, and byte-level fixed-pointness — across seven cases in two `[TestCase]`
   methods.

   Its headline finding is one this plan should absorb: **an attribute marker folds only when its own
   span has content, and an EMPTY span blocks the NEXT attribute marker from folding too** — both
   stay first-class, in document order.

   Four gaps remain, in value order:
   - **`cp` with markup** — the deliberate-divergence pin (ParatextData folds into `pubnumber` and
     strands the markers at document root; our tokenizer produces the corrected block). Highest
     value and completely absent. Record ParatextData's real behavior; it must never become a reason
     to change our tokenizer.
   - **`cat` — zero coverage**, on a note or a sidebar.
   - **`ca` unclosed** — only closed `\ca …\ca*` forms appear.
   - **The 2SA whitespace matrix** — no space-after-closer versus space-between rows.

   Note the stylesheet mechanics: the fixture registers tags per-project via `AddTag` because
   `DummyScrStylesheet` lacks `va`/`vp`/`ca`, and without them ParatextData degrades those spans to
   unknown PARAGRAPHS. Check whether `cat` needs the same treatment before writing its cases. Read
   `c-sharp-tests/Usfm31NestingTripwireTests.cs` first — it also pins attribute behavior.
2. **Agreement test.** Assert the editor's attribute-marker table and the markers map agree on every
   marker, attribute name, shape, and host set. This is the anti-drift guard, and it is where the
   marker-name-versus-node-type keying difference gets pinned rather than left implicit.
3. **Resolve the writer's `ca` special case.** The serializer hardcodes a newline-plus-space before
   `ca` following a chapter marker, with its own comment doubting it. Decide it against the capture
   test's ground truth, not against the comment. While there, note the latent inconsistency in that
   block: the index is located in one string and the slice taken from another; they are equal on
   entry but can diverge after an earlier branch mutates one of them.

### Stage A — the space-after-closer defect: NOT THIS TRACK

4. **RESOLVED as an upstream defect. Do not fix it here, and do not compensate for it in editor
   code.** The reported symptom is real:

   ```
   in:  \fe + \cat things\cat* \fr 1:12 \ft More footnote text. …\fe*
   out: \fe + \cat things\cat*\fr 1:12 \ft More footnote text. …\fe*
   ```

   It was traced to `usjToUsxString` in `@eten-tech-foundation/scripture-utilities`, which elides a
   whitespace-only text node that is the first child of an element. Every editor-side leg preserves
   the space. See the invariants doc §7c for the measurement and for why `UsjReaderWriter.toUsfm()`
   is irrelevant here despite being byte-exact green on the same fixture.

   What this track SHOULD still verify, because they are genuinely its own semantics: the
   "space after" versus "space between" distinction around `\va*`, `\vp*`, and `\ca*`. The verse-11
   and verse-12 fixture rows separate them — a space AFTER the closer is leading text content, a
   space BETWEEN the target and the attribute marker BLOCKS the fold. Both must hold, and they are
   one character apart.

### Stage B — `cat` where note content is shown, unblocked

5. `cat` displays and edits in the note editor and in expanded note mode — wherever note content is
   shown. Collapsed notes deliberately do not show it.

   **Correction to this plan's earlier diagnosis:** expanded mode does not show `cat` either, and the
   reason is simpler than "collapsed note bodies are sentinels." NO adaptor ever builds the bytes.
   `createNote` in `usj-editor.adaptor.ts` carries `category` onto the serialized node and emits
   children of opening glyph, caller, content, closing glyph — no `\cat` bytes in EITHER branch; the
   collapsed/expanded split changes only caller shape and NBSP spacing. The note editor's own
   adaptor (`packages/scribe/src/editor/adaptors/note-usj-editor.adaptor.ts`) is identical. So this
   task touches BOTH adaptors, and there is no "expanded already works" starting point.

### Stage C — the chapter settle scope, then `ca`

6. Add the chapter settle scope: fragment builder, rebuild, widened scope resolver, third dispatch
   branch, and the read-only mirror in the virtual settle. Mirror the note scope's shape, and drop
   chapter from `$inLiteralOnlyBlock` in the same change — the investigation is done and that entry
   is purely circular.
7. Pin that a chapter with no pending edits REFUSES a rebuild, the same fixed-point expectation
   `$rebuildParas` and `$rebuildNoteContent` already carry.
8. A chapter's `\ca` renders as a display run, mirroring the verse `\va` descriptor.
9. Editing the value settles canonically on caret departure; deleting the run clears `altnumber`
   with no resurrection.

### Stage D — `cp`

10. Block-level display-run support: whichever of a block wrapper or a new writer mode the design
    picks, decided against the four problems above.
11. Fold and unfold across the node-kind boundary: typing a marker into `cp` produces a real
    paragraph; removing it folds back to `pubnumber`.

## Acceptance

- Capture test green and checked in, with ParatextData's real behavior recorded including where it
  diverges from ours.
- Agreement test green.
- For each shipped stage: the marker displays as written, edits settle, deletion clears, and the
  document round-trips byte-identically.
- Corpus suite at full count with zero skips; transform fixed-point test green.

## Recommendation on scheduling

Do Stage 0 now — it is independent, it produces the ground truth every later stage needs, and it
closes an open question in the serializer.

Then **raise the chapter-settle story as its own scoping conversation** rather than folding it into
this track. It gates `ca` and `cp` entirely, it is the same shape as the milestone edit-loss class,
and it may be materially cheaper to address while the display-run registry work has that code open.
