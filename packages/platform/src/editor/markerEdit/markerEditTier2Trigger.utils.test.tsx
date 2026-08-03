import { MarkerEditContext } from "./markerEditTier1.utils";
import { $textNodeTier2Transform } from "./markerEditTier2Trigger.utils";
import { historyTestEnvironment, testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_ENTER_COMMAND,
  LexicalNode,
  NodeKey,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $charAttributeDisplayNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  getMarker as bundledGetMarker,
  NBSP,
  textTypeState,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefinedInTest<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Depth-first search for the first CharNode with `marker` anywhere under `root`. */
function $findFirstChar(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findFirstChar(child, marker);
    if (found) return found;
  }
  return undefined;
}

describe("Tier 2 literal-text triggers", () => {
  it("re-tokenizes a terminated typed char marker", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello world`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello world`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd Lord\\nd* world`);
      }),
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).not.toContain("\\\\nd ");
  });

  it("leaves an unterminated backslash sequence alone until Enter", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd`);
      }),
    );
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\nd");
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"nd"');
  });

  it("splits paragraphs on pasted multi-para USFM (simulated as one insertion)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}start end`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}start end`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}start \\q1 poetry \\v 2 verse two end`);
      }),
    );
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("q1");
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"number":"2"');
  });

  it("keeps subsequent keystrokes in the glyph after a mid-paragraph marker split (no scramble)", async () => {
    // With caret-bounded termination, typing `\z` mid-paragraph no longer
    // terminates against the PRE-EXISTING following space (that was the phantom-marker
    // corruption class) — the literal builds up in the content text instead, and the split
    // happens when the user types the terminating space themselves. This test starts from a
    // state where the caret sits right after "\z" (as if just typed); the remaining
    // keystrokes must still assemble `\zfoo ` in ORDER (the no-scramble guarantee)
    // and the terminating space still produces the `zfoo` paragraph.
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(`${NBSP}For Yahweh knows the way`)),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}For Yahweh knows the way`);
        expect(text).toBeDefined();
        // simulate the user having just typed "\z" after "knows"; caret right after the "z"
        text?.setTextContent(`${NBSP}For Yahweh knows\\z the way`);
        const offset = `${NBSP}For Yahweh knows\\z`.length;
        text?.select(offset, offset);
      }),
    );
    // Continue typing the rest of the marker name at the restored caret.
    for (const character of ["f", "o", "o", " "]) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          expect($isRangeSelection(selection)).toBe(true);
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zfoo")).toBe(true);
    });
  });

  it("coalesces the rebuild with the triggering edit into one undo step", async () => {
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello world`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello world`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd Lord\\nd* world`);
      }),
    );
    // Sanity: the rebuild actually happened before undoing it.
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"nd"');
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("hello world");
      expect($getRoot().getTextContent()).not.toContain("Lord");
      // A single undo step must fully restore the pre-edit tree: no leftover CharNode.
      expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('"marker":"nd"');
    });
  });

  it("mid-word fluent typing never absorbs the word remainder into a phantom marker", async () => {
    // Caret at "li|ke" and the user types `\` `w` `j` char by char. Pre-fix, the FIRST
    // keystroke made the node read "…li\ke da…", and the remainder's own following space made
    // `\ke ` look terminated — an immediate rebuild split the paragraph with the phantom
    // marker "ke", the caret landed inside the glyph, w/j built "\wjke", and the palette apply
    // then ATE "ke" (text loss, the type-through corruption class). Only the user's
    // typed run (text before the caret) may terminate a marker.
    let body: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      body = $createTextNode(`${NBSP}I like da watta`);
      $getRoot().append(para.append($createMarkerNode("p"), body));
    });
    // caret between "li" and "ke": NBSP + "I li" = offset 5
    await act(async () => editor.update(() => body.select(5, 5)));
    for (const character of ["\\", "w", "j"]) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          expect($isRangeSelection(selection)).toBe(true);
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
      // After EVERY keystroke: no split, no phantom marker, remainder intact.
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(1);
        expect(paras[0].getMarker()).toBe("p");
        expect($getRoot().getTextContent()).toContain("ke da watta");
      });
    }
    // The literal run sits contiguously before the untouched remainder.
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("I li\\\\wjke da watta");

    // Continuation: the user types the SPACE separator — now the run (text before the caret)
    // really is terminated and Tier 2 re-tokenizes it. The remainder must survive the rebuild.
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(" ");
      }),
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"wj"'); // the run resolved structurally
    expect(json).toContain("ke da watta"); // remainder NOT eaten
  });

  it("pends a literal typed into the para-prefix trailing-space node and settles it on caret departure", async () => {
    // The content-start caret position lands INSIDE the marker-trailing-space NBSP node.
    // Pre-fix that node was exempt from the Tier 2 trigger, so literals typed there never
    // pended — the caret-departure settle had nothing to resolve and raw literals persisted
    // indefinitely (serializing to disk).
    let trailing: TextNode, other: TextNode;
    const { editor } = await testEnvironment(() => {
      trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      other = $createTextNode("elsewhere");
      $getRoot().append(
        $createParaNode("s1").append($createMarkerNode("s1"), trailing),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    // Type `\zz` at content start (lands in the trailing-space node); caret stays inside.
    await act(async () =>
      editor.update(() => {
        trailing.setTextContent(`${NBSP}\\zz`);
        trailing.select(4, 4);
      }),
    );
    editor.getEditorState().read(() => {
      // Unterminated + caret inside: pends, no split yet.
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
    });
    // Mouse-style caret departure to the other paragraph resolves the pending literal.
    await act(async () => editor.update(() => other.select(0, 0)));
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zz")).toBe(true); // settled
    });
  });

  it("re-tokenizes immediately when the literal in the prefix node is user-terminated", async () => {
    let trailing: TextNode;
    const { editor } = await testEnvironment(() => {
      trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      $getRoot().append(
        $createParaNode("s1").append(
          $createMarkerNode("s1"),
          trailing,
          $createTextNode("God Make Da World"),
        ),
      );
    });
    // `\q1 ` typed at content start, caret after the typed space.
    await act(async () =>
      editor.update(() => {
        trailing.setTextContent(`${NBSP}\\q1 `);
        trailing.select(5, 5);
      }),
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "q1")).toBe(true);
    });
    expect(json).toContain("God Make Da World"); // heading text preserved
  });

  it('settles an attributed char span typed one keystroke at a time (`\\nd text|stuff="thing"\\nd*`)', async () => {
    // The live repro: typing the whole `\nd text|stuff="thing"\nd*` sequence character by
    // character. `\nd ` first materializes an OPEN (closed="false") char span; the content and
    // then the `\nd*` closer are typed INTO that span. When the closer lands inside the span as
    // one contiguous run, the Tier 2 trigger re-tokenizes it: extractAttributes parses
    // `stuff="thing"` into a real attribute, the span closes, and the `|stuff="thing"` bytes
    // become the canonical attribute display run — never persisting as literal span content.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironment(() => {
      content = $createTextNode(NBSP);
      other = $createTextNode("elsewhere");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), content),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    await act(async () => editor.update(() => content.select(1, 1))); // caret at content start
    for (const character of `\\nd text|stuff="thing"\\nd*`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }

    const assertSettled = () =>
      editor.getEditorState().read(() => {
        const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
        // Closed span carrying the parsed attribute — no lingering closed="false".
        expect(nd.getUnknownAttributes()).toEqual({ stuff: "thing" });
        expect(
          nd.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
        ).toBe(true);
        // `|stuff="thing"` is now the canonical attribute display run, not literal content.
        const run = requireDefinedInTest(
          $charAttributeDisplayNode(nd),
          "attribute display run not found",
        );
        expect(run.getTextContent()).toBe('|stuff="thing"');
        expect($getState(run, textTypeState)).toBe("attribute");
        // No plain (non-attribute) content text node still holds the raw `|stuff` literal.
        const plainContent = nd
          .getChildren()
          .filter(
            (c) =>
              $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) !== "attribute",
          )
          .map((c) => c.getTextContent())
          .join("");
        expect(plainContent).not.toContain("|stuff");
      });

    assertSettled(); // settled during typing, at the moment the closer was typed
    // Caret departure to the other paragraph must not perturb the already-settled span.
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    assertSettled();
  });

  it("does not re-tokenize a COLLAPSED note's content (preserve-or-refuse)", async () => {
    // The note skip is lifted: the trigger now fires inside note content and
    // routes to `$rebuildNoteContent`. A collapsed note, however, is not inline-editable,
    // so its content re-tokenization is refused and the typed text stays literal.
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+"); // isCollapsed defaults to true
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append(
            $createMarkerNode("f"),
            $createTextNode(`${NBSP}note text`),
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("note text"));
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}note \\bd bold\\bd* text`);
      }),
    );
    // literal text preserved — no CharNode created inside the collapsed note
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\bd");
  });
});

describe("$textNodeTier2Transform on attribute-run text", () => {
  /**
   * A standalone `MarkerEditContext` — bypassing the mounted `MarkerEditPlugin` — so
   * `pendingKeys` is a plain `Set` these tests can inspect directly, the same direct-call
   * technique `tier2Rebuild.utils.test.tsx` uses for `$rebuildParas`.
   */
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("pends an edited attribute run whose text contains a backslash, without re-tokenizing it", () => {
    const { editor } = createBasicTestEnvironment();
    let attrText: TextNode;
    editor.update(
      () => {
        attrText = $createTextNode('|lemma="grace"');
        $setState(attrText, textTypeState, "attribute");
        const para = $createParaNode("p");
        $getRoot().append(para.append($createMarkerNode("p"), attrText));
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        // A stray marker sequence lands in the attribute value. `\nd ` alone would look
        // TERMINATED to the plain-text trigger's regex, but attribute bytes legitimately
        // contain arbitrary characters — this must wait for caret departure, not re-tokenize
        // now.
        attrText.setTextContent('|lemma="\\nd grace"');
        $textNodeTier2Transform(attrText, context);
        expect(context.pendingKeys.has(attrText.getKey())).toBe(true);
        // $requestTier2ForNode (via $rebuildParas) was never invoked.
        expect(context.rebuildAttempted.size).toBe(0);
        expect(attrText.getTextContent()).toBe('|lemma="\\nd grace"');
      },
      { discrete: true },
    );
  });

  it("pends an edited attribute run with no backslash too", () => {
    const { editor } = createBasicTestEnvironment();
    let attrText: TextNode;
    editor.update(
      () => {
        attrText = $createTextNode('|lemma="grace"');
        $setState(attrText, textTypeState, "attribute");
        const para = $createParaNode("p");
        $getRoot().append(para.append($createMarkerNode("p"), attrText));
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        // Divergence from canonical is what matters, not backslashes: the early
        // `!text.includes("\\")` return must not skip attribute runs.
        attrText.setTextContent('|lemma="gra');
        $textNodeTier2Transform(attrText, context);
        expect(context.pendingKeys.has(attrText.getKey())).toBe(true);
      },
      { discrete: true },
    );
  });
});
