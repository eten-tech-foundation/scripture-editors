# Standard view: nesting-arc status and the attribute-display effort

Status: arc record + hand-off (2026-07-27). Companion to
`2026-07-24-nesting-alignment-design.md` (the nesting design doc; its rules still govern).

## 1. Where the nesting/marker-edit arc stands (all on `standard-view-pt-4187`)

The six-change nesting alignment plus follow-ups are implemented, TDD-pinned, and green
(shared 237 / shared-react 1352 / platform 562 / core PBR 370):

- **Depth-aware glyphs** (keystone): nested char spans render `\+w …\+w*`; markers stay CLEAN
  everywhere (node state, USJ, OT delta — nesting rides the char array, `+` is display-only).
  Owning module: `libs/shared/src/nodes/usj/nestedGlyphs.utils.ts` (self-healing CharNode
  transform + the `MarkerNode.__text` cache story). Loaded nesting is a Tier-2 fixed point.
- **Tokenizer PT9 parity**: unmatched closers pop open frames; USFM ≤3.0 keeps char styles open
  across verses (D5); `+` = nest instruction end-to-end (typing, palette filter, Tier-1 routes to
  Tier-2).
- **Apply semantics**: palette NEST styles nest in place (body and notes); non-NEST styles
  close-and-reopen (PT9 StyleApplicator; never nest-wrap).
- **Display separators**: owned by `libs/shared/src/nodes/usj/markerSeparators.utils.ts`
  (structural NBSP after opening glyphs: text-prefix or standalone spacer; presentation-only,
  never in USJ/file). Self-healing transform + mid-edit grace: deleting a separator sticks while
  the caret is at the spot, settles back canonically on caret departure via the pending →
  Tier-2 completion path.
- **Sentinel-glue fix**: a preserved node (note/milestone/attribute span) directly after an
  opening glyph no longer corrupts the Tier-2 fragment (placeholder was absorbed into the marker
  name → silent sentinel-count abort → settle never happened).
- Deletion-test flake fixed properly (commit-time caret snapshots; jsdom's async selection sync
  was the artifact).

## 2. The attribute discovery (why the next effort exists)

While chasing "editing a nested closer never settles" (zzz6 GEN 1: `\wj \+w dsa|stuff\+w*`), the
real differentiator turned out to be the **`|stuff` attribute**, not marker adjacency:

- Char-span attributes (`|lemma="…"`, default attributes like `\w word|gloss\w*`) are parsed
  into `unknownAttributes` on the CharNode and **never displayed** in Standard view. Only
  milestone attributes (`|sid="…"` runs), leading attribute markers (`\va \vp \ca \cp \cat`),
  and note callers display today.
- Because the bytes are invisible, Tier-2 classifies attribute-carrying spans as **sentinels**
  (`hasByteAttributes` → preserve-or-refuse): they ride through rebuilds atomically. Correct for
  data safety, but it **freezes marker edits inside such spans** — an edited closer glyph never
  settles (rebuild reproduces the identical structure → fixed-point refusal). Deferred by TJ
  decision (2026-07-27): the right fix falls out of attribute display.
- **TJ requirement**: Standard view must show attributes as written in USFM, PT9-style — text
  content attributes, default attributes, and non-default attributes alike. When they display,
  attribute spans become fully text-recoverable, stop being sentinels, and every marker-edit
  behavior (settle, re-tokenize, glyph edits) works uniformly.

Key references for the effort: paranext-core's markers map and `UsjReaderWriter` (C#), PT9
sources at `~/source/repos/Paratext` (attribute rendering in the PT9 editor; `UsfmToken`
attribute handling; `HandleAttributes`), the fragment tokenizer's existing attribute machinery
(`parseAttributeText`, `DEFAULT_MARKER_ATTRIBUTES`, `extractAttributes` in
`libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`), and the milestone attribute-run display
convention (`NODE_ATTRIBUTE_PREFIX`, textType "attribute") in the platform adaptor.

## 3. Interactions the attribute effort must respect

- The Tier-2 loop must stay lossless: whatever renders must re-tokenize to the same USJ
  (the nesting keystone's rule). Displaying attribute bytes as engine-owned text (like the
  milestone `|…` runs) is the natural shape; `hasByteAttributes` sentinel classification for
  char spans should then be REMOVED so the spans re-tokenize.
- `markerSeparators.utils.ts` and `nestedGlyphs.utils.ts` are the consolidation pattern to
  follow: one owning module (representation rules + doc), builders construct canonically,
  a self-healing transform guards drift, mid-edit grace + pending settle for user edits.
- OT/collab: attribute bytes currently travel as unknownAttributes on the char delta item;
  display text for them must be glyph-like (excluded from content ops) or lengths shift.
- USFM 3.1 tripwire (`Usfm31NestingTripwireTests.cs`) governs `link-href` vs `href` naming.

## 4. Deferred/known items

- Closer-glyph edits inside attribute spans (finding 2) — resolves with attribute display.
- `\xt` NEST divergence (pinned) — re-evaluate; explicit closers may now make PT9 spelling safe.
- Pre-existing `_context` unused-var lint error in markerEditTier1.utils.ts (not ours).
- markerEditDeletion caret tests hardened; keep an eye on other timing-sensitive files.

## 5. Prompt for the attribute-display brainstorming chat

> Brainstorm and plan the attribute-display effort for the Paratext 10 Standard-view editor.
>
> Workspace: `~/source/repos/workspaces/standard-view/` — paranext-core (branch `standard-view`)
> + scripture-editors (branch `standard-view-pt-4187`). PT9 reference source (never edit):
> `~/source/repos/Paratext`. Read FIRST, in full:
> `docs/superpowers/specs/2026-07-27-attribute-display-and-nesting-arc-status.md` (arc status,
> the attribute discovery, interaction constraints) and skim
> `2026-07-24-nesting-alignment-design.md` (the governing nesting rules and the Tier-2
> losslessness principle).
>
> Goal: Standard view must display USFM attributes as written, PT9-style — text content
> attributes, default attributes (`\w word|gloss\w*`), and non-default attributes
> (`\w word|lemma="…" strong="…"\w*`) on char spans. Today only milestone attribute runs,
> leading attribute markers (`\va \vp \ca \cp \cat`), and note callers display; char-span
> attributes hide in `unknownAttributes`, which forces Tier-2 to treat those spans as
> atomic sentinels (preserve-or-refuse) — freezing marker edits inside them.
>
> Investigate before designing: (1) how PT9 renders each attribute kind in its editor
> (~/source/repos/Paratext — the editor's attribute display, `UsfmToken`/`HandleAttributes`);
> (2) paranext-core's markers map and C# `UsjReaderWriter` attribute round-trip; (3) the
> existing machinery to extend: the fragment tokenizer's `parseAttributeText`/
> `DEFAULT_MARKER_ATTRIBUTES`/`extractAttributes`, the milestone attribute-run display
> convention (textType "attribute", `NODE_ATTRIBUTE_PREFIX`), and the consolidation pattern in
> `nestedGlyphs.utils.ts` / `markerSeparators.utils.ts` (owning module + construction-time
> builders + self-healing transform + mid-edit grace with settle-on-departure).
>
> Constraints: the Tier-2 re-tokenize loop must stay lossless (displayed bytes re-tokenize to
> identical USJ), after which `hasByteAttributes` sentinel classification for char spans should
> be removed; attribute display text must be excluded from OT content ops (glyph-like) so collab
> lengths don't shift; USFM ≤3.0 semantics per the nesting design's D4 (3.0 attribute names,
> e.g. `link-href`). End state to verify: attribute spans render their bytes, are editable,
> settle canonically on caret departure, round-trip byte-identical to file, and marker edits
> inside them (the deferred finding 2) work like any other span.
>
> This is a large effort: brainstorm first, then write an implementation plan with TDD steps.
> Do not start implementing without TJ's sign-off on the plan.
