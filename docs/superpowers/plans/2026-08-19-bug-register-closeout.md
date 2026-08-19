# Bug-register closeout: pin every reported bug, then fix what is still broken

Companion to `docs/superpowers/specs/2026-08-19-reported-bug-register.md`, which is the source of
truth for WHAT was reported. This plan says how to close it out.

## Why this exists

Four rounds of architecture work fixed a great deal implicitly. The register found 21 reported bugs
that were never scoped by any plan, and the owner's manual spot-check then found that several of
those **no longer reproduce** — fixed as a side effect of the reworks, with nothing pinning them.

That is the actual risk now. An unrecorded, unpinned, accidentally-fixed bug regresses silently.
The goal is not primarily to fix things; it is to **convert the register into tests**, and fix only
what the tests prove is still broken.

## The bisect method

For each bug, write the test at a revision where the bug should still be present, prove it red, then
carry it forward. That distinguishes three outcomes a test written only against HEAD cannot:

- **red-then-green** — our work fixed it; the test becomes the regression pin.
- **red-then-red** — still broken; fix it.
- **green-at-the-old-revision** — it was never broken there. Either the report predates that base, or
  the repro is environment-specific, or the register mis-transcribed it. Say which; do not silently
  drop it.

**Anchor revision: `f0800f35`** — the point the six Phase 3 worktrees branched from. Everything the
tracks and the four follow-up rounds did comes after it, so it cleanly separates "our work fixed
this" from "this was never broken here."

If a bug is green at `f0800f35`, go back at most **one** further anchor (`85fec66d`, the standard-view
tip the analysis was rebased onto) before declaring it unreproducible. Archaeology past that is not
worth the time — record it and move on.

**Where this is affordable, prefer it.** Where a repro needs the real app, a mounted popover, or
manual interaction, say so and fall back to a HEAD-only test plus a manual-script entry.

## Owner's spot-check results, already known

| Bug | Owner result |
| --- | --- |
| M2 milestone name never persists | **reproduces** |
| A2 typed attribute text never settles | **reproduces** |
| N1 footnote insert deletes a closer | **reproduces** |
| A1 `\w*` deletes the default attribute | does not reproduce |
| K12 `\nd`+Enter fabricates an empty pair | does not reproduce |
| N4 Ctrl+T duplicates the verse digit | does not reproduce |
| W4 wrap emits no separator | does not reproduce |

Everything else in the register's open list is **untested by hand** — treat it as unknown, not as
broken.

## Waves

### Wave 1 — the three confirmed data-loss bugs (highest value, do first)

Each is a silent divergence between screen and file, the class Invariant I forbids.

1. **M2** — a milestone's marker name is editable on screen and never persists. Red at HEAD (the
   owner reproduces it), so no bisect needed. Expect this to be a piece-classification or
   settle-scope question: the marker name is not a display-run piece the registry knows about.
2. **A2** — typed `|name="value"` content on a char span never settles into real attribute state.
   All prior attribute-settle work was scoped to attribute *markers*; char attribute runs were never
   covered.
3. **N1** — inserting a footnote next to consecutive inline markers nests them and deletes a closing
   marker. No track covered note *insertion* at all. Check whether the char-stack primitive should be
   a caller here, as it became for paragraph splits.

### Wave 2 — pin the four that no longer reproduce

Bisect each. The deliverable is a regression pin, not a fix.

4. **A1**, **K12**, **N4**, **W4**. For W4 specifically, note the stakes changed: a missing separator
   used to be cosmetic and is now semantic under the tokenize-identity rule, so the pin should assert
   the separator's presence in the emitted bytes, not merely that the wrap "looks right".

If any is green at both anchors, record it in the register as *never reproduced here* with the
anchors checked, and stop.

### Wave 3 — the log-storm cluster

**S4, S5, S6, S7, A6**, plus **S8**'s log half. Five reported repros, treated by every track as out of
scope: the settle-loop handoff says plainly *"did not touch logging volume."*

These are one class — commits cycling — and the settle-loop work already built the instrument:
a cascade-depth backstop and a bounded-commit test shape. Reuse it. **Assert a commit bound, never
"eventually quiesces"** — a test that hangs is not a useful failure.

Diagnose before fixing; the shared cause may be one defect with five faces, or five unrelated ones.

### Wave 4 — the caret cluster

**C1**, **C3**, **C5**, **C6**, and the deferred caret halves of **W6/W7/W8**.

W8's caret half is the known-worst: deferred by the whitespace track, repeated in the summary, then
**dropped from the backlog entirely**, and a later round narrowed it to "lands one byte past" while
recording that *no track owns it*. It has no owner today.

C6 (caret vanishes on mouse-click after a trailing footnote; Space then scrolls the page) has a
pre-existing `TODO` in `ArrowNavigationPlugin` naming the structural gap: there is no text position
after a trailing note. That is a design question, not just a caret fix.

### Wave 5 — triage the remainder

**E3** (Enter's temporary line, P9 parity), **P4** (top dropdown does not retag), **U5** (cannot copy
an unknown block's marker name — recorded as impossible-by-design without ever being tested), **V1**
(Simple mode structure lock — verify whether "Standard unavailable in Simple" actually shipped),
**V3** (verse bridging, reported fine but never pinned), **V4** (a *rendering* check of testUSFM, as
opposed to the data round-trip nets that already exist).

For each: test if cheap, else record the cost and stop.

### Not in scope — decisions, not defects

- **X2** — Ctrl+Space in `\ft`. A convention was ratified under which the reported behavior is the
  intended output. **Needs the owner's ruling before any code moves.**
- **S1** — undo consuming a step for a settle that changed no USFM. The recorded answer addresses a
  different question.
- **U3**, **U6**, **V6**, **V2** — deferred or handled elsewhere by owner decision.
- **P5** — fixed then deliberately reversed to match P9. Do not re-file.

## Acceptance

- Every register item in waves 1-4 has a test, or a recorded reason it cannot practically have one.
- Every test that started red is green, or its bug is listed as an explicit deferral with a reason.
- The register is updated in place: checkboxes corrected, and each item gains a pointer to its pin.
- Full gate green in both repos; no new skips.

## Risks

- **The bisect can mislead.** A test written at an old revision may fail there for an unrelated
  reason (missing helper, different API). Confirm the failure is the reported behavior, not a
  compile or harness error, before calling it red.
- **Wave 3 is the one most likely to sprawl.** Bound it: diagnose all five, fix the shared cause, and
  record the rest rather than chasing each.
- **Do not fix by widening an exemption list.** Several of these bugs exist because a transform
  enumerated node classes; adding one more entry repeats the defect the register documents.
- **C# serialization stays behind the approval gate.** If a repro lands there, bring the owner the
  problem and the proposed fix together, and wait.
