/**
 * Composed-plugin test (batch item 6): MarkerEditPlugin and TextSpacingPlugin mounted
 * TOGETHER, as they are in the real editor. TextSpacingPlugin removes lone space-only
 * TextNodes that don't precede a verse — so it could, in principle, eat the plain-space
 * separator MarkerEditPlugin's Ctrl+Space inserts between the two split spans. It does
 * NOT: that transform returns early when the next sibling is a CharNode, and
 * $displayWhitespaceTransform only maps spaces adjacent to other spaces/NBSP within one
 * node, so a lone separator preceding a styled span is left untouched. The composed
 * at-rest truth is therefore: two styled spans with a surviving plain-space separator
 * between them, honoring PT9's caret-lands-unstyled guarantee.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $appendCharPara } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  KEY_DOWN_COMMAND,
  TextNode,
} from "lexical";
import { $isCharNode, $isMarkerNode, $isParaNode, CharNode } from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, STANDARD_VIEW_MODE, TextSpacingPlugin } from "shared-react";

/** Mounts MarkerEditPlugin AND TextSpacingPlugin in Standard view (editable markers). */
async function composedEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <TextSpacingPlugin />
    </>,
  );
}

/** The char span's plain (non-marker) content text node. */
function $charContent(char: CharNode): TextNode {
  const node = char
    .getChildren()
    .filter($isTextNode)
    .find((n) => !$isMarkerNode(n));
  if (!node) throw new Error("char span has no content text node");
  return node;
}

describe("MarkerEditPlugin + TextSpacingPlugin composed", () => {
  it("Ctrl+Space mid-span keeps two spans and the plain-space separator survives", async () => {
    let char: CharNode;
    const { editor } = await composedEnvironment(() => (char = $appendCharPara().char));
    // caret between "Lo" and "rd" (content text is NBSP + "Lord")
    await act(async () => editor.update(() => $charContent(char).select(3, 3)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2); // split into two styled spans
      const between = chars[0].getNextSibling();
      // The separator survived TextSpacingPlugin (it precedes a CharNode) as a lone plain space.
      expect($isTextNode(between) && !$isMarkerNode(between)).toBe(true);
      expect(between?.getTextContent()).toBe(" ");
      expect(between?.is(chars[1].getPreviousSibling())).toBe(true);
      // Caret rests in the plain separator, not inside either styled span (PT9 parity).
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) expect(selection.anchor.getNode().is(between)).toBe(true);
    });
  });
});
