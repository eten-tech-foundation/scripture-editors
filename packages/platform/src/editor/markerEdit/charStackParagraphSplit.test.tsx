/**
 * Enter inside character-styled text: the paragraph splits BETWEEN the styles, not through them.
 *
 * Lexical's generic inline split builds a continuation span with no glyphs at all, which the
 * marker-edit engine then reads as deletion damage and unwraps — the tail comes out unformatted
 * with its closing markers gone. Splitting through the shared close-and-reopen instead re-wraps the
 * tail in the same markers with the same nesting. Paratext 9 drops character styles across a
 * paragraph split; this is a deliberate divergence from it.
 */

import {
  requireDefined,
  testEnvironment,
  testEnvironmentWithDisplaySyncs,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";

/**
 * The USFM bytes `node`'s subtree stands for: every text node in document order (glyph nodes
 * included) with the structural NBSP separators rendered as the plain spaces they serialize to.
 */
function $usfmBytes(node: ElementNode): string {
  return node
    .getAllTextNodes()
    .map((textNode) => textNode.getTextContent())
    .join("")
    .replaceAll(NBSP, " ");
}

function $paras(): ParaNode[] {
  return $getRoot().getChildren().filter($isParaNode);
}

async function pressEnter(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, null);
  });
}

/** `\p \nd thing\nd*` — one paragraph holding a single character-styled run. */
function $appendCharPara(): TextNode {
  const para = $createParaNode("p");
  const nd = $createCharNode("nd");
  const content = $createTextNode(`${NBSP}thing`);
  $getRoot().append(
    para.append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      nd.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
    ),
  );
  return content;
}

/** `\p \wj \+nd thing\+nd*\wj*` — a two-deep character-style stack. */
function $appendNestedStackPara(): TextNode {
  const para = $createParaNode("p");
  const wj = $createCharNode("wj");
  const nd = $createCharNode("nd");
  const content = $createTextNode(`${NBSP}thing`);
  $getRoot().append(
    para.append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      wj.append(
        $createMarkerNode("wj"),
        $createTextNode(NBSP),
        nd.append(
          $createMarkerNode("nd", "opening", true),
          content,
          $createMarkerNode("nd", "closing", true),
        ),
        $createMarkerNode("wj", "closing"),
      ),
    ),
  );
  return content;
}

describe("Enter inside a character style", () => {
  it("closes the style on the left and reopens it in the new paragraph", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => (content = $appendCharPara()));
    // caret between "thi" and "ng" (content text is NBSP + "thing")
    await act(async () => editor.update(() => content.select(4, 4)));

    await pressEnter(editor);

    editor.getEditorState().read(() => {
      const paras = $paras();
      expect(paras).toHaveLength(2);
      expect($usfmBytes(paras[0])).toBe("\\p \\nd thi\\nd*");
      expect($usfmBytes(paras[1])).toBe("\\p \\nd ng\\nd*");
      // The tail is still styled — not unwrapped back to plain paragraph text.
      expect(paras[1].getChildren().filter($isCharNode)).toHaveLength(1);
    });
  });

  it("closes and reopens every level of a nested stack, keeping the nesting glyphs", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (content = $appendNestedStackPara()),
    );
    await act(async () => editor.update(() => content.select(4, 4)));

    await pressEnter(editor);

    editor.getEditorState().read(() => {
      const paras = $paras();
      expect(paras).toHaveLength(2);
      expect($usfmBytes(paras[0])).toBe("\\p \\wj \\+nd thi\\+nd*\\wj*");
      expect($usfmBytes(paras[1])).toBe("\\p \\wj \\+nd ng\\+nd*\\wj*");
    });
  });

  it("keeps the left span's attribute state and display bytes together on the left half", async () => {
    // The engine alone, without the attribute-run sync, so the split's own placement of the run is
    // what is under test rather than the sync's ability to re-derive it afterwards.
    let content: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const w = $createCharNode("w", { lemma: "grace" });
      content = $createTextNode(`${NBSP}thing`);
      // The display run as the adaptor builds it: the canonical `|value` bytes for a lone default
      // attribute, tagged `attribute`, sitting between the content and the closing glyph.
      const displayRun = $createTextNode("|grace");
      $setState(displayRun, textTypeState, "attribute");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          w.append($createMarkerNode("w"), content, displayRun, $createMarkerNode("w", "closing")),
        ),
      );
    });

    await act(async () => {
      editor.update(() => content.select(4, 4));
      editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    });

    editor.getEditorState().read(() => {
      const paras = $paras();
      expect(paras).toHaveLength(2);
      const left = requireDefined(paras[0].getChildren().filter($isCharNode)[0], "left span");
      const right = requireDefined(paras[1].getChildren().filter($isCharNode)[0], "right span");
      // State and bytes stay together on the left: copying the state would double the attribute
      // bytes on serialization, and carrying the bytes alone would display attributes on a span
      // that does not have them while hiding them on the span that does.
      expect(left.getUnknownAttributes()).toEqual({ lemma: "grace" });
      expect(right.getUnknownAttributes()).toBeUndefined();
      expect($usfmBytes(paras[0])).toBe("\\p \\w thi|grace\\w*");
      expect($usfmBytes(paras[1])).toBe("\\p \\w ng\\w*");
    });
  });

  it("leaves the caret in the new paragraph, not the old one", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => (content = $appendCharPara()));
    await act(async () => editor.update(() => content.select(4, 4)));

    await pressEnter(editor);

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        throw new Error("expected a collapsed selection after Enter");
      const paras = $paras();
      expect(
        paras[1].isParentOf(selection.anchor.getNode()) ||
          selection.anchor.key === paras[1].getKey(),
      ).toBe(true);
    });
  });
});
