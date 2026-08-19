import { $createImmutableTableCellNode, ImmutableTableCellNode } from "./ImmutableTableCellNode.js";
import { $createImmutableTableNode, ImmutableTableNode } from "./ImmutableTableNode.js";
import {
  $createImmutableTableRowNode,
  $isImmutableTableRowNode,
  isSerializedImmutableTableRowNode,
  ImmutableTableRowNode,
} from "./ImmutableTableRowNode.js";
import { $createMarkerNode, MarkerNode } from "../features/MarkerNode.js";
import { NBSP } from "./node-constants.js";
import { withEditor } from "./test.utils.js";
import { $createTextNode, $getRoot } from "lexical";
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

  // Regression: the row declared `isShadowRoot(): true` from the day tables landed, when its only
  // children were cells. It later gained its own `\tr ` glyph and separator as DIRECT children,
  // and Lexical requires the children of a root or shadow root to be elements or decorators — so
  // `getTopLevelElement()` from the glyph stopped on a `MarkerNode` (a `TextNode`) and threw
  // "Children of root nodes must be elements or decorators". This is the same defect the cell
  // already carries a post-mortem for, arrived at from the other side: the cell was a shadow root
  // holding text, the row became a shadow root that grew text.
  it("is not a shadow root: getTopLevelElement from its own glyph returns the row", () => {
    withEditor(
      [ImmutableTableNode, ImmutableTableRowNode, ImmutableTableCellNode, MarkerNode],
      () => {
        const glyph = $createMarkerNode("tr");
        const separator = $createTextNode(NBSP);
        const row = $createImmutableTableRowNode("tr");
        $getRoot().append(
          $createImmutableTableNode().append(
            row.append(glyph, separator, $createImmutableTableCellNode("tc1")),
          ),
        );

        expect(row.isShadowRoot()).toBe(false);
        // The walk stops at the first node whose PARENT is a root or shadow root. With the table
        // as the only boundary inside the document, that is the ROW — an element, so the assert
        // holds — for the glyph, its separator and the cells alike.
        expect(() => glyph.getTopLevelElement()).not.toThrow();
        expect(glyph.getTopLevelElement()?.getKey()).toBe(row.getKey());
        expect(() => separator.getTopLevelElement()).not.toThrow();
        expect(separator.getTopLevelElement()?.getKey()).toBe(row.getKey());
      },
    );
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
