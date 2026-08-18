import { serializeEditorState } from "../adaptors/usj-editor.adaptor";
import {
  $appendCharPara,
  $appendVersePara,
  testEnvironment,
  viewOptions as standardViewOptions,
} from "./markerEdit.test-helpers";
import { $createMarkerPrefix, $setParaMarkerWithPrefix } from "./markerEditDeletion.utils";
import { act } from "@testing-library/react";
import { EMPTY_USJ, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  INSERT_PARAGRAPH_COMMAND,
  LexicalEditor,
  NODE_STATE_KEY,
  PASTE_COMMAND,
} from "lexical";
import { $dfs } from "@lexical/utils";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  isSerializedMarkerNode,
  isSerializedParaNode,
  isSerializedTextNode,
  MarkerNode,
  NBSP,
  NoteNode,
  PARA_MARKER_DEFAULT,
  ParaNode,
  textTypeState,
  VerseNode,
} from "shared";

// jsdom implements `getBoundingClientRect` on Element but not on Range. The Enter-split test
// below seeds an initial selection, which gives the editor root DOM focus as soon as it mounts;
// once focused, Lexical's post-commit scroll-into-view step reads a native `Range`'s bounding
// rect to decide whether to scroll, and jsdom's missing method throws. Stub it the same way
// jsdom already stubs Element's version (a zero rect nothing here asserts on).
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

describe("deletion semantics", () => {
  it("merges a para into the previous para when its marker is deleted", async () => {
    let first: ParaNode, second: ParaNode, secondMarker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      first = $createParaNode("p");
      second = $createParaNode("q1");
      secondMarker = $createMarkerNode("q1");
      $getRoot().append(
        first.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("one")),
        second.append(secondMarker, $createTextNode(NBSP), $createTextNode("two")),
      );
    });
    await act(async () => editor.update(() => secondMarker.remove()));
    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      expect(first.getTextContent()).toContain("one");
      expect(first.getTextContent()).toContain("two");
    });
  });

  it("resets to \\p with a visible prefix when there is no previous para", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("q1");
      marker = $createMarkerNode("q1");
      $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("text")));
    });
    await act(async () => editor.update(() => marker.remove()));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe(PARA_MARKER_DEFAULT);
      expect($isMarkerNode(para.getFirstChild())).toBe(true);
    });
  });

  it("retags a paragraph and injects its visible prefix as one step", async () => {
    // $setParaMarkerWithPrefix is the single entry point for "give this prefix-less paragraph a
    // marker": marker state, [glyph, separator] prefix, and content-side caret must all land
    // together, or the deletion transform reads the half-built paragraph as marker-deleted.
    // `text` is a definite-assignment declaration (`!`): it's only ever assigned inside the
    // `editor.update` callback below, so TS's control-flow analysis can't see the assignment as
    // unconditional from this scope — the alternative, a postfix `text!` at each read site, is
    // exactly what @typescript-eslint/no-non-null-assertion forbids.
    let para: ParaNode, text!: ReturnType<typeof $createTextNode>;
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("one"),
        ),
      );
    });

    // Snapshot the caret synchronously after the discrete commit, before act's async flush —
    // jsdom's ASYNC focus/selection sync can clobber the live selection afterwards (a
    // test-environment artifact; real browsers don't do this). The engine's guarantee is where
    // the caret lands AS PART OF the retag commit, which the snapshot captures exactly.
    let caretAfterRetag: { key: string; offset: number } | undefined;
    await act(async () => {
      editor.update(
        () => {
          para = $createParaNode("p");
          text = $createTextNode("content");
          $getRoot().append(para.append(text));
          $setParaMarkerWithPrefix(para, "q1");
        },
        { discrete: true },
      );
      caretAfterRetag = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return undefined;
        return { key: selection.anchor.key, offset: selection.anchor.offset };
      });
    });

    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("q1");
      const first = para.getFirstChild();
      expect($isMarkerNode(first)).toBe(true);
      expect($isMarkerNode(first) ? first.getMarker() : undefined).toBe("q1");
      expect($isMarkerNode(first) ? first.getTextContent() : undefined).toBe("\\q1");
      // The engine-owned separator: exact NBSP, token mode, tagged as marker-trailing-space.
      const second = para.getChildAtIndex(1);
      expect($isTextNode(second) ? second.getTextContent() : undefined).toBe(NBSP);
      expect($isTextNode(second) ? second.getMode() : undefined).toBe("token");
      expect($isTextNode(second) ? $getState(second, textTypeState) : undefined).toBe(
        "marker-trailing-space",
      );
    });
    // Caret parks on the content side of the prefix, not inside/before it — asserted from the
    // commit-time snapshot (see above).
    expect(caretAfterRetag?.key).toBe(text.getKey());
    expect(caretAfterRetag?.offset).toBe(0);
  });

  it("injects a marker prefix into the Enter-split paragraph (cloned marker)", async () => {
    // A genuine MID-CONTENT Enter split: the tail content moves to the fresh paragraph while
    // the original prefix glyph stays behind, so the fresh paragraph's prefix can only come
    // from the engine's injection. The caret is placed inside the dispatch-time update — a
    // mount-seeded selection is clobbered by jsdom's focus/selection sync (the caret snaps to
    // the glyph start), which silently turns the split into a paragraph-START one where the
    // ORIGINAL glyph travels with the content and no injection is exercised at all.
    let originalGlyphKey: string | undefined;
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createMarkerNode("q1"),
          $createTextNode(NBSP),
          $createTextNode("one two"),
        ),
      );
    });
    // The caret is snapshotted SYNCHRONOUSLY after the discrete commit, before act's async
    // flush: jsdom emulates focus/selection sync with ASYNC events that can clobber the live
    // selection after the fact (a test-environment artifact — in a real browser Lexical drives
    // the DOM selection). The engine's guarantee under test is where the caret lands AS PART OF
    // the operation's commit, which is exactly what the snapshot captures.
    let caretAfterSplit: { text: string; offset: number } | undefined;
    await act(async () => {
      editor.update(
        () => {
          // Re-query the nodes here — the initial commit's transforms may have rewritten the
          // mount-time nodes.
          const para = $getRoot().getChildren().filter($isParaNode)[0];
          const glyph = para.getFirstChild();
          if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
          originalGlyphKey = glyph.getKey();
          const text = para.getLastChild();
          if (!$isTextNode(text)) throw new Error("expected the paragraph's content text");
          // Compute the offset instead of hardcoding it: the initial commit merges the mount-time
          // NBSP separator into this text node (heal re-inserts a fresh separator before it), so
          // the content may carry a leading NBSP.
          const offset = text.getTextContent().indexOf("one") + "one".length;
          text.select(offset, offset); // caret MID-CONTENT: "one| two"
          editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
        },
        { discrete: true },
      );
      caretAfterSplit = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return undefined;
        return {
          text: selection.anchor.getNode().getTextContent(),
          offset: selection.anchor.offset,
        };
      });
    });
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      // The content split at the caret...
      expect(paras[0].getTextContent()).toContain("one");
      expect(paras[0].getTextContent()).not.toContain("two");
      expect(paras[1].getTextContent()).toContain("two");
      // ...the ORIGINAL glyph stayed with the first paragraph...
      const firstGlyph = paras[0].getFirstChild();
      expect($isMarkerNode(firstGlyph) ? firstGlyph.getKey() : undefined).toBe(originalGlyphKey);
      // ...and the fresh paragraph carries the marker cloned by insertNewAfter with a freshly
      // INJECTED prefix glyph — a new node, not the migrated original.
      expect(paras[1].getMarker()).toBe("q1");
      const injectedGlyph = paras[1].getFirstChild();
      expect($isMarkerNode(injectedGlyph)).toBe(true);
      expect($isMarkerNode(injectedGlyph) ? injectedGlyph.getKey() : undefined).not.toBe(
        originalGlyphKey,
      );
    });
    // The caret lands on the content side of the injected prefix, ready to keep typing.
    // Asserted from the commit-time snapshot (see above), semantically (anchor text + offset)
    // rather than by node key: post-transform normalization can recreate the content node while
    // the caret's semantic position is unchanged.
    expect(caretAfterSplit?.text).toContain("two");
    expect(caretAfterSplit?.offset).toBe(0);
  });

  it("claims an END-of-paragraph Enter split: the empty clone gets its prefix, typing stays in it", async () => {
    // Enter at the very end of a paragraph clones a durably EMPTY paragraph (insertNewAfter
    // copies the marker, no content follows the caret) — the user's next act is typing into it.
    // If the engine treats that emptiness as transient and skips the prefix injection, the first
    // typed character produces a prefix-less non-empty paragraph, which the deletion transform
    // reads as "marker deleted" and merges straight back into the previous paragraph — Enter
    // then typing reunites the paragraphs instead of continuing in the new one.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createMarkerNode("q1"),
          $createTextNode(NBSP),
          $createTextNode("one two"),
        ),
      );
    });
    // Select inside the SAME update as the dispatch (the harness's pressEnterAtSelection
    // pattern): a selection seeded at mount is clobbered by jsdom's focus/selection sync, which
    // parks the caret at the first text position instead. Re-query the nodes here — the initial
    // commit's transforms may have rewritten the mount-time text nodes.
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const last = para.getLastChild();
        // Caret at the very END of the paragraph's content.
        if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize());
        else para.selectEnd();
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      }),
    );
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).toContain("one two"); // content stays in the original
      expect(paras[1].getMarker()).toBe("q1"); // cloned by insertNewAfter
      expect($isMarkerNode(paras[1].getFirstChild())).toBe(true); // prefix injected while empty
    });
    // Typing in the fresh paragraph — it must NOT merge back into the first.
    await act(async () =>
      editor.update(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        const fresh = paras[paras.length - 1];
        fresh.selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("x");
      }),
    );
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).not.toContain("x");
      expect(paras[1].getTextContent()).toContain("x");
    });
  });

  it("unwraps a char span when its opener is deleted", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.remove()));
    editor.getEditorState().read(() => {
      expect(parts.char.isAttached()).toBe(false);
      // content survived as plain text without the NBSP prefix or closer glyph
      expect($getRoot().getTextContent()).toContain("Lord");
      expect($getRoot().getTextContent()).not.toContain("\\nd*");
    });
  });

  it("keeps an element-point caret AT the span across a same-commit unwrap (no drag past the content)", async () => {
    // The unwrap reinserts the span's children AFTER it (identical resulting tree) precisely so
    // an element point addressing the span's own child index never moves: Lexical advances an
    // element point past every node inserted at its offset without pulling it back when the
    // emptied wrapper is then removed, so reinserting BEFORE the span dragged the caret past the
    // reinserted content. Pinned through opener deletion — the canonical still-live path to the
    // unwrap now that the paragraph split closes-and-reopens instead of producing an unwrappable
    // glyph-less span.
    let opener!: MarkerNode;
    let para!: ParaNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("p");
      const nd = $createCharNode("nd");
      opener = $createMarkerNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("say "),
          nd.append(opener, $createTextNode(`${NBSP}Lord`), $createMarkerNode("nd", "closing")),
          $createTextNode(" of hosts"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        // The caret as an ELEMENT point at the span's own child index — the shape a structural
        // edit can leave at a span boundary — then the opener goes in the same update.
        para.select(3, 3);
        opener.remove();
      }),
    );
    // The observable form: typing lands at the START of the formerly wrapped content, where the
    // element point sat — not past it.
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("X");
      }),
    );
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent().replaceAll(NBSP, " ");
      expect(text).toContain("say XLord of hosts");
    });
  });

  it("preserves an unwrapped span's unknown attributes as canonical literal text", async () => {
    let char: ReturnType<typeof $createCharNode>, opener: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("w", { lemma: "grace" });
      opener = $createMarkerNode("w");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(opener, $createTextNode(`${NBSP}word`), $createMarkerNode("w", "closing")),
        ),
      );
    });
    await act(async () => editor.update(() => opener.remove()));
    editor.getEditorState().read(() => {
      expect(char.isAttached()).toBe(false); // span unwrapped
      // PT9 leaves the attributes as literal bytes, in the canonical PT9 form: a lone default
      // attribute (`lemma` for `\w`) collapses to bare `|value`, matching the span's display run.
      const text = $getRoot().getTextContent();
      expect(text).toContain("word|grace");
      expect(text).not.toContain('lemma="grace"');
    });
  });

  it("emits a single canonical attribute representation when unwrapping a span WITH a display run", async () => {
    // \w word|grace\w* — the span carries BOTH the derived display run (textType "attribute") and
    // its own unknownAttributes. Deleting the opener unwraps it; the display run must be dropped
    // (a derived cache, not content) so the reconstruction is the ONLY attribute bytes left —
    // previously the run persisted AND the reconstruction re-emitted the bytes, yielding
    // `word|grace |lemma="grace"` (duplicated attribute bytes) after settle.
    let char: ReturnType<typeof $createCharNode>, opener: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("w", { lemma: "grace" });
      opener = $createMarkerNode("w");
      const run = $createTextNode("|grace");
      $setState(run, textTypeState, "attribute");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            opener,
            $createTextNode(`${NBSP}word`),
            run,
            $createMarkerNode("w", "closing"),
          ),
        ),
      );
    });
    await act(async () => editor.update(() => opener.remove()));
    editor.getEditorState().read(() => {
      expect(char.isAttached()).toBe(false); // span unwrapped
      const text = $getRoot().getTextContent();
      // Exactly one `|grace` — the display run did not survive as a second copy, and the
      // reconstruction was NOT the explicit `|lemma="grace"` form.
      expect(text).toContain("word|grace");
      expect((text.match(/\|grace/g) ?? []).length).toBe(1);
      expect(text).not.toContain("lemma=");
    });
  });

  it("re-tokenizes a PARTIAL closer-glyph deletion via Tier 2: residue becomes PLAIN text", async () => {
    // Deleting the `\` of `\nd*` degrades the glyph: once the caret departs (closer edits pend
    // mid-edit), the residue (`nd*`) must become NORMAL text via the Tier-2 re-tokenization —
    // never stay marker-styled inside a MarkerNode — and the span re-closes per tokenizer rules
    // (USJ has no closed="false" for char spans, so it auto-closes at the paragraph end).
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("say "),
          char.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord`),
            $createMarkerNode("nd", "closing"),
          ),
          $createTextNode(" of hosts"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const closer = $getRoot()
          .getAllTextNodes()
          .find((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing");
        closer?.spliceText(0, 1, "", true); // delete ONLY the backslash: `\nd*` → `nd*`
        // The caret sits where the deleted byte was, as a real Backspace leaves it — spliceText
        // only moves an EXISTING selection, and a caret-less glyph edit is machine drift the
        // engine heals (glyphDriftHeal.test.tsx).
        closer?.select(0, 0);
      }),
    );
    // The damaged closer pends while the caret sits in it; departure settles it through Tier 2.
    await act(async () =>
      editor.update(() => {
        $getRoot().getChildren().filter($isParaNode)[0].getFirstChild()?.selectStart();
      }),
    );
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      // The span re-closes per tokenizer rules, extending to the paragraph end...
      const char = para.getChildren().find($isCharNode);
      expect(char?.getTextContent()).toContain("of hosts");
      // ...the residue survives as PLAIN text (PT9 keeps the user's bytes)...
      const plainTexts = $getRoot()
        .getAllTextNodes()
        .filter((n) => !$isMarkerNode(n))
        .map((n) => n.getTextContent())
        .join("");
      expect(plainTexts).toContain("nd*");
      // ...and NO MarkerNode carries the backslash-less residue as its glyph text.
      const markerTexts = $getRoot()
        .getAllTextNodes()
        .filter($isMarkerNode)
        .map((n) => n.getTextContent());
      expect(markerTexts).not.toContain("nd*");
      // The span is now genuinely NOT CLOSED: closed="false" recorded, no regenerated closer
      // glyph — deleting the closer no longer makes a phantom `\nd*` pop up at the span's end.
      expect(char?.getUnknownAttributes()?.closed).toBe("false");
      const charHasCloser = char
        ?.getChildren()
        .some((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing");
      expect(charHasCloser).toBe(false);
    });
  });

  it('leaves an unclosed (closed="false") char span alone — no closer is its normal shape', async () => {
    // ParatextData emits closed="false" on every implicitly-closed char span; the adaptor
    // renders no closing glyph for those. The deletion transform must not read that as
    // "closer deleted" and re-route the span through Tier 2 forever.
    let char: ReturnType<typeof $createCharNode>;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("nd");
      char.setUnknownAttributes({ closed: "false" });
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append($createMarkerNode("nd"), $createTextNode(`${NBSP}Lord`)),
          $createTextNode(" of hosts"),
        ),
      );
    });

    editor.getEditorState().read(() => {
      // Intact: still a char span with its opener, content untouched, " of hosts" outside.
      expect(char.isAttached()).toBe(true);
      expect(char.getMarker()).toBe("nd");
      expect(char.getTextContent()).toContain("Lord");
      expect(char.getTextContent()).not.toContain("of hosts");
    });
  });

  it("routes closer deletion to Tier 2 (span extends per tokenizer rules)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord`),
            $createMarkerNode("nd", "closing"),
          ),
          $createTextNode(" of hosts"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const closer = $getRoot()
          .getAllTextNodes()
          .find((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing");
        closer?.remove();
      }),
    );
    editor.getEditorState().read(() => {
      // tokenizer auto-closes at para end: "of hosts" is now inside the span
      const char = $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode);
      expect(char?.getTextContent()).toContain("of hosts");
    });
  });

  it("heals a missing marker-trailing separator behind an intact prefix glyph", async () => {
    // The separator is engine-owned scaffolding: whatever ate it (forward-delete at the glyph
    // end, a selection that swallowed it), the next transform pass re-asserts it so the
    // [glyph, separator, content] layout — and the retag caret math — stays intact.
    const { editor } = await testEnvironment(() => {
      const wj = $createCharNode("wj");
      $getRoot().append(
        $createParaNode("q1").append(
          $createMarkerNode("q1"), // NO separator — corrupted state
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(`${NBSP}Jesus said`),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const second = para.getChildAtIndex(1);
      expect($isTextNode(second) ? second.getTextContent() : undefined).toBe(NBSP);
      expect($isTextNode(second) ? second.getMode() : undefined).toBe("token");
    });
  });

  it("canonicalizes a user-typed plain space after the glyph into the separator (not doubled)", async () => {
    const { editor } = await testEnvironment(() => {
      const wj = $createCharNode("wj");
      $getRoot().append(
        $createParaNode("q1").append(
          $createMarkerNode("q1"),
          $createTextNode(" "), // user typed a plain space where the separator belongs
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(`${NBSP}Jesus said`),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const children = para.getChildren();
      const second = children[1];
      expect($isTextNode(second) ? second.getTextContent() : undefined).toBe(NBSP);
      // Converted in place — no second separator inserted before it.
      expect($isCharNode(children[2])).toBe(true);
      expect(children).toHaveLength(3);
    });
  });

  it("deletes a verse when its whole token is deleted", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent("")));
    editor.getEditorState().read(() => expect(verse.isAttached()).toBe(false));
  });
});

describe("collapsed-note atomic deletion", () => {
  /** A `\p` para with `before`, a collapsed `\f` note (opener glyph, caller-placeholder text,
   * `\fr`/`\ft` content, closer glyph), and ` after` — the editable-mode shape `createNote`
   * builds. Returns the note. */
  function $appendParaWithCollapsedNote(): NoteNode {
    const note = $createNoteNode("f", "+", true);
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}before`),
        note.append(
          $createMarkerNode("f"),
          $createTextNode(`${NBSP}8.4 `),
          $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}8.4`)),
          $createMarkerNode("f", "closing"),
        ),
        $createTextNode(" after"),
      ),
    );
    return note;
  }

  function paraText(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => $getRoot().getTextContent());
  }

  function $onlyNoteCount(): number {
    return $dfs($getRoot()).filter(({ node }) => $isNoteNode(node)).length;
  }

  it("removes the whole note when its closing glyph is deleted (Backspace after the note)", async () => {
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        const closer = note
          .getChildren()
          .filter($isMarkerNode)
          .find((m) => m.getMarkerSyntax() === "closing");
        closer?.remove(); // what Backspace right after the collapsed note deletes
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
    // The corruption this pins: the damaged note must NOT spill its internals into the
    // paragraph as literal glyph text (live-verified pre-fix: `\fr 8.4 \ft \f*` in the verse).
    const text = paraText(editor);
    expect(text).not.toContain("\\fr");
    expect(text).not.toContain("\\f");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  it("removes the whole note when its opening glyph is deleted (forward Delete before the note)", async () => {
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        const opener = note
          .getChildren()
          .filter($isMarkerNode)
          .find((m) => m.getMarkerSyntax() === "opening");
        opener?.remove();
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
    const text = paraText(editor);
    expect(text).not.toContain("\\fr");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  it("leaves an intact collapsed note alone", async () => {
    const { editor } = await testEnvironment(() => {
      $appendParaWithCollapsedNote();
    });

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
  });

  it("leaves a glyph-less collapsed note alone (non-editable creation shapes)", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createNoteNode("f", "+", true).append($createTextNode(`${NBSP}content only`)),
        ),
      );
    });

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
  });

  describe("expanded-note glyph deletion", () => {
    /** A `\p` para with an EXPANDED (unclosed — no closing glyph, its normal shape) editable
     * `\f` note: opener glyph, editable caller text (` +<NBSP>`), and `\ft` content. */
    function $appendParaWithExpandedUnclosedNote(): NoteNode {
      const note = $createNoteNode("f", "+", false);
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(`${NBSP}before`),
          note.append(
            $createMarkerNode("f"),
            $createTextNode(` +${NBSP}`), // getEditableCallerText("+")
            $createCharNode("ft").append($createMarkerNode("ft"), $createTextNode(`${NBSP}stolen`)),
          ),
          $createTextNode(" after"),
        ),
      );
      return note;
    }

    it("UNWRAPS the expanded note when its opening glyph is deleted (content preserved)", async () => {
      // Deleting the visible `\f` of an EXPANDED note deletes only the marker, not the note's
      // content: the user sees that content inline and deleting `\f` must not eat it (an
      // unclosed note may have absorbed the whole rest of the verse). The note node dissolves:
      // the caller returns to plain text (its structural NBSP becomes a plain space so nothing
      // leaks as `~`) and the content stays in the paragraph. Contrast: a COLLAPSED note is an
      // atomic object, so glyph deletion still removes the whole note (tests above).
      let note: NoteNode;
      const { editor } = await testEnvironment(() => {
        note = $appendParaWithExpandedUnclosedNote();
      });

      await act(async () =>
        editor.update(() => {
          const opener = note
            .getChildren()
            .filter($isMarkerNode)
            .find((m) => m.getMarkerSyntax() === "opening");
          opener?.remove();
        }),
      );

      editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
      const text = paraText(editor);
      expect(text).not.toContain(`+${NBSP}`); // the editable-caller NBSP must not leak
      expect(text).toContain("+"); // the caller word returns to plain text
      expect(text).toContain("stolen"); // the note's content is PRESERVED in the paragraph
      expect(text).toContain("before");
      expect(text).toContain("after");
    });

    it("unwraps the expanded note when a range-delete took the opener AND the caller together", async () => {
      // Live repro: selecting the visible `~\f tell,` and deleting removes the opening glyph and
      // the editable caller text in ONE deletion. The earlier guard required the caller to still
      // be present as evidence, so the note survived and regenerated `\f tell,` on every save —
      // in both editors, forever. The note's content chars still carry their own marker glyphs,
      // which is sufficient evidence of an editable-built note.
      let note: NoteNode;
      const { editor } = await testEnvironment(() => {
        note = $appendParaWithExpandedUnclosedNote();
      });

      await act(async () =>
        editor.update(() => {
          const children = note.getChildren();
          const opener = children
            .filter($isMarkerNode)
            .find((m) => m.getMarkerSyntax() === "opening");
          const caller = children.find(
            (c) => $isTextNode(c) && !$isMarkerNode(c) && c.getTextContent() === ` +${NBSP}`,
          );
          opener?.remove();
          caller?.remove(); // what a range selection across `\f +<NBSP>` deletes in one go
        }),
      );

      editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
      const text = paraText(editor);
      expect(text).toContain("stolen"); // only what the user selected is deleted — content stays
      expect(text).toContain("before");
      expect(text).toContain("after");
    });

    it("leaves an intact unclosed expanded note alone (no closing glyph is its normal shape)", async () => {
      // Regression guard: an unclosed note NEVER has a closing glyph, so a naive
      // damaged-glyph-pair rule (opener XOR closer) would wrongly delete every intact
      // unclosed note. Only a missing OPENER means the user deleted the marker.
      const { editor } = await testEnvironment(() => {
        $appendParaWithExpandedUnclosedNote();
      });

      editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
      expect(paraText(editor)).toContain("stolen");
    });
  });

  it("keeps an intact note when a stray TextNode lands as its first child (typing at note start)", async () => {
    // Typing at the very start of a collapsed note anchors the typed char as the note's first
    // child, before the `\f` opener — the transient NoteNodePlugin's `$noteNodeTransform`
    // salvages by moving the text out. The opener glyph still exists (now second), so the note is
    // intact and must survive: a first/last-position glyph check would read this as "opener
    // deleted" and destroy the whole footnote before the salvage runs (transform ordering race).
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        note.splice(0, 0, [$createTextNode("x")]); // typed char lands before the `\f` opener
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
    // The paragraph is intact around the surviving note (its own glyph text stays inside it —
    // that is the note rendering, not a spill). The typed char was not lost either.
    const text = paraText(editor);
    expect(text).toContain("before");
    expect(text).toContain("after");
    expect(text).toContain("x");
  });
});

describe("internal paste of prefixed paragraphs", () => {
  // Internal Lexical copy of whole paragraphs pastes ParaNodes that carry their own
  // `[glyph, separator]` prefixes. The deletion transform must read those prefixes as intact
  // (heal branch) and keep the paragraphs — NOT treat them as marker-deleted and merge them
  // away. Note Lexical's own `insertNodes` merges the FIRST pasted block's children into the
  // caret paragraph (so its glyph lands inline there — standard Lexical splice semantics,
  // upstream of any transform); every subsequent pasted paragraph must survive whole.
  it("keeps a pasted paragraph that carries its own marker prefix", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("one"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        // Select inside the same update (a mount-seeded selection is clobbered by jsdom's
        // focus/selection sync — see the Enter-split test above).
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const last = para.getLastChild();
        if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize());
        else para.selectEnd();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection");
        const pasted1 = $createParaNode("q1").append(
          $createMarkerNode("q1"),
          $createTextNode(NBSP),
          $createTextNode("pasted one"),
        );
        const pasted2 = $createParaNode("q2").append(
          $createMarkerNode("q2"),
          $createTextNode(NBSP),
          $createTextNode("pasted two"),
        );
        selection.insertNodes([pasted1, pasted2]);
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      // The first pasted block merged into the caret para (Lexical insertNodes); the second
      // pasted paragraph survived as its own paragraph with its prefix intact.
      expect(paras.map((para) => para.getMarker())).toEqual(["p", "q2"]);
      const survivor = paras[1];
      expect($isMarkerNode(survivor.getFirstChild())).toBe(true);
      expect(survivor.getTextContent()).toContain("pasted two");
      // The caret paragraph kept its own prefix (heal branch) and the merged block's content.
      expect($isMarkerNode(paras[0].getFirstChild())).toBe(true);
      expect(paras[0].getTextContent()).toContain("pasted one");
    });
  });
});

describe("multi-line plain-text paste", () => {
  // jsdom implements neither `ClipboardEvent` nor `DragEvent`, but Lexical's paste path
  // (`eventFiles`/`onPasteForRichText`) references both as bare globals for its klass checks, so
  // the identifiers must at least resolve. The stubs never have to MATCH: the mock event below is
  // a plain object (the same duck-typing the plugin's own clipboard handlers use), so Lexical's
  // constructor-name comparisons all decline and it falls through to the `event.clipboardData`
  // read — the exact path a real browser ClipboardEvent takes.
  const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
  if (typeof globalStubs.DragEvent === "undefined")
    globalStubs.DragEvent = class DragEvent extends Event {};
  if (typeof globalStubs.ClipboardEvent === "undefined")
    globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

  /** A paste event whose only payload is `text/plain` — what pasting from a plain-text source
   * (terminal, text editor, address bar) delivers. */
  function plainTextPasteEvent(text: string): ClipboardEvent {
    const clipboardData = {
      types: ["text/plain"],
      files: [],
      getData: (type: string) => (type === "text/plain" ? text : ""),
    };
    return { clipboardData, preventDefault: () => undefined } as unknown as ClipboardEvent;
  }

  it("keeps every pasted line as its own prefixed paragraph, caret at the end of the paste", async () => {
    // @lexical/clipboard's text/plain path calls `selection.insertParagraph()` directly per
    // newline — never INSERT_PARAGRAPH_COMMAND — so the engine's Enter handler can't arm
    // `splitExpected` for it. Without the PASTE_COMMAND handler arming the flag, every fresh
    // prefix-less paragraph was read as marker-deleted and merged straight back: the whole
    // paste collapsed into ONE paragraph (`\p onefirstsecondthird`).
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("one"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        // Select inside the same update as the dispatch (a mount-seeded selection is clobbered
        // by jsdom's focus/selection sync — see the Enter-split tests above).
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const last = para.getLastChild();
        if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize());
        else para.selectEnd();
        editor.dispatchCommand(PASTE_COMMAND, plainTextPasteEvent("first\nsecond\nthird"));
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      // The first pasted line merges into the host paragraph (standard Lexical first-block
      // semantics — same as the internal-paste pin above); each later line becomes its own
      // paragraph with the host's marker cloned by insertNewAfter and its prefix injected.
      expect(paras.map((para) => para.getMarker())).toEqual(["p", "p", "p"]);
      paras.forEach((para) => expect($isMarkerNode(para.getFirstChild())).toBe(true));
      expect(paras[0].getTextContent()).toContain("onefirst");
      expect(paras[1].getTextContent()).toContain("second");
      expect(paras[1].getTextContent()).not.toContain("third");
      expect(paras[2].getTextContent()).toContain("third");
      // Caret discipline: after a paste the caret stays at the END of the pasted content.
      // Prefix injection must not yank it to a freshly injected paragraph's content start.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after paste");
      expect(selection.isCollapsed()).toBe(true);
      const anchorNode = selection.anchor.getNode();
      expect($isTextNode(anchorNode) ? anchorNode.getTextContent() : undefined).toBe("third");
      expect(selection.anchor.offset).toBe("third".length);
      expect(anchorNode.getParent()?.getKey()).toBe(paras[2].getKey());
    });
  });
});

describe("load/engine para prefix drift pin", () => {
  // The adaptor's `createPara` (load) and the marker-edit engine's `$createMarkerPrefix`
  // (heal/inject) both build the editable `[glyph, separator]` paragraph prefix. Every layout
  // and caret computation assumes the two shapes are identical — most critically the
  // separator's exact-NBSP text, token mode, and marker-trailing-space tag, which keep typed
  // text out of the separator and out of serialized USJ. This pin makes disagreement a test
  // failure instead of a "keep in sync" comment.
  it("$createMarkerPrefix builds the same [glyph, separator] pair the adaptor loads", async () => {
    interface PrefixShape {
      glyphMarker?: string;
      glyphSyntax?: string;
      separatorText?: string;
      separatorMode?: string;
      separatorTextType?: unknown;
    }

    // Engine side: the pair `$injectMarkerPrefix`/`$setParaMarkerWithPrefix` splice in.
    let engine: PrefixShape = {};
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("hi"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const [glyphNode, separatorNode] = $createMarkerPrefix("q1");
        if ($isMarkerNode(glyphNode))
          engine = { glyphMarker: glyphNode.getMarker(), glyphSyntax: glyphNode.getMarkerSyntax() };
        if ($isTextNode(separatorNode) && !$isMarkerNode(separatorNode))
          engine = {
            ...engine,
            separatorText: separatorNode.getTextContent(),
            separatorMode: separatorNode.getMode(),
            separatorTextType: $getState(separatorNode, textTypeState),
          };
      }),
    );

    // Load side: the same `\q1` paragraph serialized by the adaptor in standard view.
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "q1", content: ["hi"] } as MarkerObject],
    };
    const state = serializeEditorState(usj, standardViewOptions);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const [glyph, separator] = para.children;
    if (!isSerializedMarkerNode(glyph)) throw new Error("No para marker glyph found");
    if (!isSerializedTextNode(separator)) throw new Error("No separator found");
    const stateObject: unknown = separator[NODE_STATE_KEY];
    const loaded: PrefixShape = {
      glyphMarker: glyph.marker,
      glyphSyntax: glyph.markerSyntax,
      separatorText: separator.text,
      separatorMode: separator.mode,
      separatorTextType:
        stateObject && typeof stateObject === "object" && "textType" in stateObject
          ? stateObject.textType
          : undefined,
    };

    // Sanity-pin the load shape itself so both sides drifting together still fails loudly.
    expect(loaded).toEqual({
      glyphMarker: "q1",
      glyphSyntax: "opening",
      separatorText: NBSP,
      separatorMode: "token",
      separatorTextType: "marker-trailing-space",
    });

    expect(engine).toEqual(loaded);
  });
});
