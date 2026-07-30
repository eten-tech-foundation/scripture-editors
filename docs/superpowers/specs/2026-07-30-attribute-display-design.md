# Standard view: full USFM-equivalent display for attributes (design)

Status: APPROVED design (TJ, 2026-07-30). Companion to
`2026-07-27-attribute-display-and-nesting-arc-status.md` (arc status; the attribute discovery)
and `2026-07-24-nesting-alignment-design.md` (the governing nesting rules; its Tier-2
losslessness principle is the keystone this design extends).

## 1. Goal and governing principle

Standard view must display USFM attributes as written, PT9-style, and more generally: **every
node kind displays its USFM byte equivalent** as engine-owned text. Where the displayed bytes
fully capture a node's state, the Tier-2 rebuild loop re-tokenizes them losslessly and the
node's atomic-sentinel protection is removed; sentinels remain only where they are *honest* —
where no on-screen bytes can exist (collapsed note bodies) or no USFM bytes exist at all
(ParatextData-generated `<ref>` wrappers, USX-only verse extras).

Why: char-span attributes (`\w word|gloss\w*`, `\w word|lemma="…" strong="…"\w*`) hide in
`unknownAttributes` today, forcing Tier-2 to treat those spans as atomic (preserve-or-refuse),
which freezes marker edits inside them (the zzz6 GEN 1 `\wj \+w dsa|stuff\+w*` discovery —
deferred finding 2). Milestones have the same disease in a worse form: their display omits
`who`/unknown attributes AND their attribute run is editable text whose edits are silently
discarded on save (live data-loss bug). Verses hide `\va`/`\vp` entirely and preserve a
USX-only `sid`, making nearly every loaded verse a sentinel. UnknownNodes (figure, table,
sidebar, optbreak, periph) show only their content text — markers and attributes are invisible
and not copyable.

## 2. Scope

Three phases, one architecture. Standard view only (`markerMode === "editable"`); Simple view
and the visible/hidden marker modes are untouched by construction (the marker-edit engine only
runs in editable mode, and where bytes do not display, sentinel protection remains in force).

- **Phase 1 — char spans + milestones** (editable, de-sentineled). The original ask; fixes the
  frozen-marker-edit bug and the milestone edit-loss bug.
- **Phase 2 — verses**. `\va`/`\vp` display runs, `sid` carry-over-if-unchanged, verses cease
  to be sentinels except for arbitrary `unknownAttributes`.
- **Phase 3 — UnknownNode read-only byte display** (stays atomic). Generic renderer; full USFM
  is visible, selectable, and copyable.

Non-goals / explicit deferrals:

- **Chapter `\ca`/`\cp` display**: chapters are top-level nodes Tier-2 never rebuilds, so there
  is no settle path for edited chapter bytes; displaying them editable would recreate the
  milestone edit-loss bug. Follow-up requires a chapter-edit settle story first.
- **UnknownNode editability**: display is read-only for now (TJ, 2026-07-29). The upgrade path
  (real engine-text children → editable + re-tokenizable) is left open by this design.
- **Collapsed note bodies**: honest sentinel — body bytes are deliberately off-screen; expanded
  notes already have their own note-scoped rebuild path (`$rebuildNoteContent`).
- **Generated `<ref>` wrappers**: honest sentinel — `gen="true"` refs are ParatextData-synthesized;
  no USFM bytes exist to display. Their child text continues to display as content.
- **USFM 3.1**: ≤3.0 semantics per the nesting design's D4 (`link-href`, not `href`). The
  `Usfm31NestingTripwireTests` upgrade guard is unchanged.

## 3. PT9 ground truth (verified against ~/source/repos/Paratext)

The display grammar to match — three PT9 sites agree (`UsfmToken.ToAttributeString`,
`NamedAttribute.ToString`, `UsfmXsltExtensions.GetStyleAttributeStr`):

- A single attribute that is the marker's **default** renders as bare `|value`. Anything else
  renders `|name="value" name2="value2"` — double quotes always, single spaces, parse order
  preserved. Whitespace around `=`/between attributes is discarded on parse.
- **Settle-time simplification** (TJ, 2026-07-30): typing the named form of a default attribute
  settles to the collapsed form *in the editor* — `\w thing|lemma="gloss"\w*` settles to
  `\w thing|gloss\w*` without a file round-trip. P10 must match.
- Bare `|value` parses as the default attribute **only if the marker has one**; otherwise (and
  for any text the attribute grammar cannot fully match) the `|…` text stays as **literal
  inline content** — never dropped, never opaque raw data. So `|gloss` before `\w*` becomes
  `lemma="gloss"`, while `|gloss` before `\nd*` stays char text.
- Default-attribute map (≤3.0, from stylesheet `\Attributes`, first entry when ≤1 required):
  `w→lemma`, `rb→gloss`, `xt→link-href`, `jmp→link-href`, `qt*-s→who`, `ts-s→sid`,
  **`fig→none`** (3 required attributes). Matches the tokenizer's `DEFAULT_MARKER_ATTRIBUTES`
  and paranext-core's `USFM_MARKERS_MAP_PARATEXT_3_0`.
- Attribute runs are ordinary **editable** text in PT9's standard view, one span including the
  `|`, styled light gray (`marker_attribute`), full text size, normal color on hover; marker
  glyphs are separately styled. Our existing `.attribute`/`.marker` classes already mirror this.
- ParatextData's save always normalizes (`NormalizeUsfm`): the canonical display form, the
  re-tokenized form, and the eventual file bytes are the same form. "Round-trip byte-identical
  to file" means this canonical form.

paranext-core facts the design relies on: attributes arrive at the editor as plain USJ props
with real names already expanded by ParatextData (`\w word|X\w*` → `lemma:"X"`); the
`unknownAttributes` bucketing is editor-side only; figures arrive with USX naming (`file`, not
`src`).

## 4. Architecture

### 4.1 Truth model (unchanged)

Attribute values live where they live today: `unknownAttributes` on CharNode, MilestoneNode
props + `unknownAttributes`, verse props, UnknownNode's stored USJ. No changes to storage, USJ
shape, save serialization, or OT delta shapes — attribute values keep traveling on the char
delta item / embed attributes exactly as now. Display is always a derived cache, never a second
store.

### 4.2 The display-run convention, generalized

Engine-owned display text renders each node's USFM bytes: marker glyphs (MarkerNodes) plus an
attribute TextNode tagged `textType:"attribute"`. Engine-owned means: derived from node state;
excluded from OT content ops and save serialization; editable (Phase 1–2), with edits settling
through Tier-2 re-tokenization back into node state.

Per kind:

- **Char span**: `[opening glyph][content…][attribute text |…][closing glyph]`. The run is bare
  `|…` with **no NBSP prefix** — PT9-exact, and required: `toFragmentText` flattens NBSP→space,
  which would leak a space into span content on rebuild. Built only when the span has a closing
  glyph (an unclosed span cannot carry attributes in USFM; `|…` without a closer is literal
  content, which the tokenizer already handles) and only from `unknownAttributes` minus
  `closed` (and structural keys, which cannot occur there).
- **Milestone**: keeps the existing `NBSP|…` prefix (flattens to the space genuinely in the
  file: `\qt-s |sid="…"\*`), but emits the **complete** attribute set — `sid`, `eid`, and all
  `unknownAttributes` (chiefly `who`) — with the milestone default-attribute collapse
  (`\qt-s |Jesus\*` when `who` is the lone attribute).
- **Verse** (Phase 2): `\va` glyph + value + `\va*` glyph, then `\vp` + value + `\vp*`, as
  trailing siblings after the verse text, values tagged `textType:"attribute"`.
- **UnknownNode** (Phase 3): full byte rendering as read-only engine-text children (§7).

### 4.3 One canonical serializer

`canonicalAttributeText(attributes, defaultAttributeName)` — a single pure function owning the
PT9 rule (§3): lone default attribute → bare `|value`; otherwise `|name="value" …`, double
quotes, single spaces, insertion order. Callers exclude non-byte artifacts (`closed`) and apply
marker-specific USFM naming (figure `file→src`). Default-attribute names come from the
tokenizer's existing `DEFAULT_MARKER_ATTRIBUTES` / `milestoneDefaultAttribute`. Every display
builder and self-healing transform calls this one function.

### 4.4 Owning module

New `libs/shared/src/nodes/usj/attributeDisplay.utils.ts`, third sibling of
`nestedGlyphs.utils.ts` / `markerSeparators.utils.ts`, following their exact shape:

- Doc header stating the representation rule (attributes live on the node; the display run is a
  derived cache).
- **Construction-time builders** called from every creation path: USJ→Lexical adaptor
  (`createChar`, milestone assembly, `createVerse`), the collab materializer
  (`delta-apply-update.utils.ts` construction paths), marker-apply paths, and the Tier-2
  rebuild materializer.
- **Self-healing transforms** (`$syncCharAttributeDisplay`, milestone and verse analogues)
  registered in the node plugins: re-derive the canonical run from node state, repairing
  missing runs, stale bytes after remote collab updates, and drift from any missed construction
  site — except while the caret is inside the run (mid-edit grace).
- **Caret-held reporter** consumed by MarkerEditPlugin's pend path (settle-on-departure).

### 4.5 The edit lifecycle

Today `markerEditTier2Trigger` *exempts* `textType:"attribute"` text from triggering Tier-2 —
which is precisely the milestone edit-loss mechanism. That exemption becomes the pend path: an
edited attribute run marks its owning node pending (the `pendingKeys` mechanism the separators
use). While the caret stays inside, nothing settles — malformed intermediate states are fine.
On caret departure, the paragraph's displayed bytes (including the edited `|…` run)
re-tokenize; `extractAttributes` / `scanMilestone` / `attrCapture` re-derive node state; the
rebuild materializes the result; the self-heal renders it canonically. Display, node state,
and file bytes converge by construction — including PT9's settle-time simplification of
`|lemma="gloss"` to `|gloss` (§3).

### 4.6 Sentinel redefinition

Tier-2's classification changes from "has attribute bytes" to **"state not recoverable from
displayed bytes"**:

- `hasByteAttributes` and its two gates in `tier2Rebuild.utils.ts` are deleted (Phase 1). The
  unknown-marker guard stays (a span whose marker the stylesheet cannot classify remains
  atomic).
- Milestones whose marker the tokenizer can classify flow their display bytes into the fragment
  instead of riding as sentinels; the heuristic-gap names (bare `ts`, `t-s`, `t-e` without
  stylesheet backing) stay atomic, documented.
- `verseNeedsSentinel` (Phase 2) reduces to arbitrary `unknownAttributes` only.
- Notes, generated refs, and UnknownNodes stay sentinels with the justifications in §2.

The recoverability rule is self-protecting: any state without displayable bytes (e.g. a
hypothetical attribute-bearing `closed:"false"` span) degrades to atomic instead of corrupting.

### 4.7 Exclusion gating

Today's OT/save exclusion of attribute text keys off the `NBSP|` text prefix. Char runs have no
NBSP, so the gates in `editor-delta.adaptor.ts` and `editor-usj.adaptor.ts` extend to check the
`textType:"attribute"` state (the robust signal), retaining the prefix check for compatibility.
Attribute display text therefore stays out of content ops — collab lengths never shift — and
out of saved USJ.

## 5. Phase 1 — char spans + milestones

Char spans:

1. `createChar` appends the attribute TextNode between content and the closing glyph (editable
   mode, closing glyph present, non-`closed` attributes exist). Same builder call in the collab
   materializer and marker-apply paths; the self-heal covers missed sites.
2. `$syncCharAttributeDisplay` registered as a CharNode transform in `CharNodePlugin` beside
   `$syncNestedGlyphs` / `$syncOpenerSeparators`.
3. Sentinel gates deleted; the attribute node's bytes join the fragment as ordinary text; the
   fixed-point signature treats them as such. Pinned regression: a no-edit rebuild of a
   paragraph containing `\w x|lemma="y"\w*` is a fixed point.
4. The trigger exemption becomes pend-and-settle (§4.5).

Milestones:

1. `addAttributes` emits the full attribute set through `canonicalAttributeText` with
   `milestoneDefaultAttribute` collapse. `MS_MARKER_OBJECT_PROPS` unchanged — `who` stays in
   `unknownAttributes`; only its display is new.
2. Conditional de-sentinel (§4.6). Verified: the display bytes `\qt-s |sid="x"\*` re-tokenize
   through `scanMilestone` to the identical USJ object (NBSP→space matches the file's space).
3. The Tier-2 rebuild materializer gains an `ms` branch (re-tokenized fragments never contained
   milestones before): construct MilestoneNode + display run via the same builder as the
   adaptor.
4. The edit-loss bug dies as a side effect: edited milestone attribute bytes settle through
   pend → re-tokenize → materialize; save (which reads props) sees the settled truth.

Deliberately unchanged in Phase 1: OT op shapes, save serialization, `unknownAttributes`
storage, Simple view, visible/hidden modes.

## 6. Phase 2 — verses

1. **Display**: `\va N\va*` / `\vp N\vp*` runs (PT9's order and shape) as trailing siblings
   after the verse text; value nodes tagged `textType:"attribute"`; marker glyphs are
   MarkerNodes (already excluded from ops). `$syncVerseAttributeDisplay` heals them from
   `altnumber`/`pubnumber` props.
2. **Re-tokenization**: the tokenizer's `attrCapture` folding already parses `\va 1\va*` back
   onto the verse object. Edits settle via the same pend/departure path.
3. **`sid` carry-over-if-unchanged** (TJ, 2026-07-30): rebuilds carry the old `sid` over when
   the rebuilt verse's number matches the pre-rebuild verse at that position; a user-edited
   number drops it (same as verses typed in the editor today, which have no sid). No sid
   synthesis. Context: the editor has always round-tripped ParatextData-stamped sids
   load→save; ParatextData ignores them when writing USFM; no downstream consumer reads the
   editor's in-memory USJ sids. Carry-over avoids collab embed-attribute op churn on first
   rebuild; stale sids cannot survive a number edit.
4. **De-sentinel**: `verseNeedsSentinel` reduces to arbitrary `unknownAttributes` (USX-only,
   no USFM byte representation — honest, rare). Verses are not sentinels regardless of sid
   (TJ, 2026-07-30). This retires the editor's largest sentinel population.

## 7. Phase 3 — UnknownNode read-only byte display

1. **Generic renderer, not per-kind cases**: the default display for any UnknownNode is a
   generic USJ-object→USFM-bytes rendering — opening marker glyph, attribute text via
   `canonicalAttributeText`, content, closer — so periph, esb, and future unknown types display
   without being individually anticipated. Special cases only where USFM naming demands:
   optbreak renders a real `//` text (replacing today's CSS pseudo-element), table row/cell
   markers derive from cell props, figure maps USX `file` back to USFM `src`, and
   `textContentAttribute` markers (periph `alt`) render that value as text content rather than
   `|alt="…"`.
2. **Real engine-text children, not DOM chrome** (TJ requirement: select through and copy the
   exact USFM): `createUnknown` builds read-only display children (token/immutable-typed style,
   `textType:"marker"`/`"attribute"`, existing `.marker`/`.attribute` styling) around the
   existing content children. Lexical's clipboard serialization then includes the bytes, so a
   selection across an UnknownNode copies its full USFM.
3. **Exclusions**: the display children stay out of the unknown embed's collab `contents.ops`
   and out of save via the same textType gates (§4.7).
4. **Stays a sentinel**: no re-tokenization obligation — the rendered bytes must be correct
   USFM but carry no round-trip pin. Editability is a future upgrade, not blocked by anything
   here.

## 8. Edge cases

- **Malformed attribute edits** settle to literal span content (tokenizer's existing
  PT9-faithful behavior); the self-heal then displays exactly what the data holds. Never a
  crash, never silent loss.
- **`closed` never displays**; a span whose only unknown attribute is `closed` gets no run —
  footnote-content chars behave exactly as today.
- **User chaos inside a run** (splitting the node, typing `\`, deleting half or all of it) is
  covered by one rule: grace while the caret is inside, wholesale re-tokenize on departure.
  Deleting the whole run yields a span with no attributes. There is no incremental patching.
- **Typing `|value` before a closer** acquires PT9 semantics from re-tokenization: default
  attribute on markers that have one; literal content on markers that don't (§3).
- **Collab races**: the self-heal applies remote attribute updates only when the caret is not
  inside the run; a local settle wins by re-tokenizing; attribute values converge through
  existing char-item semantics. Display text is never in ops, so lengths cannot shift.
- **The zzz6 discovery case** (`\wj \+w dsa|stuff\+w*`, edited nested closer never settled)
  becomes a named regression test: with the run displayed, the span re-tokenizes and marker
  edits inside it settle like any other.

## 9. Test strategy (TDD throughout)

1. **Unit — `canonicalAttributeText`**: table-driven against PT9-derived expectations
   (default collapse, quoting, spacing, insertion order, `closed` exclusion, figure
   `file→src`, milestone default rule).
2. **Unit — `attributeDisplay.utils`**: builders per kind; self-heal repairs drift and stale
   remote state; grace holds while the caret is inside (nestedGlyphs/markerSeparators harness
   style).
3. **Tier-2 pins**: de-sentinel classification; fixed points for `\w x|lemma="y"\w*`, the
   nested zzz6 case, `\qt-s |who="Jesus"\*`, `\va`-bearing verses; sid carry-over (number
   unchanged → kept; edited → dropped).
4. **Settle integration**: edit attribute bytes → depart → state updated, display canonical;
   `|lemma="gloss"` settles to `|gloss` (PT9 simplification, §3); the milestone edit-loss bug
   as an explicit regression (edit `|sid="…"` → save-side USJ reflects it); delete run →
   attributes cleared.
5. **OT/delta**: attribute display text excluded from content ops (char, milestone,
   unknown-embed contents); remote attribute change heals display; op-length invariance.
6. **Corpus losslessness property test** (cross-cutting invariant): for every paragraph in the
   test corpus, the displayed byte sequence re-tokenizes to identical USJ. The automated guard
   against inconsistency *between* per-kind builders.
7. **UnknownNode display**: byte-rendering expectations for fig/table/esb/optbreak/periph
   including `textContentAttribute` rendering; clipboard test (copy across an UnknownNode
   yields exact USFM); exclusion tests (bytes absent from save USJ and delta contents ops).
8. **E2E (isolated runner)**: Standard view shows and edits char attributes; the zzz6
   closer-edit-settles scenario; Simple view visually unchanged.

No C# changes. No new keyboard handlers (no shortcuts-catalog update).

## 10. Key extension points (from the investigation)

| Concern | Location |
| --- | --- |
| Tokenizer re-parse (exists, reused) | `usfmFragmentToUsj.ts`: `extractAttributes`, `parseAttributeText`, `DEFAULT_MARKER_ATTRIBUTES`, `scanMilestone`, `milestoneDefaultAttribute`, attrCapture folding |
| Display builders | `usj-editor.adaptor.ts`: `createChar`, `addAttributes` (drop the `ms`-only guard), `createVerse`, `createUnknown`; collab materializer construction paths; Tier-2 rebuild materializer (new `ms` branch) |
| Owning module (new) | `libs/shared/src/nodes/usj/attributeDisplay.utils.ts`; transforms registered in `CharNodePlugin` (+ milestone/verse plugin sites) |
| Pend/settle | `MarkerEditPlugin` pend path (`pendingKeys`); `markerEditTier2Trigger.utils.ts` attribute exemption → pend |
| Sentinel classification | `tier2Rebuild.utils.ts`: `hasByteAttributes` (delete), `isRebuildSentinel`, `$appendNodesFragment`, `verseNeedsSentinel`, signature helpers |
| Exclusion gates | `editor-delta.adaptor.ts`, `editor-usj.adaptor.ts` (textType-state checks beside the `NBSP\|` prefix checks) |
| Styling (reused as-is) | `.attribute` / `.marker` classes; `MarkerEditPlugin` mutation listener |

## 11. Decisions log

- **Scope generalized beyond char spans** (TJ, 2026-07-29): milestones fixed and de-sentineled;
  UnknownNodes display full USFM; `textContentAttribute` honored (resolves to Phase 3's periph
  rendering; `\usfm` paras already display correctly and losslessly; root `version` never
  renders).
- **Standard view only; pin under editable marker mode** (TJ, 2026-07-29). Simple view
  untouched.
- **Approach A** — extend the display-run convention with the shared canonical builder — over a
  generic USJ→USFM renderer foundation (TJ, 2026-07-29): the editor needs node structure, not
  byte strings; edit-time dynamics, not serialization, are where the bugs live; B's best ideas
  (single serialization authority, corpus round-trip invariant) are absorbed as
  `canonicalAttributeText` + the losslessness property test.
- **UnknownNodes stay read-only** (TJ, 2026-07-29); display must be selectable/copyable exact
  USFM (TJ, 2026-07-30), hence real engine-text children; generic renderer so periph works
  (TJ, 2026-07-30).
- **Verse sid: carry-over-if-unchanged; sid never forces a sentinel** (TJ, 2026-07-30) — the
  only remaining verse sentinel condition is arbitrary `unknownAttributes` (§6.4).
- **Settle-time default-attribute simplification matches PT9** (TJ, 2026-07-30).
