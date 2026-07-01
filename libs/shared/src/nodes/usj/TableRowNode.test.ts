import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import { $createTableCellNode, TableCellNode } from "./TableCellNode.js";
import {
  $createTableRowNode,
  $isTableRowNode,
  isSerializedTableRowNode,
  TableRowNode,
} from "./TableRowNode.js";

function withEditor(fn: () => void) {
  const editor = createEditor({
    nodes: [TableRowNode, TableCellNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("TableRowNode", () => {
  it("has type 'table:row'", () => {
    expect(TableRowNode.getType()).toBe("table:row");
  });

  it("renders a <tr> with structural and marker classes and holds cells", () => {
    withEditor(() => {
      const row = $createTableRowNode("tr");
      row.append($createTableCellNode("tc1", "start"));
      const dom = row.createDOM();
      expect(dom.tagName).toBe("TR");
      expect(dom.classList.contains("table-row")).toBe(true);
      expect(dom.classList.contains("usfm_tr")).toBe(true);
      expect(dom.getAttribute("data-marker")).toBe("tr");
      expect(row.getChildrenSize()).toBe(1);
    });
  });

  it("round-trips through JSON", () => {
    withEditor(() => {
      const json = $createTableRowNode("tr").exportJSON();
      expect(isSerializedTableRowNode(json)).toBe(true);
      expect(json).toMatchObject({ type: "table:row", marker: "tr" });
      const restored = TableRowNode.importJSON(json);
      expect($isTableRowNode(restored)).toBe(true);
      expect(restored.getMarker()).toBe("tr");
    });
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor(() => {
      const node = $createTableRowNode("tr", { category: "watCat" });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = TableRowNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });
});
