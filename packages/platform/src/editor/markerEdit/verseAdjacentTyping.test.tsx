/**
 * Typing next to a verse number: the caret must end up immediately AFTER the typed character.
 *
 * The verse glyph renders as `\v 1 ` — number plus its display separator space — and the caret
 * can legally sit anywhere inside it. Typing a `\` there (the marker-palette trigger: its
 * literal lands as text) puts the glyph in a shape whose tail has to be re-extracted into
 * content. Two caret hazards, one per insertion point:
 *
 * - at the glyph END (`\v 1 \`): the existing Tier-1 extraction handles it and the caret is
 *   placed after the extracted character — pinned here so it stays that way.
 * - between the number and the separator space (`\v 1\ `): the verse regex could not express
 *   a rest that begins WITHOUT a separator, so the node fell through to a whole-paragraph
 *   Tier-2 rebuild whose caret restore dropped the caret at the PARAGRAPH START — three words
 *   away from the typed character. Tier 1 must extract this shape too: same resulting tree,
 *   caret kept at the character the user just typed.
 *
 * The other half of this repro — a space fabricated next to the typed character by the
 * text-spacing transforms — belongs to the whitespace track; these tests deliberately mount
 * only the marker-edit engine so the caret behavior is observed without that interference, and
 * make no assertion about spacing around the extracted character.
 */
import { $appendVersePara, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, LexicalEditor } from "lexical";
import { $isMarkerNode, $isParaNode, getVisibleOpenMarkerText, VerseNode } from "shared";

/** Types `text` at `offset` inside the verse glyph and returns the post-commit caret. */
async function typeInVerseGlyph(
  editor: LexicalEditor,
  verse: VerseNode,
  offset: number | "end",
  text: string,
): Promise<{ nodeText: string; offset: number; collapsed: boolean }> {
  await act(async () =>
    editor.update(() => {
      const at = offset === "end" ? verse.getTextContentSize() : offset;
      verse.select(at, at);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    }),
  );
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error("no range selection after typing");
    return {
      nodeText: selection.anchor.getNode().getTextContent(),
      offset: selection.anchor.offset,
      collapsed: selection.isCollapsed(),
    };
  });
}

describe("typing a backslash inside the verse glyph", () => {
  it("keeps the caret right after the typed character at the glyph END (existing extraction)", async () => {
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    const caret = await typeInVerseGlyph(editor, verse, "end", "\\");

    // The typed `\` was extracted into content with the caret immediately after it.
    expect(caret.collapsed).toBe(true);
    expect(caret.nodeText.startsWith("\\")).toBe(true);
    expect(caret.offset).toBe(1);
    editor.getEditorState().read(() => {
      // glyph back to canonical
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
    });
  });

  it("keeps the caret right after the typed character BETWEEN the number and the separator", async () => {
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    // `\v 1| ` — between the number and the glyph's display space.
    const caret = await typeInVerseGlyph(editor, verse, 4, "\\");

    expect(caret.collapsed).toBe(true);
    expect(caret.nodeText.startsWith("\\")).toBe(true);
    expect(caret.offset).toBe(1);
    editor.getEditorState().read(() => {
      // The paragraph's shape: canonical verse glyph, then the extracted `\` leading the
      // content — the number was NOT demoted (`\` is a tokenizer name-scan terminator, so it
      // ends the number word rather than joining it).
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      expect(verse.isAttached()).toBe(true);
      expect(verse.getNumber()).toBe("1");
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
      const afterVerse = verse.getNextSibling();
      if (!$isTextNode(afterVerse) || $isMarkerNode(afterVerse))
        throw new Error("expected plain text after the verse");
      expect(afterVerse.getTextContent().startsWith("\\")).toBe(true);
      expect(para.getTextContent()).toContain("In the beginning");
    });
  });

  it("still extends the number when a non-terminator character is typed there", async () => {
    // The leading-attribute rule: only `\`, `|`, whitespace, and `*` end the number's word
    // scan, so typing `a` between the number and the separator EXTENDS the number (PT9
    // GetNextWord takes the whole word, valid or not). Pinned so the backslash special-casing
    // never leaks onto ordinary characters.
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    await typeInVerseGlyph(editor, verse, 4, "a");

    editor.getEditorState().read(() => {
      expect(verse.isAttached()).toBe(true);
      expect(verse.getNumber()).toBe("1a");
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1a"));
    });
  });
});
