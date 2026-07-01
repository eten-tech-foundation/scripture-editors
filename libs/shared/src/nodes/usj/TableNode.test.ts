import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import { $createTableRowNode, TableRowNode } from "./TableRowNode.js";
import { $createTableNode, $isTableNode, isSerializedTableNode, TableNode } from "./TableNode.js";

function withEditor(fn: () => void) {
  const editor = createEditor({
    nodes: [TableNode, TableRowNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("TableNode", () => {
  it("has type 'table'", () => {
    expect(TableNode.getType()).toBe("table");
  });

  it("renders a <table> with a structural class and holds rows", () => {
    withEditor(() => {
      const table = $createTableNode();
      table.append($createTableRowNode("tr"));
      const dom = table.createDOM();
      expect(dom.tagName).toBe("TABLE");
      expect(dom.classList.contains("table")).toBe(true);
      expect(table.getChildrenSize()).toBe(1);
    });
  });

  it("round-trips through JSON", () => {
    withEditor(() => {
      const json = $createTableNode().exportJSON();
      expect(isSerializedTableNode(json)).toBe(true);
      expect(json).toMatchObject({ type: "table" });
      expect($isTableNode(TableNode.importJSON(json))).toBe(true);
    });
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor(() => {
      const node = $createTableNode({ category: "watCat" });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = TableNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });
});
