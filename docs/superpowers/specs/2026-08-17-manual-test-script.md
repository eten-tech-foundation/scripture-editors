# Standard view: manual test script (post-integration)

For TJ, by hand, in Standard view with editable markers (expanded notes where a step says so).
Extends the seeded list in `2026-08-14-track-execution-and-handoff.md` §"What to manually test"
with everything the tracks changed that it did not cover. Steps are grouped so one document pass
covers several checks. A useful base document: 2SA-1 (has `\ca`, `\cp`, categorized footnotes,
milestones, tables, figures).

Setup: paranext-core with the MERGED editor dists (`devpub` platform-editor + utilities from
`sv/integration`, then `npm run editor:link && npm run utils:link`). Keep the dev console open
throughout — any `[MarkerEdit] settle cascade exceeded` warning at ANY step means something
oscillates and is a bug report by itself, as is `[MarkerValidation] pass:` spam that does not
stop.

---

## 1. The freeze and damaged closers (settle-loop)

1. Delete the `*` from a `\va*` closer, then arrow down into the next verse. Expect: NO freeze;
   nothing changes while the caret is still in the glyph; on departure the run degrades to two
   `\va` char spans and the alt number is gone. Ctrl+Z restores it.
2. Same damage on `\vp*` on a verse that has both `\va` and `\vp` — the `\va` run and alt number
   must be untouched.
3. Delete the `*` from `\ca*` and from `\cat*`, click away. No freeze; the run degrades on
   departure.
4. Apply `\nd` to two adjacent words separately, save, reload: they stay TWO spans now (the
   merge that caused the freeze is gone). Both round-trip losslessly — eyeball whether the
   two-object USJ shape is acceptable in the file. **[TJ decision item]**

## 2. Whitespace: separators, prefixes, typed spaces

5. In `\nd ⟨nbsp⟩Lord\nd*`: backspace the separator, click elsewhere — the marker becomes an
   `ndLord`-style unknown (paragraph split), NOT healed. Same deletion directly before a nested
   `\+wj` — heals back. Type `*x` after the separator, delete the separator, depart — becomes a
   closing marker.
6. Delete the space after `\q2`, click elsewhere — the paragraph becomes the unknown marker
   `q2…`. Delete the space after `\p` directly before a char span — heals back.
7. A space typed into an empty paragraph persists (was silently deleted). A second space before
   a verse stays on screen and collapses only on save/reformat.
8. `\v  5` (two spaces) is still verse 5; `\v 7 5` is verse 7 plus body text `5`.
9. Edit text near a collapsed footnote, save — the note's internal spacing must not gain a
   trailing space.
10. Place the caret next to `\ts-s`/`\ts-e` and type nearby — NO space may appear between the
    milestone and the verse or text.
11. **Load-leg round trip with core**: a project with `\f + \cat People\cat* \fr … \ft …\f*` —
    open, edit elsewhere in the chapter, save, reload. The space after `\cat*` survives (was
    silently deleted before).

## 3. Char stack: Ctrl+Space, Enter, paste

12. Caret mid-word in `\wj \+nd thing\+nd*\wj*`, Ctrl+Space. Expect two full stacks with a
    genuinely unstyled space between, caret after the space — check the SAVED USFM, not just
    the screen. Reopen order is outermost-first (deliberate PT9 divergence).
13. Double-click a word inside `\nd `, Ctrl+Space. Style gone, NO leftover `\nd \nd*` in the
    file. Nested case: `\nd` gone, `\wj` still applied (outer-level clearing is a known
    deferral, not a bug).
14. Ctrl+Space at a run's start (no empty pair left) and at the very END of a paragraph — the
    space must survive the save (this specific case was fixed by composition; fastest place to
    see the whitespace+char-stack merge working).
15. Enter mid-word inside `\nd`, then inside `\wj \+nd …\+nd*\wj*`: tail still styled in the
    new paragraph, closers and `+` nesting intact, caret at the new paragraph's content start,
    typing continues there. (After the menu split is routed through the primitive — backlog —
    re-run and decide the caret-inside question by feel.) **[TJ decision item]**
16. Enter mid-word inside a nested span in a footnote (`\ft A \+nd holy\+nd* B`, caret in
    `holy`): `\+nd` reopens inside the `\fp`, `" B"` FOLLOWS the break. A plain flat footnote
    (`\ft A note`) + Enter behaves exactly as before.
17. Paste two plain-text lines mid-word inside `\nd` (from a plain editor AND from a word
    processor/browser): both lines styled — `\nd thione\nd*` / `\nd twong\nd*`. An internal
    copy from this editor is the KNOWN GAP and still tears the span.
18. Undo once after each of 12–17: each gesture is one history entry and must restore
    completely.

## 4. Structural deletion and caret

19. Select all of a `\q1` paragraph INCLUDING the visible `\q1 ` and Backspace — the line
    disappears entirely, caret at the END of the previous line; save; no `\q1` in the file.
    Repeat with forward Delete and Ctrl+X. Undo restores the paragraph whole.
20. Same selection, but TYPE `x` — line gone, `x` lands as plain content at the end of the
    previous line, caret after it. Select `q1 two` (leave the backslash), type `x` — the
    pending literal `\x` shows and settles by the usual rules on departure.
21. Select every paragraph in the chapter and delete — ONE visible `\p ` remains (default
    marker even if the survivor was a `\q1`), typing works.
22. Select just the visible `\q1 ` prefix and delete — content merges into the previous
    paragraph, caret at the junction.
23. Escape with a caret in the text, no palette open — caret stays. Type `\`, Escape — palette
    closes, caret stays. Host find-bar / marker-menu Escape unchanged.
24. `\v 2 Da`, caret right after the `2`, type `\` — caret immediately after the backslash;
    number still `2`. A letter typed there extends the number (`2a`). Watch for a fabricated
    space next to the typed character — believed fixed by the whitespace rewrite, unpinned
    (backlog item B).
25. Enter, Enter (fresh `\p ` line), then Backspace repeatedly — expected TODAY: the backspace
    pends/graces at the separator rather than dissolving the line (work item C, backlog);
    selecting the `\p ` prefix and deleting DOES dissolve it with the caret returning to the
    previous line's end.
26. Arrow traversal and shift+arrow extension over glyphs, display runs, and collapsed notes —
    regression sweep, nothing should feel different.

## 5. Attribute markers: ca, cp, cat

27. **Note category**: expand a categorized footnote. The `\cat People\cat*` run shows after
    the caller. Edit the value → caret away → category updates on disk. Delete the whole run →
    category gone, does NOT resurrect while typing continues in the note.
28. **The footnote editor popover** (paranext-core): open a categorized note there — the run is
    built by the SYNC (the one path headless tests infer rather than mount). Confirm it
    appears, edits, and saves through the popover.
29. **Chapter `\ca`**: shows inline after `\c 1`. Edit → departure updates altnumber. Delete
    the run → altnumber gone, no resurrection. Type `\ca 7\ca*` after a bare `\c 3` → folds on
    departure. Empty the value → settles to a first-class `\ca \ca*` char at root — eyeball
    the rendering. **[TJ decision item]**
30. **Chapter `\cp`** (inline after the `\ca` run): edit → departure updates pubnumber. Delete
    → pubnumber gone, `\ca` untouched. Type markup into the value (`\nd x\nd*`) and depart → a
    REAL `\cp` paragraph materializes below (known gap: deleting that markup does not re-fold
    until reload).
31. **The chapter glyph**: edit `\c 1` → `\c 2` (renames in place); retype it as `\q1 1` and
    depart — stays a chapter with the literal showing (refusal, not a restructure). Undo after
    each settle.
32. **Collab**, if easy: a remote category/altnumber change with the local caret elsewhere
    heals in place; with the local caret mid-edit IN the run, local bytes win until departure.

## 6. Unknown blocks and tables

33. **Row-glyph layout** — the one thing headless tests cannot see. Expect `\tr ` as a narrow
    leading column, rows aligned. Check against a project stylesheet that gives `tr` a
    `FirstLineIndent` too (the first cut of this fix flew off-screen on exactly that).
    **[TJ eyes]**
34. Type `\tr ` mid-sentence: paragraph splits, glyph visible, sentence tail inside the row.
    Deleting the glyph does NOT rejoin the paragraph (no table settle scope — known,
    backlog). **[TJ decision item]**
35. Type a complete `\fig cap|src="x.jpg"\fig*` and keep typing — continued text lands AFTER
    the gray box, no doubled space. Same at a paragraph end with `\esb `.
36. Try to type into a figure's caption and a table cell — NOTHING happens (the caption must
    not vanish). Ctrl+C still copies from inside; arrows still traverse.
37. A document with an unterminated `\esb` (no `\esbe` before chapter end) — no `\esbe`
    appears on screen.
38. A bare `\fig ` (no attributes) is NOT gray — it is an ordinary editable span until it has
    `|src=` and a closer (reviewed and ratified; pinned as a rule).

## 7. Marker resolution: closers, unmatched, typed literals

39. Caret at the very start of a verse's text (and again at the end of the verse glyph), type
    `\va` slowly, then Space — every keystroke stays literal in place; Space folds to
    `\v N \va …`. NO red unknown paragraph at any point (this was the live QA report).
40. Copy `\nd fruit\nd*` from the rendered text, paste (separator arrives as `~`): delete the
    `~`, type a real space — the flagged `\nd*` re-matches into a clean closed span.
41. Type `\nd asdf \nd* fdsa \nd*` — first closer matches, second stays flagged; the flagged
    one is caret-editable and deletable character by character (empty removes it).
42. Click into a closer glyph (`\nd*`), retype it to `\wj*` — nothing resolves while typing;
    arrow away — the span auto-closes (`closed="false"`, no glyph) and `\wj*` goes flagged.
    Save: editor and file agree.
43. Click just AFTER a closer glyph and type — text lands unstyled after the span, caret with
    it.
44. Rename a nested opener `\+nd` → `\+wj ` — its closer follows; the outer span untouched.
45. In Formatted (non-editable-marker) view: a flagged unmatched marker is ATOMIC — caret
    steps over it whole, Backspace removes it whole, typing cannot enter it.

## 8. Palette (pre-existing behavior worth re-confirming after the merge)

46. `\marker` + Space commits the typed literal with `closed="false"`; `\marker` + Enter
    commits the highlighted item with a closer; Escape leaves the literal; `\f` + Space
    commits like Enter (all ratified §4 behavior — quick regression pass).
47. KNOWN DEFECT, unfixed (top of the quick-wins backlog): Space with a non-collapsed
    selection does nothing. Don't file it again.

## 9. Cross-cutting

48. After any ten minutes of the above: save, reload, and diff the file against what the
    screen showed before saving. Any byte the screen showed that the file lost — or vice
    versa — is a bug (Invariant I), regardless of which section it came from.
49. Undo depth spot-check: multi-step gestures (palette apply + settle) are DELIBERATELY
    multi-step in history; single-update gestures (the §3 items) are single-step.

---

## 10. Follow-up round (residual-backlog branch — `sv/residual-backlog`)

These test the seven implementation groups; run them on the residual-backlog build.

50. **The idle settle (debounce).** Retype `\nd` to `\wj` inside the opener glyph and then
    just STOP — hands off, caret in place. After ~1 second the edit settles exactly as
    clicking away would settle it. One Ctrl+Z restores the literal. Then: make the same
    edit and keep typing within the second — nothing settles mid-typing (each keystroke
    resets the clock).
51. **Debounce + undo.** Make a settling edit, click away (settle), Ctrl+Z, then WAIT idle.
    The undone literal must NOT re-settle by itself (~1s) — the undo window holds until
    your next real keystroke or click.
52. **Debounce + palette (the KNOWN exposure).** Type `\nd` so the palette opens, wait 2+
    seconds without touching anything, then commit an item. Watch for a doubled/stranded
    literal — this is the unresolved palette-signal question; observing it confirms the
    priority of that decision, not a new bug.
53. **Space wraps a selection.** Select a word, type `\nd`, press SPACE. The word is
    wrapped in a closed `\nd …\nd*` span and the palette closes. With a COLLAPSED caret,
    Space still lands the literal as before. With nonsense typed (`\qqqq`) and a
    selection, Space/Enter dismisses visibly, selection intact.
54. **Empty palette dismisses.** Type `\qqqq` (no candidates), press Enter — the overlay
    closes, the literal stays, the caret is alive. No orphaned floating box.
55. **Backslash in the book/id line.** Put the caret in the `\id` header region, type `\`
    — the palette offers PARAGRAPH markers, not character markers.
56. **Enter-menu split keeps the style, caret inside.** Caret mid-word in
    `\wj \+nd thing\+nd*\wj*`, Enter, pick a paragraph marker from the menu. The tail
    keeps its full nested style in the new paragraph and typing continues INSIDE the
    reopened style immediately. (This is the ratified caret answer to old item 15.)
57. **Outer-level range Ctrl+Space.** In `\wj one \+nd two\+nd* three\wj*` select
    `two three` and Ctrl+Space: `one` KEEPS `\wj`; the selection is fully unstyled; save
    and check no separator byte (`~`/NBSP) leaked into the file.
58. **Whitespace-only wrap.** Select just the space between two words, apply `\nd` (Enter
    or Space): the span holds exactly that space — no empty `\nd \nd*` pair in the file,
    no silent no-op.
59. **NBSP multi-line paste.** Copy two lines where line one contains a word with an NBSP
    (paste from the editor itself is the easy source), paste mid-paragraph: two real
    paragraphs result — no literal newline character inside a line. Into a char span:
    both halves keep the style per line.
60. **Machine-drift heal (hard to reach by hand — spot-check via collab if available).**
    A remote/programmatic byte-damage to a marker glyph (not typed locally) heals back to
    canonical rather than renaming the marker. Locally typed damage still pends and
    settles on departure/idle as in §1-2.
61. **Backspace-dissolve the fresh line.** Enter Enter (fresh `\p `), then Backspace
    repeatedly until glyph and prefix are gone — the line dissolves and the caret returns
    to the end of the previous line. (Old item 25's "expected today" is now the fix.)
62. **`\f` caller edit.** In an expanded footnote, add a second space into `\f  +` — the
    caller stays `+` (collapses on settle); retype the caller to a word — it retags on
    departure. `\id`'s code line is deliberately still literal-only.
63. **Collab spot-checks** (second client): a remote edit carrying `category` on a
    chapter/verse/para survives the round trip (unknown-attribute passthrough); a remote
    implicitly-closed `\ft` never grows a fabricated `\ft*`.
