/**
 * PT9 SmartEnter: pressing Enter inside expanded note content inserts an
 * `\fp` (footnote-paragraph) char span instead of splitting the paragraph — a NoteNode is
 * inline, so a paragraph split inside it would be structurally invalid.
 */

import editorUsjAdaptor from "../adaptors/editor-usj.adaptor";
import {
  $noteContentText,
  findOnlyNote,
  noteUsx,
  plainTextPasteEvent,
  renderStandardEditorWithCollapsedNote,
  renderStandardEditorWithUnclosedNote,
  requireDefined,
  serializedState,
  testEnvironmentWithCharSync,
  usjNoteFromUsfm,
  usjNoteOf,
  viewOptions,
} from "./markerEdit.test-helpers";
import { $handleEnterInNote, NoteEnterOutcome } from "./markerEditNote.utils";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { MarkerContent } from "@eten-tech-foundation/scripture-utilities";
import { $dfs } from "@lexical/utils";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  ElementNode,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  getEditableCallerText,
  MarkerNode,
  NBSP,
  NoteNode,
  textTypeState,
} from "shared";
import { StructureKeyboardPlugin } from "shared-react";
// Reaching inside only for tests (same pattern as markerEdit.test-helpers).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

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

/** NoteNodes anywhere in the tree — a torn (cloned) note shows up as a second one. */
function $countNoteNodes(): number {
  return $dfs($getRoot()).filter(({ node }) => $isNoteNode(node)).length;
}

/** Opening `\f` glyphs anywhere in the tree — a torn note duplicates its opener. */
function $countNoteOpenerGlyphs(): number {
  return $dfs($getRoot()).filter(
    ({ node }) =>
      $isMarkerNode(node) && node.getMarker() === "f" && node.getMarkerSyntax() === "opening",
  ).length;
}

/** `\fp` char spans anywhere in the tree (a break must not leak one outside the note). */
function $countFpSpans(): number {
  return $dfs($getRoot()).filter(({ node }) => $isCharNode(node) && node.getMarker() === "fp")
    .length;
}

/** The note's `\ft` content TextNode and the paragraph's trailing body text (" after"). */
function $noteFtTextAndTrailingBodyText(): { ftText: TextNode; bodyText: TextNode } {
  const note = findOnlyNote($getRoot());
  const ft = requireDefined(
    note
      .getChildren()
      .filter($isCharNode)
      .find((c) => c.getMarker() === "ft"),
    "\\ft char span not found",
  );
  const ftText = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
  const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para not found");
  const bodyText = requireDefined(
    para
      .getChildren()
      .find(
        (n): n is TextNode =>
          $isTextNode(n) && !$isMarkerNode(n) && n.getTextContent().includes("after"),
      ),
    "trailing paragraph text not found",
  );
  return { ftText, bodyText };
}

describe("Enter inside note content", () => {
  it("inserts an \\fp char span and does not split the paragraph", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    placeCaretAtEndOfNoteFt(editor);
    let parasBefore = 0;
    let ftKeyBefore = "";
    editor.getEditorState().read(() => {
      parasBefore = countParagraphs($getRoot());
      const note = findOnlyNote($getRoot());
      ftKeyBefore = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "ft"),
        "\\ft char span not found",
      ).getKey();
    });

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
      // `$charNodeDeletionTransform` would treat it as "opener deleted" and unwrap it.
      const fp = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fp"),
        "\\fp char span not found",
      );
      expect(fp.getChildren()[0]?.getType()).toBe("marker");
      // The break is built with the note-content convention FROM CREATION: closed="false"
      // (matching `$createNoteContentChar` and real ParatextData), so the state-keyed
      // `$charNodeDeletionTransform` never reads its (correct) missing closer as deletion
      // damage. Without the flag, every Enter-in-note triggered a spurious Tier-2 note-content
      // rebuild that recreated every node in the note.
      expect(fp.getUnknownAttributes()?.closed).toBe("false");
      // No spurious rebuild: the untouched \ft span is the SAME node it was before Enter — a
      // note-content rebuild would have recreated it under a new key.
      const ft = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "ft"),
        "\\ft char span not found",
      );
      expect(ft.getKey()).toBe(ftKeyBefore);
      // Caret at the break point: inside the new \fp's placeholder content, after the
      // structural NBSP (offset 1), so typing continues where the user split.
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        throw new Error("Expected a collapsed selection after Enter");
      const placeholder = fp
        .getChildren()
        .find((n): n is TextNode => $isTextNode(n) && !$isMarkerNode(n));
      expect(selection.anchor.getNode().getKey()).toBe(placeholder?.getKey());
      expect(selection.anchor.offset).toBe(1);
    });
  });

  it("removes the selected text, then breaks at the collapsed caret (Enter with a selection)", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    // Select "no" out of the note's "A note" content — a non-collapsed range fully inside
    // the expanded note's \ft span.
    await act(async () => {
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
          const start = text.getTextContent().indexOf("no");
          expect(start).toBeGreaterThan(0);
          text.select(start, start + 2);
        },
        { discrete: true },
      );
    });
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    const handled = await pressEnter(editor);

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      // The note was NOT split through by the generic paragraph split (the documented
      // hazard of declining here): still one paragraph, still exactly one intact note.
      expect(countParagraphs($getRoot())).toBe(parasBefore);
      const note = findOnlyNote($getRoot());
      // Standard Enter-with-selection semantics: the selected text is gone…
      expect(note.getTextContent()).not.toContain("no");
      // …and the \fp break happened at the resulting collapsed caret: "A " stays in \ft,
      // "te" (the text after the removed range) starts the new \fp.
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const [ft, fp] = chars;
      expect(ft.getTextContent()).toContain("A");
      expect(ft.getTextContent()).not.toContain("te");
      expect(fp.getTextContent()).toContain("te");
    });
  });

  it("keeps following span content after the break on Enter mid-text of a multi-node span", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Same single-update requirement as the offset-0 tests: caret placement and Enter handling
    // share one update so jsdom's selection reconciliation cannot renormalize the anchor.
    let handled: NoteEnterOutcome = "declined";
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
        const head = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
        // A second content node after the caret's node (same Tier-2-rebuild shape as the
        // offset-0 multi-node test; the NodeState only prevents adjacent-text merging).
        const tail = $createTextNode(" tail");
        $setState(tail, textTypeState, "attribute");
        head.insertAfter(tail);
        // Caret MID-text, between "A n" and "ote" — the offset>0 && offset<size branch.
        const offset = head.getTextContent().indexOf("ote");
        expect(offset).toBeGreaterThan(0);
        head.select(offset, offset);
        handled = $handleEnterInNote();
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const [ft, fp] = chars;
      // Text before the caret stays put; EVERYTHING after the caret — the split-off tail
      // AND the following content node — moved into \fp in document order. Inserting \fp
      // after the whole span instead left " tail" in \ft BEFORE the split-off "ote",
      // reordering the content across the break.
      expect(ft.getTextContent()).toContain("A n");
      expect(ft.getTextContent()).not.toContain("tail");
      const fpText = fp.getTextContent();
      expect(fpText).toContain("ote");
      expect(fpText.indexOf("tail")).toBeGreaterThan(fpText.indexOf("ote"));
    });
  });

  it("moves following span content into \\fp (no placeholder) on Enter at the END of a text run", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Same single-update requirement as the offset-0 tests: at a text-run boundary, a discrete
    // commit's selection reconciliation can renormalize the anchor onto the NEXT node's offset
    // 0, which would silently exercise the offset-0 branch instead of the end-of-text one this
    // test exists to pin.
    let handled: NoteEnterOutcome = "declined";
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
        const head = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
        // A second content node after the caret's node (same Tier-2-rebuild shape as the other
        // multi-node tests; the NodeState only prevents adjacent-text merging).
        const tail = $createTextNode(" tail");
        $setState(tail, textTypeState, "attribute");
        head.insertAfter(tail);
        // Caret at the exact END of the head run — offset === size. " tail" still follows
        // within the span, so there IS content after the caret: this must NOT be treated as
        // an empty/placeholder break.
        head.select(head.getTextContentSize(), head.getTextContentSize());
        handled = $handleEnterInNote();
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const [ft, fp] = chars;
      // Text before the caret stays put; the following content node moved AFTER the break in
      // document order — not stranded in \ft above the new \fp.
      expect(ft.getTextContent()).toContain("A note");
      expect(ft.getTextContent()).not.toContain("tail");
      const fpContent = fp
        .getChildren()
        .filter((n): n is TextNode => $isTextNode(n) && !$isMarkerNode(n));
      // Exactly the moved run — no empty-span placeholder text node was inserted.
      expect(fpContent).toHaveLength(1);
      expect(fpContent[0].getTextContent()).toContain("tail");
    });
  });

  it("places the caret at the break point — typing after Enter lands at the start of the \\fp content", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Same single-update jsdom pattern as the multi-node tests around this one. After the
    // break, the caret belongs at the START of the new \fp's content — immediately after the
    // break, where a normal editor (and PT9) leaves it — so typing continues where the user
    // split. Parking it at the END of the moved content made "A note| tail"+Enter+typing
    // append after "tail".
    let handled: NoteEnterOutcome = "declined";
    await act(async () => {
      editor.update(() => {
        const { ftText: head } = $noteFtTextAndTrailingBodyText();
        const tail = $createTextNode(" tail");
        // A style difference keeps Lexical from merging the adjacent texts while the tail stays
        // PLAIN content text — an "attribute"-tagged device would (correctly) be refused the
        // \fp span's structural NBSP prefix that this test asserts the caret sits after.
        tail.setStyle("letter-spacing: normal");
        head.insertAfter(tail);
        head.select(head.getTextContentSize(), head.getTextContentSize());
        handled = $handleEnterInNote();

        const note = findOnlyNote($getRoot());
        const fp = requireDefined(
          note
            .getChildren()
            .filter($isCharNode)
            .find((c) => c.getMarker() === "fp"),
          "\\fp char span not found",
        );
        const fpContent = requireDefined(contentText(fp.getChildren()), "\\fp content not found");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.isCollapsed()).toBe(true);
        // The caret sits on the \fp's FIRST content node, right after its structural NBSP
        // (offset 0 would splice typed text between the marker glyph and the separator).
        expect(selection.anchor.getNode().getKey()).toBe(fpContent.getKey());
        expect(selection.anchor.offset).toBe(1);
        // Type-through proof that the caret is at the break point.
        selection.insertText("X");
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const fpText = chars[1].getTextContent();
      // "X tail", not " tailX": typing continued at the break.
      expect(fpText).not.toContain("tailX");
      expect(fpText.indexOf("X")).toBeLessThan(fpText.indexOf("tail"));
    });
  });

  it("leaves an empty (placeholder) \\fp break typing-ready: typed text becomes the content", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // The placeholder IS a lone structural NBSP, so the break-point caret sits right after
    // it — typed text lands where the placeholder-consumption flow expects new content.
    let handled: NoteEnterOutcome = "declined";
    await act(async () => {
      editor.update(() => {
        const { ftText } = $noteFtTextAndTrailingBodyText();
        ftText.select(ftText.getTextContentSize(), ftText.getTextContentSize());
        handled = $handleEnterInNote();

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        selection.insertText("X");
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const fp = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fp"),
        "\\fp char span not found",
      );
      // Structural NBSP separator + the typed content, nothing else.
      const fpContent = requireDefined(contentText(fp.getChildren()), "\\fp content not found");
      expect(fpContent.getTextContent()).toBe(`${NBSP}X`);
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
    let handled: NoteEnterOutcome = "declined";
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

    expect(handled).toBe("handled");
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

  it("moves ALL remaining span content into \\fp on Enter at offset 0 of a multi-node span", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Same single-update requirement as the Home+Enter test above: the caret placement and the
    // Enter handling must share one update or jsdom's selection reconciliation normalizes the
    // offset-0 anchor backward onto the marker glyph.
    let handled: NoteEnterOutcome = "declined";
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
        const head = requireDefined(contentText(ft.getChildren()), "\\ft content text not found");
        // A second content node after the caret's node — the shape a Tier-2 note rebuild
        // produces when it splices preserved nodes or split text runs into a span. The distinct
        // NodeState only stops Lexical's adjacent-text normalization from merging the two
        // nodes back into one; the Enter logic itself is state-agnostic.
        const tail = $createTextNode(" tail");
        $setState(tail, textTypeState, "attribute");
        head.insertAfter(tail);
        head.select(0, 0); // caret precedes ALL of the span's content
        handled = $handleEnterInNote();
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      // Everything from the caret onward moved: the emptied \ft is gone and the \fp holds
      // BOTH content nodes — not just the caret's own node with " tail" stranded in a
      // leftover \ft AFTER the break.
      expect(chars.map((c) => c.getMarker())).toEqual(["fp"]);
      expect(chars[0].getTextContent()).toContain("A note");
      expect(chars[0].getTextContent()).toContain("tail");
    });
  });

  it("falls through (no \\fp) when the caret is inside a COLLAPSED note's content", async () => {
    const { editor } = await renderStandardEditorWithCollapsedNote();

    let handled: NoteEnterOutcome = "handled";
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

    expect(handled).toBe("declined");
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

  it("prevents the native browser Enter when it claims the key", async () => {
    // Returning `true` from the KEY_ENTER handler suppresses Lexical's RichText handler —
    // including the `event.preventDefault()` RichText would have called. Without our own
    // preventDefault, the BROWSER's native contenteditable Enter still splits the DOM and
    // Lexical reconciles that into a real paragraph split (live-verified: the popover
    // wrapper split with the caret genuinely inside the note; invisible in jsdom, which has
    // no native editing engine, so a green jsdom run proves nothing about this one).
    const { editor } = await renderStandardEditorWithUnclosedNote();
    placeCaretAtEndOfNoteFt(editor);

    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    let handled = false;
    await act(async () => {
      handled = editor.dispatchCommand(KEY_ENTER_COMMAND, event);
    });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true); // the browser's own split must not run
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

describe("Enter inside a nested character style in note content", () => {
  /** A footnote whose `\ft` content is `A \+nd holy\+nd* B` — a nested span with text either side. */
  async function setUpNestedNd() {
    let contentRef: TextNode | undefined;
    let noteRef: NoteNode | undefined;
    const environment = await testEnvironmentWithCharSync(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+", false);
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      const nd = $createCharNode("nd");
      const content = $createTextNode(`${NBSP}holy`);
      note.append(
        $createMarkerNode("f"),
        $createTextNode(getEditableCallerText("+")),
        ft.append(
          $createMarkerNode("ft"),
          $createTextNode(`${NBSP}A `),
          nd.append(
            $createMarkerNode("nd", "opening", true),
            content,
            $createMarkerNode("nd", "closing", true),
          ),
          $createTextNode(" B"),
        ),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("text "), note),
      );
      contentRef = content;
      noteRef = note;
    });
    return {
      ...environment,
      content: requireDefined(contentRef, "nested content missing"),
      note: requireDefined(noteRef, "note missing"),
    };
  }

  /**
   * The USFM bytes `node`'s subtree stands for: every text node in document order (glyph nodes
   * included) with the structural NBSP separators rendered as the plain spaces they serialize to.
   */
  function $usfmBytes(node: ElementNode): string {
    return node
      .getAllTextNodes()
      .map((textNode) => textNode.getTextContent())
      .join("")
      .replaceAll(NBSP, " ");
  }

  it("reopens the nested style inside the break and carries the outer span's tail with it", async () => {
    const { editor, content, note } = await setUpNestedNd();

    let handled: NoteEnterOutcome = "declined";
    await act(async () => {
      editor.update(() => {
        content.select(3, 3); // between "ho" and "ly"
        handled = $handleEnterInNote();
      });
    });

    expect(handled).toBe("handled");
    editor.getEditorState().read(() => {
      // \nd closes before the break and reopens inside it; " B" — the OUTER span's content after
      // the nested one — rides along instead of being stranded before the break.
      expect($usfmBytes(note)).toBe("\\f + \\ft A \\+nd ho\\+nd*\\fp \\+nd ly\\+nd* B\\f*");
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
    });
  });

  it("emits NO \\ft* — the \\fp break is itself what ends the \\ft (file bytes)", async () => {
    // The counterpart of the Ctrl+Space rule, and the reason that rule needs its own switch: an
    // unstyled gap has nothing to terminate the span it interrupts, but a note-content MARKER
    // does. The `\fp` therefore emits no closing marker and reopens no `\ft` — the `\ft` stays
    // closed="false" and the `\fp` terminates it.
    //
    // Asserted on the SERIALIZED note against the tokenizer's reading of the expected bytes, so a
    // stray `\ft*` fails here rather than being found by hand in a saved file.
    const { editor, content } = await setUpNestedNd();

    await act(async () => {
      editor.update(() => {
        content.select(3, 3);
        $handleEnterInNote();
      });
    });

    expect(usjNoteOf(editor)).toEqual(
      usjNoteFromUsfm("\\p \\f + \\ft A \\+nd ho\\+nd*\\fp \\+nd ly\\+nd* B\\f*"),
    );
  });

  it("places the caret at the break point inside the reopened nested style", async () => {
    const { editor, content, note } = await setUpNestedNd();

    await act(async () => {
      editor.update(() => {
        content.select(3, 3);
        $handleEnterInNote();
      });
    });

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        throw new Error("Expected a collapsed selection after Enter");
      const anchorNode = selection.anchor.getNode();
      // Typing continues where the user split: at the start of the reopened \nd's content, just
      // past its structural separator.
      expect(anchorNode.getTextContent()).toBe(`${NBSP}ly`);
      expect(selection.anchor.offset).toBe(1);
      const reopenedNd = anchorNode.getParent();
      expect($isCharNode(reopenedNd) && reopenedNd.getMarker()).toBe("nd");
      const fp = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fp"),
        "\\fp char span not found",
      );
      expect(fp.isParentOf(anchorNode)).toBe(true);
    });
  });
});

describe("Enter on a selection crossing an expanded-note boundary", () => {
  it("removes the selection and breaks with \\fp — no note tearing — when the range crosses OUT of the note", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    // Range from inside the note's \ft content ("A |note") out into the paragraph's trailing
    // body text (" af|ter"): one endpoint inside the expanded note, one outside, with the
    // note's opening glyph untouched. PT9 always replaces the selection first, then breaks.
    await act(async () => {
      editor.update(
        () => {
          const { ftText, bodyText } = $noteFtTextAndTrailingBodyText();
          const start = ftText.getTextContent().indexOf("note");
          expect(start).toBeGreaterThan(0);
          const selection = ftText.select(start, start);
          selection.focus.set(bodyText.getKey(), 3, "text"); // " af|ter"
        },
        { discrete: true },
      );
    });
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    const handled = await pressEnter(editor);

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      // Declining this selection handed it to Lexical's generic split, which CLONED the note
      // at the split point — a duplicated `\f…\f*`. The break must stay inside the one note.
      expect(countParagraphs($getRoot())).toBe(parasBefore);
      expect($countNoteNodes()).toBe(1);
      expect($countNoteOpenerGlyphs()).toBe(1);
      const note = findOnlyNote($getRoot());
      // Standard Enter-with-selection semantics: the crossed range is gone on BOTH sides…
      expect(note.getTextContent()).not.toContain("note");
      const rootText = $getRoot().getTextContent();
      expect(rootText).not.toContain("after");
      expect(rootText).toContain("ter");
      // …and the post-removal caret sat in note content with an intact opener → \fp break.
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
    });
  });

  it("splits the paragraph normally — no \\fp — when the removal destroys the note's opening glyph", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    // Range from the note's opening `\f` glyph into the `\ft` content: the removal destroys
    // the opening marker. Destroying the opening marker means there is no longer a note
    // there, so Enter must do what Enter normally does — a plain paragraph split — instead
    // of splicing an `\fp` into the doomed note.
    await act(async () => {
      editor.update(
        () => {
          const note = findOnlyNote($getRoot());
          const opener = requireDefined(
            note
              .getChildren()
              .find((n): n is MarkerNode => $isMarkerNode(n) && n.getMarkerSyntax() === "opening"),
            "note opening glyph not found",
          );
          const { ftText } = $noteFtTextAndTrailingBodyText();
          const offset = ftText.getTextContent().indexOf("ote");
          expect(offset).toBeGreaterThan(0);
          const selection = opener.select(0, 0);
          selection.focus.set(ftText.getKey(), offset, "text"); // "A n|ote"
        },
        { discrete: true },
      );
    });
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    const handled = await pressEnter(editor);

    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      // A normal split, and no \fp anywhere: the old same-note path spliced an \fp into the
      // opener-destroyed note, which the deletion transform then unwrapped into a literal
      // \fp char span sitting in the paragraph body.
      expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
      expect($countFpSpans()).toBe(0);
      // Delete-over-selection semantics: content after the removed range survives.
      expect($getRoot().getTextContent()).toContain("ote");
    });
  });

  it("still deletes a fully-covered note whole and splits (generic path) when both endpoints are outside", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    // Both endpoints in paragraph body text with the WHOLE note inside the range: stays on
    // the generic path, which deletes the covered note whole and splits cleanly.
    await act(async () => {
      editor.update(
        () => {
          const para = requireDefined(
            $getRoot().getChildren().filter($isParaNode)[0],
            "paragraph not found",
          );
          const leading = requireDefined(
            para
              .getChildren()
              .find(
                (n): n is TextNode =>
                  $isTextNode(n) && !$isMarkerNode(n) && n.getTextContent().includes("text"),
              ),
            "leading paragraph text not found",
          );
          const { bodyText } = $noteFtTextAndTrailingBodyText();
          const selection = leading.select(2, 2); // "te|xt"
          selection.focus.set(bodyText.getKey(), 3, "text"); // " af|ter"
        },
        { discrete: true },
      );
    });
    let parasBefore = 0;
    editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

    await pressEnter(editor);

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
      expect($countNoteNodes()).toBe(0); // the covered note went whole, not torn
      expect($countFpSpans()).toBe(0);
      const rootText = $getRoot().getTextContent();
      expect(rootText).not.toContain("A note");
      expect(rootText).toContain("ter");
    });
  });
});

describe("multi-line plain-text paste inside note content", () => {
  // jsdom implements neither `ClipboardEvent` nor `DragEvent`, but Lexical's paste path
  // (`eventFiles`/`onPasteForRichText`) references both as bare globals for its klass checks, so
  // the identifiers must at least resolve. The stubs never have to MATCH: the mock event below is
  // a plain object (the same duck-typing the plugin's own clipboard handlers use), so Lexical's
  // constructor-name comparisons all decline and it falls through to the `event.clipboardData`
  // read — the exact path a real browser ClipboardEvent takes.
  const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
  if (typeof globalStubs.DragEvent === "undefined")
    globalStubs.DragEvent = class DragEvent extends Event {};
  if (typeof globalStubs.ClipboardEvent === "undefined")
    globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

  /** A paste event carrying the given clipboard flavors (e.g. `{"text/plain": "..."}`). */
  function pasteEventWith(flavors: { [mime: string]: string }): ClipboardEvent {
    const clipboardData = {
      types: Object.keys(flavors),
      files: [],
      getData: (type: string) => flavors[type] ?? "",
    };
    return { clipboardData, preventDefault: () => undefined } as unknown as ClipboardEvent;
  }

  /** Paste the given event with the selection set by `$select` — one update, like a real paste. */
  async function pasteEventAt(
    editor: LexicalEditor,
    event: ClipboardEvent,
    $select: () => void,
  ): Promise<void> {
    await act(async () =>
      editor.update(() => {
        // Select inside the same update as the dispatch (a mount-seeded selection is clobbered
        // by jsdom's focus/selection sync — same pattern as the Enter tests above).
        $select();
        editor.dispatchCommand(PASTE_COMMAND, event);
      }),
    );
  }

  /** Paste `text` (text/plain only) with the selection set by `$select`. */
  async function pasteAt(editor: LexicalEditor, text: string, $select: () => void): Promise<void> {
    await pasteEventAt(editor, plainTextPasteEvent(text), $select);
  }

  /** Caret at the end of the note's `\ft` content, for the paste tests below. */
  function $selectFtEnd(): void {
    const { ftText } = $noteFtTextAndTrailingBodyText();
    ftText.select(ftText.getTextContentSize(), ftText.getTextContentSize());
  }

  it("turns each line break into an \\fp break inside the note — no paragraph split", async () => {
    // Inside expanded note content a line break IS an `\fp` break (exactly like Enter there).
    // Letting the generic paste path run instead split the paragraph THROUGH the inline note
    // per newline — `\p` paragraphs threaded inside/through the footnote.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, "first\nsecond", () => {
      const { ftText } = $noteFtTextAndTrailingBodyText();
      const offset = ftText.getTextContent().indexOf("ote"); // caret mid-content: "A n|ote"
      expect(offset).toBeGreaterThan(0);
      ftText.select(offset, offset);
    });

    editor.getEditorState().read(() => {
      // The note is intact and nothing leaked outside it: still one paragraph, one note.
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const [ft, fp] = chars;
      // First line lands at the caret; the content after the caret rides the break into \fp,
      // AFTER the second line — standard paste flow, with \fp playing the paragraph's role.
      expect(ft.getTextContent()).toContain("A nfirst");
      expect(ft.getTextContent()).not.toContain("ote");
      const fpText = fp.getTextContent();
      expect(fpText.indexOf("second")).toBeLessThan(fpText.indexOf("ote"));
      // The paragraph body around the note is untouched.
      const rootText = $getRoot().getTextContent();
      expect(rootText).toContain("ter");
      // Caret discipline: collapsed at the END of the pasted content — right after "second".
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after paste");
      expect(selection.isCollapsed()).toBe(true);
      const anchorNode = selection.anchor.getNode();
      expect(anchorNode.getParent()?.getKey()).toBe(fp.getKey());
      const anchorText = $isTextNode(anchorNode) ? anchorNode.getTextContent() : "";
      expect(anchorText.slice(0, selection.anchor.offset)).toBe(`${NBSP}second`);
    });
  });

  it("does not claim a single-line paste: text inserts at the caret, no \\fp, no split", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, "plain", () => {
      const { ftText } = $noteFtTextAndTrailingBodyText();
      const offset = ftText.getTextContent().indexOf("ote"); // "A n|ote"
      expect(offset).toBeGreaterThan(0);
      ftText.select(offset, offset);
    });

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      expect($countFpSpans()).toBe(0);
      const note = findOnlyNote($getRoot());
      expect(note.getTextContent()).toContain("A nplainote");
    });
  });

  it("replaces a selection inside the note first, then breaks per pasted line", async () => {
    // Same replace-then-break semantics as Enter with a selection there — minus nothing:
    // the paste's own lines supply the content on each side of the break.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, "X\nY", () => {
      const { ftText } = $noteFtTextAndTrailingBodyText();
      const start = ftText.getTextContent().indexOf("no"); // select "no" out of "A note"
      expect(start).toBeGreaterThan(0);
      ftText.select(start, start + 2);
    });

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      expect(note.getTextContent()).not.toContain("no");
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      const [ft, fp] = chars;
      // "A [no]te" + paste "X\nY": the replacement collapses to "A |te", "X" lands there,
      // the break moves "te" into \fp, and "Y" lands at the break point before it.
      expect(ft.getTextContent()).toContain("A X");
      expect(ft.getTextContent()).not.toContain("te");
      const fpText = fp.getTextContent();
      expect(fpText.indexOf("Y")).toBeLessThan(fpText.indexOf("te"));
    });
  });

  it("falls back to the ordinary paragraph-splitting paste when the removal destroys the note's opener", async () => {
    // Range from the note's opening `\f` glyph into the content: the replacement destroys the
    // opening marker, so there is no longer a note to break inside — the rest of the paste is
    // the ordinary outside-note paste (surviving prefixed paragraphs), same rule as Enter.
    const { editor } = await renderStandardEditorWithUnclosedNote();
    let parasBefore = 0;

    await act(async () => {
      editor.update(
        () => {
          parasBefore = countParagraphs($getRoot());
        },
        { discrete: true },
      );
    });
    await pasteAt(editor, "X\nY", () => {
      const note = findOnlyNote($getRoot());
      const opener = requireDefined(
        note
          .getChildren()
          .find((n): n is MarkerNode => $isMarkerNode(n) && n.getMarkerSyntax() === "opening"),
        "note opening glyph not found",
      );
      const { ftText } = $noteFtTextAndTrailingBodyText();
      const offset = ftText.getTextContent().indexOf("ote");
      expect(offset).toBeGreaterThan(0);
      const selection = opener.select(0, 0);
      selection.focus.set(ftText.getKey(), offset, "text"); // "A n|ote"
    });

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
      expect($countFpSpans()).toBe(0);
      const rootText = $getRoot().getTextContent();
      expect(rootText).toContain("X");
      expect(rootText).toContain("Y");
      expect(rootText).toContain("ote"); // content after the removed range survives
    });
  });

  it("normalizes \\r\\n line endings: one \\fp break, no \\r reaches the content", async () => {
    // Windows sources put \r\n on the clipboard; a \r surviving into note content would be an
    // invisible control character in the USFM data.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, "first\r\nsecond", $selectFtEnd);

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      expect(chars[0].getTextContent()).toContain("first");
      expect(chars[1].getTextContent()).toContain("second");
      expect($getRoot().getTextContent()).not.toContain("\r");
    });
  });

  it("claims the paste when text/html rides alongside text/plain (real-world copy shape)", async () => {
    // VS Code, Word, and browsers put text/html on the clipboard next to text/plain; the claim
    // must key off the plain flavor regardless — letting the html flavor divert the paste to
    // RichText's html branch threads `\p` paragraphs through the note.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteEventAt(
      editor,
      pasteEventWith({
        "text/plain": "first\r\nsecond",
        "text/html": "<html><body><p>first</p><p>second</p></body></html>",
      }),
      $selectFtEnd,
    );

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      expect(chars[1].getTextContent()).toContain("second");
    });
  });

  it("claims an editor-internal (application/x-lexical-editor) multi-line paste inside the note", async () => {
    // Copying multi-paragraph text inside the app puts a rich lexical payload on the clipboard.
    // Pasting that INTO a note must still become `\fp` breaks: the rich path inserts real
    // paragraph nodes, tearing the inline note apart. Outside notes internal pastes keep their
    // node semantics untouched — the claim's note gate declines there.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteEventAt(
      editor,
      pasteEventWith({
        "application/x-lexical-editor": '{"namespace":"someOtherEditor","nodes":[]}',
        "text/plain": "first\nsecond",
      }),
      $selectFtEnd,
    );

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      expect(chars[0].getTextContent()).toContain("first");
      expect(chars[1].getTextContent()).toContain("second");
    });
  });

  it("derives the lines from text/html when the clipboard carries no text/plain", async () => {
    // Some sources (word processors, intermediaries) omit text/plain entirely. Without the html
    // fallback the claim saw an empty payload, fell through, and RichText's html branch split
    // `\p` paragraphs through the note.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteEventAt(
      editor,
      pasteEventWith({ "text/html": "<html><body><p>first</p><p>second</p></body></html>" }),
      $selectFtEnd,
    );

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      expect(chars[0].getTextContent()).toContain("first");
      expect(chars[1].getTextContent()).toContain("second");
    });
  });

  it("outranks the structure-protection paste handler: in-note pastes break with \\fp even when protected", async () => {
    // With structure protection ON (the Simple-mode shipping default) StructureKeyboardPlugin
    // handles PASTE at COMMAND_PRIORITY_HIGH: any html-bearing paste is sanitize-inserted (or
    // blocked) before a lower-priority in-note claim can run, so pasted line breaks never became
    // `\fp` breaks inside the note. The in-note claim must outrank it — an `\fp` break edits
    // NOTE CONTENT, not document structure, so protection has no business consuming it.
    const { editor } = await baseTestEnvironment(
      serializedState(noteUsx(`closed="false"`)),
      <>
        <MarkerEditPlugin viewOptions={viewOptions} />
        <StructureKeyboardPlugin structureProtectionMode="protected" />
      </>,
    );

    await pasteEventAt(
      editor,
      pasteEventWith({
        "text/plain": "first\nsecond",
        "text/html": "<html><body><p>first</p><p>second</p></body></html>",
      }),
      $selectFtEnd,
    );

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(1);
      expect($countNoteNodes()).toBe(1);
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      expect(chars[0].getTextContent()).toContain("first");
      expect(chars[1].getTextContent()).toContain("second");
    });
  });

  describe("pasted USFM: paragraph-kind markers convert to the \\fp break", () => {
    it("strips the leading paragraph-kind marker from each line — the line break IS the \\fp break", async () => {
      // Paragraph markers have no meaning inside an inline note; PT9-consistent conversion
      // keeps the line text as content and lets the line break itself supply the note's own
      // paragraph form (`\fp`). Leaving the literals produced red `\q1`/`\q2` text in the note.
      const { editor } = await renderStandardEditorWithUnclosedNote();

      await pasteAt(editor, "test stuff\n\\q1 something\n\\q2 something else", $selectFtEnd);

      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(1);
        expect($countNoteNodes()).toBe(1);
        const note = findOnlyNote($getRoot());
        const chars = note.getChildren().filter($isCharNode);
        expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp", "fp"]);
        const [ft, fp1, fp2] = chars;
        expect(ft.getTextContent()).toContain("test stuff");
        expect(fp1.getTextContent()).toContain("something");
        expect(fp1.getTextContent()).not.toContain("something else");
        expect(fp2.getTextContent()).toContain("something else");
        // The paragraph-kind literals are gone from CONTENT text (the \fp glyphs render "\fp";
        // no non-marker text still carries them).
        const strandedLiterals: string[] = [];
        note.getChildren().forEach(function walk(child) {
          if ($isTextNode(child) && !$isMarkerNode(child)) {
            const text = child.getTextContent();
            if (text.includes("\\q1") || text.includes("\\q2")) strandedLiterals.push(text);
          }
          if ($isCharNode(child)) child.getChildren().forEach(walk);
        });
        expect(strandedLiterals).toEqual([]);
      });
    });

    it("leaves an unknown marker at line start as literal text (only paragraph-kind converts)", async () => {
      // Scoping: only markers the effective stylesheet types as PARAGRAPH are converted; a
      // char-kind or stylesheet-unknown marker at line start stays literal text — the normal
      // typed-literal machinery (Tier 2) owns whatever happens to it next.
      const { editor } = await renderStandardEditorWithUnclosedNote();

      await pasteAt(editor, "keep\n\\zzz stuff", $selectFtEnd);

      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(1);
        const note = findOnlyNote($getRoot());
        // One \fp break for the one line break; the unknown marker was NOT stripped — its
        // text is still present in the note (as literal content or whatever Tier 2 made of it).
        expect(
          note
            .getChildren()
            .filter($isCharNode)
            .filter((c) => c.getMarker() === "fp"),
        ).toHaveLength(1);
        expect(note.getTextContent()).toContain("zzz");
        expect(note.getTextContent()).toContain("stuff");
      });
    });

    it("strips \\c/\\id bytes from a multi-line paste — they never land in note content", async () => {
      // Single-line in-note pastes decline to the main external-paste handler
      // ($handlePasteForStandardView, whitespaceDisplay.plugin.utils.ts), which already strips
      // `\c`/`\id`; this CRITICAL multi-line claim is a SEPARATE code path that did not share the
      // strip until now. A `\c`/`\id` token landing in note content re-tokenizes through the same
      // Tier 2 tokenizer a paragraph does, so it is just as reachable — and just as save-poisoning
      // (a live-verified `\c` paste anywhere puts a second chapter node in the editor and fails
      // every subsequent PDP save) — as one landing in body text.
      const { editor } = await renderStandardEditorWithUnclosedNote();

      await pasteAt(editor, "first\n\\c 5\nlast", $selectFtEnd);

      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        expect(note.getTextContent()).not.toContain("\\c");
      });
    });
  });

  it("normalizes a pasted data-NBSP with no marker adjacency to `~` (round-trips to NBSP in USJ)", async () => {
    // This claim outranks the standard-view paste normalization at HIGH, so it runs its own NBSP
    // normalization — the SAME positional rule that path uses (`$normalizePastedNbsp`,
    // whitespaceDisplay.plugin.utils.ts), not a divergent mapping of its own. This payload has no
    // marker literal anywhere near its NBSP, so it lands as `~` (genuine data) under the
    // positional rule exactly as it would under a blanket one — the positional-vs-blanket
    // distinction only shows up for a marker-adjacent NBSP (see the next test). Inserted raw, the
    // NBSP is indistinguishable from a display-NBSP (a plain space in a run) and serialization
    // would corrupt it into a plain space; a pasted literal `~` is untouched — it IS the display
    // form and already round-trips to a data NBSP, exactly like typing `~`.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, `tilde~data${NBSP}pair\nnext`, $selectFtEnd);

    editor.getEditorState().read(() => {
      // Display: the pasted NBSP shows as `~`, same as the literal `~` (both are data-NBSP).
      const note = findOnlyNote($getRoot());
      expect(note.getTextContent()).toContain("tilde~data~pair");
    });

    const usj = requireDefined(
      editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions),
      "editor state did not serialize to USJ",
    );
    const contentStrings: string[] = [];
    const walk = (content: MarkerContent[] | undefined): void => {
      content?.forEach((item) => {
        if (typeof item === "string") contentStrings.push(item);
        else walk(item.content);
      });
    };
    walk(usj.content);
    // Data: BOTH round-trip to a real NBSP — the pasted NBSP survives as data, never a space.
    expect(
      contentStrings.some((contentString) => contentString.includes(`tilde${NBSP}data${NBSP}pair`)),
    ).toBe(true);
  });

  it("normalizes a marker-adjacent pasted NBSP positionally, not into `~` (the same corruption class the main paste path was fixed for)", async () => {
    // Before this was wired to the shared positional rule, this claim's OWN blanket NBSP→`~`
    // mapping turned the required separator after a marker's opener into data, corrupting a
    // recognizable `\nd`…`\nd*` pair the same way a same-editor footnote paste once corrupted
    // `\f`/`\fr`/`\ft` on the main external-paste path (whitespaceDisplay.plugin.utils.test.tsx's
    // "2026-08-07 live-repro" pin). Multi-line so this CRITICAL in-note claim (not the HIGH
    // external-paste handler) is the one doing the normalization.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, `\\nd${NBSP}light\\nd*\nsecond`, $selectFtEnd);

    const usj = requireDefined(
      editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions),
      "editor state did not serialize to USJ",
    );
    const chars: MarkerContent[] = [];
    const walk = (content: MarkerContent[] | undefined): void => {
      content?.forEach((item) => {
        if (typeof item !== "string") {
          chars.push(item);
          walk(item.content);
        }
      });
    };
    walk(usj.content);
    // The pasted pair tokenized into a real `nd` char span (not literal, never-recognized text) —
    // the same structural proof the main path's doubled-glyph pin uses.
    expect(chars.some((item) => typeof item !== "string" && item.marker === "nd")).toBe(true);
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getTextContent()).not.toContain("~");
    });
  });

  it("normalizes a data-NBSP at the start of a note's SECOND \\fp line to a plain space, not `~` — the same leading-NBSP-per-line pass the main paste path uses", async () => {
    // `$normalizePastedNbsp`'s leading-NBSP pass is `gm`-flagged: `^` matches right after every
    // `\n`, not just at the very start of the whole paste (whitespaceDisplay.plugin.utils.test.tsx
    // pins the identical outcome for the main external-paste path). A leading NBSP reads as a
    // structural separator with nothing in front of it to match against, the same as a partial
    // selection starting exactly at a char span's own leading separator.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, `first\n${NBSP}second`, $selectFtEnd);

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const chars = note.getChildren().filter($isCharNode);
      expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
      // Leading NBSP on the second line became a plain space, not data (`~`).
      expect(chars[1].getTextContent()).toContain(" second");
      expect(chars[1].getTextContent()).not.toContain("~");
    });
  });

  it("serializes the two-\\fp note to USJ with no newline characters (the paragraph look is display-only)", async () => {
    // The editor renders each \fp as a paragraph start via a CSS-generated line break
    // (usj-nodes.css), so the pasted line breaks must live on ONLY as \fp char spans —
    // never as newline characters anywhere in the serialized data.
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await pasteAt(editor, "first\nsecond\nthird", $selectFtEnd);

    const usj = requireDefined(
      editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions),
      "editor state did not serialize to USJ",
    );
    const contentStrings: string[] = [];
    const charMarkers: string[] = [];
    const walk = (content: MarkerContent[] | undefined): void => {
      content?.forEach((item) => {
        if (typeof item === "string") {
          contentStrings.push(item);
          return;
        }
        if (item.type === "char" && item.marker) charMarkers.push(item.marker);
        walk(item.content);
      });
    };
    walk(usj.content);

    // Both \fp spans survive into the USJ as ordinary inline char spans…
    expect(charMarkers).toEqual(["ft", "fp", "fp"]);
    // …and no content string at any depth carries a newline: the visual break is CSS-only.
    expect(contentStrings.length).toBeGreaterThan(0);
    for (const contentString of contentStrings) expect(contentString).not.toContain("\n");
  });
});
