/**
 * Regression tests for the abandonment-window blur policy: a marker rename walked
 * away from mid-edit stays in `pendingKeys`
 * indefinitely (BLUR excepts the caret's node to protect the marker-menu apply flow),
 * so a host save/`getUsj` serializes the OLD marker while the screen shows the new
 * one. `COMMIT_PENDING_MARKERS_COMMAND` lets the host settle pendings right before it
 * reads the USJ to save — resolving everything when the editor no longer has DOM
 * focus (the abandoned case), excepting the node under a live caret (mid-typing
 * pause), and resolving NOTHING while an app-placed-caret suppression window is
 * armed (scrRef yank or undo/redo restore — no user intent over the placed content).
 */

import { COMMIT_PENDING_MARKERS_COMMAND } from "./MarkerEditPlugin";
import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  BLUR_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  CURSOR_CHANGE_TAG,
  MarkerNode,
  NBSP,
  textTypeState,
} from "shared";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefinedInTest<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Depth-first search for the first CharNode with `marker` anywhere under `root`. */
function $findFirstChar(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findFirstChar(child, marker);
    if (found) return found;
  }
  return undefined;
}

/**
 * Whether any non-marker text node under `root` still holds a raw backslash — the
 * signature of a typed marker literal that never got tokenized into a MarkerNode glyph.
 */
function $hasRawBackslashText(root: LexicalNode): boolean {
  if ($isTextNode(root) && !$isMarkerNode(root) && root.getTextContent().includes("\\")) {
    return true;
  }
  if (!$isElementNode(root)) return false;
  return root.getChildren().some((child) => $hasRawBackslashText(child));
}

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

describe("typed char-marker literal settle — mid-sentence in existing text", () => {
  it("settles \\nd hello\\nd*, typed one keystroke at a time mid-sentence, by caret departure", async () => {
    // A char-marker literal typed one keystroke at a time with the caret MID-SENTENCE in
    // already-existing text (splitting a non-empty TextNode on both sides of the insertion
    // point, not typing at a clean paragraph/content boundary) resolves into a real `nd`
    // CharNode - open marker, "hello" content, closing marker - with no raw, un-tokenized
    // `\nd` text left behind. The terminated closer settles this immediately, during typing;
    // this test pins the resulting end state as it stands after the caret departs to another
    // paragraph.
    let bodyText: TextNode;
    let otherText: TextNode;
    const { editor } = await testEnvironment(() => {
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      bodyText = $createTextNode("The wicked flee");
      const otherTrailing = $createTextNode(NBSP);
      $setState(otherTrailing, textTypeState, "marker-trailing-space");
      otherText = $createTextNode("elsewhere");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), trailing, bodyText),
        $createParaNode("p").append($createMarkerNode("p"), otherTrailing, otherText),
      );
    });

    // Caret mid-sentence, right after "wicked " and before "flee" — NOT a clean
    // paragraph/content boundary.
    await act(async () => editor.update(() => bodyText.select(11, 11)));
    for (const character of `\\nd hello\\nd*`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    // A terminated closer settles the span immediately, during typing (Tier 2's
    // contiguous-closer trigger) - this departure pins the resulting end state, confirming it
    // survives undisturbed once the caret actually leaves.
    await act(async () => editor.update(() => otherText.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    editor.getEditorState().read(() => {
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      const nd = requireDefinedInTest(
        $findFirstChar(firstPara, "nd"),
        "nd char span not found after caret departure",
      );
      expect(nd.getTextContent()).toContain("hello");
      expect(
        nd.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
      ).toBe(true);
      // No raw, un-tokenized `\nd` literal survives outside the recognized marker glyphs.
      expect($hasRawBackslashText(firstPara)).toBe(false);
      expect(firstPara.getTextContent()).toContain("The wicked");
      expect(firstPara.getTextContent()).toContain("flee");
    });
  });

  it("pins the open-span shape for an unterminated \\nd hello (no closer) across caret departure", async () => {
    // Unlike an unrecognized marker, a recognized char style like `nd` materializes into a
    // real, structural CharNode the instant its terminating space is typed (Tier 1) - the
    // caret stays parked inside it (pending: the engine's node-under-caret exception keeps it
    // from being prematurely rebuilt while the user is still typing), but the tree already
    // shows the correct open shape rather than raw backslash text. With no closer ever typed,
    // the documented tokenizer rule for an implicitly-closed span applies: `closed: "false"`,
    // no closing marker, and content extending to swallow whatever follows, up to the
    // paragraph end (same rule pinned for the deletion path in
    // markerEditDeletion.utils.test.tsx's "leaves an unclosed... char span alone" case). This
    // test pins that caret departure - mid-sentence, the same caret position as the
    // terminated-closer test above - resolves the pend without corrupting that shape: no
    // forced auto-close, no stray un-tokenized literal text.
    let bodyText: TextNode;
    let otherText: TextNode;
    const { editor } = await testEnvironment(() => {
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      bodyText = $createTextNode("The wicked flee");
      const otherTrailing = $createTextNode(NBSP);
      $setState(otherTrailing, textTypeState, "marker-trailing-space");
      otherText = $createTextNode("elsewhere");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), trailing, bodyText),
        $createParaNode("p").append($createMarkerNode("p"), otherTrailing, otherText),
      );
    });

    // Same mid-sentence caret as the terminated-closer test above: right after "wicked " and
    // before "flee".
    await act(async () => editor.update(() => bodyText.select(11, 11)));
    for (const character of `\\nd hello`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }

    const assertOpenSpanShape = () =>
      editor.getEditorState().read(() => {
        const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
        const nd = requireDefinedInTest($findFirstChar(firstPara, "nd"), "nd char span not found");
        expect(nd.getUnknownAttributes()?.closed).toBe("false");
        expect(
          nd.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
        ).toBe(false);
        expect(nd.getTextContent()).toContain("hello");
        // No un-tokenized `\nd` literal survives outside the recognized marker glyph.
        expect($hasRawBackslashText(firstPara)).toBe(false);
      });

    // Caret still parked inside the span: pending, but already the correct open shape.
    assertOpenSpanShape();

    // Caret departure to the other paragraph.
    await act(async () => editor.update(() => otherText.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    // Departure resolves the pend without disturbing the open-span shape. Unlike the
    // terminated-closer test, with no closer the unclosed span absorbs the paragraph's
    // remainder ("flee") as its own content rather than leaving it as separate sibling text.
    assertOpenSpanShape();
    editor.getEditorState().read(() => {
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      expect(firstPara.getTextContent()).toContain("The wicked");
      expect(firstPara.getTextContent()).toContain("flee");
    });
  });
});
