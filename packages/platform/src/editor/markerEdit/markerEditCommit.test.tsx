/**
 * Regression tests for the abandonment-window blur policy: a marker rename walked
 * away from mid-edit stays in `pendingKeys`
 * indefinitely (BLUR excepts the caret's node to protect the marker-menu apply flow),
 * so a host save/`getUsj` serializes the OLD marker while the screen shows the new
 * one. `COMMIT_PENDING_MARKERS_COMMAND` lets the host settle pendings right before it
 * reads the USJ to save — resolving everything when the editor no longer has DOM
 * focus (the abandoned case) while still excepting the node under a live caret
 * (mid-typing pause) and the user's node during an app-placed-caret suppression
 * window (scrRef-yank).
 */

import { COMMIT_PENDING_MARKERS_COMMAND } from "./MarkerEditPlugin";
import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getState,
  $setState,
  BLUR_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  CURSOR_CHANGE_TAG,
  MarkerNode,
  NBSP,
  textTypeState,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the
// editor root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect.
// Stub it (a zero rect nothing here asserts on), same as markerEditLoop.test.tsx.
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

/** An `\s1` section para and a second plain `\p` para to depart to. */
function $sectionAndBodyParas(): { sectionMarker: MarkerNode; bodyText: TextNode } {
  const sectionTrailing = $createTextNode(NBSP);
  $setState(sectionTrailing, textTypeState, "marker-trailing-space");
  const sectionMarker = $createMarkerNode("s1");
  const bodyTrailing = $createTextNode(NBSP);
  $setState(bodyTrailing, textTypeState, "marker-trailing-space");
  const bodyText = $createTextNode("body");
  $getRoot().append(
    $createParaNode("s1").append(sectionMarker, sectionTrailing, $createTextNode("Heading")),
    $createParaNode("p").append($createMarkerNode("p"), bodyTrailing, bodyText),
  );
  return { sectionMarker, bodyText };
}

/** The marker of the first (section) paragraph. */
function firstParaMarker(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const para = $getRoot().getChildren().filter($isParaNode)[0];
    return para.getMarker();
  });
}

describe("COMMIT_PENDING_MARKERS_COMMAND (abandonment window)", () => {
  it("settles an abandoned mid-rename when the editor is not focused", async () => {
    let sectionMarker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ sectionMarker } = $sectionAndBodyParas()));

    // Rename the glyph in place (`\s1` -> `\s2`, no terminator typed) with the caret
    // still inside the marker node - the node pends rather than resolving.
    await act(async () =>
      editor.update(() => {
        sectionMarker.setTextContent("\\s2");
        sectionMarker.select(3, 3);
      }),
    );
    // Walk away: focus leaves the editor. BLUR's sweep excepts the caret's own node,
    // so the rename is still pending - the exact abandonment window.
    await act(async () => {
      editor.getRootElement()?.blur();
      editor.dispatchCommand(BLUR_COMMAND, new FocusEvent("blur"));
    });
    expect(firstParaMarker(editor)).toBe("s1"); // stale: screen shows \s2, state says s1

    // The host is about to serialize (save): settle pendings first.
    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });

    expect(firstParaMarker(editor)).toBe("s2");
  }, 15000);

  it("keeps the node under a live caret pending (mid-typing pause must not settle)", async () => {
    let sectionMarker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ sectionMarker } = $sectionAndBodyParas()));

    await act(async () =>
      editor.update(() => {
        sectionMarker.setTextContent("\\s2");
        sectionMarker.select(3, 3);
      }),
    );
    // The editor still has DOM focus with the caret parked in the pending node
    // (Lexical focuses the root when it reconciles the caret move above).
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });

    expect(firstParaMarker(editor)).toBe("s1"); // still pending; departure will settle it
  }, 15000);

  it("keeps the user's node pending across an app-placed-caret window (scrRef yank)", async () => {
    let sectionMarker: MarkerNode;
    let bodyText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ sectionMarker, bodyText } = $sectionAndBodyParas()),
    );

    await act(async () =>
      editor.update(() => {
        sectionMarker.setTextContent("\\s2");
        sectionMarker.select(3, 3);
      }),
    );
    // A programmatic scrRef sync yanks the caret elsewhere (CURSOR_CHANGE-tagged commit
    // that moves the anchor) - NOT a user departure, so the rename must stay pending
    // even though the current anchor is no longer in the marker node.
    await act(async () => editor.update(() => bodyText.select(0, 0), { tag: CURSOR_CHANGE_TAG }));
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });

    expect(firstParaMarker(editor)).toBe("s1"); // suppression window respected
  }, 15000);
});

describe("pending para-marker rename resolution — red-letter paragraphs", () => {
  it("keeps the marker-trailing separator when the para starts with a char span", async () => {
    // Live repro: in a paragraph whose content STARTS with an inline char span, editing the
    // paragraph glyph's text (delete chars, type a new marker — no terminator) and then moving
    // the caret away resolved the pending rename but ATE the NBSP separator after the glyph.
    // Subsequent retags then kept producing a separator-less prefix, and the retag caret
    // (an element point at index 2) landed at the paragraph END. Plain-text-first paragraphs
    // were unaffected.
    let paraMarker: MarkerNode;
    let bodyText: TextNode;
    const { editor } = await testEnvironment(() => {
      const sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      const bodySep = $createTextNode(NBSP);
      $setState(bodySep, textTypeState, "marker-trailing-space");
      paraMarker = $createMarkerNode("p");
      bodyText = $createTextNode("body");
      const wj = $createCharNode("wj");
      $getRoot().append(
        $createParaNode("p").append(
          paraMarker,
          sep,
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(`${NBSP}Jesus said`),
            $createMarkerNode("wj", "closing"),
          ),
        ),
        $createParaNode("p").append($createMarkerNode("p"), bodySep, bodyText),
      );
    });

    // Delete glyph chars + type the new marker (no terminator space): `\p` → `\q1`, caret inside.
    await act(async () =>
      editor.update(() => {
        paraMarker.setTextContent("\\q1");
        paraMarker.select(3, 3);
      }),
    );
    // Caret departs → the pending rename resolves.
    await act(async () => editor.update(() => bodyText.select(0, 0)));

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      expect(para.getMarker()).toBe("q1");
      const children = para.getChildren();
      // The [glyph, separator, content] layout must survive the resolution.
      expect(children[0].getTextContent()).toBe("\\q1");
      const sep = children[1];
      expect(sep.getTextContent()).toBe(NBSP);
      expect($getState(sep, textTypeState)).toBe("marker-trailing-space");
      expect($isCharNode(children[2])).toBe(true);
      expect(para.getTextContent()).toContain("Jesus said");
    });
  });
});
