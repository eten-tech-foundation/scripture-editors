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
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isDisplayOwnerPended,
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

  it("a legitimate local altnumber+pubnumber clear does not pend the owner (no stuck grace)", async () => {
    // The mutation listener that pends a display-run owner from a destroyed run PIECE
    // (MarkerEditPlugin.tsx's $pendOwnersOfDestroyed) also sees the sync's OWN legitimate
    // triplet removal as a "destroyed" mutation. Without the still-wanted exemption mirroring
    // the char span's, a verse whose altnumber/pubnumber were both genuinely cleared would sit
    // spuriously pended — and since $syncVerseAttributeDisplay now leaves a pended owner's run
    // alone (the guard added alongside $settlePendedDisplayOwner), a LATER legitimate altnumber
    // set would never heal into a visible \va run until an unrelated caret departure
    // re-tokenized whatever bytes happened to be on screen, silently dropping it.
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

    // Clear both fields directly, with no caret at the run's site — the sync heals the triplet
    // away in THIS commit, and that removal is exactly what the mutation listener observes.
    await act(async () =>
      editor.update(() => {
        const verse = $firstVerse();
        verse.setAltnumber(undefined);
        verse.setPubnumber(undefined);
      }),
    );

    editor.read(() => {
      expect($isDisplayOwnerPended($firstVerse())).toBe(false);
      expect($isMarkerNode($firstVerse().getNextSibling())).toBe(false);
    });

    // Prove the exemption actually matters: a LATER legitimate altnumber set must heal into a
    // visible \va run right away, not be blocked by a leftover spurious pend.
    await act(async () =>
      editor.update(() => {
        $firstVerse().setAltnumber("5");
      }),
    );

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const opener = verse.getNextSibling();
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
      const value = opener?.getNextSibling();
      expect($isTextNode(value) && value.getTextContent()).toBe(`${NBSP}5`);
    });
  });

  it("clearing ONE of altnumber/pubnumber while the other stays set does not spuriously pend the verse (per-field precision)", async () => {
    // The still-wanted exemption above (and MarkerEditPlugin's mirror of it) originally required
    // BOTH altnumber AND pubnumber to be undefined before exempting a destroyed run from the pend
    // — coarse, because a verse's \va and \vp triplets are two INDEPENDENT runs sharing one owner
    // identity. Clearing only altnumber legitimately destroys just the \va triplet in this commit;
    // requiring pubnumber (never touched) to ALSO be undefined would spuriously pend the verse and
    // — since $syncVerseAttributeDisplay leaves a pended owner's runs alone entirely — block a
    // LATER legitimate altnumber set from healing until an unrelated caret departure. The fix
    // classifies which field each destroyed piece belonged to and checks only THAT field.
    const { editor } = await testEnvironmentWithSpacing(() => {
      // Both fields set at construction: the VerseNode transform (TextSpacingPlugin's
      // $syncVerseAttributeDisplayNode) heals both the \va and \vp triplets on mount.
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", "3");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
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

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      expect(verse.getAltnumber()).toBe("2");
      expect(verse.getPubnumber()).toBe("3");
    });

    // Clear ONLY altnumber, with no caret at either run's site — the sync heals the \va triplet
    // away in THIS commit (destroying its glyphs/value); the \vp triplet is untouched.
    await act(async () =>
      editor.update(() => {
        $firstVerse().setAltnumber(undefined);
      }),
    );

    editor.read(() => {
      // Not spuriously pended: the destroyed pieces were all \va's, and altnumber IS now
      // undefined — a fully legitimate, still-wanted clear. The untouched (still-set) pubnumber
      // must not block recognizing that — the old both-fields-undefined check would have.
      expect($isDisplayOwnerPended($firstVerse())).toBe(false);
    });

    // Prove the exemption actually matters: a LATER legitimate altnumber set must heal into a
    // visible \va run right away, not be blocked by a leftover spurious pend.
    await act(async () =>
      editor.update(() => {
        $firstVerse().setAltnumber("9");
      }),
    );

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const opener = verse.getNextSibling();
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
      const value = opener?.getNextSibling();
      expect($isTextNode(value) && value.getTextContent()).toBe(`${NBSP}9`);
      // pubnumber, never touched, survived throughout.
      expect(verse.getPubnumber()).toBe("3");
    });
  });

  it("typing a value into an empty \\va span re-folds to altnumber on departure (TJ repro)", async () => {
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        undefined,
        undefined,
      );
      const span = $createCharNode("va"); // the settled empty form: displayed `\va \va*`
      span.append(
        $createMarkerNode("va"),
        $createTextNode(NBSP),
        $createMarkerNode("va", "closing"),
      );
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          span,
          $createTextNode("In the beginning"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });

    const $bodyTextNode = () => {
      const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
      if (!$isTextNode(body)) throw new Error("body text node missing");
      return body;
    };

    await act(async () =>
      editor.update(() => {
        const span = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
          "va span missing",
        );
        const content = span.getChildAtIndex(1); // the NBSP separator text
        if (!$isTextNode(content)) throw new Error("span content missing");
        content.setTextContent(`${NBSP}3`); // the user types the value
        content.select(2, 2);
      }),
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const verse = requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );
      expect(verse.getAltnumber()).toBe("3"); // re-folded
      const open = verse.getNextSibling(); // canonical triplet re-materialized
      expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
      // and the source span is gone (folded into the verse)
      expect($getRoot().getChildren().filter($isParaNode)[0].getChildren().some($isCharNode)).toBe(
        false,
      );
    });
  });
});
