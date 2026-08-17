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

  it("zeroes its first-line indent inline, where no stylesheet rule can be outranked", () => {
    // A `\tr`'s hanging indent belongs to a block of text, not to a table: left in place it drags
    // the row's own marker glyph — which the browser wraps in an anonymous, unstyleable cell —
    // clear outside the table. Inline because a project StyleInfo's own `.usfm_tr` rule outranks
    // any static selector; Paratext 9 stamps the same inline style on every `<tr>` it emits.
    withEditor([ImmutableTableRowNode, ImmutableTableCellNode], () => {
      // Read back as "0px": the CSSOM normalizes a bare zero length to its canonical unit form.
      expect($createImmutableTableRowNode("tr").createDOM().style.textIndent).toBe("0px");
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
