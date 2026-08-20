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
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  CharNode,
  getEditableCallerText,
  getVisibleOpenMarkerText,
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
describe("note insertion at a closed char span's content end", () => {
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
      expect($isMarkerNode(nd.getLastChild())).toBe(true);
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

/**
 * Forward pin for the report that inserting a footnote (Ctrl+T) with the caret on a verse-number
 * marker duplicates the verse digit into body text.
 *
 * Reproduced against this branch and its base: GREEN at both, so nothing here fixed it and it
 * was never broken at either. It is pinned anyway because it
 * rides the insertion path the closing-glyph defect above DID break, and a verse marker is the
 * other place that path meets engine-owned display bytes — the verse number is display text, so an
 * insertion that split the glyph would copy the digit into the document as content.
 */
describe("footnote insertion on a verse marker keeps the verse number out of body text", () => {
  it("leaves one verse, still numbered, and the body text untouched", async () => {
    const { editor } = await testEnvironment(() => {
      const verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode("In the beginning"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren()[0];
        if (!$isElementNode(para)) throw new Error("seed paragraph not found");
        // The caret ON the verse glyph — where Ctrl+T was pressed in the report.
        const verseGlyph = para
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent().includes("5"));
        if (!$isTextNode(verseGlyph)) throw new Error("verse glyph not found");
        verseGlyph.select(verseGlyph.getTextContentSize(), verseGlyph.getTextContentSize());
        $insertNote(
          "f",
          undefined,
          undefined,
          { book: "RUT", chapterNum: 1, verseNum: 5 },
          viewOptions,
          {},
          undefined,
        );
      }),
    );

    initializeDeserialize(undefined);
    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
    const content = (usj?.content?.[0] as MarkerObject).content ?? [];
    const verses = content.filter(
      (item): item is MarkerObject =>
        typeof item === "object" && (item as MarkerObject).type === "verse",
    );
    expect(verses).toHaveLength(1);
    expect(verses[0].number).toBe("5");
    // The digit did not leak into the document as content.
    expect(content.filter((item) => typeof item === "string").join("")).toBe("In the beginning");
  });
});

/**
 * The SAME gesture at every caret position a verse glyph offers.
 *
 * The pin above drives it at one position — the very end of the glyph. In editable-marker mode a
 * verse marker is ordinary rendered text the caret walks a character at a time, so the glyph
 * `\v` + NBSP + `5` + space hosts six caret positions. The glyph's bytes are display: the verse
 * NUMBER lives in the node's state, and the rendered text is a picture of it. A note dropped
 * between two of those bytes would split the picture and hand the right-hand half to the document
 * as content — the reported defect, the verse number arriving in the file as text.
 *
 * So the glyph is atomic for insertion. Its two ENDS are ordinary document positions and mean what
 * they say: before the verse, and after it. Every position between them resolves to the trailing
 * end, which is where a caret that has already crossed the glyph's first byte is heading.
 */
describe("footnote insertion INSIDE a verse glyph keeps the glyph whole", () => {
  /** `\v` `5` and the separators — the six caret positions of `\v` + NBSP + `5` + space. */
  const verseGlyph = getVisibleOpenMarkerText("v", "5");

  async function insertFootnoteAtGlyphOffset(offset: number) {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createVerseNode("5", verseGlyph),
          $createTextNode("In the beginning"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren()[0];
        if (!$isElementNode(para)) throw new Error("seed paragraph not found");
        const glyph = para
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent() === verseGlyph);
        if (!$isTextNode(glyph)) throw new Error("verse glyph not found");
        glyph.select(offset, offset);
        $insertNote(
          "f",
          undefined,
          undefined,
          { book: "RUT", chapterNum: 1, verseNum: 5 },
          viewOptions,
          {},
          undefined,
        );
      }),
    );
    initializeDeserialize(undefined);
    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
    const content = (usj?.content?.[0] as MarkerObject).content ?? [];
    return {
      // Ordered `type:marker` tags and literal text runs — where the note landed, not just what
      // survived.
      shape: content.map((item) =>
        typeof item === "string"
          ? item
          : `${(item as MarkerObject).type}:${(item as MarkerObject).marker}`,
      ),
      verseNumbers: content
        .filter(
          (item): item is MarkerObject =>
            typeof item === "object" && (item as MarkerObject).type === "verse",
        )
        .map((verse) => verse.number),
      bodyText: content.filter((item) => typeof item === "string").join(""),
    };
  }

  it("puts the note BEFORE the verse at the glyph's leading end", async () => {
    expect(verseGlyph).toBe(`\\v${NBSP}5 `);
    expect(await insertFootnoteAtGlyphOffset(0)).toEqual({
      shape: ["note:f", "verse:v", "In the beginning"],
      verseNumbers: ["5"],
      bodyText: "In the beginning",
    });
  });

  it("puts the note AFTER the verse at the glyph's trailing end", async () => {
    expect(await insertFootnoteAtGlyphOffset(verseGlyph.length)).toEqual({
      shape: ["verse:v", "note:f", "In the beginning"],
      verseNumbers: ["5"],
      bodyText: "In the beginning",
    });
  });

  it.each([1, 2, 3, 4])(
    "resolves the interior caret at offset %i to the glyph's trailing end",
    async (offset) => {
      // Offset 1 (`\|v 5 `) used to destroy the verse outright, leaving a lone `\` and handing
      // `v 5 ` to the document as body text. Offsets 2 and 3 (`\v| 5 `, `\v |5 `) left the verse
      // numbered 5 AND leaked the digit into the file as content — the same 5 twice. Offset 4
      // (`\v 5| `) leaked only the structural space, as a fabricated leading space on the body
      // text. All four now land exactly where offset 5 does.
      expect(await insertFootnoteAtGlyphOffset(offset)).toEqual({
        shape: ["verse:v", "note:f", "In the beginning"],
        verseNumbers: ["5"],
        bodyText: "In the beginning",
      });
    },
  );
});
