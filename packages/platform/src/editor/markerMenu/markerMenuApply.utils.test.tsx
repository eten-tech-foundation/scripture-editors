import {
  $applyMarkerMenuSelection,
  $splitParagraphWithMarker,
  ApplyMarkerMenuSelectionDeps,
} from "./markerMenuApply.utils";
import { MarkerMenuItem } from "./markerItemSource";
import { deserializeEditorState } from "../adaptors/editor-usj.adaptor";
import { MarkerEditPlugin } from "../markerEdit/MarkerEditPlugin";
import {
  historyTestEnvironment,
  testEnvironment,
  viewOptions,
} from "../markerEdit/markerEdit.test-helpers";
import {
  initialize as initializeSerialize,
  reset as resetSerialize,
} from "../adaptors/usj-editor.adaptor";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { act } from "@testing-library/react";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setState,
  BLUR_COMMAND,
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
  MarkerNode,
  NBSP,
  textTypeState,
} from "shared";
import { CharNodePlugin, TextSpacingPlugin } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

/**
 * Full markerEdit harness: the marker-edit engine plus the neighboring plugins the real
 * `Editor.tsx` always mounts alongside it (CharNodePlugin, TextSpacingPlugin), plus
 * HistoryPlugin for undo assertions. Prior debugging showed that
 * apply-path tests WITHOUT the engine's transforms/pending-marker machinery active miss
 * exactly the defect class where the engine reacts to the apply flow's intermediate states.
 */
async function fullHarnessEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  resetSerialize();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={viewOptions} />
      <CharNodePlugin />
      <TextSpacingPlugin />
      <HistoryPlugin />
    </>,
  );
}

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

  describe("paragraph kind — retag vs split", () => {
    it("retags the current paragraph in place at content start: same para, no new paragraphs, content intact, single undo restores the literal", async () => {
      let glyph: MarkerNode;
      let qPara: ReturnType<typeof $createParaNode>;
      const { editor } = await historyTestEnvironment(() => {
        const intro = $createParaNode("p");
        qPara = $createParaNode("q2");
        glyph = $createMarkerNode("q2");
        $getRoot().append(
          intro.append(
            $createMarkerNode("p"),
            $createTrailingSpaceNode(),
            $createTextNode("walk not in the counsel;"),
          ),
          qPara.append(
            glyph,
            $createTrailingSpaceNode(),
            $createTextNode("nor sit in the seat of scoffers;"),
          ),
        );
      });
      // Simulate the QA flow: Home lands the caret at the marker glyph's offset 0 (the
      // paragraph's true content start in Standard view), and the typed literal `\q1`
      // prepends into the glyph's own text.
      await act(async () =>
        editor.update(() => {
          glyph.setTextContent("\\q1\\q2");
          glyph.select(3, 3);
        }),
      );

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
      // Postcondition (structure + caret) asserted inside the SAME `editor.update()` that
      // applies - the function's own synchronous contract. A later, separate read can observe
      // the selection having been re-synced from jsdom's simulated `selectionchange` (none of
      // this test's DOM nodes are ever truly focused), so the caret check belongs here.
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: true },
            reference,
            makeDeps(),
          );

          // PT9 reformat outcome: typing `\q1 ` at paragraph content start RETAGS the current
          // paragraph - the SAME ParaNode, no paragraphs added or removed anywhere.
          const paras = $getRoot().getChildren().filter($isParaNode);
          expect(paras).toHaveLength(2);
          expect(paras[0].getMarker()).toBe("p"); // preceding para untouched
          expect(paras[1].is(qPara)).toBe(true); // same node, retagged in place
          expect(paras[1].getMarker()).toBe("q1");
          const first = paras[1].getFirstChild();
          expect($isMarkerNode(first)).toBe(true);
          expect($isMarkerNode(first) ? first.getMarker() : undefined).toBe("q1");
          expect($isMarkerNode(first) ? first.getTextContent() : undefined).toBe("\\q1");
          expect(paras[1].getTextContent()).toContain("nor sit in the seat of scoffers;");

          // Caret kept sensible: on the content side of the retagged prefix.
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
          const contentNode = paras[1].getChildAtIndex(2);
          expect(selection.anchor.getNode().is(contentNode)).toBe(true);
          expect(selection.anchor.offset).toBe(0);
        }),
      );

      editor.getEditorState().read(() => {
        // Committed state: retag held through transforms (no merge, no bogus paragraphs).
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        expect(paras[1].getMarker()).toBe("q1");
        expect(paras[1].getTextContent()).toContain("nor sit in the seat of scoffers;");
      });

      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      editor.getEditorState().read(() => {
        // A single undo restores the pre-apply state: q2 marker AND the typed literal.
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        expect(paras[1].getMarker()).toBe("q2");
        const first = paras[1].getFirstChild();
        expect($isMarkerNode(first) ? first.getTextContent() : undefined).toBe("\\q1\\q2");
      });
    });

    it("splits at the caret when the choice is made mid-text (PT9: a paragraph marker mid-text starts a new paragraph)", async () => {
      let text: TextNode;
      const { editor } = await historyTestEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("one two");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      // literal `\q1` typed mid-text: "one \q1two", caret after the literal
      await act(async () =>
        editor.update(() => {
          text.setTextContent("one \\q1two");
          text.select(7, 7);
        }),
      );

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
      // Same-update postcondition assertion - see the retag test above for the rationale.
      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: true },
            reference,
            makeDeps(),
          );

          const paras = $getRoot().getChildren().filter($isParaNode);
          expect(paras).toHaveLength(2);
          expect(paras[0].getMarker()).toBe("p");
          expect(paras[0].getTextContent()).toContain("one");
          expect(paras[1].getMarker()).toBe("q1");
          expect($isMarkerNode(paras[1].getFirstChild())).toBe(true);
          expect(paras[1].getTextContent()).toContain("two");
          // No literal residue anywhere.
          expect($getRoot().getTextContent()).not.toContain("\\q1two");

          // Caret on the content side of the new paragraph's prefix (split semantics).
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
          const contentNode = paras[1].getChildAtIndex(2);
          expect(selection.anchor.getNode().is(contentNode)).toBe(true);
          expect(selection.anchor.offset).toBe(0);
        }),
      );

      editor.getEditorState().read(() => {
        // Committed state: the split held through transforms.
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        expect(paras[1].getMarker()).toBe("q1");
        expect($isMarkerNode(paras[1].getFirstChild())).toBe(true);
      });

      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(1);
        expect($getRoot().getTextContent()).toContain("one \\q1two");
      });
    });
  });

  describe("collapsed char insert with the full marker-edit engine", () => {
    /** Shared setup: para `\p the wicked,` with a literal `\wj` typed at "wic|ked,". */
    async function setUpLiteralMidWord() {
      let text: TextNode | undefined;
      const environment = await fullHarnessEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("the wicked,");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () =>
        environment.editor.update(() => {
          const node = requireDefined(text, "setup text node missing");
          node.setTextContent("the wic\\wjked,");
          node.select(10, 10); // caret right after the literal `\wj`
        }),
      );
      return environment;
    }

    function $expectCleanCollapsedInsert() {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1); // no phantom paragraph spliced anywhere
      const para = paras[0];
      const children = para.getChildren();
      // [marker \p, trailing NBSP, "the wic", char/wj, "ked,"]
      expect(children).toHaveLength(5);
      expect($isTextNode(children[2]) ? children[2].getTextContent() : undefined).toBe("the wic");
      const char = children[3];
      expect($isCharNode(char)).toBe(true);
      if (!$isCharNode(char)) throw new Error("expected a char span");
      expect(char.getMarker()).toBe("wj");
      expect(char.getChildren().filter($isMarkerNode)).toHaveLength(2); // opener + closer glyphs

      // The word remainder is a PLAIN TextNode: exactly type "text", not a marker glyph,
      // and carrying no textType state classification.
      const remainder = children[4];
      expect(remainder.getType()).toBe("text");
      expect($isMarkerNode(remainder)).toBe(false);
      expect($isTextNode(remainder) ? remainder.getTextContent() : undefined).toBe("ked,");
      if ($isTextNode(remainder)) expect($getState(remainder, textTypeState)).toBeUndefined();
    }

    it("keeps the word remainder plain when the menu click blurs the editor mid-literal (QA repro)", async () => {
      const { editor } = await setUpLiteralMidWord();
      // Clicking a marker-menu option steals focus from the contenteditable in the real
      // browser (NodeSelectionMenu options don't preventDefault on mousedown), so a BLUR
      // arrives between the literal landing and the apply - the exact QA event sequence.
      await act(async () => {
        editor.dispatchCommand(BLUR_COMMAND, new FocusEvent("blur"));
      });

      const item: MarkerMenuItem = { marker: "wj", kind: "character", isBasic: true };
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

      editor.getEditorState().read(() => $expectCleanCollapsedInsert());

      // The editor->USJ adaptor round-trip confirms no phantom marker survives: the para's
      // content is plain text + the char object, with no backslash residue anywhere.
      const usj = deserializeEditorState(editor.getEditorState(), viewOptions);
      const usjJson = JSON.stringify(usj);
      expect(usjJson).toContain("ked,");
      expect(usjJson).not.toContain("\\\\"); // no literal backslash text survives in USJ

      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      editor.getEditorState().read(() => {
        // A single undo restores the pre-apply literal state.
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(1);
        expect($getRoot().getTextContent()).toContain("the wic\\wjked,");
      });
    });

    it("keeps the word remainder plain on a plain collapsed insert (no blur - regression pin)", async () => {
      const { editor } = await setUpLiteralMidWord();
      const item: MarkerMenuItem = { marker: "wj", kind: "character", isBasic: true };
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
      editor.getEditorState().read(() => $expectCleanCollapsedInsert());
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

    it("wraps a MULTI-node selection without deleting earlier content (reused-wrapper regression)", async () => {
      let first: TextNode;
      let last: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        first = $createTextNode("say holy");
        last = $createTextNode(" words");
        // Different format so Lexical keeps these as two separate inline nodes (not merged), giving
        // the selection 2+ nodes and making `$wrapTextSelectionInInlineNode` reuse ONE wrapper.
        last.toggleFormat("bold");
        $getRoot().append(
          para.append($createMarkerNode("p"), $createTrailingSpaceNode(), first, last),
        );
      });
      // Select across BOTH text nodes: first[0] -> last[end].
      await act(async () =>
        editor.update(() => {
          const selection = $createRangeSelection();
          selection.anchor.set(first.getKey(), 0, "text");
          selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
          $setSelection(selection);
        }),
      );

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
        // Before the fix the 2nd $wrapNode call stripped the first node's already-wrapped content,
        // leaving only " words". Both selected pieces must survive.
        expect(para.getTextContent()).toContain("say holy");
        expect(para.getTextContent()).toContain("words");
      });
    });
  });

  describe("paragraph kind — retag caret with element content (red-letter)", () => {
    it("puts the caret at CONTENT START when the first content child is a CharNode, not paragraph end", async () => {
      // Red-letter shape: `\p \wj Then Jesus said\wj*` — content child at index 2 is a CharNode
      // (an element), not a TextNode. The old fallback jumped the caret to para end; the caret
      // must land at the content boundary instead, so immediate typing inserts BEFORE the span.
      let glyph: MarkerNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        glyph = $createMarkerNode("p");
        const wj = $createCharNode("wj");
        $getRoot().append(
          para.append(
            glyph,
            $createTrailingSpaceNode(),
            wj.append(
              $createMarkerNode("wj"),
              $createTextNode(`${NBSP}Then Jesus said`),
              $createMarkerNode("wj", "closing"),
            ),
          ),
        );
      });
      // Caret at the paragraph's content start (glyph offset 0 — the retag probe position).
      await act(async () => editor.update(() => glyph.select(0, 0)));

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
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

      // Typing right after the retag must land at content START (before the \wj span) — the
      // observable form of "the caret did not jump to the end".
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("X");
        }),
      );

      editor.getEditorState().read(() => {
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para missing",
        );
        expect(para.getMarker()).toBe("q1"); // retag happened
        const text = para.getTextContent();
        // "X" precedes the red-letter content; with the old selectEnd fallback it trailed it.
        expect(text.indexOf("X")).toBeLessThan(text.indexOf("Then"));
      });
    });
  });

  describe("$splitParagraphWithMarker — typing into the fresh paragraph", () => {
    it("keeps typed text OUT of the marker-trailing-space separator (no NBSP leaks into USJ)", async () => {
      // Repro of the live bug: Enter → pick `p` → type "asdf" produced USFM `\p ~asdf`. The new
      // paragraph is EMPTY, so $injectMarkerPrefix's caret fallback (selectEnd) parks the caret at
      // the END of the NBSP separator node; RangeSelection.insertText then appends INTO that node
      // (" asdf"), and the serializer — which strips the separator by exact-NBSP text match —
      // keeps the whole node, leaking the NBSP into USJ (→ `~` in USFM → a non-convergent PDP echo
      // loop in the host). The separator must be a token node so typing at its boundary creates a
      // fresh plain content node instead.
      let text: TextNode;
      const { editor } = await fullHarnessEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("before");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(6, 6))); // caret at end of "before"
      await act(async () => editor.update(() => $splitParagraphWithMarker("p")));
      // Type like a user: RangeSelection.insertText follows the same token/canInsertText
      // boundary rules as real keyboard input.
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("asdf");
        }),
      );

      const usj = deserializeEditorState(editor.getEditorState(), viewOptions);
      const usjJson = JSON.stringify(usj);
      expect(usjJson).toContain('"asdf"'); // the typed text is EXACTLY the content — no separator residue
      expect(usjJson).not.toContain("\u00A0"); // the NBSP separator did not leak into USJ
      expect(usjJson).not.toContain('" asdf"'); // nor as an inverted leading space

      // The typed text must also be a sibling of the separator, not merged into it — the editable
      // layout [glyph, NBSP, content] is what every marker-edit transform assumes.
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(2);
        const newPara = paras[1];
        const contentChild = newPara.getChildAtIndex(2);
        expect($isTextNode(contentChild) ? contentChild.getTextContent() : undefined).toBe("asdf");
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
