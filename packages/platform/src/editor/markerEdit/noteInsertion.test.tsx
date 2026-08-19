import {
  $appendVersePara,
  expandedViewOptions,
  findOnlyNote,
  testEnvironment,
  testEnvironmentExpanded,
  viewOptions,
} from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
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

/**
 * Regression: inserting a note with the caret at the END of a closed char span's content — the
 * boundary immediately before its closing glyph — must keep that closing glyph.
 *
 * Reported against two consecutive non-nested inline markers, and it is the most ordinary gesture
 * there is: put the caret at the end of the word, or select the word, then add a footnote. Both
 * land on that boundary. Lexical's generic `selection.insertNodes()` treats it as a place to SPLIT
 * the span, leaving a content half plus a second span holding nothing but the orphaned `\nd*`;
 * `$charNodeDeletionTransform` reads that half's missing opener as "opener deleted" and
 * `$unwrapCharNode` drops every marker glyph on unwrap, so the closer was destroyed. The screen
 * showed a still-styled word while the file lost the span's end — the silent divergence Invariant I
 * forbids.
 *
 * Placing the note at the caret INSIDE the span (the shape re-tokenizing the displayed bytes
 * `\nd Lord<note>\nd*` produces) is what a mid-content caret already did; this makes the span's
 * content end behave the same way instead of destroying bytes.
 */
describe("note insertion at a closed char span's content end (N1)", () => {
  /** `\p \nd Lord\nd*\add word\add*` — two consecutive, non-nested inline markers. */
  function $seedConsecutiveSpans() {
    const para = $createParaNode("p");
    $getRoot().append(
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createCharNode("nd").append(
          $createMarkerNode("nd"),
          $createTextNode(`${NBSP}Lord`),
          $createMarkerNode("nd", "closing"),
        ),
        $createCharNode("add").append(
          $createMarkerNode("add"),
          $createTextNode(`${NBSP}word`),
          $createMarkerNode("add", "closing"),
        ),
      ),
    );
  }

  /** The paragraph's char span at `index`, by its position among the paragraph's children. */
  function $spanAt(index: number): CharNode {
    const para = $getRoot().getChildren()[0];
    if (!$isElementNode(para)) throw new Error("seed paragraph not found");
    const span = para.getChildren()[index];
    if (!$isCharNode(span)) throw new Error(`no char span at child index ${index}`);
    return span;
  }

  /** A char span's content TextNode — the child that is text but not a marker glyph. */
  function $contentTextOf(char: CharNode): TextNode {
    const text = char.getChildren().find((node) => $isTextNode(node) && !$isMarkerNode(node));
    if (!$isTextNode(text)) throw new Error(`char span "${char.getMarker()}" has no content text`);
    return text;
  }

  function $insertFootnoteAtSelection() {
    $insertNote(
      "f",
      undefined,
      undefined,
      { book: "RUT", chapterNum: 1, verseNum: 1 },
      viewOptions,
      {},
      undefined,
    );
  }

  async function insertFootnoteWith($placeCaret: () => void) {
    const { editor } = await testEnvironment($seedConsecutiveSpans);
    await act(async () =>
      editor.update(() => {
        $placeCaret();
        $insertFootnoteAtSelection();
      }),
    );
    return editor;
  }

  /** The first paragraph's USJ content — the FILE side of the screen-vs-file comparison. */
  function paraUsjContent(editor: LexicalEditor): MarkerObject["content"] {
    initializeDeserialize(undefined);
    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
    return (usj?.content?.[0] as MarkerObject | undefined)?.content;
  }

  /** Assert the `\nd` span kept its closing glyph and swallowed the note, and `\add` is untouched. */
  function expectNoteInsideIntactNdSpan(editor: LexicalEditor) {
    editor.getEditorState().read(() => {
      const nd = $spanAt(2);
      const closers = nd
        .getChildren()
        .filter((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
      expect(closers).toHaveLength(1);
      // The note is the span's own child, and the closer is still last.
      expect(nd.getChildren().some($isNoteNode)).toBe(true);
      expect($isMarkerNode(nd.getLastChild()!)).toBe(true);
      // The neighbouring span is untouched.
      expect($spanAt(3).getTextContent()).toBe(`\\add${NBSP}word\\add*`);
    });

    // The file agrees with the screen: a CLOSED \nd span, so no derived closed="false".
    const content = paraUsjContent(editor);
    const nd = content?.[0] as MarkerObject;
    expect(nd.marker).toBe("nd");
    expect(nd.closed).toBeUndefined();
    expect(nd.content?.some((item) => (item as MarkerObject)?.type === "note")).toBe(true);
    expect((content?.[1] as MarkerObject).marker).toBe("add");
  }

  it("keeps the closing glyph when the caret is at the span's content end", async () => {
    const editor = await insertFootnoteWith(() => {
      const text = $contentTextOf($spanAt(2));
      text.select(text.getTextContentSize(), text.getTextContentSize());
    });
    expectNoteInsideIntactNdSpan(editor);
  });

  it("keeps the closing glyph when the caret is at the START of the closing glyph", async () => {
    // The same boundary addressed from the other side — the caret Lexical reports after an
    // arrow-left off the closer, rather than after a click at the end of the word.
    const editor = await insertFootnoteWith(() => {
      const closer = $spanAt(2).getLastChild();
      if (!$isTextNode(closer)) throw new Error("closing glyph not found");
      closer.select(0, 0);
    });
    expectNoteInsideIntactNdSpan(editor);
  });

  it("keeps the closing glyph when the span's content is SELECTED (footnote over a word)", async () => {
    // A non-collapsed selection collapses to its end before insertion, landing on the same
    // boundary. The selected word also becomes the note's `\fq` quotation.
    const editor = await insertFootnoteWith(() => {
      const text = $contentTextOf($spanAt(2));
      text.select(1, text.getTextContentSize()); // "Lord", past the structural NBSP prefix
    });
    expectNoteInsideIntactNdSpan(editor);
    editor.getEditorState().read(() => {
      const quotation = $spanAt(2)
        .getChildren()
        .filter($isNoteNode)[0]
        .getChildren()
        .filter($isCharNode)
        .find((char) => char.getMarker() === "fq");
      expect(quotation?.getTextContent()).toContain("Lord");
    });
  });

  it("still nests at a mid-content caret, closer intact", async () => {
    const editor = await insertFootnoteWith(() => {
      $contentTextOf($spanAt(2)).select(3, 3); // NBSP + "Lo" | "rd"
    });
    expectNoteInsideIntactNdSpan(editor);
    editor.getEditorState().read(() => {
      // The content really was split around the note rather than all landing on one side.
      const children = $spanAt(2).getChildren();
      const noteIndex = children.findIndex($isNoteNode);
      expect(
        children
          .slice(0, noteIndex)
          .map((c) => c.getTextContent())
          .join(""),
      ).toBe(`\\nd${NBSP}Lo`);
      expect(
        children
          .slice(noteIndex + 1)
          .map((c) => c.getTextContent())
          .join(""),
      ).toBe("rd\\nd*");
    });
  });

  it("still places the note OUTSIDE the span when the caret is past the closing glyph", async () => {
    const editor = await insertFootnoteWith(() => {
      const closer = $spanAt(2).getLastChild();
      if (!$isTextNode(closer)) throw new Error("closing glyph not found");
      closer.select(closer.getTextContentSize(), closer.getTextContentSize());
    });
    editor.getEditorState().read(() => {
      expect($spanAt(2).getTextContent()).toBe(`\\nd${NBSP}Lord\\nd*`);
      expect($spanAt(2).getChildren().some($isNoteNode)).toBe(false);
      const para = $getRoot().getChildren()[0];
      if (!$isElementNode(para)) throw new Error("seed paragraph not found");
      expect(para.getChildren().some($isNoteNode)).toBe(true);
    });
    const content = paraUsjContent(editor);
    expect((content?.[0] as MarkerObject).marker).toBe("nd");
    expect((content?.[0] as MarkerObject).closed).toBeUndefined();
    expect((content?.[1] as MarkerObject).type).toBe("note");
  });
});
