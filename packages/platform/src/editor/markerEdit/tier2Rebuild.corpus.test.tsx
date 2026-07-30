/**
 * Corpus losslessness property test — Phase 1's cross-cutting safety net.
 *
 * Every Phase-1 task (char-span attribute display, milestone re-tokenization, recoverability-
 * based sentinel classification, and the fixed-point signature that folds in char
 * `unknownAttributes` and milestone node state) exists to keep one invariant true: display bytes
 * built from real project data re-tokenize back to themselves. This test pins that invariant
 * directly, over real corpus data, instead of trusting the unit tests in `tier2Rebuild.utils.test.tsx`
 * to have anticipated every shape.
 *
 * For every paragraph in the 2SA corpus (`libs/test-data/src/data/2sa.usj.ts`), loaded into a
 * headless editor in Standard view (`editable` marker mode, matching how the real app displays
 * text a user can type into), an UNEDITED `$rebuildParas` request must refuse as a fixed point:
 * return `false`, and leave the editor -> USJ round trip byte-identical. A paragraph that fails
 * this is either a genuine Phase 1 regression (reported, not silently skipped) or a pre-existing
 * non-fixed-point the nesting arc already documents elsewhere (skip-listed below with the exact
 * mechanism named, not a task number).
 *
 * NOTE: the pre-generated `2sa.lexical.*.ts` fixture files (also under `libs/test-data/src/data`)
 * are stale — do not compare against them. This test builds editor state fresh from `usj2Sa` via
 * the same USJ->Lexical adaptor path `generate-2sa-lexical-states.test.ts` and
 * `tier2Rebuild.utils.test.tsx` use.
 */
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { $getRoot, $isElementNode, LexicalNode } from "lexical";
import {
  $isNoteNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  ParaNode,
  TypedMarkNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes } from "shared-react";
import { usj2Sa } from "test-data";

const viewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!viewOptions) throw new Error("Standard view options are required for these tests.");
const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Load `usj` into a fresh headless editor in standard view; mirrors
 * `tier2Rebuild.utils.test.tsx`'s `loadEditor`. */
function loadEditor(usj: typeof usj2Sa) {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

/**
 * Depth-first collection of every ParaNode in the tree, in document order — including paragraphs
 * nested inside a sidebar (an opaque block, represented as an UnknownNode), which is deliberate:
 * the property under test is "every paragraph of real corpus data", and `$buildParaFragment`'s own
 * opaque-block guard (walking parents for an UnknownNode ancestor) is itself part of what this
 * test pins — a sidebar paragraph must refuse untouched exactly like any other guarded paragraph.
 *
 * Does NOT descend into a NoteNode's content: note content is a separate re-tokenization scope
 * (`$rebuildNoteContent`, not `$rebuildParas`), and a ParaNode can never legitimately appear
 * there — matching the architecture rather than assuming today's corpus never nests one.
 */
function $collectParas(root: ReturnType<typeof $getRoot>): ParaNode[] {
  const out: ParaNode[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isParaNode(node)) out.push(node);
    if ($isNoteNode(node)) return;
    if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  root.getChildren().forEach(visit);
  return out;
}

/** A short, stable, human-readable identity for a paragraph in failure/skip messages: its
 * 0-based document position, its marker, and a snippet of its own text content. */
function paraLabel(index: number, para: ParaNode): string {
  const snippet = para.getTextContent().replace(/\s+/g, " ").trim().slice(0, 70);
  return `#${index} \\${para.getMarker()} "${snippet}"`;
}

/**
 * Paragraphs excluded from the property with a NAMED mechanism — never a blind skip. Each entry
 * matches by a substring of the paragraph's own text content (stable across a corpus edit; an
 * index would shift) and states exactly why `$rebuildParas` is not expected to refuse this
 * paragraph as a fixed point.
 */
// `isImplicitlyClosedCharMarker` (packages/platform/src/editor/adaptors/usj-editor.adaptor.ts)
// treats every footnote/cross-reference-family character marker (fr, ft, xo, xt, ...) as ALWAYS
// closer-less and skips its closing glyph, even when the source USJ explicitly closed the span
// (no `closed: "false"`). The corpus paragraph matched below has an explicitly-closed `\xt` span,
// but the adaptor still renders it with no closing glyph, so its display bytes genuinely lack a
// `\xt*` byte to re-tokenize — the rebuild correctly (and honestly) re-derives the span as
// implicitly closed, swallowing the paragraph's remaining text into it. This is the pre-existing,
// documented `\xt` NEST divergence — it predates the attribute-display effort (introduced by
// commit 116a6d40, "honesty rule — closer-less char spans record closed=false", before char-span
// attribute display began) and is tracked as an open "re-evaluate" item in both
// docs/superpowers/specs/2026-07-24-nesting-alignment-design.md ("Tracked residuals") and
// docs/superpowers/specs/2026-07-27-attribute-display-and-nesting-arc-status.md ("Deferred/known
// items"); it is not resolved by char-span attribute display.
const SKIP_LIST: { contains: string; reason: string }[] = [
  {
    contains: "This paragraph has a properly filled out xt marker",
    reason:
      "pre-existing \\xt NEST divergence — isImplicitlyClosedCharMarker forces the closer-less " +
      "display shape for every footnote/cross-reference-family marker regardless of whether the " +
      "source actually closed it explicitly (see nesting-alignment-design.md and " +
      "attribute-display-and-nesting-arc-status.md, both pre-dating this effort)",
  },
];

function skipReason(para: ParaNode): string | undefined {
  const text = para.getTextContent();
  return SKIP_LIST.find((entry) => text.includes(entry.contains))?.reason;
}

describe("$rebuildParas — 2SA corpus losslessness (Phase 1 safety net)", () => {
  it("refuses an unedited rebuild as a fixed point for every paragraph in the corpus", () => {
    const editor = loadEditor(usj2Sa);
    const usjBefore = deserializeSerializedEditorState(
      editor.getEditorState().toJSON(),
      viewOptions,
    );

    const failures: string[] = [];
    const skipped: string[] = [];
    let paraCount = 0;
    editor.update(
      () => {
        const paras = $collectParas($getRoot());
        paraCount = paras.length;
        paras.forEach((para, index) => {
          const label = paraLabel(index, para);
          const reason = skipReason(para);
          if (reason !== undefined) {
            skipped.push(`${label} — ${reason}`);
            return;
          }
          const changed = $rebuildParas([para], context);
          if (changed) failures.push(label);
        });
      },
      { discrete: true },
    );

    // Sanity check that the corpus actually loaded and was walked, not silently empty.
    expect(paraCount).toBeGreaterThan(100);

    // Every failing paragraph is either a real Phase-1 bug (never expected here) or belongs in
    // SKIP_LIST with a named mechanism — see the report for the full skip-list accounting.
    expect(failures).toEqual([]);

    // Whole-document round trip: independent of the per-paragraph boolean, confirms no content
    // or structural change leaked through anywhere in the corpus.
    const usjAfter = deserializeSerializedEditorState(
      editor.getEditorState().toJSON(),
      viewOptions,
    );
    expect(usjAfter).toEqual(usjBefore);

    // Corpus coverage + the skip-list, visible in test output without failing the run.
    // eslint-disable-next-line no-console -- deliberate: surfaces corpus coverage in CI/local output
    console.log(
      `tier2Rebuild.corpus: checked ${paraCount} paragraph(s), ${skipped.length} skip-listed` +
        (skipped.length > 0 ? `:\n${skipped.join("\n")}` : "."),
    );
  });
});
