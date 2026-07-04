# Standard View project: impact on Simple mode

**Audience:** the team owning the simple (`interfaceMode === 'simple'`) experience.
**Status:** Drafted at Phase 5 design time; finalized at the Phase 5 wrap-up.

**TL;DR:** simple mode's default experience does not change. Two behaviors improve quietly,
one existing quirk needs your decision, and everything else is gated to the new Standard view
that simple mode doesn't open by default.

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

## Two behavior changes that DO reach simple mode

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

## One decision your team owns

Since the Standard-view work landed its view-type plumbing, the **"Switch Scripture view"
cycle includes Standard view in simple mode too** (`formatted → standard → markers`). That
means a simple-mode user who cycles views can land in the full marker-editing Standard view.
Options:

- **Keep it** (power feature reachable but not default), or
- **Skip Standard in simple mode** (cycle `formatted → markers`) — a one-line change we can
  include in Phase 5 if you want it; tell us.

## Heads-up, no action needed

- New menu items added during this project (already shipped in earlier phases): "Switch
  Scripture view" ordering unchanged; "Auto-show Footnotes Pane" toggle exists in the editor
  menu and is off by default.
- If your roadmap ever gives scribe-based or simple-mode editors an editable-marker view, the
  editor library's `CommandMenuPlugin` gating pattern must be applied there (this project
  fixes the known latent case in scribe).
