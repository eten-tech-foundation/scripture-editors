# Standard View for the Platform.Bible Scripture Editor

- **Date:** 2026-07-01
- **Status:** Draft for review
- **Reference PRD:** "Power-Donna edits translation text in Standard view" (PO PRD, ~6-week appetite, 16-20 pts)
- **Repos:** `scripture-editors` (editor library — most of the work), `paranext-core` (stylesheet pipeline + extension wiring + `lib/platform-bible-react` `FootnoteEditor` threading)
- **Behavioral reference:** Paratext 9 at `~/Paratext` (read-only reference; see Appendix A)

## 1. Goal

Give Platform.Bible power users the PT9 "Standard" editing experience: scripture rendered with
stylesheet formatting, USFM markers visible inline as literal editable text, notes collapsed to
protected callers, and full editability — with edits round-tripping losslessly to USJ/USFM.

PT9's Standard view is defined by three properties holding simultaneously:
**formatted + markers visible inline + fully editable.** PT10's editor already renders this
combination (`markerMode: "editable"` + `isFormattedFont` + `hasSpacing`); what is missing is
the _editing contract_: marker-text edits currently change pixels but not the serialized
document, several USFM constructs are not verified lossless, styling is not driven by the
project stylesheet, and the view is not surfaced in Platform.Bible.

## 2. Scope decisions (settled with the user, 2026-07-01)

| #   | Decision                                                                               | Choice                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Marker editability                                                                     | **Literally editable text (PT9 parity)** — retyping `\s1`→`\s2` changes the document.                                 |
| 2   | Structures without node types (tables, `\fig`, `\esb`, `\periph`, `\optbreak`, `\ref`) | **Lossless opaque blocks** — verified byte-lossless round-trip, rendered read-only; real node types later.            |
| 3   | Styling source                                                                         | **Full project-stylesheet-driven CSS** (usfm.sty + custom.sty via new C# plumbing).                                   |
| 4   | Footnotes (PRD NN3)                                                                    | **Full**: collapsed callers, popover/pane editing, snippet insertion, auto-show/hide footnotes pane.                  |
| 5   | Surfacing                                                                              | **Power-mode default view** in Platform.Bible; simple mode unchanged.                                                 |
| 6   | Affordances                                                                            | **In:** invalid-marker red highlighting; Enter opens paragraph-marker menu. **Out:** style-dropdown hardening.        |
| 7   | Sync architecture                                                                      | **Approach C**: targeted marker-sync transforms + paragraph-scoped re-tokenization (no whole-document reformat loop). |
| 8   | AutoCorrect (`autocorrect.txt`)                                                        | **Follow-up** — separate small feature.                                                                               |

## 3. Architecture overview

All editor behavior lands in `scripture-editors` (feature branch off `main`, delivered via the
`platform-yalc` flow). `paranext-core` gets two work streams: the stylesheet pipeline
(C# → PAPI → CSS) and extension wiring (view type, power-mode default, menu, footnotes-pane
auto behavior). PT9 is not modified.

Serialization architecture is unchanged: USJ arrives via `platformScripture.USJ_Chapter`; the
forward adaptor (`packages/platform/src/editor/adaptors/usj-editor.adaptor.ts`) injects
editable `MarkerNode`s per view options; the reverse adaptor
(`editor-usj.adaptor.ts`) continues to rebuild USJ from structural node state
(`ParaNode.marker`, `CharNode.marker`, …), which remains the **single source of truth for
serialization**. The new marker-editing engine (§5) keeps structural state consistent with
visible marker text at edit time, so the reverse adaptor never trusts free-typed text directly.

### 3.1 The view mode

- New `STANDARD_VIEW_MODE = "standard"` in `libs/shared-react/src/views/view-mode.model.ts`
  (display name "Standard").
- `getViewOptions("standard")` → `{ markerMode: "editable", noteMode: "collapsed",
hasSpacing: true, isFormattedFont: true }`. No new `ViewOptions` fields.
- This combination is distinct from all existing modes, so `getViewMode` stays invertible.
- The stale `EXPERIMENTAL` TSDoc on `EditorOptions.view`
  (`packages/platform/src/editor/editor.model.ts`) is corrected as part of this work.

### 3.2 Adaptor decoupling: note callers vs. marker mode

Today the adaptor picks note-caller representation off `markerMode` (editable mode gets plain
caller text). Standard view needs PT9's model: everything is editable text _except_ notes,
which collapse to protected atomic callers. Change: caller-node selection keys off `noteMode`
(collapsed → `ImmutableNoteCallerNode`, contentEditable=false), independent of `markerMode`.
This is the only structural change to document loading.

### 3.3 Alternate and publishing numbers (`\ca`/`\cp`/`\va`/`\vp`)

In PT9 Standard view these render as visible editable marker runs (`\va 4\va*` after the
verse number). In USJ they are _attributes_ on chapter/verse, so the marker engine cannot
treat them as ordinary marker text without explicit handling. This pass: the adaptor renders
them as **visible atomic (immutable) marker runs** with attribute-lossless round-trip;
literal text-editing of them is a follow-up. Corpus fixtures must include them so they are
neither invisible nor lost.

## 4. Whitespace and text-fidelity rules (PT9 parity)

Active in Standard view (PT9 `AllowInvisibleChars=false` semantics):

- Leading spaces and spaces in a run of multiple spaces **display** as NBSP so they are
  visible while typing — but **runs collapse to a single space at normalization**, matching
  PT9's `UsfmToken.NormalizeUsfm` ("removes double-spaces", applied on every reformat). In our
  architecture normalization runs at serialization and inside Tier 2 rebuilds; the Phase 0
  byte-equality tests assume normalized output. A text node that is exactly one space is left
  untouched (PT9 nuance).
- A stored NBSP (U+00A0) in the data **displays as `~`**; a typed `~` **saves as NBSP**.
- Copy transforms display-NBSP back to plain spaces in clipboard text (§5.6).
- **Unicode normalization:** PT9 normalizes every save to the project's `NormalizationForm`
  (NFC/NFD) via `ScrText.Normalize`. Verify in Phase 0 where PT10's save path applies this
  (likely the C# `SetChapterUsfm` side); if nowhere, add it host-side. Without it,
  IME/decomposed input round-trips differently than PT9 and byte-parity tests will churn.
- **RTL projects:** PT9's normalization also inserts direction marks around punctuation in
  verse text (`AddDirectionMarksAsNeeded`). Include an RTL book in the Phase 0 corpus to
  surface where this lands (C#-side normalize vs. explicit scope-out with the PO).

These rules live with the Standard-view rendering/input path (adaptor text handling plus a
small input transform), with unit tests. They must not leak into other view modes.

## 5. The marker-editing engine

New plugin (working name `MarkerEditPlugin`) in `libs/shared-react/src/plugins/usj/`, active
only when `markerMode === "editable"`. It supersedes `ParaMarkerPrefixGuardPlugin`, whose
enablement condition (`markerMode === "editable"`, among others) already covers Standard view
and whose behavior (reset a marker-deleted paragraph to `\p`) contradicts §5.5 — the guard
must be explicitly disabled or branched when the engine is active, or the two transforms will
fight (the guard remains for paragraph-structure and visible modes). Invariant: **structural
node state and visible marker text never disagree at rest.**

### 5.1 Tier 1 — in-place rename (node transform on `MarkerNode`)

Fires when a marker node's text changes. If the new text still parses as a single _terminated_
marker of the same positional kind (`\word␣` opening, `\word*` closing):

- **Para marker** `\s1 ` → `\s2 `: `paraNode.setMarker("s2")`; the `usfm_*` class updates and
  the paragraph restyles instantly. Any syntactically complete marker is accepted, valid or
  not — it stays in the document as typed (PT9 behavior). Error feedback matches PT9's **two
  distinct states**: a marker **not in the stylesheet** gets `status_unknown` (bold red); a
  **known marker used in the wrong context** gets `status_invalid` (red underlined), driven by
  `StyleInfo.occursUnder` (+ rank sequencing for paragraph markers, per PT9's
  `ValidateUsxStyles`/`TagValidator`); an unmatched closer gets `.invalid`. This context
  validation is the primary way translators see structural mistakes (e.g. `\ft` typed in body
  text). Marker-set/kind data comes from `StyleInfo` (§8); fallback to bundled defaults +
  `HANDBOOK_VALID_MARKERS`.
- **Char opening marker** `\nd` → `\wj`: `charNode.setMarker("wj")` and the closing
  `MarkerNode` is rewritten to `\wj*` in the same update.
- **Verse/chapter markers**: the existing `parseNumberFromMarkerText` path
  (`libs/shared/src/nodes/usj/node.utils.ts`) round-trips *integer* numbers only — it uses
  `parseInt`, so a verse bridge `\v 1-2` or segment `\v 5a` currently serializes as `"1"`/`"5"`
  in editable mode **even without an edit to that verse**. This is a latent data-corruption
  bug that Standard view would make default-on. Extend the parse to the full PT9 verse-number
  grammar (digits + optional segment/bridge) and assert bridges/segments in the Phase 0 corpus.
- **Mid-edit (unterminated) text** is left alone; completion (space/enter/blur) is the sync
  trigger. No debounce clock (more deterministic than PT9's 1s timer).

**Trigger surfaces** (all inside Lexical's update cycle — never from update/mutation
listeners, per the repo rule against `editor.update` in listeners):

- `MarkerNode` node transform — catches in-marker text changes (space-terminated edits).
- `ParaNode` node transform — catches whole-marker deletion (a destroyed node fires no
  transform of its own; `ParaMarkerPrefixGuardPlugin` is the in-repo precedent for this
  detection pattern).
- Command listeners for `KEY_ENTER_COMMAND` and `BLUR_COMMAND` (completion triggers that
  produce no marker-text change), and `PASTE_COMMAND`/`DROP_COMMAND`/
  `CONTROLLED_TEXT_INSERTION_COMMAND` at `COMMAND_PRIORITY_HIGH` for Tier 2 — the same trio
  `StructureProtectionPlugin` already registers.

**Tier 1 invariants:**

- One-way authority: opener edits rewrite closers; closer edits route to Tier 2. (Prevents
  transform ping-pong; Lexical's infinite-transform guard is dev-build-only.)
- All `setMarker` calls early-return on equality before `getWritable()` (already true) —
  convergence in one pass.
- Rewriting a closer shorter while the caret sits inside it requires explicit selection
  clamping.
- Tier 1 carries the same `editor.isComposing()` guard as Tier 2.

`CharNode.updateDOM()` returns `false` unconditionally and `ParaNode` inherits Lexical's
default, so after `setMarker` the DOM keeps the stale `usfm_*` class/`data-marker`. Extending
`updateDOM` (or replacing the node) is **required** work, not conditional.

### 5.2 Tier 2 — paragraph-scoped re-tokenization

Everything Tier 1 cannot express routes here: marker text deleted (para merge / char unwrap),
a closing marker edited so it no longer mirrors its opener, backslash sequences appearing in
plain text (paste, drop, or a dismissed `\`-menu leaving literal text), multi-marker paste.

Mechanism — running *inside the triggering update* (transform or command listener), which
makes the rebuild and the user's edit inherently one history entry with the stock
`HistoryPlugin` (`HISTORY_MERGE_TAG` as fallback for any genuinely separate update):

1. Build the affected paragraph(s)' _display text_ as a USFM fragment: marker nodes contribute
   their literal text; plain text contributes itself; atomic nodes (note callers, opaque
   unknowns) contribute their stored USFM from structure.
2. Run the **fragment tokenizer** (§5.3) to produce a USJ fragment.
3. Run the existing USJ→Lexical adaptor to build replacement nodes; replace the paragraph(s).
4. Restore selection by mapping the pre-rebuild text offset into the new tree.

PT9 semantics fall out: pasting `\p new para` mid-paragraph splits the paragraph; pasting
`\v 5` creates a verse (PT9 Standard allows verse insertion); typing `\f + \ft text \f*`
literally produces a collapsed note; deleting a `\nd*` closer extends the char span per
tokenizer rules. Blast radius stays paragraph-local — no document reload, no
`LoadStatePlugin` involvement.

**Guard rails:**

- Paragraphs containing content not yet verified serialization-lossless (opaque blocks, §7)
  are excluded from Tier 2; edits near them stay literal text rather than risk a lossy rebuild.
- Never fires mid-IME-composition.
- Degradation property: if Tier 2 misses a case, typed backslash text serializes as literal
  text content, which the next USFM parse reinterprets as markers — degraded but
  PT9-consistent eventual behavior, not corruption.

### 5.3 The USFM fragment tokenizer

No TS USFM→USJ converter exists in the monorepo (`packages/utilities` covers USJ↔USX only;
`usfm2perf`/proskomma targets the PERF node stack —
`libs/shared/src/utils/usfm/usfmToLexicalPerf.ts` is the in-repo precedent for the
wrap-parse-extract pattern but produces PERF, not USJ). Decision: implement a **small,
StyleInfo-driven fragment tokenizer** (in `packages/utilities` or `packages/platform`),
purpose-built for Tier 2:

- Input: a USFM fragment (no `\id` required); output: USJ content array.
- Recognizes: paragraph markers, character markers incl. `\+nested` and `\marker*` closers,
  note markers with callers, `\v`/`\c` with numbers, attribute suffixes (`|…`), unknown
  markers (kept as typed).
- Marker kind (para/char/note) and end-marker knowledge come from `StyleInfo` (§8), falling
  back to the bundled default stylesheet data.
- Reference semantics: ParatextData's `UsfmToken` tokenizer; scope is fragment-level
  tokenization only — document-level validation stays out.

Rejected alternatives: `usfm-grammar` (tree-sitter/WASM bundle weight for a fragment-level
need); routing through `usfm2perf` + a new PERF→USJ mapping (couples the platform editor to
the PERF stack).

#### 5.3.1 USFM/USJ version handling

- **Document-level version handling is inherited, not reimplemented.** All whole-document
  USFM↔USX↔USJ conversion happens in C# ParatextData (the same engine PT9 uses); the editor
  only ever sees normalized USJ. Legacy constructs are tolerated/normalized exactly as in PT9.
- **The fragment tokenizer targets USFM 3-family syntax** (`|` attributes, `\+` nesting) —
  USJ is a USFM 3 representation and incoming chapter data is already normalized. Marker
  vocabulary/kinds come from the project's merged stylesheet via `StyleInfo`, so version
  differences manifest as data, not code paths. Fragments it cannot confidently parse (e.g.
  pasted USFM 2 idioms) follow the §5.2 degradation property: literal text → serialized as
  typed → interpreted by the next full ParatextData parse with complete version handling.
- **USFM 2 positional `\fig` syntax** never reaches the tokenizer: figures are opaque blocks
  (§7), excluded from Tier 2, serialized from stored structure — lossless in either syntax.
- **USJ version:** the extension pins USJ 3.0 (`correctEditorUsjVersion` downgrades 3.1);
  Standard view inherits this. A future USJ 3.1 migration is host-level, orthogonal to this
  design.
- The Phase 0 corpus includes at least one older-conventions book to prove
  stylesheet-driven handling of legacy/nonstandard markers.

### 5.4 Marker creation affordances

- **`\` opens the marker menu** (existing `markerMenuTrigger` — PT9's popup intercepts
  backslash too). The existing menu (`UsjNodesMenuPlugin` → `useUsfmMarkersForMenu`) already
  filters to children of the current `contextMarker` from a static marker map; extend it to
  PT9 `MarkerItemSource` semantics: `occursUnder`-driven paragraph-style list at paragraph
  starts, character styles valid under the current paragraph mid-text, **close-tag entries
  for currently open character styles**, note styles included. Data source: `StyleInfo`
  (replacing the static map when available).
- **Enter opens the paragraph-marker menu**; choosing a style splits the paragraph with that
  marker (equivalent end state to PT9's break+dropdown+reformat). Escape cancels the Enter.
- Menu insertion goes through the existing structural `insertMarker` — no re-tokenization.
- Escaping the menu after typing literal text leaves it as text; Tier 2 picks it up on
  termination.

### 5.5 Deletion semantics (matching PT9 reformat outcomes)

- Deleting a para's marker text merges its content into the previous paragraph.
- Deleting/emptying a char marker's opener unwraps the span; closer deletion goes through
  Tier 2 (tokenizer decides the span extent).
- Deleting a verse/chapter marker deletes it (allowed; renumber checks are outside the editor
  in PT9 too).
- **Ctrl+Space** strips character formatting from the selection (unwraps char markers). With
  a caret-only selection, it breaks out of the current character style so subsequent typing is
  unformatted (PT9 inserts and clears a space to achieve this; we can split the char span at
  the caret).

### 5.6 Copy/cut/paste

- Copy/cut produce plain text + HTML as Lexical does today; in Standard view the plain text
  naturally includes marker text (markers are text nodes) — matching PT9. Display-NBSP is
  normalized back to plain space in clipboard text.
- Paste of text containing USFM markers is handled by Tier 2. Paste/cut with an endpoint
  inside an atomic node (caller, opaque block) is refused, as in PT9.

## 6. Footnotes and cross-references (PRD NN3)

- **In-text:** collapsed atomic callers (`ImmutableNoteCallerNode`). Caller generation is
  **data-driven, not a fixed CSS a–z counter**: `+` callers draw from the project's caller
  sequences — footnotes and cross-references have *separate* sequences, cross-references
  default to `†` — wrapping modulo the sequence length; `-` displays as `*`; custom callers
  display as typed. (A pure a–z counter is visibly wrong for any project with
  cross-references.) Note content lives in structure only; the engine treats the note as one
  opaque token (its Tier 2 USFM contribution comes from structure). **Unclosed notes**
  (loaded with `closed="false"`, or mid-typing before the closer) render expanded inline,
  PT9's `opennote` style, until closed — only closed notes collapse to callers.
- **Editing:** note editing happens in the existing `FootnoteEditor` popover — which lives in
  **`paranext-core/lib/platform-bible-react`** (a third code surface this feature touches; it
  hosts its own editor instance, wired via `showFootnoteEditor` in the web view). The
  Standard-view options and marker-editing engine must be threaded into that component so
  note-content markers (`\fr`, `\ft`, `\fq`…) follow the same editable-marker rules (Tier 1
  renames; the note is its own re-tokenization scope). Caller click behavior: when the
  footnotes pane is visible, click focuses/highlights the corresponding note there (PT9's
  navigate-to-note behavior) and editing proceeds via the popover; when hidden, click opens
  the popover directly. Caller hover shows the note content as a tooltip (~500 ms).
- **Insertion:** `\f`/`\x` via `\`-menu, context menu, and keyboard shortcuts **Ctrl+T /
  Ctrl+Shift+T** (PRD's three entry points) using PT9 snippet semantics:
  `\f + \fr <chap><sep><verse> [\fq <selected>] \ft ` + `\f*` (cross-refs:
  `\x - \xo … [\xq <selected>] \xt `). Details that matter: the **caret lands after `\ft `**
  (inside the popover) so the user types the note text immediately; the quotation text is
  stripped of markers and nested notes, with embedded verse numbers converted to
  `\+fv N\+fv*`; the default callers come from the project's
  `DefaultFootnoteCaller`/`DefaultCrossRefCaller` settings where exposed (fallback `+`/`-`);
  the chapter-verse separator comes from project settings where exposed (sensible defaults
  otherwise). PT9's origin-range option and section-head reference rules default off/simple
  this pass (recorded in follow-ups). Dedicated insert dialogs slip to follow-up per the PO.
  `\fe` only if trivial; `\ef`/`\ex` out. **Enter inside note content inserts `\fp`**
  directly, no menu (PT9's notes surface uses SmartEnter).
- **Footnotes pane (extension):** the pane, toggle, and location controller already exist in
  `platform-scripture-editor` — but the pane is **display-only today** (`FootnoteList` with
  navigation/highlight). This pass keeps it navigational: auto-show for
  `viewType === 'standard'` when the loaded chapter contains ≥1 note, auto-hide when none —
  with a per-web-view user-override flag so a manual toggle wins until reset — plus
  caller-click focus. Making the pane itself editable (PT9's notes-pane editing model) is a
  scoped follow-up; editing in this pass is popover + in-text.
- **Deliberate divergences from PT9 — flag to the PO:** PT9 never auto-shows/hides the pane
  by chapter content (visibility persists per window), and caller click when the pane is
  hidden *opens the pane* — PT9 has no inline popover. PT9 veterans will notice both the
  pane appearing/vanishing across chapter navigation (mitigated by the user-override flag)
  and the popover-instead-of-pane on caller click. The auto-show/hide behavior follows the
  PRD's explicit NN3 ask; if the PO prefers PT9 semantics, caller-click-opens-pane +
  persistent visibility is a small change. (PT9's caller tooltip shows raw note USFM; ours
  shows formatted content — accepted difference.)

## 7. Lossless opaque blocks

For tables, figures, sidebars (`\esb`), `\periph`, `\optbreak`, `\ref` — no new node types
this pass. `\optbreak` is a special case: PT9 renders it as inline literal `//` text
mid-sentence, so it must be an **inline** atomic token, not a block (a line-level box in the
middle of a sentence would be visibly wrong). The rest render as blocks:

- **Verify first:** a round-trip corpus (real PT9 books containing each construct) asserting
  USJ → Standard-view editor state → USJ deep-equality (and normalized-USFM byte equality).
  Every `UnknownNode`/`ImmutableUnmatchedNode` gap found gets fixed. This is Phase 0.
- **Render** as visible but inert blocks: content shown read-only in a subdued "unsupported
  structure" container displaying its lead marker; contentEditable=false; whole-block
  selection/deletion only.
- **Engine interaction:** excluded from Tier 2 (§5.2); caret navigation skips over them like
  any decorator node.

**Acceptance criterion:** _loading and saving a book containing a table, figure, or sidebar is
lossless, in Standard view, with edits made elsewhere in the chapter._

## 8. Stylesheet-driven CSS pipeline

Four stages; PT9's `CSSCreator` (`ParatextInternalShared/ScriptureEditor/CSSCreator.cs`) is
the reference mapping.

1. **C# (paranext-core):** extend `ParatextProjectDataProvider` with `getStyleInfo(bookNum)`
   on a new project interface (`platformScripture.StyleInfo`), serializing merged
   `ScrStylesheet` tag properties (usfm.sty + custom.sty). Resolves the existing "custom
   stylesheets" `@todo` in `platform-scripture.d.ts`; `getMarkerNames` remains for back-compat.
2. **Types:** `StyleInfo` types in `platform-scripture.d.ts` alongside the marker-names
   provider.
3. **CSS generation (scripture-editors):** `generateUsjCss(styleInfo, options)` exported from
   the platform-editor package — it owns the `usfm_*`/mode-class conventions, so the TS port
   of `CSSCreator.CreateUsfmCss` (incl. RTL margin flipping and zoom scaling) lives beside
   them; demos can use it too. The host-agnostic `StyleInfo` TS shape is defined here; the C#
   JSON conforms to it.
4. **Injection (extension):** the web view subscribes to `StyleInfo`, generates CSS, injects
   via the existing `useStylesheet` hook (annotation-style provider is the precedent), layered
   _after_ static `usj-nodes.css` so project styles win where defined; the static file remains
   the base for mode/structure rules (marker greying, callers, gutter).

`StyleInfo` shape (sketch — final shape set during implementation):

```ts
interface MarkerStyleInfo {
  marker: string;
  styleType: "paragraph" | "character" | "note" | "milestone";
  occursUnder?: string[]; // powers context-aware marker menu (§5.4)
  endMarker?: string;
  textProperties?: string[]; // e.g. "verse", "chapter", "publishable"
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  underline?: boolean;
  color?: string;
  superscript?: boolean;
  subscript?: boolean;
  justification?: "left" | "center" | "right" | "both";
  firstLineIndent?: number;
  leftMargin?: number;
  rightMargin?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
}
interface StyleInfo {
  markers: Record<string, MarkerStyleInfo>;
}
```

`StyleInfo` also feeds **marker validation** (§5.1) and **menu context sensitivity** (§5.4) —
one source for styling, validity, and assistance. A bundled default-`usfm.sty`-derived
`StyleInfo` ships with the editor package so demos/tests/hosts without the PDP degrade
gracefully.

## 9. paranext-core extension wiring

- `ScriptureEditorViewType` gains `'standard'`; `getViewOptionsForType` maps it via the
  library's `getViewOptions("standard")`.
- **Power-mode default:** web views created with `interfaceMode === 'power'` default to
  `viewType: 'standard'` (existing saved state respected); simple mode unchanged. The view
  menu / `changeScriptureView` cycle covers standard / formatted / markers.
- `isStructureProtected` stays false in Standard view. Note the web view has **two** read-only
  gates that must both account for `'standard'`: `isReadOnlyEffective`
  (`isReadOnly || viewType === 'markers'`) feeds `EditorOptions.isReadonly`, while
  `onUsjChange` is gated by raw `isReadOnly`. Read-only/locking semantics remain host concerns.
- Footnotes-pane auto behavior per §6.
- **Context menu:** the editor's `contextMenu` option in Standard view must include at
  minimum Insert footnote (Ctrl+T), Insert cross-reference (Ctrl+Shift+T), and Insert verse
  number (Ctrl+K, where the host command exists). PT9's remaining context entries (Wordlist,
  Spelling, Biblical Terms, verse history, etc.) are host features outside this scope.
- Static CSS polish for the PT9 look ships in `usj-nodes.css` (the mode classes already
  exist). Specifics from PT9's `ScriptureBase.css`/XSLT worth matching: `.marker` = theme
  color, `0.7em`, `unicode-bidi: isolate`; verse spans `white-space: nowrap` +
  `unicode-bidi: embed`; **consecutive verse markers each start on their own line**;
  attribute text dim until hover; table-row markers keep `text-indent: 0`.

## 10. Testing

- **Phase 0 corpus harness:** real PT9 books (local Paratext project data), including
  table/figure/sidebar/periph/optbreak/ref content, **verse bridges/segments, `\ca`/`\cp`/
  `\va`/`\vp`, unclosed notes, and at least one RTL book**; USJ round-trip deep-equality +
  normalized-USFM byte equality in Standard view. Un-skip and fix the editable-mode delta
  round-trip test (`editor-delta.adaptor.test.tsx:761`). Verify where Unicode NFC/NFD
  normalization happens in the PT10 save path (§4).
- **Engine unit tests:** Tier 1 (para/char rename, closer mirroring, invalid, incomplete,
  deletions → merge/unwrap, verse/chapter numbers **incl. bridges `1-2` and segments `5a`**);
  Tier 2 (paste single/multi-para USFM, literal typed markers, unclosed char markers, notes in
  fragments, selection restoration, single-undo coalescing); fragment tokenizer (marker kinds,
  nesting, attributes, unknowns); whitespace rules; Ctrl+Space; adaptor caller decoupling;
  `ParaMarkerPrefixGuardPlugin` disabled/branched when the engine is active (the two must not
  fight over a deleted marker).
- **CSS generator snapshot tests** against fixtures captured from PT9 `CSSCreator` output for
  the default stylesheet; C# tests for `getStyleInfo`.
- **Manual QA:** demo app gains a "Standard" preset; Platform.Bible smoke via the yalc flow.

## 11. Risks

1. **Editable-tree stability** — the mutable Verse/Chapter node tree is unexercised
   end-to-end under real editing. Highest risk; hence Phase 0.
2. **`LoadStatePlugin` reload cluster** (PT-3890/PT-3797/PT-3909) — full-document reloads on
   external changes/view switches lose state today; Standard-as-power-default raises exposure.
   The engine never touches that path, but the adjacent bugs are a coordination item, not
   silently absorbed here.
3. **Tier 2 selection restoration** — offset mapping around decorators/IME is fiddly;
   conservative triggers + dedicated tests.
4. **Fragment tokenizer fidelity** — divergence from ParatextData tokenization would show up
   as paste/edit surprises; mitigated by corpus-derived fixtures and the §5.2 degradation
   property.
5. **Cross-repo type churn** — `StyleInfo` spans C# and TS; versioned via normal
   platform-yalc coordination.

## 12. Sequencing

- **Phase 0:** round-trip corpus harness + un-skip delta test + fix fallout (includes
  UnknownNode lossless fixes and the verse bridge/segment `parseInt` corruption, §5.1).
  De-risks everything; aligns with the PRD's re-pointed spike.
- **Phase 1:** `standard` view mode + caller decoupling + CSS polish + demo preset — renders
  end-to-end.
- **Phase 2:** marker engine (Tier 1 → fragment tokenizer → Tier 2), deletion semantics,
  whitespace rules, Ctrl+Space.
- **Phase 3:** footnote UX — snippets, caller click/tooltip, pane auto-show/hide (extension),
  engine threading into `FootnoteEditor` (platform-bible-react).
- **Phase 4:** stylesheet pipeline (C# → types → generator → injection), context-aware marker
  menu, invalid-marker highlighting.
- **Phase 5:** extension wiring — view type, power default, menu cycle, Enter menu,
  opaque-block rendering polish.
- 0→1→2 is the critical path; 3–5 have internal parallelism.

## 13. Follow-up register (explicitly out of this pass)

AutoCorrect (`autocorrect.txt`); style-dropdown hardening (`formatPara` promotion); real
table/figure/sidebar node types with in-place editing; **editable footnotes pane** (PT9's
notes-pane editing model — pane is navigational this pass); note insert dialogs and caller
renumbering dialog; `\fe` (unless trivial) / `\ef` / `\ex`; figure properties dialog and
`link:fig`/`link:ref` handling; ruby glossing; Study Bible; annotations-as-such (separate
systems feeding the existing annotation API); spell-check integration; protected-resource
copy caps; invisible-characters mode (`AllowInvisibleChars=true`); verse-navigation and
insert-verse-number host commands (verify existing paranext-core coverage separately —
PT9's Ctrl+K inserts the *next* verse and refuses at chapter boundaries or duplicates);
literal text-editing of `\ca`/`\cp`/`\va`/`\vp` runs (§3.3); PT9 origin-range and
section-head note-reference options (§6); Alt+X hex character toggle; current-verse
highlighting across windows (PT9's non-focused-window indicator — host-level, verify
existing coverage); double-click word-selection trailing-space trim (cosmetic);
`LoadStatePlugin` reload hardening (coordinate with existing bug work).

## Appendix A: PT9 Standard-view behavior dispositions

Legend: **[In]** in scope this pass · **[Adapted]** equivalent-by-design, different mechanism ·
**[Existing]** already present in PT10 · **[Host]** paranext-core/host concern ·
**[F/U]** follow-up register · **[N/A]** moot under Lexical architecture.
Item numbers reference the PT9 behavior inventory (from `~/Paratext` source, 2026-07-01).

**A. Handler chain (1-5):** 1-2 [N/A] Lexical command/transform architecture replaces the
chain. 3 IME reformat suspension [In] §5.2 guard rails. 4 read-only whitelist [Existing]
`isReadonly`. 5 write-lock [Host].

**B. Keys (6-16):** 6-7 Enter → break + para dropdown [Adapted] §5.4 menu→split. 8 backslash
context popup [In] §5.4. 9 Ctrl+Space [In] §5.5. 10 undo/redo/copy [Existing]. 11 Ctrl+P
[N/A]. 12 Ctrl+A protected-resource block [F/U]. 13 table-cell delete handling [Adapted]
opaque whole-block protection §7. 14 Ctrl+Up/Down verse nav [Host] verify existing coverage.
15 Tab in tables [F/U] (opaque tables). 16 native caret movement [Existing].

**C. Marker popup (17-28):** 17 filter-grid keys [In] verify/extend existing typeahead.
18 filtering rules (`zpa*` hidden, `+` → char-only) [In]. 19 context-valid lists + close-tag
entries [In] §5.4. 20 special styles + notes in list [In]. 21 insertion mechanics (wrap
selection, trailing space) [In] verify existing `insertMarker`. 22 note styles → note
insertion [In] §6. 23 `\fig` → dialog [F/U]. 24 `\f` snippet [In] §6. 25 `\x` snippet [In]
§6. 26 `\ef`/`\ex` snippets [Out — PO no-go]. 27 separators/origin-range/`\fq` stripping [In]
§6 with defaults where settings not exposed. 28 undo checkpoint around dropdown [Adapted]
Lexical history.

**D. AutoCorrect (29-30):** 29 [F/U] decided. 30 [N/A] `AllowInvisibleChars` off.

**E. Whitespace (31-37):** 31-33 NBSP display / `~` mapping / save normalization **incl.
space-run collapse at normalization** [In] §4. 34 invisible-chars token pass [F/U].
35 space-run timer nuance [N/A] no debounce loop. 36 invisible-char insert menu [F/U].
37 `﻿` anchors [N/A].

**F. Reformat cycle (38-44):** 38-40, 43 debounced whole-doc reformat [N/A] replaced by
Tier 1/Tier 2 (§5); caller renumbering [In] data-driven sequences §6 (not plain CSS
counters). 41-42 selection/scroll preservation [Adapted] §5.2 step 4 (paragraph-local, more
precise). 44 round-trip integrity assert [In] as Phase 0 tests (+ optional dev-mode assert).

**G. Copy/paste (45-52):** 45 text+HTML clipboard [Existing] markers included as text.
46 NBSP→space on copy [In] §5.6. 47 paste reparse [In] Tier 2. 48 refusal in non-editable
nodes [In] §5.6. 49 cut semantics [Existing]. 50 protected-resource copy cap [F/U].
51 native double-fire suppression [N/A]. 52 Before\* events [N/A].

**H. Verse/chapter (53-57):** 53 editable numbers re-normalized [Existing + In]
(`parseNumberFromMarkerText`, Tier 2). 54 deletion removes token, no auto-repair [In] §5.5.
55 no auto verse numbers [Adapted] intentionally matching (off in PT9 Standard). 56 Ctrl+K
insert verse [Host] verify. 57 caret → VerseRef updates [Existing] selection-change flow.

**I. Notes (58-65):** 58 caller click navigates to note [In] §6 (popover when pane hidden —
deliberate divergence flagged to PO). 59 auto-show pane
[Adapted] single footnotes pane (PT10 has one pane, not four typed panes); chapter-has-notes
auto-show + caller-click focus §6. 60 sidebar callers [F/U] (opaque sidebars). 61 caller
tooltip [In] §6. 62 callee-click renumber dialog [F/U]. 63 inline note editing + three
insertion entry points [In] §6. 64 convert/delete footnote context items [F/U]. 65 callers
protected [In] §6.

**J. Figures/tables (66-69):** 66-67 figure click/insert dialogs [F/U]. 68 `link:*` handling
[F/U]. 69 table cell editing [F/U] (opaque this pass; whole-block protection [In] §7).

**K. BCV navigation (70-73):** [Existing] host `scrRef` flow; chapter-boundary loading is the
host's per-chapter model. Verify during Phase 5 smoke.

**L. Undo (74-76):** [Adapted] Lexical history replaces USFM-snapshot undo; Tier 2 coalescing
[In] §5.2; menu-insertion checkpoints [Existing].

**M. DnD/middle-click/IME (77-79):** 77 drop → content edit [In] Tier 2 trigger.
78 middle-click native [N/A]. 79 IME suspension [In] guard rails.

**N. Refusals (80-85):** 80 callers non-editable [In]. 81 read-only gating [Existing].
82 locking [Host]. 83 protected resources [F/U]. 84 insert-command gating when read-only [In]
extension/menu state. 85 observer-role refusals [Host].

**Addendum — behaviors surfaced by the parity review (2026-07-01), beyond the original
inventory:** space-run collapse at normalization [In] §4; Unicode NFC/NFD project
normalization on save [In-verify] §4/Phase 0; RTL direction-mark insertion [Phase 0
verify/PO] §4; two-state unknown-vs-contextually-invalid marker feedback via
occursUnder/rank [In] §5.1; project caller sequences with † cross-ref default, wrap, `-`→`*`
[In] §6; unclosed notes render open/inline [In] §6; `\ca`/`\cp`/`\va`/`\vp` as visible
atomic runs [In] §3.3 (literal editing [F/U]); consecutive verses on separate lines [In] §9;
default callers from project settings [In] §6; caret-lands-in-`\ft`, `\xq`, quotation
stripping with `\+fv` [In] §6; Enter in notes → `\fp` [In] §6; Ctrl+T/Ctrl+Shift+T [In]
§6/§9; context-menu insert entries [In] §9 (other PT9 entries [Host]); Ctrl+Space caret-only
style break-out [In] §5.5; `\optbreak` inline atomic [In] §7; current-verse cross-window
highlighting [F/U, Host]; Alt+X hex toggle [F/U]; double-click trailing-space trim [F/U,
cosmetic]; caller tooltip shows formatted content vs PT9's raw USFM [Adapted, accepted].
