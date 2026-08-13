/**
 * Integration regression for the milestone display-run self-heal. The collab materializer
 * ($createMilestone, delta-apply-update.utils.ts) builds a BARE MilestoneNode with no display-run
 * siblings — before the self-heal (the shared $syncDisplayRun driver, displayRunSync.utils.ts,
 * parameterized by the milestone descriptor and registered on MilestoneNode in
 * MarkerEditPlugin.tsx), such a milestone stayed a Tier-2 sentinel forever (tier2Rebuild.utils.ts's
 * run.length > 0 guard): never editable, never re-tokenizable. These tests prove: (1) a bare
 * milestone heals into a full display run and re-tokenizes through Tier 2 as ordinary content; (2)
 * the settle rule is uniform — the DISPLAYED BYTES win, so a remote field change that arrived while
 * the caret held the run loses locally and the user's typed bytes are never clobbered mid-sweep;
 * (3) deleting the whole run (the milestone's entire byte representation) deletes the milestone
 * rather than resurrecting the run; (4) a complete but caret-held-loose run migrates into its
 * `AttributeRunNode` wrapper on caret departure rather than being left loose forever; (5) that same
 * whole-run deletion still deletes the milestone even when it carried NO attribute text to begin
 * with — a milestone's glyph pair is unconditional, so "no attribute text" must never be read as
 * "no run wanted".
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
import {
  $appendMilestoneRun,
  requireDefined,
  testEnvironment,
  viewOptions,
} from "./markerEdit.test-helpers";
import { $createMarkerPrefix } from "./markerEditDeletion.utils";
import { COMMIT_PENDING_MARKERS_COMMAND } from "./MarkerEditPlugin";
import { $resolvePendingMarkers, MarkerEditContext } from "./markerEditTier1.utils";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, TextNode } from "lexical";
import {
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $isAttributeRunNode,
  $isCharNode,
  $isDisplayOwnerPended,
  $isMarkerNode,
  $isMilestoneNode,
  $isParaNode,
  $milestoneAttributeRunPieces,
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

/** The milestone's attribute display TextNode (the run's middle piece), re-queried per commit —
 * via {@link $milestoneAttributeRunPieces}, so this helper reads correctly whether the run rides
 * loose or (the shape the sync always heals forward to) inside an `AttributeRunNode` wrapper. */
function $attributeRun(): TextNode {
  const { attribute } = $milestoneAttributeRunPieces($milestoneInFirstPara());
  if (!attribute) throw new Error("attribute run missing");
  return attribute;
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
    // bare milestone now carries a full display run wrapped in ONE attribute-run node, the same
    // shape usj-editor.adaptor builds.
    const originalKey = editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex($isMilestoneNode);
      expect(msIndex).toBeGreaterThanOrEqual(0);
      const wrapper = children[msIndex + 1];
      if (!$isAttributeRunNode(wrapper)) throw new Error("milestone wrapper missing");
      expect(wrapper.getChildAtIndex(0)?.getTextContent()).toBe("\\qt-s");
      expect(wrapper.getChildAtIndex(1)?.getTextContent()).toBe(`${NBSP}|sid="q1"`);
      expect(wrapper.getChildAtIndex(2)?.getTextContent()).toBe("\\*");
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
          const { closing } = $milestoneAttributeRunPieces($milestoneInFirstPara());
          closing?.insertAfter($createTextNode(" \\nd x\\nd* after"));
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

    // Splice guard sanity: a real caret departure through the ENGINE'S OWN pend/settle path (not
    // the direct $rebuildParas probe above) must ALSO be a no-op — proving the Tier-2 splice left
    // no stray key in `context.pendingKeys` that could drive a SECOND visible mutation once the
    // caret actually moves. Depart into the trailing " after" text the rebuild produced, well away
    // from the milestone's own run.
    const beforeDepartureText = editor.getEditorState().read(() => $lastPara().getTextContent());
    await act(async () =>
      editor.update(() => {
        const trailing = $lastPara()
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent().includes("after"));
        if (!$isTextNode(trailing)) throw new Error("trailing text missing");
        trailing.select(trailing.getTextContentSize(), trailing.getTextContentSize());
      }),
    );
    // Flush the deferred resolution microtask (MarkerEditPlugin's update listener queues the
    // engine's own settle there).
    await act(async () => {
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    });

    editor.getEditorState().read(() => {
      const msNode = requireDefined(
        $lastPara().getChildren().find($isMilestoneNode),
        "milestone missing after departure",
      );
      // Same instance, byte-identical paragraph: the departure settled nothing — no stray pend
      // survived the splice to drive a second rebuild.
      expect(msNode.getKey()).toBe(settledKey);
      expect($lastPara().getTextContent()).toBe(beforeDepartureText);
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
          $getRoot().append(
            $createParaNode("p").append(
              glyph,
              separator,
              $createTextNode("before "),
              milestone,
              $createTextNode(" after"),
            ),
          );
          // …while the displayed run — wrapped, the shape every run heals to — holds the USER'S
          // edited bytes.
          const wrapper = $appendMilestoneRun(milestone, `${NBSP}|sid="q1-user"`);
          const run = wrapper.getChildAtIndex(1);
          if (!$isTextNode(run)) throw new Error("attribute run missing");
          runKey = run.getKey();
        },
        { discrete: true },
      );

      const settleContext: MarkerEditContext = {
        viewOptions,
        getMarker: bundledGetMarker,
        pendingKeys: new Set(milestoneFirst ? [msKey, runKey] : [runKey, msKey]),
        splitExpected: { current: false },
        pasteRebuildArmed: { current: false },
        rebuildAttempted: new Set(),
        isStructureProtected: false,
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
        const { opening, attribute } = $milestoneAttributeRunPieces($milestoneInFirstPara());
        attribute?.remove();
        if (!opening) throw new Error("opening glyph missing");
        opening.select(opening.getTextContentSize(), opening.getTextContentSize());
      },
      { discrete: true },
    );

    // Grace holds while the caret sits at the site: the attribute run was NOT rebuilt from the
    // fields (the self-closing glyph sits immediately after the opening glyph, inside the
    // wrapper), and the milestone's own fields are untouched (the deletion is pending, not
    // settled).
    editor.getEditorState().read(() => {
      const { closing } = $milestoneAttributeRunPieces($milestoneInFirstPara());
      expect($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing").toBe(true);
      expect($milestoneInFirstPara().getSid()).toBe("q1");
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
      const { closing } = $milestoneAttributeRunPieces(msNode);
      expect($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing").toBe(true);
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
        // The bare-milestone fixture was already healed forward into a wrapper by the mount-time
        // transform pass (a fresh MilestoneNode is dirty at creation) — delete the whole run by
        // removing that wrapper.
        const msNode = $milestoneInFirstPara();
        const wrapper = msNode.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("milestone wrapper missing");
        wrapper.remove();
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

  it("migrates a complete but caret-held-loose run into its wrapper on departure (migration-pend behavior)", async () => {
    // A complete-but-still-LOOSE run (bytes already canonical, only its AttributeRunNode wrapper
    // missing) is pended on caret-held mid-edit grace and DELIVERS the wrap migration on the next
    // departure. $settlePendedDisplayOwner's milestone arm (markerEditTier1.utils.ts) recognizes
    // exactly this divergence shape ($runNeedsOnlyWrapMigration, displayRunSync.utils.ts) and
    // calls the shared $syncDisplayRun driver directly, rather than falling through to the Tier-2
    // rebuild probe — a wrap-only change is byte-identical to what is already displayed (an
    // AttributeRunNode wrapper carries no bytes of its own), so that probe would always REFUSE it
    // as a fixed point and leave the run loose forever, with nothing else to re-drive it.
    const { editor } = await testEnvironment(() => {
      const [glyph, separator] = $createMarkerPrefix("p");
      const [glyph2, separator2] = $createMarkerPrefix("p");
      const milestone = $createMilestoneNode("qt-s", "q1");
      const opening = $createMarkerNode("qt-s", "opening");
      const attribute = $createTextNode(`${NBSP}|sid="q1"`); // byte-exact — no content divergence
      $setState(attribute, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          glyph,
          separator,
          $createTextNode("before "),
          milestone,
          opening,
          attribute,
          $createMarkerNode("", "selfClosing"),
          $createTextNode(" after"),
        ),
        $createParaNode("p").append(glyph2, separator2, $createTextNode("body")),
      );
      // Caret parked on the loose (but byte-exact) attribute text: mid-edit grace blocks the
      // construction commit's own healing attempt, and — the migration-pend behavior — also pends
      // the milestone.
      attribute.select(attribute.getTextContentSize(), attribute.getTextContentSize());
    });

    // Caret departs → the pended milestone's loose run settles by MIGRATING into its wrapper —
    // not by re-tokenizing: there is nothing to re-tokenize, since the displayed bytes are already
    // canonical and sid never changes.
    await act(async () => editor.update(() => $bodyText().select(0, 0)));

    editor.read(() => {
      const msNode = $milestoneInFirstPara();
      expect($isDisplayOwnerPended(msNode)).toBe(false);
      // The ACTUAL wrap landed — not just a reporter's boolean: the wrapper is present, and the
      // opening/attribute/closing pieces it now holds are the SAME bytes, untouched.
      const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(msNode);
      expect(wrapper).toBeDefined();
      expect($isMarkerNode(opening) && opening.getMarkerSyntax() === "opening").toBe(true);
      expect(attribute?.getTextContent()).toBe(`${NBSP}|sid="q1"`);
      expect($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing").toBe(true);
      expect(msNode.getSid()).toBe("q1"); // untouched — a migration, never a re-tokenize
    });
  });

  it("a legitimate local attribute clear settles quietly instead of sitting stuck", async () => {
    // Unlike a char span or a verse, a milestone's glyph pair is UNCONDITIONAL — its descriptor's
    // `expectedPieces(owner).wantsRun` is always `true` — so `$pendOwnersOfDestroyed`'s still-wanted
    // exemption (MarkerEditPlugin.tsx) never applies to a milestone: the sync's OWN legitimate
    // attribute-text removal (a "destroyed" TextNode mutation from the listener's point of view)
    // pends the milestone exactly like a genuine deletion would. What must NOT happen is the pend
    // sitting stuck: a commit that settles pendings (here, `COMMIT_PENDING_MARKERS_COMMAND` — the
    // same forced-settle path the host dispatches before a save; there is no caret in this test to
    // drive an ordinary departure settle) must re-tokenize the unchanged displayed bytes right back
    // into the same cleared fields, so a LATER legitimate sid set still heals into a visible
    // attribute run right away rather than being blocked by a leftover pend.
    const { editor } = await testEnvironment($twoParaFixture);

    editor.getEditorState().read(() => {
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });

    // Clear sid directly, with no caret at the run's site — the sync heals the attribute text
    // away in THIS commit, and that removal is exactly what the mutation listener observes, and
    // pends the milestone for the forced settle below.
    await act(async () =>
      editor.update(() => {
        $milestoneInFirstPara().setSid(undefined);
      }),
    );

    // Pin the actual mechanism, not just its outcome: the milestone MUST be pended here, between
    // the clearing commit and the forced settle — proving `$pendOwnersOfDestroyed` really did add
    // it (the still-wanted exemption never applies to a milestone), rather than this test merely
    // observing a byte-identical Tier-2 re-tokenize that would look the same whether or not
    // anything was ever pended. Without this, reverting the exemption-removal (restoring the old
    // `valueText === undefined` check, which WOULD exempt this legitimate clear) leaves every
    // other assertion in this test passing — the removal-then-forced-settle would go unpinned.
    editor.read(() => {
      expect($isDisplayOwnerPended($milestoneInFirstPara())).toBe(true);
    });

    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });

    editor.read(() => {
      expect($isDisplayOwnerPended($milestoneInFirstPara())).toBe(false);
    });
    editor.getEditorState().read(() => {
      const { closing } = $milestoneAttributeRunPieces($milestoneInFirstPara());
      expect($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing").toBe(true);
    });

    // Prove the settle actually finished (not left stuck): a LATER legitimate sid set must heal
    // into a visible attribute run right away, not be blocked by a leftover pend.
    await act(async () =>
      editor.update(() => {
        $milestoneInFirstPara().setSid("q7");
      }),
    );

    editor.getEditorState().read(() => {
      expect($attributeRun().getTextContent()).toBe(`${NBSP}|sid="q7"`);
    });
  });

  it("removes an attribute-LESS milestone whose whole run the user deleted", async () => {
    // An attribute-less milestone still displays `\ts-s\*`, so its run is wanted even with no
    // attribute text. Reading "no attribute text" as "no run wanted" exempts this deletion from
    // pending, and the sync then resurrects the glyph pair on the next unrelated dirtying.
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const milestone = $createMilestoneNode("ts-s");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), milestone, $createTextNode("x")),
      );
      $appendMilestoneRun(milestone, "");
    });

    await act(async () => {
      editor.update(() => {
        const milestone = $firstPara().getChildren().at(2);
        if (!$isMilestoneNode(milestone)) throw new Error("milestone missing");
        milestone.getNextSibling()?.remove();
        const trailing = milestone.getNextSibling();
        if ($isTextNode(trailing)) trailing.select(1, 1);
      });
    });
    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });

    editor.getEditorState().read(() => {
      expect($firstPara().getChildren().some($isMilestoneNode)).toBe(false);
    });
  });
});
