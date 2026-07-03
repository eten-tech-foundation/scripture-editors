# Standard View Phase 2 — Engine Notes for Phases 3–5

Source: Phase 2 plan (`docs/superpowers/plans/2026-07-02-standard-view-phase-2.md`,
commit `784e6e6`), executed as `.superpowers/sdd/progress.md` (Phase 2 section) tracks,
branch `standard-view`, commit range `784e6e6..ae83555`. This doc is the ground-truth
handoff — where it disagrees with the plan's own "Out of scope" seed list, this doc wins
(it reflects what was actually built, including fixes discovered only during execution).

## What Phase 3 (footnote UX) needs from the engine

- **MarkerEditPlugin shape.** `MarkerEditPlugin` (`packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx`)
  is a React component taking `{ viewOptions: ViewOptions | undefined; logger?: LoggerBasic }`,
  mounted once per editor instance (see `packages/platform/src/editor/Editor.tsx`, alphabetical
  plugin block). It is a no-op unless `viewOptions?.markerMode === "editable"`. Internally it
  builds one `MarkerEditContext` (`viewOptions`, `pendingKeys: Set<NodeKey>`,
  `splitExpected: { current: boolean }`, `rebuildAttempted: Set<string>`, `logger?`) per mount and
  registers everything (node transforms, `KEY_DOWN_COMMAND`/`KEY_ENTER_COMMAND`/
  `INSERT_PARAGRAPH_COMMAND`/`BLUR_COMMAND`/`SELECTION_CHANGE_COMMAND`, a `TextNode` mutation
  listener for `.attribute` dimming, and — only when standard view — the whitespace-display
  transform and `COPY_COMMAND`/`CUT_COMMAND` handlers) via one `mergeRegister(...)` call. To mount
  it inside the `FootnoteEditor` popover (lives in `paranext-core/lib/platform-bible-react`, a
  code surface outside this repo — see the design spec §6, "a third code surface this feature
  touches"), that component needs its own `<LexicalComposer>`/editor instance to render
  `<MarkerEditPlugin viewOptions={...} logger={...} />` into, with `viewOptions` computed the same
  way the host webview computes it today (`markerMode: "editable"`, standard-view flags as
  appropriate for note content). No public API changes are needed on this repo's side to support
  that — `MarkerEditPlugin` is already a plain, viewOptions-driven React component with no
  platform-specific coupling beyond `usjEditorAdaptor` (used only inside Tier 2 rebuilds).

- **Phase 3 precondition (task zero): the adaptor `_viewOptions` is a module-level singleton.**
  Both `editor-usj.adaptor.ts` (reverse) and `usj-editor.adaptor.ts` (forward) hold their active
  `ViewOptions` in a module-scoped `_viewOptions`, set once per `initialize(...)` at `Editor`
  render (`isStandardView()`/`markerMode` reads all funnel through it). This is safe today because
  a webview hosts exactly one editor. The FootnoteEditor introduces a **second** `<LexicalComposer>`
  in the same webview, and note content may run in a different view mode than the host (e.g. an
  editable-marker note popover over a non-editable host, or vice versa). With a shared module
  singleton, whichever editor initialized last wins, silently corrupting the other's
  serialize/deserialize (NBSP inversion, marker glyph emission, leading-space display all branch on
  `_viewOptions`). Before wiring a second editor, thread `viewOptions` per call — pass it into
  `deserializeEditorState`/`serializeEditorState` (and the internal `isStandardView()` and
  `create*` helpers) instead of reading the module global, or hold it per-editor-instance. Do this
  as Phase 3 **task zero**, ahead of any FootnoteEditor mount; it is a precondition, not a cleanup.
  (Deliberately not refactored in Phase 2 — no second editor exists yet, so the singleton is still
  correct; recording it here so Phase 3 hits it first, not as a mid-stream surprise.)

- **Note content is currently a Tier 2 dead zone — by design, not oversight.** Two independent
  guards both skip note interiors, and Phase 3 needs to lift (or replace) both:
  - `$requestTier2ForNode` (`tier2Rebuild.utils.ts`): its ancestor walk returns immediately on
    `$isNoteNode(current)` with the comment `// note content is its own scope (Phase 3)`.
  - `$textNodeTier2Transform` (`markerEditTier2Trigger.utils.ts`): its own ancestor walk also
    returns on `$isNoteNode(parent)` (grouped with Book/Chapter/Unknown, all "keep literal text /
    degradation property" cases) — this is the trigger that would otherwise fire Tier 2 for typed
    `\fr`/`\ft`/`\fq` inside a note. `$displayWhitespaceTransform`
    (`whitespaceDisplay.plugin.utils.ts`) has the identical skip-list for the same reason (§4
    whitespace display also does not currently apply inside notes).
  - Plan decision #10 makes this explicit: "Notes are not a Tier 2 scope in Phase 2 — text typed
    inside expanded/unclosed note content does not trigger re-tokenization (the note is its own
    scope, threaded in Phase 3). Tier 1 opener renames on notes (e.g. `\f`→`\x`) DO work (same
    mirror pattern as char)" — so Tier 1 (`$applyOpenerRename`'s `$isNoteNode(parent)` branch,
    `NoteNode.isValidMarker` kind check) is already note-aware and needs no Phase 3 change.
  - **Recommended shape for the lift:** add a `scope` parameter (or equivalent) to
    `$requestTier2ForNode`/`$textNodeTier2Transform`/`$displayWhitespaceTransform` distinguishing
    "paragraph scope" (current behavior) from "note scope," and add a `$rebuildNoteContent`
    sibling of `$rebuildParas` in `tier2Rebuild.utils.ts` that re-tokenizes a note's own content
    (its own fragment, not the whole containing paragraph) using the same
    `usfmFragmentToUsjContent` tokenizer and the same sentinel/guard-rail mechanics —
    `$buildParaFragment`'s guard-rail shape (unknown-attributes/opaque-ancestor refusal,
    sentinel-count symmetry) generalizes directly to a note-content fragment builder. The tokenizer
    itself already emits `note`/char/verse tokens generically; nothing in
    `usfmFragmentToUsjContent` is paragraph-specific, so the tokenizer needs no changes — only the
    engine-side fragment builder and splice logic need a note-scoped counterpart.

- **Caller data survives rebuilds via sentinels, not regeneration.** `$appendChildrenFragment`
  treats `NoteNode` as an atomic sentinel (`pushSentinel(out, [node])`) whenever a Tier 2 rebuild
  runs on the *containing paragraph* — so today, a paragraph-level rebuild (e.g. typing a new char
  marker elsewhere in the same paragraph) never regenerates or touches an existing note's caller;
  the whole `NoteNode` (with its `caller`, `isCollapsed`, category, and children) moves through the
  rebuild by node identity. When Phase 3 adds real note-scoped re-tokenization (previous bullet),
  a *newly typed* note (`\f + \ft ...\f* `) still goes through the ordinary tokenizer path — the
  tokenizer's `note` token case assigns a caller from the fragment text if present or a default of
  `"+"` (see `usfmFragmentToUsj.ts`'s `note` handling — untyped/no explicit caller falls back to
  `"+"`); this is a data-driven "default caller," not the a–z-counter or the sequence-aware caller
  generation the design spec §6 calls for ("`+` callers draw from the project's caller sequences —
  footnotes and cross-references have separate sequences, cross-references default to `†`... `-`
  displays as `*`; custom callers display as typed"). The place that already implements
  caller-generation logic for the forward (USJ→editor) direction is `createNoteCaller` in
  `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts:423` (and the scribe package's
  parallel copies in `packages/scribe/src/editor/adaptors/{usj-editor,note-usj-editor}.adaptor.ts`)
  — Phase 3's caller-sequence work plugs in there for load-time caller assignment, and the
  tokenizer's default-`"+"` fallback is the natural spot to route newly-typed notes through the
  same sequence logic rather than a hardcoded default, if Phase 3 wants typed-note callers to
  respect sequences immediately rather than only on next full reload.

## What Phase 4 (StyleInfo) needs

- **Tokenizer classification: one call site.** `usfmFragmentToUsjContent`
  (`libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`) calls `getMarker(isNested ? name.slice(1) : name)`
  exactly once (line ~141, inside the char/para-opener classification branch) to decide a marker's
  `MarkerType` (Paragraph/Character/Note/Unknown) and its `hasEndMarker`/`children` shape. Note,
  verse, and milestone markers are recognized independently via `NoteNode.isValidMarker`/
  `MilestoneNode.isValidMarker` (both already exported from `shared` and marker-name-pattern based,
  not `getMarker`-based) rather than through this call. Swapping in project StyleInfo means
  replacing (or wrapping) `getMarker` — `libs/shared/src/utils/usfm/getMarker.ts`, currently
  `usfmMarkers` (a generated usfm.sty table) merged with `usfmMarkersOverwrites` (a hand-maintained
  patch/add layer, extended this phase to add `w`/`rb`/`jmp`) — with a lookup backed by the
  project's actual StyleInfo (its own usfm.sty + any custom.sty). `getMarker`'s signature
  (`marker: string) => Marker | undefined`) is the seam; nothing else in the tokenizer needs to
  change if a StyleInfo-backed implementation preserves that shape.
- **Tier 1 kind guards: same swap point, duplicated logic.** `isParaKindMarker`/
  `isCharKindMarker` in `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` each
  call `getMarker(clean)?.type` directly (same import, same function) to decide whether a rename
  keeps the edit in Tier 1 or routes to Tier 2. These are two independent, structurally identical
  functions (a known, previously-flagged duplication — see Task 8's follow-up note suggesting a
  shared `isKindMarker(marker, kind)` helper if a third kind check is ever needed) — a StyleInfo
  swap at `getMarker` automatically updates both without further changes, but if Phase 4 also wants
  a genuinely dynamic (per-project, hot-reloadable) StyleInfo rather than a build-time swap, these
  two call sites plus the tokenizer's one are the exhaustive list to make dynamic (there is no
  caching of `getMarker` results anywhere in the marker-edit engine).
- **Validation states (`status_unknown`/`status_invalid`, spec §5.1) attach in
  `$markerNodeTransform`.** `$markerNodeTransform` (`markerEditTier1.utils.ts`) already runs on
  every `MarkerNode` edit and, by the time it decides "this is a completed rename" (the
  `TERMINATED_OPENER_REGEX` match branch, right before calling `$applyOpenerRename`), it knows both
  the just-renamed marker string and — one `getMarker(...)` call away — its kind/validity. That is
  the natural attach point for a validation-state write (e.g. `$setState`-ing a
  `validationState`/similar node-state field on the `ParaNode`/`CharNode`/`MarkerNode`, mirroring
  how `textTypeState` already threads through this codebase) once StyleInfo can distinguish
  "unknown to the project" from "known but used in an invalid position" from "valid." Note this is
  a Tier 1 concern only — Tier 2 rebuilds resolve unknown/invalid markers into `UnknownNode`/literal
  text via the tokenizer's existing degradation path rather than needing a separate validation
  flag; Phase 4's context-aware marker menu (mentioned in the plan's "Out of scope" list) is the
  other natural consumer of the same `getMarker`-backed kind data, for filtering menu entries by
  current cursor position/kind.

## What Phase 5 (extension wiring) needs

- **Enter-menu replaces the `INSERT_PARAGRAPH_COMMAND` HIGH handler.** Today, `MarkerEditPlugin`
  registers `INSERT_PARAGRAPH_COMMAND` at `COMMAND_PRIORITY_HIGH` purely to set
  `context.splitExpected.current = true` and return `false` (letting RichText's own default
  handler perform the actual split); `$paraMarkerDeletionTransform`'s `splitExpected` branch
  (`markerEditDeletion.utils.ts`) then injects a fresh visible marker prefix into the newly-cloned
  paragraph. The Phase 5 Enter-menu (paragraph-style picker) replaces this default-marker-cloning
  behavior — it should intercept at the same `COMMAND_PRIORITY_HIGH` slot (returning `true` to
  fully own the split+prefix-injection once the menu resolves a choice, instead of falling through
  to RichText's default), or explicitly call the existing `splitExpected`/prefix-injection path as
  its own "no menu selection / same style" fallback rather than reimplementing paragraph-split
  mechanics from scratch.
- **Clipboard wire-or-accept is unresolved and, as shipped, effectively dead code in-app.** This
  is a *correction* to the plan's own framing (the plan's Task 12 brief undersold the gap as "the
  imperative `EditorRef.copy()` path bypasses §5.6 clipboard normalization" — execution found the
  gap is much wider): `$handleCopyForStandardView` (`whitespaceDisplay.plugin.utils.ts`) only
  normalizes NBSP→space when it receives a real `ClipboardEvent` with non-null `clipboardData`.
  Verified during Task 12/15 that **none** of the app's in-app copy/cut paths supply that: the
  platform `ClipboardPlugin`'s Ctrl+C/Ctrl+X keydown handler dispatches `COPY_COMMAND`/
  `CUT_COMMAND` with a `null` payload; `ContextMenuPlugin`'s Copy/Cut menu items do the same *and*
  the native browser context menu is suppressed, so right-click "Copy" is also unavailable; and the
  imperative `EditorRef.copy()`/`.cut()` (`Editor.tsx`) also dispatch `null`. The only path that
  currently reaches `$handleCopyForStandardView`'s real logic is an out-of-band native
  `ClipboardEvent` (e.g. the browser's own Edit menu, or a keyboard shortcut the OS/browser handles
  before any of the app's own handlers see it) — browser-verified in Task 15 (Ctrl+C landed content
  on the clipboard via the *stock* Lexical path, not the normalization path). Two candidate
  wirings for Phase 5 to choose between:
  1. **Null-payload path with pre-normalized data.** Have `ClipboardPlugin`/`ContextMenuPlugin`/
     `EditorRef.copy()` build the `text/plain`/`text/html`/`application/x-lexical-editor` payload
     themselves (via the same `@lexical/clipboard` `$getHtmlContent`/`$getLexicalContent` helpers
     `$handleCopyForStandardView` already uses) with NBSP already inverted to space, and write it
     to `navigator.clipboard` directly instead of dispatching a null-payload command — bypasses the
     event-based path entirely.
  2. **Route real events through `ClipboardPlugin`.** Change `ClipboardPlugin`'s Ctrl+C/Ctrl+X
     handler to construct (or defer to) a real `ClipboardEvent`-shaped dispatch instead of `null`,
     so the existing `COPY_COMMAND`/`CUT_COMMAND` registration in `MarkerEditPlugin` (already
     wired, already tested at the unit level) starts firing for real for the primary keyboard
     path. Lower blast radius on `MarkerEditPlugin` itself; higher blast radius on
     `ClipboardPlugin`'s existing (non-standard-view) behavior, which needs to stay correct for
     every other view mode.
  Either way, `ContextMenuPlugin`'s native-menu suppression is a separate decision (whether to
  re-enable the native "Copy" entry in standard view at all) that should be made alongside this.
- **`CommandMenuPlugin`/scribe consideration.** The Task 15 fix gates
  `<CommandMenuPlugin logger={logger} />` off in `packages/platform/src/editor/Editor.tsx` only
  when `viewOptions?.markerMode !== "editable"` — this was the minimal, platform-scoped fix.
  `packages/scribe/src/editor/Editor.tsx:207` still mounts `<CommandMenuPlugin />` unconditionally
  (confirmed by inspection this phase; scribe currently has no `markerMode === "editable"` view, so
  this is latent, not live). If Phase 5 (or any earlier phase) gives scribe an editable-marker view
  mode, it will hit the identical Task 15 bug (typed `\` and pasted USFM silently swallowed) unless
  the same gating pattern is ported to scribe's `Editor.tsx` at that time.
- **`UsjNodesMenuPlugin` (`\`-menu, spec §5.4) is not mounted in the demo composition today.**
  `packages/platform/src/editor/Editor.tsx` gates it as `{scrRef && !hasExternalUI && (<UsjNodesMenuPlugin .../>)}`
  (line ~426); the platform demo runs with `hasExternalUI: true`, so the menu never mounts there,
  and Task 15's browser QA confirmed typed `\` lands as literal text with no menu appearing (an
  acceptable Phase-2 outcome per the dispatch, since the menu itself is Phase 4/5 scope — but Phase
  5's extension wiring needs to either flip `hasExternalUI` for the real host environment or
  otherwise adjust this gate for the menu to ever appear in a shipped composition where it's
  wanted). Whatever consumes the menu also needs the `getMarker`-backed kind data (see Phase 4
  section above) to make it "context-aware" per the plan's own framing.

## Known limitations / deliberate degradations (with spec cover)

- **Annotation `TypedMarkNode`s are flattened by Tier 2 rebuilds.** `$appendChildrenFragment`
  (`tier2Rebuild.utils.ts`) treats `TypedMarkNode` (and any other transparent `ElementNode`
  wrapper) as pure pass-through — it recurses into children and contributes no marker/sentinel of
  its own (comment: "annotation marks are host-reapplied overlays; their text content is rebuilt as
  plain content"). A Tier 2 rebuild of a paragraph containing an annotation mark therefore drops
  the mark; the design's assumption is that annotation overlays are host-reapplied after the fact
  (out of this engine's scope), not that they survive the rebuild themselves.
- **Milestone runs revert attribute-text edits.** A milestone's whole display run (decorator +
  opening `MarkerNode` + optional attribute `TextNode` + self-closing `MarkerNode`) rides through a
  Tier 2 rebuild as one sentinel-preserved node group (`$milestoneDisplayRun`) — so if a rebuild is
  triggered elsewhere in the same paragraph, any in-progress edit to the milestone's own attribute
  text is preserved as-is (moved, not regenerated), which is correct; but a milestone can never
  itself be the *subject* of Tier 2 re-tokenization (attribute edits inside it never trigger a
  rebuild — `$displayWhitespaceTransform`/`$textNodeTier2Transform` both skip attribute-typed text
  nodes), so a milestone's attribute text is edited live but never re-validated/re-tokenized against
  the tokenizer. This is intentional per plan decision #3 (milestones are sentinel-only, "the
  engine treats [them] as one opaque token").
- **Verses with alt/pub numbers (or `sid`/unknownAttributes) are atomic in Tier 2.**
  `verseNeedsSentinel` (`tier2Rebuild.utils.ts`) sentinel-protects any `VerseNode` carrying
  `sid`/`altnumber`/`pubnumber`/`unknownAttributes` — such a verse survives a paragraph-level
  rebuild by node identity, unedited, rather than being re-derived from its visible text (which
  cannot losslessly represent that state). A plain verse (no such state) is text-recoverable and
  does participate normally.
- **Chapter junk-text edits fall back to the stored number, silently, forever.**
  `$chapterNodeTransform` (`markerEditTier1.utils.ts`) only updates `node.getNumber()`/text when
  its regex matches a well-formed `\c<sep>N<sep>` prefix; on a non-match it does nothing (`return`)
  — no Tier 2 routing, unlike `$verseNodeTransform`'s broken-prefix branch, which *does* route to
  Tier 2. This asymmetry is intentional per the Task 9 brief's own comment ("leave literal") but
  means a badly-mistyped chapter marker (e.g. `c 1 ` with the backslash deleted) sits as
  desynchronized literal text indefinitely; serialization falls back to the last-known-good stored
  number. No test exercises this path for chapters (only for verses).
- **Cross-node space runs are not collapsed.** `normalizeSpaceRuns`/the §4 display-whitespace
  transform both operate within a single TextNode's content; a space run split across adjacent
  TextNode boundaries (e.g. a styled span ending in a space immediately followed by a plain-text
  space) is not detected or collapsed as one run. Not exercised by any Phase 2 test; a corpus/
  browser-QA gap rather than a proven bug.
- **Literal `~` in USJ text becomes NBSP, one-way, at both the tokenizer and the reverse
  adaptor.** `usfmFragmentToUsj.ts` converts every `~` in fragment text to NBSP unconditionally
  (`text.replaceAll("~", NBSP)`, since USFM cannot itself express a literal tilde — `~` *is* USFM's
  NBSP escape). This is PT9-consistent (plan decision #7) but means a document that genuinely
  contains a literal tilde character has no way to round-trip it through a Tier 2 rebuild as
  anything other than NBSP.
- **Imperative-copy gap.** See "Clipboard wire-or-accept" above — restated here because it is a
  shipped, user-visible behavior gap, not just a Phase 5 planning item: in the current platform
  composition, no in-app copy/cut action (keyboard, context menu, or `EditorRef`) exercises
  `$handleCopyForStandardView`'s NBSP-normalization; copied text carries display-NBSP (which most
  paste targets render as an invisible space-like character, so this is low-severity cosmetic
  pollution, not data loss) rather than plain spaces.
- **Typed unknown markers (and `\esb`) stay literal text, not a PT9-analogous `Unknown` token
  span.** Both the tokenizer (`getMarker(name)` returns `undefined` → degrade to literal per §5.2)
  and Tier 2's fragment builder (`$buildParaFragment` refuses to rebuild a paragraph whose own
  marker isn't a known `MarkerType.Paragraph`; `$appendChildrenFragment` sentinels any `CharNode`
  with an unrecognized marker) converge on the same outcome: an unrecognized marker typed live
  stays as plain, uninterpreted text in the Lexical tree rather than becoming a structured
  `UnknownNode`/`unknownAttributes` span the way a *loaded* unknown construct does (per the
  Phase 0/1 corpus findings — table/figure/sidebar/periph/`esb` all round-trip losslessly through
  `UnknownNode` when they arrive via USJ load, since that path goes through the ordinary USX/USJ
  adaptors, not this fragment tokenizer). Byte-identical serialization either way (the literal text
  *is* the correct USFM), and the construct becomes a proper structured node on the next full
  parse/reload — so this is a live-editing-fidelity gap, not a data-loss or round-trip gap.
- **PT9's `vp*`/`va*` leading-space trim is not replicated.** Not investigated or implemented this
  phase; `\vp`/`\va` (alternate/publishable verse number markers) are out of the marker-edit
  engine's live-typing scope entirely in Phase 2 (they arrive via load and are carried as
  `VerseNode` state, sentinel-protected in Tier 2 per `verseNeedsSentinel` above) — live editing of
  `\vp`/`\va` text itself is recorded as a design spec §3.3 follow-up, not attempted here.
- **`rebuildAttempted` cross-paragraph text collision (Task 11).** The per-commit dedup that
  breaks the degradation-fixed-point infinite-loop (see the findings-doc completion summary above)
  keys by literal *text content*, not by node/paragraph identity. If two different paragraphs in
  the same commit happen to contain byte-identical unresolved literal text (e.g. two independent
  unmatched `\wj*` closers), only the first paragraph's rebuild attempt fires that commit — the
  second is skipped, not silently lost. Recovery requires a **direct content re-edit** of the
  skipped paragraph (typing/deleting a character there) in a later commit; Enter or blur do **not**
  retrigger a terminated-skipped node, because `$resolvePendingMarkers`'s completion path only acts
  on nodes present in `pendingKeys`, and a node whose rebuild was skipped via `rebuildAttempted`
  was never added there (it took the "terminated, request Tier 2" branch, not the "pending"
  branch). This is a narrow, deliberate trade-off (documented in Task 11's report) versus the
  alternative, which was Lexical's own infinite-transform-iteration crash.
