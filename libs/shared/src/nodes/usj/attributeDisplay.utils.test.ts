import {
  $hasCaretHeldMilestoneRun,
  $syncMilestoneDisplayRun,
  canonicalAttributeText,
  milestoneAttributes,
} from "./attributeDisplay.utils.js";
import { $createMilestoneNode, MilestoneNode } from "./MilestoneNode.js";
import { NBSP } from "./node-constants.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment, updateSelection } from "./test.utils.js";
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
});
