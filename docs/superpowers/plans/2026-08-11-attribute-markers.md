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

**The one real unknown** is why `chapter` sits in `$inLiteralOnlyBlock` beside `book` and opaque
unknowns. That exclusion exists so a literal the engine will never rebuild cannot leave a stuck
pending key — circular with the missing scope, but it may also be carrying the documented
"chapter junk-text edits fall back to the stored number" behavior. Establish which before removing
it. That is an investigation task, not a design unknown.

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

**Out:** the chapter-settle story itself (own effort, see below); unknown-block editability (its own
track); the display-run registry construction (in flight elsewhere).

## Two sources of truth — the intended resolution

The editor's `ATTRIBUTE_MARKERS` table and paranext-core's markers map were compared and **agree on
every marker, attribute name, shape, and host.** This is duplication, not divergence. But neither
can subsume the other:

- The markers map models the SERIALIZER and holds `hasStructuralSpaceAfterCloseAttributeMarker`, the
  `isSpaceAfterAttributeMarkersContent` spec-versus-Paratext switch, and version variants.
- The editor's table models the PARSER matching ParatextData, and holds behaviors the map cannot
  express: a same-line space before an attribute marker BLOCKS the fold; markup in the content
  aborts the fold; an empty span is never an empty attribute; `cat` is receptive only directly after
  `\esb` or right after a note's caller.

**Resolution: derive the shared facts from the map; keep the parser-behavior deltas local, explicit,
and named.** Do not collapse either into the other. A test asserting the two agree on the shared
facts is the guard against future drift — that drift is the real risk, since `cat`'s host set is
keyed by marker name in one and by USJ node type in the other, and they coincide today only by
coincidence.

## TDD tasks

### Stage 0 — no prerequisites, start here

1. **ParatextData capture test** (paranext-core C#). Follow the existing capture-test pattern:
   dummy project, one `[TestCase]` per authored form, three assertions per case (USFM to USX, USX to
   USFM bytes, then a re-read asserting the round trip is a fixed point). Cover `ca` closed and
   unclosed, `cp` plain and with markup, `cat` on a note and on a sidebar, and the whitespace matrix
   from the 2SA fixtures.
   **Pin the divergence deliberately** where ParatextData is wrong: for `cp` containing markup it
   folds into `pubnumber` and strands the markers at document root, while our tokenizer produces the
   corrected block. The C# test records ParatextData's actual behavior; it must not become a reason
   to change our tokenizer.
2. **Agreement test.** Assert the editor's attribute-marker table and the markers map agree on every
   marker, attribute name, shape, and host set. This is the anti-drift guard, and it is where the
   marker-name-versus-node-type keying difference gets pinned rather than left implicit.
3. **Resolve the writer's `ca` special case.** The serializer hardcodes a newline-plus-space before
   `ca` following a chapter marker, with its own comment doubting it. Decide it against the capture
   test's ground truth, not against the comment. While there, note the latent inconsistency in that
   block: the index is located in one string and the slice taken from another; they are equal on
   entry but can diverge after an earlier branch mutates one of them.

### Stage A — the space-after-closer defect, unblocked

4. **A space after an attribute marker's closer must survive as content.** Paratext treats
   whitespace after an attribute marker as text content rather than as an optional structural space
   — the behavior the markers map records as `isSpaceAfterAttributeMarkersContent`, which is true for
   the Paratext map variants the editor targets. The editor currently DELETES it:

   ```
   in:  \fe + \cat things\cat* \fr 1:12 \ft More footnote text. …\fe*
   out: \fe + \cat things\cat*\fr 1:12 \ft More footnote text. …\fe*
   ```

   This is a byte the user never touched disappearing on round trip — an Invariant I violation in
   the losslessness direction, and a pure tokenizer/adaptor concern testable with no UI. The 2SA
   fixtures already document the expected behavior for this exact `\fe + \cat things\cat* \fr` line,
   so the failing test can be lifted from them.

   Check the sibling positions while here: the same space class after `\va*`, `\vp*`, and `\ca*`.
   The verse-11 and verse-12 fixture rows distinguish "space after" (kept as leading text content)
   from "space between" (blocks the fold) — both must hold.

### Stage B — `cat` where note content is shown, unblocked

5. `cat` displays and edits in the note editor and in expanded note mode — wherever note content is
   shown. Collapsed notes deliberately do not show it.

### Stage C — the chapter settle scope, then `ca`

6. **Investigate `$inLiteralOnlyBlock`'s chapter entry**: establish whether it guards anything beyond
   the missing scope before removing it.
7. Add the chapter settle scope: fragment builder, rebuild, widened scope resolver, third dispatch
   branch, and the read-only mirror in the virtual settle. Mirror the note scope's shape.
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
