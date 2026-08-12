/**
 * Regression for the live QA repro (2026-08-12, task-14-report.md Stage C): after ANY Tier-2
 * paragraph rebuild, an `\optbreak`'s `//` token vanished FROM THE SCREEN while the Lexical node,
 * `getUsj()`, and the bytes on disk all stayed intact — a rendering defect, not data loss. QA's
 * seed was `\p QAC \w word|lemma\w* middle text // more text.`; deleting the `\w` span's `|lemma`
 * attribute run (selection stopping before `\w*`) and departing left
 * `<unknown data-tag="optbreak"><span class="marker"></span></unknown>` — the element still there,
 * its glyph text gone. Neither a tab switch nor chapter navigation brought it back; only closing
 * and reopening the editor did.
 *
 * The mechanism is `ImmutableTypedTextNode`'s decorator payload (its own doc comment carries the
 * full account): a Tier-2 rebuild re-parents preserved nodes (`$replaceSentinels`,
 * tier2Rebuild.utils.ts), Lexical re-creates the element of every child of the freshly created
 * paragraph, and a decorator whose value has stable identity never notifies the decorator listener
 * — so `useDecorators`' React portal stayed pointed at the old, detached element and the new one
 * was left empty forever.
 *
 * These pins therefore assert on the RENDERED DOM, not on the node or the serialized output — the
 * sibling suites (optbreakDeletionSettle, settledGetUsj) already pin those and stayed green
 * throughout the bug, which is exactly why it went unnoticed. The harness is the React-mounted
 * `testEnvironmentWithCharSync`, so decorator portals genuinely render here: the "before" assertion
 * in each test passes on the unfixed code, and only the post-rebuild one fails, which is what makes
 * these discriminating rather than trivially red.
 *
 * The second test pins QA's broader finding: the vanish was never specific to DELETING the
 * attribute section. Typing one back in rebuilds the paragraph just the same, and blanked the glyph
 * just the same.
 *
 * The third widens the pin from the reported symptom to the actual defect class.
 * `ImmutableTypedTextNode` was not the only read-only glyph painting itself through a
 * stable-identity decorator payload — `ImmutableUnmatchedNode` (the flag on an unmatched closer)
 * did too, and it is preserved and re-parented by the very same `$replaceSentinels` pass, so its
 * `\marker` glyph blanked out identically. Confirmed red the same way before the fix.
 */

import { requireDefined, testEnvironmentWithCharSync } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getState,
  $isTextNode,
  $setState,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createImmutableTypedTextNode,
  $createImmutableUnmatchedNode,
  $createMarkerNode,
  $createParaNode,
  $createUnknownNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isMarkerNode,
  $isParaNode,
  $isUnknownNode,
  NBSP,
  textTypeState,
  ZWSP,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
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

/** QA's seed paragraph, plus a second paragraph to depart to. */
const $initial = () => {
  const char = $createCharNode("w");
  char.setUnknownAttributes({ lemma: "lemma" });
  const run = $createTextNode("|lemma");
  $setState(run, textTypeState, "attribute");
  char.append(
    $createMarkerNode("w"),
    $createTextNode(`${NBSP}word`),
    run,
    $createMarkerNode("w", "closing"),
  );
  const optbreak = $createUnknownNode("optbreak");
  optbreak.append($createImmutableTypedTextNode("marker", "//")); // the `//` token
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("QAC "),
      char,
      $createTextNode(" middle text "),
      optbreak,
      $createTextNode(" more text."),
    ),
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("body"),
    ),
  );
};

// Re-query nodes each commit (a rebuild detaches cross-closure references).
const $firstPara = () => $getRoot().getChildren().filter($isParaNode)[0];
const $firstChar = () => requireDefined($firstPara().getChildren().find($isCharNode), "char");
const $attributeRun = (): TextNode | undefined =>
  $firstChar()
    .getChildren()
    .find(
      (child): child is TextNode =>
        $isTextNode(child) &&
        !$isMarkerNode(child) &&
        $getState(child, textTypeState) === "attribute",
    );

/** What the optbreak's `//` token is actually PAINTING right now. */
function renderedOptbreakGlyph(editor: LexicalEditor): string | null | undefined {
  let key = "";
  editor.getEditorState().read(() => {
    const optbreak = requireDefined($firstPara().getChildren().find($isUnknownNode), "optbreak");
    key = requireDefined(optbreak.getFirstChild() ?? undefined, "optbreak glyph").getKey();
  });
  return editor.getElementByKey(key)?.textContent;
}

/** Move the caret into the second paragraph — the departure that runs the settle. */
async function departCaret(editor: LexicalEditor): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      body.select(0, 0);
    }),
  );
}

describe("preserved glyph decorators keep rendering across a rebuild (TJ live repro, 2026-08-12)", () => {
  it("keeps rendering `//` after deleting the char span's attribute run", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    expect(renderedOptbreakGlyph(editor)).toBe("//");

    await act(async () =>
      editor.update(() => {
        const char = $firstChar();
        const run = requireDefined($attributeRun(), "attribute run missing");
        const index = run.getIndexWithinParent();
        run.remove();
        char.select(index, index); // caret at the deletion site, `\w*` untouched (QA's C1)
      }),
    );
    await departCaret(editor);

    editor.getEditorState().read(() => {
      // The node itself was never the problem — optbreakDeletionSettle.test.tsx pins that side.
      expect($firstPara().getChildren().some($isUnknownNode)).toBe(true);
    });
    expect(renderedOptbreakGlyph(editor)).toBe("//");
  });

  it("keeps rendering `//` when the attribute run is TYPED BACK IN (any rebuild, not just a delete)", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    // Start from the settled no-attribute state so the retype is the only pending edit.
    await act(async () =>
      editor.update(() => {
        const char = $firstChar();
        const run = requireDefined($attributeRun(), "attribute run missing");
        const index = run.getIndexWithinParent();
        run.remove();
        char.select(index, index);
      }),
    );
    await departCaret(editor);
    expect(renderedOptbreakGlyph(editor)).toBe("//");

    // Type `|lemma` back into the span's content — a pending attribute edit in a closed char span
    // ($textNodeTier2Transform's pipe branch), so departure re-tokenizes the paragraph again.
    await act(async () =>
      editor.update(() => {
        const content = requireDefined(
          $firstChar()
            .getChildren()
            .find(
              (child): child is TextNode =>
                $isTextNode(child) &&
                !$isMarkerNode(child) &&
                $getState(child, textTypeState) !== "attribute",
            ),
          "char content missing",
        );
        content.setTextContent(`${NBSP}word|lemma`);
        content.select(content.getTextContentSize(), content.getTextContentSize());
      }),
    );
    await departCaret(editor);

    editor.getEditorState().read(() => {
      expect($firstChar().getUnknownAttributes()?.lemma).toBe("lemma"); // the retype landed
    });
    expect(renderedOptbreakGlyph(editor)).toBe("//");
  });

  it("keeps rendering an unmatched marker's glyph after its paragraph is rebuilt", async () => {
    const { editor } = await testEnvironmentWithCharSync(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("before "),
          $createImmutableUnmatchedNode("wj*"),
          $createTextNode(" after"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });
    const glyph = () => {
      let key = "";
      editor.getEditorState().read(() => {
        key = requireDefined(
          $firstPara().getChildren().find($isImmutableUnmatchedNode),
          "unmatched node",
        ).getKey();
      });
      return editor.getElementByKey(key)?.textContent;
    };
    const flagged = `\\wj*${ZWSP}`;
    expect(glyph()).toBe(flagged);

    // Any literal the tokenizer resolves is enough to make the rebuild a non-fixed-point, which is
    // all it takes to re-parent the preserved unmatched node into the new paragraph.
    await act(async () =>
      editor.update(() => {
        $firstPara().append($createTextNode("\\nd x\\nd* "));
      }),
    );
    await departCaret(editor);

    expect(glyph()).toBe(flagged);
  });
});
