import {
  $createImmutableTableCellNode,
  $isImmutableTableCellNode,
  TABLE_CELL_TYPE,
  isSerializedImmutableTableCellNode,
  ImmutableTableCellNode,
} from "./ImmutableTableCellNode.js";
import { withEditor } from "./test.utils.js";
import { $getNodeByKey, $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";

describe("ImmutableTableCellNode", () => {
  it("has type 'immutable-table-cell'", () => {
    expect(ImmutableTableCellNode.getType()).toBe("immutable-table-cell");
  });

  it("renders a <td> with structural and marker classes for a tc marker", () => {
    withEditor([ImmutableTableCellNode], () => {
      const node = $createImmutableTableCellNode("tc1", "start");
      const dom = node.createDOM();
      expect(dom.tagName).toBe("TD");
      expect(dom.getAttribute("data-marker")).toBe("tc1");
      expect(dom.classList.contains("table-cell")).toBe(true);
      expect(dom.classList.contains("usfm_tc1")).toBe(true);
      expect(dom.style.textAlign).toBe("start");
    });
  });

  it("renders a <th> for a th marker, keeps align logical (end), with colspan", () => {
    withEditor([ImmutableTableCellNode], () => {
      const node = $createImmutableTableCellNode("thr5", "end", "2");
      const dom = node.createDOM();
      expect(dom.tagName).toBe("TH");
      expect(dom.style.textAlign).toBe("end");
      expect(dom.getAttribute("colspan")).toBe("2");
    });
  });

  it("uses logical text-align (start/end, not left/right) so cells mirror under RTL", () => {
    withEditor([ImmutableTableCellNode], () => {
      // Physical left/right would break RTL scripts; the logical values flip with `dir`.
      expect($createImmutableTableCellNode("tc1", "start").createDOM().style.textAlign).toBe(
        "start",
      );
      expect($createImmutableTableCellNode("tcr1", "end").createDOM().style.textAlign).toBe("end");
      // An unrecognized align value is ignored rather than written to the style.
      expect($createImmutableTableCellNode("tc1", "left").createDOM().style.textAlign).toBe("");
    });
  });

  it("round-trips through JSON", () => {
    withEditor([ImmutableTableCellNode], () => {
      const node = $createImmutableTableCellNode("thc3", "center", "2");
      const json = node.exportJSON();
      expect(isSerializedImmutableTableCellNode(json)).toBe(true);
      expect(json).toMatchObject({
        type: "immutable-table-cell",
        marker: "thc3",
        align: "center",
        colspan: "2",
      });
      const restored = ImmutableTableCellNode.importJSON(json);
      expect($isImmutableTableCellNode(restored)).toBe(true);
      expect(restored.getMarker()).toBe("thc3");
      expect(restored.getAlign()).toBe("center");
      expect(restored.getColspan()).toBe("2");
    });
  });

  it("TABLE_CELL_TYPE constant equals the USJ marker type 'table:cell'", () => {
    expect(TABLE_CELL_TYPE).toBe("table:cell");
  });

  it("round-trips unknownAttributes through JSON", () => {
    withEditor([ImmutableTableCellNode], () => {
      const node = $createImmutableTableCellNode("tc1", undefined, undefined, {
        category: "watCat",
      });
      const json = node.exportJSON();
      expect(json).toMatchObject({ unknownAttributes: { category: "watCat" } });
      const restored = ImmutableTableCellNode.importJSON(json);
      expect(restored.getUnknownAttributes()).toEqual({ category: "watCat" });
    });
  });

  it("updateDOM recreates DOM when align changes (setAlign reflected in live element)", () => {
    const editor = createEditor({
      nodes: [ImmutableTableCellNode],
      onError: (e) => {
        throw e;
      },
    });
    const container = document.createElement("div");
    editor.setRootElement(container);

    let nodeKey = "";

    editor.update(
      () => {
        const node = $createImmutableTableCellNode("tc1");
        $getRoot().append(node);
        nodeKey = node.getKey();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const node = $getNodeByKey<ImmutableTableCellNode>(nodeKey);
        if (!node) throw new Error("Expected ImmutableTableCellNode to exist");
        node.setAlign("end");
      },
      { discrete: true },
    );

    const dom = editor.getElementByKey(nodeKey) as HTMLElement;
    expect(dom.style.textAlign).toBe("end");
  });
});
