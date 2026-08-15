/**
 * Unmatched closers are ordinary editable text (Invariant I: displayed bytes are the document) —
 * bytes that happen to re-tokenize to nothing yet. As a DecoratorNode they could only be deleted
 * whole: not editable in place, invisible to the Tier-2 fragment (an opaque sentinel), so a
 * closer that went unmatched could never re-match even when the document later supplied its
 * opener. As text, the bytes flow through every rebuild and the tokenizer's own frame matching
 * decides what they close — re-matching falls out of re-tokenization instead of a bespoke rule.
 */

import { $appendCharPara, requireDefined, testEnvironment } from "./markerEdit.test-helpers";
import { $dfs } from "@lexical/utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode } from "lexical";
import {
  $createImmutableUnmatchedNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isMarkerNode,
  $isParaNode,
  ImmutableUnmatchedNode,
  NBSP,
} from "shared";

function $firstPara() {
  return $getRoot().getChildren().filter($isParaNode)[0];
}

/** Every unmatched node in the tree, by a full walk (they can sit inside char spans). */
function $allUnmatched(): ImmutableUnmatchedNode[] {
  return $dfs()
    .map(({ node }) => node)
    .filter($isImmutableUnmatchedNode);
}

describe("an unmatched closer is editable text", () => {
  it("resolves a mismatched closer edit into text bytes, not a decorator", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.closer.setTextContent("\\wj*")));
    await act(async () => editor.update(() => parts.marker.select(0, 0)));
    editor.getEditorState().read(() => {
      const unmatched = requireDefined($allUnmatched()[0], "unmatched node missing");
      expect($isTextNode(unmatched)).toBe(true);
      expect(unmatched.getTextContent()).toBe("\\wj*");
      expect(unmatched.getMarker()).toBe("wj*");
    });
  });

  it("pends an in-place edit and settles it on caret departure", async () => {
    let unmatched: ImmutableUnmatchedNode;
    const { editor } = await testEnvironment(() => {
      unmatched = $createImmutableUnmatchedNode("wj*");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("before "),
          unmatched,
          $createTextNode(" after"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        unmatched.setTextContent("\\qt*");
        unmatched.select(3, 3);
      }),
    );
    // Mid-edit: nothing settles under the caret; the edited bytes stay put.
    editor.getEditorState().read(() => {
      expect(unmatched.isAttached()).toBe(true);
      expect(unmatched.getTextContent()).toBe("\\qt*");
    });
    await act(async () => editor.update(() => $firstPara().getFirstChild()?.selectStart()));
    editor.getEditorState().read(() => {
      // Departure re-tokenizes the displayed bytes: still unmatched, now as `qt*`.
      const settled = requireDefined($allUnmatched()[0], "unmatched node missing");
      expect(settled.getMarker()).toBe("qt*");
      expect(settled.getTextContent()).toBe("\\qt*");
    });
  });

  it("re-matches: the first unmatched closer inside an open span becomes that span's closer", async () => {
    // The paste repro's end state: an open (auto-closed) `\nd` literal with the once-unmatched
    // `\nd*` after it. The terminated literal re-triggers the rebuild on mount; the closer's
    // bytes flow into the fragment and the tokenizer matches them to the open span.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("say \\nd fruit"),
          $createImmutableUnmatchedNode("nd*"),
        ),
      );
    });
    await act(async () => Promise.resolve());
    editor.getEditorState().read(() => {
      expect($allUnmatched()).toHaveLength(0);
      const span = requireDefined(
        $firstPara().getChildren().filter($isCharNode)[0],
        "nd span missing",
      );
      expect(span.getMarker()).toBe("nd");
      // Explicitly closed by the re-matched closer: no closed="false", and the closing glyph is
      // a real child of the span.
      expect(span.getUnknownAttributes()?.closed).toBeUndefined();
      expect(
        span
          .getChildren()
          .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing"),
      ).toBe(true);
    });
  });

  it("re-matches only the FIRST unmatched closer; later ones stay unmatched", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("say \\nd asdf"),
          $createImmutableUnmatchedNode("nd*"),
          $createTextNode(" fdsa"),
          $createImmutableUnmatchedNode("nd*"),
        ),
      );
    });
    await act(async () => Promise.resolve());
    editor.getEditorState().read(() => {
      const spans = $firstPara().getChildren().filter($isCharNode);
      expect(spans).toHaveLength(1);
      expect(spans[0].getMarker()).toBe("nd");
      expect(spans[0].getUnknownAttributes()?.closed).toBeUndefined();
      const unmatched = $allUnmatched();
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].getMarker()).toBe("nd*");
    });
  });

  it("deletes the construct when every byte is deleted", async () => {
    let unmatched: ImmutableUnmatchedNode;
    const { editor } = await testEnvironment(() => {
      unmatched = $createImmutableUnmatchedNode("wj*");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("before "),
          unmatched,
          $createTextNode(" after"),
        ),
      );
    });
    await act(async () => editor.update(() => unmatched.setTextContent("")));
    await act(async () => editor.update(() => $firstPara().getFirstChild()?.selectStart()));
    editor.getEditorState().read(() => {
      expect($allUnmatched()).toHaveLength(0);
      // The flanking text survives; the adjacent space pair is the whitespace transform's to
      // normalize, so only the words are asserted.
      expect($firstPara().getTextContent()).toContain("before");
      expect($firstPara().getTextContent()).toContain("after");
    });
  });
});
