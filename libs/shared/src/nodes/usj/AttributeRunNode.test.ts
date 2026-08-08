import {
  $createAttributeRunNode,
  $isAttributeRunNode,
  AttributeRunNode,
  isSerializedAttributeRunNode,
  SerializedAttributeRunNode,
} from "./AttributeRunNode.js";
import { $createParaNode, ParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createTextNode, $getRoot, $isElementNode, SerializedElementNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("AttributeRunNode", () => {
  describe("create/clone/serialize round-trip", () => {
    it("creates a node reporting the given runKind, and $isAttributeRunNode recognizes it", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("va");
        expect(node.getRunKind()).toBe("va");
        expect($isAttributeRunNode(node)).toBe(true);
      });
    });

    it("$isAttributeRunNode returns false for an unrelated node", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        expect($isAttributeRunNode($createTextNode("x"))).toBe(false);
        expect($isAttributeRunNode(null)).toBe(false);
        expect($isAttributeRunNode(undefined)).toBe(false);
      });
    });

    it("static getType() reports 'attribute-run'", () => {
      expect(AttributeRunNode.getType()).toBe("attribute-run");
    });

    it("clone() preserves runKind and key", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("vp");
        const cloned = AttributeRunNode.clone(node);
        expect(cloned.getRunKind()).toBe("vp");
        expect(cloned.getKey()).toBe(node.getKey());
      });
    });

    it("setRunKind() returns the same instance when the runKind is unchanged", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("milestone");
        expect(node.setRunKind("milestone")).toBe(node);
      });
    });

    it("exportJSON() returns the { type, runKind, version } shape", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("milestone");
        expect(node.exportJSON()).toMatchObject({
          type: "attribute-run",
          runKind: "milestone",
          version: 1,
        });
      });
    });

    it("round-trips a 'vp' wrapper through JSON export and re-import", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode, ParaNode], () => {
        $getRoot().append($createParaNode("p").append($createAttributeRunNode("vp")));
      });

      const serialized = editor.getEditorState().toJSON();
      const para = serialized.root.children[0] as SerializedElementNode;
      const serializedWrapper = para.children[0] as SerializedAttributeRunNode;
      expect(serializedWrapper).toMatchObject({
        type: "attribute-run",
        runKind: "vp",
        version: 1,
      });

      // Lexical assigns fresh node keys on JSON import (keys are ephemeral per editor instance,
      // never serialized), so the round-trip is verified by walking the reconstructed tree rather
      // than looking up the original node's key.
      const parsedState = editor.parseEditorState(serialized);
      parsedState.read(() => {
        const restoredPara = $getRoot().getFirstChild();
        const restored = $isElementNode(restoredPara) ? restoredPara.getFirstChild() : null;
        expect($isAttributeRunNode(restored)).toBe(true);
        if ($isAttributeRunNode(restored)) expect(restored.getRunKind()).toBe("vp");
      });
    });

    it("isSerializedAttributeRunNode recognizes its own serialized shape and rejects others", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("va");
        expect(isSerializedAttributeRunNode(node.exportJSON())).toBe(true);
      });
      expect(isSerializedAttributeRunNode({ type: "text", version: 1 })).toBe(false);
      expect(isSerializedAttributeRunNode(null)).toBe(false);
      expect(isSerializedAttributeRunNode(undefined)).toBe(false);
    });
  });

  describe("createDOM()", () => {
    it("adds only the 'attribute-run' class for a milestone run", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const element = $createAttributeRunNode("milestone").createDOM();
        expect(element.classList.contains("attribute-run")).toBe(true);
        expect(element.classList.contains("usfm_va")).toBe(false);
        expect(element.classList.contains("usfm_vp")).toBe(false);
      });
    });

    it("adds the 'attribute-run' and 'usfm_va' classes for a va run", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const element = $createAttributeRunNode("va").createDOM();
        expect(element.classList.contains("attribute-run")).toBe(true);
        expect(element.classList.contains("usfm_va")).toBe(true);
        expect(element.classList.contains("usfm_vp")).toBe(false);
      });
    });

    it("adds the 'attribute-run' and 'usfm_vp' classes for a vp run", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const element = $createAttributeRunNode("vp").createDOM();
        expect(element.classList.contains("attribute-run")).toBe(true);
        expect(element.classList.contains("usfm_vp")).toBe(true);
        expect(element.classList.contains("usfm_va")).toBe(false);
      });
    });
  });

  describe("updateDOM()", () => {
    it("syncs from 'va' to 'vp' in place and returns false", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const prev = $createAttributeRunNode("va");
        const dom = prev.createDOM();
        expect(dom.classList.contains("usfm_va")).toBe(true);

        const next = $createAttributeRunNode("vp");
        const needsReplace = next.updateDOM(prev, dom);

        expect(needsReplace).toBe(false);
        expect(dom.classList.contains("usfm_va")).toBe(false);
        expect(dom.classList.contains("usfm_vp")).toBe(true);
        expect(dom.classList.contains("attribute-run")).toBe(true);
      });
    });

    it("removes 'usfm_va' with no replacement class when a run becomes a milestone run", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const prev = $createAttributeRunNode("va");
        const dom = prev.createDOM();

        const next = $createAttributeRunNode("milestone");
        const needsReplace = next.updateDOM(prev, dom);

        expect(needsReplace).toBe(false);
        expect(dom.classList.contains("usfm_va")).toBe(false);
        expect(dom.classList.contains("usfm_vp")).toBe(false);
        expect(dom.classList.contains("attribute-run")).toBe(true);
      });
    });

    it("adds 'usfm_vp' when a milestone run becomes a vp run", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const prev = $createAttributeRunNode("milestone");
        const dom = prev.createDOM();

        const next = $createAttributeRunNode("vp");
        const needsReplace = next.updateDOM(prev, dom);

        expect(needsReplace).toBe(false);
        expect(dom.classList.contains("usfm_vp")).toBe(true);
      });
    });

    it("leaves classes untouched and still returns false when runKind is unchanged", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const prev = $createAttributeRunNode("va");
        const dom = prev.createDOM();

        const next = $createAttributeRunNode("va");
        const needsReplace = next.updateDOM(prev, dom);

        expect(needsReplace).toBe(false);
        expect(dom.classList.contains("usfm_va")).toBe(true);
        expect(Array.from(dom.classList).sort()).toEqual(["attribute-run", "usfm_va"]);
      });
    });
  });

  describe("exportDOM()", () => {
    it("returns a null element (the wrapper contributes no bytes of its own)", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        const node = $createAttributeRunNode("va");
        expect(node.exportDOM().element).toBeNull();
      });
    });
  });

  describe("Mutation overrides", () => {
    it("isInline() is true", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        expect($createAttributeRunNode("va").isInline()).toBe(true);
      });
    });

    it("canBeEmpty() is true (empty wrappers are transient husks removed elsewhere, not by Lexical's own normalization)", () => {
      const { editor } = createBasicTestEnvironment([AttributeRunNode]);
      editor.update(() => {
        expect($createAttributeRunNode("va").canBeEmpty()).toBe(true);
      });
    });
  });
});
