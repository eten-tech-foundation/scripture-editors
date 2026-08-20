/**
 * A milestone cannot hold content, so content that ends up in one is ejected past a closer.
 *
 * Typing `\qt1-s |who=""\*` used to leave the screen and the file disagreeing: the file got
 * `\qt1-s\*|who=""\*` — the Paratext 9 reading, with the milestone closed and the bytes outside it
 * — while the editor showed `\qt1-s|who=""\*`, an unclosed milestone with an unmatched `\*` adrift
 * at the end.
 *
 * The chain that settles it: an attribute list that will not parse is CONTENT (Paratext 9 leaves
 * such a span as text), and a milestone is self-closing, so the milestone ends where the content
 * begins and the author's own `\*` is left over as an unmatched closing marker.
 *
 * What makes this the right shape rather than merely a shape: the two spellings converge. The bytes
 * the user typed and the bytes that get saved tokenize identically, so the settle is a FIXED POINT
 * — reloading the saved document reproduces the same tree, and no further settle moves anything.
 */

import { testEnvironmentWithDisplaySyncs, viewOptions } from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  TextNode,
} from "lexical";
import { $createMarkerNode, $createParaNode, NBSP, textTypeState } from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

function $trailingSpace(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

describe("a milestone ejects content it cannot hold", () => {
  /** Type `bytes` at the end of the first paragraph and STOP — the caret stays in them. */
  async function typeWithoutDeparting(bytes: string) {
    return typeThen(bytes, false);
  }

  /** Type `bytes` at the end of the first paragraph, then depart so it settles. */
  async function typeAndSettle(bytes: string) {
    return typeThen(bytes, true);
  }

  async function typeThen(bytes: string, depart: boolean) {
    let body: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      body = $createTextNode("before ");
      other = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), body),
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), other),
      );
    });
    await act(async () =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      editor.update(() => body!.select(body!.getTextContentSize(), body!.getTextContentSize())),
    );
    for (const character of bytes) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    if (depart) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await act(async () => editor.update(() => other!.select(0, 0)));
      await act(async () => {
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      });
    }
    return editor;
  }

  /** The first paragraph's USJ content — the file side of the screen-vs-file comparison. */
  function paraContent(editor: Awaited<ReturnType<typeof typeAndSettle>>) {
    initializeDeserialize(undefined);
    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
    return (usj?.content?.[0] as MarkerObject)?.content;
  }

  it("moves nothing while the user is still typing", async () => {
    // The ejection is a SETTLE, not an instant apply. While the caret is still in the bytes they
    // stay exactly as typed, so nothing rearranges under the user mid-keystroke; the rewrite
    // happens when the caret departs. Pinned because "it settles correctly" and "it does not
    // pounce" are different properties and only the first is obvious from the other tests.
    const editor = await typeWithoutDeparting(`\\qt1-s things|sid="asdf"\\*`);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain(`before \\qt1-s things|sid="asdf"\\*`);
      expect(
        $getRoot()
          .getAllTextNodes()
          .some((node) => node.getTextContent() === "things"),
      ).toBe(false);
    });
  });

  it("closes the milestone and puts the unparseable attribute bytes after it", async () => {
    const editor = await typeAndSettle(`\\qt1-s |who=""\\*`);

    // The screen shows the milestone closed, then the literal bytes, then the leftover closer.
    editor
      .getEditorState()
      .read(() => expect($getRoot().getTextContent()).toContain(`\\qt1-s\\*|who=""\\*`));
    // And the file says exactly the same thing — the milestone carries no attribute, the bytes are
    // its SIBLINGS rather than its children, and the author's `\*` survives as unmatched.
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s" },
      `|who=""`,
      { type: "unmatched", marker: "*" },
    ]);
  });

  it("settles the already-settled spelling to itself", async () => {
    // The fixed point, driven through the editor rather than the tokenizer: typing what the
    // previous test SAVES must produce that same document, or reloading would keep moving bytes.
    const editor = await typeAndSettle(`\\qt1-s\\*|who=""\\*`);
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s" },
      `|who=""`,
      { type: "unmatched", marker: "*" },
    ]);
  });

  it("ejects content typed INTO a milestone, keeping its valid attributes", async () => {
    const editor = await typeAndSettle(`\\qt1-s things|sid="asdf"\\*`);
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s", sid: "asdf" },
      "things",
      { type: "unmatched", marker: "*" },
    ]);
  });

  it("leaves a well-formed milestone alone, attributes and all", async () => {
    const editor = await typeAndSettle(`\\qt1-s |who="TJ"\\*`);
    expect(paraContent(editor)).toEqual(["before ", { type: "ms", marker: "qt1-s", who: "TJ" }]);
  });
});
