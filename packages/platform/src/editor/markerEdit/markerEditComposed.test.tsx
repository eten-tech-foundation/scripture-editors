/**
 * Composed-plugin tests: MarkerEditPlugin mounted TOGETHER with
 * other production plugins, as in the real editor.
 *
 * With TextSpacingPlugin: it removes lone space-only TextNodes that don't precede a
 * verse — so it could, in principle, eat the plain-space separator MarkerEditPlugin's
 * Ctrl+Space inserts between the two split spans. It does NOT: that transform returns
 * early when the next sibling is a CharNode, and $displayWhitespaceTransform only maps
 * spaces adjacent to other spaces/NBSP within one node, so a lone separator preceding a
 * styled span is left untouched. The composed at-rest truth is therefore: two styled
 * spans with a surviving plain-space separator between them, honoring PT9's
 * caret-lands-unstyled guarantee.
 *
 * With OnSelectionChangePlugin: its SELECTION_CHANGE handler calls
 * `editor.read()`, which force-flushes `$commitPendingUpdates` MID-dispatch — the
 * in-flight update's pending editor state becomes the committed (dev-frozen) state while
 * the dispatch is still on the stack. Any marker-resolution mutation triggered from that
 * context (pre-fix: MarkerEditPlugin's update listener synchronously self-dispatching
 * SELECTION_CHANGE_COMMAND) then writes into a frozen selection/node map and throws
 * (`Cannot assign to read only property '_cachedNodes'` / `Cannot call set() on a frozen
 * Lexical node map`) — real-browser-only bugs A and B.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $appendCharPara } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $isImmutableUnmatchedNode,
  $isMarkerTrailingSeparator,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  MarkerNode,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  CharNodePlugin,
  getViewOptions,
  OnSelectionChangePlugin,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
} from "shared-react";

/** Mounts MarkerEditPlugin AND TextSpacingPlugin in Standard view (editable markers). */
async function composedEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <TextSpacingPlugin />
    </>,
  );
}

/** The char span's plain (non-marker) content text node. */
function $charContent(char: CharNode): TextNode {
  const node = char
    .getChildren()
    .filter($isTextNode)
    .find((n) => !$isMarkerNode(n));
  if (!node) throw new Error("char span has no content text node");
  return node;
}

describe("MarkerEditPlugin + TextSpacingPlugin composed", () => {
  it("Ctrl+Space mid-span keeps two spans and the plain-space separator survives", async () => {
    let char: CharNode;
    const { editor } = await composedEnvironment(() => (char = $appendCharPara().char));
    // caret between "Lo" and "rd" (content text is NBSP + "Lord")
    await act(async () => editor.update(() => $charContent(char).select(3, 3)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2); // split into two styled spans
      const between = chars[0].getNextSibling();
      // The separator survived TextSpacingPlugin (it precedes a CharNode) as a lone plain space.
      expect($isTextNode(between) && !$isMarkerNode(between)).toBe(true);
      expect(between?.getTextContent()).toBe(" ");
      expect(between?.is(chars[1].getPreviousSibling())).toBe(true);
      // Caret rests in the plain separator, not inside either styled span (PT9 parity).
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) expect(selection.anchor.getNode().is(between)).toBe(true);
    });
  });
});

/**
 * Mounts MarkerEditPlugin AND OnSelectionChangePlugin in production order
 * (OnSelectionChangePlugin registers its SELECTION_CHANGE handler first, as in Editor.tsx).
 */
async function selectionComposedEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <OnSelectionChangePlugin onChange={() => undefined} />
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
    </>,
  );
}

/** Two paragraphs, each `[marker, trailing NBSP, content text]`; returns key parts. */
function $twoParasWithMarkers(): {
  pPara: ParaNode;
  pMarker: MarkerNode;
  pText: TextNode;
  qText: TextNode;
} {
  const pPara = $createParaNode("q2");
  const pMarker = $createMarkerNode("q2");
  const pTrailing = $createTextNode(NBSP);
  $setState(pTrailing, textTypeState, "marker-trailing-space");
  const pText = $createTextNode("body text");
  const qTrailing = $createTextNode(NBSP);
  $setState(qTrailing, textTypeState, "marker-trailing-space");
  const qText = $createTextNode("second");
  $getRoot().append(
    pPara.append(pMarker, pTrailing, pText),
    $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
  );
  return { pPara, pMarker, pText, qText };
}

describe("MarkerEditPlugin + OnSelectionChangePlugin composed (frozen-commit regression)", () => {
  it("resolves a paragraph opener rename on caret departure (bug A: frozen _cachedNodes)", async () => {
    let parts: ReturnType<typeof $twoParasWithMarkers>;
    const { editor } = await selectionComposedEnvironment(() => (parts = $twoParasWithMarkers()));

    // Rename the opener glyph in place; the caret stays inside it, so it only pends.
    await act(async () =>
      editor.update(() => {
        parts.pMarker.setTextContent("\\s2");
        parts.pMarker.select(3, 3);
      }),
    );
    editor.getEditorState().read(() => expect(parts.pPara.getMarker()).toBe("q2")); // pending

    // Depart the way the browser does: ONE update moves the caret AND dispatches
    // SELECTION_CHANGE within it (the shape of Lexical's own native-selectionchange
    // handling). OnSelectionChangePlugin's handler calls editor.read(), force-committing
    // the in-flight update mid-dispatch; pre-fix the resolution then ran against the
    // frozen committed state and threw instead of renaming.
    await act(async () =>
      editor.update(() => {
        parts.qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );

    editor.getEditorState().read(() => {
      expect(parts.pPara.getMarker()).toBe("s2"); // rename applied (paragraph restyles)
      expect(parts.pMarker.getTextContent()).toBe("\\s2"); // glyph canonical
    });
  });

  it("re-tokenizes pending literal marker text on caret departure (bug B: frozen node map)", async () => {
    let parts: ReturnType<typeof $twoParasWithMarkers>;
    const { editor } = await selectionComposedEnvironment(() => (parts = $twoParasWithMarkers()));

    // An unterminated unknown marker in body text; caret stays inside it, so it only
    // pends. Departure routes it to $rebuildParas, whose $parseSerializedNode creates
    // nodes — pre-fix into the frozen committed node map ("Cannot call set() ...").
    await act(async () =>
      editor.update(() => {
        parts.pText.setTextContent("body \\zz");
        parts.pText.select(parts.pText.getTextContentSize(), parts.pText.getTextContentSize());
      }),
    );

    await act(async () =>
      editor.update(() => {
        parts.qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );

    editor.getEditorState().read(() => {
      // "zz" resolves structurally (PT9 DetermineUnknownTokenType): a real paragraph split.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zz")).toBe(true);
    });
  });
});

describe("MarkerEditPlugin + CharNodePlugin composed (separator deletion settles on departure)", () => {
  async function charComposedEnvironment($initialEditorState: () => void) {
    initializeSerialize(undefined, undefined);
    reset();
    return baseTestEnvironment(
      $initialEditorState,
      <>
        <OnSelectionChangePlugin onChange={() => undefined} />
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
        <CharNodePlugin />
      </>,
    );
  }

  it("deletes the spacer between nested openers, then settles it back on caret departure", async () => {
    // `\nd \+wj on\+wj*e\nd*`: the user deletes the spacer between `\nd` and `\+wj`. The
    // deletion must stick while the caret stays at the spot (the sync's mid-edit grace), and
    // caret departure must settle the span back to canonical — the separator reappears via the
    // pending-resolution Tier-2 rebuild, exactly like a pending marker literal.
    let opener: MarkerNode;
    let spacer: TextNode;
    let qText: TextNode;
    const { editor } = await charComposedEnvironment(() => {
      const para = $createParaNode("p");
      const ndChar = $createCharNode("nd");
      opener = $createMarkerNode("nd");
      spacer = $createTextNode(NBSP);
      const wjChar = $createCharNode("wj");
      wjChar.append(
        $createMarkerNode("wj", "opening", true),
        $createTextNode(`${NBSP}on`),
        $createMarkerNode("wj", "closing", true),
      );
      ndChar.append(
        opener,
        spacer,
        wjChar,
        $createTextNode("e"),
        $createMarkerNode("nd", "closing"),
      );
      const qTrailing = $createTextNode(NBSP);
      $setState(qTrailing, textTypeState, "marker-trailing-space");
      qText = $createTextNode("second");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          (() => {
            const t = $createTextNode(NBSP);
            $setState(t, textTypeState, "marker-trailing-space");
            return t;
          })(),
          $createTextNode("x "),
          ndChar,
        ),
        $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
      );
    });

    /** The nd span, re-queried from the root (a Tier-2 settle replaces the paragraph's nodes). */
    function $findNd(): CharNode {
      const paras = $getRoot().getChildren().filter($isParaNode);
      const nd = paras
        .flatMap((paraNode) => paraNode.getChildren())
        .filter($isCharNode)
        .find((charNode) => charNode.getMarker() === "nd");
      if (!nd) throw new Error("nd span not found");
      return nd;
    }

    // Delete the spacer; the caret lands at the opener glyph end (how backspace leaves it).
    await act(async () =>
      editor.update(() => {
        spacer.remove();
        opener.select(opener.getTextContentSize(), opener.getTextContentSize());
      }),
    );
    editor.getEditorState().read(() => {
      const children = $findNd().getChildren();
      // Deletion stuck: `\nd` directly followed by the nested span.
      expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\nd");
      expect($isCharNode(children[1]) && children[1].getMarker()).toBe("wj");
    });

    // Depart: one update moves the caret to the second paragraph and dispatches
    // SELECTION_CHANGE (the shape of Lexical's native selectionchange handling).
    await act(async () =>
      editor.update(() => {
        qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );

    // Drain the engine's queued microtask resolutions before asserting (and before the test
    // ends — queued work outliving the test perturbs later files on the shared worker).
    await act(async () => {
      await Promise.resolve();
    });

    editor.getEditorState().read(() => {
      const children = $findNd().getChildren();
      // Settled back to canonical: the spacer separator reappeared.
      expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\nd");
      expect($isTextNode(children[1]) && children[1].getTextContent()).toBe(NBSP);
      expect($isCharNode(children[2]) && children[2].getMarker()).toBe("wj");
    });
  });

  /** One paragraph `\p x <char>` + a second `\p second` to depart into; returns key parts. */
  function $charSeparatorFixture(charContentText: string): {
    contentText: TextNode;
    qText: TextNode;
  } {
    const contentText = $createTextNode(charContentText);
    const qText = $createTextNode("second");
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createMarkerTrailingSeparator(),
        $createTextNode("x "),
        $createCharNode("nd").append(
          $createMarkerNode("nd"),
          contentText,
          $createMarkerNode("nd", "closing"),
        ),
      ),
      $createParaNode("p").append($createMarkerNode("p"), $createMarkerTrailingSeparator(), qText),
    );
    return { contentText, qText };
  }

  /** Delete `contentText`'s leading NBSP separator (caret at the deletion point), then depart
   * to `qText` and drain the settle. */
  async function deleteSeparatorAndDepart(
    editor: LexicalEditor,
    contentText: TextNode,
    qText: TextNode,
  ) {
    await act(async () =>
      editor.update(() => {
        contentText.setTextContent(contentText.getTextContent().slice(1));
        contentText.select(0, 0);
      }),
    );
    await act(async () =>
      editor.update(() => {
        qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("deleting the separator before plain text renames the marker — the bytes say so", async () => {
    // `\nd ⍽one\nd*` with the separator deleted reads `\ndone\nd*`: the tokenizer's name scan
    // runs through `one` and the marker IS now `ndone` — restoring the byte would rewrite what
    // the user wrote. `ndone` is unknown to the stylesheet, so it resolves positionally the way
    // ParatextData resolves unknown tokens in body text: a real paragraph split.
    let parts: ReturnType<typeof $charSeparatorFixture>;
    const { editor } = await charComposedEnvironment(
      () => (parts = $charSeparatorFixture(`${NBSP}one`)),
    );

    // `parts` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteSeparatorAndDepart(editor, parts!.contentText, parts!.qText);

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain(`\\nd${NBSP}`);
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "ndone")).toBe(true);
    });
  });

  it("deleting the separator before a `*` yields the closing marker, never a heal", async () => {
    // `\nd ⍽*more\nd*` with the separator deleted reads `\nd*more\nd*` — and `\nd*` is a
    // CLOSING marker (the name scan's `*` terminator ends the token AND changes its meaning).
    // Healing the byte back would silently prevent the user from typing a closer, which is why
    // the tokenize-identity rule is defined by meaning and not by a terminator character class.
    let parts: ReturnType<typeof $charSeparatorFixture>;
    const { editor } = await charComposedEnvironment(
      () => (parts = $charSeparatorFixture(`${NBSP}*more`)),
    );

    // `parts` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteSeparatorAndDepart(editor, parts!.contentText, parts!.qText);

    editor.getEditorState().read(() => {
      // No nd char span survives — both `\nd*` byte runs now mean closers, which settle to
      // unmatched-closer elements around the freed text.
      const paraChildren = $getRoot().getChildren().filter($isParaNode)[0].getChildren();
      expect(paraChildren.filter($isCharNode)).toHaveLength(0);
      const unmatched = paraChildren.filter($isImmutableUnmatchedNode);
      expect(unmatched).toHaveLength(2);
      expect(unmatched.every((node) => node.getMarker() === "nd*")).toBe(true);
      expect(paraChildren.some((node) => node.getTextContent() === "more")).toBe(true);
    });
  });
});

describe("MarkerEditPlugin composed (para-prefix separator deletion)", () => {
  /** `\q2 body text` + `\p second` to depart into. The prefix separator is the tagged token
   * NBSP the adaptor builds. */
  function $paraSeparatorFixture(): {
    pPara: ParaNode;
    pMarker: MarkerNode;
    separator: TextNode;
    qText: TextNode;
  } {
    const pPara = $createParaNode("q2");
    const pMarker = $createMarkerNode("q2");
    const separator = $createMarkerTrailingSeparator();
    const qText = $createTextNode("second");
    $getRoot().append(
      pPara.append(pMarker, separator, $createTextNode("body text")),
      $createParaNode("p").append($createMarkerNode("p"), $createMarkerTrailingSeparator(), qText),
    );
    return { pPara, pMarker, separator, qText };
  }

  it("deleting the prefix separator before text renames the paragraph marker on departure", async () => {
    // `\q2⍽body text` with the separator deleted reads `\q2body text`: the name scan runs
    // through `body` and stops at the space, so the marker IS now `q2body` with content `text`.
    // Healing the byte back while the caret still holds the site would be healing against a
    // user edit.
    let parts: ReturnType<typeof $paraSeparatorFixture>;
    const { editor } = await selectionComposedEnvironment(() => (parts = $paraSeparatorFixture()));

    await act(async () =>
      editor.update(() => {
        parts.separator.remove();
        parts.pMarker.select(
          parts.pMarker.getTextContentSize(),
          parts.pMarker.getTextContentSize(),
        );
      }),
    );
    // Mid-edit grace: the deletion sticks while the caret stays at the site.
    editor.getEditorState().read(() => {
      expect(parts.pPara.getTextContent()).toBe("\\q2body text");
    });

    await act(async () =>
      editor.update(() => {
        parts.qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "q2body")).toBe(true);
      expect(paras.some((para) => para.getMarker() === "q2")).toBe(false);
    });
  });

  it("deleting the prefix separator before a char span heals back on departure", async () => {
    // `\p⍽\nd …` with the separator deleted reads `\p\nd …` — the name scan stops at `\` either
    // way, so the bytes tokenize identically and the engine-owned byte heals on departure.
    let separator: TextNode;
    let pPara: ParaNode;
    let pMarker: MarkerNode;
    let qText: TextNode;
    const { editor } = await selectionComposedEnvironment(() => {
      pPara = $createParaNode("p");
      pMarker = $createMarkerNode("p");
      separator = $createMarkerTrailingSeparator();
      qText = $createTextNode("second");
      $getRoot().append(
        pPara.append(
          pMarker,
          separator,
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          qText,
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        separator.remove();
        pMarker.select(pMarker.getTextContentSize(), pMarker.getTextContentSize());
      }),
    );
    // Mid-edit grace: the deletion sticks while the caret stays at the site.
    editor.getEditorState().read(() => {
      expect(pPara.getChildren().some($isMarkerTrailingSeparator)).toBe(false);
    });

    await act(async () =>
      editor.update(() => {
        qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      const para = paras.find((paraNode) => paraNode.getMarker() === "p");
      if (!para) throw new Error("p para not found");
      // Healed: glyph, separator, then the untouched char span.
      const children = para.getChildren();
      expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\p");
      expect($isMarkerTrailingSeparator(children[1])).toBe(true);
      expect($isCharNode(children[2]) && children[2].getMarker()).toBe("nd");
    });
  });
});
