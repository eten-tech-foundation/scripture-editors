import {
  $appendVersePara,
  expandedViewOptions,
  findOnlyNote,
  testEnvironment,
  testEnvironmentExpanded,
  viewOptions,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $getRoot, $isElementNode, $isTextNode, LexicalNode } from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  CharNode,
  getEditableCallerText,
  NBSP,
  NoteNode,
} from "shared";
import { $insertNote, $isImmutableNoteCallerNode } from "shared-react";

/**
 * Regression: inserting a note in STANDARD view (markerMode "editable", noteMode "collapsed")
 * through the same path the app uses (`insertMarker` -> `getUsjMarkerAction` -> `$insertNote`)
 * must produce a NoteNode whose content keeps its char spans (`\fr`+`\ft`, `\xo`+`\xt`). Live
 * QA in Platform.Bible showed the note coming out EMPTY: `$createNoteChildren` built char spans
 * WITHOUT the opening MarkerNode glyph that editable markerMode requires, so
 * `$charNodeDeletionTransform` unwrapped every span back to plain text in the same commit.
 * The narrower unit tests missed it because they run WITHOUT `MarkerEditPlugin` mounted and in
 * `markerMode: "hidden"` (not the app's editable), so that transform never ran.
 */
describe("note insertion in standard view (MarkerEditPlugin active)", () => {
  async function insertNoteAfterSeedText(marker: string) {
    const { editor } = await testEnvironment(() => {
      $appendVersePara();
    });
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren()[0];
        if (!$isElementNode(para)) throw new Error("seed paragraph not found");
        const textNode = para
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent().includes("beginning"));
        if (!$isTextNode(textNode)) throw new Error("seed text node not found");
        textNode.select(3, 3); // collapsed caret inside the verse text
        $insertNote(
          marker,
          undefined,
          undefined,
          { book: "RUT", chapterNum: 1, verseNum: 1 },
          viewOptions,
          {},
          undefined,
        );
      });
    });
    return editor;
  }

  /** Assert a char span is a valid editable span: opening MarkerNode glyph first, NBSP-prefixed text. */
  function expectEditableChar(char: CharNode, marker: string) {
    expect(char.getMarker()).toBe(marker);
    const first = char.getChildren()[0] as LexicalNode | undefined;
    expect($isMarkerNode(first) && first.getMarkerSyntax() === "opening").toBe(true);
    const contentText = char.getChildren().find((n) => $isTextNode(n) && !$isMarkerNode(n));
    expect(contentText?.getTextContent().startsWith(NBSP)).toBe(true);
  }

  it("keeps the \\fr and \\ft char spans in an inserted footnote", async () => {
    const editor = await insertNoteAfterSeedText("f");

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const charNodes = note.getChildren().filter($isCharNode);
      expect(charNodes.map((c) => c.getMarker())).toEqual(["fr", "ft"]);
      expectEditableChar(charNodes[0], "fr");
      expectEditableChar(charNodes[1], "ft");
      // The reference text survived (note is not empty).
      expect(note.getTextContent()).toContain("1:1");
    });
  });

  it("keeps the \\xo and \\xt char spans in an inserted cross-reference", async () => {
    const editor = await insertNoteAfterSeedText("x");

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const charNodes = note.getChildren().filter($isCharNode);
      expect(charNodes.map((c) => c.getMarker())).toEqual(["xo", "xt"]);
      expectEditableChar(charNodes[0], "xo");
      expectEditableChar(charNodes[1], "xt");
    });
  });
});

/**
 * Survivability: inserting a note in Standard view with EXPANDED notes (`markerMode: "editable"`,
 * `noteMode: "expanded"`) through the same path the app uses must not crash or corrupt. Expanded
 * notes are edited inline — the layout is the plain editable caller TEXT plus the content char
 * spans, with NO `ImmutableNoteCallerNode` widget — so nothing here may assume a caller widget
 * exists. The now-active standard-view whitespace transform and the char/note deletion transforms
 * must leave the caller text and char spans intact.
 */
describe("note insertion survives standard view with EXPANDED notes (MarkerEditPlugin active)", () => {
  async function insertExpandedNoteAfterSeedText(marker: string) {
    const { editor } = await testEnvironmentExpanded(() => {
      $appendVersePara();
    });
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren()[0];
        if (!$isElementNode(para)) throw new Error("seed paragraph not found");
        const textNode = para
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent().includes("beginning"));
        if (!$isTextNode(textNode)) throw new Error("seed text node not found");
        textNode.select(3, 3); // collapsed caret inside the verse text
        $insertNote(
          marker,
          undefined,
          undefined,
          { book: "RUT", chapterNum: 1, verseNum: 1 },
          expandedViewOptions,
          {},
          undefined,
        );
      });
    });
    return editor;
  }

  it("builds an inline-expanded footnote with editable caller text, no caller widget, and surviving char spans", async () => {
    const editor = await insertExpandedNoteAfterSeedText("f");

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot()) as NoteNode;
      // Expanded and edited inline — the collapsed-only caller widget must be absent.
      expect(note.getIsCollapsed()).toBe(false);
      expect(note.getChildren().some($isImmutableNoteCallerNode)).toBe(false);
      // The editable caller text is present and was neither forced to NBSP nor ejected.
      const noteTexts = note
        .getChildren()
        .filter($isTextNode)
        .map((t) => t.getTextContent());
      expect(noteTexts).toContain(getEditableCallerText("+"));
      // Char spans survived (not unwrapped back to plain text by $charNodeDeletionTransform).
      const charNodes = note.getChildren().filter($isCharNode);
      expect(charNodes.map((c) => c.getMarker())).toEqual(["fr", "ft"]);
      expect(note.getTextContent()).toContain("1:1");
    });
  });
});
