# Attribute markers: handoff

Branch `sv/attribute-markers` (scripture-editors) + `sv/attribute-markers-core` (paranext-core).
Plan: `docs/superpowers/plans/2026-08-11-attribute-markers.md`. Governing invariants:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

Stages 0, A, B, and C shipped in full, and Stage D (`cp`) shipped in its INLINE form after TJ
chose that option: both chapter attribute markers display and edit on the chapter's own line.
Moving `\cp` to its own line (PT9 Standard View's visual layout) is ticketed separately, as is
the cross-block fold-back. No C# serialization code was changed; the gate was never crossed.

---

## 1. What changed, by stage

### Stage 0.1 — the C# capture test (paranext-core, `sv/attribute-markers-core`)

`c-sharp-tests/Projects/VerseAttributeFoldRoundTripCaptureTests.cs` grew from 7 pins to 18, all
green, closing the plan's four gaps:

- **`cp` with markup** — the deliberate-divergence pin. ParatextData folds the pre-markup text
  into `pubnumber` and strands the markup as a CHAPTER-LEVEL char outside any paragraph
  (`<chapter pubnumber="1 cp"/><char style="nd">nd marker </char>`), and its write path
  reconstitutes the authored line byte-for-byte (`\cp 1 cp \nd nd marker \nd*`) — the partial
  fold is a stable fixed point on disk. Our tokenizer's corrected shape stays; this pin must
  never become a reason to converge.
- **`cat`** — three footnote rows (folds directly after the caller; empty span stays first-class;
  at note end it does not fold) and two sidebar rows. Captured along the way:
  implicitly-closed `\fr`/`\ft` spans carry `closed="false"` on the editor USX path while the
  explicitly-closed `\cat` never does.
- **`ca` unclosed** — no fold; degrades to a first-class char with `closed="false"`.
- **The whitespace matrix** — no-space-anywhere folds both `\va`/`\vp` with flush text; a
  same-line space between `\va*` and `\vp` BLOCKS the `\vp` fold and survives as content. The
  chapter path is ASYMMETRIC: it consumes ONE whitespace-only token after a folded `\ca`,
  unconditionally (pinned both with and without a `\cp` following). NOTE: post-9.5 ParatextData
  generalizes that skip to the verse side, so the verse row doubles as an upgrade tripwire.

Registered `cat`/`f`/`fr`/`ft`/`esb`/`esbe` on the test's own project with usfm.sty/usfm_sb.sty's
real fields (the established pattern; without them ParatextData degrades the spans and the pin
captures the fixture artifact instead of the fold rule).

### Stage 0.2 — the agreement test

`libs/shared/src/converters/usfm/attributeMarkersMapAgreement.test.ts` pins that
`ATTRIBUTE_MARKERS` (now exported) and paranext-core's markers map agree on every marker,
attribute name, shape, and host set — bridging the marker-name-vs-USJ-node-type keying gap
through each host's own map `type`, and pinning the asymmetry that gap hides (`cat`'s six note
hosts collapse into one editor "note" target). The map side is a vendored verbatim slice with a
re-copy note (the testUsfmCorpus/usfm.sty convention) — scripture-editors has no
platform-bible-utils dependency to import live. Also pins alt-before-pub host ordering and the
`hasStructuralSpaceAfterCloseAttributeMarker` fact (true `ca`/`va`/`vp`, absent `cp`/`cat`).

### Stage 0.3 — the writer's `ca` special case (paranext-core, TypeScript — NOT under the C# gate)

Resolved by KEEPING the newline-plus-space, now documented and de-bugged (an earlier pass on this
track removed it; TJ's correction reversed that). The measured facts, both now in the code
comment: Paratext 9's STANDARD VIEW save — the writer of the overwhelming majority of real
files — emits `\c 1` ⏎ ` \ca 2\ca*`, because its display structure (Standard.xslt) renders the
`\ca` span OUTSIDE the chapter's block div; ParatextData's USX→USFM path (`SetChapterUsx` →
`GetChapterUsfm`, captured in VerseAttributeFoldRoundTripCaptureTests) writes same-line
`\c 1 \ca 2\ca*`. The two writers genuinely disagree; `toUsfm()` sides with Standard View for
byte fidelity with existing files, and the two spellings parse identically (line-break
whitespace before an attribute marker is structural). The latent inconsistency the plan flagged
is fixed in place: the backslash index and the two-character slice both read the mutated output
string now. The 2SA fixtures and the 2SA-1 locations table keep their authored Standard-View
shape. Note a churn source only C#/upstream could change: a chapter saved THROUGH Platform.Bible
normalizes to the same-line shape on disk regardless, because ParatextData regenerates the
stored USFM from USX.

### Stage A — space-after vs space-between, and a real fold fix

The editor already pinned the two verse rules (v11: space after a closer is content; v12: a
same-line space before `\vp` blocks its fold). Verifying the CHAPTER side against the new
capture pins surfaced a genuine parse-fidelity bug: the tokenizer applied the verse rule
uniformly, but ParatextData's chapter path consumes one whitespace-only token after a folded
`\ca` — so `\c 1 \ca 2\ca* \cp A` folds BOTH there while we left `\cp` standalone with a stray
`" "` at chapter root. Fixed in `usfmFragmentToUsj.ts` (the ca-fold completion consumes one
whitespace-only token, unconditionally — including before a non-`\cp` char span, where the space
vanishes rather than becoming content), pinned from both sides, corpus still zero-divergence.

### Stage B — note `\cat` displays and edits

The plan's corrected diagnosis held exactly: no adaptor built `\cat` bytes anywhere. Now:

- **Display**: `createNote` (platform `usj-editor.adaptor.ts`) builds an `attribute-run` wrapper
  (runKind `"cat"`: opening `\cat` glyph, NBSP-prefixed value tagged `attribute`, closing
  `\cat*`) directly after the editable caller — editable-EXPANDED only. Collapsed notes
  deliberately show nothing; visible/hidden mirror `\va`/`\vp`'s editable-only rule. The
  editor→USJ leg already skips attribute-run subtrees wholesale, so no new exclusion anywhere.
- **Registry**: a ninth descriptor (`"cat"`), `ownerPredicate: $isNoteNode`, the run riding as
  note CHILDREN anchored on the editable caller (`$noteEditableCallerNode`); the verse scan
  refactored into a shared `$attributeMarkerRunPieces` both reuse. Ordered before `milestone`
  (whose loose-piece test accepts any opening glyph). Registered/pended from `MarkerEditPlugin`'s
  NoteNode transform (the milestone precedent — NoteNode exists in every markerMode, so the
  plugin's editable gate is the gate), with the MarkerNode/AttributeRunNode re-drives extended.
- **Settle**: `$rebuildNoteContent` now unwraps the tokenizer's default `\p` at the USJ level,
  folds a leading explicitly-closed plain-text `\cat` span onto `category` (markup, emptiness,
  `closed="false"`, and preserved-node placeholders all refuse the fold, exactly as ParatextData
  keeps those first-class), and serializes the WHOLE note so `createNote` rebuilds the canonical
  run in the same pass — the fixed-point signature then compares like against like. The category
  write happens even on a content fixed point (an edited value's canonical serialization is
  byte-identical to the displayed edit; only the note's field lags). Deleting the run clears
  `category` with no resurrection. The virtual settle mirrors all of it and patches the
  serialized note's own `category` field.

### Stage C — the chapter settle scope, then `\ca`

- **The scope** (`$buildChapterFragment`/`$rebuildChapter`, the third instance beside paras and
  notes): re-tokenizes the chapter's displayed bytes. `number`/`altnumber` come from bytes;
  `sid` is carried over; `pubnumber` carries over only when the bytes did not fold one (no `\cp`
  display yet, so absent bytes must not clear it). Preserve-or-refuse: bytes that no longer
  tokenize as a chapter (a kind-changing edit) refuse and stay a pending literal; a canonical
  chapter is a fixed point, with the same state catch-up the note fold needed. Scope resolver,
  dispatch, and the read-only mirror (`$settledChapter`, including the scope-collection and the
  para/note-only early-return guard that would have silently skipped chapter-only settles) all
  widened.
- **`$inLiteralOnlyBlock`**: chapter came out (confirmed purely circular), `book` stays. That
  exposed a hazard the plan did not predict: the chapter glyph is a PLAIN TextNode whose
  canonical bytes (`\c 1 `) always match the terminated-marker shape, so the TextNode trigger's
  immediate-rebuild arm re-tokenized the chapter on ANY incidental dirtying (Lexical marks
  siblings dirty on removal) — settling a mid-gesture deletion with no grace. Chapter-interior
  plain text now ALWAYS pends for the departure settle (canonical bytes just clear their key),
  and the historic re-pend walk descends into chapters.
- **The run**: a `"ca"` descriptor + `addChapterAttributeRun` in `createChapter` — the note-cat
  shape with the anchor being the `\c N` glyph text (the same-line file position ParatextData
  writes). Edit settles on departure; deletion clears with no resurrection; typing `\ca 5\ca*`
  into a bare chapter's glyph folds on departure; emptying the value settles to the captured
  first-class shape (`char ca` at root — the same shape the 2SA-2 fixture loads to). Husk
  cleanup and the piece-destruction classifier cover chapters.
- The `\ca*` damaged-closer collision the execution doc flagged ("only if chapters gain display
  first"): the shared `$isCanonicalMarkerNode` classification applies via the common scan, so a
  byte-damaged glyph reports absent → diverges → graces → settles. The CharNodePlugin merge
  (the settle-loop freeze's second actor) cannot reach chapter runs — they are chapter children,
  never adjacent same-marker char spans in a paragraph.

---

## 2. What was verified

- **C#**: `dotnet test --filter VerseAttributeFoldRoundTripCaptureTests` — 18/18. Every new pin
  was run against real ParatextData 9.5.0.22 and corrected to observed bytes where prediction
  differed (the `closed="false"` finding).
- **paranext-core TS**: full `platform-bible-utils` suite 29 files, 450 passed / 1 pre-existing
  skip (the 2SA-3 Discord-referenced skip, untouched). Typecheck clean on source files.
- **scripture-editors**: `nx run-many -t test` — 9 projects green: shared 494, shared-react 1533
  (+2 pre-existing skips), platform 1050 (+5 pre-existing skips — the `$addTrailingSpace`
  fabrications owned by the whitespace track; ZERO new skips), utilities, scribe, test-data.
  Corpus suites at full count. `corpus-transform-fixed-point` matters most: it mounts the real
  plugin stack and dirties every node over fixtures that now grow `\cat` and `\ca` runs — it is
  the direct check that the new syncs agree byte-for-byte with the adaptor.
- Behavior tests were red-then-green: the adaptor tests, the settle suites
  (`noteCategorySettle`, `chapterAltnumberSettle`), and the two-per-construct shapes added to
  the settled-getUsj equivalence AND fixed-point suites (virtual settle ≡ real settle, pinned
  through the framework's vacuity guards). The tokenizer's chapter-skip fix was red-first too.
- Lint/typecheck clean in nx AND root contexts (`npx eslint` over changed files;
  `npx tsc --build` over shared and platform lib+spec tsconfigs). `nx extract-api` reports no
  API-surface change for `@eten-tech-foundation/platform-editor`; `shared` has no API report.
- The 2SA editable-mode Lexical fixture was regenerated twice (cat runs, then the chapter ca
  run) via the sanctioned `GENERATE_TEST_DATA=1 pnpm generate:test-data`; the freshness pin and
  the shared-react selection data-driven consumers are green against it.

---

## 3. What I deliberately did not do

- **`cp` block-level display.** `cp` now displays and edits INLINE on the chapter's line
  (implemented after TJ chose that option); moving it to its own line — PT9 Standard View's
  visual layout — is ticketed separately. The remaining genuinely-open piece either way: folding
  a real `cp` PARAGRAPH back onto the chapter (deleting the markup that unfolded it) needs a
  cross-block rebuild scope no current scope expresses; until then the editor tree stays
  PDP-convergent-but-not-identical after such an edit until reload.
- **No C# serialization changes.** The gate was never reached: nothing in this track's findings
  requires a C# change. The one serialization-behavior change (the `ca` newline special case) is
  TypeScript in paranext-core, resolved against capture-test ground truth — review it as
  serialization-adjacent even though the gate is C#-specific.
- **Scribe untouched.** The plan said "both adaptors," but scribe's editor→USJ leg has no
  AttributeRunNode/attribute-textType exclusion — a `\cat` run displayed there would leak its
  bytes into note content on save. Displaying it safely means porting the exclusion machinery
  into an unmaintained package; corrupting notes is worse than not displaying. If scribe is ever
  revived, mirror the platform `createNote` change AND the exclusion together.
- **`$createWholeNote` builds no cat run** — new notes never carry a category at insert; the
  divergence from `createNote` is recorded at the site.
- **The settle-loop follow-up on `$signatureOf`'s post-splice blind spot** stays open; nothing
  here worsens it (the new syncs build exactly what the adaptor builds, which the fixed-point
  corpus verifies).
- **Two small pre-existing divergences noted, not fixed** (whitespace track territory): the
  editor keeps a same-line space before a block marker where ParatextData strips it (only
  reachable in whole-file input), and a note whose content STARTS with plain text merges that
  text into the editable caller when the run between them is deleted (Lexical adjacent-text
  normalization), after which the note rebuild refuses on its caller check — real notes start
  with `\fr`/`\ft` chars, so this needs a contrived shape.
- **The settle-loop handoff's "space after a `\va*` run" question** (does the adaptor owe one?):
  no. The space after a closer is CONTENT (v11 pin), riding in the following text node — the
  adaptor emitting one would fabricate a byte. The damaged-closer-absorbs-word behavior is
  correct tokenization of those bytes.

---

## 4. What TJ should manually test

Headless tests cannot exercise real focus, key handling, or the popover, so by hand in Standard
view (a doc with `\c 1 \ca 2\ca*`, `\cp`, and a categorized footnote — 2SA-1 has all of them):

1. **Note category**: expand a `\f + \cat People\cat*…` note (or open it unclosed). The `\cat
   People\cat*` run shows after the caller. Edit "People" → caret away → note's category updates
   (save and confirm `\cat` bytes on disk). Delete the whole run → category gone on disk, and it
   must NOT reappear while you keep typing in the note.
2. **The footnote editor popover** (paranext-core): open a categorized note. The note
   materializes there via delta ops, so its `\cat` run is built by the SYNC, not the adaptor —
   the one path headless coverage infers rather than mounts. Confirm the run appears, edits, and
   saves through the popover's save path.
3. **Chapter `\ca`**: shows inline after `\c 1`. Edit the value → departure updates altnumber.
   Delete the run → altnumber gone, no resurrection. Type `\ca 7\ca*` right after a bare `\c 3`
   → folds on departure. Empty the value → settles to a literal `\ca \ca*` after the chapter
   (first-class, matching Paratext) — eyeball that the root-level char renders acceptably.
4. **The chapter glyph itself**: edit `\c 1` to `\c 2` (number rename — should rewrite in
   place); retype it as `\q1 1` and depart — it must stay a chapter with the literal showing
   (refusal, not a silent restructure). Undo after each settle.
5. **Damaged closers**: delete the `*` from `\ca*` and from `\cat*`, then click away. No freeze;
   the run degrades on departure; watch for `[MarkerEdit] settle cascade exceeded` warnings
   (any means something oscillates).
6. **Collab**, if easy: a remote category/altnumber change while the local caret is elsewhere
   should heal the run in place; while the local caret is mid-edit IN the run, local bytes win
   until departure.
7. **Chapter `\cp`** (inline on the chapter line, after the `\ca` run): edit the value →
   departure updates pubnumber. Delete the run → pubnumber gone, `\ca` untouched. Type markup
   into the value (`\nd x\nd*`) and depart → the chapter loses pubnumber and a REAL `\cp`
   paragraph materializes below it (matching Paratext keeping a marker-bearing `\cp`
   first-class). Empty the value → an empty first-class `\cp` paragraph. Note the known gap:
   deleting the markup from that real `\cp` paragraph does NOT re-fold it onto the chapter until
   reload.

---

## 5. Differences from the plan, and corrections to it

- **Plan task 5's "note editor" framing**: the real display surface list is the platform
  adaptor (expanded inline notes AND the paranext-core footnote popover, which renders through
  the same package) — scribe's note editor is a separate, unsafe surface (see §3).
- **The registry order note** ("registration order is load-bearing — separator before char")
  gains two entries: `cat` and `ca` before `milestone`, for the loose-glyph classification
  reason documented at the array.
- **The plan's Stage C sequencing** ("raise the chapter-settle story as its own scoping
  conversation") was overridden by the track prompt; it was indeed the third instance of the
  pattern, but NOT purely mechanical: the chapter-glyph-as-plain-TextNode immediate-rebuild
  hazard and the fixed-point state catch-up were both undiscovered work.
- **The whitespace-matrix rows** turned out to encode a chapter/verse ASYMMETRY (the
  unconditional post-`ca` whitespace skip) that neither the plan nor the invariants doc records;
  it is now pinned in C#, in the tokenizer tests, and noted as an upgrade tripwire.
