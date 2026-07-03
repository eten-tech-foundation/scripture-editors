// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $stripSelectionToQuotation } from "./noteQuotation.utils";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
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
