# Standard View Phase 0 — Round-Trip Findings

Corpus: `packages/platform/src/editor/adaptors/corpus/`. Each entry below is a
round-trip failure discovered by the harness and NOT fixed in its discovery
task, with enough detail to plan the fix. Format per finding:

## <fixture name> [<view mode>]

- **Symptom:** (assertion diff summary — what property/content changed or was lost)
- **Suspected site:** (adaptor function, file:line)
- **Severity:** data-loss | data-change | cosmetic
- **Disposition:** fix-in-phase-0 | phase-2-engine | needs-node-type (spec §7 opaque blocks)

---

Known scope limitation: normalized-USFM byte equality (spec §10) is not
assertable in this repo (no TS USFM serializer); USJ deep-equality is the
Phase 0 proxy. Byte-level verification happens host-side in a later phase.

## Task 3 baseline run (2026-07-01)

All 3 baseline fixtures × 4 view modes (12/12) passed with no adaptor changes
required — no findings entries needed below the template above.

One fixture-authoring issue was found and corrected (not an adaptor bug): the
"baseline: footnote and cross-reference" fixture originally split a
`<para>`'s inline content across source lines, placing a newline+indentation
text node between `and after.` and the second `<verse>` marker. `usxStringToUsj`
preserves inter-element whitespace verbatim as USJ text content (it only
discards whitespace-only text between block-level siblings), so the
multi-line template literal would have produced a USJ content string
containing a literal `\n  ` — not something a real single-line-authored USX
document would produce. Fixed by joining that `<para>`'s content onto one
source line in `corpus-data.ts` (a single space now separates the two
sentences, matching normal USX authoring). `usxStringToUsj` was not modified.

## Task 4 run (2026-07-01)

Added six fixtures covering verse bridges/segments, ca/cp/va/vp
alternate/publishing numbers, `ref` cross-references, `optbreak`,
milestones (`ms style="ts-s"`/`"ts-e"`), and RTL (Hebrew) text. All
9 fixtures × 4 view modes (36/36) passed with no adaptor changes
required — no findings entries needed below the template above.

The "verse bridges and segments" fixture (the one Step 2 required to pass,
per the Task 2 `parseNumberFromMarkerText` fix) passed in all 4 modes on the
first run, confirming the Task 2 fix already covers this path.

Passes were independently verified (not just `toEqual` succeeding
vacuously): a scratch test dumped the intermediate USJ and the
round-tripped USJ for the ca/cp/va/vp, ref, optbreak, and milestone
fixtures and confirmed `altnumber`, `pubnumber`, `loc`, and the `ms`
markers are genuinely present in both and structurally identical, not
both-sides-empty.

## Task 5 run (2026-07-01) — opaque-block constructs

Added five fixtures targeting the constructs the design spec explicitly
predicts may lose data because they lack dedicated USJ node types: a table
(`<table>`/`<row>`/`<cell>`), a figure (`<figure>` with USFM 3 `file`/`size`/
`ref` attributes), a sidebar (`<sidebar style="esb">` with a `category`
attribute and nested `<para>`), a `<periph>` element (with `id`/`alt`
attributes and a nested `<para>`, no `<chapter>` in the book), and a note
with `closed="false"` (an unterminated footnote).

**All 5 fixtures × 4 view modes (20/20) passed with no adaptor changes
required.** Combined with the prior 9 fixtures, the harness total is
56/56. No triage was needed: no fixture was deleted, no assertion was
loosened, no `skipModes` entries were added, and no code outside
`corpus-data.ts` was touched.

This is a genuinely surprising result given the task brief's framing
("failures are expected here"). The reason none of these constructs lose
data in this codebase: `table`, `figure`, `sidebar`, and `periph` have no
dedicated USJ node type in `libs/shared/src/nodes/usj/`, so they fall
through the `default` branch of `recurseNodes` in both
`usj-editor.adaptor.ts` and `editor-usj.adaptor.ts` into the generic
`UnknownNode` path (`createUnknown`/`createUnknownMarker`). That path is a
fully generic, symmetric pass-through: `createUnknown` captures `type` as
`tag`, `marker`, and *every other USJ property* (via
`getUnknownAttributes(markerObject, UNKNOWN_MARKER_OBJECT_PROPS)`, where
`UNKNOWN_MARKER_OBJECT_PROPS = ["type", "marker", "content"]`) into
`unknownAttributes`, and recurses into `content` using the same
`recurseNodes` dispatcher — so nested known constructs (e.g. the `<para>`
inside `<sidebar>`/`<periph>`, the `<char>` markers inside the unclosed
`<note>`) are still built as their proper node types, not swallowed as
opaque blobs. `createUnknownMarker` reverses this exactly, spreading
`unknownAttributes` back onto the output `MarkerObject`. Because
`table:row`/`table:cell` (renamed by `usxStringToUsj` itself, see
`packages/utilities/src/converters/usj/usx-to-usj.ts:49`), `figure`,
`sidebar`, and `periph` are all unrecognized `type` strings to the editor
adaptors, and `align`, `category`, `file`, `size`, `ref`, `id`, `alt`, and
`closed` are all unrecognized *properties* to `getUnknownAttributes`
(none of them appear in any node-specific `*_MARKER_OBJECT_PROPS` list),
every one of these values round-trips through `unknownAttributes`
generically, the same mechanism that already carried `altnumber`/
`pubnumber` losslessly in Task 4.

`closed="false"` on the note fixture is a related but separate case: USX
`<note>` maps directly to `NoteNode` (a *known* type, not `UnknownNode`),
but `NOTE_MARKER_OBJECT_PROPS` also doesn't list `closed`, so it takes the
same generic `unknownAttributes` path via `createNote`/`createNoteMarker`
rather than the `UnknownNode` path. Also note `usxStringToUsj` itself
special-cases `closed`: it explicitly does *not* strip it (unlike `vid`
and `status`, which it drops), per the comment at
`usx-to-usj.ts:63` ("Not dropping `attribs.closed` for backwards
compatibility") — so the construct was never at risk of being lost
upstream of the editor adaptors either.

Passes were independently verified (not just `toEqual` succeeding
vacuously): a scratch test round-tripped all 5 new fixtures in `standard`
mode and dumped `JSON.stringify` of both the intermediate USJ
(`usxStringToUsj` output) and the round-tripped USJ (serialize →
deserialize) side by side. Confirmed via console output that both sides
are identical and non-trivial, not both-empty — in particular:
- table: both sides contain the full 2×2 grid as nested
  `{"type":"table","content":[{"type":"table:row","marker":"tr","content":[{"type":"table:cell","marker":"th1","align":"start","content":["Day"]}, ...]}]}`.
- figure: both sides contain
  `{"type":"figure","marker":"fig","file":"cn01617.jpg","size":"span","ref":"1:31","content":["At once they left their nets."]}`.
- sidebar: both sides contain
  `{"type":"sidebar","marker":"esb","category":"History","content":[{"type":"para","marker":"p","content":["Sidebar paragraph content."]}]}`
  — the nested `<para>` is a real `para` node, not flattened into text.
- periph: both sides contain
  `{"type":"periph","id":"title","alt":"Title Page","content":[{"type":"para","marker":"mt1","content":["The Title"]}]}`.
- unclosed note: both sides contain
  `{"type":"note","marker":"f","caller":"+","closed":"false","content":[...]}`.

No findings entries were added below (no failures occurred). No fixture
was deleted, no `toEqual` was loosened, and no `skipModes` was added
without a corresponding finding (none were added at all — there was
nothing to skip).

## Acceptance criterion status (spec §7)

Table / figure / sidebar / periph / unclosed-note round-trip in `standard`
mode: 5 of 5 lossless as of this task. No failing constructs; no
dispositions to list — the generic `UnknownNode`/`unknownAttributes`
pass-through mechanism (see "Task 5 run" above) already makes all five
constructs lossless in `standard` mode without requiring dedicated node
types.

## MarkerNode lost its `marker` DOM class (pre-existing, commit 5ef9976)

- **Symptom:** CSS keyed on `.marker` no longer reaches editable-mode MarkerNodes; Task 8's rules target `.opening/.closing/.selfClosing` instead as a workaround.
- **Suspected site:** libs/shared/src/nodes/features/MarkerNode.ts createDOM (class list changed in #359).
- **Severity:** cosmetic
- **Disposition:** phase-2-engine — decide whether to restore the `marker` class on MarkerNode (and audit #359's motivation) or standardize on the syntax classes.
