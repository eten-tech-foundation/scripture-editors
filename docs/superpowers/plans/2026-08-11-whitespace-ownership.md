# Whitespace ownership

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first — this track
implements Invariant I's whitespace exception and Invariant V, and owns §7c.

## Goal

One answer to "who owns a space." Today four mechanisms answer it differently, and between them they
fabricate spaces the file never had, delete spaces the user typed, absorb spaces the user types, and
lose spaces on the way to disk.

## The governing rule

The USJ-to-USFM writer inserts **no separators between content items** (invariants doc §3, rule 1).
Word separation between a text run and whatever follows it lives entirely inside the USJ text
strings. That is why trailing-space maintenance exists, and it is why this track cannot simply
delete the transform.

But the transform conflates four jobs and only one is legitimate:

| Job | Verdict |
| --- | --- |
| PRESERVE a space the source file had, across rebuild / collab apply / paste | **Keep.** Writer rule 1 makes losing it real data loss. |
| FABRICATE a space the file never had | Remove. Invents content. |
| DELETE a lone space the user typed | Remove. Destroys intent. |
| ABSORB a typed space because one is already maintained | Remove. The caret bug. |

The replacement rule is **provenance, not caret proximity**: heal drift that came from non-user code
paths; never heal a user's own edit. Caret-proximity heuristics are what let deletions silently miss
their pend.

For the separator specifically, the decision procedure is the tokenize-identity predicate from the
invariants doc §2 — restore the byte iff the bytes tokenize identically without it. It is O(1) in
the common case via the tokenizer's own name-scan rule, and `*` is the counterexample that forces it
to be defined by meaning rather than by character class.

## Scope

**In:** the USJ-to-USX converter's whitespace loss; the trailing-space transform's four jobs; the
opener separator; the para-marker prefix; the `\v`-adjacent spacing; the lone-space deletion; the
leading-attribute whitespace collapse.

**Out:** the char-stack split's space reuse (that track owns it — coordinate, see Risks); unknown
blocks' own defects (that track supplies the failing fixture, this track lands the transform fix).

## TDD tasks

### Task 1 — the converter, fully specified and independent

`packages/utilities/src/converters/usj/usj-to-usx.ts` elides a whitespace-only text node that is the
first child of an element, so `<note …><char style="fr">` is emitted with nothing between the tags
and the parser has nothing to read back. This is in the editor's real save path and is the only
content loss measured in that leg.

1. **Red:** a USJ-to-USX-to-USJ round trip over the five testUSFM oracles. Expect exactly one
   failure — `$[11].content[1].content[0]`, a `" "` before `char:fr` inside an `\fe` note in 2SA-1 —
   and zero other differences once `sid`/`eid`/`vid` are ignored, since those are derived metadata
   the writer never outputs. Follow `optbreak-whitespace.test.ts` in the same directory, which is
   the existing precedent for a whitespace-specific converter suite.
2. **Green:** emit whitespace-only text nodes rather than eliding them. Verify the fix at the
   boundary cases the round trip does not reach on its own: a whitespace-only node as the LAST child,
   as the ONLY child, and between two elements.
3. **Guard:** confirm the USX stays valid and that `usxStringToUsj` reads the emitted whitespace back
   verbatim — it already preserves inter-element whitespace as text content, which is why the loss is
   on the serialize side only.

This task is independent of everything else here and of the moving branch. Do it first.

### Task 2 — the transform's four jobs

4. **Red:** un-skip the four known-failure entries in `corpus-transform-fixed-point.test.tsx` and
   `corpus-testusfm-round-trip.test.tsx`. All four are `$addTrailingSpace` fabricating on a dirtied
   text node whose next sibling is a node class its exemption list omits: a milestone, a block-level
   figure, a `ref`, and the last text node of NOTE content.
5. **Red:** a lone space typed into an empty paragraph survives. Same for wrapping a whitespace-only
   selection, which currently produces an empty span beside the orphaned space.
6. **Green:** split the transform's jobs. Preserve stays; fabricate, delete, and absorb go.
7. **Regression:** a space the source file HAD must still survive a rebuild, a collab apply, and a
   paste. This is the job being kept, and nothing currently pins it — write the pin before touching
   the transform.

### Task 3 — separator deletion means what the bytes mean

8. Deleting the space after an opening char glyph renames the marker when the bytes say so
   (`\nd things` becomes marker `ndthings` plus text), and heals back when they do not
   (`\nd` before `\wj`, `|`). Implement via the tokenize-identity predicate, sited in `shared` beside
   the tokenizer so it cannot drift from it.
9. The same rule for para markers, which have the same affordance and the same defect.
10. `*` does NOT heal: `\nd` before `*stuff` means a closing marker, and the user is entitled to it.

### Task 4 — typed spaces land where they are typed

11. A space typed next to a verse inserts a space rather than moving the caret past one.
12. Leading-attribute whitespace collapses per the markers map's `leadingAttributes`, so `\v  5` is
    verse 5 and `\v 7 5` is verse 7 followed by text `5`. Derived from the map, not a marker list.
13. A space typed at an opener separator lands with the caret between the two spaces, not past both.

## Acceptance

- All four skip-list entries deleted, both suites green with no skips.
- The converter round trip green over all five oracles.
- Corpus suites at full count, zero skips; lint and typecheck clean in root and nx contexts.
- No transform fabricates, deletes, or absorbs; the preserve job is pinned.

## Risks

- **This track shares `markerEditTier1.utils.ts` with the closers track.** Split by function or
  sequence. The invariants doc's ownership table records the contention.
- **`TextSpacingPlugin` is moving.** The display-run registry work reworked it while this plan was
  written. Rebase before starting task 2; task 1 is unaffected.
- **Task 7's regression pin is the load-bearing one.** Every other task removes behavior; that one
  protects the behavior worth keeping. If it cannot be written first, the rest of task 2 waits.
- **Space reuse overlaps the char-stack track**, which pulls an existing intra-span space out of a
  span. That is a content edit at a site this track is also changing.