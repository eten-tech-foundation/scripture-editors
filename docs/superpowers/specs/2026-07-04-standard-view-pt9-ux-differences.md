# Standard View: PT9 vs PT10 — user-facing differences

**Audience:** Product Owner. Plain language; no code internals.
**Status:** Drafted at Phase 5 design time; finalized at the Phase 5 wrap-up (entries may be
added if implementation surfaces new differences).
**How to read the Cost column:** what it would take to make PT10 match PT9, if we chose to.
"Small" = days, "Medium" = a focused work item (1-2 weeks), "Large" = its own project phase.
Entries marked "n/a — deliberate" are places we chose a different behavior on purpose and
believe it is equal or better; they can still be revisited.

## What behaves the same (the short version)

Typing and editing markers inline exactly as text (Standard view's core promise); the `\`
marker popup with type-through — you can type `\q1 ` without ever looking at the popup, Space
commits, Escape leaves your text alone; marker lists filtered to what is valid at your
position (same stylesheet rules as PT9, including your project's custom.sty); close-tag
suggestions for open character styles; footnote/cross-reference markers offered mid-text;
invalid or unknown markers highlighted in red as you type; Enter inside a footnote starts a
new `\fp` segment; Ctrl+Space clears character styling; copy/cut/paste of marker text
(including pasting whole USFM fragments); footnote/cross-reference insertion with PT9's
snippet shape and caret placement; project fonts, colors, and custom styles driving the
display; documents containing tables, figures, and sidebars load, save, and round-trip with
zero data loss.

## Marker menus and typing

| Situation | PT9 | PT10 | Why | Cost to match |
| --- | --- | --- | --- | --- |
| Appearance of the `\` popup | WinForms grid; each row previews the style's own font/color | App-styled list with marker + style name + description; no per-row font/color preview | Different UI toolkit; the popup is drawn by the app shell so it can escape the editor panel's bounds | Small-Medium (custom row rendering) |
| Turning the `\` popup off | Settings checkbox ("Use marker popup") | No setting yet; popup always available (typing through it still works) | Not yet wired | Small |
| Pressing Enter to start a new paragraph | With SmartEnter (default): instantly inserts `\p` (or `\ip` in intro material) — no menu | Always shows a paragraph-style menu with PT9's choice preselected; pressing Enter twice gives the same result as PT9's single Enter | Design chose an explicit style choice at every break; the fast path costs one extra keystroke | Small (add a "direct insert, no menu" mode) |
| Escaping after pressing Enter | (Non-SmartEnter mode) the line break stays, unstyled | The break is cancelled entirely — document unchanged | Cleaner model: no half-made paragraph state exists | n/a — deliberate |
| Inserting the next verse number (Ctrl+K) | Inserts the next verse; refuses at chapter end or if it already exists | Not available | The underlying app command doesn't exist in PT10 yet | Medium (new host command + porting PT9's rules) |
| Choosing `fig` (figure) from the popup | Opens the figure properties dialog | Inserts the figure markup; properties typed as text | Dialogs deferred to a later pass | Medium |
| `id` in the popup list | Offered | Not offered | PT10's insertion machinery doesn't support inserting `id` mid-document (rarely wanted) | Small |
| Old deprecated style names in the popup | Listed (PT9 does not filter them) | Listed (same) | Matched PT9 exactly | n/a — already matches |
| Style dropdown on the toolbar | Full style picker driven by the stylesheet | Existing simpler paragraph-format dropdown | Toolbar style-picker hardening is a recorded follow-up | Medium |

## Footnotes and cross-references

| Situation | PT9 | PT10 | Why | Cost to match |
| --- | --- | --- | --- | --- |
| Clicking a note caller when the notes pane is hidden | Opens the notes pane | Opens a small note editor right where you are (popover) | The PT10 requirements asked for in-place editing; keeps you in context | Small (switch to open-pane behavior) |
| Notes pane visibility | Stays as you left it, per window; never auto-shows | Same by default; an optional setting auto-shows the pane when a chapter has notes and hides it when not (your manual choice always wins until you change chapters) | PT10 requirement; off by default so PT9 habits hold | n/a — matches by default |
| Editing notes in the notes pane | Pane is editable | Pane is navigation-only; editing happens in the popover or inline | Editable pane is a recorded follow-up phase | Large |
| Hovering a note caller | Tooltip shows the note's raw USFM | Tooltip shows the note's formatted content | Judged more useful; trivially changeable | Small |
| Insert-footnote dialog / caller renumbering dialog | Available | Direct insertion with project-correct callers and references; no dialogs | Dialogs deferred | Medium |
| Endnotes (`\fe`) and extended/study notes (`\ef`/`\ex`) | Supported | Load and save losslessly; no insertion affordance | Explicitly out of this project's scope | Small-Medium |

## Document body and rendering

| Situation | PT9 | PT10 | Why | Cost to match |
| --- | --- | --- | --- | --- |
| Tables, figures, sidebars, peripherals in the text | Rendered formatted and editable in place | Shown as a visible, read-only "unsupported structure" block you can select, delete, or move whole; contents preserved perfectly on save | True in-place editing of these structures is its own project (recorded follow-up); until Phase 5 these were invisible, now they are at least visible and safe | Large |
| AutoCorrect (autocorrect.txt) | Applied while typing | Not applied | Recorded follow-up | Medium |
| Spell checking | Integrated | Handled by the wider platform, not the editor | Platform-level feature | (platform roadmap) |
| Show invisible characters mode | Available | Not available | Recorded follow-up | Medium |
| Alt+X (character ↔ Unicode hex toggle) | Available | Not available | Recorded follow-up | Small-Medium |
| Double-clicking a word | Selection trims the trailing space | Browser-standard selection | Cosmetic | Small |
| Alternate/publishing chapter-verse numbers (`\ca`/`\cp`/`\va`/`\vp`) | Editable as text | Displayed correctly; editing those specific number runs as text is deferred | Recorded follow-up | Medium |
| Copying protected resource text | Copy amount capped | No cap | Recorded follow-up | Medium |
| Current verse highlighted in unfocused windows | Yes | Platform-level concern, not yet wired | Host feature | (platform roadmap) |

## Views and app integration

| Situation | PT9 | PT10 | Why | Cost to match |
| --- | --- | --- | --- | --- |
| Default view for advanced users | Standard view is the PT9 editor | New editors in power mode open in Standard view; your saved choice per tab is always respected | Adoption decision approved this project | n/a |
| Zoom | Per-window zoom | Pending a platform-wide zoom decision (plumbing exists) | Host decision pending | Small once decided |
| Study Bible additions projects | Special marker popup behavior (extended note types) | Not implemented | Study Bible support is out of scope | (with Study Bible work) |
| Ruby glossing, annotations-as-such | Supported in PT9 contexts | Out of scope / separate platform systems | Recorded follow-ups | Large / platform |

## Notable places PT10 is better than PT9 (for balance)

- Unknown/invalid markers are flagged in red live while the document stays byte-faithful.
- Copied text is normalized so it never carries invisible non-breaking spaces into other apps
  (in PT9-to-PT9 workflows this was moot; in a clipboard-heavy world it matters).
- Note callers are project-data-driven with separate footnote/cross-reference sequences.
- Formatted note preview on caller hover.
- Lossless round-trip of unsupported structures is verified by an automated corpus, not hope.
