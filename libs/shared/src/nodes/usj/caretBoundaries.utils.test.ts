import { $caretHostAtBoundary, $placeCaretAtBoundary } from "./caretBoundaries.utils.js";
import { $createParaNode, ParaNode } from "./ParaNode.js";
import { $createImmutableTypedTextNode } from "../features/ImmutableTypedTextNode.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { NBSP } from "./node-constants.js";
import { $createTextNode, $getRoot, LexicalEditor, TextNode } from "lexical";
import { describe, expect, it } from "vitest";
import { $expectSelectionToBe, createBasicTestEnvironment } from "./test.utils.js";

/**
 * The editable-marker-mode paragraph shape the prefix-skipping callers work in:
 * `[glyph, separator, content]`, with the content text returned for assertions. The separator is
 * token-mode, as the builders make it, so Lexical does not merge it into the content text.
 */
function buildPrefixedPara(): { editor: LexicalEditor; para: ParaNode; content: TextNode } {
  const { editor } = createBasicTestEnvironment();
  let para!: ParaNode;
  let content!: TextNode;
  editor.update(
    () => {
      para = $createParaNode("q1");
      content = $createTextNode("in the beginning");
      $getRoot().append(
        para.append($createMarkerNode("q1"), $createTextNode(NBSP).setMode("token"), content),
      );
    },
    { discrete: true },
  );
  return { editor, para, content };
}

describe("$caretHostAtBoundary", () => {
  it("returns the text node that follows the boundary", () => {
    const { editor, para, content } = buildPrefixedPara();

    editor.getEditorState().read(() => {
      expect($caretHostAtBoundary(para, 2)).toBe(content);
    });
  });

  it("returns undefined when a decorator follows the boundary", () => {
    const { editor } = createBasicTestEnvironment();
    let para!: ParaNode;
    editor.update(
      () => {
        para = $createParaNode("q1");
        $getRoot().append(
          para.append(
            $createImmutableTypedTextNode("marker", `\\q1${NBSP}`),
            $createTextNode("in the beginning"),
          ),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($caretHostAtBoundary(para, 0)).toBeUndefined();
    });
  });

  it("returns undefined at the boundary past the last child", () => {
    const { editor, para } = buildPrefixedPara();

    editor.getEditorState().read(() => {
      expect($caretHostAtBoundary(para, 3)).toBeUndefined();
    });
  });

  it("counts a marker glyph as a host, since hosting asks the tree and not the view", () => {
    const { editor, para } = buildPrefixedPara();

    editor.getEditorState().read(() => {
      // A MarkerNode is a TextNode subclass, so it carries a text point like any other text. Which
      // boundaries are LEGAL is each caller's own rule; this one only answers what can host a caret.
      expect($caretHostAtBoundary(para, 0)?.getTextContent()).toBe("\\q1");
    });
  });
});

describe("$placeCaretAtBoundary", () => {
  it("collapses the caret to offset 0 of the hosting text node", () => {
    const { editor, para, content } = buildPrefixedPara();

    editor.update(
      () => {
        $placeCaretAtBoundary(para, 2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      $expectSelectionToBe(content, 0);
    });
  });

  it("collapses the caret to an element point when a decorator follows the boundary", () => {
    const { editor } = createBasicTestEnvironment();
    let para!: ParaNode;
    editor.update(
      () => {
        para = $createParaNode("q1");
        $getRoot().append(
          para.append(
            $createTextNode("in the beginning"),
            $createImmutableTypedTextNode("marker", `\\q1${NBSP}`),
          ),
        );
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $placeCaretAtBoundary(para, 1);
      },
      { discrete: true },
    );

    // An element point: nothing renders a caret here, which is the state the empty-verse caret
    // guard detects with $caretHostAtBoundary and repairs.
    editor.getEditorState().read(() => {
      $expectSelectionToBe(para, 1);
    });
  });

  it("collapses the caret to an element point at the boundary past the last child", () => {
    const { editor } = createBasicTestEnvironment();
    let para!: ParaNode;
    editor.update(
      () => {
        para = $createParaNode("q1");
        $getRoot().append(para.append($createMarkerNode("q1"), $createTextNode(NBSP)));
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $placeCaretAtBoundary(para, 2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      $expectSelectionToBe(para, 2);
    });
  });
});
