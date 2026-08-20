/**
 * Regression for TJ's live repro: deleting an optbreak's `//` display token (the whole of what
 * backspace does to a token-mode DecoratorNode child — Lexical removes the node outright, it
 * cannot be partially edited) left the parent `UnknownNode` behind as an empty, invisible husk —
 * an undead optbreak with no bytes and no caret-distinguishable position. `\optbreak` carries no
 * USFM byte representation other than the `//` token itself (unknownUsfm.utils.ts), so once that
 * token is gone there is nothing left to re-derive it from and nothing left worth keeping: the
 * settle must remove the whole node, exactly like deleting every byte of any other display-run
 * owner (milestones, verse attribute triplets) removes THAT construct instead of leaving a husk.
 *
 * Mounts only `MarkerEditPlugin` (`testEnvironment`) — no self-healing sync is involved: UnknownNode
 * has none (unknownUsfm.utils.ts's module doc: "nothing here ever re-tokenizes back into node
 * state, so there is no cache to keep honest and no sync to register"), so the cross-commit
 * mutation-listener pend (`$ownerOfRunPiece`'s optbreak arm, displayRunOwner.utils.ts) plus
 * `$settlePendedDisplayOwner`'s new optbreak arm are sufficient on their own.
 */

import { requireDefined, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode } from "lexical";
import {
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  $createUnknownNode,
  $isParaNode,
  $isUnknownNode,
  NBSP,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
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

describe("optbreak deletion settles (TJ repro: undead //)", () => {
  it("deleting the // display text removes the UnknownNode on departure, keeping flank bytes", async () => {
    const { editor } = await testEnvironment(() => {
      const optbreak = $createUnknownNode("optbreak");
      optbreak.append($createImmutableTypedTextNode("marker", "//")); // token-mode display child
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("before "),
          optbreak,
          $createTextNode(" after"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });
    // Re-query nodes each commit (Lexical merges/rebuilds detach cross-closure references).
    const $firstPara = () => $getRoot().getChildren().filter($isParaNode)[0];
    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    await act(async () =>
      editor.update(() => {
        const unknown = requireDefined(
          $firstPara().getChildren().find($isUnknownNode),
          "optbreak missing",
        );
        unknown.getChildren().forEach((child) => child.remove()); // what backspace does to a token
        const before = unknown.getPreviousSibling();
        if ($isTextNode(before))
          before.select(before.getTextContentSize(), before.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const para = $firstPara();
      expect(para.getChildren().some($isUnknownNode)).toBe(false); // husk gone
      // Standard view displays a run of adjacent spaces as NBSP so it stays visible on screen
      // (whitespaceDisplay.plugin.utils.ts) — orthogonal to this deletion policy. Both flanking
      // spaces are significant bytes ("before "'s trailing space and " after"'s leading space)
      // and neither is stripped, so once they become adjacent they form exactly such a run;
      // normalize back to plain spaces before checking content, the same inversion the app's own
      // copy handler uses ($getStandardViewClipboardData).
      const text = para.getTextContent().replaceAll(NBSP, " ");
      expect(text).toContain("before "); // flank bytes intact
      expect(text).toContain(" after");
      expect(text).not.toContain("//");
    });
  });
});
