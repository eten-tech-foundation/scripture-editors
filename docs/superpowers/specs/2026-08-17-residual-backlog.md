# Standard view: residual backlog

What was never scheduled into the six tracks, plus everything the tracks deliberately deferred —
verified against the MERGED code on `sv/integration` (2026-08-17), not inferred from plans. Items
say who recorded them and where the implementation pointers live. Ordering within sections is
rough priority; §1 outranks everything.

Companion docs: `2026-08-17-summary.md` (what landed),
`2026-08-17-residual-backlog-recommendations.md` (recommendations + grouping for implementation).

---

## 1. The Paratext-9 debounce settle — HIGHEST PRIORITY

TJ explicitly asked for it and no track plan contained it. Invariant IV: settle has two clocks —
caret departure OR a Paratext-9-style debounce timer — and all paths run the same settle
computation. Today only the departure clock exists (plus `getUsj()`'s virtual settle). A user who
types a marker edit and then just STOPS — never moving the caret — holds the document unsettled
indefinitely: the screen shows pending bytes, saves flow through the virtual settle (so the FILE
is right), but screen and file quietly disagree until the next gesture.

Shape: a debounce timer (PT9's reformat delay is the parity reference) that fires the SAME
deferred-settle path the departure clock uses (`MarkerEditPlugin`'s deferred settle machinery —
the cascade backstop, grace rules, and `$exceptKeysAround` shield all already apply there). The
timer must respect mid-gesture grace: it settles a caret-HELD site only if the caret has been
idle past the debounce, which is precisely what PT9 does on its reformat tick. Reset on
keystroke/click like the cascade counter. The one design question: whether the caret-held node
itself settles on timer fire (PT9: yes, reformat is global) or keeps its shield (our grace rules
say the shield is for MID-GESTURE edits — an idle timer firing IS the gesture ending).

## 2. Host side (paranext-core) — never scheduled

The §8 ownership table listed these under "Host" and no track picked them up:

- **The debounce settle's host half** — if the timer lands editor-side (recommended), the host
  needs nothing; but the host's save/autosave cadence should be re-checked against the new timer
  so a save between debounce ticks still routes through settled `getUsj()` (it does today).
- **Promote the round-trip warn to a first-class detector.** The editor logs a round-trip
  divergence warning; nothing surfaces it to the user or telemetry. Wanted: a real detector with
  a defined consumer (dev console at minimum).
- **The collab `closed="false"` test** — a remote apply that creates or edits an
  implicitly-closed span, asserted end-to-end through the collab pipeline. Named in §8's Host
  row; still absent from `extensions/src/platform-scripture-editor` tests.

## 3. Coordinates — Invariant II proper

The caret defects were absorbed by structural-caret and the arrow normalizer already landed, but
the invariant itself — ONE place where display bytes are excluded from document positions — was
never scheduled. Now with measurements:

- **Measured divergence** (whitespace handoff, "Findings"): in Standard view `getEditorDelta`
  emits document-space coordinates while `$applyUpdate`'s retain traversal walks display space.
  Offsets: +2 per book+chapter region, +1 per editable VerseNode crossed, char-span glyph bytes
  count differently again (a measured insert landed inside a closer glyph). The
  whitespacePreservation remote-leg tests deliberately bypass `$applyUpdate`; they should route
  through it once this lands — grep the file for DELTA_CHANGE_TAG.
- **The OT "apply" vs "delta-doc" unification** — same root: two position languages.
- **Tier-2 caret-restore fallback** (structural-caret work item A, full spec in their handoff):
  unmappable carets drop to the paragraph start; the fix is byte-offset anchoring across the
  rebuilt paragraph — i.e., the one-position-language again.
- **Two orphaned forward pins** in `libs/shared-react/.../editor-delta.adaptor.test.tsx`
  (`it.skip`): tables have no OT embed representation (whole table flattens to text on the
  wire), and unknown attributes are dropped on every embed kind the apply side accepts. Both
  documented inline; neither has an owner. They are collab-wire shapes of the same
  "the delta layer doesn't know the document" problem.

## 4. Glyph kinds — registry extension, resized

Registered today: `separator`, `char`, `va`, `vp`, `milestone`, `optbreak`, `opaqueUnknown`,
`nestedGlyph`, plus attribute-markers' new `cat` and `ca`/`cp`. NOT registered: opener glyphs,
closer glyphs, para-prefix glyphs.

**The closer part is substantially covered outside the registry** (checked against merged code):
marker-resolution made closer-glyph edits pend and settle on departure
(`$markerNodeTransform`'s closer branch), unmatched closers editable-and-re-matching, and typing
at a closer's end split out immediately. Whitespace's tokenize-identity routing covers the
opener SEPARATOR. Structural markers' deletion runs through `$paraMarkerDeletionTransform`. So
the four duties mostly exist for these kinds — as Tier-1 engine arms, not descriptors.

Residual work, in order of value: (a) the HEAL quadrant for opener/closer glyph machine-drift is
the least covered — verify each kind has a non-user-drift heal path before assuming; (b) folding
the existing arms into descriptors for uniformity (Invariant III's compiler enforcement) is
real but mechanical; (c) settle-loop's warning stands — any new glyph descriptor must classify
by rendered bytes (`$isCanonicalMarkerNode`) from day one, and the `char`/`optbreak` scanners
should switch when touched.

## 5. Quick wins — VERIFIED against merged code, none were swept

1. **Space with a non-collapsed selection should wrap like Enter** (invariants §4's one defect
   row). Verified undone: no Space-with-selection path exists in `UsjNodesMenuPlugin` and no
   track touched the palette. Pointers (marker-resolution handoff §4.1): the editable-mode
   palette decides what Space does; the wrap primitive is `$applyMarkerMenuSelection` /
   `$wrapTextSelectionInInlineNode` (already handles the Enter wrap; comments in
   `markerMenuApply.utils.ts` explicitly anticipate the wrap case). TDD home:
   `markerMenuHarness.test.tsx` (has the Space-dismiss and Enter-commit rows).
2. **The backslash paragraph-vs-inline selector in the first-paragraph region.** Verified
   untouched: `markerMenuContext.utils.ts` unchanged since the base. The selector is
   `$getMarkerMenuContext` → `$isAtParagraphContentStart`; when the caret is outside any
   `ParaNode` (the book/header region) `para` is undefined and source silently falls to
   `"character"`. Reproduce in the first-paragraph region, pin, fix.
3. **The empty-palette orphan** (invariants §2 "no silent no-ops": a palette commit with no
   candidates leaves an orphaned overlay). Verified untouched: no empty-candidates handling in
   `UsjNodesMenuPlugin`. Reproduce (filter to zero candidates, commit), pin, fix.
4. **Milestone attribute-order preservation.** Partially covered: `canonicalAttributeText`
   preserves insertion order (pinned), but the milestone display fold is a FIXED order — sid,
   eid, then unknownAttributes (`attributeDisplay.utils.test.ts` "folds sid then eid then
   unknownAttributes"). Whether an author's non-canonical order survives an edit-settle
   round-trip is UNVERIFIED — the corpus is authored-canonical so the green fixed-point suite
   proves nothing here. Write the red test first; it may pass.

## 6. Deferred by the tracks — actionable items

Grouped by mechanism, not by track; each cites its origin.

### Marker-edit engine
- **Route the Enter-menu split through the char-stack primitive** (structural-caret work item D,
  agreed by char-stack). `$splitParagraphWithMarker` still calls `selection.insertParagraph()`
  directly, so a menu split mid-span tears the style (unwrap path). Reuse
  `$splitParagraphAtCharStack`; adopt caret-INSIDE-reopened-span (structural-caret's
  recommendation as caret owner); update their caret-survival test.
- **Enter-Enter then backspacing the fresh `\p ` away** (structural-caret work item C — full
  three-stage spec in their handoff §C). Stage 1 (what a separator backspace means) LANDED with
  whitespace's separator work; stages 2–3 (jsdom limits; the armed-collapsed reap extension)
  remain.
- **Unify the two verse rest-extraction arms** (integration finding). The
  `VERSE_MARKER_REST_REGEX` arm creates a fresh node while the `VERSE_TEXT_REGEX` arm merges
  into following content; safe today (shield + normalization) but a drift hazard. Make the
  no-separator arm use the same merge helper.
- **Map-derived leading-attribute generalization** (whitespace). Tier-1 still uses per-marker
  regexes (`VERSE_TEXT_REGEX`, chapter's own); deriving from the markers map's
  `leadingAttributes` gives `\f`'s caller and `\id`'s code the collapse rule for free. Crosses
  Tier-1 core — now uncontended.
- **`$signatureOf`'s post-splice blind spot** (settle-loop §7). The fixed-point refusal is
  defeated by any transform that deterministically rewrites rebuild output; the backstop bounds
  it loudly. General fix: compare post-transform, or normalize allowed differences.
- **Fabricated-space half of the verse-adjacent repro** (structural-caret work item B): possibly
  MOOTED by whitespace's allowlist rewrite — extend `verseAdjacentTyping.test.tsx` with the full
  plugin stack and pin no-fabricated-space; delete the item if green.

### Char stack
- **Outer-level stack-aware range Ctrl+Space** (char-stack §3/§6a). Inner level correct; outer
  levels unwrap whole. Needs child-index boundary detection + the attributed-span
  `|name="value"` decision (runs through `$unwrapCharNode` — now uncontended).
- **Internal (`application/x-lexical-editor`) multi-paragraph paste mid-span** still tears the
  span (char-stack §6b, deliberate). Needs node-preserving replay.
- **Move char-stack's paragraph-end Ctrl+Space test to the full harness** (their §6d): the
  eating transform was rewritten by whitespace, so the space now survives — the test move is
  the residual, asserting the composed behavior.
- **NBSP-carrying multi-line paste inserts literal `\n`** (char-stack §6b-note; whitespace's
  `$handlePasteForStandardView` claims any NBSP paste and inserts wholesale). Whitespace-owned
  file; replay newlines as paragraph splits.

### Whitespace / converters
- **Wrap-a-whitespace-only-selection end-to-end test** (whitespace + char-stack, one shared
  test): both halves are merged now; write it.
- **Para-side O(1) separator heal** (whitespace; ratified as acceptable cost — optimization
  only).
- **Table-cell separator lacks token mode** (`usj-editor.adaptor.ts` `createTableCell`;
  whitespace + unknown-blocks both record it): same merge-class hazard that bit collapsed
  notes, latent while cells are read-only. Tag it when touching the file.

### Attribute markers / chapters
- **`cp` on its own line** (PT9 Standard View layout) — ticketed separately by TJ's choice;
  inline shipped.
- **Cross-block fold-back**: deleting the markup from a real `\cp` paragraph does not re-fold it
  onto the chapter until reload (needs a cross-block rebuild scope no current scope expresses).
- **`$createWholeNote` builds no `cat` run** — newly inserted notes cannot carry a category
  until reopened; divergence recorded at the site.
- **Note-starting-with-plain-text caller merge** (attribute-markers §3, contrived shape today):
  Lexical adjacent-text normalization merges note-leading plain text into the editable caller
  after run deletion, and the note rebuild then refuses.

### Unknown blocks / tables
- **Deleting a `\tr ` glyph does not rejoin the paragraph** (no settle scope inside tables —
  `$settleScopeForNode` returns undefined there). Pre-existing for cells, now VISIBLE for rows
  since the glyph is editable-adjacent. Needs a product decision + a table settle story.
- **`\periph` typed as USFM never becomes a `periph` node** (tokenizer has no branch; USX-only).
  Recorded, not scheduled.
- **Drag-MOVE out of an opaque block** is the one unguarded destructive direction
  (unknown-blocks §4, deliberate).

### PT9 parity / palette
- **`closeTag endMarker` spelling** (invariants §7b; `2026-07-07-standard-view-followups.md`):
  we spell closers `marker + "*"` everywhere; stylesheets can declare a different `Endmarker`.
  Unowned follow-up.
- **Scribe**: no unmatched-editing, no `cat` display, no opaque guard — all deliberate
  (unmaintained package; displaying `cat` there would corrupt notes on save). Do NOT partially
  port; the exclusion machinery must travel with any display.

## 7. Doc corrections (cheap, do with any nearby PR)

- Invariants §8: drop/narrow the stale pt-4187 fence on `tier2Rebuild.utils.ts` /
  `virtualSettle.utils.ts` (premise measured stale by unknown-blocks; both files since edited
  with owner approval). Update the registry note: ten kinds registered (add `cat`, `ca`/`cp`),
  with `cat`/`ca` ordered before `milestone` for the loose-glyph classification reason.
- Invariants §7c: the "re-derive which leg" open question is ANSWERED (load leg;
  `NoteLeadingSpaceRoundTripCaptureTests.cs` exonerates ParatextData). Mark it settled.
- Record the chapter/verse whitespace-skip ASYMMETRY (attribute-markers §5) and its post-9.5
  upgrade tripwire somewhere durable — currently only in the capture test and handoff.
