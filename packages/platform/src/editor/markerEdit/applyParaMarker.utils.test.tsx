import { $applyParaMarker } from "./applyParaMarker.utils";
import { viewOptions as standardViewOptions } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isMarkerNode,
  MarkerNode,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";
import { FORMATTED_VIEW_MODE, getViewOptions } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const hiddenViewOptions = requireDefined(
  getViewOptions(FORMATTED_VIEW_MODE),
  "Formatted view options are required for these tests.",
);

/** A paragraph prefix's trailing NBSP separator, tagged like the adaptor builds it. */
function $createTrailingSpaceNode(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

describe("$applyParaMarker", () => {
  it("rewrites an existing glyph in place: marker state and glyph change together, node identities preserved", async () => {
    let para: ParaNode;
    let glyph: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("q2");
      glyph = $createMarkerNode("q2");
      $getRoot().append(
        para.append(glyph, $createTrailingSpaceNode(), $createTextNode("still waters")),
      );
    });

    await act(async () =>
      editor.update(() => {
        $applyParaMarker(para, "q1", standardViewOptions);

        expect(para.getMarker()).toBe("q1");
        const first = para.getFirstChild();
        if (!$isMarkerNode(first)) throw new Error("expected the glyph to survive as first child");
        // Same glyph node rewritten, not a fresh injection next to the old one.
        expect(first.is(glyph)).toBe(true);
        expect(first.getMarker()).toBe("q1");
        expect(first.getTextContent()).toBe("\\q1");
        expect(para.getChildrenSize()).toBe(3);
        expect(para.getTextContent()).toContain("still waters");
      }),
    );
  });

  it("canonicalizes drifted glyph text even when the marker value is unchanged", async () => {
    let para: ParaNode;
    let glyph: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("q2");
      glyph = $createMarkerNode("q2");
      $getRoot().append(
        para.append(glyph, $createTrailingSpaceNode(), $createTextNode("still waters")),
      );
    });

    await act(async () =>
      editor.update(() => {
        // A typed literal is still sitting in the glyph (mid-rename state); re-applying the
        // SAME marker must still restore the canonical glyph text.
        glyph.setTextContent("\\q1\\q2");

        $applyParaMarker(para, "q2", standardViewOptions);

        expect(para.getMarker()).toBe("q2");
        expect(glyph.getTextContent()).toBe("\\q2");
      }),
    );
  });

  it("injects the [glyph, separator] prefix for a prefix-less paragraph in editable marker mode", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      $getRoot().append(para.append($createTextNode("fresh content")));
    });

    await act(async () =>
      editor.update(() => {
        $applyParaMarker(para, "q1", standardViewOptions);

        expect(para.getMarker()).toBe("q1");
        const first = para.getFirstChild();
        if (!$isMarkerNode(first)) throw new Error("expected an injected MarkerNode glyph");
        expect(first.getMarker()).toBe("q1");
        expect(first.getTextContent()).toBe("\\q1");
        const separator = para.getChildAtIndex(1);
        if (!$isTextNode(separator)) throw new Error("expected the NBSP separator");
        expect(separator.getTextContent()).toBe(NBSP);
        expect($getState(separator, textTypeState)).toBe("marker-trailing-space");
        // Injection parks the caret on the content side of the new prefix (same contract as
        // the split/menu flows the injection path serves).
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        const contentNode = para.getChildAtIndex(2);
        expect(selection.anchor.getNode().is(contentNode)).toBe(true);
        expect(selection.anchor.offset).toBe(0);
      }),
    );
  });

  it("leaves prefix-less paragraphs glyph-less outside editable marker mode", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      $getRoot().append(para.append($createTextNode("formatted content")));
    });

    await act(async () =>
      editor.update(() => {
        $applyParaMarker(para, "m", hiddenViewOptions);

        expect(para.getMarker()).toBe("m");
        // Hidden/visible marker modes carry no injectable glyph — bare marker state only.
        expect(para.getChildren().some($isMarkerNode)).toBe(false);
        expect(para.getChildrenSize()).toBe(1);
      }),
    );
  });

  it("never injects when the marker mode is unknown (no view options)", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      $getRoot().append(para.append($createTextNode("plain content")));
    });

    await act(async () =>
      editor.update(() => {
        $applyParaMarker(para, "m");

        expect(para.getMarker()).toBe("m");
        expect(para.getChildren().some($isMarkerNode)).toBe(false);
      }),
    );
  });
});
