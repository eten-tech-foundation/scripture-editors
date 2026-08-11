/**
 * Integration regression for verse `\va`/`\vp` attribute-run deletion. Mounts BOTH the marker-edit
 * engine (pend/settle) and TextSpacingPlugin (the self-healing display-run sync) — the real app's
 * plugin stack — because the bug lives in their interaction: deleting the whole triplet left
 * altnumber set, and the sync re-derived the triplet from it, so the deletion visibly undid itself
 * and never settled. The grace + pend + settle-on-departure wiring must clear altnumber on caret
 * departure without the run resurrecting.
 */

import {
  $appendVerseAttributeRun,
  requireDefined,
  testEnvironmentWithSpacing,
  viewOptions,
} from "./markerEdit.test-helpers";
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
  $isAttributeRunNode,
  $isCharNode,
  $isDisplayOwnerPended,
  $isMarkerNode,
  $isParaNode,
  $isVerseNode,
  $verseAttributeRunPieces,
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
      $appendVerseAttributeRun(verse, "va", "2");
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

    // Delete the whole \va triplet — wrapped in ONE attribute-run node, the shape the sync always
    // heals to — with the caret parked at the verse's end (the deletion site).
    await act(async () =>
      editor.update(() => {
        const verse = $firstVerse();
        const wrapper = verse.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("\\va wrapper missing");
        wrapper.remove();
        verse.select(verse.getTextContentSize(), verse.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits at the site: the sync did NOT re-derive the triplet, and
    // altnumber is still set (the deletion is pending, not settled). A resurrected run is always an
    // AttributeRunNode wrapper post-flip, never a bare MarkerNode, so the no-resurrect guard checks
    // for a run's OPENER piece (present regardless of wrapped/loose shape) rather than the
    // next-sibling's own node type.
    editor.getEditorState().read(() => {
      const v = $firstVerse();
      expect($verseAttributeRunPieces(v, "va").opener).toBeUndefined();
      expect(v.getAltnumber()).toBe("2");
    });

    // Caret departs to the second paragraph → the pending verse settles via Tier 2 re-tokenization.
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const settledVerse = $firstVerse();
      // altnumber cleared, and no \va triplet resurrected as the verse's next sibling.
      expect(settledVerse.getAltnumber()).toBeUndefined();
      expect($verseAttributeRunPieces(settledVerse, "va").opener).toBeUndefined();
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
      $appendVerseAttributeRun(verse, "va", "2");
    });

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

    // Remove ONLY the value TextNode from INSIDE the wrapper (opener + closer glyphs left intact);
    // park the caret at the end of the opener glyph, where a delete-through-the-value leaves it.
    // One discrete update so the transform-pass grace check reliably sees the caret; grace
    // assertions run synchronously after.
    editor.update(
      () => {
        const verse = $firstVerse();
        const { value } = $verseAttributeRunPieces(verse, "va");
        value?.remove();
        const { opener } = $verseAttributeRunPieces(verse, "va");
        if (!opener) throw new Error("opener glyph missing");
        opener.select(opener.getTextContentSize(), opener.getTextContentSize());
      },
      { discrete: true },
    );

    // Grace holds: the value was NOT re-derived from altnumber (the closer sits immediately after
    // the opener, inside the wrapper — nothing resurrected between them), NO duplicate opener was
    // inserted, altnumber untouched.
    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const { opener, closer, wrapper } = $verseAttributeRunPieces(verse, "va");
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
      // The closer sits immediately after the opener inside the wrapper (value gone, not
      // resurrected).
      expect($isMarkerNode(closer) && closer.getMarkerSyntax() === "closing").toBe(true);
      // Exactly one va opener inside the wrapper — no duplicate run.
      if (!wrapper) throw new Error("\\va wrapper missing");
      const vaOpeners = wrapper
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
      $appendVerseAttributeRun(verse, "va", "2");
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

    // Delete the value (from inside the wrapper) and depart to settle into the empty-char shape.
    editor.update(
      () => {
        const verse = $firstVerse();
        const { opener, value } = $verseAttributeRunPieces(verse, "va");
        value?.remove();
        if (opener) opener.select(opener.getTextContentSize(), opener.getTextContentSize());
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
      $appendVerseAttributeRun(verse, "va", "2");
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
      // A resurrected run is always an AttributeRunNode wrapper post-flip, never a bare MarkerNode —
      // check for the run's OPENER piece instead (present regardless of wrapped/loose shape).
      expect($verseAttributeRunPieces($firstVerse(), "va").opener).toBeUndefined();
    });

    // Prove the exemption actually matters: a LATER legitimate altnumber set must heal into a
    // visible \va run right away, not be blocked by a leftover spurious pend — repairing INSIDE
    // the emptied husk wrapper the legitimate clear above left behind.
    await act(async () =>
      editor.update(() => {
        $firstVerse().setAltnumber("5");
      }),
    );

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const { opener, value } = $verseAttributeRunPieces(verse, "va");
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
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
      const { opener, value } = $verseAttributeRunPieces(verse, "va");
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
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
      // Canonical triplet re-materialized via Tier-2's rebuild, wrapped in ONE attribute-run node
      // — the shape the adaptor's own fragment materializer always builds.
      const { opener, wrapper } = $verseAttributeRunPieces(verse, "va");
      expect($isAttributeRunNode(wrapper)).toBe(true);
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
      // and the source span is gone (folded into the verse)
      expect($getRoot().getChildren().filter($isParaNode)[0].getChildren().some($isCharNode)).toBe(
        false,
      );
    });
  });

  it("crosses a WRAPPED \\va to find the owning verse when re-driving a LOOSE \\vp's caret-held pend (mixed shape)", async () => {
    // A mixed va-wrapped/vp-loose tree is transient post-flip (the next sync pass heals the loose
    // \vp forward into its own wrapper), but transient still means REAL for one commit — e.g. an
    // undo-restored pre-flip state, or a partial collab materialization. $verseOfAttributeGlyph's
    // walk-back (MarkerEditPlugin.tsx) must cross the WRAPPED \va to reach the owning verse when
    // re-driving the pend off a dirtied LOOSE \vp glyph — without that, the pend is silently lost
    // and a caret-held \vp edit would resurrect on departure instead of settling, exactly the bug
    // class $verseOfAttributeSourceText/$ownerOfRunPiece already guard against for the SOURCE-SPAN
    // and DESTROYED-piece classifiers.
    //
    // Establishing the mixed shape (below) necessarily dirties the \va wrapper too (Lexical's
    // sibling list touches both neighbors of an insertion point), which independently pends the
    // verse via the ALREADY-correct AttributeRunNode transform ($ownerOfAttributeRunWrapper) — not
    // the function under test here. The caret is parked on the loose \vp's value WITHOUT diverging
    // it, so that construction commit's pend check ($hasCaretHeldVerseAttributeRun, which requires
    // genuine divergence) stays false: mid-edit grace alone blocks the heal, the verse stays
    // UNPENDED, and the mixed shape survives. Only the SEPARATE, later commit below — which
    // diverges the loose \vp's value IN PLACE and explicitly dirties its still-loose opener glyph,
    // never touching the verse or the \va wrapper — can explain a pend from there on, isolating
    // $verseOfAttributeGlyph's own contribution.
    const { editor } = await testEnvironmentWithSpacing(() => {
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
      const vaWrapper = $appendVerseAttributeRun(verse, "va", "2");
      const vpOpener = $createMarkerNode("vp");
      const vpValue = $createTextNode(`${NBSP}3`); // matches pubnumber exactly — no divergence
      $setState(vpValue, textTypeState, "attribute");
      const vpCloser = $createMarkerNode("vp", "closing");
      vaWrapper.insertAfter(vpOpener);
      vpOpener.insertAfter(vpValue);
      vpValue.insertAfter(vpCloser);
      // Caret parked on the (non-diverging) loose value: mid-edit grace alone blocks the
      // construction commit's own healing attempt, without registering a pend.
      vpValue.select(vpValue.getTextContentSize(), vpValue.getTextContentSize());
    });

    const $firstVerse = () =>
      requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
        "verse missing",
      );

    editor.read(() => {
      const verse = $firstVerse();
      const vaWrapper = $verseAttributeRunPieces(verse, "va").wrapper;
      if (!vaWrapper) throw new Error("\\va wrapper missing after mount");
      const vpPieces = $verseAttributeRunPieces(vaWrapper, "vp");
      expect(vpPieces.wrapper).toBeUndefined(); // \vp survived mount genuinely loose
      expect($isMarkerNode(vpPieces.opener) && vpPieces.opener.getMarker() === "vp").toBe(true);
      expect($isDisplayOwnerPended(verse)).toBe(false); // no divergence yet — nothing pended
    });

    // Diverge the loose \vp's value IN PLACE (never removed — a destroyed run piece would ALSO
    // pend via the already-correct mutation-listener path, $ownerOfRunPiece, masking whether THIS
    // fix matters) and explicitly dirty the (still loose)
    // opener glyph — the trigger MarkerEditPlugin's registered MarkerNode transform reacts to.
    // Nothing here touches the verse or the \va wrapper.
    editor.update(
      () => {
        const verse = $firstVerse();
        const vaWrapper = $verseAttributeRunPieces(verse, "va").wrapper;
        if (!vaWrapper) throw new Error("\\va wrapper missing");
        const { opener, value } = $verseAttributeRunPieces(vaWrapper, "vp");
        if (!opener || !value) throw new Error("loose \\vp opener/value missing");
        value.setTextContent(`${NBSP}4`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
        opener.getWritable();
      },
      { discrete: true },
    );

    // The verse was found and pended from the dirtied loose \vp glyph alone — proof the
    // walk-back crossed the wrapped \va in one step rather than stopping at it. Read
    // synchronously, before MarkerEditPlugin's deferred settle microtask could resolve the pend.
    editor.read(() => {
      expect($isDisplayOwnerPended($firstVerse())).toBe(true);
    });
  });

  it("typing a value into an empty \\vp span behind a WRAPPED \\va run re-folds to pubnumber on departure", async () => {
    // The wrapper-migration gap this pin closes: post-migration, an altnumber-bearing verse's
    // \va run is ALWAYS wrapped (never loose) — the only shape such a verse can have — so a
    // settled-empty \vp span typed into behind it must walk PAST the whole AttributeRunNode
    // wrapper in one hop to find its owning verse ($verseOfAttributeSourceText's
    // $isAttributeRunNode isRunPiece disjunct). Without that disjunct the walk stops at the
    // wrapper, the typed value never pends, and pubnumber never folds — the exact silent-no-fold
    // failure the TJ-repro pin above fixed, reachable again for this shape.
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "1",
        getVisibleOpenMarkerText("v", "1"),
        undefined,
        "2",
        undefined,
      );
      const span = $createCharNode("vp"); // the settled empty form: displayed `\vp \vp*`
      span.append(
        $createMarkerNode("vp"),
        $createTextNode(NBSP),
        $createMarkerNode("vp", "closing"),
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
      // Inserted after construction so it lands directly after `verse` and before `span`, giving
      // the target shape: verse -> WRAPPED \va run -> settled-empty \vp span.
      $appendVerseAttributeRun(verse, "va", "2");
    });

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

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      const { wrapper } = $verseAttributeRunPieces(verse, "va");
      expect($isAttributeRunNode(wrapper)).toBe(true);
      expect(wrapper?.getNextSibling() && $isCharNode(wrapper.getNextSibling())).toBe(true);
    });

    await act(async () =>
      editor.update(() => {
        const span = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
          "vp span missing",
        );
        const content = span.getChildAtIndex(1); // the NBSP separator text
        if (!$isTextNode(content)) throw new Error("span content missing");
        content.setTextContent(`${NBSP}4`); // the user types the value
        content.select(2, 2);
      }),
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));

    editor.getEditorState().read(() => {
      const verse = $firstVerse();
      expect(verse.getAltnumber()).toBe("2"); // untouched
      expect(verse.getPubnumber()).toBe("4"); // re-folded
      // Canonical \vp triplet re-materialized via Tier-2's rebuild, wrapped in ONE
      // attribute-run node chained after the \va wrapper — the shape the adaptor's own
      // fragment materializer always builds.
      const { wrapper: vaWrapper } = $verseAttributeRunPieces(verse, "va");
      if (!vaWrapper) throw new Error("\\va wrapper missing");
      const { opener, wrapper: vpWrapper } = $verseAttributeRunPieces(vaWrapper, "vp");
      expect($isAttributeRunNode(vpWrapper)).toBe(true);
      expect($isMarkerNode(opener) && opener.getMarker() === "vp").toBe(true);
      // and the source span is gone (folded into the verse)
      expect($getRoot().getChildren().filter($isParaNode)[0].getChildren().some($isCharNode)).toBe(
        false,
      );
    });
  });
});
