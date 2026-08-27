# Standard View Invariants — the editor engine

> Read this before changing the marker-edit engine, the settle machinery, the display-run registry,
> or the USFM tokenizer. It is the contract those pieces keep with each other. Ignoring one of these
> is how the same defect class keeps coming back.

Standard view shows USFM markers as editable text. That one product decision generates everything
below: if a marker glyph is on screen and the caret can enter it, the glyph is part of the document,
and every layer has to agree on what "the document" means.

**This document covers what THIS repo owns.** The host repo (`paranext-core`) owns the USJ-to-USFM
writer, the markers map, the palette's key semantics, and the C# serialization gate, and carries its
own half at `.context/standards/Standard-View-Invariants.md`. Neither half assumes you have the
other checked out; if you do, read both.

**What this is not.** Not a design doc and not a work plan. It records only the rules that more than
one area depends on, so parallel work cannot drift.

---

## 1. Governing invariants

### I. Displayed bytes are the document

Every byte the user can place a caret in is document text. Changing it changes the file, by
**re-tokenizing the displayed bytes**.

Corollaries:

- **Never heal against a user edit.** Healing exists for drift introduced by non-user code paths.
- **Structural truth is re-tokenization.** In-place mutation is an optimization, valid only where
  re-tokenization is provably identity.
- **No silent no-ops.** A keystroke either changes the document or is visibly refused. Accepting a
  keystroke and discarding it later is the failure this rule exists to prevent.

The one ratified exception is space-run collapse — see §4.

### II. One position language

Display bytes (marker glyphs, separators, attribute-run text, verse glyphs, para prefixes) are
excluded from document positions in exactly ONE place. Caret anchoring across a rebuild, OT content
op offsets, and delta-doc positions all resolve through it.

The caret/selection half landed: `libs/shared/src/nodes/usj/glyphPositions.utils.ts` decides which
rendered bytes are display by the property that _a node's text is a picture of its own state_, and
re-expresses a point so no glyph is an operand of the edit about to run. Three separately-reported
bugs turned out to be one cut reached from three gestures.

The collab half is not unified yet: the ops stream
(`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`) and the delta-doc length side
(`delta-common.utils.ts`) still keep separate exclusion predicates, and they already differ by one
arm. **Do not add a third private exclusion; extend the shared one** — the reason this invariant is
written down is that every display-byte class which got its own exclusion had to be found and fixed
separately, once per consumer, each after a bug.

### III. One lifecycle for engine-owned display things

Every kind the engine owns — attribute runs, milestone runs, verse `\va`/`\vp` runs, opener glyphs,
closing glyphs, the nested `+`, opener separators, para-marker prefixes, optbreak bytes — carries
the same four duties:

1. **construct** canonically,
2. **heal** non-user drift,
3. **pend** on user edit or deletion,
4. **settle** on departure.

A kind wired for some duties and not others is the recurring defect shape ("missing quadrant"). New
kinds join `libs/shared/src/displayRun/displayRunRegistry.ts`; they do not hand-wire a fifth
quartet.

### IV. Settle has two clocks and one definition

- **On screen**: caret departure, OR a Paratext-9-style debounce timer.
- **For consumers**: `getUsj()` returns settled output without mutating the editor.

All paths run the SAME settle computation. Divergence between them is a defect, not a trade-off.

A settle is **never its own undo entry**. Undo undoes what the USER did, so every settle merges into
the history entry of the edit that provoked it. A settle commit is still a real content change and
must reach USJ-change consumers, which is why it carries `MARKER_SETTLE_TAG` alongside the merge
tag. A narrower gate — merge only settles that are USFM-equivalent, by comparing canonical USJ
before and after — was considered and **rejected on cost** (two full-document serializations per
settle, on both clocks). Do not reintroduce it.

### V. A loaded document is a transform fixed point

Load a document, dirty every node, run the update, serialize. The output must equal the input.

Any difference means a transform fabricated content, deleted content, or the load shape was not
canonical. All three are bugs. This is machine-checkable, and it is checked:
`packages/platform/src/editor/markerEdit/tier2Rebuild.corpus.test.tsx` runs it over the 2SA corpus.
Transforms do not run on `setEditorState` — they run when a node is dirtied — so a transform that
fabricates or deletes content does so on the user's first edit to a region, not at load. That is why
the net has to dirty nodes rather than merely load them.

---

## 2. Derived rules

Each was settled by investigation or product decision. Do not re-derive them.

### Heal by provenance, never by caret proximity

Whether to restore an engine-owned byte depends on WHO removed it, not on where the caret is.
Caret-proximity heuristics are what let deletions silently miss their pend. Machine drift heals; a
user edit pends.

### The tokenize-identity predicate

> Restore a removed engine-owned byte iff the bytes tokenize IDENTICALLY without it.

Applied to the opener separator:

| Bytes               | Without the space | Same meaning?                                           |
| ------------------- | ----------------- | ------------------------------------------------------- |
| `\nd` + `\wj stuff` | `\nd\wj stuff`    | yes — the name scan stops at `\` either way. **Heal.**  |
| `\nd` + `\|x="y"`   | `\nd\|x="y"`      | yes — the name scan stops at `\|` either way. **Heal.** |
| `\nd` + `things`    | `\ndthings`       | no — the marker is now `ndthings`. **Rename.**          |
| `\nd` + `*stuff`    | `\nd*stuff`       | **no — that is a CLOSING marker.** Do not heal.         |

The last row is why the rule is defined by MEANING and not by a character class: `*` is one of the
tokenizer's four name-scan terminators (`\`, `|`, whitespace, `*`), so an allowlist built from
terminators would wrongly heal it and silently stop the user typing a closer.

The predicate lives beside the tokenizer, in `libs/shared/src/nodes/usj/markerSeparators.utils.ts`,
so it cannot drift from it.

### Leading-attribute whitespace collapses

Whitespace between a marker and its leading-attribute value is structural and collapses to one.

Which markers have leading attributes, and in what order, comes from the host's markers map field
`leadingAttributes` — **not** from a list maintained here. So `\v  5` is verse 5, `\c  3` is chapter
3, `\f  +` has caller `+`, `\id  MAT` has code `MAT`: one rule, no per-marker exceptions.

Consequence: a space typed next to a verse cannot demote its number. Only a non-space character
after the number does that — `\v 7 5` is verse 7 followed by body text `5`.

### Note callers are atomic in Standard view

A collapsed note caller is ONE unit: arrow keys step over it whole, deletion removes it whole, and
its text is not editable by typing. This matches Paratext 9; the caller is changed through the host's
footnote-editor UI instead.

This is a VIEW-level rule keyed on `noteMode === "collapsed"`, not a node-level one. **The expanded
note shape is used by two surfaces with opposite needs** — the host's footnote-editor popover, where
the marker and caller are governed by dropdowns and should not be typeable, and the main editor's
Markers view, which has no such UI and wants direct caller editing. Any rule about editing a note's
shell has to be keyed on a view option, never on `noteMode: "expanded"` alone.

### `\cat` is the attribute marker the stylesheet does not declare

`ATTRIBUTE_MARKERS` holds `ca`, `cp`, `va`, `vp`, and `cat`. All but `cat` are also usfm.sty
entries, so `cat` is the single marker for which "is this in the stylesheet?" and "can the tokenizer
re-derive this?" give different answers.

Any re-derivability test keyed on the stylesheet must therefore exempt attribute markers
(`isAttributeMarker`): for those the parser's own table is the authority, because the fold is what
defines the round trip. Tier-2's `$charNeedsSentinel` is the one that matters. Classified as an
unknown custom marker, a first-class `\cat` span is preserved as an opaque sentinel — its bytes stop
reaching the tokenizer, the category fold never fires, and every later pass reports a fixed point,
so a `\cat` run typed after a note's caller becomes a `category` only by round-tripping through the
file. That also strands the caret: with the span opaque, a byte anchor captured inside it resolves
past the following marker glyph, so the rest of what the user types lands in the NEXT span.

Keep that predicate in ONE place. The fragment builder and the signature/live-walk classification
decide the same thing about the same node, and silently corrupt the rebuild if they disagree.

### Prefer a declared property over a new exception list

Before adding a per-marker special case, check whether the host's markers map already declares the
property. `leadingAttributes`, `attributeMarkers`, `textContentAttribute`, and `defaultAttribute`
are all declared there, ordered, and versioned.

But the map cannot express everything, and the duplication with this repo's own `ATTRIBUTE_MARKERS`
table is deliberate. The two were checked against each other and **agree on every marker, attribute
name, shape, and host**; each holds facts the other cannot represent:

- **Map only:** `hasStructuralSpaceAfterCloseAttributeMarker`; the map-level
  `isSpaceAfterAttributeMarkersContent` spec-vs-Paratext switch; version and spec/Paratext variants.
- **Here, and load-bearing:** a same-line space before an attribute marker BLOCKS the fold (Paratext
  parse behavior, no map representation); markup inside the content aborts the fold; an empty span
  is never an empty attribute; `cat` is receptive only directly after `\esb` or right after a note's
  caller.

The map models the SERIALIZER (USJ to USFM, spec-declarative). This table models the PARSER (USFM to
USJ, deliberately matching ParatextData rather than the spec). **Derive the shared facts from the
map; keep the parser-behavior deltas local, explicit, and named.** Do not collapse one into the
other.

---

## 3. What applying a marker DOES to the document

The host owns which KEY does what (see its half); this repo owns the resulting document change.

- **Commit at a collapsed caret** materializes the typed literal and lets Tier 2 resolve it. The
  span records `closed="false"` — no closing marker.
- **Commit over a selection WRAPS** it in a CLOSED span, whatever the marker's insertion default is.
  The note-content families (`\ft`, `\xt`, `\fq`, `\fr`, `\xo` …) are inserted closer-less by
  convention, but "wrap this text" means a closed span, so the wrap adds the closer. Getting this
  wrong is invisible rather than loud: a fresh wrapper with an opener and no closer loses that
  opener to the wrap primitive's strip branch, and the marker-edit engine then unwraps the
  glyph-less span again — the apply does nothing at all.
- **A closing marker typed over a selection** DELETES the selected content and lands the literal
  closer in its place (Paratext 9 parity). That is a different gesture from the wrap, so the two are
  not interchangeable over a selection.
- **A non-NEST style applied INSIDE an open char span** closes every enclosing style before the
  point and reopens the ones with content after it — it never nests. `$applyNonNestInsideChar`
  (`packages/platform/src/editor/adaptors/usj-marker-action.utils.ts`) implements this for a
  collapsed caret and a selection within one text node. **Selections spanning several nodes still
  fall back to the generic wrap and are known to mangle the spans they cross** — the covered text
  should take the new style while each crossed span keeps its uncovered tail.

---

## 4. Ratified behavior — do not "fix" these

**Space runs collapse on save; the display is deliberately NOT collapsed to match.** Type `a  b` and
after a settle the screen keeps both spaces while the file gets one, indefinitely. That is a real,
permanent screen-vs-file divergence, ratified anyway: it models Paratext 9's `RegularizeSpaces`, and
normalizing the display instead would delete a byte under the user's caret.

**This is a one-off and must not be generalized.** It is the single place where the answer to "the
screen and the file disagree" is "leave it". Every other divergence is a defect. If a new case looks
like this one, it is not — bring it to the owner rather than reasoning from this row.

The related-but-opposite rule, and NOT an exception to anything: a space the user TYPES beside a
marker is inserted, stays visible, and leaves the caret immediately after it — in a verse or chapter
glyph's separator run, after a char opener, and inside any of the five display runs (`va`, `vp`,
`ca`, `cp`, `cat`). The file is unaffected either way because the writer emits structural whitespace
itself. Accepting that keystroke and discarding it would be the no-silent-no-ops failure.

**Multi-step undo for a palette item apply** is intentional. (Settles are not part of this — see
Invariant IV.)

---

## 5. Fixed points

Extend these; never weaken them.

- The tokenizer and losslessness core: `usfmFragmentToUsjContent`, `extractAttributes`,
  `scanMilestone`, NBSP/space flattening.
- `canonicalAttributeText`.
- The editor-to-USJ and delta exclusion gating.
- Tier 2's preserve-or-refuse machinery: fixed-point signature, sentinel symmetry, guard rails.
- The corpus losslessness and round-trip property tests, at zero skips.
