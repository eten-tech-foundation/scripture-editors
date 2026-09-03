/**
 * Differential settle suite: for a document with PENDING marker edits, the read-only settled read
 * (the virtual mirror, `$settledUsj`) must equal commit-then-settle
 * (`COMMIT_PENDING_MARKERS_COMMAND` followed by the reverse adaptor) BYTE-FOR-BYTE. The two are
 * separate implementations of one rule set over two representations — serialized JSON versus live
 * Lexical nodes — so every shape here is a place they could drift apart.
 *
 * `settledGetUsj.test.tsx` pins the same invariant through the full `<Editor>` mount and its
 * public `getUsj()`/`commitPendingMarkerEdits()` surface, in Standard view only. This suite runs
 * one level down (headless mount, `$settledUsj` against the commit command) so it can cross
 * starting documents × typed pending edits ACROSS VIEW MODES — including unformatted view, whose
 * `~`/NBSP content mapping gives the two settle halves a byte-level seam of their own.
 *
 * Adding a shape is one table entry: a starting USJ document, a view, and an `$edit` that must
 * leave the document PENDING (asserted, so a shape that resolves inline fails loudly instead of
 * passing vacuously).
 */
import { $pendGlyphEdit } from "./markerEdit.test-helpers";
import { COMMIT_PENDING_MARKERS_COMMAND, MarkerEditPlugin } from "./MarkerEditPlugin";
import { Tier2Context } from "./tier2Rebuild.utils";
import { $settledUsj } from "./virtualSettle.utils";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isTextNode, LexicalEditor, TextNode } from "lexical";
import {
  $chapterGlyphTextNode,
  $isChapterNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
} from "shared";
import {
  CharNodePlugin,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
} from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom implements no layout, so `Range.prototype.getBoundingClientRect` is absent — same shim as
// the other settle suites (a settle can place the caret and trip Lexical's post-commit
// scroll-into-view).
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!standardViewOptions) throw new Error("Standard view options are required.");
const unformattedViewOptions = getViewOptions(UNFORMATTED_VIEW_MODE);
if (!unformattedViewOptions) throw new Error("Unformatted view options are required.");

/** The view configurations a shape can mount under, by table key. */
const VIEWS: { [key: string]: ViewOptions } = {
  standard: standardViewOptions,
  "standard-expanded": { ...standardViewOptions, noteMode: "expanded" },
  unformatted: unformattedViewOptions,
};

/** One differential shape: a starting document, a view, and an edit that must leave it pending. */
interface DifferentialShape {
  readonly name: string;
  readonly view: keyof typeof VIEWS;
  readonly usj: Usj;
  /** Mutating: run inside `editor.update()`. Must leave at least one pend open. */
  readonly $edit: () => void;
  /**
   * Asserts the settled output shows the scenario the row's name claims (a split happened, an
   * attribute was promoted, …). Without it, a settle that REFUSES on both halves still satisfies
   * mirror ≡ live — genuine agreement, but not the scenario the row was written for.
   */
  readonly expectSettled: (settled: Usj) => void;
}

/** JSON.stringify shorthand for content probes. */
function bytes(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Load `usj` through the forward adaptor under `viewOptions` and mount the same three
 * content-owning plugins the app's editor stack registers (`Editor.tsx`): the char display-run
 * sync, the marker-edit engine, and the whitespace machinery. The tree under test is
 * byte-identical to what the app loads.
 */
async function differentialEnvironment(usj: Usj, viewOptions: ViewOptions) {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
    </>,
  );
}

/** The current editor state as USJ through the reverse adaptor — the live settle's output. */
function usjOf(editor: LexicalEditor, viewOptions: ViewOptions): Usj | undefined {
  initializeDeserialize(undefined);
  return editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
}

/** The first text node whose content includes `needle`. */
function $textContaining(needle: string): TextNode {
  const node = $getRoot()
    .getAllTextNodes()
    .find((text) => text.getTextContent().includes(needle));
  if (!node) throw new Error(`no text node containing ${JSON.stringify(needle)}`);
  return node;
}

/** The n-th ParaNode's own leading glyph. */
function $paraGlyph(index: number): TextNode {
  const para = $getRoot().getChildren().filter($isParaNode)[index];
  if (!para) throw new Error(`expected a ParaNode at ${index}`);
  const glyph = para.getFirstChild();
  if (!glyph || !$isTextNode(glyph)) throw new Error("expected a prefix glyph");
  return glyph;
}

/**
 * Type `literal` over the text containing `needle`, collapsed caret anchored at offset 0 —
 * anchoring in THIS node before the settle transforms run is what keeps a syntactically COMPLETE
 * literal pending instead of resolving inline in the same commit (the same anchoring note as
 * settledGetUsj.test.tsx's "marker literal typed mid-paragraph").
 */
function $typeLiteralPending(needle: string, literal: string): void {
  const text = $textContaining(needle);
  text.setTextContent(literal);
  text.select(0, 0);
}

/** A doc with two `\p` paragraphs, the first carrying `first` (defaults to a verse + body). */
const twoParaUsj = (first: MarkerObject["content"]): Usj => ({
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: first },
    { type: "para", marker: "p", content: ["depart here"] },
  ],
});

/** `twoParaUsj` whose first paragraph holds an expanded note wrapping `noteContent`. */
const noteUsj = (noteContent: MarkerObject["content"]): Usj =>
  twoParaUsj([
    "before ",
    { type: "note", marker: "f", caller: "+", content: noteContent },
    " after",
  ]);

const differentialShapes: DifferentialShape[] = [
  {
    // The harness canary: the caret-less glyph-rename pend that every existing settle suite
    // proves settles identically on both halves — if this row fails, suspect the mount, not the
    // mirror.
    name: "paragraph glyph renamed (caret-less pend)",
    expectSettled: (settled) => {
      expect((settled.content?.[2] as MarkerObject).marker).toBe("q1");
    },
    view: "standard",
    usj: twoParaUsj(["plain body"]),
    $edit: () => $pendGlyphEdit($paraGlyph(0), "\\q1"),
  },
  {
    // A typed `\p `-style BLOCK literal mid-paragraph: settling SPLITS the paragraph, so the
    // mirror's re-tokenized fragment must produce the same two-paragraph structure the live
    // splice builds from nodes.
    name: "typed \\p block literal splits the paragraph",
    expectSettled: (settled) => {
      expect(settled.content).toHaveLength(5);
      expect(bytes(settled.content?.[3])).toContain('"tail"');
    },
    view: "standard",
    usj: twoParaUsj(["plain body"]),
    $edit: () => $typeLiteralPending("plain body", "plain \\p tail"),
  },
  {
    name: "typed \\q1 block literal splits the paragraph",
    expectSettled: (settled) => {
      expect((settled.content?.[3] as MarkerObject).marker).toBe("q1");
      expect(bytes(settled.content?.[3])).toContain('"tail"');
    },
    view: "standard",
    usj: twoParaUsj(["plain body"]),
    $edit: () => $typeLiteralPending("plain body", "plain \\q1 tail"),
  },
  {
    // The chapter's own NUMBER: `\c 1` retyped to `\c 2`. The number lives in node state, so it
    // only reaches the document through a chapter-scope re-tokenization — both halves must land
    // the same new number.
    name: "chapter number digit edited in the \\c glyph",
    expectSettled: (settled) => {
      expect((settled.content?.[1] as MarkerObject).number).toBe("2");
    },
    view: "standard",
    usj: twoParaUsj(["plain body"]),
    $edit: () => {
      const chapter = $getRoot().getChildren().find($isChapterNode);
      if (!chapter) throw new Error("expected a ChapterNode");
      const glyph = $chapterGlyphTextNode(chapter);
      if (!glyph) throw new Error("expected the chapter glyph text");
      $pendGlyphEdit(glyph, "\\c 2");
    },
  },
  {
    // A BARE default attribute typed at a closed `\w` span's content end: the settle must promote
    // `|grace` to the marker's declared default attribute (`lemma`) on BOTH halves — the
    // attribute-promotion rule is applied by re-tokenization, once per representation.
    name: "bare default attribute typed into a closed \\w span",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain('"lemma":"grace"');
    },
    view: "standard",
    usj: twoParaUsj(["start ", { type: "char", marker: "w", content: ["gracious"] }, " end"]),
    $edit: () => {
      const text = $textContaining("gracious");
      text.setTextContent(`${text.getTextContent()}|grace`);
    },
  },
  {
    // A NAMED attribute half of the same rule: `|x-custom="thing"` must settle to real attribute
    // state identically on both halves.
    name: "named attribute typed into a closed \\nd span",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain('"x-custom":"thing"');
    },
    view: "standard",
    usj: twoParaUsj(["start ", { type: "char", marker: "nd", content: ["name"] }, " end"]),
    $edit: () => {
      const text = $textContaining("name");
      text.setTextContent(` name|x-custom="thing"`);
    },
  },
  {
    // A typed char literal INSIDE an expanded note's content: the note-content rebuild
    // (`$rebuildNoteContent`) and its serialized mirror (`$settledNoteContent`) must tokenize the
    // typed span identically, inside the note's separate re-tokenization scope.
    name: "char literal typed inside an expanded note's content",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain('"marker":"bd"');
    },
    view: "standard-expanded",
    usj: noteUsj([{ type: "char", marker: "ft", content: ["note body"], closed: "false" }]),
    $edit: () => $typeLiteralPending("note body", "note \\bd body\\bd* tail"),
  },
  {
    // The note's own opening glyph renamed while the note also holds content — the glyph rename
    // patch and the content rebuild must compose the same way in both halves.
    name: "expanded note's opening glyph renamed",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain('"marker":"fe"');
    },
    view: "standard-expanded",
    usj: noteUsj([{ type: "char", marker: "ft", content: ["note body"], closed: "false" }]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const note = para.getChildren().find($isNoteNode);
      if (!note) throw new Error("expected a NoteNode");
      const glyph = note.getFirstChild();
      if (!glyph || !$isTextNode(glyph)) throw new Error("expected the note's opening glyph");
      $pendGlyphEdit(glyph, "\\fe");
    },
  },
  {
    // Unformatted view shows a data NBSP as the byte itself; the settle's fragment layer must
    // spell it the tokenizer's way (`~`) on both halves, or one half flattens it to a space
    // while the other keeps it.
    name: "unformatted: typed literal settles beside existing data NBSP content",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain(`one${NBSP}two`);
      expect(bytes(settled)).toContain('"marker":"wj"');
    },
    view: "unformatted",
    usj: twoParaUsj([`one${NBSP}two tail`]),
    $edit: () => $typeLiteralPending("tail", `one${NBSP}two \\wj glow\\wj* end`),
  },
  {
    // A typed `~` — the tokenizer's NBSP input spelling — must settle into a data NBSP
    // identically on both halves.
    name: "unformatted: typed ~ becomes a data NBSP",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain(`one${NBSP}two`);
      expect(bytes(settled)).not.toContain("one~two");
      expect(bytes(settled)).toContain('"marker":"nd"');
    },
    view: "unformatted",
    usj: twoParaUsj(["plain body"]),
    $edit: () => $typeLiteralPending("plain body", "one~two \\nd Lord\\nd* end"),
  },
  {
    // The glyph-rename pend in unformatted view: same canary as the first row, on the view whose
    // whitespace mapping differs — the paragraph's re-tokenized content must not pick up (or
    // lose) NBSPs on either half.
    name: "unformatted: paragraph glyph renamed beside NBSP content",
    expectSettled: (settled) => {
      expect((settled.content?.[2] as MarkerObject).marker).toBe("q1");
      expect(bytes(settled)).toContain(`one${NBSP}two`);
    },
    view: "unformatted",
    usj: twoParaUsj([`one${NBSP}two`]),
    $edit: () => $pendGlyphEdit($paraGlyph(0), "\\q1"),
  },
  {
    // A nested (`\+`) char literal typed inside a char span: nesting resolution runs inside the
    // paragraph scope, and both halves must produce the same nested-span structure.
    name: "nested char literal typed inside a char span",
    expectSettled: (settled) => {
      expect(bytes(settled)).toContain('"marker":"wj"');
      expect(bytes(settled)).toContain('"marker":"nd"');
    },
    view: "standard",
    usj: twoParaUsj(["start ", { type: "char", marker: "wj", content: ["li ght"] }, " end"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const char = para.getChildren().find($isCharNode);
      if (!char) throw new Error("expected a CharNode");
      const text = char
        .getChildren()
        .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
      if (!text) throw new Error("expected the span's content text");
      text.setTextContent(`${NBSP}li \\+nd g\\+nd*ht`);
      text.select(0, 0);
    },
  },
];

/**
 * Shapes KNOWN to diverge (mirror ≠ live), with the mechanism named — pinned by skipping the
 * equality assertion, never by weakening it. Keyed by shape name; an entry is a specification of
 * a defect, and the fix deletes it.
 */
const KNOWN_DIVERGENCES: { [shapeName: string]: string } = {};

describe("differential settle — virtual mirror equals commit-then-read", () => {
  for (const { name, view, usj, $edit, expectSettled } of differentialShapes) {
    const divergence = KNOWN_DIVERGENCES[name];
    const run = divergence ? it.skip : it;
    run(`${name} [${view}]${divergence ? ` (known divergence: ${divergence})` : ""}`, async () => {
      const viewOptions = VIEWS[view];
      const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };
      const { editor } = await differentialEnvironment(usj, viewOptions);

      // Mirror read INSIDE the same act as the edit: a caret-held pend only survives up to this
      // act's own effect flush (the same timing note as settledGetUsj.test.tsx), so reading any
      // later can silently read the already-settled state back at itself.
      let mirror: Usj | undefined;
      await act(async () => {
        editor.update($edit);
        await Promise.resolve();
        await Promise.resolve();

        // Anti-vacuity: the edit must genuinely be PENDING, or the mirror never runs a settle.
        const pended = getPendedDisplayOwners(editor);
        expect(pended?.size).toBeGreaterThan(0);

        const serialized = editor.getEditorState().toJSON();
        mirror = editor
          .getEditorState()
          .read(() => $settledUsj(serialized, pended ?? new Set(), context));
      });
      expect(mirror).toBeDefined();

      // The live settle: commit everything pending, then read through the reverse adaptor.
      await act(async () => {
        editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
      });
      // The commit must have consumed the pend — otherwise the "live" read below is not settled
      // output and agreement with the mirror proves nothing.
      expect(getPendedDisplayOwners(editor)?.size ?? 0).toBe(0);
      const live = usjOf(editor, viewOptions);

      // Deep equality first for a readable diff; then the serialized bytes, because the invariant
      // is BYTE-for-byte (deep equality alone is blind to JSON property order).
      expect(mirror).toEqual(live);
      expect(JSON.stringify(mirror)).toBe(JSON.stringify(live));

      // The scenario probe: the agreed-on output must actually SHOW the row's named outcome.
      if (!live) throw new Error("live settled USJ is undefined");
      expectSettled(live);
    });
  }
});
