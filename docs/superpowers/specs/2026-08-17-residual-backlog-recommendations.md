# Residual backlog: recommendations and implementation grouping

Companion to `2026-08-17-residual-backlog.md`. Every open question was investigated against the
merged code on `sv/integration`; each gets a recommendation and a confidence grade. Items whose
recommendation is LOW-TO-HIGH confidence are grouped below for implementation on
`sv/residual-backlog` (one worktree per group). VERY-LOW items are recorded for TJ and are NOT
implemented this round.

"Confidence" grades the recommendation's reasonableness — the chance a reviewer who knows this
codebase would endorse the direction — not the implementation effort.

---

## 1. Recommendations — low-to-high confidence (implemented this round)

1. **P9 debounce settle: editor-side timer, and an expired timer overrides the caret grace.**
   (medium-high) Invariant IV names the debounce as the second clock of the SAME settle; PT9's
   reformat tick settles globally, caret or no caret. The grace rules exist for MID-GESTURE
   edits; an idle period past the debounce IS the gesture ending, so the timer should settle
   even the caret-held site, exactly like departure does. Implementation goes through the
   existing deferred-settle path in `MarkerEditPlugin` (cascade backstop, `$exceptKeysAround`
   shield and re-pend walk all already live there), so "all paths run the same computation"
   holds by construction. Host needs no change (saves already route through settled `getUsj()`).
2. **Space with a non-collapsed selection wraps like Enter.** (high) Not really open — the
   invariants §4 table already declares today's no-op THE defect and names the desired
   behavior. The wrap primitive (`$applyMarkerMenuSelection` → `$wrapTextSelectionInInlineNode`)
   already handles the Enter wrap; the comments in `markerMenuApply.utils.ts` anticipate the
   non-collapsed case arriving with `literalPrefixLanded: false`.
3. **After a menu (Enter-Enter) split mid-span, the caret lands INSIDE the reopened span at its
   content start.** (high) Structural-caret recommended it as caret owner; char-stack's shipped
   command-path split already does it (their §6c, owner-decided); making the menu path match is
   consistency, not a new decision.
4. **Adjacent same-marker char spans staying TWO USJ objects: accept.** (medium-high) The merge
   transform was the freeze's engine; both shapes round-trip losslessly; ParatextData parses
   either. Re-merging safely would need a byte-aware merge that the settle loop proved
   hazardous. Revisit only if a real consumer chokes on the two-object shape.
5. **Empty-palette commit: dismiss the overlay and change nothing.** (medium-high) "No silent
   no-op" forbids ACCEPTING an edit and dropping it; a commit with zero candidates has nothing
   to accept — the visible dismissal is the honest outcome, matching Escape's contract.
6. **First-paragraph-region backslash selector: treat the book/header region as paragraph
   source.** (medium) `$getMarkerMenuContext` falls to `"character"` whenever the caret is
   outside any `ParaNode` — which is exactly the book-region case, where inserting a character
   span is nearly always wrong and PT9 offers the paragraph list. Repro first; the fix is in
   the source decision, not the item filter.
7. **Milestone attribute order: pin first, fix only if red.** (medium) `canonicalAttributeText`
   preserves insertion order, but the milestone fold is fixed-order (sid, eid, unknowns). The
   corpus is authored-canonical, so green suites prove nothing; a targeted
   non-canonical-order fixture settles whether an edit-settle rewrites a byte. If red: fold in
   node-state insertion order.
8. **NBSP-carrying multi-line paste: replay newlines as paragraph splits inside the whitespace
   claim.** (medium-high) `$handlePasteForStandardView` inserting literal `\n` bytes is a plain
   Invariant-I violation (bytes on screen that no USFM line can carry). Reuse the split
   machinery char-stack's paste claim uses.
9. **Enter-Enter then backspacing the fresh `\p ` away: implement structural-caret's stages
   2–3.** (medium) Stage 1 (separator backspace = pend, settle on departure) LANDED with
   whitespace's merge; the remaining spec (armed-collapsed reap; state-level tests where jsdom
   cannot drive keys) is written and internally consistent.
10. **Verse rest-extraction arms: unify on the merge-into-following-content helper.** (high)
    Same function, two strategies, one shield protecting both — pure drift-hazard removal.
11. **Table-cell separator gains the tagged token mode.** (high) One-line + a twin-shape test;
    the identical latent hazard already bit collapsed notes.
12. **`$createWholeNote` cat run: no action.** (high) A new note has no category; there is
    nothing to display. The recorded divergence is the correct state.
13. **Para-side O(1) separator heal: no action.** (high) Cost was ratified (invariants §2);
    the rebuild path is correct, just not O(1).
14. **`closeTag` endMarker spelling: no action now.** (medium) The single spelling is a
    recorded deliberate divergence (§7b); no current stylesheet in scope declares a divergent
    `Endmarker` for an offered marker. Reopen when one does.
15. **Glyph-kinds: audit the heal quadrant now; full descriptor migration later.** (medium)
    The closer/opener/para-prefix kinds have pend+settle via Tier-1 arms (marker-resolution,
    whitespace) — the un-audited quadrant is machine-drift HEAL. Verify per kind with tests,
    fix gaps found, switch `char`/`optbreak` scanners to `$isCanonicalMarkerNode`, and leave
    the wholesale descriptor refactor as follow-on.
16. **Host: collab `closed="false"` e2e test and promoting the round-trip warn to a detector.**
    (medium-high) Both are additive test/diagnostic work with no serialization-behavior risk.
17. **Unknown attributes on collab embeds: implement the passthrough and un-skip the pin.**
    (medium) The skipped test already asserts the CORRECT shape; the fix is transmitting
    attributes the receiver is already built to accept.

## 2. Recommendations — VERY LOW confidence (recorded for TJ, not implemented)

- **Coordinates / Invariant II proper** — the one-position-language module, the OT
  "apply" vs "delta-doc" unification, the table OT embed representation (first shared-react
  skip), and doing the Tier-2 caret-restore fallback RIGHT (byte-offset anchoring). My sketch:
  one exclusion module in `shared` consumed by `delta-common`, `$applyUpdate`, and the caret
  restore — but the migration touches every collab consumer and the measured display-space
  offsets suggest live-data risk I cannot bound from here. Needs its own design conversation
  and probably its own phase. Doing the caret fallback alone would add a THIRD ad-hoc mapping,
  which is the disease, not the cure.
- **Table settle story** (`\tr` glyph deletion does not rejoin the paragraph; cell
  editability). Product decision first: are rows/cells ever editable in Standard view? The
  answer decides between "give tables a settle scope" and "make the row glyph deletion refuse
  visibly".
- **Cross-block `\cp` fold-back** — needs a rebuild scope spanning chapter + sibling paragraph
  that no current scope expresses (attribute-markers' own assessment). Design work.
- **`$signatureOf`'s post-splice blind spot** — two candidate directions (compare
  post-transform vs normalizing signature) with different failure modes; the backstop bounds
  the damage loudly meanwhile. Wants a deliberate choice, not a subagent's coin flip.
- **Internal (`application/x-lexical-editor`) multi-paragraph paste mid-span** — needs a
  node-preserving replay design; the naive line replay was measured worse (char-stack §6b).
- **`\periph` tokenizer branch** — pin ParatextData's actual handling with a capture test
  BEFORE deciding the editor shape; the right behavior is unknown, not just unbuilt.
- **Visual/feel items for TJ's eyes** — the `\tr` glyph column layout; empty-`\ca` root char
  rendering; the Enter-mid-span caret "decide-by-feel" check. Manual script covers all three.
- **Drag-MOVE out of an opaque block** — recommend ACCEPTING the gap (blocking `DRAGSTART`
  costs a working affordance to close a narrow hole), but it is a product call; zero code
  either way this round.

---

## 3. Implementation groups (low-to-high items, 7 groups)

One worktree per group off `sv/residual-backlog` (both repos where noted). Plan documents in
`docs/superpowers/plans/`, one per group.

| # | Group | Items (from §1) | Plan |
| --- | --- | --- | --- |
| 1 | **settle-debounce** | 1 | `2026-08-17-group-settle-debounce.md` |
| 2 | **palette-menus** | 2, 5, 6 | `2026-08-17-group-palette-menus.md` |
| 3 | **split-and-stack** | 3, plus outer-level range Ctrl+Space (char-stack §6a's remainder — the attributed-span byte rule it was blocked on is now settled) | `2026-08-17-group-split-and-stack.md` |
| 4 | **whitespace-paste-tests** | 7, 8, 11, plus the two shared-test debts: wrap-a-whitespace-only-selection, and moving char-stack's paragraph-end Ctrl+Space test to the full harness | `2026-08-17-group-whitespace-paste-tests.md` |
| 5 | **host-collab** (paranext-core + shared-react) | 16, 17 | `2026-08-17-group-host-collab.md` |
| 6 | **glyph-kinds-audit** + doc corrections (backlog §7) | 15 | `2026-08-17-group-glyph-kinds-audit.md` |
| 7 | **tier1-deletion-followups** | 9, 10, plus the map-derived leading-attribute generalization (whitespace's deferral — now uncontended) and the item-B fabricated-space verification pin | `2026-08-17-group-tier1-deletion.md` |

Items 4, 12, 13, 14 are no-action recommendations; nothing to implement.
