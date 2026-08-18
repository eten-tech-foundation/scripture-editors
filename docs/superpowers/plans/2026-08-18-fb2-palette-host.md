# Feedback round 2: P9 zero-match semantics + the host palette's query routing

Owner-directed round (TJ, 2026-08-18), spanning BOTH repos on the `sv/fb2/palette-host`
worktree pair. Three directives:

1. **Zero-match semantics, editor palette (P9 parity — revises the earlier zero-candidate
   dismiss):** in P9, Enter over a zero-match palette does NOTHING (palette stays open); Space
   inserts the typed marker and closes; Escape closes without inserting. Apply to the editor's
   active palette; the recent dismiss-on-Enter becomes a stay-open no-op.
2. **Host palette (paranext-core overlay):** typed characters must route into the palette's
   query with filter + exact-match-first ranking identical to the editor palette's
   (`filterAndRankItems`: exact > startsWith > contains, marker-name only); Space commits the
   TYPED marker; Enter commits the HIGHLIGHTED item; zero-match Enter no-ops and stays open;
   Escape inserts nothing. Reuse the editor package's ranking, don't reimplement.
3. **Setting type:** `platformScriptureEditor.markerSettleDelayMs` becomes `number | undefined`
   in SettingTypes (papi serialization maps JSON null <-> JS undefined); the JSON contribution
   default stays `null`; hook + tests adjust.

## Root cause, as measured (host palette)

- The renderer's `filterPaletteItems` (overlay.service-model.ts) has **no ranking at all**:
  passive mode is a bare startsWith filter that PRESERVES context order, active mode is a
  substring match over label AND description AND badge. Typing `w` in a focused palette matches
  every item whose description contains a "w", so the list looks unfiltered and `w` ranks
  deep — TJ's "w 9th" symptom, reproduced in-repo.
- Passive Space commit resolves `filtered[selectedIndex]` from that unranked list. With
  `shouldSpaceCommit` (note markers), typing `\f` + Space resolves the FIRST startsWith("f")
  item in context order, not the exact match — the `\fq`-instead-of-typed class, reproduced
  in-repo (measured resolution below).
- Zero-match Enter: the service host already drops the commit and leaves the overlay open, but
  `handleMarkerPaletteSessionKeyDown` unconditionally returns `'ended'` on Enter — the session
  ref is cleared while the overlay stays mounted (orphan divergence; subsequent typing lands in
  the document under a floating palette).
- The typed-chars-into-query routing itself (session filter mirroring ->
  `updateCommandPalette` -> store -> palette) EXISTS on this branch for both the main web view
  and the footnote popover; TJ's unfiltered-list report matches the `sv/integration` build line
  (which predates the mirroring in the EDITOR and whose symptoms the palette-active round
  already documented). Verified here by pinning the routing, not by changing it.

## Plan

### scripture-editors (directive 1 + the ranking export)

- [x] RED: markerMenuHarness zero-candidate pins — Enter over zero matches keeps the palette
      OPEN (container still mounted, document unchanged), Escape still closes it; same for the
      Enter-triggered menu. Space-with-zero-matches (commit typed) and Escape pins already
      exist and stay green.
- [x] GREEN: `UsjNodesMenuPlugin.tsx` zero-candidate Enter/Tab branch: claim the key, keep
      `menuState` (no teardown).
- [x] Invariants §4: add the zero-match row (Enter no-op/stays open; Space commits typed;
      Escape closes) as an owner-directed revision note.
- [x] Export `filterAndRankItems` (+ its option types) through shared-react's Menu barrel and
      from `@eten-tech-foundation/platform-editor`'s index; extract-api.
- [x] Build + devpub (platform, utilities) for core linking.

### paranext-core (directives 2 + 3)

- [x] RED: overlay.service-model ranking pins — passive "f" resolves exact `f` first;
      active "w" ranks `w` first and matches marker names only; commit resolution picks the
      exact match (the `\nd`/`\fq` pin at the service-host level).
- [x] GREEN: `filterPaletteItems` delegates to a PBR wrapper over the editor's
      `filterAndRankItems` (label-only, exact > startsWith > contains; passive keeps the
      leading-`+` strip and prefix-match, active becomes label-substring).
- [x] RED: marker-palette-keydown pins — Enter with zero matches claims the key, calls NO
      driver op, returns a stay-open outcome for every session kind; Escape/dismiss unchanged.
- [x] GREEN: the table takes the session's items (both consumers already carry them), counts
      matches with the same PBR wrapper, and no-ops Enter at zero.
- [x] Extension component pins: exact match first (query `w`), `\nd`+Space commits `nd` not
      `fq` (dismiss->Tier-2 for non-note markers; exact-first resolution for the
      `shouldSpaceCommit` note path), zero-match Enter stays open, Esc inserts nothing.
- [x] Setting type: `number | undefined` in the d.ts, hook default `undefined`, tests updated;
      contribution default stays `null`.
- [x] Full gates both repos.

## Notes

- The focused 'selection' session's Space still refuses (claim + dismiss, selection intact)
  rather than wrapping on an exact typed match like the editor palette does — committing a
  SPECIFIC item is not expressible through `PaletteDriver`; noted as residual for the owner.
- `showCommandPalette` consumers today: the scripture editor's marker palettes and the
  hello-rock3 sample. The active-mode label-only change affects the sample's demo palette
  (description search goes away) — acceptable, noted.
