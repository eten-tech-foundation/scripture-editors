/**
 * The rules both settles share (settleShared.utils.ts), tested directly rather than only through
 * their two callers — a shared rule that drifts shows up in the mutating settle, the read-only
 * settle, or the equivalence between them, all far from the rule itself.
 */
import {
  findOnlyNote,
  renderStandardEditorWithCollapsedNote,
  renderStandardEditorWithUnclosedNote,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  $serializeExpandedNoteContent,
  ATOMIC_SENTINEL,
  charOwnChildSignatureText,
  ExpandedNoteContentResult,
} from "./settleShared.utils";
import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
import { $getRoot, LexicalEditor, SerializedLexicalNode } from "lexical";
import { NBSP } from "shared";
import { ViewOptions } from "shared-react";

describe("charOwnChildSignatureText", () => {
  // Rule 1 — a MIXED node: `createChar` prepended a structural NBSP onto real content, and
  // extraction strips exactly that one character back off.
  it.each([
    [`${NBSP}name`, "name"],
    [`${NBSP}a`, "a"],
    // Only the structural NBSP goes; a plain space right behind it is the user's own content.
    [`${NBSP} name`, " name"],
    // "One" means one: a second NBSP is content as far as this rule is concerned.
    [`${NBSP}${NBSP}`, `${NBSP}`],
  ])("strips the leading structural NBSP off mixed content (%j -> %j)", (text, expected) => {
    expect(charOwnChildSignatureText(text)).toBe(expected);
  });

  // Rule 2 — a PURE spacer node: nothing but the one NBSP. Extraction drops the node wholesale,
  // but the signature must still be able to tell "a separator is present" from "none at all", so
  // the character stays.
  it("leaves a pure structural spacer intact", () => {
    expect(charOwnChildSignatureText(NBSP)).toBe(NBSP);
  });

  // Rule 2 before the sentinel splice: the read-only settle hands in a fresh rebuild's text while
  // the placeholder for a preserved node is still FUSED into the same string. Stripping by length
  // alone would misread these as rule 1 the moment content follows the placeholder.
  it.each([
    `${NBSP}${ATOMIC_SENTINEL}`,
    `${NBSP}${ATOMIC_SENTINEL}e`,
    `${NBSP}${ATOMIC_SENTINEL}e${NBSP}f`,
  ])("leaves a spacer still fused with a preserved-node placeholder intact (%j)", (text) => {
    expect(charOwnChildSignatureText(text)).toBe(text);
  });

  it.each([
    // The mutating settle reaches this through `$textNodeFragmentText`, which substitutes a plain
    // space for a pure-whitespace marker separator — that space is NOT a structural NBSP and must
    // survive, or a user's own typed space and a structural separator become indistinguishable.
    " ",
    "",
    "name",
    // An NBSP that is not leading is ordinary content.
    `a${NBSP}b`,
    // A placeholder with no separator in front of it has no separator to strip.
    ATOMIC_SENTINEL,
  ])("returns text with no leading structural NBSP unchanged (%j)", (text) => {
    expect(charOwnChildSignatureText(text)).toBe(text);
  });
});

describe("$serializeExpandedNoteContent", () => {
  const ftContent: MarkerContent[] = [{ type: "char", marker: "ft", content: ["A note"] }];
  /** Content whose own first and last children are display glyphs, not the note's shell. */
  const milestoneContent: MarkerContent[] = [
    { type: "ms", marker: "ts-s" },
    { type: "char", marker: "ft", content: ["A note"] },
    { type: "ms", marker: "ts-e" },
  ];

  function unwrap(
    editor: LexicalEditor,
    content: MarkerContent[],
    foldedCategory?: string,
    options: ViewOptions = viewOptions,
  ): ExpandedNoteContentResult {
    return editor
      .getEditorState()
      .read(() =>
        $serializeExpandedNoteContent(findOnlyNote($getRoot()), content, foldedCategory, options),
      );
  }

  /** A compact tag per serialized child, so shape assertions stay legible. */
  function shapeOf(children: SerializedLexicalNode[] | undefined): string[] {
    return (children ?? []).map((child) => {
      const node = child as { type?: string; marker?: string; markerSyntax?: string };
      if (node.type === "marker") return `marker(${node.marker}|${node.markerSyntax})`;
      return node.marker === undefined ? `${node.type}` : `${node.type}(${node.marker})`;
    });
  }

  /** Every `text` field in a serialized subtree, concatenated in document order. */
  function textOf(node: SerializedLexicalNode): string {
    const { children, text } = node as { children?: SerializedLexicalNode[]; text?: string };
    if (children) return children.map(textOf).join("");
    return text ?? "";
  }

  it("returns the content children with the note's own shell removed", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    const result = unwrap(editor, ftContent);

    expect(result.failure).toBeUndefined();
    // The note's own opening `\f` glyph, editable caller, and closing `\f` glyph are all gone;
    // the content span survives with its OWN glyphs, which are content, not shell.
    expect(shapeOf(result.children)).toEqual(["char(ft)"]);
    expect(
      shapeOf((result.children?.[0] as { children?: SerializedLexicalNode[] }).children),
    ).toEqual(["marker(ft|opening)", "text", "marker(ft|closing)"]);
  });

  it("expands the note even when the view collapses notes", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    // A collapsed serialization builds an ImmutableNoteCallerNode instead of the editable caller
    // text, so recovering content at all proves `noteMode: "expanded"` was forced on.
    expect(viewOptions.noteMode).toBe("collapsed");
    expect(unwrap(editor, ftContent).children).toHaveLength(1);
  });

  it("rebuilds the folded category's display run ahead of the content, in the same pass", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    const result = unwrap(editor, ftContent, "People");

    // Serializing the WHOLE note (rather than the content alone) is what re-derives the `\cat`
    // run, so both settles compare like against like instead of seeing every category-bearing
    // note as permanently changed.
    expect(shapeOf(result.children)).toEqual(["attribute-run", "char(ft)"]);
    expect(textOf(requireChildren(result)[0])).toContain(`${NBSP}People`);
    // Without a fold there is no run at all — the category is derived each pass, never carried.
    expect(shapeOf(unwrap(editor, ftContent).children)).toEqual(["char(ft)"]);
  });

  it("keeps content glyphs at both ends, dropping only the note's own closing glyph", async () => {
    const { editor: collapsed } = await renderStandardEditorWithCollapsedNote();
    const { editor: unclosed } = await renderStandardEditorWithUnclosedNote();

    const closedShape = shapeOf(unwrap(collapsed, milestoneContent).children);

    // The milestone run's own opening and closing glyphs bracket the content and must survive:
    // only the note's shell is shell.
    expect(closedShape).toEqual([
      "ms(ts-s)",
      "attribute-run",
      "char(ft)",
      "ms(ts-e)",
      "attribute-run",
    ]);
    // An unclosed note (its `closed="false"` rides in via the note's unknown attributes) has no
    // closing glyph to drop — and yields exactly the same content either way.
    expect(shapeOf(unwrap(unclosed, milestoneContent).children)).toEqual(closedShape);
  });

  it("reports `empty` when the tokenized content has nothing in it", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    expect(unwrap(editor, [])).toEqual({ failure: "empty" });
  });

  it("reports `caller` when the shell is not the editable expanded one", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    // `markerMode: "visible"` builds a read-only note shell (immutable typed glyphs and a caller
    // button), which this unwrap deliberately refuses rather than mis-slicing.
    expect(unwrap(editor, ftContent, undefined, { ...viewOptions, markerMode: "visible" })).toEqual(
      {
        failure: "caller",
      },
    );
  });

  function requireChildren(result: ExpandedNoteContentResult): SerializedLexicalNode[] {
    if (!result.children) throw new Error(`expected content children, got '${result.failure}'`);
    return result.children;
  }
});
