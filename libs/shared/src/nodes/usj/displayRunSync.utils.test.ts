import { $isAttributeRunNode } from "./AttributeRunNode.js";
import { $createCharNode } from "./CharNode.js";
import { $caretHoldsRunSite, $syncDisplayRun } from "./displayRunSync.utils.js";
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

// The brief's third describe block ("$caretHoldsRunSite (wrapper containment)") is deliberately
// omitted: it never called $caretHoldsRunSite and read a node outside an editor.update()/read()
// callback (a runtime error, not a passing assertion) — the char kind never wraps its run at all
// (byteFormat.writer is "owner-children"), so the wrapper-containment arm needs a wrapper-writing
// kind to exercise meaningfully. The verse suite below is that kind — its own wrapper-containment
// pin lives with the re-pointed AttributeRunNode dual-read suite (attributeDisplay.utils.test.ts's
// "recognizes the caret anywhere inside a \va wrapper as holding the run's site" — the caret sits
// on the OPENING glyph at offset 0, a shape none of the verse descriptor's own geometry arms
// recognize, so only the shared wrapper-containment arm can be reporting it).

describe("$syncDisplayRun (verse)", () => {
  /** `<p>␣<verse \v 1>In the beginning</p>` with a healed `\va` wrapper (altnumber "2") riding as
   * the verse's immediate next sibling — the shape a `"va"`-descriptor sync builds from scratch,
   * the driver's first live exercise of `$ensureWrapper` and the glyph writer (Task 4 landed both
   * dead: the char kind never wraps). */
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
