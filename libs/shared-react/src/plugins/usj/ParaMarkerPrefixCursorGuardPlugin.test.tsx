import { describe, expect, it } from "vitest";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  TextNode,
} from "lexical";
import {
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
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
  $guardCursorAtParaStart,
} from "./ParaMarkerPrefixCursorGuardPlugin";

const nodes = [ParaNode, VerseNode, ImmutableVerseNode, MarkerNode, ImmutableTypedTextNode];

function runGuard(
  editor: ReturnType<typeof createBasicTestEnvironment>["editor"],
  markersAreInline = false,
): boolean {
  let corrected = false;
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        corrected = $guardCursorAtParaStart(selection, markersAreInline);
    },
    { discrete: true },
  );
  return corrected;
}

describe("marker rendering decides whether the prefix is caret territory", () => {
  // Standard view renders a paragraph's marker INLINE as editable text, so it is content the user
  // clicks into deliberately — to edit the marker. Correcting a click there (or anywhere else in
  // the paragraph) fights the user: clicking must land where it was aimed, and arrow keys must be
  // able to reach the same positions a click can.
  describe("inline markers (markerMode editable, e.g. Standard view)", () => {
    it("leaves an element-0 click alone instead of advancing past the marker prefix", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q1");
        content = $createTextNode("Blessed is the man");
        $getRoot().append(
          para.append($createMarkerNode("q1"), $createTextNode(NBSP), content),
        );
      });

      updateSelection(editor, para, 0);

      expect(runGuard(editor, true)).toBe(false);

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection");
        // Lexical resolves an element point at offset 0 onto the first child, so the caret sits in
        // the marker glyph — where the click aimed. What must NOT happen is the guard hauling it
        // past the prefix to the content, which is the correction the gutter views need.
        expect(selection.anchor.key).not.toBe(content.getKey());
      });
    });

    it("leaves a click INSIDE the inline marker glyph alone — it is editable text", () => {
      let glyph!: MarkerNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        glyph = $createMarkerNode("q1");
        const para = $createParaNode("q1");
        $getRoot().append(
          para.append(glyph, $createTextNode(NBSP), $createTextNode("Blessed is the man")),
        );
      });

      updateSelection(editor, glyph, 2);

      expect(runGuard(editor, true)).toBe(false);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(glyph, 2);
      });
    });
  });

  // Simple's gutter view renders the marker OUTSIDE the text flow, as a decorator. Nothing there is
  // editable, so no caret position inside it is reachable by arrow keys — a click that lands there
  // must be pulled to the nearest real content position, or the caret sits somewhere the keyboard
  // can never return to.
  describe("gutter markers (markerMode hidden with a visible marker node)", () => {
    it("moves a click that landed on the gutter marker to the content text", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const gutterMarker = $createImmutableTypedTextNode("marker", "\\q1 ");
        content = $createTextNode("Blessed is the man");
        para = $createParaNode("q1");
        $getRoot().append(para.append(gutterMarker, content));
      });

      // A click on a decorator resolves to the element point just before it.
      updateSelection(editor, para, 0);

      expect(runGuard(editor, false)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
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

  describe("editable mode: MarkerNode as first child (Power view)", () => {
    it("moves element-0 cursor past marker, NBSP, and verse to the content TextNode", () => {
      let para!: ParaNode;
      let content!: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        content = $createTextNode("in the beginning");
        para = $createParaNode("li2");
        $getRoot().append(
          para.append(
            $createMarkerNode("li2"),
            $createTextNode(NBSP),
            $createVerseNode("7"),
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

    it("moves text cursor inside MarkerNode (first child) to the content TextNode", () => {
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

      updateSelection(editor, marker, 0);

      // SUT
      expect(runGuard(editor)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
      });
    });

    it("moves mid-marker text cursor to the content TextNode", () => {
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

      updateSelection(editor, marker, 2);

      // SUT
      expect(runGuard(editor)).toBe(true);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(content, 0);
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
    editor.registerCommand(
      CLICK_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $guardCursorAtParaStart(selection, false);
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

    editor.registerCommand(
      CLICK_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $guardCursorAtParaStart(selection, false);
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
