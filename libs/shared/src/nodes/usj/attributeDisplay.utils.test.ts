import {
  $hasCaretHeldMilestoneRun,
  $milestoneRunEntirelyAbsent,
  $syncMilestoneDisplayRun,
  $syncVerseAttributeDisplay,
  canonicalAttributeText,
  milestoneAttributes,
} from "./attributeDisplay.utils.js";
import { $createMilestoneNode, MilestoneNode } from "./MilestoneNode.js";
import { getVisibleOpenMarkerText } from "./node.utils.js";
import { NBSP } from "./node-constants.js";
import { $createParaNode } from "./ParaNode.js";
import { registerPendedDisplayOwners } from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment, updateSelection } from "./test.utils.js";
import { $createVerseNode, VerseNode } from "./VerseNode.js";
import { $createMarkerNode, $isMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $createTextNode, $getRoot, $isTextNode, $setState, TextNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("canonicalAttributeText", () => {
  it("collapses a lone default attribute to the bare form", () => {
    expect(canonicalAttributeText({ lemma: "gloss" }, "lemma")).toBe("|gloss");
  });
  it("names a lone non-default attribute", () => {
    expect(canonicalAttributeText({ strong: "G5485" }, "lemma")).toBe('|strong="G5485"');
  });
  it("names everything when more than one attribute, insertion order, single spaces", () => {
    expect(canonicalAttributeText({ lemma: "grace", strong: "G5485" }, "lemma")).toBe(
      '|lemma="grace" strong="G5485"',
    );
  });
  it("names a lone default when the marker has no default attribute", () => {
    expect(canonicalAttributeText({ lemma: "x" }, undefined)).toBe('|lemma="x"');
  });
  it("never displays closed and returns empty for closed-only", () => {
    expect(canonicalAttributeText({ closed: "false" })).toBe("");
    expect(canonicalAttributeText({ closed: "false", lemma: "x" }, "lemma")).toBe("|x");
  });
  it("returns empty for no attributes", () => {
    expect(canonicalAttributeText({})).toBe("");
    expect(canonicalAttributeText({ lemma: undefined }, "lemma")).toBe("");
  });
  it("keeps byte-exact values including trailing whitespace (ParatextData keeps it)", () => {
    expect(canonicalAttributeText({ lemma: "stuff " }, "lemma")).toBe("|stuff ");
  });
});

describe("milestoneAttributes", () => {
  it("folds sid then eid then unknownAttributes, in that order", () => {
    expect(milestoneAttributes("q1", "q1-end", { who: "TJ" })).toEqual({
      sid: "q1",
      eid: "q1-end",
      who: "TJ",
    });
  });
  it("omits sid/eid when absent, keeping only unknownAttributes", () => {
    expect(milestoneAttributes(undefined, undefined, { who: "TJ" })).toEqual({ who: "TJ" });
  });
  it("returns an empty object when nothing is set", () => {
    expect(milestoneAttributes(undefined, undefined, undefined)).toEqual({});
  });
});

describe("milestone display run ($syncMilestoneDisplayRun / $hasCaretHeldMilestoneRun)", () => {
  /** Builds `before <ms> after` under a fresh root paragraph and returns the milestone. */
  function buildBareMilestone(marker: string, sid?: string) {
    const { editor } = createBasicTestEnvironment();
    let milestone!: MilestoneNode;
    editor.update(
      () => {
        milestone = $createMilestoneNode(marker, sid);
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("before "),
            milestone,
            $createTextNode(" after"),
          ),
        );
      },
      { discrete: true },
    );
    return { editor, milestone };
  }

  /** The run glyphs/text directly after `milestone`, read as plain data for assertions. */
  function readRun(milestone: MilestoneNode) {
    const opening = milestone.getNextSibling();
    const openingText = $isMarkerNode(opening) ? opening.getTextContent() : undefined;
    const afterOpening = opening?.getNextSibling() ?? null;
    const hasAttribute =
      $isTextNode(afterOpening) && !$isMarkerNode(afterOpening) && afterOpening.getTextContent();
    const attribute = hasAttribute ? (afterOpening as TextNode) : undefined;
    const closing = attribute ? attribute.getNextSibling() : afterOpening;
    const closingText = $isMarkerNode(closing) ? closing.getTextContent() : undefined;
    const afterRun = (closing ?? afterOpening)?.getNextSibling();
    return {
      openingKey: $isMarkerNode(opening) ? opening.getKey() : undefined,
      openingText,
      attributeKey: attribute?.getKey(),
      attributeText: attribute?.getTextContent(),
      closingKey: $isMarkerNode(closing) ? closing.getKey() : undefined,
      closingText,
      afterRunText: afterRun?.getTextContent(),
    };
  }

  it("heals a full canonical run onto a bare (collab-shaped) milestone", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const expectedText = `${NBSP}|sid="q1"`;

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, expectedText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      expect(run.openingText).toBe("\\qt-s");
      expect(run.attributeText).toBe(expectedText);
      expect(run.closingText).toBe("\\*");
      expect(run.afterRunText).toBe(" after");
    });
  });

  it("heals a bare milestone with no attributes into a glyph-only run (no attribute node)", () => {
    // No sid/eid/unknownAttributes at all collapses to "" — the milestone still gets its
    // opening/self-closing pair, just no attribute text between them.
    const { editor, milestone } = buildBareMilestone("qt-s");
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, "");
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      expect(run.openingText).toBe("\\qt-s");
      expect(run.attributeText).toBeUndefined();
      expect(run.closingText).toBe("\\*");
    });
  });

  it("heals stale attribute text in place, preserving glyph node identity", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, `${NBSP}|sid="q1"`);
      },
      { discrete: true },
    );

    const before = editor.getEditorState().read(() => readRun(milestone));

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, `${NBSP}|sid="q2"`);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const after = readRun(milestone);
      expect(after.attributeText).toBe(`${NBSP}|sid="q2"`);
      // Same node instances — only the text content changed.
      expect(after.openingKey).toBe(before.openingKey);
      expect(after.attributeKey).toBe(before.attributeKey);
      expect(after.closingKey).toBe(before.closingKey);
    });
  });

  it("repairs a mangled run whose self-closing glyph is missing", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const expectedText = `${NBSP}|sid="q1"`;
    let openingKeyBefore = "";
    let attributeKeyBefore = "";
    editor.update(
      () => {
        const opening = $createMarkerNode("qt-s", "opening");
        milestone.insertAfter(opening);
        const attribute = $createTextNode(expectedText);
        $setState(attribute, textTypeState, "attribute");
        opening.insertAfter(attribute);
        // Deliberately no self-closing glyph — the mangled shape under test.
        openingKeyBefore = opening.getKey();
        attributeKeyBefore = attribute.getKey();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, expectedText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      expect(run.openingKey).toBe(openingKeyBefore);
      expect(run.attributeKey).toBe(attributeKeyBefore);
      expect(run.attributeText).toBe(expectedText);
      expect(run.closingText).toBe("\\*");
    });
  });

  it("is idempotent on an already-canonical run (no churn)", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const expectedText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, expectedText);
      },
      { discrete: true },
    );

    const before = editor.getEditorState().read(() => readRun(milestone));

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, expectedText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const after = readRun(milestone);
      expect(after).toEqual(before);
    });
  });

  it("leaves the run alone while the collapsed caret sits inside the attribute text (mid-edit grace)", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    let attributeNode!: TextNode;
    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      const opening = milestone.getNextSibling();
      const found = opening?.getNextSibling();
      if (!$isTextNode(found)) throw new Error("attribute node not found");
      attributeNode = found;
      expect(run.attributeText).toBe(canonicalText);
    });

    // Simulate mid-edit: the user typed into the run, diverging it from canonical.
    editor.update(
      () => {
        attributeNode.setTextContent(`${NBSP}|sid="q1x"`);
      },
      { discrete: true },
    );
    // No explicit offset: defaults to the end of the (just-diverged) attribute text, computed
    // inside `updateSelection`'s own editor.update() lock.
    updateSelection(editor, attributeNode);

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // Grace held: the sync left the diverged text untouched rather than clobbering it.
      const run = readRun(milestone);
      expect(run.attributeText).toBe(`${NBSP}|sid="q1x"`);
      expect($hasCaretHeldMilestoneRun(milestone, canonicalText)).toBe(true);
    });
  });

  it("reports not caret-held when the run is already canonical", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($hasCaretHeldMilestoneRun(milestone, canonicalText)).toBe(false);
    });
  });

  it("leaves a just-deleted run alone while the caret sits at its insertion point, and reports it caret-held", () => {
    // The user deleted the whole run (opening glyph, attribute text, self-closing glyph),
    // leaving the caret at the deletion site — the end of the text before the milestone. The
    // run is the milestone's ENTIRE visible byte representation; without a deleted-run grace
    // the sync would instantly rebuild it from the milestone's intact fields, making the run
    // undeletable (the deletion visibly undoing itself).
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const opening = milestone.getNextSibling();
        const attribute = opening?.getNextSibling();
        const closer = attribute?.getNextSibling();
        closer?.remove();
        attribute?.remove();
        opening?.remove();
        const previous = milestone.getPreviousSibling();
        if (!$isTextNode(previous)) throw new Error("text before milestone missing");
        previous.select(previous.getTextContentSize(), previous.getTextContentSize());
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // Grace held: nothing was re-inserted — the deletion did not undo itself.
      expect($isMarkerNode(milestone.getNextSibling())).toBe(false);
      expect(milestone.getNextSibling()?.getTextContent()).toBe(" after");
      expect($hasCaretHeldMilestoneRun(milestone, canonicalText)).toBe(true);
      expect($milestoneRunEntirelyAbsent(milestone)).toBe(true);
    });
  });

  it("also graces the deleted-run site from the start of the following sibling", () => {
    // A forward range deletion collapses the caret at the START of the content after the run
    // rather than the end of the content before the milestone — both flanks are the same
    // insertion point and both must hold the grace.
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const opening = milestone.getNextSibling();
        const attribute = opening?.getNextSibling();
        const closer = attribute?.getNextSibling();
        closer?.remove();
        attribute?.remove();
        opening?.remove();
        const next = milestone.getNextSibling();
        if (!$isTextNode(next)) throw new Error("text after milestone missing");
        next.select(0, 0);
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($isMarkerNode(milestone.getNextSibling())).toBe(false);
      expect($hasCaretHeldMilestoneRun(milestone, canonicalText)).toBe(true);
    });
  });

  it("re-inserts only the missing opening glyph when leftover run pieces remain (no duplicates)", () => {
    // Partial mangle: only the opening glyph was deleted; the attribute text and self-closing
    // glyph remain as debris. The heal must repair AROUND the leftovers — inserting just the
    // missing opening — never duplicate them (which would render the attribute bytes twice and
    // corrupt the next Tier-2 re-tokenization).
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    let attributeKey = "";
    let closerKey = "";
    editor.update(
      () => {
        const opening = milestone.getNextSibling();
        const attribute = opening?.getNextSibling();
        const closer = attribute?.getNextSibling();
        if (!attribute || !closer) throw new Error("healed run pieces missing");
        attributeKey = attribute.getKey();
        closerKey = closer.getKey();
        opening?.remove();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      expect(run.openingText).toBe("\\qt-s");
      // The leftover attribute and closer are the SAME instances — repaired around, not
      // duplicated.
      expect(run.attributeKey).toBe(attributeKey);
      expect(run.closingKey).toBe(closerKey);
      expect(run.afterRunText).toBe(" after");
      expect($milestoneRunEntirelyAbsent(milestone)).toBe(false);
    });
  });

  it("does not report the run entirely absent while any piece remains", () => {
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.update(
      () => {
        // Delete the opening glyph and the attribute text; keep only the self-closing glyph.
        const opening = milestone.getNextSibling();
        const attribute = opening?.getNextSibling();
        attribute?.remove();
        opening?.remove();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($milestoneRunEntirelyAbsent(milestone)).toBe(false);
    });
  });

  it("leaves a diverged run unhealed while the owner is pended in the registry, and heals it again once unpended", () => {
    // Pins the pended guard added to $syncMilestoneDisplayRun alongside $settlePendedDisplayOwner
    // (Task 8): with a REAL divergence and the caret parked somewhere none of this file's
    // caret-grace heuristics recognize, a milestone registered pended in
    // pendedDisplayOwners.utils.ts's side channel must leave the run unhealed — that decision is
    // deferred to the marker-edit engine's own caret-departure settle
    // ($resolvePendingMarkers/$settlePendedDisplayOwner, markerEditTier1.utils.ts). Unpending the
    // SAME divergence must heal it exactly as every other test in this file proves it does.
    const { editor, milestone } = buildBareMilestone("qt-s", "q1");
    const canonicalText = `${NBSP}|sid="q1"`;
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    // Delete ONLY the attribute text (opening + self-closing glyphs survive as debris — a real
    // divergence), then park the caret on the LEADING content, well away from the run's site.
    // (Lexical's own point normalization pulls a caret parked at the START of the run's
    // immediately-following sibling back onto the closing glyph's own end — which IS a
    // recognized grace site — so the away site must not be glyph-adjacent.)
    editor.update(
      () => {
        const opening = milestone.getNextSibling();
        const attribute = opening?.getNextSibling();
        attribute?.remove();
        const before = milestone.getPreviousSibling();
        if (!$isTextNode(before)) throw new Error("leading text missing");
        before.select(0, 0);
      },
      { discrete: true },
    );

    const pended = new Set<string>([milestone.getKey()]);
    const unregister = registerPendedDisplayOwners(editor, pended);

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // Pended: the sync left the debris untouched — no attribute text resurrected.
      const run = readRun(milestone);
      expect(run.attributeText).toBeUndefined();
    });

    // Negative control: the SAME divergence, unpended, heals — attribute text comes back.
    pended.delete(milestone.getKey());
    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, canonicalText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const run = readRun(milestone);
      expect(run.attributeText).toBe(canonicalText);
    });

    unregister();
  });
});

describe("verse attribute display run ($syncVerseAttributeDisplay)", () => {
  /** Builds `<verse \\v 1><va opener>␣2<va closer>In the beginning` under a fresh root
   * paragraph, with the `\va` triplet already healed onto the verse (mirrors
   * `buildBareMilestone`'s shape for the verse case), and returns the verse. */
  function buildVerseWithVa() {
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
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
        $syncVerseAttributeDisplay(verse, verse.getAltnumber(), verse.getPubnumber());
      },
      { discrete: true },
    );
    return { editor, verse };
  }

  it("heals a full \\va run onto a verse with no display triplet yet", () => {
    const { editor, verse } = buildVerseWithVa();
    editor.getEditorState().read(() => {
      const open = verse.getNextSibling();
      expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
      const value = open?.getNextSibling();
      if (!$isTextNode(value) || $isMarkerNode(value)) throw new Error("value missing");
      expect(value.getTextContent()).toBe(`${NBSP}2`);
      const closer = value.getNextSibling();
      expect($isMarkerNode(closer) && closer.getMarkerSyntax() === "closing").toBe(true);
    });
  });

  it("leaves a diverged \\va run unhealed while the owner is pended in the registry, and heals it again once unpended", () => {
    // Mirrors the milestone pin above, for $syncVerseAttributeDisplay's own pended guard (inside
    // $syncVerseAttributeRun, keyed on the OWNING verse — see that function's doc comment).
    const { editor, verse } = buildVerseWithVa();

    // Remove ONLY the value TextNode (opener + closer glyphs survive as debris — a real
    // divergence), then park the caret on the LEADING content, well away from the run's site.
    // (Lexical's own point normalization pulls a caret parked at the START of the run's
    // immediately-following sibling back onto the closer glyph's own end — which IS a
    // recognized grace site — so the away site must not be glyph-adjacent.)
    editor.update(
      () => {
        const open = verse.getNextSibling();
        const value = open?.getNextSibling();
        value?.remove();
        const before = verse.getPreviousSibling();
        if (!$isTextNode(before)) throw new Error("leading text missing");
        before.select(0, 0);
      },
      { discrete: true },
    );

    const pended = new Set<string>([verse.getKey()]);
    const unregister = registerPendedDisplayOwners(editor, pended);

    editor.update(
      () => {
        $syncVerseAttributeDisplay(verse, verse.getAltnumber(), verse.getPubnumber());
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // Pended: the sync left the debris alone — opener and closer survive, but no value was
      // resurrected between them.
      const open = verse.getNextSibling();
      expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
      const afterOpen = open?.getNextSibling();
      expect($isMarkerNode(afterOpen) && afterOpen.getMarkerSyntax() === "closing").toBe(true);
    });

    // Negative control: the SAME divergence, unpended, heals — the value comes back.
    pended.delete(verse.getKey());
    editor.update(
      () => {
        $syncVerseAttributeDisplay(verse, verse.getAltnumber(), verse.getPubnumber());
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const open = verse.getNextSibling();
      const value = open?.getNextSibling();
      if (!$isTextNode(value) || $isMarkerNode(value)) throw new Error("value missing");
      expect(value.getTextContent()).toBe(`${NBSP}2`);
    });

    unregister();
  });
});
