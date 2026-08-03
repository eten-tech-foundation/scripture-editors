/**
 * Integration regression for the milestone display-run self-heal. The collab materializer
 * ($createMilestone, delta-apply-update.utils.ts) builds a BARE MilestoneNode with no display-run
 * siblings — before the self-heal transform (attributeDisplay.utils.ts's
 * $syncMilestoneDisplayRun, registered on MilestoneNode in MarkerEditPlugin.tsx), such a milestone
 * stayed a Tier-2 sentinel forever (tier2Rebuild.utils.ts's run.length > 0 guard): never editable,
 * never re-tokenizable. Mounting MarkerEditPlugin heals a bare milestone into a full display run
 * on construction (a freshly created node is dirty); this test proves the paragraph now flows the
 * milestone's bytes through Tier-2 re-tokenization instead of falling back to the sentinel, and
 * that the result is a genuine fixed point.
 */

import { requireDefined, testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { $createMarkerPrefix } from "./markerEditDeletion.utils";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode } from "lexical";
import {
  $createMilestoneNode,
  $createParaNode,
  $isCharNode,
  $isMilestoneNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  NBSP,
  ParaNode,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; a commit that touches selection
// (Tier 2's own restore-selection-at-offset) gives the editor root DOM focus, and Lexical's
// post-commit scroll-into-view reads a Range rect. Stub it (a zero rect nothing here asserts on),
// same as the sibling marker-edit tests.
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

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

function $lastPara(): ParaNode {
  const paras = $getRoot().getChildren().filter($isParaNode);
  return paras[paras.length - 1];
}

describe("collab-materialized milestone settles into a re-tokenizable run", () => {
  it("heals on construction, then re-tokenizes through Tier 2 as a genuine fixed point", async () => {
    // Step 1: mount with ONLY the bare milestone (no other literal marker text anywhere in the
    // paragraph) — nothing else in this commit can trigger an automatic Tier-2 rebuild, so the
    // milestone's key here is reliably its ORIGINAL, self-heal-only state.
    const { editor } = await testEnvironment(() => {
      const [glyph, separator] = $createMarkerPrefix("p");
      const milestone = $createMilestoneNode("qt-s", "q1");
      $getRoot().append(
        $createParaNode("p").append(glyph, separator, $createTextNode("before "), milestone),
      );
    });

    // The self-heal transform ran on construction (a freshly created MilestoneNode is dirty): the
    // bare milestone now carries a full display run, the same shape usj-editor.adaptor builds.
    const originalKey = editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex($isMilestoneNode);
      expect(msIndex).toBeGreaterThanOrEqual(0);
      expect(children[msIndex + 1]?.getTextContent()).toBe("\\qt-s");
      expect(children[msIndex + 2]?.getTextContent()).toBe(`${NBSP}|sid="q1"`);
      expect(children[msIndex + 3]?.getTextContent()).toBe("\\*");
      return children[msIndex]?.getKey();
    });

    // Step 2: append a literal char marker AFTER the milestone's now-healed run, in a SEPARATE
    // commit. The marker-edit engine's own TextNode catch-all ($textNodeTier2Transform) fires
    // automatically on this literal and drives a Tier-2 rebuild of the whole paragraph within the
    // SAME commit — the real end-to-end path (typing), not a manually invoked one. That rebuild
    // re-tokenizes the healed milestone's run as ORDINARY content alongside the literal: the
    // milestone comes out the other side as a FRESH node from the re-parsed fragment, not the same
    // preserved-sentinel instance (mirrors tier2Rebuild.utils.test.tsx's "a milestone whose marker
    // cannot be classified stays atomic" test, which asserts the OPPOSITE — same key — for the
    // still-unrecognized-marker case).
    await act(async () =>
      editor.update(
        () => {
          const children = $lastPara().getChildren();
          const closingGlyph = children.find(
            (node) => $isTextNode(node) && node.getTextContent() === "\\*",
          );
          closingGlyph?.insertAfter($createTextNode(" \\nd x\\nd* after"));
        },
        { discrete: true },
      ),
    );

    let settledKey = "";
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msNode = requireDefined(
        children.find($isMilestoneNode),
        "milestone missing after rebuild",
      );
      settledKey = msNode.getKey();
      expect(settledKey).not.toBe(originalKey);
      expect(msNode.getSid()).toBe("q1");
      // The literal alongside it re-tokenized too — proof this was a real Tier-2 rebuild, not a
      // no-op that happened to leave the milestone looking different for some other reason.
      expect(children.some((node) => $isCharNode(node) && node.getMarker() === "nd")).toBe(true);
    });

    // Fixed point: rebuilding again with nothing left to change makes no further edits.
    await act(async () =>
      editor.update(
        () => {
          expect($rebuildParas([$lastPara()], context)).toBe(false);
        },
        { discrete: true },
      ),
    );

    editor.getEditorState().read(() => {
      const msNode = requireDefined(
        $lastPara().getChildren().find($isMilestoneNode),
        "milestone missing after the fixed-point rebuild",
      );
      expect(msNode.getKey()).toBe(settledKey);
    });
  });
});
