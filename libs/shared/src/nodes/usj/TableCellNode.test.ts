import {
  $createTableCellNode,
  $isTableCellNode,
  TABLE_CELL_TYPE,
  isSerializedTableCellNode,
  TableCellNode,
} from "./TableCellNode.js";
import { withEditor } from "./test.utils.js";
import { $getNodeByKey, $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";

describe("TableCellNode", () => {
  it("has type 'table:cell'", () => {
    expect(TableCellNode.getType()).toBe("table:cell");
  });

  it("renders a <td> with structural and marker classes for a tc marker", () => {
    withEditor([TableCellNode], () => {
      const node = $createTableCellNode("tc1", "start");
      const dom = node.createDOM();
      expect(dom.tagName).toBe("TD");
      expect(dom.getAttribute("data-marker")).toBe("tc1");
      expect(dom.classList.contains("table-cell")).toBe(true);
      expect(dom.classList.contains("usfm_tc1")).toBe(true);
      expect(dom.style.textAlign).toBe("start");
    });
  });

  it("renders a <th> for a th marker, keeps align logical (end), with colspan", () => {
    withEditor([TableCellNode], () => {
      const node = $createTableCellNode("thr5", "end", "2");
      const dom = node.createDOM();
      expect(dom.tagName).toBe("TH");
      expect(dom.style.textAlign).toBe("end");
      expect(dom.getAttribute("colspan")).toBe("2");
    });
  });

  it("uses logical text-align (start/end, not left/right) so cells mirror under RTL", () => {
    withEditor([TableCellNode], () => {
      // Physical left/right would break RTL scripts; the logical values flip with `dir`.
      expect($createTableCellNode("tc1", "start").createDOM().style.textAlign).toBe("start");
      expect($createTableCellNode("tcr1", "end").createDOM().style.textAlign).toBe("end");
      // An unrecognized align value is ignored rather than written to the style.
      expect($createTableCellNode("tc1", "left").createDOM().style.textAlign).toBe("");
    });
  });

  it("round-trips through JSON", () => {
    withEditor([TableCellNode], () => {
      const node = $createTableCellNode("thc3", "center", "2");
      const json = node.exportJSON();
      expect(isSerializedTableCellNode(json)).toBe(true);
      expect(json).toMatchObject({
        type: "table:cell",
        marker: "thc3",
        align: "center",
        colspan: "2",
      });
      const restored = TableCellNode.importJSON(json);
      expect($isTableCellNode(restored)).toBe(true);
      expect(restored.getMarker()).toBe("thc3");
      expect(restored.getAlign()).toBe("center");
      expect(restored.getColspan()).toBe("2");
    });
  });

  it("TABLE_CELL_TYPE constant equals 'table:cell'", () => {
    expect(TABLE_CELL_TYPE).toBe("table:cell");
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor([TableCellNode], () => {
      const node = $createTableCellNode("tc1", undefined, undefined, { category: "watCat" });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = TableCellNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });

  it("updateDOM recreates DOM when align changes (setAlign reflected in live element)", () => {
    const editor = createEditor({
      nodes: [TableCellNode],
      onError: (e) => {
        throw e;
      },
    });
    const container = document.createElement("div");
    editor.setRootElement(container);

    let nodeKey = "";

    editor.update(
      () => {
        const node = $createTableCellNode("tc1");
        $getRoot().append(node);
        nodeKey = node.getKey();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const node = $getNodeByKey<TableCellNode>(nodeKey);
        if (!node) throw new Error("Expected TableCellNode to exist");
        node.setAlign("end");
      },
      { discrete: true },
    );

    const dom = editor.getElementByKey(nodeKey) as HTMLElement;
    expect(dom.style.textAlign).toBe("end");
  });
});
