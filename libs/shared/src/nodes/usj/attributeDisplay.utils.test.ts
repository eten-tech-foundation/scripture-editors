import {
  $hasCaretHeldMilestoneRun,
  $hasCaretHeldVerseAttributeRun,
  $milestoneAttributeRunPieces,
  $milestoneRunEntirelyAbsent,
  $syncMilestoneDisplayRun,
  $syncVerseAttributeDisplay,
  $verseAttributeRunPieces,
  $verseOfAttributeSourceText,
  canonicalAttributeText,
  milestoneAttributes,
} from "./attributeDisplay.utils.js";
import {
  $createAttributeRunNode,
  $isAttributeRunNode,
  AttributeRunNode,
} from "./AttributeRunNode.js";
import { $createCharNode } from "./CharNode.js";
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

  /** The run's glyphs/text, read as plain data for assertions — via {@link $milestoneAttributeRunPieces},
   * so this helper works identically whether the run rides loose (mid-migration debris) or inside
   * an `AttributeRunNode` wrapper (the shape the sync always heals forward to). */
  function $readRun(milestone: MilestoneNode) {
    const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(milestone);
    const afterRun = (wrapper ?? closing ?? attribute ?? opening ?? milestone).getNextSibling();
    return {
      openingKey: opening?.getKey(),
      openingText: opening?.getTextContent(),
      attributeKey: attribute?.getKey(),
      attributeText: attribute?.getTextContent(),
      closingKey: closing?.getKey(),
      closingText: closing?.getTextContent(),
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
      const run = $readRun(milestone);
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
      const run = $readRun(milestone);
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

    const before = editor.getEditorState().read(() => $readRun(milestone));

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, `${NBSP}|sid="q2"`);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const after = $readRun(milestone);
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
      const run = $readRun(milestone);
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

    const before = editor.getEditorState().read(() => $readRun(milestone));

    editor.update(
      () => {
        $syncMilestoneDisplayRun(milestone, expectedText);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const after = $readRun(milestone);
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
      const run = $readRun(milestone);
      const { attribute } = $milestoneAttributeRunPieces(milestone);
      if (!attribute) throw new Error("attribute node not found");
      attributeNode = attribute;
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
      const run = $readRun(milestone);
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
    // The user deleted the whole run (the wrapper and everything inside it), leaving the caret at
    // the deletion site — the end of the text before the milestone. The run is the milestone's
    // ENTIRE visible byte representation; without a deleted-run grace the sync would instantly
    // rebuild it from the milestone's intact fields, making the run undeletable (the deletion
    // visibly undoing itself).
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
        const wrapper = milestone.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("healed wrapper missing");
        wrapper.remove();
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
        const wrapper = milestone.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("healed wrapper missing");
        wrapper.remove();
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
        const { opening, attribute, closing } = $milestoneAttributeRunPieces(milestone);
        if (!opening || !attribute || !closing) throw new Error("healed run pieces missing");
        attributeKey = attribute.getKey();
        closerKey = closing.getKey();
        opening.remove();
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
      const run = $readRun(milestone);
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
        const { opening, attribute } = $milestoneAttributeRunPieces(milestone);
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
    // Pins the pended guard added to $syncMilestoneDisplayRun alongside $settlePendedDisplayOwner:
    // with a REAL divergence and the caret parked somewhere none of this file's
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
        const { attribute } = $milestoneAttributeRunPieces(milestone);
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
      const run = $readRun(milestone);
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
      const run = $readRun(milestone);
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

  it("heals a full \\va run onto a verse with no display triplet yet, wrapped in an AttributeRunNode", () => {
    const { editor, verse } = buildVerseWithVa();
    editor.getEditorState().read(() => {
      const wrapper = verse.getNextSibling();
      if (!$isAttributeRunNode(wrapper)) throw new Error("wrapper missing");
      expect(wrapper.getRunKind()).toBe("va");
      expect(wrapper.getChildrenSize()).toBe(3);
      const [open, value, closer] = wrapper.getChildren();
      expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
      if (!$isTextNode(value) || $isMarkerNode(value)) throw new Error("value missing");
      expect(value.getTextContent()).toBe(`${NBSP}2`);
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
        const { value } = $verseAttributeRunPieces(verse, "va");
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
      // Pended: the sync left the debris alone — opener and closer survive INSIDE the wrapper,
      // but no value was resurrected between them.
      const { opener, value, closer } = $verseAttributeRunPieces(verse, "va");
      expect($isMarkerNode(opener) && opener.getMarker() === "va").toBe(true);
      expect(value).toBeUndefined();
      expect($isMarkerNode(closer) && closer.getMarkerSyntax() === "closing").toBe(true);
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
      const { value } = $verseAttributeRunPieces(verse, "va");
      if (!value) throw new Error("value missing");
      expect(value.getTextContent()).toBe(`${NBSP}2`);
    });

    unregister();
  });
});

describe("$verseOfAttributeSourceText", () => {
  it("returns the verse when the va span sits directly after it", () => {
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    let verse!: VerseNode;
    editor.update(
      () => {
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        const span = $createCharNode("va");
        content = $createTextNode(NBSP);
        span.append($createMarkerNode("va"), content, $createMarkerNode("va", "closing"));
        $getRoot().append(
          $createParaNode("p").append($createTextNode(NBSP), verse, span, $createTextNode("text")),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBe(verse);
    });
  });

  it("returns the verse when the vp span sits after a folded \\va triplet", () => {
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    let verse!: VerseNode;
    editor.update(
      () => {
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
        const vaValue = $createTextNode(`${NBSP}2`);
        $setState(vaValue, textTypeState, "attribute");
        const vpSpan = $createCharNode("vp");
        content = $createTextNode(NBSP);
        vpSpan.append($createMarkerNode("vp"), content, $createMarkerNode("vp", "closing"));
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            $createMarkerNode("va"),
            vaValue,
            $createMarkerNode("va", "closing"),
            vpSpan,
            $createTextNode("text"),
          ),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBe(verse);
    });
  });

  it("returns the verse when the vp span sits after a settled-empty va SPAN (not a folded triplet)", () => {
    // Exercises the third `isRunPiece` disjunct — a run piece that is itself a whole `va`/`vp`
    // CharNode (a settled-empty span), as opposed to the glyph/attribute-text pieces of a folded
    // triplet the prior two tests cover. The `vp` span's content must walk PAST the entire `va`
    // span in one step (it is the previous SIBLING, not descended into) to reach the verse.
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    let verse!: VerseNode;
    editor.update(
      () => {
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        const vaSpan = $createCharNode("va");
        vaSpan.append(
          $createMarkerNode("va"),
          $createTextNode(NBSP),
          $createMarkerNode("va", "closing"),
        );
        const vpSpan = $createCharNode("vp");
        content = $createTextNode(NBSP);
        vpSpan.append($createMarkerNode("vp"), content, $createMarkerNode("vp", "closing"));
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vaSpan,
            vpSpan,
            $createTextNode("text"),
          ),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBe(verse);
    });
  });

  it("returns undefined for a va span with no verse before it", () => {
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    editor.update(
      () => {
        const span = $createCharNode("va");
        content = $createTextNode(NBSP);
        span.append($createMarkerNode("va"), content, $createMarkerNode("va", "closing"));
        $getRoot().append($createParaNode("p").append($createTextNode("hello"), span));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBeUndefined();
    });
  });

  it("returns undefined for a non-va/vp span directly after a verse", () => {
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        const span = $createCharNode("nd");
        content = $createTextNode(NBSP);
        span.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing"));
        $getRoot().append($createParaNode("p").append($createTextNode(NBSP), verse, span));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBeUndefined();
    });
  });

  it("returns undefined for bare paragraph text with no char-span parent", () => {
    const { editor } = createBasicTestEnvironment();
    let content!: TextNode;
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        content = $createTextNode("plain text");
        $getRoot().append($createParaNode("p").append($createTextNode(NBSP), verse, content));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($verseOfAttributeSourceText(content)).toBeUndefined();
    });
  });
});

// AttributeRunNode is registered in usjBaseNodes — createBasicTestEnvironment's default node list
// already includes it, since the forward adaptor and this package's own self-healing syncs both
// construct one directly (see usjBaseNodes' own doc comment, nodes/usj/index.ts).
describe("AttributeRunNode wrapper recognition (dual-read)", () => {
  describe("milestone", () => {
    /** Builds `before <ms> <AttributeRunNode wrapper>[pieces] after` and returns both. */
    function buildWrappedMilestone(pieces: (wrapper: AttributeRunNode) => void) {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let wrapper!: AttributeRunNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          wrapper = $createAttributeRunNode("milestone");
          pieces(wrapper);
          $getRoot().append(
            $createParaNode("p").append(
              $createTextNode("before "),
              milestone,
              wrapper,
              $createTextNode(" after"),
            ),
          );
        },
        { discrete: true },
      );
      return { editor, milestone, wrapper };
    }

    it("heals a stale value INSIDE an existing wrapper, never as a loose sibling", () => {
      const canonicalText = `${NBSP}|sid="q1"`;
      const { editor, milestone, wrapper } = buildWrappedMilestone((w: AttributeRunNode) => {
        w.append(
          $createMarkerNode("qt-s", "opening"),
          (() => {
            const stale = $createTextNode(`${NBSP}|sid="stale"`);
            $setState(stale, textTypeState, "attribute");
            return stale;
          })(),
          $createMarkerNode("", "selfClosing"),
        );
      });

      editor.update(
        () => {
          $syncMilestoneDisplayRun(milestone, canonicalText);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        // The wrapper is still milestone's immediate next sibling — nothing spilled out as a
        // loose sibling.
        expect(milestone.getNextSibling()?.is(wrapper)).toBe(true);
        expect(wrapper.getChildrenSize()).toBe(3);
        const [opening, attribute, closing] = wrapper.getChildren();
        expect(opening.getTextContent()).toBe("\\qt-s");
        expect(attribute.getTextContent()).toBe(canonicalText);
        expect(closing.getTextContent()).toBe("\\*");
      });
    });

    it("inserts a missing opening glyph as the wrapper's FIRST child when repairing around surviving debris", () => {
      const canonicalText = `${NBSP}|sid="q1"`;
      let attributeKeyBefore = "";
      let closerKeyBefore = "";
      const { editor, milestone, wrapper } = buildWrappedMilestone((w: AttributeRunNode) => {
        const attribute = $createTextNode(canonicalText);
        $setState(attribute, textTypeState, "attribute");
        attributeKeyBefore = attribute.getKey();
        const closer = $createMarkerNode("", "selfClosing");
        closerKeyBefore = closer.getKey();
        // Deliberately no opening glyph — the mangled shape under test.
        w.append(attribute, closer);
      });

      editor.update(
        () => {
          $syncMilestoneDisplayRun(milestone, canonicalText);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect(wrapper.getChildrenSize()).toBe(3);
        const [opening, attribute, closer] = wrapper.getChildren();
        expect(opening.getTextContent()).toBe("\\qt-s");
        // Leftover pieces are the SAME instances — repaired around, not duplicated.
        expect(attribute.getKey()).toBe(attributeKeyBefore);
        expect(closer.getKey()).toBe(closerKeyBefore);
      });
    });

    it("recognizes the caret anywhere inside the wrapper as holding the run's site (containment arm)", () => {
      const canonicalText = `${NBSP}|sid="q1"`;
      const { editor, milestone, wrapper } = buildWrappedMilestone((w: AttributeRunNode) => {
        const attribute = $createTextNode(canonicalText);
        $setState(attribute, textTypeState, "attribute");
        w.append(
          $createMarkerNode("qt-s", "opening"),
          attribute,
          $createMarkerNode("", "selfClosing"),
        );
      });

      editor.update(
        () => {
          // Caret at the START of the wrapper's content lands on the OPENING glyph at offset 0 —
          // a shape NONE of the pre-existing piece-geometry arms recognize (they only recognize
          // the END of the opening glyph's text, or the attribute/closing pieces themselves).
          wrapper.selectStart();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($isAttributeRunNode(milestone.getNextSibling())).toBe(true);
        // A DIVERGENT expected text with the caret held inside the wrapper must still report
        // caret-held — proving the containment arm (not a geometry arm) recognizes this site.
        expect($hasCaretHeldMilestoneRun(milestone, `${NBSP}|sid="different"`)).toBe(true);
      });
    });

    it("an attached but EMPTY wrapper reports the run as entirely absent", () => {
      const { editor, milestone } = buildWrappedMilestone(() => {
        // No pieces appended — the wrapper is attached but empty (a transient husk).
      });

      editor.getEditorState().read(() => {
        expect($milestoneRunEntirelyAbsent(milestone)).toBe(true);
      });
    });
  });

  describe("verse", () => {
    it("heals a stale \\va value INSIDE an existing wrapper, and chains \\vp's scan to AFTER the \\va wrapper", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaWrapper!: AttributeRunNode;
      editor.update(
        () => {
          verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", "1b");
          vaWrapper = $createAttributeRunNode("va");
          const staleValue = $createTextNode(`${NBSP}stale`);
          $setState(staleValue, textTypeState, "attribute");
          vaWrapper.append(
            $createMarkerNode("va", "opening"),
            staleValue,
            $createMarkerNode("va", "closing"),
          );
          $getRoot().append(
            $createParaNode("p").append(
              $createTextNode(NBSP),
              verse,
              vaWrapper,
              $createTextNode("text after"),
            ),
          );
        },
        { discrete: true },
      );

      editor.update(
        () => {
          $syncVerseAttributeDisplay(verse, verse.getAltnumber(), verse.getPubnumber());
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        // \va healed INSIDE the surviving wrapper — still verse's immediate next sibling.
        expect(verse.getNextSibling()?.is(vaWrapper)).toBe(true);
        expect(vaWrapper.getChildrenSize()).toBe(3);
        const [opener, value, closer] = vaWrapper.getChildren();
        expect(opener.getTextContent()).toBe("\\va");
        expect(value.getTextContent()).toBe(`${NBSP}2`);
        expect(closer.getTextContent()).toBe("\\va*");
        // \vp's run was created AFTER the \va wrapper, in its OWN new wrapper (heal-forward builds
        // any wanted-but-unwrapped run wrapped, even one created fresh) — never nested inside \va's
        // wrapper, and never before it.
        const vpWrapper = vaWrapper.getNextSibling();
        if (!$isAttributeRunNode(vpWrapper)) throw new Error("\\vp wrapper missing");
        expect(vpWrapper.getRunKind()).toBe("vp");
        expect(vpWrapper.getChildrenSize()).toBe(3);
        const [vpOpener, vpValue, vpCloser] = vpWrapper.getChildren();
        expect($isMarkerNode(vpOpener) && vpOpener.getMarker() === "vp").toBe(true);
        expect(vpValue.getTextContent()).toBe(`${NBSP}1b`);
        expect($isMarkerNode(vpCloser) && vpCloser.getMarkerSyntax() === "closing").toBe(true);
        expect(vpWrapper.getNextSibling()?.getTextContent()).toBe("text after");
      });
    });

    it("inserts a missing \\va opener as the wrapper's FIRST child when repairing around surviving debris", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaWrapper!: AttributeRunNode;
      let valueKeyBefore = "";
      let closerKeyBefore = "";
      editor.update(
        () => {
          verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
          vaWrapper = $createAttributeRunNode("va");
          const value = $createTextNode(`${NBSP}2`);
          $setState(value, textTypeState, "attribute");
          valueKeyBefore = value.getKey();
          const closer = $createMarkerNode("va", "closing");
          closerKeyBefore = closer.getKey();
          // Deliberately no opener glyph — the mangled shape under test.
          vaWrapper.append(value, closer);
          $getRoot().append(
            $createParaNode("p").append(
              $createTextNode(NBSP),
              verse,
              vaWrapper,
              $createTextNode("text"),
            ),
          );
        },
        { discrete: true },
      );

      editor.update(
        () => {
          $syncVerseAttributeDisplay(verse, verse.getAltnumber(), verse.getPubnumber());
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect(vaWrapper.getChildrenSize()).toBe(3);
        const [opener, value, closer] = vaWrapper.getChildren();
        expect(opener.getTextContent()).toBe("\\va");
        expect(value.getKey()).toBe(valueKeyBefore);
        expect(closer.getKey()).toBe(closerKeyBefore);
      });
    });

    it("recognizes the caret anywhere inside a \\va wrapper as holding the run's site (containment arm)", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaWrapper!: AttributeRunNode;
      editor.update(
        () => {
          verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
          vaWrapper = $createAttributeRunNode("va");
          const value = $createTextNode(`${NBSP}2`);
          $setState(value, textTypeState, "attribute");
          vaWrapper.append(
            $createMarkerNode("va", "opening"),
            value,
            $createMarkerNode("va", "closing"),
          );
          $getRoot().append(
            $createParaNode("p").append(
              $createTextNode(NBSP),
              verse,
              vaWrapper,
              $createTextNode("text"),
            ),
          );
        },
        { discrete: true },
      );

      editor.update(
        () => {
          // Caret at the START of the wrapper lands on the opener glyph at offset 0 — a shape
          // none of the pre-existing geometry arms recognize.
          vaWrapper.selectStart();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($hasCaretHeldVerseAttributeRun(verse, "different", verse.getPubnumber())).toBe(true);
      });
    });
  });
});
