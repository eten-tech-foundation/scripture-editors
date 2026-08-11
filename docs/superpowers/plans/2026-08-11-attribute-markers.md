# Attribute markers: `ca`, `cp`, `cat`

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first — especially
§7a (structural blockers) and §7b (deliberate divergences), both of which govern this track.

## Goal

`ca`, `cp`, and `cat` display and edit in Standard view the way `va`/`vp` already do: visible as
written, editable, settling canonically, round-tripping byte-identically.

Today, standalone `ca`/`cp`/`cat` render correctly. As ATTRIBUTE markers — `ca`/`cp` on a chapter,
`cat` on a note — they do not appear at all.

## The honest sequencing problem

**Every display item in this track has a prerequisite outside it.** Read this before scheduling.

| Target | Blocked by |
| --- | --- |
| `ca` on a chapter | **Chapters have no settle path.** Tier 2 never rebuilds a chapter, so edited chapter bytes have nowhere to settle. Displaying them editable recreates the milestone edit-loss class. |
| `cp` on a chapter | The same, PLUS a block-level display run (see below). |
| `cat` on a note | Collapsed note bodies are sentinels, so note-internal attribute bytes are not display candidates. |
| `cat` on a sidebar | The bytes are ALREADY rendered inside the sidebar's read-only `UnknownNode`. Making them editable is the unknown-blocks track's work. |

Two pieces of this track have NO prerequisite and can start immediately: the ParatextData capture
test, and sourcing the shared facts from the markers map. Start there.

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

### Stage A — `cat`, after its prerequisites

4. Sidebar `cat` becomes editable, once unknown-block editability lands. **First verify the
   observed-versus-code discrepancy**: the code renders the sidebar's `\cat` bytes, but it was
   reported as not appearing. Establish which is true before designing.
5. Note `cat` displays, once note-content display exists for collapsed notes.

### Stage B — `ca`, after a chapter-settle story exists

6. A chapter's `\ca` renders as a display run, mirroring the verse `\va` descriptor.
7. Editing the value settles canonically on caret departure.
8. Deleting the run clears `altnumber` with no resurrection.

### Stage C — `cp`, after Stage B

9. Block-level display-run support: whichever of a block wrapper or a new writer mode the design
   picks, decided against the four problems above.
10. Fold and unfold across the node-kind boundary: typing a marker into `cp` produces a real
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
