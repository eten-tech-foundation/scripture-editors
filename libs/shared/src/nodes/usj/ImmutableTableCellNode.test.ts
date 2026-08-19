import {
  $createImmutableTableCellNode,
  $isImmutableTableCellNode,
  TABLE_CELL_TYPE,
  isSerializedImmutableTableCellNode,
  ImmutableTableCellNode,
} from "./ImmutableTableCellNode.js";
import { $createImmutableTableNode, ImmutableTableNode } from "./ImmutableTableNode.js";
import { $createImmutableTableRowNode, ImmutableTableRowNode } from "./ImmutableTableRowNode.js";
import { createBasicTestEnvironment, withEditor } from "./test.utils.js";
import { $createTextNode, $getNodeByKey, $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

describe("ImmutableTableCellNode", () => {
  it("has type 'immutable-table-cell'", () => {
    expect(ImmutableTableCellNode.getType()).toBe("immutable-table-cell");
  });

  // Regression: the cell used to declare `isShadowRoot(): true`. Lexical requires the children of
  // a root or shadow root to be elements or decorators, and a cell's children are its CONTENT
  // (plain TextNodes) — so `getTopLevelElement()` from any text in a cell stopped on that TextNode
  // and threw "Children of root nodes must be elements or decorators". In the app that fired on
  // every click in a table (via ScriptureReferencePlugin's selection listener -> $resolvePosition
  // -> $findThisChapter) and blanked the whole editor when a chapter navigation ran the same walk
  // inside editor.update(). The row above it has since dropped its own shadow-root claim for the
  // identical reason (it grew a `\tr ` glyph of its own), so the TABLE is now the only boundary
  // inside the document and the walk resolves table content to the ROW.
  it("is not a shadow root: getTopLevelElement from text inside a cell returns the row", () => {
    withEditor([ImmutableTableNode, ImmutableTableRowNode, ImmutableTableCellNode], () => {
      const cell = $createImmutableTableCellNode("tc1");
      const text = $createTextNode("cell text");
      cell.append(text);
      const row = $createImmutableTableRowNode("tr");
      row.append(cell);
      const table = $createImmutableTableNode();
      table.append(row);
      $getRoot().append(table);

      expect(cell.isShadowRoot()).toBe(false);
      // The walk stops at the first node whose PARENT is a root or shadow root — the table is the
      // only one of those here, so it stops on the row. The load-bearing half is that it must never
      // stop on the TextNode itself, which is what throws; which ELEMENT it lands on is incidental.
      expect(() => text.getTopLevelElement()).not.toThrow();
      expect(text.getTopLevelElement()?.getKey()).toBe(row.getKey());
    });
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
    const { editor } = createBasicTestEnvironment([ImmutableTableCellNode]);

    let nodeKey = "";

    // First update creates the node (triggers createDOM).
    editor.update(
      () => {
        const node = $createImmutableTableCellNode("tc1");
        $getRoot().append(node);
        nodeKey = node.getKey();
      },
      { discrete: true },
    );

    // Second update mutates the node to trigger updateDOM — must be separate from the first.
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
