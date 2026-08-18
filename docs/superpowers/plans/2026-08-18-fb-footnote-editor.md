# Footnote editor: suppress the scaffold paragraph's `\p` prefix

Fix for the field report: the paranext-core footnote-editor popover shows a `\p ` prefix at the
start of the footnote text. The `\p` is not part of the footnote — the popover's document is a
scaffold (one marker-less `para` hosting the note being edited; the save path reads the note ops
alone), and the editor was defaulting the scaffold's missing marker to `\p` and rendering that
marker's visible prefix.

## Mechanism

- Core's `FootnoteEditor` loads `PARAGRAPH_USJ` (`[{ type: "para" }]`) as `defaultUsj` and
  materializes the note via `applyUpdate`.
- The platform adaptor's `createPara` defaults a missing marker to `\p` and, per marker mode,
  builds a visible prefix: editable mode gets a `MarkerNode` glyph + NBSP separator (both real
  text bytes); visible/gutter modes get an immutable typed-text node.
- Core had a workaround constant (`EDITABLE_WRAPPER_PARA_PREFIX_RETAIN = 3`) so the note op
  inserted AFTER the prefix bytes, plus several stray-caret guards whose "parking spot" was the
  glyph itself.

## Chosen shape

`ViewOptions.showParaMarkerPrefixes?: boolean` (default on) — an adaptor/engine-level opt-out, NOT
CSS hiding. Under the invariants (docs/superpowers/specs/2026-08-11-standard-view-invariants.md,
esp. "displayed bytes are the document"), hiding the glyph visually would leave editable-but-
invisible bytes the caret could traverse; opting out at construction means the bytes never exist.

The option is honored by every para-prefix producer (invariant III: one lifecycle per engine-owned
display kind — construct and heal must agree):

1. **Adaptor construct** — `createPara` (usj-editor.adaptor.ts) skips both prefix shapes.
2. **Engine heal** — `$paraMarkerDeletionTransform` (markerEditDeletion.utils.ts) stands down
   entirely: a prefix-less paragraph is the CANONICAL shape under the option, not evidence the
   user deleted the marker. Without this, the first `applyUpdate`/edit that dirtied the scaffold
   para re-injected a fresh `\p` prefix (reproduced red in
   packages/platform/src/editor/adaptors/popover-para-prefix.test.tsx).
3. **Retag entry point** — `$applyParaMarker` falls through to the bare marker-state change
   (`$syncParaMarkerGlyph` never injects a missing prefix).
4. **Enter-menu split** — `$splitParagraphWithMarker` gains an optional `viewOptions` param and
   sets marker state without injecting; both call sites thread it.

Core side: `FootnoteEditor` passes `showParaMarkerPrefixes: false` in its options memo; the retain
constant and its editable-mode conditional are deleted (`applyUpdate([noteOp])` at OT index 0);
the DOM stray-caret guards are unchanged (a DOM caret can still land outside `span.note`).

## Tests

- SE `popover-para-prefix.test.tsx` (started by the fb-footnote-editor predecessor agent,
  extended): default-on prefix pinned; no prefix nodes under the option (editable + gutter);
  popover text starts with the note's own `\f`; no text node outside the note for the caret to
  land in (subsumes arrow-key traversal — there are no hidden bytes to traverse into);
  applyUpdate load path + later edits stay prefix-less (the heal-standdown red-green).
- SE `note-ops-popover-roundtrip.test.tsx` now runs under the option (it mirrors the options
  FootnoteEditor produces) — ops→apply→ops and USJ fixed points prove save bytes are unchanged.
- Core `footnote-editor.popover-init.test.tsx`: wrapper para's children are `['note']` in editable
  AND visible modes; rendered text starts with `\f` and contains no `\p`; save-path ops
  byte-identical to the loaded op plus the typed edit (via a new harness `onChange` hook).
- Core `footnote-editor.paste-note.test.tsx`: the stray-caret parking spot moved from the deleted
  `\p` glyph to the wrapper para's start (element point offset 0).

## Deviations / findings along the way

- **Baseline repair (separate core commit):** core's footnote fixtures' note-content chars lacked
  the `closed: "false"` ParatextData stamps on implicitly-closed spans, so once the linked editor
  learned that a note-content marker ENDS the span it is written inside (char-stack work), the
  palette-commit suite observed the explicit-close close-and-reopen shape (`[fr, ft, fp, ft]`).
  Lifelike fixture data restores the pinned `[fr, ft, fp]`. This failure predated this fix and
  was not caused by it.
- **Shared yalc store race:** concurrent worktree agents `yalc push` the same package version, and
  a push propagates into every linked repo — a mid-task push from another worktree replaced this
  pair's linked editor with one lacking the option (types said yes, runtime said no). Re-push +
  re-link recovered; verify `dist/index.js` (not just `index.d.ts`) carries new code after
  linking.
- `$retagParagraph`'s caret parking (`$selectParaContentStart`, fixed child index 2) assumes the
  prefix layout; under the option the paragraph-palette retag path is unreachable from the
  popover (its guards route the caret into the note), so it was left alone.
