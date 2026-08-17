import { displayRunDescriptor, displayRunDescriptors } from "./displayRunRegistry.js";
import { textTypeState } from "../nodes/collab/delta.state.js";
import { $createMarkerNode } from "../nodes/features/MarkerNode.js";
import { $createAttributeRunNode } from "../nodes/usj/AttributeRunNode.js";
import { $createCharNode } from "../nodes/usj/CharNode.js";
import { $createChapterNode } from "../nodes/usj/ChapterNode.js";
import { $createMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { $createNoteNode } from "../nodes/usj/NoteNode.js";
import { $createParaNode } from "../nodes/usj/ParaNode.js";
import { $createVerseNode } from "../nodes/usj/VerseNode.js";
import { $runDiverges } from "../nodes/usj/displayRunSync.utils.js";
import { getEditableCallerText, getVisibleOpenMarkerText } from "../nodes/usj/node.utils.js";
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

  it("derives a note's NBSP-prefixed \\cat value only when expanded, never when collapsed", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const expanded = $createNoteNode("f", "+", false, "People");
        const collapsed = $createNoteNode("f", "+", true, "People");
        const noCategory = $createNoteNode("f", "+", false);
        $getRoot().append(
          $createParaNode("p").append(expanded),
          $createParaNode("p").append(collapsed),
          $createParaNode("p").append(noCategory),
        );
        const descriptor = displayRunDescriptor("cat");
        expect(descriptor.expectedPieces(expanded)).toEqual({
          wantsRun: true,
          valueText: `${NBSP}People`,
        });
        // A collapsed note deliberately shows no category run at all — its content is not inline
        // display text — so the still-set category must not make the sync fabricate one.
        expect(descriptor.expectedPieces(collapsed)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
        expect(descriptor.expectedPieces(noCategory)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
      },
      { discrete: true },
    );
  });

  it("derives a chapter's NBSP-prefixed \\ca value from altnumber alone", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const withAlt = $createChapterNode("1", undefined, "2");
        withAlt.append($createTextNode(getVisibleOpenMarkerText("c", "1") ?? ""));
        const without = $createChapterNode("3");
        without.append($createTextNode(getVisibleOpenMarkerText("c", "3") ?? ""));
        $getRoot().append(withAlt, without);
        const descriptor = displayRunDescriptor("ca");
        expect(descriptor.expectedPieces(withAlt)).toEqual({
          wantsRun: true,
          valueText: `${NBSP}2`,
        });
        expect(descriptor.expectedPieces(without)).toEqual({
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

  it("reads a note's wrapped \\cat run from its children, anchored after the editable caller", () => {
    // The run rides INSIDE the note (a NoteNode is an ElementNode), directly after the editable
    // caller TextNode — the position `\f + \cat People\cat*` puts the span in the file. The same
    // untranslated-shape trap as the milestone case below applies: every ScannedRun field is
    // optional, so a scan that anchors wrongly (or returns another shape) type-checks clean and
    // reads as permanently empty — this toEqual is the net.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const note = $createNoteNode("f", "+", false, "People");
        const wrapper = $createAttributeRunNode("cat");
        const opener = $createMarkerNode("cat");
        const value = $createTextNode(`${NBSP}People`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("cat", "closing");
        wrapper.append(opener, value, closer);
        note.append(
          $createMarkerNode("f"),
          $createTextNode(getEditableCallerText("+")),
          wrapper,
          $createTextNode("note body"),
          $createMarkerNode("f", "closing"),
        );
        $getRoot().append($createParaNode("p").append(note));
        expect(displayRunDescriptor("cat").scanPieces(note)).toEqual({
          opener,
          value,
          closer,
          wrapper,
        });
      },
      { discrete: true },
    );
  });

  it("reads a chapter's wrapped \\ca run from its children, anchored after the \\c glyph text", () => {
    // Same untranslated-shape trap as the note/milestone cases: an anchor mistake compiles clean
    // and reads permanently empty. The run rides inside the editable ChapterNode (an ElementNode)
    // directly after its `\c N` glyph TextNode — the same-line file position `\c 1 \ca 2\ca*`.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const chapter = $createChapterNode("1", undefined, "2");
        const wrapper = $createAttributeRunNode("ca");
        const opener = $createMarkerNode("ca");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("ca", "closing");
        wrapper.append(opener, value, closer);
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1") ?? ""), wrapper);
        $getRoot().append(chapter);
        expect(displayRunDescriptor("ca").scanPieces(chapter)).toEqual({
          opener,
          value,
          closer,
          wrapper,
        });
      },
      { discrete: true },
    );
  });

  it("finds no \\cat pieces on a collapsed note, whose caller is not the editable anchor", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        // A collapsed note's caller is a DecoratorNode the anchor scan does not recognize, so the
        // scan reports no pieces — even if stray cat-shaped children were somehow present.
        const note = $createNoteNode("f", "+", true, "People");
        note.append($createTextNode("collapsed body"));
        $getRoot().append($createParaNode("p").append(note));
        expect(displayRunDescriptor("cat").scanPieces(note)).toEqual({});
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

describe("displayRunRegistry sees damaged glyph BYTES, not just node state", () => {
  // Editing a glyph's characters rewrites only its text: `marker` and `markerSyntax` are stored
  // fields that no text edit touches. A scan that reads state alone therefore reports a `\va` whose
  // `*` the user just deleted as a perfectly good closer, so the run reads canonical to the
  // registry while the marker engine holds that same glyph pending — the disagreement that silently
  // suppressed the run's mid-edit caret grace and let the settle re-tokenize the paragraph out from
  // under the caret. Byte-damaged glyphs must be reported ABSENT so the run diverges.

  it("drops a \\va closer whose `*` was deleted, and reports the run diverged", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
        const wrapper = $createAttributeRunNode("va");
        const opener = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("va", "closing");
        $getRoot().append(
          $createParaNode("p").append(verse, wrapper.append(opener, value, closer)),
        );

        closer.setTextContent("\\va"); // the user deletes the `*`
        // State is untouched — this is exactly why a state-only scan is fooled.
        expect(closer.getMarker()).toBe("va");
        expect(closer.getMarkerSyntax()).toBe("closing");

        const descriptor = displayRunDescriptor("va");
        const pieces = descriptor.scanPieces(verse);
        expect(pieces.closer).toBeUndefined();
        expect(pieces).toEqual({ opener, value, closer: undefined, wrapper });
        expect($runDiverges(descriptor, pieces, descriptor.expectedPieces(verse))).toBe(true);
      },
      { discrete: true },
    );
  });

  it("drops a \\va opener whose backslash was deleted", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
        const wrapper = $createAttributeRunNode("va");
        const opener = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("va", "closing");
        $getRoot().append(
          $createParaNode("p").append(verse, wrapper.append(opener, value, closer)),
        );

        opener.setTextContent("va");

        const descriptor = displayRunDescriptor("va");
        const pieces = descriptor.scanPieces(verse);
        // The scan runs in fixed order, so a dropped opener leaves the cursor on the opener's own
        // node — which is not attribute-tagged text, so nothing downstream is misread as the value.
        expect(pieces.opener).toBeUndefined();
        expect(pieces.value).toBeUndefined();
        expect($runDiverges(descriptor, pieces, descriptor.expectedPieces(verse))).toBe(true);
      },
      { discrete: true },
    );
  });

  it("drops a milestone's self-closing glyph whose `*` was deleted", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const milestone = $createMilestoneNode("qt-s", "q1");
        const wrapper = $createAttributeRunNode("milestone");
        const opener = $createMarkerNode("qt-s", "opening");
        const value = $createTextNode(`${NBSP}|sid="q1"`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("", "selfClosing");
        $getRoot().append(
          $createParaNode("p").append(milestone, wrapper.append(opener, value, closer)),
        );

        closer.setTextContent("\\");

        const descriptor = displayRunDescriptor("milestone");
        const pieces = descriptor.scanPieces(milestone);
        expect(pieces.closer).toBeUndefined();
        expect($runDiverges(descriptor, pieces, descriptor.expectedPieces(milestone))).toBe(true);
      },
      { discrete: true },
    );
  });

  it("keeps a NESTED span's `\\+w*` closer, whose canonical bytes carry the `+`", () => {
    // The canonical form is (marker, syntax, nesting) — not `\marker*` — so a nested glyph must
    // not be mistaken for a damaged one. Nothing else in the registry distinguishes them.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
        const wrapper = $createAttributeRunNode("va");
        const opener = $createMarkerNode("va", "opening", true);
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        const closer = $createMarkerNode("va", "closing", true);
        $getRoot().append(
          $createParaNode("p").append(verse, wrapper.append(opener, value, closer)),
        );

        expect(closer.getTextContent()).toBe("\\+va*");
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
});

describe("displayRunDescriptor lookup", () => {
  it("throws for an unregistered kind, naming it in the message", () => {
    // Every DisplayRunKind is registered as of this task (separator/nestedGlyph were the last
    // two), so the only way to reach the throw is a kind outside the union entirely — pins both
    // the throw and the documented message shape (displayRunRegistry.ts's doc comment).
    // @ts-expect-error ts(2345) - deliberately outside the DisplayRunKind union to exercise the throw
    expect(() => displayRunDescriptor("bogus")).toThrow(
      'No display-run descriptor registered for kind "bogus"',
    );
  });
});

describe("every registered kind declares every duty", () => {
  it("covers separators and nested glyphs, and gives nested glyphs no edit surface", () => {
    // A kind joins the registry by declaring all eight duties. Nested glyphs declare theirs as
    // "no pend, no deletion, kind-owned writer" — an explicit decision, not an absent quadrant.
    const separator = displayRunDescriptor("separator");
    expect(separator.settleScope).toBe("owner");
    expect(separator.deletionPolicy).toBe("retokenize");
    expect(separator.byteFormat.writer).toBe("kind-owned");

    const nestedGlyph = displayRunDescriptor("nestedGlyph");
    expect(nestedGlyph.settleScope).toBe("none");
    expect(nestedGlyph.deletionPolicy).toBe("none");
    expect(nestedGlyph.byteFormat.writer).toBe("kind-owned");
  });

  it("registers every DisplayRunKind exactly once", () => {
    const kinds = displayRunDescriptors.map((descriptor) => descriptor.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "char",
        "va",
        "vp",
        "milestone",
        "optbreak",
        "opaqueUnknown",
        "separator",
        "nestedGlyph",
      ]),
    );
  });
});
