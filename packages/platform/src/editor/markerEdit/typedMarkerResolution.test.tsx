/**
 * Typed-marker resolution timing: a literal marker typed character-by-character into body text
 * must NOT resolve until the user supplies a terminator (space/NBSP or `*`) or genuinely departs.
 *
 * Pins the engine half of the live "\va after a verse resolves at \v" report: keystroke-by-
 * keystroke the engine is correct — each unterminated prefix pends behind the caret shield, and
 * the terminator folds the marker where it was typed. The live degradation (a red unknown `\vDa`
 * paragraph appearing mid-word) is not produced by this engine: it is the host's save loop
 * re-parsing the mid-edit literal bytes (ParatextData resolves the unknown marker as a paragraph)
 * and swapping the parsed document back in over the pending edit. These tests keep the engine
 * side honest so that diagnosis stays true.
 */

import { $appendVersePara, requireDefined, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, TextNode } from "lexical";
import { $isCharNode, $isParaNode } from "shared";

function $bodyText(): TextNode {
  const para = $getRoot().getChildren().filter($isParaNode)[0];
  const text = para
    .getChildren()
    .filter($isTextNode)
    .find((n) => n.getTextContent().startsWith("In the beginning"));
  return requireDefined(text, "body text missing");
}

function $typeAtCaret(text: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
  selection.insertText(text);
}

describe("typing \\va mid-text after a verse", () => {
  it("keeps every unterminated prefix literal and pending — nothing resolves mid-word", async () => {
    const { editor } = await testEnvironment(() => $appendVersePara());
    await act(async () => editor.update(() => $bodyText().select(0, 0)));
    for (const ch of "\\va") {
      await act(async () => editor.update(() => $typeAtCaret(ch)));
      editor.getEditorState().read(() => {
        // One paragraph throughout: no unknown-marker split, no phantom paragraph.
        expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
      });
    }
    editor.getEditorState().read(() => {
      // The literal rides in the text exactly as typed, caret still inside it.
      expect($getRoot().getTextContent()).toContain("\\vaIn the beginning");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().getTextContent()).toBe("\\vaIn the beginning");
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("resolves on the typed terminator into a char span where the marker was typed", async () => {
    const { editor } = await testEnvironment(() => $appendVersePara());
    await act(async () => editor.update(() => $bodyText().select(0, 0)));
    for (const ch of "\\va ") await act(async () => editor.update(() => $typeAtCaret(ch)));
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      // `\va` with no closer is a standalone unclosed char span holding the following text —
      // NOT a resolved `\v` and NOT an attribute fold (that needs `\va*` with content).
      const va = paras[0].getChildren().filter($isCharNode)[0];
      expect(va.getMarker()).toBe("va");
      expect(va.getUnknownAttributes()?.closed).toBe("false");
      expect(va.getTextContent()).toContain("In the beginning");
    });
  });
});
