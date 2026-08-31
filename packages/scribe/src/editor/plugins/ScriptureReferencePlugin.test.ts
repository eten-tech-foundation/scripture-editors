// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isVerseNode,
  CharNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  ParaNode,
  VerseNode,
} from "shared";
import { $selectVerseContentStart } from "shared-react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
} from "lexical";

// Scribe shares `VerseNode` and Power mode (`markerMode: "editable"`) with the platform editor, so
// it hits the same PT-4021 caret placement. Its ScriptureReferencePlugin used to hold its own copy
// of the pre-fix block; it now routes through the shared helpers, which this pins.
describe("scribe verse-start caret placement", () => {
  it("lands inside the char's content when a verse opens with a character marker", () => {
    const { editor } = createBasicTestEnvironment([ParaNode, VerseNode, CharNode, MarkerNode]);

    editor.update(
      () => {
        $getRoot().append(
          $createParaNode("q1").append(
            $createVerseNode("7", getVisibleOpenMarkerText("v", "7")),
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}Lord`),
              $createMarkerNode("nd", "closing"),
            ),
          ),
        );
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("expected a para element");
        const verse = para.getFirstChild();
        if (!$isVerseNode(verse)) throw new Error("expected the verse node");

        $selectVerseContentStart(verse);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isTextNode(anchorNode)).toBe(true);
      // In the char's content past the NBSP scaffolding, not on the `\nd` marker.
      expect(anchorNode.getTextContent()).toBe(`${NBSP}Lord`);
      expect(selection.anchor.offset).toBe(NBSP.length);
    });
  });
});
