import {
  $appendVerseAttributeRun,
  requireDefined,
  testEnvironment,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, TextNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isAttributeRunNode,
  $isParaNode,
  $isVerseNode,
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
// The class lands on the WRAPPER (AttributeRunNode.createDOM), never the value directly: `color`
// and `font-size` are both inherited properties, so the wrapper's own class reaches the value by
// CSS cascade alone — classing the value directly as well would override that inheritance instead
// of adding to it (see MarkerEditPlugin.tsx's mutation-listener comment for the full reasoning).
describe("verse \\va/\\vp display values carry their marker's own stylesheet class (via the wrapper)", () => {
  it("adds usfm_va (in addition to .attribute-run) to the \\va wrapper, not the value directly", async () => {
    let verse: ReturnType<typeof $createVerseNode>;
    const { editor } = await testEnvironment(() => {
      verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
      const para = $createParaNode("p");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode("In the beginning"),
        ),
      );
      $appendVerseAttributeRun(verse, "va", "2");
    });
    editor.getEditorState().read(() => {
      const wrapper = verse.getNextSibling();
      if (!$isAttributeRunNode(wrapper)) throw new Error("\\va wrapper missing");
      const wrapperDom = editor.getElementByKey(wrapper.getKey());
      expect(wrapperDom?.classList.contains("attribute-run")).toBe(true);
      expect(wrapperDom?.classList.contains("usfm_va")).toBe(true);
      const value = wrapper.getChildAtIndex(1);
      if (!$isTextNode(value)) throw new Error("\\va value missing");
      const valueDom = editor.getElementByKey(value.getKey());
      expect(valueDom?.classList.contains("attribute")).toBe(false);
      expect(valueDom?.classList.contains("usfm_va")).toBe(false);
    });
  });

  it("adds usfm_vp (in addition to .attribute-run) to the \\vp wrapper, not the value directly", async () => {
    let verse: ReturnType<typeof $createVerseNode>;
    const { editor } = await testEnvironment(() => {
      verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, undefined, "1b");
      const para = $createParaNode("p");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode("In the beginning"),
        ),
      );
      $appendVerseAttributeRun(verse, "vp", "1b");
    });
    editor.getEditorState().read(() => {
      const wrapper = verse.getNextSibling();
      if (!$isAttributeRunNode(wrapper)) throw new Error("\\vp wrapper missing");
      const wrapperDom = editor.getElementByKey(wrapper.getKey());
      expect(wrapperDom?.classList.contains("attribute-run")).toBe(true);
      expect(wrapperDom?.classList.contains("usfm_vp")).toBe(true);
      const value = wrapper.getChildAtIndex(1);
      if (!$isTextNode(value)) throw new Error("\\vp value missing");
      const valueDom = editor.getElementByKey(value.getKey());
      expect(valueDom?.classList.contains("attribute")).toBe(false);
      expect(valueDom?.classList.contains("usfm_vp")).toBe(false);
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

  it("still resolves to the wrapper's class when the run is built directly via the wrapped-shape helper (not just auto-healed from bare)", async () => {
    // Same guarantee as the two tests above, exercised against a run built the OTHER way a wrapped
    // triplet reaches this listener: constructed already-wrapped ($appendVerseAttributeRun, the
    // adaptor's own output shape) rather than healed forward from a bare verse at mount.
    const { editor } = await testEnvironment(() => {
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", "1b");
      const para = $createParaNode("p");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode("In the beginning"),
        ),
      );
      $appendVerseAttributeRun(verse, "va", "2");
      $appendVerseAttributeRun(verse, "vp", "1b");
    });

    editor.getEditorState().read(() => {
      const verse = requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
      const vaWrapper = verse.getNextSibling();
      if (!$isAttributeRunNode(vaWrapper)) throw new Error("\\va wrapper missing");
      const vaValue = vaWrapper.getChildAtIndex(1);
      if (!$isTextNode(vaValue)) throw new Error("\\va value missing");
      const vpWrapper = vaWrapper.getNextSibling();
      if (!$isAttributeRunNode(vpWrapper)) throw new Error("\\vp wrapper missing");
      const vpValue = vpWrapper.getChildAtIndex(1);
      if (!$isTextNode(vpValue)) throw new Error("\\vp value missing");

      // The wrapper itself carries the classes (via createDOM, not this listener).
      const vaWrapperDom = editor.getElementByKey(vaWrapper.getKey());
      expect(vaWrapperDom?.classList.contains("attribute-run")).toBe(true);
      expect(vaWrapperDom?.classList.contains("usfm_va")).toBe(true);
      const vpWrapperDom = editor.getElementByKey(vpWrapper.getKey());
      expect(vpWrapperDom?.classList.contains("attribute-run")).toBe(true);
      expect(vpWrapperDom?.classList.contains("usfm_vp")).toBe(true);

      // The value INSIDE each wrapper gets NEITHER class directly from the listener — it relies
      // entirely on inheriting the wrapper's own styling.
      const vaValueDom = editor.getElementByKey(vaValue.getKey());
      expect(vaValueDom?.classList.contains("attribute")).toBe(false);
      expect(vaValueDom?.classList.contains("usfm_va")).toBe(false);
      const vpValueDom = editor.getElementByKey(vpValue.getKey());
      expect(vpValueDom?.classList.contains("attribute")).toBe(false);
      expect(vpValueDom?.classList.contains("usfm_vp")).toBe(false);
    });
  });

  it("does not tint a STANDALONE \\va char span's own attribute run (opener-adjacent, but inside a CharNode)", async () => {
    // The hard case for the adjacency check: a standalone `\va |lemma="test"\va*` char span (the
    // shape a \va that failed to fold onto a verse degrades to) with NO content text puts its own
    // attribute run DIRECTLY after its own opening `\va` glyph — the exact sibling shape a folded
    // verse triplet's value has. The two differ structurally in the PARENT: a verse triplet's
    // value rides in the PARAGRAPH (a VerseNode is a TextNode, so its run is a following
    // sibling), while a char span's own run lives INSIDE the CharNode. That run is `|…` attribute
    // bytes, not an altnumber value — it must keep plain `.attribute` dim styling only (the SPAN
    // already carries usfm_va from CharNode.createDOM; the run must not double-apply it).
    let value: TextNode;
    const { editor } = await testEnvironment(() => {
      const va = $createCharNode("va");
      value = $createTextNode('|lemma="test"');
      $setState(value, textTypeState, "attribute");
      va.append($createMarkerNode("va", "opening"), value, $createMarkerNode("va", "closing"));
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), va));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(value.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
      expect(dom?.classList.contains("usfm_va")).toBe(false);
    });
  });
});
