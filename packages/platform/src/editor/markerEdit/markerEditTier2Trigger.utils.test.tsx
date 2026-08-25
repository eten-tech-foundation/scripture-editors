import { MarkerEditContext } from "./markerEditTier1.utils";
import { $textNodeTier2Transform } from "./markerEditTier2Trigger.utils";
import { historyTestEnvironment, testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
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
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createUnknownNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  $isUnknownNode,
  CharNode,
  getMarker as bundledGetMarker,
  NBSP,
  textTypeState,
  UnknownNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";

// jsdom implements no layout, so `Range.prototype.getBoundingClientRect` is absent. When a settle
// places the caret at a paragraph's append point after a typed closer (`\nd …\nd*` at para end),
// Lexical's post-commit scroll-into-view reads that rect off a Range and throws from inside its
// async $commitPendingUpdates — outside any test's promise chain, so it surfaces as an unhandled
// error rather than a failure. An empty rect is the semantically-truthful stand-in (same shim as
// markerEditUndoResettle.test.tsx / ScriptureReferencePlugin.test.tsx).
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

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

/** Every UnknownNode with the given `tag` (USJ `type`) anywhere under `root`. */
function $unknownsWithTag(root: LexicalNode, tag: string): UnknownNode[] {
  const out: UnknownNode[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isUnknownNode(node) && node.getTag() === tag) out.push(node);
    if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  visit(root);
  return out;
}

type EditorHandle = Awaited<ReturnType<typeof testEnvironment>>["editor"];

/** The first paragraph's USJ content array, via the editor -> USJ deserialize adaptor. */
function paraUsjContent(editor: EditorHandle): MarkerObject["content"] {
  initializeDeserialize(undefined);
  const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
  const para = usj?.content?.[0] as MarkerObject | undefined;
  return para?.content;
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

  it("settles `|attrs` typed into an ALREADY-closed char span on caret departure (5a repro)", async () => {
    // TJ's corrected repro: the `\nd text\nd*` span is already closed (the closer glyph exists as
    // its own MarkerNode) BEFORE the user types the pipe. Typing `|stuff="thing"` at the end of
    // "text" lands in the span's plain content node with NO backslash, so the immediate-rebuild
    // path never fires. Pre-fix, the no-backslash early return DELETED the node's pending key, so
    // nothing pended and caret departure had nothing to settle — the literal `|stuff="thing"`
    // persisted forever. The fix pends such a node so departure re-tokenizes it: PT9 re-parses
    // `|…` before an explicit closer as attributes (extractAttributes).
    let content: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}text`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    // Caret at the end of "text", immediately before the `\nd*` closer glyph.
    await act(async () => editor.update(() => content.select(5, 5)));
    for (const character of `|stuff="thing"`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    // Mid-typing: pended, NOT yet re-tokenized. The span still carries no attribute and the pipe
    // text is still literal content — no immediate rebuild happened.
    editor.getEditorState().read(() => {
      const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
      expect(nd.getUnknownAttributes()).toBeUndefined();
      expect($charAttributeDisplayNode(nd)).toBeUndefined();
      expect($getRoot().getTextContent()).toContain('|stuff="thing"');
    });
    // Caret departure to the other paragraph settles the pending node via Tier 2.
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
      expect(nd.getUnknownAttributes()).toEqual({ stuff: "thing" });
      expect(
        nd.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
      ).toBe(true);
      const run = requireDefinedInTest(
        $charAttributeDisplayNode(nd),
        "attribute display run not found",
      );
      expect(run.getTextContent()).toBe('|stuff="thing"');
      expect($getState(run, textTypeState)).toBe("attribute");
      const plainContent = nd
        .getChildren()
        .filter(
          (c) => $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) !== "attribute",
        )
        .map((c) => c.getTextContent())
        .join("");
      expect(plainContent).not.toContain("|stuff");
      expect(plainContent).toContain("text");
    });
  });

  it("collapses a bare default-attribute value (`|gloss` into closed `\\w`) on departure", async () => {
    // `w`'s default attribute is `lemma`, so a bare `|gloss` re-parses to `{lemma:"gloss"}` and the
    // canonical display run collapses back to the bare `|gloss` form.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("w");
      content = $createTextNode(`${NBSP}word`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("w"), content, $createMarkerNode("w", "closing")),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    await act(async () => editor.update(() => content.select(5, 5)));
    for (const character of "|gloss") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      const w = requireDefinedInTest($findFirstChar($getRoot(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toEqual({ lemma: "gloss" });
      const run = requireDefinedInTest(
        $charAttributeDisplayNode(w),
        "attribute display run not found",
      );
      expect(run.getTextContent()).toBe("|gloss");
    });
  });

  it("keeps a bare value literal when the marker has no default attribute, and settles (PT9)", async () => {
    // `nd` has NO default attribute, so PT9 cannot promote a bare `|gloss` to an attribute — it
    // stays literal content. The settle must still TERMINATE: the pending key is consumed and the
    // fixed-point rebuild refusal stops any resolve/rebuild churn.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}a`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    await act(async () => editor.update(() => content.select(2, 2)));
    for (const character of "|gloss") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await act(async () => editor.update(() => other.select(0, 0)));
    // Flush twice: prove the resolve settles and does NOT re-queue an endless cascade.
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
      // No attribute promoted; the bare value stays literal span content.
      const realAttributes = Object.keys(nd.getUnknownAttributes() ?? {}).filter(
        (name) => name !== "closed",
      );
      expect(realAttributes).toEqual([]);
      expect($charAttributeDisplayNode(nd)).toBeUndefined();
      expect(nd.getTextContent()).toContain("|gloss");
    });
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
    // Literal text preserved AND no "bd" structure was built anywhere — asserting the literal
    // alone would also pass if the refusal broke and tokenization kept the literal's bytes in
    // a glyph while wrapping "bold" in a real CharNode.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain("\\\\bd");
    expect(json).not.toContain('"marker":"bd"');
  });

  it("settles a typed `//` into an optbreak on caret departure, preserving the flanking spaces", async () => {
    // Typing `//` is USFM's discretionary line break (optbreak). No backslash, pipe, or
    // termination ever re-triggers on its own, so pre-fix the `//` stayed literal text forever
    // (the live bug: it never became an optbreak, and editorUsj-vs-PDP diverged). The fix pends
    // the node so caret departure re-tokenizes it — the tokenizer maps `//` to an optbreak
    // wherever plain text appears. The spaces around `//` are SIGNIFICANT (PT9 keeps them
    // byte-for-byte), so `one // two` settles to `["one ", {optbreak}, " two"]`.
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
    for (const character of "one // two") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
      // No mid-typing rebuild: the `//` pends but never re-tokenizes while the caret is inside.
      editor.getEditorState().read(() => {
        expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(0);
      });
    }
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("one // two");
    });
    // Caret departure to the other paragraph settles the pending `//` into an optbreak.
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      // Display: exactly one optbreak display node, whose `//` token renders once (no `////`).
      const optbreaks = $unknownsWithTag($getRoot(), "optbreak");
      expect(optbreaks).toHaveLength(1);
      expect(optbreaks[0].getTextContent()).toBe("//");
    });
    expect(paraUsjContent(editor)).toEqual(["one ", { type: "optbreak" }, " two"]);

    // Damping: a second departure must not re-pend or double the optbreak (no resolve/rebuild
    // loop, no `////`). The state stays the settled shape and the test RETURNING proves no loop.
    // The rebuild replaced the original nodes, so re-locate live ones for the departure.
    await act(async () =>
      editor.update(() => {
        const oneNode = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("one"));
        oneNode?.select(0, 0);
      }),
    );
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(1);
    });
    expect(paraUsjContent(editor)).toEqual(["one ", { type: "optbreak" }, " two"]);
  });

  it("settles a tight `one//two` into an optbreak with no flanking spaces", async () => {
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
    await act(async () => editor.update(() => content.select(1, 1)));
    for (const character of "one//two") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(1);
    });
    expect(paraUsjContent(editor)).toEqual(["one", { type: "optbreak" }, "two"]);
  });

  it("settles a typed `//` inside a char span into an optbreak (tokenizer converts char content too)", async () => {
    // The tokenizer maps `//` wherever plain text appears, char-span content included — the
    // scan is flat, run before char-stack assembly. So `//` typed inside a `\nd` span must pend
    // and settle to an optbreak nested in the span, the same as body-paragraph content.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}ab`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    // Caret between "a" and "b" (NBSP + "a" = offset 2); type `//` there.
    await act(async () => editor.update(() => content.select(2, 2)));
    for (const character of "//") {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await act(async () => editor.update(() => other.select(0, 0)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    editor.getEditorState().read(() => {
      const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
      // The optbreak settled INSIDE the span, between the "a" and "b" content.
      const optbreaks = $unknownsWithTag(nd, "optbreak");
      expect(optbreaks).toHaveLength(1);
      expect(nd.getTextContent()).toContain("//");
    });
  });

  it("settles BOTH of two identical literals landing in one commit (second pends, not swallowed)", async () => {
    // The rebuild-damping guard is keyed by literal TEXT, so the SECOND node carrying the same
    // bytes in one commit (a paste inserting the same line twice) hits the damped arm after the
    // first one's rebuild consumed the key. Pre-fix it was neither rebuilt nor pended — the
    // second paragraph's literal never settled. Now the damped arm pends it, and the
    // caret-departure settle performs the rebuild the guard skipped.
    let other!: TextNode;
    const { editor } = await testEnvironment(() => {
      other = $createTextNode(`${NBSP}elsewhere`);
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}alpha`)),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}beta`)),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    await act(async () =>
      editor.update(() => {
        for (const node of $getRoot().getAllTextNodes()) {
          const text = node.getTextContent();
          if (text === `${NBSP}alpha` || text === `${NBSP}beta`)
            node.setTextContent(`${NBSP}hello \\nd Lord\\nd* world`);
        }
      }),
    );
    // Caret departure into the third paragraph settles the pended twin.
    await act(async () => editor.update(() => other.select(2, 2)));
    await act(async () => {
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    });
    editor.getEditorState().read(() => {
      const ndChars: CharNode[] = [];
      const visit = (node: LexicalNode): void => {
        if ($isCharNode(node) && node.getMarker() === "nd") ndChars.push(node);
        if ($isElementNode(node)) node.getChildren().forEach(visit);
      };
      visit($getRoot());
      expect(ndChars).toHaveLength(2);
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain("\\\\nd ");
  });

  it("a damped literal's re-settle refuses as a TRUE no-op (no extra commit)", async () => {
    // Two identical REFUSING literals (an unterminated milestone run — genuine
    // literal-degradation) land in one commit: the first requests its rebuild and refuses at
    // the fixed point; the second hits the damped arm and pends. The pend's later resolve
    // refuses again — and that refusal must produce NO commit at all. The refusal compares
    // signatures on the SERIALIZED rebuild without materializing nodes; when it instead parsed
    // first, the orphans counted as dirty leaves and turned the refusal into a real commit,
    // whose reconciliation round trip could displace the caret out from under an active gesture
    // (typed bytes then landed outside the span the caret was in).
    // The literal sits directly after the `\p ` glyph (whose own text supplies the separator
    // space), so its content re-tokenizes to exactly itself — a genuine fixed point. An extra
    // whitespace node would normalize away and make the rebuild a real splice instead.
    const literal = `body \\ts-s |sid="x"`;
    let other!: TextNode;
    const { editor } = await testEnvironment(() => {
      other = $createTextNode("elsewhere");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode("alpha")),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode("beta")),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    let commits = 0;
    const unregister = editor.registerUpdateListener(() => {
      commits += 1;
    });
    await act(async () =>
      editor.update(() => {
        for (const node of $getRoot().getAllTextNodes()) {
          const text = node.getTextContent();
          if (text === "alpha" || text === "beta") node.setTextContent(literal);
        }
      }),
    );
    // Caret departure into the third paragraph resolves the pended twin — a refusal.
    await act(async () => editor.update(() => other.select(2, 2)));
    await act(async () => {
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    });
    unregister();
    // Exactly the two user commits (the literal edit, the caret move): the pended twin's
    // resolve refused without mutating, so no settle commit and no follow-on
    // selection-normalization commit ever happened.
    expect(commits).toBe(2);
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent();
      expect(text.split('\\ts-s |sid="x"')).toHaveLength(3); // both literals intact
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(3);
      // The refusal also left the caret exactly where the user put it.
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        expect(selection.anchor.key).toBe(other.getLatest().getKey());
        expect(selection.anchor.offset).toBe(2);
      }
    });
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

describe("$textNodeTier2Transform on pipe-text in plain content", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("pends `|…` plain content inside a CLOSED span (without re-tokenizing it)", () => {
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode(`${NBSP}text|stuff="thing"`);
        const char = $createCharNode("nd");
        const para = $createParaNode("p");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
          ),
        );
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        $textNodeTier2Transform(content, context);
        // A closer glyph is present, so the pipe text is a pending attribute edit — it pends and
        // waits for caret departure rather than re-tokenizing now.
        expect(context.pendingKeys.has(content.getKey())).toBe(true);
        expect(context.rebuildAttempted.size).toBe(0);
      },
      { discrete: true },
    );
  });

  it("does NOT pend `|…` plain content in an UNCLOSED span (no closing glyph)", () => {
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode(`${NBSP}text|x="y"`);
        const char = $createCharNode("nd").setUnknownAttributes({ closed: "false" });
        const para = $createParaNode("p");
        // No closing MarkerNode child: an unclosed span can carry no attributes, so `|…` stays
        // literal (PT9 semantics).
        $getRoot().append(
          para.append($createMarkerNode("p"), char.append($createMarkerNode("nd"), content)),
        );
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        context.pendingKeys.add(content.getKey()); // prove the transform clears it, not just skips
        $textNodeTier2Transform(content, context);
        expect(context.pendingKeys.has(content.getKey())).toBe(false);
      },
      { discrete: true },
    );
  });

  it("does NOT pend `|…` plain paragraph text (no CharNode ancestor)", () => {
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode(`${NBSP}text|x="y"`);
        const para = $createParaNode("p");
        $getRoot().append(para.append($createMarkerNode("p"), content));
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        context.pendingKeys.add(content.getKey());
        $textNodeTier2Transform(content, context);
        expect(context.pendingKeys.has(content.getKey())).toBe(false);
      },
      { discrete: true },
    );
  });
});

describe("$textNodeTier2Transform on `//` optbreak text in plain content", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("pends `//` plain paragraph content (without re-tokenizing it now)", () => {
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode("one // two");
        const para = $createParaNode("p");
        $getRoot().append(para.append($createMarkerNode("p"), content));
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        $textNodeTier2Transform(content, context);
        // `//` is a discretionary line break: it pends and waits for caret departure rather than
        // re-tokenizing now (settle-on-departure), and no rebuild is attempted mid-edit.
        expect(context.pendingKeys.has(content.getKey())).toBe(true);
        expect(context.rebuildAttempted.size).toBe(0);
      },
      { discrete: true },
    );
  });

  it("pends `//` content inside a char span (the tokenizer converts char content too)", () => {
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode(`${NBSP}a//b`);
        const char = $createCharNode("nd");
        const para = $createParaNode("p");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
          ),
        );
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        $textNodeTier2Transform(content, context);
        expect(context.pendingKeys.has(content.getKey())).toBe(true);
      },
      { discrete: true },
    );
  });

  it("does NOT pend `//` inside an opaque unknown block (tokenizer keeps it literal there)", () => {
    // Book/chapter/opaque-unknown content is a literal-only degradation context: the tokenizer
    // never re-tokenizes it, so a `//` there must stay literal rather than pend for a settle
    // that could never happen — the same exclusion the backslash path already applies.
    const { editor } = createBasicTestEnvironment();
    let content: TextNode;
    editor.update(
      () => {
        content = $createTextNode("one // two");
        const block = $createUnknownNode("figure", "fig");
        $getRoot().append(block.append(content));
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        context.pendingKeys.add(content.getKey()); // prove the transform clears it, not just skips
        $textNodeTier2Transform(content, context);
        expect(context.pendingKeys.has(content.getKey())).toBe(false);
      },
      { discrete: true },
    );
  });
});
