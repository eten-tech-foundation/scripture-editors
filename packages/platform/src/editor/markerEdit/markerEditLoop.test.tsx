/**
 * Regression tests for the resolve/rebuild fixed-point loop (Critical finding) and
 * the caret-hijack-on-completion finding (Important #1).
 *
 * The loop: an unterminated backslash sequence the tokenizer cannot structure
 * (`\zzz`, a typo'd `\qq1`, a pasted `C:\temp`) lands as pending literal text; a
 * caret departure or Enter routes it to Tier 2; the rebuild reproduces the same
 * literal text in a fresh node; that node re-arms the TextNode transform, which
 * re-adds it to `pendingKeys`; the update listener self-dispatches
 * `SELECTION_CHANGE_COMMAND`, which resolves and rebuilds again — forever. Pre-fix
 * this hung the main thread (measured at 180s). The fix is a fixed-point refusal in
 * `$rebuildParas`: a structurally identical rebuild mutates nothing, so no new node
 * is created, nothing re-arms, and the cascade terminates. The termination argument
 * is verified by the mere fact that each test RETURNS (pre-fix it hangs); the tests
 * carry generous per-test timeouts so a re-introduced loop fails loudly.
 */

import {
  initialize as initializeDeserialize,
  deserializeSerializedEditorState,
} from "../adaptors/editor-usj.adaptor";
import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  KEY_ENTER_COMMAND,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  MarkerNode,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  textTypeState,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the
// editor root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect.
// Stub it (a zero rect nothing here asserts on), same as markerEditDeletion.utils.test.tsx.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

/** Two `\p` paragraphs P and Q, each `[marker, trailing NBSP, content text]`. */
function $twoParas(pContent: string, qContent: string): { pText: TextNode; qText: TextNode } {
  const pText = $createTextNode(pContent);
  const qText = $createTextNode(qContent);
  const pTrailing = $createTextNode(NBSP);
  $setState(pTrailing, textTypeState, "marker-trailing-space");
  const qTrailing = $createTextNode(NBSP);
  $setState(qTrailing, textTypeState, "marker-trailing-space");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), pTrailing, pText),
    $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
  );
  return { pText, qText };
}

/** True when `anchor` is inside the paragraph whose content text is `qText`. */
function $anchorIsInParaOf(anchor: LexicalNode, qText: TextNode): boolean {
  const qPara = qText.getParent();
  for (let node: LexicalNode | null = anchor; node; node = node.getParent())
    if (qPara && node.is(qPara)) return true;
  return false;
}

/**
 * A `\p` paragraph P holding a milestone's display run (opening MarkerNode, attribute
 * text, self-closing MarkerNode — same shape `$milestoneDisplayRun` matches) immediately
 * followed by unterminated `\zzz` literal text, plus a second plain `\p` paragraph Q to
 * depart the caret to. `$appendChildrenFragment` absorbs the display run into ONE
 * sentinel; `$appendSignature` must do the same (Fix 1) or the fixed-point comparison
 * never matches and the resolve/rebuild loop stays reachable for any milestone paragraph.
 */
function $milestoneZzzParaAndSecond(): { zzzText: TextNode; qText: TextNode } {
  const pTrailing = $createTextNode(NBSP);
  $setState(pTrailing, textTypeState, "marker-trailing-space");
  const milestone = $createMilestoneNode("ts-s", "ts.RUT.1");
  const opening = $createMarkerNode("ts-s");
  const attribute = $createTextNode(`${NODE_ATTRIBUTE_PREFIX}sid="ts.RUT.1"`);
  $setState(attribute, textTypeState, "attribute");
  const closing = $createMarkerNode("", "selfClosing");
  const zzzText = $createTextNode(" body \\zzz");
  const qText = $createTextNode("second");
  const qTrailing = $createTextNode(NBSP);
  $setState(qTrailing, textTypeState, "marker-trailing-space");
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      pTrailing,
      milestone,
      opening,
      attribute,
      closing,
      zzzText,
    ),
    $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
  );
  // Caret starts inside the pending `\zzz` text (as if the user just typed it), matching
  // the shape of the other loop tests: it only pends until the caret departs.
  zzzText.select(zzzText.getTextContentSize(), zzzText.getTextContentSize());
  return { zzzText, qText };
}

describe("Tier 2 resolve/rebuild fixed-point loop (Critical)", () => {
  it("does not hang and keeps literal text: unterminated \\zzz + caret departure", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("body", "second")),
    );

    // Type an unterminated unknown marker; caret stays inside it, so it only pends.
    await act(async () =>
      editor.update(() => {
        pText.setTextContent("body \\zzz");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    // Move the caret into the other paragraph -> the pending marker resolves.
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\zzz"); // literal text intact
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);

  it("does not hang and keeps literal text: unterminated \\zzz + Enter", async () => {
    let pText: TextNode;
    const { editor } = await testEnvironment(() => ({ pText } = $twoParas("body", "second")));

    await act(async () =>
      editor.update(() => {
        pText.setTextContent("body \\zzz");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\zzz");
    });
  }, 15000);

  it("does not hang and keeps literal text: path-like C:\\temp + caret departure", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("safe", "second")),
    );

    await act(async () =>
      editor.update(() => {
        pText.setTextContent("C:\\temp");
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("C:\\temp");
    });
  }, 15000);
});

describe("caret hijack on pending completion (Important #1)", () => {
  it("leaves the caret in another paragraph when a real rebuild fires elsewhere", async () => {
    let pText: TextNode, qText: TextNode;
    const { editor } = await testEnvironment(
      () => ({ pText, qText } = $twoParas("before  after", "second")),
    );

    // Terminated markers -> a genuine structural rebuild of P (creates an `nd` span),
    // triggered while the caret already sits in Q. The caret must not be yanked into P.
    await act(async () =>
      editor.update(() => {
        pText.setTextContent("before \\nd Lord\\nd* after");
        qText.select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      // P really was rebuilt into a char span (proves the rebuild ran, not refused).
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      expect(firstPara.getChildren().some($isCharNode)).toBe(true);
      // ...and the caret is still in Q, untouched.
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);
});

describe("Tier 2 fixed-point loop with a milestone display run (Critical, Fix 1)", () => {
  it("does not hang and keeps literal text: milestone run + unterminated \\zzz + caret departure", async () => {
    let zzzKey: string, qText: TextNode;
    const { editor } = await testEnvironment(() => {
      const { zzzText, qText: q } = $milestoneZzzParaAndSecond();
      zzzKey = zzzText.getKey();
      qText = q;
    });

    // Move the caret into the other paragraph -> the pending `\zzz` text resolves,
    // routing the WHOLE paragraph (milestone run + literal text) through $rebuildParas.
    // Pre-Fix-1 this hangs: the milestone run's OLD-side signature never collapses to the
    // same single sentinel the fragment builder (and therefore the tokenized NEW side)
    // produces, so the fixed-point refusal never fires and the resolve/rebuild cascade
    // repeats forever.
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\zzz"); // literal text intact
      // Fixed-point refusal means $rebuildParas mutated nothing: the same TextNode
      // instance is still attached, not a freshly re-tokenized replacement.
      expect($getNodeByKey(zzzKey)?.isAttached()).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);
});

describe("glyph/content boundary restructure is not refused as a fixed point (Important, Fix 2)", () => {
  it("rebuilds (not refuses) when a paragraph's own marker glyph is retyped past its canonical text", async () => {
    let paraMarker: MarkerNode, qText: TextNode;
    const { editor } = await testEnvironment(() => {
      paraMarker = $createMarkerNode("p");
      const pTrailing = $createTextNode(NBSP);
      $setState(pTrailing, textTypeState, "marker-trailing-space");
      const pContent = $createTextNode("body");
      qText = $createTextNode("second");
      const qTrailing = $createTextNode(NBSP);
      $setState(qTrailing, textTypeState, "marker-trailing-space");
      $getRoot().append(
        $createParaNode("p").append(paraMarker, pTrailing, pContent),
        $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
      );
    });

    // Retype the paragraph's own opening marker glyph past its canonical boundary: "\q
    // extra" is a new marker word PLUS content that spilled into the glyph text (the
    // Tier-2-routed shape — unterminated/multi-word, so it only pends). Pre-Fix-2, the
    // bare (undelimited) old signature "...\q extra..." + "body" and the tokenized new
    // signature "...\q..." + "extra body" concatenate to the SAME string, so the rebuild
    // is wrongly refused as a no-op and the paragraph keeps displaying "\q extra body"
    // while still being STORED under marker "p" — silent byte loss on save.
    await act(async () =>
      editor.update(() => {
        paraMarker.setTextContent("\\q extra");
        paraMarker.select(paraMarker.getTextContentSize(), paraMarker.getTextContentSize());
      }),
    );
    // Move the caret into the other paragraph -> the pending marker resolves via Tier 2.
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      expect(firstPara.getMarker()).toBe("q"); // real rebuild happened, not refused
    });

    // Serialization matches the visible outcome: marker "q", "extra" is content text.
    initializeDeserialize(undefined, getViewOptions(STANDARD_VIEW_MODE));
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON());
    const paras = usj?.content.filter((c) => typeof c !== "string" && c.type === "para");
    expect(paras?.[0]).toMatchObject({ type: "para", marker: "q" });
    expect(JSON.stringify(paras?.[0])).toContain("extra body");
  }, 15000);
});
