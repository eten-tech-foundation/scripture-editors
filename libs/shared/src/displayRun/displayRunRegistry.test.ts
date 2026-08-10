import { displayRunDescriptor } from "./displayRunRegistry.js";
import { $createCharNode } from "../nodes/usj/CharNode.js";
import { $createMarkerNode } from "../nodes/features/MarkerNode.js";
import { $createMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { $createParaNode } from "../nodes/usj/ParaNode.js";
import { $createVerseNode } from "../nodes/usj/VerseNode.js";
import { getVisibleOpenMarkerText } from "../nodes/usj/node.utils.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { createBasicTestEnvironment } from "../nodes/usj/test.utils.js";
import { $createTextNode, $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

describe("displayRunRegistry expectedPieces", () => {
  it("derives a char span's canonical `|…` bytes and wants no run when it has no attributes", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        // A run only ever exists on a span that has a closing glyph ($charClosingGlyph is the
        // tree signal expectedPieces gates on) — build both spans the way editable mode does,
        // content plus opening/closing MarkerNode children, and vary only the attributes.
        const withAttributes = $createCharNode("w", { lemma: "grace" });
        withAttributes.append(
          $createMarkerNode("w"),
          $createTextNode("stub"),
          $createMarkerNode("w", "closing"),
        );
        const without = $createCharNode("nd");
        without.append(
          $createMarkerNode("nd"),
          $createTextNode("stub"),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append(withAttributes, without);
        const descriptor = displayRunDescriptor("char");
        expect(descriptor.expectedPieces(withAttributes)).toEqual({
          wantsRun: true,
          valueText: "|grace",
        });
        expect(descriptor.expectedPieces(without)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
      },
      { discrete: true },
    );
  });

  it("derives a verse's NBSP-prefixed \\va and \\vp values independently", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          undefined,
        );
        // VerseNode extends TextNode, which the root node refuses directly — wrap it in a
        // paragraph the way every other verse-node test in this package does.
        $getRoot().append($createParaNode("p").append(verse));
        expect(displayRunDescriptor("va").expectedPieces(verse)).toEqual({
          wantsRun: true,
          valueText: `${NBSP}2`,
        });
        expect(displayRunDescriptor("vp").expectedPieces(verse)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
      },
      { discrete: true },
    );
  });

  it("keeps a milestone's glyph pair wanted even with no attribute text at all", () => {
    // The unconditional-glyphs rule: an attribute-less milestone still displays `\ts-s\*`, so its
    // run is WANTED while its value is absent. Anything that reads "no value" as "no run wanted"
    // mistakes a real deletion of those glyphs for the sync's own heal-removal.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const bare = $createMilestoneNode("ts-s");
        const withSid = $createMilestoneNode("qt-s", "q1");
        $getRoot().append(bare, withSid);
        const descriptor = displayRunDescriptor("milestone");
        expect(descriptor.expectedPieces(bare)).toEqual({ wantsRun: true, valueText: undefined });
        expect(descriptor.expectedPieces(withSid)).toEqual({
          wantsRun: true,
          // `qt-s`'s default attribute is "who" (milestoneDefaultAttribute), not "sid" — a sole
          // `sid` attribute does not collapse to the bare `|q1` form, so the explicit name rides
          // along: `|sid="q1"`. Confirmed against the identical case in
          // attributeDisplay.utils.test.ts's AttributeRunNode wrapper recognition suite.
          valueText: `${NBSP}|sid="q1"`,
        });
      },
      { discrete: true },
    );
  });
});
