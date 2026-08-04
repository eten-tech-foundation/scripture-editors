/**
 * Integration regression for the milestone display-run self-heal. The collab materializer
 * ($createMilestone, delta-apply-update.utils.ts) builds a BARE MilestoneNode with no display-run
 * siblings — before the self-heal transform (attributeDisplay.utils.ts's
 * $syncMilestoneDisplayRun, registered on MilestoneNode in MarkerEditPlugin.tsx), such a milestone
 * stayed a Tier-2 sentinel forever (tier2Rebuild.utils.ts's run.length > 0 guard): never editable,
 * never re-tokenizable. These tests prove: (1) a bare milestone heals into a full display run and
 * re-tokenizes through Tier 2 as ordinary content; (2) the settle rule is uniform — the DISPLAYED
 * BYTES win, so a remote field change that arrived while the caret held the run loses locally and
 * the user's typed bytes are never clobbered mid-sweep; (3) deleting the whole run (the
 * milestone's entire byte representation) deletes the milestone rather than resurrecting the run.
 *
 * Environment note: jsdom's selection reconciliation is unreliable across commits — a
 * programmatically placed caret can be yanked to an unrelated node by a follow-on native
 * selectionchange echo. Grace-dependent assertions therefore run SYNCHRONOUSLY after a discrete
 * update (before the deferred resolution microtask can fire), and every settle assertion is
 * phantom-independent: it holds whether the pended milestone settles via the scripted departure
 * or via an earlier echo-induced caret move.
 */

import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import {
  initialize as initializeSerialize,
  reset as resetSerialize,
} from "../adaptors/usj-editor.adaptor";
import { requireDefined, testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { $createMarkerPrefix } from "./markerEditDeletion.utils";
import { $resolvePendingMarkers, MarkerEditContext } from "./markerEditTier1.utils";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, TextNode } from "lexical";
import {
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  MilestoneNode,
  NBSP,
  ParaNode,
  textTypeState,
  TypedMarkNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { usjReactNodes } from "shared-react";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; a commit that touches selection
// (Tier 2's own restore-selection-at-offset) gives the editor root DOM focus, and Lexical's
// post-commit scroll-into-view reads a Range rect. Stub it (a zero rect nothing here asserts on),
// same as the sibling marker-edit tests.
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

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

function $lastPara(): ParaNode {
  const paras = $getRoot().getChildren().filter($isParaNode);
  return paras[paras.length - 1];
}

function $firstPara(): ParaNode {
  return $getRoot().getChildren().filter($isParaNode)[0];
}

function $milestoneInFirstPara(): MilestoneNode {
  return requireDefined($firstPara().getChildren().find($isMilestoneNode), "milestone missing");
}

/** The milestone's attribute display TextNode (the run's middle piece), re-queried per commit. */
function $attributeRun(): TextNode {
  const opening = $milestoneInFirstPara().getNextSibling();
  const run = opening?.getNextSibling();
  if (!$isTextNode(run) || $isMarkerNode(run)) throw new Error("attribute run missing");
  return run;
}

/** The second paragraph's body text node — the caret-departure target. */
function $bodyText(): TextNode {
  const paras = $getRoot().getChildren().filter($isParaNode);
  const body = paras[1]?.getLastChild();
  if (!$isTextNode(body)) throw new Error("body text node missing");
  return body;
}

/** Two paragraphs: "before <ms qt-s sid=q1> after" and a plain "body" paragraph to depart to. */
function $twoParaFixture(): void {
  const [glyph, separator] = $createMarkerPrefix("p");
  const [glyph2, separator2] = $createMarkerPrefix("p");
  $getRoot().append(
    $createParaNode("p").append(
      glyph,
      separator,
      $createTextNode("before "),
      $createMilestoneNode("qt-s", "q1"),
      $createTextNode(" after"),
    ),
    $createParaNode("p").append(glyph2, separator2, $createTextNode("body")),
  );
}

describe("collab-materialized milestone settles into a re-tokenizable run", () => {
  it("heals on construction, then re-tokenizes through Tier 2 as a genuine fixed point", async () => {
    // Step 1: mount with ONLY the bare milestone (no other literal marker text anywhere in the
    // paragraph) — nothing else in this commit can trigger an automatic Tier-2 rebuild, so the
    // milestone's key here is reliably its ORIGINAL, self-heal-only state.
    const { editor } = await testEnvironment(() => {
      const [glyph, separator] = $createMarkerPrefix("p");
      const milestone = $createMilestoneNode("qt-s", "q1");
      $getRoot().append(
        $createParaNode("p").append(glyph, separator, $createTextNode("before "), milestone),
      );
    });

    // The self-heal transform ran on construction (a freshly created MilestoneNode is dirty): the
    // bare milestone now carries a full display run, the same shape usj-editor.adaptor builds.
    const originalKey = editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex($isMilestoneNode);
      expect(msIndex).toBeGreaterThanOrEqual(0);
      expect(children[msIndex + 1]?.getTextContent()).toBe("\\qt-s");
      expect(children[msIndex + 2]?.getTextContent()).toBe(`${NBSP}|sid="q1"`);
      expect(children[msIndex + 3]?.getTextContent()).toBe("\\*");
      return children[msIndex]?.getKey();
    });

    // Step 2: append a literal char marker AFTER the milestone's now-healed run, in a SEPARATE
    // commit. The marker-edit engine's own TextNode catch-all ($textNodeTier2Transform) fires
    // automatically on this literal and drives a Tier-2 rebuild of the whole paragraph within the
    // SAME commit — the real end-to-end path (typing), not a manually invoked one. That rebuild
    // re-tokenizes the healed milestone's run as ORDINARY content alongside the literal: the
    // milestone comes out the other side as a FRESH node from the re-parsed fragment, not the same
    // preserved-sentinel instance (mirrors tier2Rebuild.utils.test.tsx's "a milestone whose marker
    // cannot be classified stays atomic" test, which asserts the OPPOSITE — same key — for the
    // still-unrecognized-marker case).
    await act(async () =>
      editor.update(
        () => {
          const children = $lastPara().getChildren();
          const closingGlyph = children.find(
            (node) => $isTextNode(node) && node.getTextContent() === "\\*",
          );
          closingGlyph?.insertAfter($createTextNode(" \\nd x\\nd* after"));
        },
        { discrete: true },
      ),
    );

    let settledKey = "";
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msNode = requireDefined(
        children.find($isMilestoneNode),
        "milestone missing after rebuild",
      );
      settledKey = msNode.getKey();
      expect(settledKey).not.toBe(originalKey);
      expect(msNode.getSid()).toBe("q1");
      // The literal alongside it re-tokenized too — proof this was a real Tier-2 rebuild, not a
      // no-op that happened to leave the milestone looking different for some other reason.
      expect(children.some((node) => $isCharNode(node) && node.getMarker() === "nd")).toBe(true);
    });

    // Fixed point: rebuilding again with nothing left to change makes no further edits.
    await act(async () =>
      editor.update(
        () => {
          expect($rebuildParas([$lastPara()], context)).toBe(false);
        },
        { discrete: true },
      ),
    );

    editor.getEditorState().read(() => {
      const msNode = requireDefined(
        $lastPara().getChildren().find($isMilestoneNode),
        "milestone missing after the fixed-point rebuild",
      );
      expect(msNode.getKey()).toBe(settledKey);
    });
  });

  it("a remote field update under caret grace loses to the displayed bytes on settle", async () => {
    // A remote collab update rewrites the milestone's fields while the local caret holds the
    // display run. The mid-edit grace must leave the DISPLAYED bytes untouched at the moment the
    // update lands, and the eventual settle (caret departure) must apply the uniform rule: the
    // displayed bytes win — Tier-2 re-tokenizes what the user sees, so the remote field value
    // loses locally (it converges through the normal save/OT path), and the run's bytes are
    // never rewritten from the milestone's fields.
    const { editor } = await testEnvironment($twoParaFixture);

    editor.getEditorState().read(() => {
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });

    // Caret into the run and the remote field write land in ONE discrete update, so the grace
    // check inside this commit's transform pass reliably sees the caret (jsdom cannot echo the
    // selection away mid-commit). Assertions run synchronously after the commit, BEFORE the
    // deferred resolution microtask can settle anything.
    editor.update(
      () => {
        const run = $attributeRun();
        run.select(run.getTextContentSize(), run.getTextContentSize());
        $milestoneInFirstPara().setSid("q9");
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      // Grace held: the displayed bytes were NOT rewritten from the remote fields.
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
      expect($milestoneInFirstPara().getSid()).toBe("q9");
    });

    // Caret departs; the pended milestone settles. Whether the settle fires on this scripted
    // departure or on an earlier jsdom selection echo, the outcome must be the same: the
    // displayed bytes re-tokenize back into the milestone's fields.
    await act(async () => editor.update(() => $bodyText().select(0, 0)));

    editor.getEditorState().read(() => {
      expect($milestoneInFirstPara().getSid()).toBe("q1");
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });
    // The remote value lost locally — it must appear nowhere in the settled state.
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain("q9");
  });

  // The both-keys race, driven deterministically through the REAL settle sweep
  // ($resolvePendingMarkers → Tier-2): a remote update landed under grace (pending the
  // MILESTONE's key, fields = remote value) while the user had edited the run's text (pending
  // the RUN's key, bytes = user value). jsdom's unreliable cross-commit selection echo makes the
  // multi-commit pend choreography unscriptable at the plugin level, so the sweep is driven
  // directly with an explicitly ordered pend set — both orderings, since a settle that rewrote
  // the run from the milestone's fields would clobber the user's bytes when the milestone key
  // comes first. (The plugin-level pend wiring itself is covered by the grace test above and the
  // deletion test below.)
  describe.each([
    ["milestone key first", true],
    ["run key first", false],
  ])("settle sweep with both keys pended (%s)", (_label, milestoneFirst) => {
    it("settles the USER'S edited bytes into the milestone fields, clobbering nothing", () => {
      initializeSerialize(undefined, undefined);
      resetSerialize();
      const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
      let msKey = "";
      let runKey = "";
      editor.update(
        () => {
          const [glyph, separator] = $createMarkerPrefix("p");
          // The milestone's FIELDS hold the remote value that landed under grace…
          const milestone = $createMilestoneNode("qt-s", "q9");
          msKey = milestone.getKey();
          const opening = $createMarkerNode("qt-s", "opening");
          // …while the displayed run holds the USER'S edited bytes.
          const run = $createTextNode(`${NBSP}|sid="q1-user"`);
          $setState(run, textTypeState, "attribute");
          runKey = run.getKey();
          const closer = $createMarkerNode("", "selfClosing");
          $getRoot().append(
            $createParaNode("p").append(
              glyph,
              separator,
              $createTextNode("before "),
              milestone,
              opening,
              run,
              closer,
              $createTextNode(" after"),
            ),
          );
        },
        { discrete: true },
      );

      const settleContext: MarkerEditContext = {
        viewOptions,
        getMarker: bundledGetMarker,
        pendingKeys: new Set(milestoneFirst ? [msKey, runKey] : [runKey, msKey]),
        splitExpected: { current: false },
        rebuildAttempted: new Set(),
      };
      editor.update(
        () => {
          $resolvePendingMarkers(settleContext);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const msNode = requireDefined(
          $firstPara().getChildren().find($isMilestoneNode),
          "milestone missing after settle",
        );
        expect(msNode.getSid()).toBe("q1-user");
        expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1-user"`);
      });
      // The remote value must not have clobbered the run at any point in the sweep: had it been
      // written into the run before the run's own key re-tokenized, it would have settled into
      // the fields and appear here.
      expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain("q9");
    });
  });

  it("deleting ONLY the attribute text clears the milestone's fields on caret departure (no resurrection)", async () => {
    // Deleting just the run's attribute TextNode (both glyphs left intact) must, on caret
    // departure, settle the milestone to NO attributes: Tier-2 re-tokenizes `\qt-s \*` (no
    // attribute bytes) into a milestone with sid/eid/unknownAttributes cleared — NOT silently
    // resurrect `|sid="q1"` from the milestone's still-set fields. Removing a sibling TextNode
    // never dirties the DecoratorNode-based MilestoneNode, so its own transform never fires; the
    // deletion must still find a pend path (off the flanking glyph the removal DOES dirty), and
    // the grace must hold while the caret sits at the opening glyph's own end — where a
    // delete-through-the-run leaves it.
    const { editor } = await testEnvironment($twoParaFixture);

    editor.getEditorState().read(() => {
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });

    // Remove ONLY the attribute TextNode; park the caret at the end of the opening glyph, all in
    // one discrete update so the transform-pass grace check reliably sees the caret. Grace
    // assertions run synchronously after the commit, BEFORE the deferred resolution microtask.
    editor.update(
      () => {
        const msNode = $milestoneInFirstPara();
        const opening = msNode.getNextSibling();
        const attribute = opening?.getNextSibling();
        attribute?.remove();
        if (!$isMarkerNode(opening)) throw new Error("opening glyph missing");
        opening.select(opening.getTextContentSize(), opening.getTextContentSize());
      },
      { discrete: true },
    );

    // Grace holds while the caret sits at the site: the attribute run was NOT rebuilt from the
    // fields (the self-closing glyph sits immediately after the opening glyph), and the
    // milestone's own fields are untouched (the deletion is pending, not settled).
    editor.getEditorState().read(() => {
      const msNode = $milestoneInFirstPara();
      const afterOpening = msNode.getNextSibling()?.getNextSibling();
      expect($isMarkerNode(afterOpening) && afterOpening.getMarkerSyntax() === "selfClosing").toBe(
        true,
      );
      expect(msNode.getSid()).toBe("q1");
    });

    // Caret departs → the pended milestone settles via Tier-2: `\qt-s \*` re-tokenizes to a
    // milestone with no attributes, so sid/unknownAttributes clear and the run does not resurrect.
    // (Phantom-independent: an earlier jsdom selection echo settling it sooner clears it too.)
    await act(async () => editor.update(() => $bodyText().select(0, 0)));

    editor.getEditorState().read(() => {
      const msNode = $milestoneInFirstPara();
      expect(msNode.getSid()).toBeUndefined();
      expect(msNode.getUnknownAttributes()).toBeUndefined();
      // The milestone survives with its glyphs, but no attribute run resurrected between them.
      const afterOpening = msNode.getNextSibling()?.getNextSibling();
      expect($isMarkerNode(afterOpening) && afterOpening.getMarkerSyntax() === "selfClosing").toBe(
        true,
      );
    });
    // The resurrected value must appear nowhere in the settled state.
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain("q1");
  });

  it("deleting the whole display run deletes the milestone on caret departure (no resurrection)", async () => {
    // The run is the milestone's ENTIRE visible byte representation — deleting all of it must
    // delete the milestone, exactly as deleting every byte of any other construct removes it.
    // Without the deleted-run grace the sync would rebuild the run from the milestone's intact
    // fields the instant the glyph deletion dirtied it, making the run undeletable.
    const { editor } = await testEnvironment($twoParaFixture);

    editor.getEditorState().read(() => {
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });

    // Delete the whole run with the caret parked at the deletion site (end of the text before
    // the milestone — where a backspace-through-the-run deletion leaves it), all in one discrete
    // update so the transform-pass grace check reliably sees the caret. Grace assertions run
    // synchronously after the commit, BEFORE the deferred resolution microtask can settle.
    editor.update(
      () => {
        const msNode = $milestoneInFirstPara();
        const opening = msNode.getNextSibling();
        const attribute = opening?.getNextSibling();
        const closer = attribute?.getNextSibling();
        closer?.remove();
        attribute?.remove();
        opening?.remove();
        const previous = msNode.getPreviousSibling();
        if (!$isTextNode(previous)) throw new Error("text before milestone missing");
        previous.select(previous.getTextContentSize(), previous.getTextContentSize());
      },
      { discrete: true },
    );

    // Grace holds while the caret sits at the site: no resurrection, milestone still attached.
    editor.getEditorState().read(() => {
      const msNode = $milestoneInFirstPara();
      expect($isMarkerNode(msNode.getNextSibling())).toBe(false);
      expect(msNode.getNextSibling()?.getTextContent()).toBe(" after");
    });

    // Caret departs → the pended milestone settles: all its bytes are gone, so it is removed.
    // (Phantom-independent: an earlier jsdom selection echo settling it sooner removes it too.)
    await act(async () => editor.update(() => $bodyText().select(0, 0)));

    editor.getEditorState().read(() => {
      expect($firstPara().getChildren().some($isMilestoneNode)).toBe(false);
    });
    // And it is gone from the editor→USJ output too, not just the live tree.
    initializeDeserialize(undefined);
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    expect(JSON.stringify(usj)).not.toContain('"type":"ms"');
  });
});
