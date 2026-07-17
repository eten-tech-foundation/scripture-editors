import { $createImmutableTableCellNode, ImmutableTableCellNode } from "./ImmutableTableCellNode.js";
import {
  $createImmutableTableRowNode,
  $isImmutableTableRowNode,
  isSerializedImmutableTableRowNode,
  ImmutableTableRowNode,
} from "./ImmutableTableRowNode.js";
import { withEditor } from "./test.utils.js";
import { describe, expect, it } from "vitest";

describe("ImmutableTableRowNode", () => {
  it("has type 'immutable-table-row'", () => {
    expect(ImmutableTableRowNode.getType()).toBe("immutable-table-row");
  });

  it("renders a <tr> with structural and marker classes and holds cells", () => {
    withEditor([ImmutableTableRowNode, ImmutableTableCellNode], () => {
      const row = $createImmutableTableRowNode("tr");
      row.append($createImmutableTableCellNode("tc1", "start"));
      const dom = row.createDOM();
      expect(dom.tagName).toBe("TR");
      expect(dom.classList.contains("table-row")).toBe(true);
      expect(dom.classList.contains("usfm_tr")).toBe(true);
      expect(dom.getAttribute("data-marker")).toBe("tr");
      expect(row.getChildrenSize()).toBe(1);
    });
  });

  it("round-trips through JSON", () => {
    withEditor([ImmutableTableRowNode, ImmutableTableCellNode], () => {
      const json = $createImmutableTableRowNode("tr").exportJSON();
      expect(isSerializedImmutableTableRowNode(json)).toBe(true);
      expect(json).toMatchObject({ type: "immutable-table-row", marker: "tr" });
      const restored = ImmutableTableRowNode.importJSON(json);
      expect($isImmutableTableRowNode(restored)).toBe(true);
      expect(restored.getMarker()).toBe("tr");
    });
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor([ImmutableTableRowNode, ImmutableTableCellNode], () => {
      const node = $createImmutableTableRowNode("tr", { category: "watCat" });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = ImmutableTableRowNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });
});
