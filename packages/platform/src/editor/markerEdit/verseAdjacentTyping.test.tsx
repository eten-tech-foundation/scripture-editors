/**
 * Typed characters at engine-owned whitespace sites — the shared verse-adjacent repro, pinned
 * from both of its halves:
 *
 * BYTES (mounted over the full transform-registering plugin trio):
 *
 * - A space typed next to a verse INSERTS a space on screen (it must not be absorbed into the
 *   engine-maintained structural space, and the caret must not skip past one). The data-side
 *   collapse of the resulting run happens at SERIALIZATION, matching Paratext 9's on-reformat
 *   timing (whitespaceDisplay.utils.ts's map): the screen keeps what the user typed, the USJ
 *   normalizes the run — deliberate PT9 `AllowInvisibleChars=false` semantics, not a silent
 *   no-op, because the byte is visible and editable until a reformat event.
 * - Leading-attribute whitespace collapses: whitespace between `\v` and its number is structural
 *   (the markers map's `leadingAttributes` rule), so an extra typed space cannot demote the
 *   number — `\v  5` is verse 5. Only a NON-SPACE character after the number demotes: `\v 7 5`
 *   is verse 7 followed by body text `5`.
 * - Typing a character inside the verse glyph settles to the WRITER-CANONICAL byte form: with
 *   `\v 2 Da` and a `\` typed between `2` and the space, the settled document is verse 2 plus
 *   text `\ Da` — the space between the number and the literal is the verse's structural
 *   leading-attribute space the USFM writer emits regardless, so no byte exists in the output
 *   that a save would not reproduce.
 *
 * CARET (mounted over the marker-edit engine only, so the byte transforms cannot interfere; no
 * assertion about spacing around the extracted character):
 *
 * - at the glyph END (`\v 1 \`): the existing Tier-1 extraction handles it and the caret is
 *   placed after the extracted character — pinned here so it stays that way.
 * - between the number and the separator space (`\v 1\ `): the verse regex could not express
 *   a rest that begins WITHOUT a separator, so the node fell through to a whole-paragraph
 *   Tier-2 rebuild whose caret restore dropped the caret at the PARAGRAPH START — three words
 *   away from the typed character. Tier 1 must extract this shape too: same resulting tree,
 *   caret kept at the character the user just typed.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $appendVersePara, testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  VerseNode,
} from "shared";
import { CharNodePlugin, TextSpacingPlugin } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  baseTestEnvironment,
  typeTextAtSelection,
} from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

async function mount($init: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $init,
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
    </>,
  );
}

function currentParaUsj(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
  return usj?.content?.[0];
}

describe("typed characters at verse boundaries", () => {
  it("a space typed before a verse inserts on screen; serialization collapses the run", async () => {
    let text: TextNode;
    const { editor } = await mount(() => {
      text = $createTextNode("In the beginning ");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createVerseNode("1", getVisibleOpenMarkerText("v", "1")),
          text,
          $createVerseNode("2", getVisibleOpenMarkerText("v", "2")),
          $createTextNode("rest"),
        ),
      );
    });
    // Caret at the end of the run, directly before verse 2 — where the engine already maintains
    // the structural space.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, " ", text!, "In the beginning ".length);

    editor.getEditorState().read(() => {
      // The keystroke changed the displayed bytes: two space glyphs now precede the verse. Not
      // absorbed, not caret-skipped.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(text!.getTextContent().length).toBe("In the beginning ".length + 1);
    });
    // Data side: the run collapses at serialization (PT9 reformat timing) back to the single
    // structural space.
    const para = currentParaUsj(editor);
    expect(typeof para === "object" && para.content?.[1]).toBe("In the beginning ");
  });

  it("an extra space typed inside the verse glyph cannot demote the number", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          verse,
          $createTextNode("body"),
        ),
      );
    });
    // `\v | 5 ` — a second space before the number: leading-attribute whitespace is structural
    // and collapses, so `\v  5` is still verse 5.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, " ", verse!, 3);

    const para = currentParaUsj(editor);
    expect(typeof para === "object" && para.content).toEqual([
      { type: "verse", marker: "v", number: "5" },
      "body",
    ]);
  });

  it("a non-space character after the number is body text, not part of the number", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("7", getVisibleOpenMarkerText("v", "7"));
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          verse,
          $createTextNode("body"),
        ),
      );
    });
    // `\v 7 |` then type `5 ` — `\v 7 5` is verse 7 followed by text `5`.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "5 ", verse!, 5);

    const para = currentParaUsj(editor);
    expect(typeof para === "object" && para.content).toEqual([
      { type: "verse", marker: "v", number: "7" },
      "5 body",
    ]);
  });

  it("typing a backslash inside the verse glyph settles to the writer-canonical bytes", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("2", getVisibleOpenMarkerText("v", "2"));
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          verse,
          $createTextNode("Da"),
        ),
      );
    });
    // `\v 2|` then type `\`: the bytes `\v 2\ Da` re-tokenize to verse 2 plus the literal. The
    // space between the number and the `\` in the settled output is the verse's structural
    // leading-attribute space — the USFM writer emits it either way, so the output carries no
    // byte a save would not reproduce, and nothing the user typed is lost.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "\\", verse!, 4);

    const para = currentParaUsj(editor);
    expect(typeof para === "object" && para.content).toEqual([
      { type: "verse", marker: "v", number: "2" },
      "\\ Da",
    ]);
  });
});

describe("typed space at the char opener separator", () => {
  it("lands as a visible glyph; serialization collapses to the structural space", async () => {
    let opener: MarkerNode;
    const { editor } = await mount(() => {
      const char = $createCharNode("nd");
      opener = $createMarkerNode("nd");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("x "),
          char.append(opener, $createTextNode(`${NBSP}Lord`), $createMarkerNode("nd", "closing")),
        ),
      );
    });
    // Caret at the opener glyph's end (`\nd|⍽Lord`): the typed space must appear on screen as
    // its own glyph beside the separator, not be absorbed.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, " ", opener!, 3);

    editor.getEditorState().read(() => {
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .filter($isCharNode);
      // Two whitespace glyphs between the opener and "Lord": the typed space and the separator.
      expect(chars[0].getTextContent()).toBe(`\\nd ${NBSP}Lord\\nd*`);
    });
    // Data side: `\nd  Lord` collapses on a reformat event to `\nd Lord` (the one space after
    // the marker is structural), so USJ normalizes to the canonical span.
    const para = currentParaUsj(editor);
    const span = typeof para === "object" ? para.content?.[1] : undefined;
    expect(typeof span === "object" && span.content).toEqual(["Lord"]);
  });
});

/** Types `text` at `offset` inside the verse glyph and returns the post-commit caret. */
async function typeInVerseGlyph(
  editor: LexicalEditor,
  verse: VerseNode,
  offset: number | "end",
  text: string,
): Promise<{ nodeText: string; offset: number; collapsed: boolean }> {
  await act(async () =>
    editor.update(() => {
      const at = offset === "end" ? verse.getTextContentSize() : offset;
      verse.select(at, at);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    }),
  );
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error("no range selection after typing");
    return {
      nodeText: selection.anchor.getNode().getTextContent(),
      offset: selection.anchor.offset,
      collapsed: selection.isCollapsed(),
    };
  });
}

describe("typing a backslash inside the verse glyph", () => {
  it("keeps the caret right after the typed character at the glyph END (existing extraction)", async () => {
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    const caret = await typeInVerseGlyph(editor, verse, "end", "\\");

    // The typed `\` was extracted into content with the caret immediately after it.
    expect(caret.collapsed).toBe(true);
    expect(caret.nodeText.startsWith("\\")).toBe(true);
    expect(caret.offset).toBe(1);
    editor.getEditorState().read(() => {
      // glyph back to canonical
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
    });
  });

  it("keeps the caret right after the typed character BETWEEN the number and the separator", async () => {
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    // `\v 1| ` — between the number and the glyph's display space.
    const caret = await typeInVerseGlyph(editor, verse, 4, "\\");

    expect(caret.collapsed).toBe(true);
    expect(caret.nodeText.startsWith("\\")).toBe(true);
    expect(caret.offset).toBe(1);
    editor.getEditorState().read(() => {
      // The paragraph's shape: canonical verse glyph, then the extracted `\` leading the
      // content — the number was NOT demoted (`\` is a tokenizer name-scan terminator, so it
      // ends the number word rather than joining it).
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      expect(verse.isAttached()).toBe(true);
      expect(verse.getNumber()).toBe("1");
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
      const afterVerse = verse.getNextSibling();
      if (!$isTextNode(afterVerse) || $isMarkerNode(afterVerse))
        throw new Error("expected plain text after the verse");
      expect(afterVerse.getTextContent().startsWith("\\")).toBe(true);
      expect(para.getTextContent()).toContain("In the beginning");
    });
  });

  it("merges the extracted rest into the following content node as ONE node", async () => {
    // Same gesture as the caret pin above, but asserting the TREE: the extracted rest
    // (backslash + former display space) must MERGE into the existing following content node
    // rather than landing as a fresh sibling. A fresh node fragments the literal the user is
    // mid-typing across siblings — the exact shape that starved the resolve's caret shield
    // (see $verseNodeTransform's merge comment) — so both extraction arms must share the one
    // merge-into-following behavior.
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    // `\v 1| ` — between the number and the glyph's display space.
    const caret = await typeInVerseGlyph(editor, verse, 4, "\\");

    // The caret's own node IS the merged content node: `\` + former display space + original
    // content, caret right after the typed character.
    expect(caret.collapsed).toBe(true);
    expect(caret.nodeText).toBe("\\ In the beginning");
    expect(caret.offset).toBe(1);
    editor.getEditorState().read(() => {
      const afterVerse = verse.getNextSibling();
      if (!$isTextNode(afterVerse) || $isMarkerNode(afterVerse))
        throw new Error("expected plain text after the verse");
      expect(afterVerse.getTextContent()).toBe("\\ In the beginning");
      expect(afterVerse.getNextSibling()).toBeNull();
    });
  });

  it("still extends the number when a non-terminator character is typed there", async () => {
    // The leading-attribute rule: only `\`, `|`, whitespace, and `*` end the number's word
    // scan, so typing `a` between the number and the separator EXTENDS the number (PT9
    // GetNextWord takes the whole word, valid or not). Pinned so the backslash special-casing
    // never leaks onto ordinary characters.
    let verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      ({ verse } = $appendVersePara());
    });

    await typeInVerseGlyph(editor, verse, 4, "a");

    editor.getEditorState().read(() => {
      expect(verse.isAttached()).toBe(true);
      expect(verse.getNumber()).toBe("1a");
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1a"));
    });
  });
});
