# Feedback: chapter `\ca` display and settle (Standard view)

Branch `sv/fb/ca-display`. TJ's feedback on the Stage-C chapter attribute work
(`docs/superpowers/specs/2026-08-14-attribute-markers-handoff.md`), three parts: the
first-class-char fold gap, the run's styling, and the run's placement.

## What shipped

### 1. The fold gap: a chapter-adjacent first-class `\ca` char now settles onto the chapter

TJ's repro: type `\ca ` after `\c 1`, let it settle (first-class `char ca` at root — correct),
then type `3\ca*` into that span — it stayed a separate char until a reload folded it. The fold
rule already lived in the tokenizer's load path; the gap was scope resolution: a root-level char
has no Note/Para/Chapter ancestor, so `$settleScopeForNode` returned undefined and a pend inside
it could never settle.

- **`$settleScopeForNode`** (tier2Rebuild.utils.ts) gained an adjacency arm: a node whose
  top-level ancestor is a root-level `\ca`/`\cp` CharNode reaching a ChapterNode through only
  other such chars settles through that CHAPTER's scope. Single definition — the mutating settle,
  the read-only settle, and the trigger's pend arm all route through it.
- **`$chapterAdjacentAttributeChars`** (new, exported): the contiguous run of root-level
  `\ca`/`\cp` chars directly after a chapter — the chapter settle REGION beyond the chapter's
  children. `$buildChapterFragment` appends their bytes, so the re-tokenize sees `\c` and `\ca`
  together and the tokenizer stays the single fold authority: a foldable span folds
  (capture-pinned post-`\ca` whitespace skip applies); an unfoldable one (empty, unclosed,
  markup-bearing) re-tokenizes to its identical first-class self — a fixed point, refused without
  churn.
- **`$rebuildChapter`**: fixed-point signature compared over the region; splice removes the whole
  region; the caret-anchor check spans the region (an edit inside the adjacent char is the fold's
  primary trigger, and its caret restores by fragment offset like any other).
- **`$textNodeTier2Transform`** (markerEditTier2Trigger.utils.ts): the chapter-side twin of the
  verse-attribute-source arm — a no-backslash value edit inside such a char now PENDS its key
  (previously deleted; the fold then waited for reload). The condition is
  `$isChapterNode($settleScopeForNode(node))`, which at that point in the chain can only be true
  via the adjacency arm — no re-derivation of the rule. Literal `\ca*` closers keep the existing
  immediate terminated-marker arm, which now finds the chapter scope.
- **Virtual settle** (virtualSettle.utils.ts): `$settledChapter` compares its fixed point over the
  same region; `$settledUsj`'s chapter pass splices `1 + adjacentChars` serialized siblings, so a
  folded span vanishes from `getUsj()` output exactly as from the live tree.

Tests (red first): two fold tests plus a markup-refusal pin in
`chapterAttributeSettle.test.tsx` (value edit folds on departure, byte-identical at the USJ layer
with a reload of `\c 1 \ca 34\ca*`; TJ's typed-closer sequence folds on settle); four
`$settleScopeForNode` adjacency pins in `tier2Rebuild.utils.test.tsx`; a new
`settledGetUsj.test.tsx` shape ("first-class ca char adjacent to its chapter, value edited") —
red via the suite's vacuity guard (nothing pended before the fix) — pinning virtual ≡ real and
the Tier-2 fixed point of the settled output.

### 2. Styling: the run renders exactly like the standalone char (non-bold green)

The folded run rendered bold gray: the wrapper carried only `.attribute-run` (dim gray) and
inherited `.usfm_c`'s bold. Fix is the established va/vp mechanism extended:

- **`AttributeRunNode.createDOM`/`updateDOM`** (shared): the marker-class discriminator
  (`runKindMarkerClass`) now covers `ca` and `cp` alongside `va`/`vp` — the wrapper carries
  `usfm_ca`/`usfm_cp`, so the stylesheet styles run and standalone span identically. `milestone`
  (per-instance markers) and `cat` (no standalone stylesheet look to match) deliberately get
  nothing, pinned in `AttributeRunNode.test.ts`.
- **`usj-nodes.css`**: `.formatted-font .usfm_ca` gains explicit `font-weight: normal` — a no-op
  for the standalone span, load-bearing inside the bold chapter. New
  `.formatted-font .usfm_c .usfm_ca/.usfm_cp` rules divide the font-size by `.usfm_c`'s 1.5 so the
  nested runs land at exactly their standalone sizes (percent font-size compounds with the
  parent's). No `usfm_va`-style glyph-size reset: glyphs render at 0.7em of the span in BOTH
  states, so leaving them alone is what keeps the states identical.

Scope note: `va`/`vp`/`cat` runs are untouched. `cp` shares the mechanism (wrapper class + size
correction) because it is the other chapter run and its standalone paragraph form has the same
stylesheet identity; its bold blue IS its standalone styling, so it stays bold — TJ's non-bold
rule is `ca`'s own standalone look, applied to `ca`.

### 3. Placement: `\ca` on the line after `\c`, both states — CSS-only

Chose TJ's preferred direction (a): **next-line for both states**, via `display: block` on the
chapter-hosted `usfm_ca` run wrapper.

- Trade-off considered: (b) same-line for both would require making the FIRST-CLASS char render
  inline against a block chapter — restructuring real node layout (the standalone char sits at
  root between two block elements) for the transient pre-fold state, with new caret-geometry
  risk. (a) is one CSS declaration on an element whose bytes and document positions are unchanged
  — display bytes are excluded from positions by node state (`textType`/glyph node classes), not
  by layout, so the delta exclusion and left/right caret order are untouched by construction;
  headless traversal suites cannot even observe CSS. This also matches PT9's Standard view, which
  renders the `\ca` span outside the chapter's block div (the Stage-0.3 finding).
- `\cp` deliberately stays inline (its own-line move is separately ticketed). When BOTH runs
  display, the block `\ca` run pushes the inline `\cp` run onto the following line as a layout
  consequence — which is PT9's own three-line layout for that shape, noted in the CSS comment.

## Deviations / notes

- The suite the task named `chapterAltnumberSettle.test.tsx` is `chapterAttributeSettle.test.tsx`
  in this tree (renamed when `\cp` joined); the new tests live there.
- No adaptor serialization change, so no 2SA fixture regeneration was needed (verified by the
  corpus suites passing untouched).
- The `cp`-as-char chain pin (`$settleScopeForNode` through an intervening char) uses the bare
  test environment: a first-class `cp` CHAR is not a shape the engine leaves at rest (real
  first-class `cp` is a ParaNode), but the chain rule is pure tree geometry and worth pinning.
- The immediate terminated-marker arm means a typed `\ca*` closer can fold at the keystroke
  rather than waiting for departure — the same instant-commit closers have everywhere else, and
  strictly earlier than TJ's "on settle" requirement.

## Verification

- Red-green on every behavior change (see test list above; each red watched failing for the
  feature-missing reason).
- Full `nx run-many -t test lint typecheck` gate at the end; corpus suites at full count; zero
  new skips. Suite numbers in the final report.
