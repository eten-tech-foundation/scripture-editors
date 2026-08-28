import { describe, expect, it } from "vitest";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createBookNode,
  $createGutterMarkerNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  BookNode,
  ImmutableTypedTextNode,
  MarkerNode,
  NBSP,
  ParaNode,
  VerseNode,
} from "shared";
import { $createImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj";
// Reaching inside shared for test utilities — shared-react depends on shared, but these
// utilities are not part of the public API, so the module-boundary rule is suppressed.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../shared/src/nodes/usj/test.utils";
import {
  $advancePastParaPrefixes,
  $guardCursorAtGutterMarker,
  $guardCursorAtParaStart,
  $guardCursorOnClick,
} from "./ParaMarkerPrefixCursorGuardPlugin";

const nodes = [
  BookNode,
  ParaNode,
  VerseNode,
  ImmutableVerseNode,
  MarkerNode,
  ImmutableTypedTextNode,
];

function runGuard(editor: LexicalEditor): boolean {
  let corrected = false;
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) corrected = $guardCursorAtParaStart(selection);
    },
    { discrete: true },
  );
  return corrected;
}

/** Runs the gutter-marker click correction against the glyph node's own rendered element. */
function runGutterGuard(editor: LexicalEditor, glyphKey: string): boolean {
  let corrected = false;
  editor.update(
    () => {
      corrected = $guardCursorAtGutterMarker(editor.getElementByKey(glyphKey));
    },
    { discrete: true },
  );
  return corrected;
}

// The product rule is about ONE node at a time: a marker the view renders in the GUTTER is an aid,
// never a place the caret may rest, while a marker rendered as editable text IS content the user
// clicks into on purpose. Neither fact is a property of the view mode — a document can carry both
// flavors at once — so every test here states which flavor the paragraph's marker is and asserts
// the guard's answer for that flavor alone.
describe("which markers are caret territory is a per-node question", () => {
  describe("editable marker glyphs (a MarkerNode, e.g. Standard view)", () => {
    it("leaves an element-0 click alone instead of advancing past the marker prefix", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q1");
        content = $createTextNode("Blessed is the man");
        $getRoot().append(para.append($createMarkerNode("q1"), $createTextNode(NBSP), content));
      });

      updateSelection(editor, para, 0);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection");
        // Lexical resolves an element point at offset 0 onto the first child, so the caret sits in
        // the marker glyph — where the click aimed. What must NOT happen is the guard hauling it
        // past the prefix to the content, which is the correction the gutter views need.
        expect(selection.anchor.key).not.toBe(content.getKey());
      });
    });

    it("leaves a click INSIDE the glyph alone — it is editable text", () => {
      let glyph!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        glyph = $createMarkerNode("q1");
        const para = $createParaNode("q1");
        $getRoot().append(
          para.append(glyph, $createTextNode(NBSP), $createTextNode("Blessed is the man")),
        );
      });

      updateSelection(editor, glyph, 2);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(glyph, 2);
      });
    });

    it("leaves a click on the glyph's own element alone — it is not a gutter marker", () => {
      let glyphKey = "";
      let glyph!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        glyph = $createMarkerNode("q1");
        glyphKey = glyph.getKey();
        const para = $createParaNode("q1");
        $getRoot().append(
          para.append(glyph, $createTextNode(NBSP), $createTextNode("Blessed is the man")),
        );
      });

      updateSelection(editor, glyph, 2);

      expect(runGutterGuard(editor, glyphKey)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(glyph, 2);
      });
    });
  });

  describe("gutter marker glyphs (the paragraph-structure aid)", () => {
    it("moves a click ON the glyph to the paragraph's content text", () => {
      let glyphKey = "";
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const gutterMarker = $createGutterMarkerNode(`\\q1${NBSP}`);
        glyphKey = gutterMarker.getKey();
        content = $createTextNode("Blessed is the man");
        $getRoot().append($createParaNode("q1").append(gutterMarker, content));
      });

      expect(runGutterGuard(editor, glyphKey)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });

    it("moves a click ON the glyph past a leading verse marker too", () => {
      let glyphKey = "";
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const gutterMarker = $createGutterMarkerNode(`\\q1${NBSP}`);
        glyphKey = gutterMarker.getKey();
        content = $createTextNode("Blessed is the man");
        $getRoot().append(
          $createParaNode("q1").append(gutterMarker, $createImmutableVerseNode("1"), content),
        );
      });

      expect(runGutterGuard(editor, glyphKey)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });

    it("moves a click on a book's gutter marker to the book's text", () => {
      let glyphKey = "";
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const gutterMarker = $createGutterMarkerNode(`\\id${NBSP}`);
        glyphKey = gutterMarker.getKey();
        content = $createTextNode("World English Bible");
        $getRoot().append($createBookNode("PSA").append(gutterMarker, content));
      });

      expect(runGutterGuard(editor, glyphKey)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });

    it("moves an element-0 click in the paragraph to the content text", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("Blessed is the man");
        para = $createParaNode("q1");
        $getRoot().append(para.append($createGutterMarkerNode(`\\q1${NBSP}`), content));
      });

      // A click in the hanging indent resolves to the element point just before the glyph.
      updateSelection(editor, para, 0);

      expect(runGuard(editor)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });
  });

  // markerMode "visible" renders the same node class INLINE among the words, so the node type alone
  // cannot tell the two apart — only the gutter metadata can, and only the gutter flavor is claimed.
  describe("inline immutable marker glyphs (markerMode visible)", () => {
    it("leaves a click on the glyph's own element alone", () => {
      let glyphKey = "";
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const inlineMarker = $createImmutableTypedTextNode("marker", `\\q1${NBSP}`);
        glyphKey = inlineMarker.getKey();
        content = $createTextNode("Blessed is the man");
        $getRoot().append($createParaNode("q1").append(inlineMarker, content));
      });

      updateSelection(editor, content, 4);

      expect(runGutterGuard(editor, glyphKey)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 4);
      });
    });
  });
});

// Lexical's own click listener routes the browser event into `CLICK_COMMAND`, and the update it
// opens commits on a microtask — so each of these awaits one before reading the committed state.
describe("ParaMarkerPrefixCursorGuardPlugin click handling (real DOM click)", () => {
  it("moves the caret to content when the click lands on a gutter marker element", async () => {
    let glyphKey = "";
    let content!: TextNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const gutterMarker = $createGutterMarkerNode(`\\q1${NBSP}`);
      glyphKey = gutterMarker.getKey();
      content = $createTextNode("Blessed is the man");
      $getRoot().append($createParaNode("q1").append(gutterMarker, content));
    });

    // The same registration the plugin mounts via useEffect.
    editor.registerCommand<MouseEvent>(
      CLICK_COMMAND,
      (event) => {
        $guardCursorOnClick(event);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    const glyphElement = editor.getElementByKey(glyphKey);
    if (!glyphElement) throw new Error("gutter marker element not rendered");
    // A click on the glyph itself: the browser draws a caret inside this decorator, and Lexical
    // cannot resolve that DOM position to any point in the tree — so the correction has to come
    // from the click's target, not from the (absent) selection.
    glyphElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    editor.getEditorState().read(() => {
      $expectSelectionToBe(content, 0);
    });
  });

  it("leaves a click in ordinary content where it landed", async () => {
    let content!: TextNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      content = $createTextNode("Blessed is the man");
      $getRoot().append(
        $createParaNode("q1").append($createGutterMarkerNode(`\\q1${NBSP}`), content),
      );
    });

    editor.registerCommand<MouseEvent>(
      CLICK_COMMAND,
      (event) => {
        $guardCursorOnClick(event);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    updateSelection(editor, content, 7);
    const contentElement = editor.getElementByKey(content.getKey());
    if (!contentElement) throw new Error("content element not rendered");
    contentElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    editor.getEditorState().read(() => {
      $expectSelectionToBe(content, 7);
    });
  });
});

describe("$guardCursorAtParaStart", () => {
  describe("hidden mode: ImmutableVerseNode as first child (Simple view)", () => {
    it("moves element-0 cursor past the verse to the content TextNode", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("in the beginning");
        para = $createParaNode("li2");
        $getRoot().append(para.append($createImmutableVerseNode("7"), content));
      });

      updateSelection(editor, para, 0);

      // SUT
      expect(runGuard(editor)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });

    it("is a no-op when the cursor is already in the content TextNode", () => {
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("in the beginning");
        const para = $createParaNode("li2");
        $getRoot().append(para.append($createImmutableVerseNode("7"), content));
      });

      updateSelection(editor, content, 3);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 3);
      });
    });

    it("is a no-op for a non-collapsed selection spanning verse and content", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("in the beginning");
        para = $createParaNode("li2");
        $getRoot().append(para.append($createImmutableVerseNode("7"), content));
      });

      updateSelection(editor, para, 0, content, 5);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para, 0, content, 5);
      });
    });
  });

  // An editable glyph is a TextNode: it hosts a caret, so nothing here is corrected — not even
  // with a verse marker sitting between the prefix and the content.
  describe("editable mode: MarkerNode as first child (Power view)", () => {
    it("is a no-op for an element-0 cursor before an editable marker prefix", () => {
      let para!: ParaNode;
      let marker!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        marker = $createMarkerNode("li2");
        para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            marker,
            $createTextNode(NBSP),
            $createVerseNode("7"),
            $createTextNode("in the beginning"),
          ),
        );
      });

      updateSelection(editor, para, 0);

      // SUT
      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        // Lexical resolves an element point at offset 0 onto the first child, so the caret rests
        // in the marker glyph — the click's own target — rather than being hauled to the content.
        $expectSelectionToBe(marker, 0);
      });
    });

    it("is a no-op for a text cursor inside the MarkerNode (first child)", () => {
      let marker!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        marker = $createMarkerNode("li2");
        const para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            marker,
            $createTextNode(NBSP),
            $createVerseNode("7"),
            $createTextNode("in the beginning"),
          ),
        );
      });

      updateSelection(editor, marker, 0);

      // SUT
      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(marker, 0);
      });
    });

    it("is a no-op for a mid-marker text cursor", () => {
      let marker!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        marker = $createMarkerNode("li2");
        const para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            marker,
            $createTextNode(NBSP),
            $createVerseNode("7"),
            $createTextNode("in the beginning"),
          ),
        );
      });

      updateSelection(editor, marker, 2);

      // SUT
      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(marker, 2);
      });
    });

    it("is a no-op when cursor is at offset 1 in the NBSP trailing space", () => {
      let nbsp!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        nbsp = $createTextNode(NBSP);
        const para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            $createMarkerNode("li2"),
            nbsp,
            $createVerseNode("7"),
            $createTextNode("in the beginning"),
          ),
        );
      });

      updateSelection(editor, nbsp, 1);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(nbsp, 1);
      });
    });

    it("is a no-op for a non-collapsed selection", () => {
      let marker!: MarkerNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        marker = $createMarkerNode("li2");
        content = $createTextNode("in the beginning");
        const para = $createParaNode("li2");
        $getRoot().append(
          para.append(marker, $createTextNode(NBSP), $createVerseNode("7"), content),
        );
      });

      updateSelection(editor, marker, 0, content, 3);

      expect(runGuard(editor)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(marker, 0, content, 3);
      });
    });
  });

  // Either flavor of immutable glyph — gutter aid or markerMode "visible" inline text — is a
  // decorator, so an element point before it renders no caret at all. That is what the element-0
  // correction is about, and it is a property of the node in the tree, not of the view.
  describe("gutter/visible mode: ImmutableTypedTextNode as first child", () => {
    it("moves element-0 cursor past the marker prefix and verse to content", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("in the beginning");
        para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            $createImmutableTypedTextNode("marker", `\\li2${NBSP}`),
            $createImmutableVerseNode("7"),
            content,
          ),
        );
      });

      updateSelection(editor, para, 0);

      // SUT
      expect(runGuard(editor)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });
  });
});

describe("$advancePastParaPrefixes", () => {
  it("places cursor at element-offset skipCount when no content TextNode exists yet", () => {
    let para!: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      para = $createParaNode("li2");
      // All-prefix para: no content TextNode, only structural nodes.
      $getRoot().append(
        para.append($createMarkerNode("li2"), $createTextNode(NBSP), $createVerseNode("7")),
      );
    });

    editor.update(
      () => {
        // SUT: called directly as ScriptureReferencePlugin would call it.
        $advancePastParaPrefixes(para);
      },
      { discrete: true },
    );

    // Cursor should land at element-offset 3 (after all three prefix children).
    editor.getEditorState().read(() => {
      $expectSelectionToBe(para, 3);
    });
  });
});

describe("ParaMarkerPrefixCursorGuardPlugin (CLICK_COMMAND integration)", () => {
  it("corrects element-0 cursor when CLICK_COMMAND fires", () => {
    let para!: ParaNode;
    let content!: TextNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      content = $createTextNode("in the beginning");
      para = $createParaNode("li2");
      $getRoot().append(para.append($createImmutableVerseNode("7"), content));
    });

    // Register the same CLICK_COMMAND handler the plugin mounts via useEffect.
    editor.registerCommand<MouseEvent>(
      CLICK_COMMAND,
      (event) => {
        $guardCursorOnClick(event);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    // Put cursor in the bad position a click in the hanging-indent gutter produces.
    updateSelection(editor, para, 0);

    // Wrapping dispatchCommand in a discrete update forces Lexical to run the command handlers
    // synchronously (Lexical only runs them inline when editor._updating is true). Outside an
    // active update, dispatchCommand is scheduled asynchronously.
    editor.update(
      () => {
        editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      $expectSelectionToBe(content, 0);
    });
  });

  it("is a no-op when cursor is already past all prefix nodes", () => {
    let content!: TextNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      content = $createTextNode("in the beginning");
      const para = $createParaNode("li2");
      $getRoot().append(para.append($createImmutableVerseNode("7"), content));
    });

    editor.registerCommand<MouseEvent>(
      CLICK_COMMAND,
      (event) => {
        $guardCursorOnClick(event);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    updateSelection(editor, content, 4);
    editor.update(
      () => {
        editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      $expectSelectionToBe(content, 4);
    });
  });
});
