/**
 * Regression tests for the resolve/rebuild fixed-point loop (Critical finding) and
 * the caret-hijack-on-completion finding (Important #1).
 *
 * The loop: an unterminated backslash sequence lands as pending literal text; a caret
 * departure or Enter routes it to Tier 2; the rebuild reproduces an unchanged fragment
 * in a fresh node; that node re-arms the TextNode transform, which re-adds it to
 * `pendingKeys`; the update listener queues a deferred resolution update (a microtask;
 * formerly a synchronous `SELECTION_CHANGE_COMMAND` self-dispatch), which
 * resolves and rebuilds again — forever. Pre-fix this hung the main thread (measured at
 * 180s). The fix is a fixed-point refusal in `$rebuildParas`: a structurally identical
 * rebuild mutates nothing, so no new node is created, nothing re-arms, and the cascade
 * terminates. The termination argument is verified by the mere fact that each test
 * RETURNS (pre-fix it hangs); the tests carry generous per-test timeouts so a
 * re-introduced loop fails loudly.
 *
 * Since the stylesheet-first tokenizer landed, most of these inputs (`\zzz`, a pasted
 * `C:\temp`) no longer hit the fixed-point path at all: an unknown marker now resolves
 * structurally (PT9 `DetermineUnknownTokenType` — a body-context paragraph split), so
 * the rebuild makes real forward progress on the FIRST attempt and the cascade
 * terminates that way instead. Those tests below assert the real split. The fixed-point
 * refusal itself is exercised separately, by an input the tokenizer genuinely cannot
 * resolve into anything new (an unterminated milestone run — one of the tokenizer's
 * few remaining literal-degradation cases).
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
function $milestoneZzzParaAndSecond(): {
  zzzText: TextNode;
  qText: TextNode;
  milestone: ReturnType<typeof $createMilestoneNode>;
} {
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
  return { zzzText, qText, milestone };
}

describe("Tier 2 resolve/rebuild fixed-point loop (Critical)", () => {
  it("does not hang: unterminated \\zzz + caret departure resolves via a real rebuild", async () => {
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
      // "zzz" is unknown to the stylesheet, so per PT9 DetermineUnknownTokenType
      // it resolves as a genuine body-context PARAGRAPH split, not literal text left in
      // place: a real, non-fixed-point rebuild. The cascade still terminates (this test
      // returns) via forward progress, not the fixed-point refusal.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(3);
      expect(paras[0].getTextContent()).toContain("body");
      expect(paras[1].getMarker()).toBe("zzz");
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);

  it("does not hang: unterminated \\zzz + Enter resolves via a real rebuild", async () => {
    let pText: TextNode, pKey: string;
    const { editor } = await testEnvironment(() => {
      ({ pText } = $twoParas("body", "second"));
      pKey = pText.getKey();
    });

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
      // As above, "zzz" resolves structurally rather than staying literal. Two
      // deterministic discriminators pin the real rebuild: (1) the original literal
      // TextNode was destroyed by the paragraph rebuild — under the old literal behavior
      // (fixed-point refusal) or a regressed Enter path that resolves nothing, it would
      // still be attached; (2) a paragraph with marker "zzz" exists. Enter's own default
      // split additionally fires on top of the rebuild's result (the restored caret sits
      // inside the new "\zzz" glyph, so the split lands mid-glyph, leaving an extra
      // artifact paragraph) — that orthogonal, pre-existing interaction is tolerated by
      // not pinning the paragraph count.
      expect($getNodeByKey(pKey)).toBeNull();
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zzz")).toBe(true);
    });
  }, 15000);

  it("does not hang: path-like C:\\temp resolves via a real rebuild, not a loop", async () => {
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
      // "temp" is unknown to the stylesheet, so per PT9 DetermineUnknownTokenType
      // it resolves as a genuine body-context PARAGRAPH split rather than staying literal —
      // a real, non-fixed-point rebuild. The termination guarantee here is forward progress
      // (a new paragraph), not the fixed-point refusal exercised by the other tests in this
      // file; either way the resolve/rebuild cascade must still terminate (this test returns).
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(3);
      expect(paras[0].getTextContent()).toContain("C:");
      expect(paras[1].getMarker()).toBe("temp");
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

describe("Tier 2 rebuild with a milestone display run (Critical, Fix 1)", () => {
  it("does not hang and preserves the milestone: unterminated \\zzz splits into its own paragraph", async () => {
    let zzzKey: string, qText: TextNode, msKey: string;
    const { editor } = await testEnvironment(() => {
      const { zzzText, qText: q, milestone } = $milestoneZzzParaAndSecond();
      zzzKey = zzzText.getKey();
      qText = q;
      msKey = milestone.getKey();
    });

    // Move the caret into the other paragraph -> the pending `\zzz` text resolves,
    // routing the WHOLE paragraph (milestone run + literal text) through $rebuildParas.
    // "zzz" is unknown to the stylesheet, so per PT9 DetermineUnknownTokenType it
    // now resolves as a genuine body-context PARAGRAPH split rather than staying literal:
    // this is a real, non-fixed-point rebuild, not a loop. Fix 1 still matters here:
    // `$appendSignature` must collapse the milestone's display run into the SAME single
    // sentinel `$appendChildrenFragment` uses when building the fragment, or the milestone
    // run would be torn down and rebuilt (or worse, mismatch the sentinel/placeholder count
    // and abort) even though its own paragraph content is otherwise unchanged.
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      // The "zzz" text was genuinely retokenized away into a new paragraph (the old
      // TextNode is gone entirely, not merely detached).
      expect($getNodeByKey(zzzKey)).toBeNull();
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(3);
      expect(paras[1].getMarker()).toBe("zzz");
      // ...while the milestone in the FIRST paragraph survived as the SAME instance
      // (preserved via its Tier 2 sentinel, not recreated), since that paragraph's own
      // content was otherwise unchanged.
      expect(paras[0].getChildren().some((n) => n.getKey() === msKey)).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection))
        expect($anchorIsInParaOf(selection.anchor.getNode(), qText)).toBe(true);
    });
  }, 15000);
});

describe("genuine fixed-point refusal (no real progress possible)", () => {
  it("does not hang: an unterminated milestone run is a true no-op, refused rather than looping", async () => {
    // Unlike `\zzz` or `C:\temp` above, an unterminated milestone run (no `\*` to close it)
    // is one of the tokenizer's few remaining literal-degradation cases (see
    // usfmFragmentToUsjContent's doc comment): it comes back out exactly as it went in, so
    // this is the one scenario left where the resolve/rebuild cascade must terminate via
    // `$rebuildParas`'s fixed-point refusal (no mutation), not via real forward progress.
    let pText: TextNode, qText: TextNode, pParaKey: string;
    const { editor } = await testEnvironment(() => {
      ({ pText, qText } = $twoParas("body", "second"));
      pParaKey = pText.getParentOrThrow().getKey();
    });

    await act(async () =>
      editor.update(() => {
        pText.setTextContent('body \\ts-s |sid="x"');
        pText.select(pText.getTextContentSize(), pText.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => qText.select(0, 0)));

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain('\\ts-s |sid="x"'); // literal text intact
      // No split happened: the rebuild was refused as a no-op, not spliced in.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      // Node-identity pin (the file's established discriminator): the refusal mutated
      // NOTHING — the same ParaNode and the same literal TextNode are still attached,
      // not a structurally identical re-splice.
      expect($getNodeByKey(pParaKey)?.isAttached()).toBe(true);
      expect($getNodeByKey(pText.getKey())?.isAttached()).toBe(true);
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
    initializeDeserialize(undefined);
    const usj = deserializeSerializedEditorState(
      editor.getEditorState().toJSON(),
      getViewOptions(STANDARD_VIEW_MODE),
    );
    const paras = usj?.content.filter((c) => typeof c !== "string" && c.type === "para");
    expect(paras?.[0]).toMatchObject({ type: "para", marker: "q" });
    expect(JSON.stringify(paras?.[0])).toContain("extra body");
  }, 15000);
});
