/**
 * Integration regression for verse `\va`/`\vp` attribute-run deletion. Mounts BOTH the marker-edit
 * engine (pend/settle) and TextSpacingPlugin (the self-healing display-run sync) — the real app's
 * plugin stack — because the bug lives in their interaction: deleting the whole triplet left
 * altnumber set, and the sync re-derived the triplet from it, so the deletion visibly undid itself
 * and never settled. The grace + pend + settle-on-departure wiring must clear altnumber on caret
 * departure without the run resurrecting.
 */

import { requireDefined, testEnvironmentWithSpacing, viewOptions } from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState } from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  $isVerseNode,
  getMarker as bundledGetMarker,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
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

describe("verse \\va/\\vp deletion settles (does not resurrect)", () => {
  it("clears altnumber on caret departure after the whole \\va triplet is deleted", async () => {
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        "2",
        undefined,
      );
      const value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("va"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });

    // Re-query nodes each commit (Lexical merges/rebuilds detach cross-closure references).
    const $firstVerse = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    // Delete the whole \va triplet with the caret parked at the verse's end (the deletion site).
    await act(async () =>
      editor.update(() => {
        const verse = $firstVerse();
        const open = verse.getNextSibling();
        const value = open?.getNextSibling();
        const close = value?.getNextSibling();
        close?.remove();
        value?.remove();
        open?.remove();
        verse.select(verse.getTextContentSize(), verse.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits at the site: the sync did NOT re-derive the triplet, and
    // altnumber is still set (the deletion is pending, not settled).
    editor.getEditorState().read(() => {
      const v = $firstVerse();
      expect($isMarkerNode(v.getNextSibling())).toBe(false);
      expect(v.getAltnumber()).toBe("2");
    });

    // Caret departs to the second paragraph → the pending verse settles via Tier 2 re-tokenization.
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const settledVerse = $firstVerse();
      // altnumber cleared, and no \va triplet resurrected as the verse's next sibling.
      expect(settledVerse.getAltnumber()).toBeUndefined();
      expect($isMarkerNode(settledVerse.getNextSibling())).toBe(false);
    });
  });

  it("deleting only the VALUE settles to no altnumber + an empty char va span (no resurrect, no duplicate)", async () => {
    // The value-deletion resurrect/duplicate bug the tolerant-pieces model
    // ($verseAttributeRunPieces) fixes: the old all-or-nothing triplet read a value-deleted run
    // (opener + closer, value gone) as "no run at all" and re-derived a whole new
    // opener/value/closer over the surviving glyph debris. The tolerant scan recognizes the partial
    // state, graces it while the caret holds the opener's end, and settles it on departure to the
    // TJ/PT9 EMPTY form — the verse loses altnumber and a plain empty `char va` span (displayed
    // `\va \va*`) takes the run's place.
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        "2",
        undefined,
      );
      const value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("va"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });

    const $firstVerse = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
    const $firstPara = () => $getRoot().getChildren().filter($isParaNode)[0];
    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    // Remove ONLY the value TextNode (opener + closer glyphs left intact); park the caret at the end
    // of the opener glyph, where a delete-through-the-value leaves it. One discrete update so the
    // transform-pass grace check reliably sees the caret; grace assertions run synchronously after.
    editor.update(
      () => {
        const verse = $firstVerse();
        const open = verse.getNextSibling();
        const value = open?.getNextSibling();
        value?.remove();
        if (!$isMarkerNode(open)) throw new Error("opener glyph missing");
        open.select(open.getTextContentSize(), open.getTextContentSize());
      },
      { discrete: true },
    );

    // Grace holds: the value was NOT re-derived from altnumber (the closer sits immediately after
    // the opener — nothing resurrected between them), NO duplicate opener was inserted, altnumber
    // untouched.
    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const open = verse.getNextSibling();
      expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
      // The next sibling after the opener is the CLOSER (value gone, not resurrected).
      const afterOpen = open?.getNextSibling();
      expect($isMarkerNode(afterOpen) && afterOpen.getMarkerSyntax() === "closing").toBe(true);
      // Exactly one va opener among the paragraph's children — no duplicate run.
      const vaOpeners = $firstPara()
        .getChildren()
        .filter(
          (n) => $isMarkerNode(n) && n.getMarker() === "va" && n.getMarkerSyntax() === "opening",
        );
      expect(vaOpeners).toHaveLength(1);
      expect(verse.getAltnumber()).toBe("2");
    });

    // Caret departs → the pended verse settles via Tier 2: `\v 1 \va \va*` re-tokenizes to a verse
    // with NO altnumber plus an empty (explicitly closed) char va span in the run's place.
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      expect(verse.getAltnumber()).toBeUndefined();
      // An empty char va span sits after the verse (NOT a resurrected display run). Its live tree
      // carries the display glyphs + separator; its USJ form (below) is the clean empty element.
      const charVa = verse.getNextSibling();
      expect($isCharNode(charVa) && charVa.getMarker() === "va").toBe(true);
    });

    // The USJ output is the canonical empty form: the verse has NO altnumber, and a
    // `{ type:"char", marker:"va" }` element (no content) takes the run's place.
    initializeDeserialize(undefined);
    const usj = requireDefined(
      deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions),
      "deserialized USJ",
    );
    const firstParaContent = (usj.content[0] as { content: unknown[] }).content;
    expect(firstParaContent).toContainEqual({ type: "verse", marker: "v", number: "1" });
    expect(firstParaContent).toContainEqual({ type: "char", marker: "va" });
    // No altnumber survived anywhere.
    expect(JSON.stringify(usj)).not.toContain("altnumber");
  });

  it("the settled empty char va span is a Tier-2 fixed point (rebuild is a no-op)", async () => {
    // After the value-deletion settle, the verse + empty char va span must be a genuine Tier-2
    // fixed point: re-tokenizing `\v 1 \va\va*` reproduces exactly that shape, so `$rebuildParas`
    // refuses (returns false, mutating nothing). If the empty char folded back into a display run,
    // or altnumber re-appeared, the signatures would differ and the rebuild would churn.
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        "2",
        undefined,
      );
      const value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createMarkerNode("va"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });

    const $firstVerse = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
    const $firstPara = () => $getRoot().getChildren().filter($isParaNode)[0];
    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    // Delete the value and depart to settle into the empty-char shape.
    editor.update(
      () => {
        const verse = $firstVerse();
        const open = verse.getNextSibling();
        open?.getNextSibling()?.remove();
        if ($isMarkerNode(open)) open.select(open.getTextContentSize(), open.getTextContentSize());
      },
      { discrete: true },
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    // Now re-tokenize the settled paragraph directly: it must be a fixed point.
    const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };
    await act(async () =>
      editor.update(
        () => {
          expect($rebuildParas([$firstPara()], context)).toBe(false);
        },
        { discrete: true },
      ),
    );

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      expect(verse.getAltnumber()).toBeUndefined();
      const charVa = verse.getNextSibling();
      expect($isCharNode(charVa) && charVa.getMarker() === "va").toBe(true);
    });
  });
});
