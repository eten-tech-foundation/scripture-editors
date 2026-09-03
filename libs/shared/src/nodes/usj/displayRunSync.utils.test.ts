import { $isAttributeRunNode } from "./AttributeRunNode.js";
import { $createCharNode } from "./CharNode.js";
import { $caretHoldsRunSite, $syncDisplayRun } from "./displayRunSync.utils.js";
import { $createMilestoneNode } from "./MilestoneNode.js";
import { getVisibleOpenMarkerText } from "./node.utils.js";
import { NBSP } from "./node-constants.js";
import { registerPendedDisplayOwners } from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createVerseNode } from "./VerseNode.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { displayRunDescriptor } from "../../displayRun/displayRunRegistry.js";
import { $createParaNode } from "./ParaNode.js";
import { $createTextNode, $getRoot, $getState, $isTextNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("$syncDisplayRun (char)", () => {
  /** `<p>\p ␣<char nd>\nd ␣Lord\nd*</char></p>` with `lemma="grace"` on the span. */
  function buildCharWithAttributes() {
    const { editor } = createBasicTestEnvironment();
    let char!: ReturnType<typeof $createCharNode>;
    editor.update(
      () => {
        char = $createCharNode("nd", { lemma: "grace" });
        char.append(
          $createMarkerNode("nd", "opening"),
          $createTextNode(`${NBSP}Lord`),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(char));
        $syncDisplayRun(displayRunDescriptor("char"), char);
      },
      { discrete: true },
    );
    return { editor, char };
  }

  it("inserts the canonical `|…` run immediately before the closing glyph", () => {
    const { editor, char } = buildCharWithAttributes();
    editor.getEditorState().read(() => {
      const children = char.getChildren();
      const run = children.at(-2);
      expect(run?.getTextContent()).toBe('|lemma="grace"');
      expect(run && $getState(run, textTypeState)).toBe("attribute");
    });
  });

  it("leaves a wanted-but-destroyed run alone and reports the owner instead of resurrecting it", () => {
    const { editor, char } = buildCharWithAttributes();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        const run = char.getChildren().at(-2);
        run?.remove();
        // Park the caret nowhere the char descriptor's graceSite recognizes.
        $getRoot().selectStart();
        $syncDisplayRun(displayRunDescriptor("char"), char);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect(char.getChildren().at(-2)?.getTextContent()).toBe(`${NBSP}Lord`);
      expect(pended.has(char.getKey())).toBe(true);
    });
    unregister();
  });
});

describe("$caretHoldsRunSite (char)", () => {
  it("graces a deleted run while the caret sits at the end of the content before the closer", () => {
    const { editor } = createBasicTestEnvironment();
    let char!: ReturnType<typeof $createCharNode>;
    editor.update(
      () => {
        char = $createCharNode("nd", { lemma: "grace" });
        const content = $createTextNode(`${NBSP}Lord`);
        char.append(
          $createMarkerNode("nd", "opening"),
          content,
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(char));
        content.select(content.getTextContentSize(), content.getTextContentSize());
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($caretHoldsRunSite(displayRunDescriptor("char"), char)).toBe(true);
    });
  });
});

// $caretHoldsRunSite's wrapper-containment arm (the caret held anywhere inside a run's
// AttributeRunNode subtree, not just a recognized piece) needs a wrapper-WRITING kind to exercise
// meaningfully — the char kind's byteFormat.writer is "owner-children", so it never wraps its run
// at all and cannot reach that arm. The verse suite below is that kind — its own
// wrapper-containment pin lives with the re-pointed AttributeRunNode dual-read suite
// (attributeDisplay.utils.test.ts's "recognizes the caret anywhere inside a \va wrapper as holding
// the run's site" — the caret sits on the OPENING glyph at offset 0, a shape none of the verse
// descriptor's own geometry arms recognize, so only the shared wrapper-containment arm can be
// reporting it).

describe("$syncDisplayRun (verse)", () => {
  /** `<p>␣<verse \v 1>In the beginning</p>` with a healed `\va` wrapper (altnumber "2") riding as
   * the verse's immediate next sibling — the shape a `"va"`-descriptor sync builds from scratch.
   * The char kind's byteFormat.writer is "owner-children" (it never wraps its run), so this is the
   * driver's first LIVE exercise of `$ensureWrapper` and the wrapper-writing half of `$writeRun`. */
  function buildVerseWithVa() {
    const { editor } = createBasicTestEnvironment();
    let verse!: ReturnType<typeof $createVerseNode>;
    editor.update(
      () => {
        verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          undefined,
        );
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            $createTextNode("In the beginning"),
          ),
        );
        $syncDisplayRun(displayRunDescriptor("va"), verse);
      },
      { discrete: true },
    );
    return { editor, verse };
  }

  it("reports the owner instead of resurrecting a \\va wrapper deleted in the same commit", () => {
    // The destruction check is the driver's, so it now covers verses and milestones too — before
    // it existed only in the char sync, and a verse relied entirely on the cross-commit mutation
    // listener, which cannot see a deletion the same commit that dirties the verse.
    const { editor, verse } = buildVerseWithVa();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        verse.getNextSibling()?.remove();
        // Park the caret on the leading text, well away from any graced site.
        const before = verse.getPreviousSibling();
        if ($isTextNode(before)) before.select(0, 0);
        $syncDisplayRun(displayRunDescriptor("va"), verse);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($isAttributeRunNode(verse.getNextSibling())).toBe(false);
      expect(pended.has(verse.getKey())).toBe(true);
    });
    unregister();
  });

  it("reports the owner when the run's bytes are deleted but the wrapper husk survives", () => {
    // Deleting the visible `\va 2\va*` bytes can leave the AttributeRunNode itself standing as
    // an empty husk (deleting inside an element removes its children, not the element). The husk
    // is not run bytes: destruction must still be reported — not counted as a surviving run,
    // which would let the sync resurrect the bytes the user just deleted inside the husk.
    const { editor, verse } = buildVerseWithVa();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        const wrapper = verse.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("wrapper missing");
        wrapper.getChildren().forEach((child) => child.remove());
        // Park the caret on the leading text, well away from any graced site.
        const before = verse.getPreviousSibling();
        if ($isTextNode(before)) before.select(0, 0);
        $syncDisplayRun(displayRunDescriptor("va"), verse);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const husk = verse.getNextSibling();
      if (!$isAttributeRunNode(husk)) throw new Error("husk missing");
      expect(husk.getChildrenSize()).toBe(0);
      expect(pended.has(verse.getKey())).toBe(true);
    });
    unregister();
  });

  it("anchors a \\vp run after the \\va wrapper", () => {
    const { editor, verse } = buildVerseWithVa();
    editor.update(
      () => {
        verse.setPubnumber("3");
        $syncDisplayRun(displayRunDescriptor("vp"), verse);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const va = verse.getNextSibling();
      const vp = va?.getNextSibling();
      if (!$isAttributeRunNode(va) || !$isAttributeRunNode(vp)) throw new Error("wrappers missing");
      expect(va.getRunKind()).toBe("va");
      expect(vp.getRunKind()).toBe("vp");
      expect(vp.getChildren().at(1)?.getTextContent()).toBe(`${NBSP}3`);
    });
  });
});

describe("$syncDisplayRun (milestone)", () => {
  /** `<p>before <ms qt-s sid="q1"> after</p>` with a healed run riding as the milestone's
   * immediate next sibling — the shape a `"milestone"`-descriptor sync builds from scratch. */
  function buildMilestoneWithRun() {
    const { editor } = createBasicTestEnvironment();
    let milestone!: ReturnType<typeof $createMilestoneNode>;
    editor.update(
      () => {
        milestone = $createMilestoneNode("qt-s", "q1");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("before "),
            milestone,
            $createTextNode(" after"),
          ),
        );
        $syncDisplayRun(displayRunDescriptor("milestone"), milestone);
      },
      { discrete: true },
    );
    return { editor, milestone };
  }

  it("reports the owner instead of resurrecting a run deleted in the same commit", () => {
    // The destruction check is the driver's, so — same as the verse pin above — it covers
    // milestones too: before the milestone kind went through this shared driver, the bespoke
    // milestone sync's OWN caret-grace/pended checks covered a same-commit deletion by
    // recognizing the deleted-run flank as a grace site, a milestone-specific mechanism replaced
    // here by the driver's general destruction detection. Parking the caret somewhere that
    // mechanism does NOT recognize proves this test exercises $runDestroyedSinceLastCommit rather
    // than incidentally passing through graceSite.
    const { editor, milestone } = buildMilestoneWithRun();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        milestone.getNextSibling()?.remove();
        // Park the caret on the leading text's START, well away from any graced site (the
        // milestone descriptor's own flank grace recognizes only the END of the preceding
        // sibling or the START of the following one — neither is this position).
        const before = milestone.getPreviousSibling();
        if ($isTextNode(before)) before.select(0, 0);
        $syncDisplayRun(displayRunDescriptor("milestone"), milestone);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($isAttributeRunNode(milestone.getNextSibling())).toBe(false);
      expect(pended.has(milestone.getKey())).toBe(true);
    });
    unregister();
  });
});
