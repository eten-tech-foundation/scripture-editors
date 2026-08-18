# Marker resolution: handoff

Branch `sv/marker-resolution`. Plan: `docs/superpowers/plans/2026-08-15-marker-resolution.md`.
Governing invariants: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

All plan behaviors landed. Full gate at handoff: 9 projects green (3,124 tests), lint and typecheck
clean everywhere, corpus suites at full count with only the 5 pre-existing owner-labeled skips —
zero new skips.

---

## 1. What changed

Eight commits, `a930e830..9a6249a7`.

- **Closer-glyph edits pend and settle on caret departure** (`a930e830`,
  `$markerNodeTransform`'s closer branch). The old arm resolved the moment the edited text ended
  with `*` — which is every mid-glyph edit of a closer — so the span re-tokenized out from under
  the caret on the first keystroke and the retyped closer went unmatched. Closer/selfClosing edits
  now always pend; Tier 2 runs on departure/Enter/blur.
- **Nested opener renames stay Tier 1** (`1f5066e2`, `$applyOpenerRename`). The typed-`+`
  Tier-2 routing now keys on `node.getNested()`: a `+` typed onto a non-nested glyph is still a
  nest instruction; on an already-nested glyph it is the canonical spelling, so `\+nd` → `\+wj `
  renames in place and mirrors the nested closer instead of stranding it unmatched.
- **`ImmutableUnmatchedNode` is editable TEXT, not a decorator** (`c00674d6`). Under Invariant I
  the flagged bytes are document bytes: now caret-addressable, editable in place (edits pend via
  the new `$unmatchedNodeTransform` and settle through Tier 2), deletable byte-by-byte (empty ⇒
  the construct is removed). Its bytes flow through the Tier-2 fragment as text, so
  **re-matching falls out of re-tokenization**: the first unmatched closer inside an open span of
  the same marker becomes that span's closer; later ones stay unmatched (pinned at the tokenizer
  and in `unmatchedCloser.test.tsx`, covering the paste repro's end state).
  - View split, ratified by the owner: mode `"normal"` (editable in place) only under
    `markerMode: "editable"`; atomic `"token"` in every other view and in scribe, where no engine
    exists to settle an in-place edit and accepting one would silently revert on save.
  - Serialized shape is v2 (carries the TextNode fields); `importJSON` derives the bytes from
    `marker` for v1 shapes (collab embeds, old fixtures).
- **Editor/file agreement pins for the three closer-edit divergences** (`cae04462`,
  `closerDivergence.test.tsx`): each settles and the editor USJ equals `usfmFragmentToUsjContent`
  over the same displayed bytes — attribute demotion to content bytes on a mismatched-closer edit,
  a typed replacement closer coexisting with the old one gone unmatched, and a deleted closer's
  trailing content joining the now-open span.
- **Typing at a char-span closer's end splits out of the glyph immediately** (`3b7c87e5`).
  `\nd*x` re-tokenizes as the closer plus plain text, so the split is applied in the typing commit
  (re-tokenization identity) — the typed character lands unstyled after the span with the caret.
- **The mid-typed-literal settle bug — the live "typing `\va` after a verse resolves at `\v`"
  report — fixed** (`9a6249a7`). Diagnosed in the standalone demo with a scripted browser; no host
  involvement. A mid-typed literal is not always one text node: `$verseNodeTransform`'s rest split
  parked the typed `\` in its own node, the next keystroke landed in a fresh boundary-point node
  (whose format/style difference also blocks Lexical's text-node merge), and the resolve's caret
  shield protected only the caret's single node — so the pended `\` sibling read as departed and
  settled mid-word, gluing `\vbut…` together in the rebuild fragment where the tokenizer sees a
  terminated unknown marker and splits the paragraph. Fixes: the verse split merges its rest into a
  following plain content text node, and the resolve shield covers the caret's whole contiguous
  plain-content-text run (`$exceptKeysAround`). Verified against the live demo end to end.

## 2. Corrections to the plan (and to an interim report)

- The plan's contingency ordering assumed the matching rule could land without the representation
  change. It cannot: re-matching was blocked precisely by the decorator riding through rebuilds as
  an opaque sentinel, and the fragment builder itself needed no edits once the node became text.
- An interim diagnosis attributed the `\va` degradation to the host save loop re-parsing mid-edit
  bytes. **Wrong** — it reproduces in `nx dev platform` alone and the actor is the engine's
  caret shield (above). The test-file header (`typedMarkerResolution.test.tsx`) records the
  corrected account.
- The reported "deleting an unmatched nested closer deletes everything inside the enclosing span"
  can no longer be expressed against the text representation (the sentinel accounting that ate the
  content is gone), so its test is a forward pin of the desired behavior, not a red-green fix.

## 3. Merge notes — files other tracks own or share

- **`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` (Coordinates track): one
  added skip** in `$handleTextNodes` — `if ($isImmutableUnmatchedNode(currentNode)) return;` with a
  comment, mirroring the editable-VerseNode skip above it. The construct is conveyed by its embed
  op; without the skip its now-text bytes would double-count the embed's OT length. `delta-common`
  needed nothing (its `$isEmbedNode`-first helpers already handle a TextNode embed).
- **`packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` and `virtualSettle.utils.ts`
  (§8 off-limits for pt-4187; owner approved this edit): one added branch in each signature
  function** (`$appendSignature` / `appendSerializedSignature`) tagging unmatched nodes like marker
  glyphs. Without it, literal `\*` → flagged-element resolution is byte-identical and the
  fixed-point refusal blocks it forever. Hunks verified disjoint from pt-4187's pending diff at the
  time of writing.
- **`$resolvePendingMarkers` (shared with the whitespace track via `markerEditTier1.utils.ts`)**:
  the except-key filter is now a SET (`$exceptKeysAround`) covering the caret's contiguous
  plain-text run; the piece-mapping arm honors the same set. No other restructuring; separator
  grace, pend reporting, and tokenize-identity routing untouched.
- **`libs/shared-react/src/plugins/usj/collab/delta-apply-update.utils.ts`**: `$createImmutableUnmatched`
  now takes `viewOptions` (shape-twin with the forward adaptor's mode split).
- **`packages/utilities/src/converters/usj/converter-test.data.ts`**: the three serialized
  unmatched fixture entries updated to the v2 shape (`editorStateGen1v1` token-mode; the Editable
  and Standard states normal-mode). **`libs/test-data` 2SA lexical fixtures regenerated**
  (`GENERATE_TEST_DATA=1 pnpm generate:test-data`).
- **`packages/scribe`**: mechanical only — `createUnmatched` emits the full v2 serialized shape
  (typecheck-forced by the shared type).
- Anyone with `$isTextNode`-then-assume-content logic should note the unmatched node now MATCHES
  `$isTextNode`; classify embeds via `$isEmbedNode` / `$isOTTextNode` (delta-common) as the verse
  precedent already requires.

## 4. Deferred — for the merge chat to CHECK, and do if no track already did

These were out of this track's scope. Each may have landed on another branch; verify before
implementing.

1. **Space with a non-collapsed selection should wrap like Enter.** The one row of the invariants
   doc's §4 palette table that is a DEFECT, not a decision: today Space with a selection does
   nothing; it should wrap the selection in the typed marker the way the Enter/apply path does
   (closed span, `\marker …\marker*`). Where: the editable-mode palette — shared-react's
   `UsjNodesMenuPlugin` ("editableHarness" branch) decides what Space does; the apply primitive is
   `EditorRef.applyMarkerMenuSelection` →
   `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts` (`$applyMarkerMenuSelection`),
   which already handles the Enter/commit wrap. Likely candidates to have done it: nobody —
   no track owned the palette. If implementing: TDD in
   `packages/platform/src/editor/markerMenu/markerMenuHarness.test.tsx`, which already covers the
   Space-dismiss and Enter-commit rows.
2. **The USX parse-side whitespace loss (`\cat*` space et al.).** Invariants §7c: the loss is in
   `packages/utilities/src/converters/usj/usx-to-usj.ts` (whitespace-only first child dropped;
   multi-space between elements dropped; only an exact single trailing space rescued) — owned by
   the **whitespace track**; check its handoff. Also §7c's correction: ParatextData is NOT
   exonerated — the load leg (`getChapterUSX() → usxStringToUsj → editor`) versus
   ParatextData-internal question still needs a C# capture test (capture tests are outside the C#
   approval gate; fixes are not). Regression-net precedent:
   `packages/utilities/src/converters/usj/optbreak-whitespace.test.ts`.
3. **PT9-parity follow-ups.** (a) The close/reopen primitive (splitting a char stack) — owned by
   the **char-stack track**; check its handoff. (b) The `closeTag endMarker` spelling: PT9 builds
   closers as `marker + "*"` while its menu uses the stylesheet's `Endmarker`; we use one spelling
   everywhere — follow-up recorded in `2026-07-07-standard-view-followups.md`, unowned. (c) Do NOT
   "restore parity" on the deliberately divergent items in invariants §7b (Ctrl+Space reopen
   order, `cp` with markup, closing-glyph spelling).

## 5. Manual-test additions (extend the seeded list in the execution doc)

- With the caret at the very start of a verse's text (and again with it at the end of the verse
  glyph itself), type `\va` slowly, then Space — every keystroke stays literal in place; Space
  folds to `\v N \va …`. No red unknown paragraph at any point.
- Copy `\nd fruit\nd*` from the rendered text and paste (the separator arrives as `~`): delete the
  `~`, type a real space — the flagged `\nd*` re-matches into a clean closed span.
- Type `\nd asdf \nd* fdsa \nd*` — first closer matches, second stays flagged red; the flagged one
  is caret-editable and deletable character by character.
- Click into a closer glyph (`\nd*`), retype it to `\wj*` — nothing resolves while typing; arrow
  away — the span auto-closes and `\wj*` goes flagged. Editor and file agree.
- Click just after a closer glyph and type — the text lands unstyled after the span.
- Rename a nested opener `\+nd` → `\+wj ` — its closer follows; the outer span is untouched.
- In Formatted view, confirm a flagged unmatched marker is atomic: caret steps over it whole,
  Backspace removes it whole, typing cannot enter it.
