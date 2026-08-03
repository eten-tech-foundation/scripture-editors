/**
 * Integration regression for verse `\va`/`\vp` attribute-run deletion. Mounts BOTH the marker-edit
 * engine (pend/settle) and TextSpacingPlugin (the self-healing display-run sync) — the real app's
 * plugin stack — because the bug lives in their interaction: deleting the whole triplet left
 * altnumber set, and the sync re-derived the triplet from it, so the deletion visibly undid itself
 * and never settled. The grace + pend + settle-on-departure wiring must clear altnumber on caret
 * departure without the run resurrecting.
 */

import { requireDefined, testEnvironmentWithSpacing } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState } from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isMarkerNode,
  $isParaNode,
  $isVerseNode,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
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

describe("verse \\va/\\vp deletion settles (does not resurrect)", () => {
  it("clears altnumber on caret departure after the whole \\va triplet is deleted", async () => {
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        "2",
        undefined,
      );
      const value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("va"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });

    // Re-query nodes each commit (Lexical merges/rebuilds detach cross-closure references).
    const $firstVerse = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    // Delete the whole \va triplet with the caret parked at the verse's end (the deletion site).
    await act(async () =>
      editor.update(() => {
        const verse = $firstVerse();
        const open = verse.getNextSibling();
        const value = open?.getNextSibling();
        const close = value?.getNextSibling();
        close?.remove();
        value?.remove();
        open?.remove();
        verse.select(verse.getTextContentSize(), verse.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits at the site: the sync did NOT re-derive the triplet, and
    // altnumber is still set (the deletion is pending, not settled).
    editor.getEditorState().read(() => {
      const v = $firstVerse();
      expect($isMarkerNode(v.getNextSibling())).toBe(false);
      expect(v.getAltnumber()).toBe("2");
    });

    // Caret departs to the second paragraph → the pending verse settles via Tier 2 re-tokenization.
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const settledVerse = $firstVerse();
      // altnumber cleared, and no \va triplet resurrected as the verse's next sibling.
      expect(settledVerse.getAltnumber()).toBeUndefined();
      expect($isMarkerNode(settledVerse.getNextSibling())).toBe(false);
    });
  });
});
