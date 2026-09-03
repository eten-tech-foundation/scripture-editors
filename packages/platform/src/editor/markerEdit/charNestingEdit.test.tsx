/**
 * Editing the `+` on a char opener changes the span's NESTING, in both directions.
 *
 * The `+` is the only thing in the bytes that says a char span is nested inside another, so a glyph
 * that disagrees with the tree about it is an instruction, not drift. Tier 1's in-place rename
 * compares marker names with the `+` stripped, which reads either edit as "no change" — so both
 * directions have to route to Tier 2 and let the tokenizer say what the bytes now mean.
 */
import { mountStandardViewEditor } from "../settledGetUsj.test-helpers";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isElementNode, $isTextNode, LexicalEditor, LexicalNode } from "lexical";
import { $isMarkerNode } from "shared";

const nestedUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    {
      type: "para",
      marker: "p",
      content: [
        "start ",
        {
          type: "char",
          marker: "wj",
          content: [{ type: "char", marker: "nd", content: ["name"] }],
        },
        " end",
      ],
    },
  ],
};

function $everyNode(node: LexicalNode, out: LexicalNode[] = []): LexicalNode[] {
  out.push(node);
  if ($isElementNode(node)) for (const child of node.getChildren()) $everyNode(child, out);
  return out;
}

/** Rewrite the opener glyph that currently reads `openerText`, leaving the caret in its name. */
async function editOpener(editor: LexicalEditor, openerText: string, typed: string) {
  await act(async () =>
    editor.update(
      () => {
        const glyph = $everyNode($getRoot()).find(
          (node) => $isMarkerNode(node) && node.getTextContent().startsWith(openerText),
        );
        if (!glyph || !$isTextNode(glyph)) throw new Error(`no opener reading ${openerText}`);
        glyph.setTextContent(typed);
        glyph.select(typed.length, typed.length);
      },
      { discrete: true },
    ),
  );
}

/** Move the caret out of the glyph, which is what settles a pending marker edit. */
async function departCaret(editor: LexicalEditor) {
  await act(async () =>
    editor.update(
      () => {
        const text = $everyNode($getRoot()).find((node) => node.getTextContent() === " end");
        if ($isTextNode(text)) text.select(0, 0);
      },
      { discrete: true },
    ),
  );
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  });
}

describe("editing the + on a char opener", () => {
  it("un-nests the span when the user deletes the +", async () => {
    const { ref, lexical } = await mountStandardViewEditor(nestedUsj);

    await editOpener(lexical, "\\+nd", "\\nd");
    await departCaret(lexical);

    // What the remaining bytes mean, per Paratext: a non-`+` char marker closes the span it sat
    // inside, so `\wj` is left unclosed, `\nd` becomes its sibling, and `\wj*` matches nothing.
    // Untidy, but it is what the user typed — the previous behavior kept the nesting and left the
    // file carrying a `+` the glyph no longer had.
    expect(ref.current?.getUsj()?.content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "start ",
          { type: "char", marker: "wj", closed: "false" },
          { type: "char", marker: "nd", content: ["name"] },
          { type: "unmatched", marker: "wj*" },
          " end",
        ],
      },
    ]);
  });

  it("renames a nested span in place when the + is kept", async () => {
    const { ref, lexical } = await mountStandardViewEditor(nestedUsj);

    await editOpener(lexical, "\\+nd", "\\+bd");
    await departCaret(lexical);

    // Glyph and tree still agree about the nesting, so this is an ordinary rename and the span
    // stays where it is — closer mirrored, nothing stranded.
    expect(ref.current?.getUsj()?.content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "start ",
          {
            type: "char",
            marker: "wj",
            content: [{ type: "char", marker: "bd", content: ["name"] }],
          },
          " end",
        ],
      },
    ]);
  });
});
