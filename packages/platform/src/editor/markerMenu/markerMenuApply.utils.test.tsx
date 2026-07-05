import {
  $applyMarkerMenuSelection,
  $splitParagraphWithMarker,
  ApplyMarkerMenuSelectionDeps,
} from "./markerMenuApply.utils";
import { MarkerMenuItem } from "./markerItemSource";
import {
  historyTestEnvironment,
  testEnvironment,
  viewOptions,
} from "../markerEdit/markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  NBSP,
  textTypeState,
} from "shared";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** A paragraph's visible marker prefix's trailing NBSP separator, tagged so Lexical's TextNode
 * normalization won't merge it into the adjacent plain content TextNode (the untagged content
 * node's `NodeState` would otherwise be indistinguishable from this one's, and stock Lexical
 * merges adjacent same-state plain TextNodes - losing the content node's identity/key). */
function $createTrailingSpaceNode(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

const reference = { book: "GEN", chapterNum: 1, verseNum: 1 };

function makeDeps(): ApplyMarkerMenuSelectionDeps {
  return {
    expandedNoteKeyRef: { current: undefined },
    viewOptions,
    nodeOptions: {},
    logger: undefined,
  };
}

describe("$applyMarkerMenuSelection", () => {
  describe("open kind — literal-prefix cleanup", () => {
    it("removes exactly the literal '\\q' typed before the caret, then inserts a q1 para (single undo restores both)", async () => {
      let text: TextNode;
      const { editor } = await historyTestEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("Hello \\q");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () =>
        editor.update(() => {
          const length = text.getTextContent().length;
          text.select(length, length);
        }),
      );

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: true },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        expect(paras[0].getMarker()).toBe("p");
        // The literal "\q" is gone - only the plain "Hello " text remains.
        expect(paras[0].getTextContent()).not.toContain("\\q");
        expect(paras[0].getTextContent()).toContain("Hello");
        expect(paras[1].getMarker()).toBe("q1");
      });

      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(1);
        expect(paras[0].getMarker()).toBe("p");
        // A single undo step must fully restore the literal "\q" too.
        expect($getRoot().getTextContent()).toContain("Hello \\q");
      });
    });

    it("no-ops the cleanup when nothing literal precedes the caret", async () => {
      let text: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("Hello there");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () =>
        editor.update(() => {
          const length = text.getTextContent().length;
          text.select(length, length);
        }),
      );

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: true },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        // Nothing literal was there to delete - the full original text survives intact.
        expect(paras[0].getTextContent()).toContain("Hello there");
        expect(paras[1].getMarker()).toBe("q1");
      });
    });
  });

  describe("wrap kind — non-collapsed selection", () => {
    it("wraps the selected text in a char/wj span with no text deleted (literalPrefixLanded: false)", async () => {
      let text: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("say holy words");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(4, 8))); // "holy"

      const item: MarkerMenuItem = { marker: "wj", kind: "character", isBasic: true };
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para missing",
        );
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("wj");
        expect(chars[0].getTextContent()).toContain("holy");
        // The span keeps its opener/closer glyphs (editable marker mode) - MarkerEditPlugin's
        // own char-deletion transform would otherwise mistake a glyph-less span for one whose
        // opener the user just deleted, and immediately unwrap it right back to plain text.
        const markerChildren = chars[0].getChildren().filter($isMarkerNode);
        expect(markerChildren).toHaveLength(2);
        // No text was deleted - the full original words survive across the paragraph.
        expect(para.getTextContent()).toContain("say");
        expect(para.getTextContent()).toContain("words");
      });
    });
  });

  describe("closeTag kind", () => {
    it("closes an 'nd*' span with the caret mid-span: left half styled, right half plain", async () => {
      let char: ReturnType<typeof $createCharNode>;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        char = $createCharNode("nd");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            char.append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}Lord`),
              $createMarkerNode("nd", "closing"),
            ),
          ),
        );
      });
      await act(async () =>
        editor.update(() => {
          // caret between "Lo" and "rd" (content text is NBSP + "Lord")
          const content = char.getChildren()[1];
          if ($isTextNode(content)) content.select(3, 3);
        }),
      );

      const item: MarkerMenuItem = { marker: "nd*", kind: "closeTag", isBasic: false };
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para missing",
        );
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getTextContent()).toContain("Lo");
        const after = chars[0].getNextSibling();
        expect($isTextNode(after) && !$isMarkerNode(after)).toBe(true);
        expect($isTextNode(after) ? after.getTextContent() : undefined).toBe("rd");
      });
    });

    it("closes the inner 'wj' of an nd>wj nesting with '+wj*'", async () => {
      let innerChar: ReturnType<typeof $createCharNode>;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        const outerChar = $createCharNode("nd");
        innerChar = $createCharNode("wj");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            outerChar.append(
              $createMarkerNode("nd"),
              innerChar.append(
                $createMarkerNode("wj"),
                $createTextNode(`${NBSP}Peace`),
                $createMarkerNode("wj", "closing"),
              ),
              $createMarkerNode("nd", "closing"),
            ),
          ),
        );
      });
      await act(async () =>
        editor.update(() => {
          // caret between "Pea" and "ce" (content text is NBSP + "Peace")
          const content = innerChar.getChildren()[1];
          if ($isTextNode(content)) content.select(4, 4);
        }),
      );

      const item: MarkerMenuItem = { marker: "+wj*", kind: "closeTag", isBasic: false };
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para missing",
        );
        const outer = requireDefined(
          para
            .getChildren()
            .filter($isCharNode)
            .find((c) => c.getMarker() === "nd"),
          "outer nd span missing",
        );
        const wjSpans = outer
          .getChildren()
          .filter($isCharNode)
          .filter((c) => c.getMarker() === "wj");
        expect(wjSpans).toHaveLength(1);
        expect(wjSpans[0].getTextContent()).toContain("Pea");
        const after = wjSpans[0].getNextSibling();
        // The tail "ce" left the wj span and is still inside the outer nd span.
        expect($isTextNode(after) && !$isMarkerNode(after)).toBe(true);
        expect($isTextNode(after) ? after.getTextContent() : undefined).toBe("ce");
        expect(outer.getMarker()).toBe("nd"); // outer span untouched by the inner close
      });
    });
  });
});

describe("$splitParagraphWithMarker", () => {
  it("splits a 'p' paragraph mid-text into [p(left), q2(right w/ visible prefix)] (single undo restores)", async () => {
    let text: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("one two");
      $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
    });
    await act(async () => editor.update(() => text.select(4, 4))); // "one |two"

    // Assert the postcondition (structure + caret position) inside the SAME `editor.update()`
    // that performs the split, immediately after `$splitParagraphWithMarker` returns - this is
    // the function's own synchronous contract. A later, separate read of committed state can
    // observe the selection having been re-synced from jsdom's simulated `selectionchange`
    // event (unrelated to this function's correctness - none of this test's DOM nodes are ever
    // truly focused), so the postcondition belongs here, not after an extra round-trip.
    await act(async () =>
      editor.update(() => {
        $splitParagraphWithMarker("q2");

        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        expect(paras[0].getMarker()).toBe("p");
        expect(paras[0].getTextContent()).toContain("one");
        expect(paras[1].getMarker()).toBe("q2");
        expect($isMarkerNode(paras[1].getFirstChild())).toBe(true);

        // Caret lands on the content side, right after the injected prefix.
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        const contentNode = paras[1].getChildAtIndex(2);
        expect(selection.anchor.getNode().is(contentNode)).toBe(true);
        expect(selection.anchor.offset).toBe(0);
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getMarker()).toBe("p");
      expect(paras[1].getMarker()).toBe("q2");
      expect($isMarkerNode(paras[1].getFirstChild())).toBe(true);
    });

    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      expect(paras[0].getMarker()).toBe("p");
      expect($getRoot().getTextContent()).toContain("one two");
    });
  });
});
