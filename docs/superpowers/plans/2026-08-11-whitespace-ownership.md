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

**The defect is in the PARSER, `usx-to-usj.ts` — not the serializer.** `usj-to-usx.ts` emits every
string unconditionally and the XML serializer writes whitespace-only nodes verbatim; it is unchanged
since 2025. `usx-to-usj.ts` drops them: its first-child branch requires a non-empty trimmed value,
while its tail-text branch rescues an exact single space. See invariants §7c for the measured
boundary matrix.

1. **Red, direct:** a USX-to-USJ assertion over the whole boundary matrix — whitespace-only as first
   child, as only child, as last child, single space between elements, MULTI-space between elements,
   multi-space first child. Four of those six are lost today. Follow `optbreak-whitespace.test.ts` in
   the same directory.
2. **Red, end-to-end:** a USJ-to-USX-to-USJ round trip over the five testUSFM oracles. It fails on
   2SA-1, but it conflates both converters, so keep it as a NET and diagnose with task 1.
3. **Green:** preserve whitespace-only text nodes on read-back. Multi-space between elements is part
   of the fix, not a follow-up — today only an exact single space survives there.
4. **Re-derive the user-visible path before closing this out.** The save leg never calls
   `usxStringToUsj`, so the space IS in the USX handed to C#. The reported symptom therefore comes
   from the LOAD leg or from ParatextData, and a parser fix alone may not resolve it. Settle it with
   a C# capture case; do not rely on the retracted "ParatextData is exonerated" claim.

Tasks 1-3 are independent of everything else here and of the moving branch. Do them first. Task 4 may
hand work to the attribute-markers track's capture-test extension.

### Task 2 — the transform's four jobs

5. **Red:** un-skip the FIVE known-failure entries across `corpus-transform-fixed-point.test.tsx`
   (three) and `corpus-testusfm-round-trip.test.tsx` (two). All are `$addTrailingSpace` fabricating
   on a dirtied text node whose next sibling is a node class the exemption list omits: a milestone,
   a block-level figure, an `ImmutableUnmatchedNode`, the last text node of NOTE content, and a
   table cell.

   Two corrections to earlier drafts of this list: **`ref` is NOT a site** — it is an inline unknown,
   it IS exempted, and there is a green pin saying so; the 2SA-1 third site is the `\ref*` unmatched
   closer. And the **table cell** site appeared only when table cells changed representation, which
   is the strongest available argument for landing the fixed-point suite before the tracks start.

   The exemption list is twelve conditions plus a last-child-of-para-like guard. `MilestoneNode`,
   `ImmutableUnmatchedNode`, and `ImmutableTableCellNode` are absent from it, and block unknowns fall
   through because condition 10 gates on `isInlineTag()` where the inline set is exactly
   `{optbreak, ref}`.
6. **Red:** a lone space typed into an empty paragraph survives. Same for wrapping a whitespace-only
   selection, which currently produces an empty span beside the orphaned space.
7. **Green:** split the transform's jobs. Preserve stays; fabricate and delete go.

   **ABSORB is not in this transform.** The trailing-space transform returns early on already-spaced
   text, so a second typed space survives there. The real absorb sites are the two separators: the
   para-prefix heal in `markerEditDeletion.utils.ts` canonicalizes a typed plain space into an
   engine-owned NBSP, and `$syncOpenerSeparators` re-prefixes NBSP once the caret leaves. The first
   of those is a **Closers-owned file** — see Risks.
8. **Regression:** a space the source file HAD must still survive a rebuild, a collab apply, and a
   paste. This is the job being kept, nothing currently pins it, and `$addTrailingSpace` cannot tell
   a preserved space from a fabricated one — there is no code path that knows whether the space was
   in the source. Write the pin before touching the transform.

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
14. **Typing any character next to a verse must not fabricate a space.** With `\v 2 Da` and the caret
    between `2` and the following space, typing `\` yields `\v 2 \ Da` — a space that was never there
    appears BEFORE the typed character. Expected `\v 2\ Da`. Same with the caret between the verse
    glyph and the first space, yielding `\v \ 2 Da`.

    This reaches the fabrication defect by a different route than task 5: not a dirtied text node
    gaining a TRAILING space, but a verse-adjacent insertion gaining a LEADING one. Establish whether
    it is the same transform before fixing — if `$verseNodeTransform` is responsible, tasks 5 and 14
    share a fix; if not, it is a distinct site and the exemption reasoning differs.

    The CARET half of this repro — landing before the typed backslash instead of after it — belongs
    to the structural-deletion-and-caret track. Same repro, two owners; coordinate the shared test.

## Provenance: extend the existing convention, do not invent one

The plan's proposed "heal machine drift, never a user edit" rule **already exists for display runs**
and should be extended rather than re-derived. Update tags live in `node-constants.ts`; the collab
path tags remote applies with `DELTA_CHANGE_TAG`, and two decisions already gate on provenance:
`$runDestroyedSinceLastCommit` suppresses a heal on a remote apply, and the marker-edit plugin
suppresses a pend on `HISTORIC_TAG` or `DELTA_CHANGE_TAG`. There is a test precedent pinning the
behavior.

Two gaps this track inherits: there is **no paste tag**, which task 8's regression pin needs; and
none of the whitespace transforms or the separator syncs read any tag today.

## Acceptance

- All FIVE skip-list entries deleted, both suites green with no skips.
- The direct USX-to-USJ boundary matrix green, including multi-space between elements.
- Corpus suites at full count, zero skips; lint and typecheck clean in root and nx contexts.
- No transform fabricates or deletes; the preserve job is pinned; the two separator absorb sites are
  resolved or explicitly handed to the closers track.

## Risks

- **Replacing caret grace is now REGISTRY-WIDE, not one module.** The separator joined the
  display-run registry as its own kind, with `graceSite` wired through the generic
  `$caretHoldsRunSite` dispatch — which has six non-test call sites across the sync driver, the
  marker-edit plugin, Tier 1, and the Tier-2 trigger. The ownership table gives this track only
  `markerSeparators.utils.ts`; the registry and its consumers belong elsewhere. **This is the largest
  scope change since the plan was written** and the one most likely to force a sequencing decision
  with the other tracks.
- **The absorb sites are Closers-owned.** The para-prefix heal lives in `markerEditDeletion.utils.ts`.
  Either hand task 7's absorb half to that track or agree a split before starting.
- **This track shares `markerEditTier1.utils.ts` with the closers track.** Split by function or
  sequence.
- **Task 8's regression pin is the load-bearing one.** Every other task removes behavior; that one
  protects the behavior worth keeping. If it cannot be written first, the rest of task 2 waits. Note
  it needs a paste-provenance signal that does not exist yet.
- **Space reuse overlaps the char-stack track**, which pulls an existing intra-span space out of a
  span. That is a content edit at a site this track is also changing.
- The para-prefix separator (`$createMarkerTrailingSeparator`, `MARKER_TRAILING_SPACE_TEXT_TYPE`) and
  the char-opener separator (`markerSeparators.utils.ts`) are **different primitives**. Task 3 item 9
  builds on the former; do not conflate them.