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
 * What makes this the right shape rather than merely a shape: it is a FIXED POINT — loading the
 * saved document back in produces a tree the rebuild refuses, so no further settle moves anything.
 *
 * Only the DESTRUCTIVE rearrangement waits, though. A well-formed milestone rearranges nothing, so
 * it applies where it stands the instant its `\*` is typed, body text after it and all; making
 * every milestone wait for a settle the user had to earn by leaving is the failure this file also
 * pins against.
 */

import { testEnvironmentWithDisplaySyncs, viewOptions } from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import {
  MarkerContent,
  MarkerObject,
  USJ_TYPE,
  USJ_VERSION,
} from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $parseSerializedNode,
  $setState,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $dfs } from "@lexical/utils";
import {
  $createMarkerNode,
  $createParaNode,
  $isMilestoneNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  NBSP,
  textTypeState,
} from "shared";
import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";

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

/** Mount an editor holding `content` as its first paragraph — the reload path, not the typing
 * path: the bytes arrive as saved USJ rather than as keystrokes. */
async function loadParas(content: MarkerContent[]) {
  const { editor } = await testEnvironmentWithDisplaySyncs(() => {
    const serialized = usjEditorAdaptor.serializeEditorState(
      {
        type: USJ_TYPE,
        version: USJ_VERSION,
        content: [
          { type: "para", marker: "p", content },
          { type: "para", marker: "p", content: ["second"] },
        ],
      },
      viewOptions,
    );
    serialized.root.children.forEach((child) => $getRoot().append($parseSerializedNode(child)));
  });
  return editor;
}

/** Ask for the first paragraph's rebuild and report whether it SPLICED. A settled document is a
 * fixed point exactly when this refuses. */
async function rebuiltFirstPara(editor: LexicalEditor): Promise<boolean> {
  const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };
  let rebuilt = true;
  await act(async () =>
    editor.update(
      () => {
        const para = $getRoot().getChildren().find($isParaNode);
        rebuilt = para ? $rebuildParas([para], context) : true;
      },
      { discrete: true },
    ),
  );
  return rebuilt;
}

/** The first paragraph's USJ content — the file side of the screen-vs-file comparison. */
function paraContent(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
  return (usj?.content?.[0] as MarkerObject)?.content;
}

describe("a milestone ejects content it cannot hold", () => {
  /**
   * The first paragraph's body text, and where the caret sits in it before typing. The default
   * puts the caret at the end, so nothing follows what gets typed; passing a body with a tail
   * puts ordinary content AFTER the typed bytes, which is the common case rather than an ejection.
   */
  interface TypingSite {
    body: string;
    caret: number;
  }

  const AT_PARAGRAPH_END: TypingSite = { body: "before ", caret: "before ".length };
  const BEFORE_MORE_TEXT: TypingSite = { body: "before after", caret: "before ".length };

  /** Type `bytes` into the first paragraph and STOP — the caret stays in them. */
  async function typeWithoutDeparting(bytes: string, site: TypingSite = AT_PARAGRAPH_END) {
    return typeThen(bytes, false, site);
  }

  /** Type `bytes` into the first paragraph, then depart so it settles. */
  async function typeAndSettle(bytes: string, site: TypingSite = AT_PARAGRAPH_END) {
    return typeThen(bytes, true, site);
  }

  async function typeThen(bytes: string, depart: boolean, site: TypingSite = AT_PARAGRAPH_END) {
    let body: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      body = $createTextNode(site.body);
      other = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), body),
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), other),
      );
    });
    await act(async () =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      editor.update(() => body!.select(site.caret, site.caret)),
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

  it("applies a VALID milestone at once, body text after it and all", async () => {
    // The counterpart to the test above, and the reason that one has to be about EJECTION rather
    // than "a milestone is pending": a well-formed milestone rearranges nothing, so it takes
    // effect where it stands like every other terminated marker. Ordinary body text following it
    // is the common case, not content it ejected, and must not push it into the settle.
    const editor = await typeWithoutDeparting(`\\qt1-s\\*`, BEFORE_MORE_TEXT);
    editor.getEditorState().read(() => {
      expect($dfs($getRoot()).some(({ node }) => $isMilestoneNode(node))).toBe(true);
      expect($getRoot().getTextContent()).toContain("after");
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

  it("keeps content before an unparseable attribute list, not just the bytes after it", async () => {
    // The unparseable-list branch resumed the scan AT the `|`, which skipped everything between
    // the marker and it — so content before an unparseable list was deleted outright while the
    // same content before a PARSEABLE list (the test below) was correctly ejected. A milestone
    // holds neither, so both must come out the far side of it.
    const editor = await typeAndSettle(`\\qt1-s things|who=""\\*`);
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s" },
      `things|who=""`,
      { type: "unmatched", marker: "*" },
    ]);
  });

  it("refuses to rebuild the ejected content-plus-unparseable-list document it SAVED", async () => {
    // The fixed point for the case above, driven the way a reload drives it (retyping no longer
    // reaches this document — see the sibling below).
    const settled: MarkerContent[] = [
      "before ",
      { type: "ms", marker: "qt1-s" },
      `things|who=""`,
      { type: "unmatched", marker: "*" },
    ];
    const editor = await loadParas(settled);
    expect(paraContent(editor)).toEqual(settled);
    expect(await rebuiltFirstPara(editor)).toBe(false);
    expect(paraContent(editor)).toEqual(settled);
  });

  it("refuses to rebuild the document that settle SAVED, so a reload moves nothing", async () => {
    // The fixed point, driven the way a reload actually drives it: load the document the test
    // above saves and ask for the rebuild again. It must refuse, and the file must come back
    // byte-identical — otherwise every reload would shuffle the same bytes one more time.
    //
    // Retyping those bytes is no longer a way to reach this document: a well-formed milestone now
    // applies the instant its `\*` is typed, so the keystrokes after it land inside the milestone
    // instead of re-spelling it as literal text. Loading is the gesture the property is about.
    const settled: MarkerContent[] = [
      "before ",
      { type: "ms", marker: "qt1-s" },
      `|who=""`,
      { type: "unmatched", marker: "*" },
    ];
    const editor = await loadParas(settled);
    expect(paraContent(editor)).toEqual(settled);
    expect(await rebuiltFirstPara(editor)).toBe(false);
    expect(paraContent(editor)).toEqual(settled);
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

/**
 * The inverse gesture, and the reason it lives beside the ejection: an author who repairs the
 * ejected bytes must get their milestone back.
 *
 * The two rules run in opposite directions over the same run, so the property that matters is not
 * that either one fires but that the PAIR terminates. It does because absorption asks for
 * something ejection can never produce: an attribute list that parses. Rebuild the ejected
 * document and nothing moves; rebuild the repaired one and the list lands on the milestone, where
 * a further rebuild leaves it.
 */
describe("a milestone re-absorbs an attribute list an author repaired", () => {
  const CLOSER: MarkerContent = { type: "unmatched", marker: "*" };

  it("folds the list back in when the author repairs it IN PLACE", async () => {
    // The gesture the rule exists for. The ejected bytes are still on screen; the author types the
    // missing value into them and moves on, and the milestone takes them back. Nothing about this
    // is visible to the tokenizer alone — the repaired bytes are a plain text node with no
    // backslash of its own, so unless the edit PENDS, caret departure settles nothing and the fold
    // waits for a reload.
    const editor = await loadParas(["before ", { type: "ms", marker: "qt1-s" }, `|who=""`, CLOSER]);
    let repaired: TextNode | undefined;
    editor.getEditorState().read(() => {
      repaired = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === `|who=""`);
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await act(async () => editor.update(() => repaired!.select(`|who="`.length, `|who="`.length)));
    for (const character of "person") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    // Depart, which is when a settle is allowed to move bytes.
    await act(async () =>
      editor.update(() => {
        const second = $getRoot().getChildren()[1];
        if ($isElementNode(second)) second.selectStart();
      }),
    );
    await act(async () => {
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    });

    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s", who: "person" },
    ]);
  });

  it("folds a repaired list back on the next rebuild, and leaves it there", async () => {
    // The same repair arriving as saved bytes rather than as keystrokes — a reload of a document
    // an author fixed and saved. One rebuild absorbs; the next has nothing left to do.
    const editor = await loadParas([
      "before ",
      { type: "ms", marker: "qt1-s" },
      `|who="person"`,
      CLOSER,
    ]);
    expect(await rebuiltFirstPara(editor)).toBe(true);
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s", who: "person" },
    ]);
    // And there it stays — the absorbed spelling is a fixed point, so a reload moves nothing.
    expect(await rebuiltFirstPara(editor)).toBe(false);
  });

  it("MERGES onto attributes the milestone already carries, the repaired list winning", async () => {
    const editor = await loadParas([
      "before ",
      { type: "ms", marker: "qt1-s", sid: "a" },
      `|sid="b" who="c"`,
      CLOSER,
    ]);
    expect(await rebuiltFirstPara(editor)).toBe(true);
    expect(paraContent(editor)).toEqual([
      "before ",
      { type: "ms", marker: "qt1-s", sid: "b", who: "c" },
    ]);
    expect(await rebuiltFirstPara(editor)).toBe(false);
  });

  it("refuses a list that will not parse, so the two rules cannot trade the run forever", async () => {
    // The other direction of the same property. `|who=""` is a list Paratext reads as text, so
    // ejection put it out here in the first place; absorbing it back in would rebuild bytes that
    // eject again, and the document would never come to rest. The rebuild refuses instead, twice
    // over, and the bytes stay exactly where the ejection left them.
    const ejected: MarkerContent[] = [
      "before ",
      { type: "ms", marker: "qt1-s" },
      `|who=""`,
      CLOSER,
    ];
    const editor = await loadParas(ejected);
    expect(await rebuiltFirstPara(editor)).toBe(false);
    expect(await rebuiltFirstPara(editor)).toBe(false);
    expect(paraContent(editor)).toEqual(ejected);
  });

  it("leaves content that merely follows a milestone alone", async () => {
    // No `|` run and no closer of its own: ordinary body text, which absorption must never touch.
    const body: MarkerContent[] = ["before ", { type: "ms", marker: "qt1-s" }, "after"];
    const editor = await loadParas(body);
    expect(await rebuiltFirstPara(editor)).toBe(false);
    expect(paraContent(editor)).toEqual(body);
  });
});
