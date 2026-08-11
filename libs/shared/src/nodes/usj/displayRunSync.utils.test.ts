import { $createCharNode } from "./CharNode.js";
import { $caretHoldsRunSite, $syncDisplayRun } from "./displayRunSync.utils.js";
import { NBSP } from "./node-constants.js";
import { registerPendedDisplayOwners } from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { displayRunDescriptor } from "../../displayRun/displayRunRegistry.js";
import { $createParaNode } from "./ParaNode.js";
import { $createTextNode, $getRoot, $getState } from "lexical";
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
// kind to exercise meaningfully. Task 5's verse coverage lands that.
