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
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setState,
  BLUR_COMMAND,
  LexicalNode,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  defaultStyleInfo,
  getEditableCallerText,
  LoggerBasic,
  MarkerNode,
  NBSP,
  NoteNode,
  ParaNode,
  StyleInfo,
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

function makeDeps(styleInfo?: StyleInfo): ApplyMarkerMenuSelectionDeps {
  return {
    expandedNoteKeyRef: { current: undefined },
    viewOptions,
    nodeOptions: {},
    logger: undefined,
    styleInfo,
  };
}

/** The bundled sheet with `occursUnder` overridden for one marker, as a project sheet may do. */
function styleInfoWithOccursUnder(marker: string, occursUnder: string[]): StyleInfo {
  return {
    ...defaultStyleInfo,
    markers: {
      ...defaultStyleInfo.markers,
      [marker]: { ...defaultStyleInfo.markers[marker], occursUnder },
    },
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

    it("shows the display separator on a freshly wrapped span (structural NBSP before content)", async () => {
      // Selecting text and applying a char style must render `\nd one`, not `\ndone`: the wrapped
      // content carries the structural NBSP separator like every other editable char span (the
      // saved bytes were already right — this pins the DISPLAY).
      let text: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("one two");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(0, 3))); // select "one"

      const item: MarkerMenuItem = { marker: "nd", kind: "character", isBasic: true };
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
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const nd = para.getChildren().filter($isCharNode)[0];
        expect(nd.getMarker()).toBe("nd");
        const content = nd
          .getChildren()
          .find((c): c is TextNode => $isTextNode(c) && !$isMarkerNode(c));
        expect(content?.getTextContent()).toBe(`${NBSP}one`);
      });
    });

    it("wraps a whitespace-only selection: the space IS the span's content, no empty pair", async () => {
      // Select the space in `\p one two`, apply `\nd`. The leading-space move exists to keep a
      // WORD's leading space outside the span it starts; a space that is the node's entire
      // content is not a leading space. Trimming it anyway emptied the wrapped node — the
      // selected space walked out of the span and an empty `\nd \nd*` pair landed in the file
      // while the screen showed nothing happened (the no-silent-no-op rule).
      let text: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("one two");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(3, 4))); // the space between the words

      const item: MarkerMenuItem = { marker: "nd", kind: "character", isBasic: true };
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
        const nd = chars[0];
        expect(nd.getMarker()).toBe("nd");
        // Closed span with both glyphs, whose content is exactly the selected space (behind the
        // structural NBSP separator every editable span's first content carries).
        expect(nd.getChildren().filter($isMarkerNode)).toHaveLength(2);
        const content = nd
          .getChildren()
          .find((c): c is TextNode => $isTextNode(c) && !$isMarkerNode(c));
        expect(content?.getTextContent()).toBe(`${NBSP} `);
        // The space did not walk out of the span: the flanking words are unchanged, with no
        // fabricated space before the span.
        const [before, after] = [nd.getPreviousSibling(), nd.getNextSibling()];
        expect($isTextNode(before) && before.getTextContent()).toBe("one");
        expect($isTextNode(after) && after.getTextContent()).toBe("two");
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
        // leaving only " words". A single reused wj wrapper must hold BOTH selected pieces —
        // checking the para's text alone would also pass on a no-op that wrapped nothing.
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("wj");
        expect(chars[0].getTextContent()).toContain("say holy");
        expect(chars[0].getTextContent()).toContain("words");
        // The reused wrapper keeps its opener/closer glyphs like the single-node path does.
        const markerChildren = chars[0].getChildren().filter($isMarkerNode);
        expect(markerChildren).toHaveLength(2);
      });
    });

    /**
     * Wrapping a selection that is nothing but whitespace. Lives here rather than beside the
     * trailing-space transform's own lone-space pins because what it exercises is the WRAP
     * primitive's span shape; the transform half is already pinned in `TextSpacingPlugin.test.tsx`
     * in both aftermath shapes. Driven on the full harness so the trailing-space transform is
     * live — a selected space is real content, and neither the wrap nor the transform may delete
     * it or add a byte beside it.
     *
     * SKIPPED: red against a defect in the WRAP primitive, which this test does not own.
     * `$moveLeadingSpaceToPreviousNode` (`../adaptors/usj-marker-action.utils.ts`) moves a wrapped
     * node's leading space out to the previous sibling unconditionally. When the selection IS
     * that space, trimming empties the node and the wrapper keeps only its structural separator.
     * Measured today: the space returns to the left text node and an EMPTY span serializes —
     * `["one ", { type: "char", marker: "nd" }, "two"]`, a fabricated `\nd \nd*` pair in the
     * file, with the user's apply silently doing nothing.
     *
     * The whitespace half is clean: neither trailing-space transform deletes or fabricates a
     * byte here. Un-skip alongside a guard that declines to move a leading space when it is the
     * node's entire content.
     */
    it.skip("wraps a whitespace-only selection into a span holding exactly that space", async () => {
      let text: TextNode;
      const { editor } = await fullHarnessEnvironment(() => {
        text = $createTextNode("one two");
        $getRoot().append(
          $createParaNode("p").append($createMarkerNode("p"), $createTrailingSpaceNode(), text),
        );
      });
      await act(async () => editor.update(() => text.select(3, 4))); // the space between the words

      const item: MarkerMenuItem = { marker: "nd", kind: "character", isBasic: true };
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
        expect(chars[0].getMarker()).toBe("nd");
        // A space IS content, so the span is not the empty shape the char-stack close/reopen
        // drops: it keeps both glyphs and holds the selected space after its structural separator.
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(2);
        const content = chars[0]
          .getChildren()
          .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
        expect(content?.getTextContent()).toBe(`${NBSP} `);
      });

      // Nothing deleted, nothing fabricated: the space moved inside the span and the words on
      // either side abut it exactly as before.
      expect(deserializeEditorState(editor.getEditorState(), viewOptions)).toEqual({
        type: "USJ",
        version: "3.1",
        content: [
          {
            type: "para",
            marker: "p",
            content: ["one", { type: "char", marker: "nd", content: [" "] }, "two"],
          },
        ],
      });
    });
  });

  describe("open kind — note insertion returns the created note's key", () => {
    it("returns the inserted NoteNode's Lexical key so hosts can track the editing session", async () => {
      // The popover flow needs the TRUE key of a palette-created note: re-deriving it from
      // delta-doc coordinates (getInsertedNodeKey) can resolve the wrong node, making the
      // popover's replaceEmbedUpdate silently no-op. insertMarker already returns the true key;
      // applyMarkerMenuSelection must too, so hosts never have to re-derive one.
      let text: TextNode;
      const { editor } = await fullHarnessEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("body text");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(4, 4)));

      let returnedKey: string | undefined;
      await act(async () =>
        editor.update(() => {
          returnedKey = $applyMarkerMenuSelection(
            { marker: "f", kind: "note", isBasic: true },
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        const notes = $getRoot()
          .getAllTextNodes()
          .map((n) => n.getParent())
          .filter((p2) => p2?.getType() === "note");
        expect(notes.length).toBeGreaterThan(0);
        expect(returnedKey).toBeDefined();
        // The returned key is the actual NoteNode's key.
        const anyNoteKey = notes[0]?.getKey();
        expect(returnedKey).toBe(anyNoteKey);
      });
    });
  });

  describe("open kind — caret lands INSIDE the inserted char span", () => {
    it("puts the caret at the span's content position so typing fills the span (end of paragraph)", async () => {
      // Live repro: type `\wj`, commit with Enter at the end of a paragraph — the caret landed at
      // the OPENING glyph's offset 0 (selectStart descends to the first leaf), so typing went into
      // the glyph (Tier-1 rename semantics) instead of the span content. PT9: after inserting a
      // char marker at a collapsed caret, typing goes INTO the new span, after `\wj `.
      let text: TextNode;
      const { editor } = await fullHarnessEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("word ");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      await act(async () => editor.update(() => text.select(5, 5))); // caret at paragraph end

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

      // Type like a user: the text must land INSIDE the span (CharNodePlugin then strips the
      // empty-content placeholder), not in the opening glyph and not outside the span.
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("hi");
        }),
      );

      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const char = para.getChildren().find($isCharNode);
        expect($isCharNode(char)).toBe(true);
        if (!$isCharNode(char)) throw new Error("expected a char span");
        expect(char.getMarker()).toBe("wj"); // typing did NOT rename the marker via its glyph
        const opener = char.getChildren().filter($isMarkerNode)[0];
        expect(opener.getTextContent()).toBe("\\wj"); // glyph text untouched
        // The typed text is the span's content...
        const contentTexts = char
          .getChildren()
          .filter((c): c is TextNode => $isTextNode(c) && !$isMarkerNode(c))
          .map((c) => c.getTextContent());
        expect(contentTexts.join("")).toContain("hi");
        // ...and did not land outside the span.
        expect(para.getTextContent().replace(char.getTextContent(), "")).not.toContain("hi");
      });
    });
  });

  describe("open kind — char apply INSIDE an expanded note", () => {
    /**
     * Expanded footnote in `createNote`'s editable-expanded layout: [\f opener glyph, caller
     * text, \ft content span, \f* closer glyph]. The \ft span carries the note-content
     * convention (opening glyph + NBSP-prefixed content, closed="false", no closer glyph).
     */
    async function setUpExpandedFootnote() {
      let noteRef: NoteNode | undefined;
      let ftCharRef: CharNode | undefined;
      let ftContentRef: TextNode | undefined;
      let callerTextRef: TextNode | undefined;
      const environment = await fullHarnessEnvironment(() => {
        const para = $createParaNode("p");
        const note = $createNoteNode("f", "+", false);
        const ftChar = $createCharNode("ft");
        ftChar.setUnknownAttributes({ closed: "false" });
        const ftContent = $createTextNode(`${NBSP}A note`);
        const callerText = $createTextNode(getEditableCallerText("+"));
        note.append(
          $createMarkerNode("f"),
          callerText,
          ftChar.append($createMarkerNode("ft"), ftContent),
          $createMarkerNode("f", "closing"),
        );
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTrailingSpaceNode(),
            $createTextNode("text "),
            note,
            $createTextNode(" after"),
          ),
        );
        noteRef = note;
        ftCharRef = ftChar;
        ftContentRef = ftContent;
        callerTextRef = callerText;
      });
      return {
        ...environment,
        note: requireDefined(noteRef, "note missing"),
        ftChar: requireDefined(ftCharRef, "ft char missing"),
        ftContent: requireDefined(ftContentRef, "ft content missing"),
        callerText: requireDefined(callerTextRef, "caller text missing"),
      };
    }

    /** The wrapper paragraph (exactly one in these fixtures). */
    function $onlyPara() {
      return requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
    }

    const fqItem: MarkerMenuItem = { marker: "fq", kind: "character", isBasic: true };

    it("places the new \\fq INSIDE the note, after \\ft and before the \\f* closer (caret at \\ft content end)", async () => {
      // Live repro: caret at the end of an expanded footnote's \ft content, apply `fq` from the
      // palette — the span landed OUTSIDE the note as a wrapper-paragraph child after \f*
      // (Lexical's insertNodes splices at the nearest BLOCK ancestor; NoteNode and CharNode are
      // both inline), rendering red/invalid.
      //
      // Assertions run against COMMITTED state, not same-update: the char action performs its
      // mutation in a nested `editor.update` which Lexical QUEUES until the outer update's
      // callback returns.
      const { editor, note, ftChar, ftContent } = await setUpExpandedFootnote();
      let paraChildrenBefore = 0;
      await act(async () =>
        editor.update(() => {
          paraChildrenBefore = $onlyPara().getChildrenSize();
          ftContent.select(ftContent.getTextContentSize(), ftContent.getTextContentSize());
        }),
      );

      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            fqItem,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        // NOTHING landed at paragraph level.
        expect($onlyPara().getChildrenSize()).toBe(paraChildrenBefore);
        expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);

        // The new \fq is a NOTE child: after the \ft span, before the closing \f* glyph.
        const chars = note.getChildren().filter($isCharNode);
        expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq"]);
        const fq = chars[1];
        expect(fq.getPreviousSibling()?.is(ftChar)).toBe(true);
        const closer = fq.getNextSibling();
        expect($isMarkerNode(closer) && closer.getMarkerSyntax() === "closing").toBe(true);

        // Note-content span convention ($createNoteContentChar/createChar): opening glyph
        // first, no closing glyph (implicitly closed), closed="false" recorded.
        const fqChildren = fq.getChildren();
        expect($isMarkerNode(fqChildren[0]) && fqChildren[0].getMarkerSyntax() === "opening").toBe(
          true,
        );
        expect(fqChildren.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing")).toBe(
          false,
        );
        expect(fq.getUnknownAttributes()?.closed).toBe("false");
      });

      // Type like a user — the observable form of "the caret landed INSIDE the new span": the
      // quotation text fills the \fq, still inside the note, nothing at paragraph level.
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("quoted");
        }),
      );
      editor.getEditorState().read(() => {
        const fq = note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fq");
        expect(fq?.getTextContent()).toContain("quoted");
        expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);
      });

      // The USJ round-trip agrees: the \fq (with its typed content) serializes INSIDE the
      // note's content, and the paragraph gains no char object of its own.
      const usj = requireDefined(
        deserializeEditorState(editor.getEditorState(), viewOptions),
        "usj missing",
      );
      const paraObj = usj.content?.find(
        (child) => typeof child === "object" && child.type === "para",
      );
      if (typeof paraObj !== "object") throw new Error("expected a para in USJ");
      const paraChars = (paraObj.content ?? []).filter(
        (child) => typeof child === "object" && child.type === "char",
      );
      expect(paraChars).toHaveLength(0);
      const noteObj = (paraObj.content ?? []).find(
        (child) => typeof child === "object" && child.type === "note",
      );
      const noteJson = JSON.stringify(noteObj);
      expect(noteJson).toContain('"fq"');
      expect(noteJson).toContain("quoted");
    });

    it("ends the \\ft at a mid-content caret and gives its tail to the new \\fq, all inside the note", async () => {
      const { editor, note, ftChar, ftContent } = await setUpExpandedFootnote();
      let paraChildrenBefore = 0;
      await act(async () =>
        editor.update(() => {
          paraChildrenBefore = $onlyPara().getChildrenSize();
          ftContent.select(3, 3); // between "A " and "note" (content text is NBSP + "A note")
        }),
      );

      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            fqItem,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      // Committed state (the char action's nested update is queued — see the test above).
      editor.getEditorState().read(() => {
        // NOTHING landed at paragraph level.
        expect($onlyPara().getChildrenSize()).toBe(paraChildrenBefore);
        expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);

        // The \ft ENDS at the caret — a note-content marker closes implicitly, so writing `\fq`
        // is itself how `\ft` terminates. No `\ft*` is emitted and no `\ft` reopens; the tail
        // becomes the `\fq`'s content.
        const chars = note.getChildren().filter($isCharNode);
        expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq"]);
        expect(chars[0].is(ftChar)).toBe(true);
        expect(chars[0].getTextContent()).toContain("A ");
        expect(chars[0].getTextContent()).not.toContain("note");
        expect(chars[1].getTextContent()).toContain("note");
        // The new span is a valid editable span (opening glyph first), so the engine's
        // char-deletion transform won't unwrap it back to plain text.
        const newFirst = chars[1].getFirstChild();
        expect($isMarkerNode(newFirst) && newFirst.getMarkerSyntax() === "opening").toBe(true);
      });

      // Typing probe: the caret landed INSIDE the new \fq, ahead of the tail it took over.
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("X");
        }),
      );
      editor.getEditorState().read(() => {
        const chars = note.getChildren().filter($isCharNode);
        expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq"]);
        expect(chars[1].getTextContent()).toContain("X");
        expect(chars[0].getTextContent()).not.toContain("X");
      });
    });

    it("still inserts right after the anchor text when the caret is directly under the note (shallow case pin)", async () => {
      const { editor, note, callerText } = await setUpExpandedFootnote();
      await act(async () =>
        editor.update(() =>
          callerText.select(callerText.getTextContentSize(), callerText.getTextContentSize()),
        ),
      );

      await act(async () =>
        editor.update(() => {
          $applyMarkerMenuSelection(
            fqItem,
            { trigger: "backslash", literalPrefixLanded: false },
            reference,
            makeDeps(),
          );
        }),
      );

      editor.getEditorState().read(() => {
        // The pre-existing shallow branch: the new \fq goes right after the caller text,
        // before the \ft span — still a note child.
        const chars = note.getChildren().filter($isCharNode);
        expect(chars.map((c) => c.getMarker())).toEqual(["fq", "ft"]);
        expect(chars[0].getPreviousSibling()?.is(callerText)).toBe(true);
        expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);
      });
    });

    describe("NEST-able char markers nest IN PLACE (PT9 StyleApplicator semantics)", () => {
      // PT9's StyleApplicator.ApplyCharacterStyle treats styles whose OccursUnder contains NEST
      // (\w, \nd, \wj, ...) differently from note-content styles (\fq, \fk, ...): with a
      // collapsed caret it emits `\+marker` AT the caret and closes it immediately with
      // `\+marker*`, leaving every open span open (ApplyCharacterStyle's NEST path emits the
      // opener without closing anything, and its after-pass stops closing at the just-opened
      // style). Only non-NEST styles get
      // the close-all-and-reopen shape the split-based path mirrors. Verified in real Paratext 9:
      // applying \w with the caret inside \+wj > \nd > \ft adds only the nested span.
      const wItem: MarkerMenuItem = { marker: "w", kind: "character", isBasic: true };

      /**
       * Expanded footnote whose \ft content holds a nested chain, as loading
       * `\f + \ft A \+nd holy \+wj words here\+wj*\+nd*\f*` builds it: \ft (note-content
       * convention: no closer, closed="false") > \nd > \wj, the nested spans with explicit
       * closer glyphs.
       */
      async function setUpNestedExpandedFootnote() {
        let noteRef: NoteNode | undefined;
        let ftCharRef: CharNode | undefined;
        let ndCharRef: CharNode | undefined;
        let wjCharRef: CharNode | undefined;
        let wjContentRef: TextNode | undefined;
        const environment = await fullHarnessEnvironment(() => {
          const para = $createParaNode("p");
          const note = $createNoteNode("f", "+", false);
          const ftChar = $createCharNode("ft");
          ftChar.setUnknownAttributes({ closed: "false" });
          const ndChar = $createCharNode("nd");
          const wjChar = $createCharNode("wj");
          // Content texts carry the structural NBSP separator, as loaded spans do (the
          // markerSeparators sync would otherwise add it at mount and shift select offsets).
          const wjContent = $createTextNode(`${NBSP}words here`);
          wjChar.append($createMarkerNode("wj"), wjContent, $createMarkerNode("wj", "closing"));
          ndChar.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}holy `),
            wjChar,
            $createMarkerNode("nd", "closing"),
          );
          ftChar.append($createMarkerNode("ft"), $createTextNode(`${NBSP}A `), ndChar);
          note.append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText("+")),
            ftChar,
            $createMarkerNode("f", "closing"),
          );
          $getRoot().append(
            para.append(
              $createMarkerNode("p"),
              $createTrailingSpaceNode(),
              $createTextNode("text "),
              note,
              $createTextNode(" after"),
            ),
          );
          noteRef = note;
          ftCharRef = ftChar;
          ndCharRef = ndChar;
          wjCharRef = wjChar;
          wjContentRef = wjContent;
        });
        return {
          ...environment,
          note: requireDefined(noteRef, "note missing"),
          ftChar: requireDefined(ftCharRef, "ft char missing"),
          ndChar: requireDefined(ndCharRef, "nd char missing"),
          wjChar: requireDefined(wjCharRef, "wj char missing"),
          wjContent: requireDefined(wjContentRef, "wj content missing"),
        };
      }

      /** Marker names of `parent`'s direct CharNode children. */
      function childCharMarkers(parent: CharNode | NoteNode | ParaNode): string[] {
        return parent
          .getChildren()
          .filter($isCharNode)
          .map((c) => c.getMarker());
      }

      it("nests the new \\w INSIDE the innermost \\wj of \\ft > \\nd > \\wj without splitting anything", async () => {
        const { editor, note, ftChar, ndChar, wjChar, wjContent } =
          await setUpNestedExpandedFootnote();
        await act(async () => editor.update(() => wjContent.select(4, 4))); // NBSP + "wor|ds here"

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              wItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // The open span chain is untouched: one \ft at note level, one \nd inside it, ONE
          // \wj inside that (not split into halves), exactly as PT9 leaves them.
          expect(childCharMarkers(note)).toEqual(["ft"]);
          expect(childCharMarkers(ftChar)).toEqual(["nd"]);
          expect(childCharMarkers(ndChar)).toEqual(["wj"]);
          // The new \w is a CHILD of \wj at the caret, between the split text runs, with an
          // explicit closer — the serializer's nested-prefix pass writes it as `\+w ...\+w*`.
          const wjChars = wjChar.getChildren().filter($isCharNode);
          expect(wjChars.map((c) => c.getMarker())).toEqual(["w"]);
          const w = wjChars[0];
          expect(
            w.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
          ).toBe(true);
          expect(w.getUnknownAttributes()?.closed).toBeUndefined();
        });

        // Typing probe: the caret landed INSIDE the new \w; the host \wj text is intact
        // around it.
        await act(async () =>
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText("X");
          }),
        );
        editor.getEditorState().read(() => {
          const w = wjChar.getChildren().filter($isCharNode)[0];
          expect(w.getTextContent()).toContain("X");
          const wjTexts = wjChar
            .getChildren()
            .filter((c): c is TextNode => $isTextNode(c) && !$isMarkerNode(c))
            .map((c) => c.getTextContent())
            .join("|");
          expect(wjTexts).toContain("wor");
          expect(wjTexts).toContain("ds here");
          expect(wjTexts).not.toContain("X");
        });
      });

      /** A body paragraph `\p before \nd Lord\nd* after` (the \nd span carries an explicit closer). */
      async function setUpBodyCharSpan() {
        let ndCharRef: CharNode | undefined;
        let ndContentRef: TextNode | undefined;
        let paraRef: ParaNode | undefined;
        const environment = await fullHarnessEnvironment(() => {
          const para = $createParaNode("p");
          const ndChar = $createCharNode("nd");
          const ndContent = $createTextNode(`${NBSP}Lord`);
          ndChar.append($createMarkerNode("nd"), ndContent, $createMarkerNode("nd", "closing"));
          $getRoot().append(
            para.append(
              $createMarkerNode("p"),
              $createTrailingSpaceNode(),
              $createTextNode("before "),
              ndChar,
              $createTextNode(" after"),
            ),
          );
          ndCharRef = ndChar;
          ndContentRef = ndContent;
          paraRef = para;
        });
        return {
          ...environment,
          ndChar: requireDefined(ndCharRef, "nd char missing"),
          ndContent: requireDefined(ndContentRef, "nd content missing"),
          para: requireDefined(paraRef, "para missing"),
        };
      }

      it("nests an applied NEST-able \\w INSIDE a BODY \\nd span (not split to paragraph level)", async () => {
        // PT9 StyleApplicator parity is not note-specific: applying a NEST-able style with the
        // caret inside a BODY char span nests it in place too. The generic insertNodes fallback
        // instead split the \nd span (its closer-less left half then triggering a destructive
        // Tier-2 rebuild), so this branch must fire for body char spans, not only in-note ones.
        const { editor, ndChar, ndContent, para } = await setUpBodyCharSpan();
        await act(async () =>
          editor.update(() =>
            ndContent.select(ndContent.getTextContentSize(), ndContent.getTextContentSize()),
          ),
        );

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              wItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // Nothing split out to paragraph level: the paragraph still holds exactly the one \nd.
          expect(childCharMarkers(para)).toEqual(["nd"]);
          // The \w nested INSIDE \nd, with an explicit closer, and — because its parent is now a
          // char — its editable glyphs carry the `+` so a Tier-2 re-tokenization keeps the nesting.
          const ndChildChars = ndChar.getChildren().filter($isCharNode);
          expect(ndChildChars.map((c) => c.getMarker())).toEqual(["w"]);
          const w = ndChildChars[0];
          const wMarkers = w.getChildren().filter($isMarkerNode);
          expect(wMarkers.map((m) => m.getTextContent())).toEqual(["\\+w", "\\+w*"]);
          expect(w.getUnknownAttributes()?.closed).toBeUndefined();
        });
      });

      it("nests the new \\w INSIDE the \\ft span at a mid-content caret (\\ft not split)", async () => {
        const { editor, note, ftChar, ftContent } = await setUpExpandedFootnote();
        // Caret between "A " and "note" (content text is NBSP + "A note").
        await act(async () => editor.update(() => ftContent.select(3, 3)));

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              wItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // PT9 writes `\ft A \+w \+w*note` — the \w nests inside the STILL-OPEN \ft; it does
          // not close \ft and reopen it after (that shape is reserved for non-NEST styles
          // like \fq).
          expect(childCharMarkers(note)).toEqual(["ft"]);
          expect(childCharMarkers(ftChar)).toEqual(["w"]);
          expect(ftChar.getTextContent()).toContain("A ");
          expect(ftChar.getTextContent()).toContain("note");
        });

        // Typing probe: the caret landed INSIDE the new \w.
        await act(async () =>
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText("X");
          }),
        );
        editor.getEditorState().read(() => {
          const w = ftChar.getChildren().filter($isCharNode)[0];
          expect(w.getTextContent()).toContain("X");
        });
      });

      // The nest-vs-split decision must read the PROJECT stylesheet when the host supplies one,
      // like every other marker decision in the editor. \w is NEST-able in the bundled usfm.sty;
      // a project sheet that drops NEST from it must make it close-and-reopen instead.
      it("honors a project stylesheet that removes NEST from \\w — splits instead of nesting", async () => {
        const { editor, note, ftChar, ftContent } = await setUpExpandedFootnote();
        await act(async () => editor.update(() => ftContent.select(3, 3)));

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              wItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(styleInfoWithOccursUnder("w", [])),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // Close-and-reopen: the \ft closes before the new span and reopens after it, all at
          // note level — not the single nested \w the bundled sheet produces.
          expect(childCharMarkers(note)).toEqual(["ft", "w", "ft"]);
          expect(childCharMarkers(ftChar)).toEqual([]);
        });
      });

      it("keeps the split shape for \\xt — NEST-able but implicitly closed (no closer glyph)", async () => {
        // \xt is the one NEST-able marker whose editor span carries the implicit-close
        // convention (closed="false", no closing glyph). Nesting such a span in place would
        // swallow the rest of the host span's content on serialization (`\+xt` with no `\+xt*`
        // runs to the parent's closer), so it keeps the split shape — same rendered semantics as
        // PT9's nesting, expressed with the implicit-close convention. Sharing that convention
        // with the host `\ft` is also why nothing reopens after it: the `\xt` IS the `\ft`'s end.
        const { editor, note, ftContent } = await setUpExpandedFootnote();
        await act(async () => editor.update(() => ftContent.select(3, 3)));

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              { marker: "xt", kind: "character", isBasic: true },
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          expect(childCharMarkers(note)).toEqual(["ft", "xt"]);
        });
      });
    });

    describe("fp — the footnote-paragraph BREAK, not a span insertion", () => {
      // Inside an expanded note, `fp` is not "open an \fp span here" like \fq — it is the
      // footnote-paragraph BREAK, the exact thing Enter does there: everything after the
      // caret within the span moves into the new \fp (in document order) and the caret lands
      // at the break point. Routing it through the generic char-span insertion instead
      // produced a split-\ft sandwich ([\ft head, \fp empty, \ft tail]) with the tail
      // stranded on the wrong side of the break.
      const fpItem: MarkerMenuItem = { marker: "fp", kind: "character", isBasic: true };

      it("backslash session with a typed literal: consumes '\\fp' and breaks exactly like Enter (tail moves into \\fp)", async () => {
        const { editor, note, ftContent } = await setUpExpandedFootnote();
        // The passive palette's literal has landed at the caret: "A n\fp|ote".
        await act(async () =>
          editor.update(() => {
            const insertAt = ftContent.getTextContent().indexOf("ote");
            expect(insertAt).toBeGreaterThan(0);
            ftContent.spliceText(insertAt, 0, "\\fp");
            ftContent.select(insertAt + 3, insertAt + 3);
          }),
        );

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              fpItem,
              { trigger: "backslash", literalPrefixLanded: true },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // The typed literal is consumed — no raw "\fp" survives in CONTENT text (the new
          // span's own marker glyph legitimately renders "\fp", so glyph nodes don't count).
          const strandedLiterals: string[] = [];
          const walk = (node: LexicalNode): void => {
            if ($isTextNode(node) && !$isMarkerNode(node) && node.getTextContent().includes("\\fp"))
              strandedLiterals.push(node.getTextContent());
            if ($isElementNode(node)) node.getChildren().forEach(walk);
          };
          walk($getRoot());
          expect(strandedLiterals).toEqual([]);
          // Enter-equivalent break: [\ft "A n", \fp "ote"] — no empty span, no \ft tail
          // stranded after the break.
          const chars = note.getChildren().filter($isCharNode);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
          const [ft, fp] = chars;
          expect(ft.getTextContent()).toContain("A n");
          expect(ft.getTextContent()).not.toContain("ote");
          expect(fp.getTextContent()).toContain("ote");
          // Nothing leaked to paragraph level.
          expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);
        });

        // Caret probe: typing continues at the BREAK POINT (start of the \fp content),
        // exactly where Enter leaves it.
        await act(async () =>
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText("X");
          }),
        );
        editor.getEditorState().read(() => {
          const fp = note
            .getChildren()
            .filter($isCharNode)
            .find((c) => c.getMarker() === "fp");
          const fpText = requireDefined(fp, "\\fp span missing").getTextContent();
          expect(fpText.indexOf("X")).toBeLessThan(fpText.indexOf("ote"));
        });
      });

      it("commit without a literal (selection-shaped palette options): breaks at the caret like Enter", async () => {
        // The popover always applies with `trigger: "backslash"`; a focused (selection-kind)
        // session arrives with `literalPrefixLanded: false` — no literal to clean up.
        const { editor, note, ftContent } = await setUpExpandedFootnote();
        await act(async () =>
          editor.update(() => {
            const offset = ftContent.getTextContent().indexOf("ote");
            expect(offset).toBeGreaterThan(0);
            ftContent.select(offset, offset);
          }),
        );

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              fpItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          const chars = note.getChildren().filter($isCharNode);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
          const [ft, fp] = chars;
          expect(ft.getTextContent()).toContain("A n");
          expect(ft.getTextContent()).not.toContain("ote");
          expect(fp.getTextContent()).toContain("ote");
          expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);
        });
      });

      it("caret at the END of the \\ft content: opens an empty, typing-ready \\fp — same as Enter there", async () => {
        const { editor, note, ftContent } = await setUpExpandedFootnote();
        await act(async () =>
          editor.update(() =>
            ftContent.select(ftContent.getTextContentSize(), ftContent.getTextContentSize()),
          ),
        );

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              fpItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText("X");
          }),
        );

        editor.getEditorState().read(() => {
          const chars = note.getChildren().filter($isCharNode);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fp"]);
          // The break is typing-ready: the typed text became the \fp's content (structural
          // NBSP separator + typed text — the placeholder-consumption convention).
          const fp = chars[1];
          const fpContent = fp
            .getChildren()
            .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
          expect(requireDefined(fpContent, "\\fp content missing").getTextContent()).toBe(
            `${NBSP}X`,
          );
        });
      });

      it("falls back to the generic char insertion when the caret is NOT in expanded note content", async () => {
        // Outside a note the break semantic does not apply; `fp` keeps the pre-existing
        // structural behavior (it is a CharNode-valid marker) rather than being swallowed.
        let text: TextNode;
        const { editor } = await fullHarnessEnvironment(() => {
          const para = $createParaNode("p");
          text = $createTextNode("body text");
          $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
        });
        await act(async () => editor.update(() => text.select(4, 4)));

        await act(async () =>
          editor.update(() => {
            $applyMarkerMenuSelection(
              fpItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            );
          }),
        );

        editor.getEditorState().read(() => {
          // No note machinery ran (nothing to decline into silence): a \fp char span landed
          // in the paragraph via the generic insertion path.
          const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
          const chars = para.getChildren().filter($isCharNode);
          expect(chars.map((c) => c.getMarker())).toEqual(["fp"]);
        });
      });
    });
  });

  describe("open kind — literal-prefix cleanup never eats a marker glyph", () => {
    it("leaves a MarkerNode's glyph text intact when the caret sits on the glyph", async () => {
      // The scrRef "yank" can park the caret at the end of a paragraph's marker glyph (`\q1`).
      // The literal-prefix regex matches that whole glyph text, so without a MarkerNode guard
      // the cleanup spliced the glyph away — and with a PREVIOUS paragraph present, the
      // marker-deletion transform's merge branch then FUSED the two paragraphs (with no
      // previous para the reset branch re-injects the prefix, self-healing and masking this).
      let glyph: MarkerNode;
      const { editor } = await testEnvironment(() => {
        const intro = $createParaNode("p");
        const qPara = $createParaNode("q1");
        glyph = $createMarkerNode("q1");
        $getRoot().append(
          intro.append(
            $createMarkerNode("p"),
            $createTrailingSpaceNode(),
            $createTextNode("intro text"),
          ),
          qPara.append(glyph, $createTrailingSpaceNode(), $createTextNode("poetry line")),
        );
      });
      await act(async () =>
        editor.update(() => {
          const length = glyph.getTextContent().length;
          glyph.select(length, length); // caret at the end of the `\q1` glyph text
        }),
      );

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

      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        // Both paragraphs survive un-fused, the q1 keeps its marker, and its glyph text is intact.
        expect(paras).toHaveLength(2);
        expect(paras[1].getMarker()).toBe("q1");
        const first = paras[1].getFirstChild();
        expect($isMarkerNode(first) ? first.getTextContent() : undefined).toBe("\\q1");
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
      // ("\u00A0asdf"), and the serializer — which strips the separator by exact-NBSP text match —
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

    it("deletes the typed `\\` trigger literal before closing (literalPrefixLanded: true)", async () => {
      // Closing via the ACTIVE `\` palette: the trigger backslash landed as literal text in the
      // span's content before the pick. The cleanup runs BEFORE the closeTag branch — a
      // branch-order regression (closeTag returning before the cleanup) strands the `\` in the
      // styled half and the close then splits at the wrong offset.
      let content: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        const char = $createCharNode("nd");
        content = $createTextNode(`${NBSP}Lo\\rd`);
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
          ),
        );
      });
      // Caret right after the just-typed `\` (between "Lo\" and "rd").
      await act(async () => editor.update(() => content.select(4, 4)));

      const item: MarkerMenuItem = { marker: "nd*", kind: "closeTag", isBasic: false };
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
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para missing",
        );
        // The literal trigger is gone from CONTENT text everywhere (glyph nodes legitimately
        // carry backslashes, so plain text nodes are checked, not the flattened paragraph).
        const plainTexts = para.getAllTextNodes().filter((node) => !$isMarkerNode(node));
        expect(plainTexts.some((node) => node.getTextContent().includes("\\"))).toBe(false);
        // The close then split at the CLEANED-UP caret: "Lo" stays styled, "rd" leaves.
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getTextContent()).toContain("Lo");
        expect(chars[0].getTextContent()).not.toContain("rd");
        const after = chars[0].getNextSibling();
        expect($isTextNode(after) && !$isMarkerNode(after)).toBe(true);
        expect($isTextNode(after) ? after.getTextContent() : undefined).toBe("rd");
      });
    });

    describe("non-NEST apply from INSIDE a char span closes and reopens (PT9 StyleApplicator)", () => {
      /** A footnote whose \ft content holds `A \+nd holy\+nd* B` — a nested \nd with text after. */
      async function setUpNestedNd() {
        let noteRef: NoteNode | undefined;
        const environment = await fullHarnessEnvironment(() => {
          const para = $createParaNode("p");
          const note = $createNoteNode("f", "+", false);
          const ftChar = $createCharNode("ft");
          ftChar.setUnknownAttributes({ closed: "false" });
          const ndChar = $createCharNode("nd");
          // NBSP: the structural separator loaded spans carry (see markerSeparators.utils.ts).
          ndChar.append(
            $createMarkerNode("nd", "opening", true),
            $createTextNode(`${NBSP}holy`),
            $createMarkerNode("nd", "closing", true),
          );
          ftChar.append(
            $createMarkerNode("ft"),
            $createTextNode(`${NBSP}A `),
            ndChar,
            $createTextNode(" B"),
          );
          note.append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText("+")),
            ftChar,
            $createMarkerNode("f", "closing"),
          );
          $getRoot().append(
            para.append(
              $createMarkerNode("p"),
              $createTrailingSpaceNode(),
              $createTextNode("text "),
              note,
            ),
          );
          noteRef = note;
        });
        return { ...environment, note: requireDefined(noteRef, "note missing") };
      }

      const nonNestItem: MarkerMenuItem = { marker: "fq", kind: "character", isBasic: true };

      function $spanText(charNode: CharNode): TextNode {
        return requireDefined(
          charNode.getChildren().find((c): c is TextNode => $isTextNode(c) && !$isMarkerNode(c)),
          "span text missing",
        );
      }
      /** Marker names of a span's direct CharNode children. */
      function childChars(charNode: CharNode): CharNode[] {
        return charNode.getChildren().filter($isCharNode);
      }
      /** Direct CharNode children of the note. */
      function noteChars(note: NoteNode): CharNode[] {
        return note.getChildren().filter($isCharNode);
      }
      function $nestedNd(note: NoteNode): CharNode {
        return childChars(noteChars(note)[0])[0];
      }
      /**
       * The USFM bytes the note stands for: every text node in document order (glyph nodes
       * included) with the structural NBSP separators rendered as the plain spaces they
       * serialize to.
       */
      function $noteUsfmBytes(note: NoteNode): string {
        return note
          .getAllTextNodes()
          .map((textNode) => textNode.getTextContent())
          .join("")
          .replaceAll(NBSP, " ");
      }

      it("(selection) closes \\nd and \\ft, puts \\fq at the note level, and reopens \\ft after it", async () => {
        const { editor, note } = await setUpNestedNd();
        // Select "ly" (the tail of the nested \nd's NBSP + "holy").
        await act(async () => editor.update(() => $spanText($nestedNd(note)).select(3, 5)));

        await act(async () =>
          editor.update(() =>
            $applyMarkerMenuSelection(
              nonNestItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            ),
          ),
        );

        editor.getEditorState().read(() => {
          // Note content is now \ft (holding \+nd ho) | \fq (ly) | \ft (B): the \fq is a NOTE-level
          // sibling of the split \ft halves — NOT nested inside \nd or \ft (which would swallow it).
          const chars = noteChars(note);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq", "ft"]);
          const [ftLeft, fq, ftRight] = chars;
          // \fq holds only "ly", with a bare (non-nested) glyph.
          expect(fq.getTextContent()).toContain("ly");
          expect(
            fq
              .getChildren()
              .filter($isMarkerNode)
              .map((m) => m.getTextContent()),
          ).toEqual(["\\fq"]);
          // \nd survives inside the FIRST \ft, holding only "ho"; the reopened \ft holds " B".
          expect(childChars(ftLeft)[0]?.getMarker()).toBe("nd");
          expect(childChars(ftLeft)[0]?.getTextContent()).toContain("ho");
          expect(ftRight.getTextContent()).toContain("B");
        });
      });

      it("(collapsed caret) ends \\ft at the caret and takes the rest of it into \\fq", async () => {
        const { editor, note } = await setUpNestedNd();
        // Caret between "ho" and "ly" inside the nested \nd (NBSP + "holy").
        await act(async () => editor.update(() => $spanText($nestedNd(note)).select(3, 3)));

        await act(async () =>
          editor.update(() =>
            $applyMarkerMenuSelection(
              nonNestItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            ),
          ),
        );

        editor.getEditorState().read(() => {
          // A note-content marker closes implicitly, so writing `\fq` IS how `\ft` ends: no `\ft*`
          // is emitted and no `\ft` is reopened, and everything after the caret — the reopened
          // `\+nd` and the outer span's own trailing text alike — becomes `\fq`'s content. The
          // explicitly-closed `\+nd` still closes and reopens, now inside the `\fq`.
          expect($noteUsfmBytes(note)).toBe("\\f + \\ft A \\+nd ho\\+nd*\\fq \\+nd ly\\+nd* B\\f*");
          const chars = noteChars(note);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq"]);
          const [ftLeft, fq] = chars;
          expect(childChars(ftLeft)[0]?.getTextContent()).toContain("ho");
          expect(childChars(fq)[0]?.getMarker()).toBe("nd");
          expect(childChars(fq)[0]?.getTextContent()).toContain("ly");
        });
      });

      it("(flat span) closes \\ft, puts \\fq at the note level, reopens \\ft", async () => {
        let noteRef: NoteNode | undefined;
        const { editor } = await fullHarnessEnvironment(() => {
          const para = $createParaNode("p");
          const note = $createNoteNode("f", "+", false);
          const ftChar = $createCharNode("ft");
          ftChar.setUnknownAttributes({ closed: "false" });
          ftChar.append($createMarkerNode("ft"), $createTextNode(`${NBSP}A holy B`));
          note.append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText("+")),
            ftChar,
            $createMarkerNode("f", "closing"),
          );
          $getRoot().append(
            para.append(
              $createMarkerNode("p"),
              $createTrailingSpaceNode(),
              $createTextNode("text "),
              note,
            ),
          );
          noteRef = note;
        });
        const note = requireDefined(noteRef, "note missing");
        await act(async () =>
          editor.update(() => {
            const t = $spanText(noteChars(note)[0]);
            const i = t.getTextContent().indexOf("holy");
            t.select(i, i + 4);
          }),
        );
        await act(async () =>
          editor.update(() =>
            $applyMarkerMenuSelection(
              nonNestItem,
              { trigger: "backslash", literalPrefixLanded: false },
              reference,
              makeDeps(),
            ),
          ),
        );
        editor.getEditorState().read(() => {
          const chars = noteChars(note);
          expect(chars.map((c) => c.getMarker())).toEqual(["ft", "fq", "ft"]);
          expect(chars[1].getTextContent()).toContain("holy"); // \fq at note level, not nested
        });
      });
    });
  });

  describe("no-range-selection guard", () => {
    it("warns through the provided logger and mutates nothing when there is no range selection", async () => {
      // The palette click can blur the editor and null its selection before the apply runs;
      // every path below then silently no-ops and the typed literal strands as data. The LOUD
      // warning is the only signal hosts get — if the guard stops firing (or starts mutating),
      // that failure goes silent again.
      let text: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        text = $createTextNode("Hello \\q");
        $getRoot().append(para.append($createMarkerNode("p"), $createTrailingSpaceNode(), text));
      });
      const stateBefore = JSON.stringify(editor.getEditorState().toJSON());
      const warn = vi.fn();
      const logger: LoggerBasic = { error: vi.fn(), warn, info: vi.fn(), debug: vi.fn() };

      const item: MarkerMenuItem = { marker: "q1", kind: "paragraph", isBasic: true };
      await act(async () =>
        editor.update(() => {
          $setSelection(null);
          $applyMarkerMenuSelection(
            item,
            { trigger: "backslash", literalPrefixLanded: true },
            reference,
            { ...makeDeps(), logger },
          );
        }),
      );

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("no range selection");
      // No cleanup, no retag, no split — the literal `\q` and the single paragraph survive.
      expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(stateBefore);
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

describe("$splitParagraphWithMarker — caret placement across the mid-span split", () => {
  it("parks the caret INSIDE the reopened span's content start when the split lands mid-span", async () => {
    // Enter-menu apply with the caret mid-span: `\p say \nd Lo|rd\nd* of hosts`. The split goes
    // through the char-stack close-and-reopen, so the tail keeps its span (no glyph-less half is
    // produced for the deletion transform to unwrap), and the ratified caret convention is
    // INSIDE the reopened span at its content start — the user's caret was inside the styled
    // run, and since the split deliberately preserves the style (a PT9 divergence), typing
    // continues it. This test previously pinned the caret at the fresh paragraph's content
    // boundary, the right point back when the unwrap ran on this path; it was agreed the pin
    // moves alongside the reroute.
    let ndContent!: TextNode;
    const { editor } = await fullHarnessEnvironment(() => {
      const para = $createParaNode("p");
      const nd = $createCharNode("nd");
      ndContent = $createTextNode(`${NBSP}Lord`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTrailingSpaceNode(),
          $createTextNode("say "),
          nd.append($createMarkerNode("nd"), ndContent, $createMarkerNode("nd", "closing")),
          $createTextNode(" of hosts"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        ndContent.select(3, 3); // between "Lo" and "rd" (content text is NBSP + "Lord")
        $splitParagraphWithMarker("p");
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      const fresh = paras[1];
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after split");
      expect(selection.isCollapsed()).toBe(true);
      const { anchor } = selection;
      const anchorNode = anchor.getNode();
      // The point itself, not merely "a selection exists": the caret hosts inside the REOPENED
      // span — the fresh paragraph's first content child, at index 2 past [glyph, separator] —
      // on its content text at offset 1, just past the structural NBSP separator.
      const span = anchorNode.getParent();
      expect($isCharNode(span) && span.getMarker()).toBe("nd");
      expect(span?.getParent()?.getKey()).toBe(fresh.getKey());
      expect(span?.getIndexWithinParent()).toBe(2);
      expect(anchor.type).toBe("text");
      expect(anchor.offset).toBe(1);
      expect(anchorNode.getTextContent()).toBe(`${NBSP}rd`);
    });

    // The observable form: typing continues the reopened style, ahead of the moved tail.
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("X");
      }),
    );
    editor.getEditorState().read(() => {
      const fresh = $getRoot().getChildren().filter($isParaNode)[1];
      const text = fresh.getTextContent();
      expect(text.indexOf("X")).toBeLessThan(text.indexOf("rd"));
      const span = fresh.getChildren().filter($isCharNode)[0];
      expect(span?.getTextContent()).toContain("Xrd");
    });
  });
});
