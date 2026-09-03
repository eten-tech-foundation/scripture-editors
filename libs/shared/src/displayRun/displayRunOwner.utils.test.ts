import { $ownerOfRunPiece } from "./displayRunOwner.utils.js";
import { $createAttributeRunNode, AttributeRunNode } from "../nodes/usj/AttributeRunNode.js";
import { $createCharNode, CharNode } from "../nodes/usj/CharNode.js";
import { $createMilestoneNode, MilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { getEditableCallerText, getVisibleOpenMarkerText } from "../nodes/usj/node.utils.js";
import { $createNoteNode } from "../nodes/usj/NoteNode.js";
import { $createParaNode } from "../nodes/usj/ParaNode.js";
import { createBasicTestEnvironment } from "../nodes/usj/test.utils.js";
import { $createVerseNode, VerseNode } from "../nodes/usj/VerseNode.js";
import {
  $createImmutableTypedTextNode,
  ImmutableTypedTextNode,
} from "../nodes/features/ImmutableTypedTextNode.js";
import { $createMarkerNode } from "../nodes/features/MarkerNode.js";
import { $createUnknownNode, UnknownNode } from "../nodes/features/UnknownNode.js";
import { textTypeState } from "../nodes/collab/delta.state.js";
import { $createTextNode, $getRoot, $setState, LexicalNode, TextNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("$ownerOfRunPiece", () => {
  describe("char span attribute run", () => {
    it("classifies a CharNode's direct-child attribute TextNode as owned by that CharNode", () => {
      const { editor } = createBasicTestEnvironment();
      let charNode!: CharNode;
      let attributeRun!: TextNode;
      editor.update(
        () => {
          charNode = $createCharNode("w");
          const opening = $createMarkerNode("w", "opening");
          const content = $createTextNode("grace");
          attributeRun = $createTextNode("|gloss");
          $setState(attributeRun, textTypeState, "attribute");
          const closing = $createMarkerNode("w", "closing");
          charNode.append(opening, content, attributeRun, closing);
          $getRoot().append($createParaNode("p").append(charNode));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(attributeRun)?.owner.getKey()).toBe(charNode.getKey());
      });
    });
  });

  describe("verse \\va/\\vp run", () => {
    it("classifies the \\va attribute-value TextNode as owned by the VerseNode", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaValue!: TextNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaOpen = $createMarkerNode("va", "opening");
          vaValue = $createTextNode(`${NBSP}1a`);
          $setState(vaValue, textTypeState, "attribute");
          const vaClose = $createMarkerNode("va", "closing");
          $getRoot().append(
            $createParaNode("p").append(verse, vaOpen, vaValue, vaClose, $createTextNode(" text")),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vaValue)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("classifies the \\va closing glyph as owned by the VerseNode, walking back over the value and opening glyph", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaClose!: LexicalNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaOpen = $createMarkerNode("va", "opening");
          const vaValue = $createTextNode(`${NBSP}1a`);
          $setState(vaValue, textTypeState, "attribute");
          vaClose = $createMarkerNode("va", "closing");
          $getRoot().append($createParaNode("p").append(verse, vaOpen, vaValue, vaClose));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vaClose)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("classifies a \\vp opening glyph chained after \\va's full run as owned by the VerseNode", () => {
      // Mirrors attributeDisplay.utils.ts's documented chaining: \vp's triplet sits directly
      // after \va's closer, back-to-back — so destroying \vp's opener must walk back over the
      // whole \va run (closer, value, opener) to reach the verse.
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vpOpen!: LexicalNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaOpen = $createMarkerNode("va", "opening");
          const vaValue = $createTextNode(`${NBSP}1a`);
          $setState(vaValue, textTypeState, "attribute");
          const vaClose = $createMarkerNode("va", "closing");
          vpOpen = $createMarkerNode("vp", "opening");
          const vpValue = $createTextNode(`${NBSP}1`);
          $setState(vpValue, textTypeState, "attribute");
          const vpClose = $createMarkerNode("vp", "closing");
          $getRoot().append(
            $createParaNode("p").append(verse, vaOpen, vaValue, vaClose, vpOpen, vpValue, vpClose),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vpOpen)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("returns undefined for ORDINARY text riding directly after a complete loose \\va run", () => {
      // The verse text that follows a settled `\va …\va*` run is plain content, not a run piece:
      // its previous sibling happens to be the run's closing glyph, but position alone must not
      // make it one. Recognizing it would pend the verse for a deletion in ordinary content —
      // a whole-paragraph settle and rebuild for an edit the run has nothing to do with.
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaValue!: TextNode;
      let verseText!: TextNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaOpen = $createMarkerNode("va", "opening");
          vaValue = $createTextNode(`${NBSP}1a`);
          $setState(vaValue, textTypeState, "attribute");
          const vaClose = $createMarkerNode("va", "closing");
          verseText = $createTextNode(" This verse.");
          $getRoot().append(
            $createParaNode("p").append(verse, vaOpen, vaValue, vaClose, verseText),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(verseText)).toBeUndefined();
        // Positive control, same tree: the run's own attribute-tagged VALUE still resolves, so
        // the refusal above is the untagged text being rejected, not the walk going blind.
        expect($ownerOfRunPiece(vaValue)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("returns undefined when ordinary content sits between the piece and a verse", () => {
      // verse, then plain text, then a stray attribute-tagged TextNode: the walk must stop at
      // the plain text and return undefined, never crossing ordinary content to reach the verse.
      const { editor } = createBasicTestEnvironment();
      let strayAttrText!: TextNode;
      editor.update(
        () => {
          const verse = $createVerseNode("1");
          const plainText = $createTextNode("In the beginning ");
          strayAttrText = $createTextNode("|stray");
          $setState(strayAttrText, textTypeState, "attribute");
          $getRoot().append($createParaNode("p").append(verse, plainText, strayAttrText));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(strayAttrText)).toBeUndefined();
      });
    });
  });

  describe("milestone run", () => {
    it("classifies the attribute TextNode as owned by the MilestoneNode", () => {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let attributeText!: TextNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          const opening = $createMarkerNode("qt-s", "opening");
          attributeText = $createTextNode(`${NBSP}|sid="q1"`);
          $setState(attributeText, textTypeState, "attribute");
          const closing = $createMarkerNode("", "selfClosing");
          $getRoot().append(
            $createParaNode("p").append(
              $createTextNode("before "),
              milestone,
              opening,
              attributeText,
              closing,
            ),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(attributeText)?.owner.getKey()).toBe(milestone.getKey());
      });
    });

    it("classifies the milestone's own opening glyph — its immediate following sibling — as owned by the MilestoneNode", () => {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let opening!: LexicalNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          opening = $createMarkerNode("qt-s", "opening");
          const closing = $createMarkerNode("", "selfClosing");
          $getRoot().append($createParaNode("p").append(milestone, opening, closing));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(opening)?.owner.getKey()).toBe(milestone.getKey());
      });
    });

    it("classifies the self-closing glyph as owned by the MilestoneNode, walking back over the attribute text and opening glyph", () => {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let closing!: LexicalNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          const opening = $createMarkerNode("qt-s", "opening");
          const attributeText = $createTextNode(`${NBSP}|sid="q1"`);
          $setState(attributeText, textTypeState, "attribute");
          closing = $createMarkerNode("", "selfClosing");
          $getRoot().append(
            $createParaNode("p").append(milestone, opening, attributeText, closing),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(closing)?.owner.getKey()).toBe(milestone.getKey());
      });
    });
  });

  describe("optbreak", () => {
    it("classifies a TextNode child of an optbreak UnknownNode as owned by that UnknownNode", () => {
      const { editor } = createBasicTestEnvironment();
      let unknownNode!: UnknownNode;
      let tokenText!: TextNode;
      editor.update(
        () => {
          unknownNode = $createUnknownNode("optbreak");
          tokenText = $createTextNode("//");
          unknownNode.append(tokenText);
          $getRoot().append(
            $createParaNode("p").append($createTextNode("a "), unknownNode, $createTextNode(" b")),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(tokenText)?.owner.getKey()).toBe(unknownNode.getKey());
      });
    });

    it("classifies an ImmutableTypedTextNode child of an optbreak UnknownNode as owned by that UnknownNode", () => {
      // The shape the adaptor actually builds (usj-editor.adaptor.ts's `createUnknown`, via
      // `unknownDisplayParts`'s `//` opening bytes): a read-only, token-mode DecoratorNode, not a
      // plain TextNode. `$isTextNode` (an `instanceof TextNode` check) never matches it, so
      // without recognizing this node kind too, a real deletion of the token would go
      // unclassified and the mutation listener would never pend the UnknownNode.
      const { editor } = createBasicTestEnvironment();
      let unknownNode!: UnknownNode;
      let tokenText!: ImmutableTypedTextNode;
      editor.update(
        () => {
          unknownNode = $createUnknownNode("optbreak");
          tokenText = $createImmutableTypedTextNode("marker", "//");
          unknownNode.append(tokenText);
          $getRoot().append(
            $createParaNode("p").append($createTextNode("a "), unknownNode, $createTextNode(" b")),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(tokenText)?.owner.getKey()).toBe(unknownNode.getKey());
      });
    });
  });

  describe("AttributeRunNode wrapper (dual-read)", () => {
    it("classifies a destroyed milestone wrapper as owned by the preceding MilestoneNode", () => {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let wrapper!: AttributeRunNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          wrapper = $createAttributeRunNode("milestone");
          wrapper.append(
            $createMarkerNode("qt-s", "opening"),
            $createMarkerNode("", "selfClosing"),
          );
          $getRoot().append($createParaNode("p").append(milestone, wrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(wrapper)?.owner.getKey()).toBe(milestone.getKey());
      });
    });

    it("classifies a destroyed piece whose PREV-STATE PARENT is a milestone wrapper as that wrapper's owner", () => {
      const { editor } = createBasicTestEnvironment();
      let milestone!: MilestoneNode;
      let attributeText!: TextNode;
      editor.update(
        () => {
          milestone = $createMilestoneNode("qt-s", "q1");
          const wrapper = $createAttributeRunNode("milestone");
          const opening = $createMarkerNode("qt-s", "opening");
          attributeText = $createTextNode(`${NBSP}|sid="q1"`);
          $setState(attributeText, textTypeState, "attribute");
          const closing = $createMarkerNode("", "selfClosing");
          wrapper.append(opening, attributeText, closing);
          $getRoot().append($createParaNode("p").append(milestone, wrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        // attributeText's own previous sibling (the opening glyph) is only meaningful relative to
        // OTHER pieces inside the wrapper — the walk must start from the WRAPPER's position, not
        // attributeText's own, to reach the milestone.
        expect($ownerOfRunPiece(attributeText)?.owner.getKey()).toBe(milestone.getKey());
      });
    });

    it("classifies a destroyed verse wrapper as owned by the preceding VerseNode", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaWrapper!: AttributeRunNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          vaWrapper = $createAttributeRunNode("va");
          vaWrapper.append($createMarkerNode("va", "opening"), $createMarkerNode("va", "closing"));
          $getRoot().append($createParaNode("p").append(verse, vaWrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vaWrapper)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("classifies a destroyed \\vp wrapper as owned by the VerseNode, walking back over a preceding \\va wrapper", () => {
      // Mixed-shape tree: \va is wrapped, \vp is a SEPARATE wrapper directly after it — mirrors
      // AttributeRunNode.ts's documented chaining (a \vp wrapper follows the \va wrapper, not the
      // verse directly) one level up from the loose-pieces chaining pin in this file already.
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vpWrapper!: AttributeRunNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaWrapper = $createAttributeRunNode("va");
          vaWrapper.append($createMarkerNode("va", "opening"), $createMarkerNode("va", "closing"));
          vpWrapper = $createAttributeRunNode("vp");
          vpWrapper.append($createMarkerNode("vp", "opening"), $createMarkerNode("vp", "closing"));
          $getRoot().append($createParaNode("p").append(verse, vaWrapper, vpWrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vpWrapper)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("classifies a destroyed piece whose PREV-STATE PARENT is a \\va wrapper as that wrapper's owner", () => {
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vaValue!: TextNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaWrapper = $createAttributeRunNode("va");
          const vaOpen = $createMarkerNode("va", "opening");
          vaValue = $createTextNode(`${NBSP}1a`);
          $setState(vaValue, textTypeState, "attribute");
          const vaClose = $createMarkerNode("va", "closing");
          vaWrapper.append(vaOpen, vaValue, vaClose);
          $getRoot().append($createParaNode("p").append(verse, vaWrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vaValue)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("classifies a LOOSE \\vp opening glyph chained behind a \\va WRAPPER as owned by the VerseNode", () => {
      // Mid-migration mixed shape: \va already wrapped, \vp still loose (riding directly after
      // the \va wrapper). The walk-back from the loose \vp piece must cross the WHOLE \va
      // wrapper in one step to reach the verse.
      const { editor } = createBasicTestEnvironment();
      let verse!: VerseNode;
      let vpOpen!: LexicalNode;
      editor.update(
        () => {
          verse = $createVerseNode("1");
          const vaWrapper = $createAttributeRunNode("va");
          vaWrapper.append($createMarkerNode("va", "opening"), $createMarkerNode("va", "closing"));
          vpOpen = $createMarkerNode("vp", "opening");
          const vpValue = $createTextNode(`${NBSP}1`);
          $setState(vpValue, textTypeState, "attribute");
          const vpClose = $createMarkerNode("vp", "closing");
          $getRoot().append(
            $createParaNode("p").append(verse, vaWrapper, vpOpen, vpValue, vpClose),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(vpOpen)?.owner.getKey()).toBe(verse.getKey());
      });
    });

    it("returns undefined for a destroyed wrapper with no owner before it", () => {
      const { editor } = createBasicTestEnvironment();
      let wrapper!: AttributeRunNode;
      editor.update(
        () => {
          wrapper = $createAttributeRunNode("milestone");
          wrapper.append($createMarkerNode("qt-s", "opening"));
          $getRoot().append(
            $createParaNode("p").append($createTextNode("In the beginning "), wrapper),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(wrapper)).toBeUndefined();
      });
    });

    it("returns undefined for a milestone wrapper preceded by loose run-piece debris (a wrapper requires DIRECT adjacency, never a chain walk)", () => {
      // The builder invariant is that a wrapper is always created/healed directly after its
      // milestone — this loose-debris-then-wrapper shape never occurs at rest. Pinned anyway: the
      // wrapper arm of the walk deliberately does not fall back to $milestoneOfLooseChain, so a
      // future regression that re-adds a chain walk for wrapper starts would silently start
      // resolving this shape instead of refusing it.
      const { editor } = createBasicTestEnvironment();
      let wrapper!: AttributeRunNode;
      editor.update(
        () => {
          const milestone = $createMilestoneNode("qt-s", "q1");
          const looseDebris = $createMarkerNode("qt-s", "opening");
          wrapper = $createAttributeRunNode("milestone");
          wrapper.append(
            $createMarkerNode("qt-s", "opening"),
            $createMarkerNode("", "selfClosing"),
          );
          $getRoot().append($createParaNode("p").append(milestone, looseDebris, wrapper));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(wrapper)).toBeUndefined();
      });
    });
  });

  describe("negatives", () => {
    it("returns undefined for plain paragraph text", () => {
      const { editor } = createBasicTestEnvironment();
      let plainText!: TextNode;
      editor.update(
        () => {
          plainText = $createTextNode("hello");
          $getRoot().append($createParaNode("p").append(plainText));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(plainText)).toBeUndefined();
      });
    });

    it("returns undefined for a para-prefix glyph with no preceding milestone", () => {
      const { editor } = createBasicTestEnvironment();
      let prefixGlyph!: LexicalNode;
      editor.update(
        () => {
          prefixGlyph = $createMarkerNode("p", "opening");
          $getRoot().append(
            $createParaNode("p").append(prefixGlyph, $createTextNode("In the beginning")),
          );
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(prefixGlyph)).toBeUndefined();
      });
    });

    it("returns undefined for a note's caller text", () => {
      const { editor } = createBasicTestEnvironment();
      let callerText!: TextNode;
      editor.update(
        () => {
          const note = $createNoteNode("f", "+");
          callerText = $createTextNode(getEditableCallerText("+"));
          note.append(callerText);
          $getRoot().append($createParaNode("p").append(note));
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        expect($ownerOfRunPiece(callerText)).toBeUndefined();
      });
    });
  });
});

describe("$ownerOfRunPiece marker identity", () => {
  it("refuses a verse whose chain to the destroyed piece crosses a foreign glyph", () => {
    // A run piece's owner is only the owner when EVERY sibling between them is a piece of that
    // same kind's run. A `\nd` opener is not a `\va`/`\vp` run piece, so a value behind one is
    // not the verse's run — claiming it would pend a verse for a deletion in unrelated content.
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
        const foreign = $createMarkerNode("nd", "opening");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append($createParaNode("p").append(verse, foreign, value));
        expect($ownerOfRunPiece(value)).toBeUndefined();
      },
      { discrete: true },
    );
  });

  it("still crosses a preceding \\va wrapper to reach the verse owning a \\vp piece", () => {
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
        vaWrapper.append(
          $createMarkerNode("va", "opening"),
          vaValue,
          $createMarkerNode("va", "closing"),
        );
        const vpWrapper = $createAttributeRunNode("vp");
        const vpValue = $createTextNode(`${NBSP}3`);
        $setState(vpValue, textTypeState, "attribute");
        vpWrapper.append(
          $createMarkerNode("vp", "opening"),
          vpValue,
          $createMarkerNode("vp", "closing"),
        );
        $getRoot().append($createParaNode("p").append(verse, vaWrapper, vpWrapper));
        expect($ownerOfRunPiece(vpValue)).toEqual({ owner: verse, kind: "vp" });
      },
      { discrete: true },
    );
  });
});

describe("$ownerOfRunPiece milestone marker identity", () => {
  it("refuses a milestone whose adjacent glyph carries a different marker", () => {
    // Mirror of the verse case above: a milestone's run has only one marker throughout, so an
    // opening glyph riding directly after the milestone must carry the SAME marker to count as
    // that milestone's own run piece. A foreign `\nd` opener must not classify the milestone as
    // its owner — the mirror image of the bug this task exists to fix.
    const { editor } = createBasicTestEnvironment();
    let foreignOpener!: LexicalNode;
    editor.update(
      () => {
        const milestone = $createMilestoneNode("qt-s", "q1");
        foreignOpener = $createMarkerNode("nd", "opening");
        $getRoot().append(
          $createParaNode("p").append(
            milestone,
            foreignOpener,
            $createTextNode("in the beginning"),
          ),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($ownerOfRunPiece(foreignOpener)).toBeUndefined();
    });
  });

  it("still resolves a matching-marker opening glyph riding directly after the milestone", () => {
    const { editor } = createBasicTestEnvironment();
    let milestone!: MilestoneNode;
    let matchingOpener!: LexicalNode;
    editor.update(
      () => {
        milestone = $createMilestoneNode("qt-s", "q1");
        matchingOpener = $createMarkerNode("qt-s", "opening");
        const attributeText = $createTextNode(`${NBSP}|sid="q1"`);
        $setState(attributeText, textTypeState, "attribute");
        const closing = $createMarkerNode("", "selfClosing");
        $getRoot().append(
          $createParaNode("p").append(milestone, matchingOpener, attributeText, closing),
        );
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($ownerOfRunPiece(matchingOpener)).toEqual({ owner: milestone, kind: "milestone" });
    });
  });
});
