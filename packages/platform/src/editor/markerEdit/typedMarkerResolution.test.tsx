/**
 * Typed-marker resolution timing: a literal marker typed character-by-character into body text
 * must NOT resolve until the user supplies a terminator (space/NBSP or `*`) or genuinely departs.
 *
 * The live failure ("typing \va after a verse resolves at \v into a red unknown paragraph") was a
 * caret-shield gap, reproduced in a real browser: a literal the user is mid-typing is not always
 * ONE text node. Typing `\` at a verse glyph's end goes through $verseNodeTransform's rest split,
 * which parked the `\` in its own node; the next keystroke landed in yet another node (a
 * boundary-point insertion whose format/style difference also blocks Lexical's text-node merge),
 * and the resolve's single-node caret shield read the pended `\` sibling as departed — settling
 * it mid-word and gluing `\vbut…` together in the rebuild fragment, where the tokenizer resolves
 * a terminated unknown marker and splits the paragraph. Two fixes, both pinned here: the verse
 * split merges its rest into a following plain text node, and the shield covers the caret's
 * whole contiguous plain-text run.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  $appendVersePara,
  requireDefined,
  testEnvironment,
  viewOptions,
} from "./markerEdit.test-helpers";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { act } from "@testing-library/react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, TextNode } from "lexical";
import { $isCharNode, $isParaNode } from "shared";

function $bodyText(): TextNode {
  const para = $getRoot().getChildren().filter($isParaNode)[0];
  const text = para
    .getChildren()
    .filter($isTextNode)
    .find((n) => n.getTextContent().includes("In the beginning"));
  return requireDefined(text, "body text missing");
}

function $typeAtCaret(text: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
  selection.insertText(text);
}

describe("typing \\va mid-text after a verse", () => {
  it("keeps every unterminated prefix literal and pending — nothing resolves mid-word", async () => {
    const { editor } = await testEnvironment(() => $appendVersePara());
    await act(async () => editor.update(() => $bodyText().select(0, 0)));
    for (const ch of "\\va") {
      await act(async () => editor.update(() => $typeAtCaret(ch)));
      editor.getEditorState().read(() => {
        // One paragraph throughout: no unknown-marker split, no phantom paragraph.
        expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
      });
    }
    editor.getEditorState().read(() => {
      // The literal rides in the text exactly as typed, caret still inside it.
      expect($getRoot().getTextContent()).toContain("\\vaIn the beginning");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().getTextContent()).toBe("\\vaIn the beginning");
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("merges a verse-split literal into the following text so the caret shield covers it", async () => {
    // Typing `\` with the caret at the END of the verse glyph goes through
    // $verseNodeTransform's rest-split. Splitting the `\` into its OWN node fragmented the
    // literal across siblings: the next keystroke landed in yet another node, the caret shield
    // (which protects only the caret's node) no longer covered the pended `\`, and the deferred
    // resolve settled it mid-word — gluing `\vbut…` together in the fragment and splitting off
    // a red unknown paragraph (the live repro). The rest must merge into the following plain
    // text node instead, so the literal stays ONE node under the caret.
    const { editor } = await testEnvironment(() => $appendVersePara());
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const verse = requireDefined(
          para.getChildren().find((n) => n.getType() === "verse"),
          "verse missing",
        ) as TextNode;
        verse.select(verse.getTextContentSize(), verse.getTextContentSize());
        $typeAtCaret("\\");
      }),
    );
    editor.getEditorState().read(() => {
      const body = $bodyText();
      expect(body.getTextContent()).toBe("\\In the beginning");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.key).toBe(body.getKey());
      expect(selection.anchor.offset).toBe(1);
    });
  });

  it("never settles a pended literal in a SIBLING node of the caret mid-word", async () => {
    // The live repro's exact fragmented shape: the `\` literal in its own node with the caret in
    // the just-typed `v` node beside it. Live, transform-created nodes (the verse split) and
    // boundary-point insertions leave the run fragmented across commits; jsdom's editor.update
    // paths merge adjacent plain nodes eagerly, so the state loads through the serialized route,
    // which never normalizes. The departure resolve must shield the whole contiguous literal run
    // around the caret, not just the caret's node — a single-node shield read the `\` as
    // departed and settled it mid-word, gluing `\vIn…` together in the rebuild fragment and
    // splitting off a red unknown paragraph.
    const text = (t: string, extra: object = {}) => ({
      type: "text",
      text: t,
      detail: 0,
      format: 0,
      mode: "normal",
      style: "",
      version: 1,
      ...extra,
    });
    const state = {
      root: {
        type: "root",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "para",
            marker: "p",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              { ...text("\\p"), type: "marker", marker: "p", markerSyntax: "opening" },
              text("\u00A0", { mode: "token", $: { textType: "marker-trailing-space" } }),
              { ...text("\\v 1 "), type: "verse", marker: "v", number: "1" },
              // A distinct style keeps the fragment unmergeable, as live boundary-point
              // insertions leave it (normalization refuses cross-format/style merges).
              text("\\", { style: "color: inherit" }),
              text("v"),
              text("In the beginning"),
            ],
          },
        ],
      },
    };
    const { editor } = await baseTestEnvironment(
      JSON.stringify(state),
      <MarkerEditPlugin viewOptions={viewOptions} />,
    );
    // The caret sits in the typed fragment, and dirtying the `\` fragment stands in for the
    // commit that created it (setEditorState runs no transforms, so the pend must be re-derived
    // exactly as a real keystroke's commit would have left it).
    await act(async () =>
      editor.update(() => {
        const children = $getRoot().getChildren().filter($isParaNode)[0].getChildren();
        const backslash = requireDefined(
          children.find((n) => $isTextNode(n) && n.getTextContent() === "\\"),
          "backslash fragment missing",
        );
        // The typed fragment may have merged forward with the body text at mount (both are
        // plain); the caret sits after its first character either way.
        const typed = requireDefined(
          children.find((n) => $isTextNode(n) && n.getTextContent().startsWith("v")),
          "typed fragment missing",
        ) as TextNode;
        backslash.markDirty();
        typed.select(1, 1);
      }),
    );
    await act(async () => Promise.resolve());
    editor.getEditorState().read(() => {
      // One paragraph, no unknown-marker split, both literal fragments intact.
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
      expect($getRoot().getTextContent()).toContain("\\vIn the beginning");
    });
  });

  it("resolves on the typed terminator into a char span where the marker was typed", async () => {
    const { editor } = await testEnvironment(() => $appendVersePara());
    await act(async () => editor.update(() => $bodyText().select(0, 0)));
    for (const ch of "\\va ") await act(async () => editor.update(() => $typeAtCaret(ch)));
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      // `\va` with no closer is a standalone unclosed char span holding the following text —
      // NOT a resolved `\v` and NOT an attribute fold (that needs `\va*` with content).
      const va = paras[0].getChildren().filter($isCharNode)[0];
      expect(va.getMarker()).toBe("va");
      expect(va.getUnknownAttributes()?.closed).toBe("false");
      expect(va.getTextContent()).toContain("In the beginning");
    });
  });
});
