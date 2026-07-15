# Standard View Phase 4 — Project StyleInfo integration (design)

Date: 2026-07-03. Parent design: `2026-07-01-standard-view-design.md` (§5.1 validation, §5.4 menus,
§8 stylesheet pipeline, §12 sequencing). Function-level anchors inherited from
`2026-07-02-standard-view-phase2-notes.md` "What Phase 4 (StyleInfo) needs". PT9 reference paths in
this doc are into `/home/lyonsm/Paratext` (read-only C# source).

**Goal:** replace the static marker table with the project's own StyleInfo (its usfm.sty + custom.sty,
merged by ParatextData) so marker classification, Tier-1 kind routing, validation highlighting, and
per-marker CSS reflect the actual project. The parity target is **user experience and visual
similarity to PT9**, not code similarity.

## Scope

**In:** the full §8 pipeline (C# `getStyleInfo` → TS types → `generateUsjCss` → `useStylesheet`
injection), stylesheet-first classification in the fragment tokenizer, Tier-1 kind guards on the
project lookup, §5.1 validation states (`status_unknown`/`status_invalid`), PT9-aligned unknown-marker
tokenization, rich bundled default StyleInfo.

**Out (recorded in §Non-goals):** context-aware marker menu *and* its filtering API (Phase 5, per the
phase-cohesion principle: an API and its consumer land together), Enter menu (Phase 5), custom.sty
file-watching/change events, project CSS in formatted view, `@font-face` emission, vertical text.

## Approved decisions

1. **StyleInfo enters the library as options-threaded data** (`EditorOptions.styleInfo`), not a module
   singleton and not the theme channel. Fully dynamic per instance; hot-reload = new prop value;
   multi-instance safe (continues the Phase 3 Task 0 direction).
2. **Validation is plugin-held derived state + direct DOM decoration**, not node-state. Rationale:
   paragraph validity is non-local (rank/stack — renaming `\s1` can change the following `\s2`'s
   validity); `LoadStatePlugin` uses `setEditorState` which runs no transforms, so load-time coverage
   needs a pass anyway; validity is derived, view-only data that must not enter undo history,
   serialization, or collab deltas. (Deliberate deviation from the phase2-notes node-state sketch.)
3. **Tier-2 tokenizer unknown-marker handling aligns with PT9** (see §Classification). Revisits
   Phase 2's literal-text degradation for *recognized-but-unknown* markers; the degradation property
   remains the fallback for genuinely unparseable fragments.
4. **Tier-1 renames to unknown markers stay in place as-typed** (para stays para, char span stays
   char span, glyph turns red) — a deliberate, low-visibility deviation from PT9, which would
   re-tokenize into a paragraph and orphan the closer.
5. **Menu work fully deferred to Phase 5** including the data API.

## Data shapes and the lookup seam (libs/shared)

New host-agnostic types in `libs/shared/src/utils/usfm/` (field set may be tuned during
implementation where marked):

```ts
type StyleType = "paragraph" | "character" | "note" | "milestone";

interface MarkerStyleInfo {
  marker: string;
  styleType: StyleType;
  endMarker?: string;
  // validation
  occursUnder?: string[]; // absent/empty = valid anywhere (PT9 semantics)
  rank?: number;
  textType?: string;
  textProperties?: string[];
  notRepeatable?: boolean;
  // presentation — exactly the ScrTag fields PT9 CSSCreator reads
  fontName?: string;
  fontSize?: number; // .sty points; emitted as % of 12pt base (see CSS generator)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string; // "#RRGGBB"; omitted when black (PT9 skips black)
  justification?: "left" | "center" | "right" | "both";
  firstLineIndent?: number; // .sty inches (float); ×20×zoom → vw (see generator)
  leftMargin?: number; // .sty inches (float); ×20×zoom → vw
  rightMargin?: number;
  // [CORRECTED post-review] The three comments above originally read ".sty raw int (÷50 → vw)" —
  // a plan-authorship error. PT9 stores these as thousandths-of-inch ints and CSSCreator.cs
  // divides by 50; our wire format carries .sty inches as floats, so the generator scales
  // ×20×zoom (1000/50 = 20). See generateUsjCss.ts header and CSSCreator.cs:103-247.
  spaceBefore?: number; // pt
  spaceAfter?: number; // pt
  lineSpacing?: number; // PT9 quirk: 1 → line-height 1.5, 2 → 2, else nothing
}

interface StyleInfo {
  /** Project default font/size (ScrText settings) — drives the base rule like PT9 CSSCreator. */
  defaultFont?: string;
  defaultFontSize?: number; // pt
  markers: Record<string, MarkerStyleInfo>;
}
```

C# serializes only real tags — the auto-derived `scEndStyle`/`scMilestoneEnd` entries are skipped;
`endMarker` on the base entry carries that knowledge (closers are recognized by syntax in the
tokenizer, not by lookup).

**The seam is preserved:** `createMarkerLookup(styleInfo?: StyleInfo): MarkerLookup` with
`type MarkerLookup = (marker: string) => Marker | undefined`
(`libs/shared/src/utils/usfm/getMarker.ts` signature unchanged).

- With `styleInfo`: adapts `MarkerStyleInfo → Marker` — `styleType` → `MarkerType`
  (`MarkerType` gains a `Milestone` member; additive, existing equality checks unaffected),
  `!!endMarker` → `hasEndMarker`, `category` from the bundled `categoriesMap` else `Uncategorized`,
  `children` omitted (only consumer is the deferred menu).
- Without: returns the existing bundled `getMarker` unchanged — scribe/perf/demos untouched.
- `usfmMarkersOverwrites` applies **only** to the bundled fallback, never over project data.

**Rich bundled default:** `tools/usfm-markers` already parses OccursUnder/Rank/TextType/
TextProperties/Endmarker/styles and discards them in `simplifyMarkersDictionary`. Extend the
generator to also emit a `defaultStyleInfo: StyleInfo` table from usfm.sty — including milestone
entries, which the current table lacks entirely. This is the validation/CSS fallback for
demos/tests/hosts without the PDP.

## Classification and Tier-1 routing (stylesheet-first)

PT9 classifies by stylesheet always; our pattern heuristics are stand-ins. Where the effective
stylesheet *knows* a marker, its `styleType` wins; heuristics (`NoteNode.isValidMarker`,
milestone-pattern `isKnownMilestoneMarker`, z-wildcard) remain only for markers *absent* from the
sheet, preserving current behavior in every existing test. Concretely this fixes: a custom.sty
**character** marker `\zln` currently trips the z-wildcard milestone heuristic and degrades to
literal text — stylesheet-first classifies it as PT9 does.

**Tokenizer** (`libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`):

- Signature: `usfmFragmentToUsjContent(fragment, options?: { getMarker?: MarkerLookup; isNoteContext?: boolean })`
  — existing callers unaffected; the two call sites in `tier2Rebuild.utils.ts` (`$rebuildParas` ~406,
  `$rebuildNoteContent` ~541) pass `context.getMarker`, and the note rebuild passes
  `isNoteContext: true`.
- Classification branch reordered lookup-first: entry found → `paragraph` → para token; `character`
  → charOpen; `note` → note token (caller parsing unchanged); `milestone` → milestone scan
  (`\*` termination still required, else literal — PT9 `MilestoneEnded`). Entry absent → existing
  heuristics, then unknown handling below.
- **Unknown markers align with PT9** (`UsfmParser.DetermineUnknownTokenType`,
  `ParatextData/UsfmParser.cs:642-649`; token construction `UsfmToken.cs:405-421`):
  - Body context → **paragraph token** (paragraph split), marker kept as typed; validation then
    shows the red+bold glyph. `esb`/`esbe` are explicitly paragraph (PT9 special case).
  - Note context (`isNoteContext`) → **charOpen token**, with a matching `\zfoo*` consumed as its
    closer (PT9 gives unknown tokens an implied end marker; it is only honored in char context).
  - Bare unknown closer `\zfoo*` in body context → **unmatched marker** (existing unmatched path;
    PT9 `sink.Unmatched`, `UsxUsfmParserSink.cs:262-266`).
  - The §5.2 degradation property (literal text) remains for genuinely unparseable fragments
    (lone backslashes, malformed attribute tails, etc.).

**Tier-1 guards** (`packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`):

- `MarkerEditContext` gains `getMarker: MarkerLookup` (defaulted to the bundled lookup where the
  context is built). `isParaKindMarker`/`isCharKindMarker` take the lookup and go stylesheet-first:
  entry found → kind by `styleType` (milestone/note → not para/char kind → Tier 2); entry absent →
  existing heuristic order (`v`/`c`, `NoteNode.isValidMarker`, `isKnownMilestoneMarker`), then
  unknown → **true** (stays as typed, in place — approved deviation #4).
- `$markerNodeTransform`/`$applyOpenerRename` logic otherwise unchanged.

**Editor threading** (`packages/platform/src/editor/Editor.tsx`): `EditorOptions.styleInfo?: StyleInfo`;
memoized `markerLookup = createMarkerLookup(styleInfo)` beside the existing `viewOptions`/
`nodeOptions` memos; passed into `MarkerEditPlugin` (→ `MarkerEditContext`) and the validation
plugin. Multiple editor instances (host + FootnoteEditor popover) each carry their own copy.

## Validation (§5.1)

New `MarkerValidationPlugin` (platform package, `markerEdit/`), mounted when
`viewOptions.markerMode === "editable"`.

**Pass** — a port of PT9 `ValidateUsxStyles`
(`ParatextInternalShared/ScriptureEditor/ViewUsfmXhtmlConverter.cs:288-345`) in one `editor.read`
walk:

- **Paragraph-side** (PT9 node set `//para | //book | //chapter | //sidebar`): `BookNode`,
  `ChapterNode`/`ImmutableChapterNode`, `ParaNode` root children (sidebars when they exist as
  non-opaque). Marker absent from the sheet → `unknown` (and, like PT9's auto-created unknown tags,
  it gets empty `occursUnder` and is therefore valid WITHOUT joining the stack unless the stack is
  empty — PT9 `TagValidator.cs:28-30`). Else run the
  `TagValidator.IsParagraphTagValid` port (`ParatextData/Checking/TagValidator.cs:18-57`): empty
  stack → valid + push; empty `occursUnder` → valid without pushing (no stack participation,
  `TagValidator.cs:28-30`); else walk the stack top-down for an ancestor
  whose marker ∈ `occursUnder`, accept when it is the immediate top, or `rank === 0`, or
  `stack[i+1].rank <= tag.rank`; truncate above it and push. No acceptable ancestor → `invalid`.
- **Character-side** (PT9 node set `//char | //verse | //link | //figure`): `CharNode` and
  `VerseNode`. Marker absent → `unknown`; else `occursUnder` non-empty and not containing the
  enclosing context marker → `invalid`. Context marker = nearest `NoteNode` ancestor's marker if
  inside a note, else the containing paragraph's marker (nested chars compare against the *para*,
  not the immediate char parent — PT9 `ancestor::para[1]`). Chars anywhere under an `xq` char are
  skipped entirely (PT9 exemption). **Note elements themselves are NOT context-validated** (PT9's
  set excludes `//note`); figures are opaque blocks for us — accepted deviation.
- `unknown` wins over `invalid` (PT9 `InsertStyleStatus` never overwrites).

**Decoration** — PT9 applies `status_*` **only to the marker glyph span**, never the whole element
(`Standard.xslt:42-48, 72-78, 327-333`; body text stays normal color):

- Flagged `ParaNode`/`CharNode` → the class goes on their opening **and** closing `MarkerNode`
  DOM elements; flagged `VerseNode` → its own element (its text *is* the glyph).
- Plugin holds `Map<NodeKey, "unknown" | "invalid">`, diffs each pass, toggles classes via
  `editor.getElementByKey`. `ParaNode.updateDOM` patches in place on rename (verified), so applied
  classes survive; recreated DOM belongs to dirty nodes, which the same pass re-decorates.
- **Triggers:** update listener filtered to updates that dirty marker-bearing node types (initial
  `setEditorState` marks everything dirty, covering load), plus `styleInfo` prop change → full
  re-pass. Read-only + DOM decoration only — never `editor.update` from a listener.

**CSS** (static `usj-nodes.css`, PT9 values from `ScriptureBase.css:91-101`):

```css
.status_unknown { color: <error>; font-weight: bold; }
.status_invalid { color: <error>; border-bottom: 1px solid <error>; }
```

placed **later in the cascade** than the `.marker`-family color rules so the error color wins at
equal specificity — exactly PT9's mechanism (glyph keeps its 0.7em size, loses its color).
`<error>` reuses the error red already established in the file for the Phase 2 unmatched-closer
`.invalid` rule (same family as `#d43128`), as a var with hardcoded fallback if a platform theme
var is available. The unmatched-closer `.invalid` itself stays as-is.

## CSS generator (platform package)

`generateUsjCss(styleInfo, options): string` with
`options: { zoom?: number /* =1 */; rtl?: boolean; containerSelector?: string }` — a TS port of
`CSSCreator.CreateUsfmCss`'s emissions (`ParatextInternalShared/ScriptureEditor/CSSCreator.cs`),
scoped under `containerSelector` so injected rules beat the static per-marker rules (specificity
note below). Exact PT9 formulas:

- **Base rule** (PT9 `.usfm`, lines 127-129): `font-family: "<defaultFont>";
  font-size: <defaultFontSize * zoom>pt;` when the fields are present. (Direction is not emitted —
  the editor's existing `textDirection` option owns it.)
- **Per-tag loop** (lines 133-241), skipping end/unknown style types:
  - `font-size: {FontSize * 100 / 12}%` — integer arithmetic, relative to the base rule; zoom NOT
    reapplied (inherited).
  - `text-indent: {FirstLineIndent * 20 * zoom}vw` when ≠ 0 — negative hanging indents emitted
    as-is, no compensation (PT9 warts and all). (`.sty` inches × 20; PT9's raw-int ÷50 is the same
    factor once the wire format carries float inches — see lines 74-77.)
  - `margin-left/right: {Left/RightMargin * 20 * zoom}vw`, swapped under `rtl`.
  - `margin-top/bottom: {SpaceBefore/After * zoom}pt` when > 0.
  - `line-height: 1.5` for `lineSpacing === 1`, `2` for `2`, nothing otherwise (PT9 quirk).
  - Sub/superscript → `vertical-align: text-bottom/text-top; font-size: 66%`.
  - `color` only when not black, `#RRGGBB` (conversion done C#-side).
  - `bold/italic/underline/smallCaps` → font-weight/style/text-decoration/font-variant.
  - `justification` → `text-align` (left/right swapped under `rtl`; `both` → `justify`).
  - `textProperties` containing `verse` → `white-space: nowrap; unicode-bidi: embed`.
- **Not ported:** `@font-face` emission and app font-list plumbing; vertical text mode.

Snapshot tests for the default stylesheet plus a custom-overlay fixture (color/bold/margins/rtl/
zoom/negative indent/lineSpacing quirk/skip-black). Fixtures are hand-derived from `CSSCreator.cs`
logic — `ParatextInternalShared` is app code, not in the ParatextData nuget, so we cannot execute
it; the PT9 source is the review reference.

**Specificity/layering:** the static file has many existing per-marker rules; injected project
rules must match or exceed their specificity (hence `containerSelector` prefixing) or "project
styles win where defined" (§8 stage 4) silently fails.

## paranext-core wiring (worktree `standard-view`)

- **C#:** `GetStyleInfo(int bookNum)` on `ParatextProjectDataProvider` beside `GetMarkerNames`
  (`c-sharp/Projects/ParatextProjectDataProvider.cs:1845-1852` is the pattern; registration in
  `GetFunctions()` ~149). Serializes `scrText.ScrStylesheet(bookNum)` merged tags to the StyleInfo
  DTO — custom.sty merge comes free from ParatextData's `ScrStylesheet` (per-property merge,
  `\Marker xy -` deletion honored; resolves the `@todo` at `platform-scripture.d.ts:934-936`).
  Skips derived end tags; maps `ScrStyleType` → `styleType`; converts color to `#RRGGBB` skipping
  black; adds top-level `defaultFont`/`defaultFontSize` from ScrText settings (PT9 uses these for
  the editor base font — Platform.Bible currently hardcodes a `.scripture-font` stack and exposes
  no project font anywhere; this is a confirmed visual-parity gap this field closes).
- **Registration:** `platformScripture.StyleInfo` constant in `c-sharp/Projects/ProjectInterfaces.cs`
  + advertise in `LocalParatextProjects.cs` (~40-55); TS types +
  `IStyleInfoProjectDataProvider` (get + subscribe, set unsupported — the `MarkerNames` pattern) in
  `platform-scripture.d.ts`.
- **Web view** (`platform-scripture-editor.web-view.tsx`):
  `useProjectData('platformScripture.StyleInfo', projectId).StyleInfo(bookNum)` keyed to the current
  book → memo into `options.styleInfo` (passed unconditionally — inert outside editable markerMode),
  and `generateUsjCss(styleInfo, { rtl: textDirection === 'rtl' })` → `useStylesheet` layered after
  the static base (the `useAnnotationStyleSheet` precedent). **CSS injection gated to standard view
  initially** — formatted view keeps its current styling; adopting project CSS there is a recorded
  follow-up. The base-font rule supersedes `.scripture-font` inside the editor container; the stack
  remains the fallback when `defaultFont` is absent.
- **FootnoteEditor popover:** inherits the host's options object (Phase 3 Task 9 chain: web-view
  options memo → editorOptions → `footnote-editor.component.tsx:219`), so `styleInfo` should flow
  automatically — verify at plan time.
- **Hot reload:** the library is fully dynamic on prop change (lookup memo, validation re-pass, CSS
  regeneration). The subscription delivers updates if the PDP ever fires them; no custom.sty
  file-watching or C# change events this phase (PT9 has none either — its reload is trigger-driven:
  `ScrText.ReloadStylesheet` + window invalidation).

## Testing and QA

- **Unit (library):** `createMarkerLookup` adaptation (styleType mapping, endMarker, overwrites only
  on fallback); stylesheet-first tokenizer classification (custom char/para markers, custom.sty
  z-char marker no longer milestone-trapped, heuristic fallback preserved for absent markers);
  PT9-aligned unknowns (body → paragraph split; in-note → char run consuming `\zfoo*`; bare
  `\zfoo*` → unmatched; esb/esbe paragraph); Tier-1 guards with project lookup (rename to
  project-known char stays Tier 1; rename to milestone/note kind routes Tier 2; unknown stays
  in place).
- **Unit (validation):** unknown para/char/verse; char in wrong parent (`\ft` in body → invalid);
  char in note validates against note marker; nested char validates against para; verse in heading
  invalid; empty occursUnder valid anywhere; para rank sequencing (stack truncation) incl.
  revalidation of *following* paras after a rename; xq exemption; unknown-wins; note elements not
  validated; decoration diff (classes applied to opener+closer glyphs, removed on fix, survive
  in-place rename).
- **Unit (CSS):** `generateUsjCss` snapshots per the formula list; base rule presence/absence.
- **C#:** `GetStyleInfo` test if the c-sharp test harness reaches `ParatextProjectDataProvider`
  (verify at plan time).
- **Runtime QA (Platform.Bible, propagation runbook
  `docs/superpowers/2026-07-03-paranext-propagation-blocker.md`):** real project with a hand-added
  custom.sty (a custom char marker + a restyled `\s1` color + a custom para marker): typed custom
  char marker classifies as a char span (not literal); `\zfoo ` in body text splits the paragraph
  and shows a red+bold glyph; `\ft` typed in body text shows red underline on its glyphs; project
  `\s1` color and project default font render; verification by editor STATE
  (`root.__lexicalEditor.getEditorState().toJSON()`) plus computed styles — not the collapsed
  main-editor DOM.
- **Gates:** all Nx gates `--skip-nx-cache`; `extract-api` for changed packages; lint constraints
  (no non-null assertions, ` ` not raw NBSP); prefer `undefined` over `null`.

## Non-goals and recorded deviations

- Context-aware marker menu + filtering API; Enter menu → Phase 5 (phase-cohesion).
- custom.sty file-watching / C# stylesheet change events (PT9 parity: trigger-driven reload only).
- Project CSS in formatted view (follow-up; gated to standard view this phase).
- `@font-face` emission; vertical text mode.
- Figures/tables/sidebars: opaque blocks, excluded from validation (PT9 validates `//figure`) —
  accepted deviation until Phase 5 opaque-block work.
- Tier-1 unknown rename stays in place (deliberate deviation #4; PT9 re-tokenizes to paragraph).
- Collapsed notes hide inner char validation until expanded/popover — inherent to the collapsed
  rendering, matches the information PT9 shows in its collapsed states.
- Project-settings sourcing for Phase 3 caller/separator `nodeOptions` fields → Phase 5.

## Key anchors (implementation)

- Seam: `libs/shared/src/utils/usfm/getMarker.ts` (signature preserved via `createMarkerLookup`).
- Tokenizer: `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts:141` classification branch.
- Guards/context: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts:82-99, 37-52`.
- Tokenizer call sites: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts:406, 541`.
- Options: `packages/platform/src/editor/Editor.tsx:143-162` (options destructure + memos).
- Generator tooling: `tools/usfm-markers/src/generators/markers-data/utils/*.ts`.
- PT9: `ScrStylesheet.cs:63-75, 392-412` (merge), `ScrTag.cs` (properties),
  `UsfmParser.cs:642-649` (unknown by context), `ViewUsfmXhtmlConverter.cs:288-345`
  (ValidateUsxStyles), `TagValidator.cs:18-57` (rank stack), `CSSCreator.cs:96-247` (CSS),
  `Standard.xslt:42-48` + `ScriptureBase.css:6-10, 91-101` (status rendering).
- paranext: `c-sharp/Projects/ParatextProjectDataProvider.cs:1845` (GetMarkerNames pattern),
  `platform-scripture.d.ts:924-959` (MarkerNames types + @todo),
  `platform-scripture-editor.web-view.tsx:846-887` (options memo),
  `annotations/use-annotation-stylesheet.hook.ts` (injection precedent).
