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
  $isTextNode,
  $setSelection,
} from "lexical";

describe("UnknownNode", () => {
  // Regression pin: opaque unknown blocks must render as a subdued read-only
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

    // `\optbreak` (USJ type "optbreak") becomes an
    // UnknownNode with tag "optbreak" (packages/utilities/src/converters/usj/
    // converter-test.data.ts:2571, and the "optional line break (optbreak)" corpus
    // fixture). PT9 renders it as a literal `//` mid-sentence, so — unlike table/figure/
    // sidebar/periph — it must render inline, not as a block box breaking the paragraph.
    it("adds the 'unknown-inline' class instead of 'unknown-block' for the optbreak construct", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("optbreak", undefined);
        const element = node.createDOM();

        expect(element.classList.contains("unknown-inline")).toBe(true);
        expect(element.classList.contains("unknown-block")).toBe(false);
      });
    });

    // The `\ref` inline rationale — a line-level box in the middle of a sentence would be visibly
    // wrong — governs over the literal block-level default. The "cross-reference ref target"
    // corpus fixture nests <ref> INSIDE a paragraph's
    // running text (converter-test.data.ts:2581 shows it becoming UnknownNode tag "ref"), the
    // same mid-sentence placement as optbreak — so ref gets the inline class too. Unlike
    // optbreak it carries real child text, so it must NOT get the optbreak-only `//` label
    // (pinned by the data-tag test below — the label selector keys off [data-tag="optbreak"]).
    it("adds the 'unknown-inline' class instead of 'unknown-block' for the ref construct", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const node = $createUnknownNode("ref", undefined);
        const element = node.createDOM();

        expect(element.classList.contains("unknown-inline")).toBe(true);
        expect(element.classList.contains("unknown-block")).toBe(false);
      });
    });

    // The `//` label is optbreak-specific: usj-nodes.css keys it off [data-tag="optbreak"], so
    // the ::before rule can never match a ref (or any other construct). jsdom doesn't render
    // pseudo-elements, so the DOM-level contract pinned here is the discriminator attribute the
    // CSS selector depends on. data-tag is also the attribute importDOM's $convertUnknownElement
    // reads, so emitting it keeps createDOM symmetric with the conversion map.
    it("stamps data-tag with the construct tag so CSS can key the optbreak-only label off it", () => {
      const { editor } = createBasicTestEnvironment([UnknownNode]);
      editor.update(() => {
        const optbreakElement = $createUnknownNode("optbreak", undefined).createDOM();
        const refElement = $createUnknownNode("ref", undefined).createDOM();
        const tableElement = $createUnknownNode("table", undefined).createDOM();

        expect(optbreakElement.getAttribute("data-tag")).toBe("optbreak");
        expect(refElement.getAttribute("data-tag")).toBe("ref");
        expect(tableElement.getAttribute("data-tag")).toBe("table");
      });
    });

    // Pins the browser-primitive half of the opaque-block caret contract; true caret-navigation
    // skipping is browser-level behavior and is covered by in-app QA.
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

  // Inline ref content: a ref's child text is real visible content — the
  // reconciler must keep it in the mounted editor DOM under the unknown-inline element (CSS
  // reveals it inline in standard view; the optbreak-only `//` label rule cannot match it).
  describe("inline ref content", () => {
    it("keeps a ref construct's child text in the mounted editor DOM", () => {
      let refKey = "";
      const { editor } = createBasicTestEnvironment([ParaNode, UnknownNode], () => {
        const ref = $createUnknownNode("ref", undefined);
        refKey = ref.getKey();
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("See "),
            ref.append($createTextNode("Mk 9.50")),
            $createTextNode(" for details."),
          ),
        );
      });

      const element = editor.getElementByKey(refKey);
      expect(element).toBeInstanceOf(HTMLElement);
      if (!(element instanceof HTMLElement)) throw new Error("Expected DOM element for ref node");
      expect(element.classList.contains("unknown-inline")).toBe(true);
      expect(element.getAttribute("data-tag")).toBe("ref");
      expect(element.textContent).toBe("Mk 9.50");
    });
  });

  // The opaque-block contract: "whole-block selection/deletion only... caret navigation skips over
  // it like any decorator node." The skip-over-caret half of that contract is enforced by the
  // browser via contentEditable=false (pinned above) — jsdom has no native caret/arrow-key
  // semantics to exercise here. The whole-block-deletion half IS exercisable at the Lexical model
  // level: a selection that starts/ends in the neighboring paragraphs (never inside the
  // UnknownNode) must remove it entirely, with no partial edit to its children.
  describe("whole-block selection and deletion", () => {
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

  // The other half of the opaque-block typing contract, model-level: with the caret collapsed at
  // the boundaries adjacent to the opaque block (end of the preceding paragraph, start of the
  // following one), inserted text lands in the neighboring paragraphs, Lexical's selection
  // normalization never yields an anchor inside the UnknownNode, and the opaque subtree's
  // serialized bytes are untouched. (jsdom has no native caret, so this is the executable
  // formulation; the browser-level caret half is contentEditable=false, pinned above.)
  describe("caret-adjacent typing", () => {
    it("inserts text into the neighboring paragraphs and leaves the UnknownNode byte-unchanged", () => {
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
      // Byte-level pin of the whole opaque subtree (children included): the UnknownNode is
      // root.children[1] in the serialized editor state and must stay there, byte-identical.
      const serializedUnknown = JSON.stringify(editor.getEditorState().toJSON().root.children[1]);

      const $expectAnchorOutsideUnknown = () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("Expected a range selection");
        const anchorNode = selection.anchor.getNode();
        expect(anchorNode.getKey()).not.toBe(unknownKey);
        expect(anchorNode.getParents().some((parent) => parent.getKey() === unknownKey)).toBe(
          false,
        );
      };

      // (a) caret collapsed at the END of the preceding paragraph.
      editor.update(
        () => {
          if (!para1) throw new Error("Expected paragraph node to exist");
          const text1 = para1.getFirstChild();
          if (!$isTextNode(text1)) throw new Error("Expected a text child");
          text1.select(text1.getTextContentSize(), text1.getTextContentSize());
          $expectAnchorOutsideUnknown();

          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("Expected a range selection");
          selection.insertText("X");
          $expectAnchorOutsideUnknown();
        },
        { discrete: true },
      );

      // (b) caret collapsed at the START of the following paragraph.
      editor.update(
        () => {
          if (!para2) throw new Error("Expected paragraph node to exist");
          const text2 = para2.getFirstChild();
          if (!$isTextNode(text2)) throw new Error("Expected a text child");
          text2.select(0, 0);
          $expectAnchorOutsideUnknown();

          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("Expected a range selection");
          selection.insertText("Y");
          $expectAnchorOutsideUnknown();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        if (!para1 || !para2) throw new Error("Expected paragraph nodes to exist");
        expect(para1.getTextContent()).toBe("beforeX");
        expect(para2.getTextContent()).toBe("Yafter");
      });
      expect(JSON.stringify(editor.getEditorState().toJSON().root.children[1])).toBe(
        serializedUnknown,
      );
    });
  });
});
