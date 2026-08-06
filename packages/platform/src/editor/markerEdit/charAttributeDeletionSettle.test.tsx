/**
 * Regression for TJ's 2026-08-05 live repro: deleting a char span's `|attr="value"` display run
 * with the caret left at an ELEMENT-point selection (`char.select(index, index)`, not a text-node
 * offset inside the run) resurrected the run — `$isCaretAtAttributeRunBoundary`'s boundary check
 * only recognizes a text-node-anchored caret, so an element-point caret at the same logical site
 * fell through the grace and `$syncCharAttributeDisplay` re-derived the "deleted" run right back
 * from the span's still-set `unknownAttributes`. Mounts BOTH the marker-edit engine (pend/settle)
 * and `CharNodePlugin` (the self-healing sync) — the real app's plugin stack — because the bug
 * lives in their interaction, exactly like the sibling verse/milestone regressions in
 * verseAttributeSettle.test.tsx.
 *
 * The two pins below run under BOTH plugin mount orders (`testEnvironmentWithCharSync`'s
 * `pluginOrder`): which of the two plugins registers its `CharNode` transform first decides which
 * one Lexical runs first on a shared dirty span, and that order differs between hosts —
 * `Editor.tsx` mounts `CharNodePlugin` before `MarkerEditPlugin`, the inverse of this suite's
 * original harness order. A fix that only prevents the resurrection under one order is not fixed
 * for hosts using the other, so destruction detection lives in the sync's OWN decision path
 * (attributeDisplay.utils.ts) rather than in a caller-side transform, and both orders must pass
 * identically here as proof.
 *
 * The last two tests cover the two review findings on that fix: a remote (collab) commit must
 * never pend an owner from a destroyed run (I-1), and the sync's own legitimate attribute-clear
 * heal must not mistake its own removal for a user deletion and get itself stuck pending (I-2).
 */

import { requireDefined, testEnvironmentWithCharSync } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $addUpdateTag,
  $createTextNode,
  $getRoot,
  $getState,
  $isTextNode,
  $setState,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isDisplayOwnerPended,
  $isMarkerNode,
  $isParaNode,
  DELTA_CHANGE_TAG,
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

describe("char attribute-run deletion settles (TJ repro, 2026-08-05)", () => {
  // Shared initial state: settled `\nd test|stuff="thing"\nd*` + a second paragraph to depart to.
  const $initial = () => {
    const char = $createCharNode("nd");
    char.setUnknownAttributes({ stuff: "thing" });
    const run = $createTextNode('|stuff="thing"');
    $setState(run, textTypeState, "attribute");
    char.append(
      $createMarkerNode("nd"),
      $createTextNode(`${NBSP}test`),
      run,
      $createMarkerNode("nd", "closing"),
    );
    $getRoot().append(
      $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), char),
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createTextNode("body"),
      ),
    );
  };

  describe.each(["app", "engine-first"] as const)("plugin mount order: %s", (pluginOrder) => {
    it("deleting the run alone clears the attributes on departure (element-point caret variant)", async () => {
      const { editor } = await testEnvironmentWithCharSync($initial, pluginOrder);
      // Re-query nodes each commit (Lexical merges/rebuilds detach cross-closure references).
      const $firstChar = () =>
        requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
          "char missing",
        );
      const $bodyTextNode = () => {
        const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
        if (!$isTextNode(body)) throw new Error("body text node missing");
        return body;
      };
      await act(async () =>
        editor.update(() => {
          const char = $firstChar(); // helper: first CharNode of first para, re-queried
          const run = requireDefined(
            char
              .getChildren()
              .find(
                (c) =>
                  $isTextNode(c) &&
                  !$isMarkerNode(c) &&
                  $getState(c, textTypeState) === "attribute",
              ),
            "run missing",
          );
          const index = run.getIndexWithinParent();
          run.remove();
          char.select(index, index); // the element-point caret the boundary heuristic misses
        }),
      );
      // The deletion must STICK while pending (no resurrect)…
      editor.getEditorState().read(() => {
        expect(
          $firstChar()
            .getChildren()
            .some(
              (c) =>
                $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
            ),
        ).toBe(false);
      });
      // …and departure settles it: attributes cleared.
      await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
      editor.getEditorState().read(() => {
        expect($firstChar().getUnknownAttributes()?.stuff).toBeUndefined();
      });
    });

    it("delete-then-retype ends with ONLY the new value (no stale invisible attribute)", async () => {
      const { editor } = await testEnvironmentWithCharSync($initial, pluginOrder);
      const $firstChar = () =>
        requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
          "char missing",
        );
      const $bodyTextNode = () => {
        const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
        if (!$isTextNode(body)) throw new Error("body text node missing");
        return body;
      };
      await act(async () =>
        editor.update(() => {
          const char = $firstChar();
          const run = requireDefined(
            char
              .getChildren()
              .find(
                (c) =>
                  $isTextNode(c) &&
                  !$isMarkerNode(c) &&
                  $getState(c, textTypeState) === "attribute",
              ),
            "run missing",
          );
          const index = run.getIndexWithinParent();
          run.remove();
          char.select(index, index);
        }),
      );
      await act(async () =>
        editor.update(() => {
          const content = requireDefined(
            $firstChar()
              .getChildren()
              .find(
                (c): c is TextNode =>
                  $isTextNode(c) &&
                  !$isMarkerNode(c) &&
                  $getState(c, textTypeState) !== "attribute",
              ),
            "content missing",
          );
          content.setTextContent(`${NBSP}test|stuff="thing2"`);
          content.select(content.getTextContentSize(), content.getTextContentSize());
        }),
      );
      await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
      editor.getEditorState().read(() => {
        expect($firstChar().getUnknownAttributes()?.stuff).toBe("thing2");
      });
    });
  });

  it("a remote (DELTA_CHANGE_TAG) commit that destroys a still-wanted run does not pend the owner", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    const $firstChar = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
        "char missing",
      );
    await act(async () =>
      editor.update(() => {
        $addUpdateTag(DELTA_CHANGE_TAG);
        const char = $firstChar();
        const run = requireDefined(
          char
            .getChildren()
            .find(
              (c) =>
                $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
            ),
          "run missing",
        );
        run.remove();
      }),
    );
    editor.read(() => {
      expect($isDisplayOwnerPended($firstChar())).toBe(false);
    });
  });

  it("a legitimate local attribute-clear heal does not pend the owner (no stuck grace)", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    const $firstChar = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
        "char missing",
      );
    await act(async () =>
      editor.update(() => {
        $firstChar().setUnknownAttributes(undefined);
      }),
    );
    // The clear healed cleanly — the run is gone, matching the now-empty attributes — and did NOT
    // leave the owner pended (which would exempt it from healing until an unrelated departure).
    editor.read(() => {
      expect($isDisplayOwnerPended($firstChar())).toBe(false);
    });
    editor.getEditorState().read(() => {
      expect(
        $firstChar()
          .getChildren()
          .some(
            (c) =>
              $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
          ),
      ).toBe(false);
    });
  });
});
