import { $createCharNode, CharNode } from "./CharNode.js";
import { $ownerOfDestroyedRunPiece } from "./displayRunDeletion.utils.js";
import { $createMilestoneNode, MilestoneNode } from "./MilestoneNode.js";
import { NBSP } from "./node-constants.js";
import { getEditableCallerText } from "./node.utils.js";
import { $createNoteNode } from "./NoteNode.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createVerseNode, VerseNode } from "./VerseNode.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { $createUnknownNode, UnknownNode } from "../features/UnknownNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { $createTextNode, $getRoot, $setState, LexicalNode, TextNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("$ownerOfDestroyedRunPiece", () => {
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
        expect($ownerOfDestroyedRunPiece(attributeRun)?.getKey()).toBe(charNode.getKey());
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
        expect($ownerOfDestroyedRunPiece(vaValue)?.getKey()).toBe(verse.getKey());
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
        expect($ownerOfDestroyedRunPiece(vaClose)?.getKey()).toBe(verse.getKey());
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
        expect($ownerOfDestroyedRunPiece(vpOpen)?.getKey()).toBe(verse.getKey());
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
        expect($ownerOfDestroyedRunPiece(strayAttrText)).toBeUndefined();
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
        expect($ownerOfDestroyedRunPiece(attributeText)?.getKey()).toBe(milestone.getKey());
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
        expect($ownerOfDestroyedRunPiece(opening)?.getKey()).toBe(milestone.getKey());
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
        expect($ownerOfDestroyedRunPiece(closing)?.getKey()).toBe(milestone.getKey());
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
        expect($ownerOfDestroyedRunPiece(tokenText)?.getKey()).toBe(unknownNode.getKey());
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
        expect($ownerOfDestroyedRunPiece(plainText)).toBeUndefined();
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
        expect($ownerOfDestroyedRunPiece(prefixGlyph)).toBeUndefined();
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
        expect($ownerOfDestroyedRunPiece(callerText)).toBeUndefined();
      });
    });
  });
});
