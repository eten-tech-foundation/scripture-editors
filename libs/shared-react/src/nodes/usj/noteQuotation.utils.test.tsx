// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $stripSelectionToQuotation } from "./note.utils";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  RangeSelection,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createVerseNode,
  CharNode,
  MarkerNode,
  NoteNode,
  ParaNode,
  VerseNode,
} from "shared";

const requiredNodes = [ParaNode, CharNode, VerseNode, NoteNode, MarkerNode];

/** Builds content and a selection in a single editor update, then returns the stripped quotation. */
function stripQuotationFor(buildAndSelect: () => RangeSelection): string {
  const { editor } = createBasicTestEnvironment(requiredNodes);
  let quotation = "";
  editor.update(
    () => {
      const selection = buildAndSelect();
      quotation = $stripSelectionToQuotation(selection);
    },
    { discrete: true },
  );
  return quotation;
}

describe("$stripSelectionToQuotation()", () => {
  it("strips markers and emits \\+fv for embedded verse numbers", () => {
    // selection over: "the " + <\nd LORD \nd*> + " " + <verse 5> + " said"
    const quotation = stripQuotationFor(() => {
      const para = $createParaNode().append(
        $createTextNode("the "),
        $createCharNode("nd").append(
          $createMarkerNode("nd"),
          $createTextNode("LORD"),
          $createMarkerNode("nd", "closing"),
        ),
        $createTextNode(" "),
        $createVerseNode("5"),
        $createTextNode(" said"),
      );
      $getRoot().append(para);
      para.select(0, para.getChildrenSize());
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe(`the LORD \\+fv 5\\+fv* said`);
  });

  it("skips nested notes entirely, including their markers and content", () => {
    const quotation = stripQuotationFor(() => {
      const para = $createParaNode().append(
        $createTextNode("before "),
        $createNoteNode("f", "+").append(
          $createCharNode("fr").append($createTextNode("1:1 ")),
          $createCharNode("ft").append($createTextNode("hidden note text")),
        ),
        $createTextNode("after"),
      );
      $getRoot().append(para);
      para.select(0, para.getChildrenSize());
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe("before after");
  });

  it("contributes only the selected substring for a partial-word selection", () => {
    const quotation = stripQuotationFor(() => {
      const text = $createTextNode("say hello world");
      const para = $createParaNode().append(text);
      $getRoot().append(para);
      // Select "ell" out of "hello" (offsets 5-8), not the whole word or surrounding text.
      text.select(5, 8);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe("ell");
  });

  it("slices only the selected substrings of the first and last nodes across multiple nodes", () => {
    // Three text nodes with the selection starting and ending mid-word: only the first node's
    // tail and the last node's head may contribute; the middle node contributes whole.
    const quotation = stripQuotationFor(() => {
      const first = $createTextNode("say hello");
      const middle = $createTextNode(" brave ");
      const last = $createTextNode("world today");
      $getRoot().append($createParaNode().append(first, middle, last));
      const rangeSelection = $createRangeSelection();
      // Anchor mid-"hello" (after "say hel"), focus mid-"world" (after "wor").
      rangeSelection.anchor = $createPoint(first.getKey(), 7, "text");
      rangeSelection.focus = $createPoint(last.getKey(), 3, "text");
      $setSelection(rangeSelection);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe("lo brave wor");
  });

  it("returns the same quotation for a backward selection (focus before anchor)", () => {
    // Same range as the forward multi-node test, but selected right-to-left: the anchor sits in
    // the LAST node and the focus in the FIRST, so the first/last-node offset slicing must swap
    // which point it reads for each end.
    const quotation = stripQuotationFor(() => {
      const first = $createTextNode("say hello");
      const middle = $createTextNode(" brave ");
      const last = $createTextNode("world today");
      $getRoot().append($createParaNode().append(first, middle, last));
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(last.getKey(), 3, "text");
      rangeSelection.focus = $createPoint(first.getKey(), 7, "text");
      $setSelection(rangeSelection);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe("lo brave wor");
  });

  it("keeps authored NBSP while still collapsing a run of plain spaces", () => {
    // A hard space is content Paratext preserves; only the ASCII run between "brave" and "new"
    // should collapse.
    const quotation = stripQuotationFor(() => {
      const text = $createTextNode("a\u00A0brave   new world");
      $getRoot().append($createParaNode().append(text));
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(text.getKey(), 0, "text");
      rangeSelection.focus = $createPoint(text.getKey(), text.getTextContent().length, "text");
      $setSelection(rangeSelection);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected range selection");
      return selection;
    });

    expect(quotation).toBe("a\u00A0brave new world");
  });

  it("returns empty string when selection is not a range selection", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    let quotation = "not empty";
    editor.update(
      () => {
        // No selection has been set.
        const selection = $getSelection();
        quotation = $stripSelectionToQuotation(selection as unknown as RangeSelection);
      },
      { discrete: true },
    );

    expect(quotation).toBe("");
  });
});
