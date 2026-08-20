# Standard view: owner-feedback rounds (waves 2–4)

Three rounds of fixes driven by TJ's hands-on testing of `sv/residual-backlog`, after the six-track
integration and the seven-group residual backlog. All merged into `sv/residual-backlog` in both
repos. Per-group detail lives in `docs/superpowers/plans/2026-08-18-fb*.md`.

## Wave 2 — the first feedback batch

| Group | Shipped |
| --- | --- |
| settle-config | `markerSettleDelayMs` editor option (undefined = 1000 ms, `0` = immediate, negative = off), demo-harness control, core experimental setting, and idle expiry overriding caret-position grace |
| palette-active | The editor's `\` palette became ACTIVE: typing filters the palette and never enters the document; Space commits the typed marker, Enter the highlighted item, Escape leaves the document untouched |
| ca-display | Chapter-adjacent first-class `\ca` folds onto the chapter on settle; non-bold green in both states; renders on the line after `\c N` |
| engine-fixes | Unknown-split paragraphs rejoin when their marker becomes inline; the Enter-Enter-backspace chain restores bytes and caret exactly |
| milestone-order | Attribute order preserved end-to-end via optional `attributeOrder` (stored only when non-canonical) |
| footnote-editor | The scaffolding `\p` no longer displays in the footnote editor |
| cheap | Three real `setTextContent` staleness bugs fixed, tracker-ref test renamed, doc counts corrected, Nx sync drift resolved |

## Wave 3 — P9 semantics, glyph bytes, tables

| Group | Shipped |
| --- | --- |
| palette-host | P9 zero-match rules in both palettes (Enter no-ops and stays open; Space commits typed; Esc inserts nothing); the host palette ranks exact-first through the editor's exported ranking; `markerSettleDelayMs` typed `number \| undefined` |
| engine-three | Typed bytes inside glyph bytes can no longer be silently discarded (caret-held rebuilds that would lose non-whitespace bytes re-pend); caret is byte-anchored across rebuilds; Enter after a paragraph-final closer opens the Enter menu; milestone reorder-on-edit fixed |
| table-cp | The `\tr ` row glyph is delete-proof (two bypass routes and a CUT/PASTE priority race closed); `\cp` folds back onto its chapter when its markup is deleted |

## Wave 4 — the app surface and artifact paragraphs

| Group | Shipped |
| --- | --- |
| host-active | The APP's host palette became ACTIVE (typing captured into its query, not the document) in the main editor and footnote popover, with Space-commits-typed including selection wrap via the new `EditorRef.commitTypedMarker`, Enter-commits-highlighted, and the P9 zero-match rules |
| artifact-rejoin | Unknown-split paragraphs rejoin when their marker degrades to plain text; a typed `\ca` literal in the chapter-adjacent implied paragraph folds onto the chapter; `\` after the paragraph prefix's separator space opens the INLINE palette (glyph-adjacent positions keep the paragraph palette) |

## Cross-cutting findings recorded this round

- **The app never renders the editor's own palette.** Under Platform.Bible the host renders its
  own overlay for both the main editor and the footnote popover. Editor-palette behavior and
  host-palette behavior must be changed together; a fix in one is invisible in the other.
- **The global yalc store is shared across concurrent worktrees.** A devpub from one track was
  measured overwriting another's within minutes. Always re-devpub and verify the linked dist by
  checksum immediately before testing or running core suites.
- **Root `npm test` in paranext-core does not cover the full extensions suite** — run
  `npx vitest run` from `extensions/` as well.
- **Lexical 0.43 `setTextContent` compares the captured instance's text**, so the common
  `if (getTextContent() !== x) setTextContent(x)` guard is anti-protective. Three real bugs came
  from this; use `getLatest()` before writing.
- **A latent caret jump belongs to Lexical, not the engine**: a zero-dirty, selection-only commit
  one tick after a rebuild re-derives selection from stale DOM and can snap the caret to the
  region start. Deterministic repro and a test pattern immune to it are recorded in
  `2026-08-18-fb2-engine-three.md`.

## Settled since

**Mid-text `\f ` — reproduced end to end, and fixed** (was "Open, needing TJ" item 1; see
`2026-08-19-fb4-glyph-caret.md`). The claim holds and the mechanism recorded here and in
`2026-08-18-fb3-host-active.md` is confirmed, not revised. What was missing was a reproduction, the
name of the surface it is reachable on, and a decision.

- **Measured, through the palette, not by tracing.** `\p hello| world and more`, `\` `f` Space →
  one note holding `\f world and more`: `\f`'s caller is a LEADING ATTRIBUTE so the first word
  after the caret becomes `caller`, and because the note has no closer it stays the open container
  for the rest of the paragraph-scoped fragment. Both halves now have tests.
- **Why TJ could not reproduce it.** Stronger than "the host routes note markers differently": the
  app never mounts the editor's palette at all — `Editor.tsx` gates `UsjNodesMenuPlugin` on
  `!hasExternalUI`, which is this document's own cross-cutting finding above. The reachable
  surface is `nx dev platform`, or any embedder that leaves `hasExternalUI` false.
- **Why every existing test missed it.** All `\`-palette fixtures placed the caret at the end of
  the document. With no tail to absorb, the literal produces the empty note the ratified table
  calls "commits like Enter" — the hazard is invisible in exactly that position.
- **Resolved** the way the owner leaned: the editor's palette now routes `kind === "note"` through
  the item commit. The ratified caret-at-end `\f` end state and all non-note Space behavior are
  unchanged, and both are pinned rather than assumed.

## Open, needing TJ

1. **Host focused-selection-wrap Space** still refuses in one host session shape rather than
   wrapping on an exact typed match — recorded in `2026-08-18-fb2-palette-host.md`.
2. Everything in `2026-08-17-followup-residual-backlog.md` that was not superseded by these
   waves, notably the Coordinates/Invariant II cluster (which now also carries the milestone OT
   embed's missing attribute-order slot).
