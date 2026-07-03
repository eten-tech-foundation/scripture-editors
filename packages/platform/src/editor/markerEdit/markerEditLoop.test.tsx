/**
 * Regression tests for the resolve/rebuild fixed-point loop (Critical finding) and
 * the caret-hijack-on-completion finding (Important #1).
 *
 * The loop: an unterminated backslash sequence the tokenizer cannot structure
 * (`\zzz`, a typo'd `\qq1`, a pasted `C:\temp`) lands as pending literal text; a
 * caret departure or Enter routes it to Tier 2; the rebuild reproduces the same
 * literal text in a fresh node; that node re-arms the TextNode transform, which
 * re-adds it to `pendingKeys`; the update listener self-dispatches
 * `SELECTION_CHANGE_COMMAND`, which resolves and rebuilds again — forever. Pre-fix
 * this hung the main thread (measured at 180s). The fix is a fixed-point refusal in
 * `$rebuildParas`: a structurally identical rebuild mutates nothing, so no new node
 * is created, nothing re-arms, and the cascade terminates. The termination argument
 * is verified by the mere fact that each test RETURNS (pre-fix it hangs); the tests
 * carry generous per-test timeouts so a re-introduced loop fails loudly.
 */

import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  KEY_ENTER_COMMAND,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  NBSP,
  textTypeState,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the
// editor root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect.
// Stub it (a zero rect nothing here asserts on), same as markerEditDeletion.utils.test.tsx.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

/** Two `\p` paragraphs P and Q, each `[marker, trailing NBSP, content text]`. */
function $twoParas(pContent: string, qContent: string): { pText: TextNode; qText: TextNode } {
  const pText = $createTextNode(pContent);
  const qText = $createTextNode(qContent);
  const pTrailing = $createTextNode(NBSP);
  $setState(pTrailing, textTypeState, "marker-trailing-space");
  const qTrailing = $createTextNode(NBSP);
  $setState(qTrailing, textTypeState, "marker-trailing-space");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), pTrailing, pText),
    $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
  );
  return { pText, qText };
}

/** True when `anchor` is inside the paragraph whose content text is `qText`. */
function $anchorIsInParaOf(anchor: LexicalNode, qText: TextNode): boolean {
  const qPara = qText.getParent();
  for (let node: LexicalNode | null = anchor; node; node = node.getParent())
    if (qPara && node.is(qPara)) return true;
  return false;
}

describe("Tier 2 resolve/rebuild fixed-point loop (Critical)", () => {
  it("does not hang and keeps literal text: unterminated \\zzz + caret departure", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("body", "second")),
    );

    // Type an unterminated unknown marker; caret stays inside it, so it only pends.
    await act(async () =>
      editor.update(() => {
        pText.setTextContent("body \\zzz");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    // Move the caret into the other paragraph -> the pending marker resolves.
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\zzz"); // literal text intact
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);

  it("does not hang and keeps literal text: unterminated \\zzz + Enter", async () => {
    let pText: TextNode;
    const { editor } = await testEnvironment(() => ({ pText } = $twoParas("body", "second")));

    await act(async () =>
      editor.update(() => {
        pText.setTextContent("body \\zzz");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\zzz");
    });
  }, 15000);

  it("does not hang and keeps literal text: path-like C:\\temp + caret departure", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("safe", "second")),
    );

    await act(async () =>
      editor.update(() => {
        pText.setTextContent("C:\\temp");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("C:\\temp");
    });
  }, 15000);
});

describe("caret hijack on pending completion (Important #1)", () => {
  it("leaves the caret in another paragraph when a real rebuild fires elsewhere", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("before  after", "second")),
    );

    // Terminated markers -> a genuine structural rebuild of P (creates an `nd` span),
    // triggered while the caret already sits in Q. The caret must not be yanked into P.
    await act(async () =>
      editor.update(() => {
        pText.setTextContent("before \\nd Lord\\nd* after");
        qText.select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      // P really was rebuilt into a char span (proves the rebuild ran, not refused).
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      expect(firstPara.getChildren().some($isCharNode)).toBe(true);
      // ...and the caret is still in Q, untouched.
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);
});
