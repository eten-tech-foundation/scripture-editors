/**
 * PT9 SmartEnter (design spec §6): pressing Enter inside expanded note content inserts an
 * `\fp` (footnote-paragraph) char span instead of splitting the paragraph — a NoteNode is
 * inline, so a paragraph split inside it would be structurally invalid.
 */

import {
  $noteContentText,
  findOnlyNote,
  renderStandardEditorWithCollapsedNote,
  renderStandardEditorWithUnclosedNote,
  requireDefined,
} from "./markerEdit.test-helpers";
import { $handleEnterInNote } from "./markerEditNote.utils";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $isTextNode,
  ElementNode,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $isCharNode, $isMarkerNode, $isParaNode } from "shared";

/** Plain (non-marker) content text among `children` — excludes marker-glyph TextNodes. */
function contentText(children: ReturnType<ElementNode["getChildren"]>): TextNode | undefined {
  return children.find((n): n is TextNode => $isTextNode(n) && !$isMarkerNode(n));
}

/** Place the caret at the end of the note's `\ft` content text. */
function placeCaretAtEndOfNoteFt(editor: LexicalEditor): void {
  editor.update(
    () => {
      const note = findOnlyNote($getRoot());
      const ft = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "ft"),
        "\\ft char span not found",
      );
      const text = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
      text.select(text.getTextContentSize(), text.getTextContentSize());
    },
    { discrete: true },
  );
}

/** Place the caret inside the paragraph's own trailing text (outside any note). */
function placeCaretInParagraphBody(editor: LexicalEditor): void {
  editor.update(
    () => {
      const para = requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0],
        "paragraph not found",
      );
      const after = requireDefined(
        para
          .getChildren()
          .find(
            (n): n is TextNode =>
              $isTextNode(n) && !$isMarkerNode(n) && n.getTextContent().includes("after"),
          ),
        "trailing paragraph text not found",
      );
      after.select(1, 1);
    },
    { discrete: true },
  );
}

async function pressEnter(editor: LexicalEditor): Promise<boolean> {
  let handled = false;
  await act(async () => {
    handled = editor.dispatchCommand(KEY_ENTER_COMMAND, null);
  });
  return handled;
}

function countParagraphs(root: ElementNode): number {
  return root.getChildren().filter($isParaNode).length;
}

describe("Enter inside note content", () => {
  it("inserts an \\fp char span and does not split the paragraph", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    placeCaretAtEndOfNoteFt(editor);
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    const handled = await pressEnter(editor);

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(parasBefore); // no paragraph split
      const note = findOnlyNote($getRoot());
      const markers = note
        .getChildren()
        .filter($isCharNode)
        .map((c) => c.getMarker());
      expect(markers).toContain("fp");
      // The \fp span carries a real opening marker glyph, not just bare content — otherwise
      // `$charNodeDeletionTransform` (§5.5) would treat it as "opener deleted" and unwrap it.
      const fp = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fp"),
        "\\fp char span not found",
      );
      expect(fp.getChildren()[0]?.getType()).toBe("marker");
    });
  });

  it("removes the emptied \\ft span when Enter is pressed at the start of note content (Home then Enter)", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Placing the caret at offset 0 and dispatching Enter must be ONE update: a discrete
    // commit at text-offset-0 gets its anchor normalized backward onto the preceding `\ft`
    // marker glyph (a jsdom/Lexical selection-reconciliation artifact — verified: anchor
    // lands at text offset 3 of the marker node, not offset 0 of the content), which would
    // never reach the offset-0 branch this test exists to pin. A real browser's Home+Enter
    // keeps the caret genuinely at offset 0, which is what this single-update flow models.
    let handled = false;
    await act(async () => {
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        const ft = requireDefined(
          note
            .getChildren()
            .filter($isCharNode)
            .find((c) => c.getMarker() === "ft"),
          "\\ft char span not found",
        );
        const text = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
        text.select(0, 0); // caret at offset 0 of the `\ft` content (Home)
        handled = $handleEnterInNote();
      });
    });

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      // The whole content moved into `\fp`; the now-content-less `\ft` span is removed —
      // NOT left behind as a marker-only `\ft\fp` (a CharNode always keeps its opening
      // marker glyph, so a naive `getChildrenSize() === 0` check would never catch it).
      expect(chars.map((c) => c.getMarker())).toEqual(["fp"]);
      // No content-less span survives: every char child has real (non-marker) content.
      for (const char of chars)
        expect(char.getChildren().some((n) => $isTextNode(n) && !$isMarkerNode(n))).toBe(true);
      // The content itself survived the move.
      expect(note.getTextContent()).toContain("A note");
    });
  });

  it("falls through (no \\fp) when the caret is inside a COLLAPSED note's content", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    let handled = true;
    let markersBefore: string[] = [];
    await act(async () => {
      editor.update(
        () => {
          const note = findOnlyNote($getRoot());
          expect(note.getIsCollapsed()).toBe(true);
          markersBefore = note
            .getChildren()
            .filter($isCharNode)
            .map((c) => c.getMarker());
          const text = $noteContentText(note);
          text.select(text.getTextContentSize(), text.getTextContentSize());
          // A collapsed note's content is not an editable inline zone (mirrors
          // `$buildNoteFragment`'s `isCollapsed !== false` gate): the handler must refuse,
          // leaving the caller to fall through to the pre-existing Enter/paragraph behavior.
          handled = $handleEnterInNote();
        },
        { discrete: true },
      );
    });

    expect(handled).toBe(false);
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const markers = note
        .getChildren()
        .filter($isCharNode)
        .map((c) => c.getMarker());
      expect(markers).toEqual(markersBefore); // unchanged
      expect(markers).not.toContain("fp"); // no footnote-paragraph span inserted
    });
  });

  it("still splits the paragraph on Enter outside any note", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    placeCaretInParagraphBody(editor);
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    // `dispatchCommand`'s own return reflects the WHOLE priority chain (the default,
    // lower-priority RichText Enter handler performs the split and returns `true` itself),
    // not just this plugin's handler — so the meaningful assertion is the structural
    // effect: the note path did NOT run, and the ordinary paragraph split still happened.
    await pressEnter(editor);

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
    });
  });
});
