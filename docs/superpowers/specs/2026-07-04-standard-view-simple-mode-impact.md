# Standard View project: impact on Simple mode

**Audience:** the team owning the simple (`interfaceMode === 'simple'`) experience.
**Status:** Finalized at the Phase 5 wrap-up (2026-07-07) against what shipped and was verified
in-app. Companion: `docs/superpowers/specs/2026-07-07-standard-view-followups.md`.

**TL;DR:** simple mode's default experience does not change. Three behaviors change quietly (two
correctness improvements and one save-timing change), one existing quirk needs your decision, and
everything else is gated to the new Standard view that simple mode doesn't open by default.

## What does NOT change for simple mode

- The default editor view stays `formatted`. The new power-mode default (new editors opening
  in Standard view) checks `interfaceMode` and applies only to `'power'`.
- All Standard-view-only behavior is inert in formatted/markers views: inline editable
  markers, the backslash/Enter marker palettes and their keyboard handling, clipboard
  NBSP-normalization, project-stylesheet CSS injection (formatted view keeps the static
  stylesheet — explicitly decided), visible "unsupported structure" blocks (formatted view
  renders exactly as today), footnotes-pane auto-show (also off by default everywhere).
- The overlay service gains a `passive` command-palette mode. Purely additive — existing
  overlay callers and behavior are untouched.

## Three behavior changes that DO reach simple mode

All three shipped and were verified in-app.

1. **Marker menu contents (formatted view's `\`-menu).** The inline marker menu's item list
   switches from a static built-in USFM table to the project's stylesheet (occursUnder-driven
   filtering, custom.sty styles included). Users get more accurate lists — but the lists can
   differ from today's: project-invalid markers disappear, project-custom markers appear. The
   menu's look and interaction (search popup) are unchanged in formatted view.
2. **Inserted footnotes/cross-references become project-correct everywhere.** The
   chapter-verse separator, verse-range separator, and default callers used when inserting a
   note now come from real project settings (Settings.xml) instead of hard-coded defaults
   (`:`, `-`, `+`). For most Western projects the values are identical; projects with custom
   separators/callers will see their configured values — a correctness fix, but a visible one.
   **One nuance worth flagging:** the newly-registered *default* for the chapter-verse separator
   is `.` (matching ParatextData's own default), not the editor's old hard-coded `:`. So for a
   project whose Settings.xml does not set the separator (tag-less projects), an inserted note's
   reference now reads `1.3` rather than `1:3` — in **all** views, formatted included. This is a
   PT9-faithful correction, but it is a visible change for those projects.
3. **Saves while typing are now debounced (~0.7s).** This project changed the editor's
   keystroke-driven save from per-keystroke to a ~0.7s trailing debounce, with a flush when you
   switch chapters, blur the window, or close. It lives in the shared editor↔host sync path, so
   it applies in **every** view including simple mode's formatted view. Upside: it removes a
   per-keystroke save/echo storm. Trade-off to be aware of: a renderer crash within the ~0.7s
   window could lose the last moment of typing (the flush-on-switch/blur/close paths limit this).

## One decision your team owns

Since the Standard-view work landed its view-type plumbing, the **"Switch Scripture view"
cycle includes Standard view in simple mode too** (`formatted → standard → markers`). That
means a simple-mode user who cycles views can land in the full marker-editing Standard view.
Options:

- **Keep it** (power feature reachable but not default), or
- **Skip Standard in simple mode** (cycle `formatted → markers`) — a one-line change; Phase 5 has
  shipped, so this would be a small follow-up. Tell us which you want.

## Heads-up, no action needed

- New menu items added during this project (already shipped in earlier phases): "Switch
  Scripture view" ordering unchanged; "Auto-show Footnotes Pane" toggle exists in the editor
  menu and is off by default.
- If your roadmap ever gives scribe-based or simple-mode editors an editable-marker view, the
  editor library's `CommandMenuPlugin` gating pattern must be applied there (this project
  fixes the known latent case in scribe).
