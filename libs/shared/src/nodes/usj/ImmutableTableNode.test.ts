import { $createImmutableTableRowNode, ImmutableTableRowNode } from "./ImmutableTableRowNode.js";
import {
  $createImmutableTableNode,
  $isImmutableTableNode,
  isSerializedImmutableTableNode,
  ImmutableTableNode,
} from "./ImmutableTableNode.js";
import { withEditor } from "./test.utils.js";
import { describe, expect, it } from "vitest";

describe("ImmutableTableNode", () => {
  it("has type 'immutable-table'", () => {
    expect(ImmutableTableNode.getType()).toBe("immutable-table");
  });

  it("renders a <table> with a structural class and holds rows", () => {
    withEditor([ImmutableTableNode, ImmutableTableRowNode], () => {
      const table = $createImmutableTableNode();
      table.append($createImmutableTableRowNode("tr"));
      const dom = table.createDOM();
      expect(dom.tagName).toBe("TABLE");
      expect(dom.classList.contains("table")).toBe(true);
      expect(table.getChildrenSize()).toBe(1);
    });
  });

  it("round-trips through JSON", () => {
    withEditor([ImmutableTableNode, ImmutableTableRowNode], () => {
      const json = $createImmutableTableNode().exportJSON();
      expect(isSerializedImmutableTableNode(json)).toBe(true);
      expect(json).toMatchObject({ type: "immutable-table" });
      expect($isImmutableTableNode(ImmutableTableNode.importJSON(json))).toBe(true);
    });
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor([ImmutableTableNode, ImmutableTableRowNode], () => {
      const node = $createImmutableTableNode({ category: "watCat" });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = ImmutableTableNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });
});
