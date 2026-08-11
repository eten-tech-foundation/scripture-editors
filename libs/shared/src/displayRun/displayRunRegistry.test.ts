import { displayRunDescriptor } from "./displayRunRegistry.js";
import { textTypeState } from "../nodes/collab/delta.state.js";
import { $createMarkerNode } from "../nodes/features/MarkerNode.js";
import { $createAttributeRunNode } from "../nodes/usj/AttributeRunNode.js";
import { $createCharNode } from "../nodes/usj/CharNode.js";
import { $createMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { $createParaNode } from "../nodes/usj/ParaNode.js";
import { $createVerseNode } from "../nodes/usj/VerseNode.js";
import { getVisibleOpenMarkerText } from "../nodes/usj/node.utils.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { createBasicTestEnvironment } from "../nodes/usj/test.utils.js";
import { $createTextNode, $getRoot, $setState } from "lexical";
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

describe("displayRunRegistry scanPieces", () => {
  it("reads a char span's attribute-tagged TextNode as `value`, with no opener/closer/wrapper", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const span = $createCharNode("w", { lemma: "grace" });
        const value = $createTextNode("|grace");
        $setState(value, textTypeState, "attribute");
        span.append($createMarkerNode("w"), value, $createMarkerNode("w", "closing"));
        $getRoot().append(span);
        expect(displayRunDescriptor("char").scanPieces(span)).toEqual({ value });
      },
      { discrete: true },
    );
  });

  it("reads a wrapped \\va run's pieces by NAME: opener/value/closer/wrapper", () => {
    // The canonical (post-flip) shape: usj-editor.adaptor and the shared $syncDisplayRun driver
    // always build a wanted run wrapped in an AttributeRunNode, so this is the shape scanPieces
    // meets in practice, not the legacy loose-sibling shape.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
        const wrapper = $createAttributeRunNode("va");
        const opener = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("va", "closing");
        wrapper.append(opener, value, closer);
        $getRoot().append($createParaNode("p").append(verse, wrapper));
        expect(displayRunDescriptor("va").scanPieces(verse)).toEqual({
          opener,
          value,
          closer,
          wrapper,
        });
      },
      { discrete: true },
    );
  });

  it("reads a wrapped \\vp run's pieces, anchored after \\va's own wrapper", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          "3",
        );
        const vaWrapper = $createAttributeRunNode("va");
        const vaValue = $createTextNode(`${NBSP}2`);
        $setState(vaValue, textTypeState, "attribute");
        vaWrapper.append($createMarkerNode("va"), vaValue, $createMarkerNode("va", "closing"));

        const vpWrapper = $createAttributeRunNode("vp");
        const opener = $createMarkerNode("vp");
        const value = $createTextNode(`${NBSP}3`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("vp", "closing");
        vpWrapper.append(opener, value, closer);

        $getRoot().append($createParaNode("p").append(verse, vaWrapper, vpWrapper));
        expect(displayRunDescriptor("vp").scanPieces(verse)).toEqual({
          opener,
          value,
          closer,
          wrapper: vpWrapper,
        });
      },
      { discrete: true },
    );
  });

  it("translates a wrapped milestone run's opening/attribute/closing fields to opener/value/closer", () => {
    // $milestoneAttributeRunPieces returns opening/attribute/closing/wrapper — a DIFFERENT
    // vocabulary from ScannedRun's opener/value/closer/wrapper. A regression that returns that
    // shape unchanged type-checks with zero errors (every ScannedRun field is optional, so the
    // untranslated shape is structurally assignable) and then silently reads as "no pieces"
    // forever at runtime. toEqual below is what actually catches it: it fails both on the
    // missing opener/value/closer AND on the leftover opening/attribute/closing keys.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const milestone = $createMilestoneNode("qt-s", "q1");
        const wrapper = $createAttributeRunNode("milestone");
        const opener = $createMarkerNode("qt-s", "opening");
        const value = $createTextNode(`${NBSP}|sid="q1"`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("", "selfClosing");
        wrapper.append(opener, value, closer);
        $getRoot().append($createParaNode("p").append(milestone, wrapper));
        expect(displayRunDescriptor("milestone").scanPieces(milestone)).toEqual({
          opener,
          value,
          closer,
          wrapper,
        });
      },
      { discrete: true },
    );
  });
});

describe("displayRunDescriptor lookup", () => {
  it("throws for an unregistered kind, naming it in the message", () => {
    // "separator" is a valid DisplayRunKind, but the registry currently registers only
    // char/va/vp/milestone/optbreak — pins both the throw and the documented message shape
    // (displayRunRegistry.ts's doc comment).
    expect(() => displayRunDescriptor("separator")).toThrow(
      'No display-run descriptor registered for kind "separator"',
    );
  });
});
