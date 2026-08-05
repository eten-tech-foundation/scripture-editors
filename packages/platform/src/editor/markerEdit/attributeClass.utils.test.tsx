import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $setState, TextNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
} from "shared";

describe("attribute text styling in editable mode", () => {
  it("adds the .attribute class to attribute text nodes on initial mount", async () => {
    let attrText: TextNode;
    const { editor } = await testEnvironment(() => {
      attrText = $createTextNode(`${NBSP}|sid="ts.GEN.1"`);
      $setState(attrText, textTypeState, "attribute");
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), attrText));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(attrText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
    });
  });

  it("adds the .attribute class when a node becomes dirty after mount", async () => {
    let attrText: TextNode;
    const { editor } = await testEnvironment(() => {
      // Start WITHOUT the attribute textType so the class is ABSENT at mount — otherwise this test is
      // indistinguishable from the initial-mount test above and would pass even if the dirty-time
      // re-decoration path were a no-op. The trailing-space node carries its own textType so Lexical's
      // adjacent simple-TextNode normalization doesn't merge attrText into it (see the
      // "leaves non-attribute" test), which would invalidate the captured `attrText` key.
      const spaceNode = $createTextNode(NBSP);
      $setState(spaceNode, textTypeState, "marker-trailing-space");
      attrText = $createTextNode(`${NBSP}|sid="ts.GEN.1"`);
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), spaceNode, attrText));
    });
    // Precondition: the class is absent until the node is dirtied with the attribute textType.
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(attrText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(false);
    });
    await act(async () => editor.update(() => $setState(attrText, textTypeState, "attribute")));
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(attrText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
    });
  });

  it("leaves non-attribute text nodes undecorated", async () => {
    let plainText: TextNode;
    const { editor } = await testEnvironment(() => {
      // The trailing-space node needs its own textType, or Lexical's adjacent simple-TextNode
      // normalization silently merges it into plainText on the first commit (see
      // whitespaceDisplay.plugin.utils.test.tsx's $appendMarkerAndText), invalidating the
      // `plainText` reference captured below.
      const spaceNode = $createTextNode(NBSP);
      $setState(spaceNode, textTypeState, "marker-trailing-space");
      plainText = $createTextNode("In the beginning");
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), spaceNode, plainText));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(plainText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(false);
    });
  });
});

// A verse's `\va`/`\vp` display triplet (attributeDisplay.utils.ts) is the ONLY folded attribute-
// marker display surface that exists today (chapters never display `\ca`/`\cp`; `\cat` lives
// inside an atomic, unexpanded note). PT9 renders `\va 2\va*` as a va-styled char span — the VALUE
// in va's green-superscript stylesheet look, the glyphs in the ordinary marker-gray — so the
// folded run must carry the same `usfm_va`/`usfm_vp` class a STANDALONE `\va`/`\vp` char span gets
// from CharNode.createDOM (see CharNode.test.ts's "preserves data-marker and usfm_* class" pin for
// the standalone side), not just the generic `.attribute` dim styling every attribute run gets.
describe("verse \\va/\\vp display values carry their marker's own stylesheet class", () => {
  it("adds usfm_va (in addition to .attribute) to a \\va display value", async () => {
    let value: TextNode;
    const { editor } = await testEnvironment(() => {
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
      value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      const para = $createParaNode("p");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("va"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(value.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
      expect(dom?.classList.contains("usfm_va")).toBe(true);
    });
  });

  it("adds usfm_vp (in addition to .attribute) to a \\vp display value", async () => {
    let value: TextNode;
    const { editor } = await testEnvironment(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        undefined,
        "1b",
      );
      value = $createTextNode(`${NBSP}1b`);
      $setState(value, textTypeState, "attribute");
      const para = $createParaNode("p");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("vp"),
          value,
          $createMarkerNode("vp", "closing"),
          $createTextNode("In the beginning"),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(value.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
      expect(dom?.classList.contains("usfm_vp")).toBe(true);
    });
  });

  it("does not add a usfm_* class to a char span's OWN attribute run (not adjacent to a va/vp opener)", async () => {
    // Regression guard: a char span's attribute run (e.g. \w's lemma) sits directly before its
    // OWN closing glyph, never after an opening va/vp glyph — the adjacency check this mechanism
    // relies on must not misfire and tint an unrelated attribute run.
    let value: TextNode;
    const { editor } = await testEnvironment(() => {
      const w = $createCharNode("w");
      value = $createTextNode("|y");
      $setState(value, textTypeState, "attribute");
      // A real opening glyph is required, or $charNodeDeletionTransform reads its absence as
      // "opener deleted" and unwraps the span (markerEditDeletion.utils.ts).
      w.append(
        $createMarkerNode("w", "opening"),
        $createTextNode("x"),
        value,
        $createMarkerNode("w", "closing"),
      );
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), w));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(value.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
      expect(dom?.classList.contains("usfm_va")).toBe(false);
      expect(dom?.classList.contains("usfm_vp")).toBe(false);
      expect(dom?.classList.contains("usfm_w")).toBe(false);
    });
  });
});
