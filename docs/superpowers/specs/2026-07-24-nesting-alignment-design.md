# Inline-marker nesting: aligning Paratext 10 Standard view with Paratext 9

Status: DRAFT for discussion (PT-4187 follow-up work item — not part of the current PR's scope).
Evidence: every PT9 claim below is RUNTIME-VERIFIED against ParatextData 9.5.0.22 (the exact build
paranext-core links) unless marked code-derived; every P10 claim was reproduced with probes in the
real marker-edit engine harness.

## 1. The two mental models

**PT9: the file is a keystroke transcript; structure is an interpretation.** PT9 never rewrites
the user's markers on save (`NormalizeUsfm` = tokenize → emit each token verbatim; only whitespace
is regularized). Bare `\w` typed inside `\nd` stays bare in the file forever; the *parser* decides
what it means. Structure (USX) is recomputed from the flat tokens on every parse.

**P10: the USJ hierarchy is the truth; `+` and closers are derived at the edges.** A nested span
is a real child node regardless of how it was typed. Serialization derives `+` from
parent-is-char (our TS writer and ParatextData's `UsxFragmenter` agree byte-for-byte), and
`closed="false"` suppresses the closer.

These are compatible **iff** P10 reproduces PT9's *interpretation rules* at its input edges
(typing → tokenizer) and PT9's *writer rules* at its output edges (glyphs, serialization) — and
its internal round-trip loop (Tier-2 = re-tokenize the visible glyph text) is lossless. Today the
loop is NOT lossless, and that one gap produces almost every observed nesting failure.

## 2. PT9 ground truth (USFM ≤ 3.0 — what our ParatextData build always does)

The core rule (`UsfmParser.cs:245-248`):

> A char marker **without** `+` closes **all** open char styles (down to the note/para boundary),
> then opens. A char marker **with** `+` closes **nothing** and nests inside whatever is open.

TJ's formulation is confirmed, with two sharpenings:

1. It closes ALL open char styles, not just the innermost (`\ft > \+nd` + bare `\fq` pops both).
2. Whether the open span has a matching closer *later* is irrelevant — close-on-bare fires anyway,
   and the later closer becomes an `<unmatched>` node that stays literally in the file.

Other runtime-verified rules P10 must honor:

| Rule | Detail |
| --- | --- |
| Closers pop-until-match | A closer pops open styles one at a time until it matches; a mismatched closer (`\qt*` with only `\nd` open) **still closes everything** and then becomes an `unmatched` node. Nested spans' expected closer is `\+marker*` (≤3.0). |
| Outer closer auto-closes inner | `\nd a \+wj b \nd*` closes `wj` (as `closed="false"`) then `nd`. No error. |
| `+` with nothing open | `\+w` when no char is open is an *unknown marker named `+w`* — the `+` is NOT stripped. |
| Verse boundaries do NOT close chars | An unclosed `\nd` continues across `\v` — the verse milestone nests *inside* the char (≤3.0; USFM 3.1 inverts this). Marker check flags it, but the structure keeps it open. |
| Notes nest inside open chars | `\nd a \f …\f* b` puts the whole note inside the `nd` span. |
| `closed="false"` display | PT9's editor renders NO closer glyph for an unclosed span (we already match: closer suppression is implemented and pinned). |
| Editor shows `+` | In ≤3.0 projects PT9 renders the `+` in the editable marker glyphs (`\+w …\+w*`) whenever the span's parent is a char. The user sees exactly what the file holds. |
| USFM 3.1 (context only) | The rule inverts: bare markers nest by default; `+` not required; verses close chars. ParatextData 9.5.0.22 has NO 3.1 support, so P10 should target ≤3.0 semantics. |
| Style menu vs typing | The style menu (StyleApplicator) always emits explicitly-closed, properly-`+`ed USFM (NEST styles nest in place; non-NEST styles close-insert-reopen). Typing produces whatever was typed, interpreted by close-on-bare. |

## 3. P10 current state — one root cause, many symptoms

**Nesting works exactly once, then any Tier-2 pass in the same paragraph destroys it.**

Root cause: **editable glyphs drop the `+`** (`openingMarkerText` is depth-blind), and Tier-2
rebuilds a paragraph by re-tokenizing its visible glyph text. A genuinely nested
`char(nd) > char(w)` displays as `\nd Lo\w rd\nd*` — which the (correctly PT9-faithful!)
tokenizer re-interprets with close-on-bare: `\w` terminates `\nd`, the original `\nd*` becomes an
`unmatched` node, and following text is swallowed into the wrong span. Probe-confirmed
consequences:

- A paragraph with loaded nesting is **not even a Tier-2 fixed point**: a no-edit rebuild returns
  `true` and silently corrupts the data (styled text exits its span; a display NBSP leaks into
  data as a real space).
- Typing `\+w ` nests correctly on the first pass — then flattens on the next unrelated edit in
  that paragraph. (This is the observed "`+` didn't seem to want to nest properly.")
- Typing a closer works structurally (PT9-faithful early close + unmatched old closer) but the
  caret lands *inside* the new closer glyph, so subsequent keystrokes edit the glyph. (The
  observed "writing closing markers was not working.")
- The tokenizer's unmatched-closer handling diverges from PT9: it leaves open frames open (PT9
  closes them), so paragraph text gets swallowed into a span PT9 would have terminated.
- Palette-applying a NEST marker in body text splits instead of nesting (the nest-in-place branch
  is gated to notes), and the split's closer-less left half triggers a destructive rebuild.
- Tier-1 silently strips a typed `+` during marker rename — the nest instruction is discarded.

Not culprits: the tokenizer's core close-on-bare/`+`-nests logic (already PT9-correct), the NBSP
conventions (symmetric; the observed leaks are flatten symptoms), and both serializers (TS
`toUsfm` and the actual PDP path through ParatextData's writer agree with PT9 byte-for-byte).

## 4. Proposed alignment (six changes; one keystone)

1. **Depth-aware glyph text (keystone).** Render `\+marker` / `\+marker*` when the span's parent
   is a CharNode — ParatextData's exact writer rule, and PT9's exact editor display. With glyphs
   carrying the `+`, Tier-2's re-tokenization becomes lossless *with zero Tier-2 changes* (the
   tokenizer already nests on `+`), nested paragraphs become true fixed points, and the caret
   drift after `\+w ` disappears. Sites: adaptor `addOpeningMarker`/`addClosingMarker`,
   `openingMarkerText`/`closingMarkerText` (or a nested-aware wrapper), `$markerCanonicalText`
   in Tier-1, `$createNoteContentChar`, visible-mode ImmutableTypedText variants.
2. **Unmatched closers close open frames** in the tokenizer (PT9 pop-until-match), so text after
   a stray closer lands in the paragraph, not inside a zombie span.
3. **Typed `+` opener = explicit nest instruction.** Tier-1 stops stripping the `+` and routes to
   Tier-2, which (with #1) rebuilds the correct nesting from glyph text.
4. **Typed closer ergonomics.** Keep the PT9-faithful result (early close + old closer unmatched —
   that IS PT9), but fix caret placement to land after the closer glyph, at the start of the
   following content.
5. **Palette NEST-apply in body text nests in place** — extend the existing in-note NEST branch to
   body char spans (PT9 StyleApplicator parity); non-NEST styles keep close-insert-reopen.
6. **No NBSP work** — symptoms cured by #1.

## 5. Decisions needed

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Show `\+` in editable glyphs (PT9 visual parity) vs keep plus-less display and inject `+` only at Tier-2 serialization? | **DECIDED (TJ, 2026-07-24): show the `+`** — it carries hierarchical meaning, matches PT9's screen, and the screen stops lying about the file bytes. |
| D2 | Typed closer semantics. TJ's proposed model: typing an opener creates just an opener (unclosed span); typing a closer closes that marker where typed, without removing an original closer. | Survey result (2026-07-24): **P10 already implements this model verbatim for typing** — typed openers create `closed="false"` spans with no closer glyph (and no closer on save); typed closers close the innermost open frame exactly where typed; an early close into an already-closed span red-flags the original closer as `unmatched` without deleting it. PT9 behaves the same, INCLUDING its `\`-dropdown at a collapsed caret (opener-only insert). The one P10 divergence: the palette at a collapsed caret inserts an explicitly-CLOSED placeholder span (PT9 style-menu shape, not PT9 dropdown shape). **DECIDED (TJ, 2026-07-24): keep both deliberate helps** — the closed-placeholder palette insert AND the Tier-1 opener-rename-also-renames-closer propagation. D2 is fully resolved: typing semantics already match TJ's model (and PT9); the two extra helps stay. |
| D3 | Collab/OT delta path and nesting. | **Concern REFUTED empirically (2026-07-24)**: the delta model carries the FULL open-span stack per text run (`attributes.char` is an array, outermost-first) and `$createNestedChars` rebuilds hierarchy — popover-created nesting survives the ops→materialize path byte-identically (popover, host, and reopened popover all agree; primary single-user path verified end-to-end). The earlier "flattens by design" claim described GLYPH placement, not node hierarchy. Multi-user: per-run stack attributes are stateless, so replicas converge structurally regardless of interleaving. Residual hygiene items: (i) space/NBSP op jitter — **FIXED 2026-07-24**: root cause was `$displayWhitespaceTransform` treating a char span's STRUCTURAL leading NBSP as run-mapping left context, so dirty nodes diverged from clean-loaded ones; the transform now excludes the structural prefix (pinned by tests). (ii) the adjacent same-style/no-cid merge heuristic (`\fp` exempted) — documented, widen only if another adjacency-meaningful marker appears. |
| D4 | Target semantics: USFM ≤3.0 vs 3.1-aware switch? | ≤3.0 now — and this is not just convenient, it is the only reachable case: 3.1 IS shipped, unflagged PT9 functionality (default for NEW projects on 9.6+; one-way migration that rewrites every book — strips all `+`, inserts explicit end markers, stamps `\usfm 3.1`), BUT migration also sets MinParatextDataVersion 9.6.1.1, which locks 3.1 projects out of our linked ParatextData 9.5.0.22 entirely. So P10 today only ever opens ≤3.0 text. When the ParatextData dependency is upgraded past 9.6, honoring `<UsfmVersion>` becomes a real work item: the close-on-bare rule, verse-closes-chars, the is-closed lookahead, `+` emission in glyphs/serializer, and end-marker matching all become version-switched (PT9 file:line inventory in the 2026-07-24 investigation). A tripwire like the `notesub` one should guard the upgrade. Note also: PT9's `+` handling validates P10's architecture exactly — USX has no plus attribute; nesting is element containment and `+` is re-derived at write time ("`+` is serialization, not data"), which is precisely USJ's model. |
| D4b | Save-boundary hygiene (future, 3.1-era) | PT9's 3.1 editor actively strips stray typed `\+` on save (`RemoveMarkerPlusIfNotNeeded`) because its whole-chapter round-trip would otherwise preserve them; if P10 ever honors 3.1 with finer-grained saves it needs an equivalent at its save boundary. |
| D5 | Verse boundaries: must P10's chapter-scoped USJ pipeline preserve chars spanning verses (PT9 ≤3.0 does)? Needs a separate look at the editor's verse handling. | Preserve; investigate as part of implementation. |

## 5b. Tracked residuals (re-evaluate during the nesting work)

- **`\xt` NEST divergence** (pinned by test): PT9 would nest an applied `\+xt`; P10 keeps the
  close-and-reopen split because its `\xt` spans are closer-less (`closed="false"`) and nesting a
  closer-less span would swallow the host span's tail on save. Re-evaluate once D1's glyph work
  lands (an explicit closer may make the PT9 spelling safe).
- **Non-NEST apply from inside a nested span**: TJ's LIVE PT9 result (2026-07-24) differs from the
  code-derived "degenerate reopen" prediction — PT9 actually produced
  `\ft A \+nd ho\fq ly\fq*\+nd* B` (new span emitted WITH an explicit closer; NO reopen markers;
  the outer `\+nd*` left stranded/unmatched on reparse). The StyleApplicator reading of the
  reopen path was wrong or a later correction layer intervenes — re-derive from TJ's bytes, not
  the earlier prediction. P10 today: (a) with a collapsed caret it splits the innermost span, but
  the saved shape is not round-trip stable (implicitly-closed `\+fq` swallows the following
  `\+nd` sibling on re-parse — content migrates after save/reload); (b) with a SELECTION inside
  the nested span the apply is a SILENT NO-OP (TJ live-confirmed — real bug). TJ's acceptance
  criteria for the fix: the applied span must get an explicit closer (`\fq …\fq*`), placed either
  PT9's way (inside, outer closer stranded) or the cleaner close-`nd`-and-reopen-after shape —
  either is fine. All local to `usj-marker-action.utils.ts`'s apply paths.
- **Palette `+` filter**: typing `\+nd` in the palette matches nothing (filter is prefix-on-label
  against bare `nd`). Strip a leading `+` from the filter (and treat it as a nest instruction)
  as part of the typed-`+` work.
- **OT hygiene**: space/NBSP op jitter after nested closers; no-cid merge heuristic scope (see D3).

## 6. Test surface (from the audit)

`usfmFragmentToUsj` tests (change 2 alters unmatched-in-open-span expectations; add nesting
round-trip pins), `tier2Rebuild` (nested fixed-point pin — the key regression test), Tier-1
rename tests (the `+`-strip pin inverts), `usj-marker-action` (body-NEST is new surface),
adaptor/corpus and `node-react-utils` glyph-text expectations, collab `editor-delta` glyph
exclusion (must cover `\+` text), PBR footnote suites that pin glyph text.
