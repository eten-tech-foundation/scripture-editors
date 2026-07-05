import { $createParaNode, ParaNode } from "../usj/ParaNode.js";
import { createBasicTestEnvironment } from "../usj/test.utils.js";
import { $createUnknownNode, UnknownNode } from "./UnknownNode.js";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
} from "lexical";

describe("UnknownNode", () => {
  // Regression pin: design spec §7 requires §7 opaque blocks to render as a subdued read-only
  // block in standard view, gated purely by CSS (packages/platform/src/usj-nodes.css). createDOM
  // must NOT hard-code display:none (that hid the content in every view) — it emits a class and
  // data-marker attribute instead, and the CSS decides visibility per view mode.
  describe("createDOM()", () => {
    it("adds the 'unknown-block' class and data-marker attribute for a block-level construct", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("figure", "fig");
        const element = node.createDOM();

        expect(element.classList.contains("unknown-block")).toBe(true);
        expect(element.classList.contains("unknown-inline")).toBe(false);
        expect(element.getAttribute("data-marker")).toBe("fig");
      });
    });

    it("falls back to an empty data-marker when the construct has no USFM marker (e.g. table)", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("table", undefined);
        const element = node.createDOM();

        expect(element.getAttribute("data-marker")).toBe("");
      });
    });

    // Verify-first (spec plan-verify item): `\optbreak` (USJ type "optbreak") becomes an
    // UnknownNode with tag "optbreak" (packages/utilities/src/converters/usj/
    // converter-test.data.ts:2571, and the "optional line break (optbreak)" Phase 0 corpus
    // fixture). PT9 renders it as a literal `//` mid-sentence, so — unlike table/figure/
    // sidebar/periph/ref — it must render inline, not as a block box breaking the paragraph.
    it("adds the 'unknown-inline' class instead of 'unknown-block' for the optbreak construct", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("optbreak", undefined);
        const element = node.createDOM();

        expect(element.classList.contains("unknown-inline")).toBe(true);
        expect(element.classList.contains("unknown-block")).toBe(false);
      });
    });

    it("sets contentEditable to false", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("table", undefined);
        const element = node.createDOM();

        expect(element.contentEditable).toBe("false");
      });
    });

    it("does not set an inline display style (visibility is CSS-mode-gated, not JS-hidden)", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("table", undefined);
        const element = node.createDOM();

        expect(element.style.display).toBe("");
      });
    });
  });

  // Design spec §7: "whole-block selection/deletion only... caret navigation skips over it like
  // any decorator node." The skip-over-caret half of that contract is enforced by the browser
  // via contentEditable=false (pinned above) — jsdom has no native caret/arrow-key semantics to
  // exercise here. The whole-block-deletion half IS exercisable at the Lexical model level: a
  // selection that starts/ends in the neighboring paragraphs (never inside the UnknownNode)
  // must remove it entirely, with no partial edit to its children.
  describe("whole-block selection and deletion (§7)", () => {
    it("removes the UnknownNode entirely when a selection spanning both neighboring paragraphs is deleted", () => {
      let para1: ParaNode | null = null;
      let para2: ParaNode | null = null;
      let unknownKey = "";
      const { editor } = createBasicTestEnvironment([ParaNode, UnknownNode], () => {
        para1 = $createParaNode("p");
        const row = $createUnknownNode("row", "tr");
        const unknown = $createUnknownNode("table", undefined);
        para2 = $createParaNode("p");
        unknownKey = unknown.getKey();
        $getRoot().append(
          para1.append($createTextNode("before")),
          unknown.append(row.append($createTextNode("cell text"))),
          para2.append($createTextNode("after")),
        );
      });

      editor.update(
        () => {
          if (!para1 || !para2) throw new Error("Expected paragraph nodes to exist");
          const text1 = para1.getFirstChild();
          const text2 = para2.getFirstChild();
          if (!text1 || !text2) throw new Error("Expected paragraph text children to exist");

          const selection = $createRangeSelection();
          selection.anchor = $createPoint(text1.getKey(), text1.getTextContentSize(), "text");
          selection.focus = $createPoint(text2.getKey(), 0, "text");
          $setSelection(selection);

          const activeSelection = $getSelection();
          if (!$isRangeSelection(activeSelection)) throw new Error("Expected a range selection");
          activeSelection.removeText();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($getNodeByKey(unknownKey)).toBeNull();
        const children = $getRoot().getChildren();
        expect(children).toHaveLength(1);
        expect(children[0]?.getTextContent()).toBe("beforeafter");
      });
    });
  });
});
