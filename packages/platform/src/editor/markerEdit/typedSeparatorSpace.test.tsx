/**
 * A space typed inside a marker's separator run is inserted, stays visible, and leaves the caret
 * immediately after it.
 *
 * Three reports, one defect with two faces. Both faces come from the engine canonicalizing a glyph
 * around a typed whitespace byte:
 *
 * - In a VERSE glyph the byte is DISCARDED — `$verseNodeTransform` rewrites the glyph to
 *   `getVisibleOpenMarkerText`, and the extra space disappears in that rewrite while the caret
 *   advances one. Pressing space appeared to do nothing but move the cursor.
 * - After a CHAR opener the byte survives, but the caret advances past the structural separator as
 *   well, landing before the content — two positions for one keystroke.
 *
 * Both were deliberate. The verse behavior implements "leading-attribute whitespace is structural
 * and collapses" by deleting the byte rather than letting the writer normalize it; the char
 * behavior comes from `$moveCaretPastMarker`, which exists so that finishing a marker NAME (`\s1`
 * plus the space that terminates it) lands the caret in the content. Neither distinguishes those
 * gestures from a space typed beside a marker that is already complete.
 *
 * The rule these pin: while the user is typing there really are two spaces on screen, so the
 * position between them is a real one and the keystroke that created it must be honored. The file
 * is unaffected either way — the writer emits one structural space regardless — which is the same
 * licence the invariants already give a trailing space at the end of a paragraph. Accepting the
 * keystroke and discarding it is the "no silent no-ops" failure.
 */

import {
  requireDefined,
  testEnvironmentWithDisplaySyncs,
  viewOptions,
} from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

type EditorHandle = Awaited<ReturnType<typeof testEnvironmentWithDisplaySyncs>>["editor"];

function $trailingSpace(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

/** Type one space at `offset` of `node`, as a keystroke does. */
async function typeSpaceAt(editor: EditorHandle, $node: () => TextNode, offset: number) {
  await act(async () => editor.update(() => $node().select(offset, offset)));
  await act(async () =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(" ");
    }),
  );
}

/** The collapsed caret as `<node text>@<offset>`, for a single readable assertion. */
function caretOf(editor: EditorHandle): string {
  let where = "none";
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && selection.isCollapsed())
      where = `${JSON.stringify(selection.anchor.getNode().getTextContent())}@${
        selection.anchor.offset
      }`;
  });
  return where;
}

/** The first paragraph's USJ content — the file side, which none of these keystrokes may change. */
function paraContent(editor: EditorHandle): MarkerObject["content"] {
  initializeDeserialize(undefined);
  const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
  return (usj?.content?.[0] as MarkerObject)?.content;
}

describe("a space typed in a verse marker's separator run", () => {
  /** `\p \v 6 body`. The verse glyph's bytes are `\v` + NBSP + `6` + a trailing space. */
  async function verseEnvironment() {
    return testEnvironmentWithDisplaySyncs(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $trailingSpace(),
          $createVerseNode("6", getVisibleOpenMarkerText("v", "6")),
          $createTextNode("body"),
        ),
      );
    });
  }

  function $verseGlyph(): TextNode {
    const para = $getRoot().getChildren().filter($isParaNode)[0];
    const glyph = para
      .getChildren()
      .find((child) => $isTextNode(child) && child.getTextContent().includes("6"));
    return requireDefined($isTextNode(glyph) ? glyph : undefined, "verse glyph missing");
  }

  it("inserts the space BEFORE the separator and keeps the caret after it", async () => {
    // `\v|` + NBSP + `6` — offset 2, between the marker name and the structural separator.
    const { editor } = await verseEnvironment();
    await typeSpaceAt(editor, $verseGlyph, 2);

    editor
      .getEditorState()
      .read(() => expect($verseGlyph().getTextContent()).toBe(`\\v ${NBSP}6 `));
    expect(caretOf(editor)).toBe(`${JSON.stringify(`\\v ${NBSP}6 `)}@3`);
    // The number is untouched and no byte reached the document: leading-attribute whitespace is
    // structural, so the writer emits one space whatever the screen shows.
    expect(paraContent(editor)).toEqual([{ type: "verse", marker: "v", number: "6" }, "body"]);
  });

  it("inserts the space AFTER the separator and keeps the caret after it", async () => {
    // `\v` + NBSP + `|6` — offset 3, between the structural separator and the number.
    const { editor } = await verseEnvironment();
    await typeSpaceAt(editor, $verseGlyph, 3);

    editor
      .getEditorState()
      .read(() => expect($verseGlyph().getTextContent()).toBe(`\\v${NBSP} 6 `));
    expect(caretOf(editor)).toBe(`${JSON.stringify(`\\v${NBSP} 6 `)}@4`);
    expect(paraContent(editor)).toEqual([{ type: "verse", marker: "v", number: "6" }, "body"]);
  });
});

describe("a space typed at a char opener's end", () => {
  /** `\p \nd things\nd*`, or the same span nested inside `\wj` when `nested` is set. */
  async function charEnvironment(nested: boolean) {
    return testEnvironmentWithDisplaySyncs(() => {
      const nd = $createCharNode("nd").append(
        $createMarkerNode("nd", "opening", nested),
        $createTextNode(`${NBSP}things`),
        $createMarkerNode("nd", "closing", nested),
      );
      const para = $createParaNode("p").append($createMarkerNode("p"), $trailingSpace());
      $getRoot().append(
        para.append(
          nested
            ? $createCharNode("wj").append(
                $createMarkerNode("wj"),
                $createTextNode(`${NBSP}said `),
                nd,
                $createMarkerNode("wj", "closing"),
              )
            : nd,
        ),
      );
    });
  }

  /** The `nd` span's opening glyph, however deeply it sits. */
  function $ndOpener(): TextNode {
    let span: ReturnType<typeof $createCharNode> | undefined;
    const visit = (
      node: ReturnType<typeof $createParaNode> | ReturnType<typeof $createCharNode>,
    ) => {
      node.getChildren().forEach((child) => {
        if ($isCharNode(child)) {
          if (child.getMarker() === "nd") span = child;
          else visit(child);
        }
      });
    };
    visit($getRoot().getChildren().filter($isParaNode)[0]);
    const opener = requireDefined(span, "nd span missing").getFirstChild();
    return requireDefined($isMarkerNode(opener) ? opener : undefined, "nd opener missing");
  }

  it.each([
    ["flat", false, "\\nd"],
    ["nested", true, "\\+nd"],
  ])("keeps the caret after the typed space (%s)", async (_label, nested, openerText) => {
    const { editor } = await charEnvironment(nested);
    await typeSpaceAt(editor, $ndOpener, openerText.length);

    editor.getEditorState().read(() => expect($ndOpener().getTextContent()).toBe(`${openerText} `));
    // Immediately after the typed space — NOT past the structural separator as well.
    expect(caretOf(editor)).toBe(`${JSON.stringify(`${openerText} `)}@${openerText.length + 1}`);
    // The span is untouched in the file: the writer emits the separator structurally.
    const content = paraContent(editor);
    const span = (
      nested ? (content?.[0] as MarkerObject).content?.[1] : content?.[0]
    ) as MarkerObject;
    expect(span).toMatchObject({ type: "char", marker: "nd", content: ["things"] });
  });
});

describe("the gestures these must not disturb", () => {
  it("still lands the caret in the content when a marker NAME is completed by the space", async () => {
    // The reason `$moveCaretPastMarker` exists: `\s` retyped to `\s1` plus the terminating space
    // is a rename, and the caret belongs in the content afterwards. Only the no-op case changes.
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $trailingSpace(),
          $createTextNode("body"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const prefix = para.getChildren()[0];
        if (!$isTextNode(prefix)) throw new Error("para prefix missing");
        prefix.setTextContent("\\q");
        prefix.select(2, 2);
      }),
    );
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(" ");
      }),
    );

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      if (!$isElementNode(para)) throw new Error("para missing");
      expect(para.getMarker()).toBe("q");
    });
  });
});
