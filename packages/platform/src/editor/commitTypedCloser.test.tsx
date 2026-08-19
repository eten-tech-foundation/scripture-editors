/**
 * `EditorRef.commitTypedCloser` — the marker palette's `*` commit ("close what was typed"). Where
 * Space commits an OPENING marker (`\nd `, materialized as the literal bytes passive typing would
 * have left), `*` commits a CLOSING marker `\nd*` at the caret: no trailing space, no opening
 * glyph, palette closed.
 *
 * The typed bytes always LAND and the marker-edit engine re-tokenizes them — governing invariant I,
 * displayed bytes are the document. The engine, not the palette, decides what they mean: against a
 * matching open span they settle as that span's real closer (the span loses `closed="false"` and
 * gains its closing glyph); with nothing matching they settle as an unmatched closer, flagged as
 * typed. Both are ratified end states for a typed closer, byte-identical to typing `\nd*` by hand.
 *
 * A PICKED `closeTag` menu entry is the SAME commit — see the second describe below, which also
 * covers the file side. There is one closer path in the editor and this is it.
 *
 * Caret placement is part of the contract: after a closing-marker commit the caret belongs AFTER
 * the closer, never between the content and the closer's backslash.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { MarkerMenuItem } from "./markerMenu/markerItemSource";
import { mountStandardViewEditor, requireStandardViewOptions } from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { act, render } from "@testing-library/react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, LexicalEditor } from "lexical";
import { createRef, RefObject } from "react";
import {
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  getMarker,
  getPendedDisplayOwners,
  NBSP,
  usfmFragmentToUsjContent,
} from "shared";
import { describe, expect, it } from "vitest";

const baseUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "1" }, "hello world"],
    },
  ],
};

/** Collapse the caret inside the text node whose content is exactly `text`, at `offset`. */
async function placeCaretIn(lexical: LexicalEditor, text: string, offset: number): Promise<void> {
  await act(async () =>
    lexical.update(() => {
      const node = $getRoot()
        .getAllTextNodes()
        .find((candidate) => candidate.getTextContent() === text);
      if (!$isTextNode(node)) throw new Error(`fixture text node "${text}" not found`);
      node.select(offset, offset);
    }),
  );
}

/**
 * Everything the caret-placement contract needs to be stated in: the full paragraph text, and
 * how many characters of it sit before the caret. Reading a byte offset within the paragraph
 * (rather than a node identity) is what lets "after the asterisk" be asserted directly, whichever
 * node the boundary ends up hosted by.
 */
function readCaretOffsetInPara(lexical: LexicalEditor): {
  paraText: string;
  offset: number;
  /** Type of the top-level block the caret actually landed in — `"para"` unless it escaped. */
  block: string;
} {
  return lexical.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
    const para = $getRoot().getChildren().filter($isParaNode)[0];
    const paraText = para.getTextContent();

    const anchorNode = selection.anchor.getNode();
    const block =
      anchorNode
        .getParents()
        .reverse()
        .find((ancestor) => ancestor.getParent()?.getType() === "root")
        ?.getType() ??
      (anchorNode.getParent()?.getType() === "root" ? anchorNode.getType() : "unknown");

    // Walk the paragraph's text nodes in order, accumulating length until the anchor node is
    // reached; the caret's paragraph-relative offset is that running total plus its own offset.
    let offset = 0;
    for (const node of para.getAllTextNodes()) {
      if (node.is(anchorNode)) return { paraText, offset: offset + selection.anchor.offset, block };
      offset += node.getTextContentSize();
    }
    // Element-point selection: the boundary is hosted by the parent rather than a text node, so
    // the running total (the whole preceding text) is the caret's paragraph-relative offset.
    return { paraText, offset, block };
  });
}

describe("EditorRef.commitTypedCloser", () => {
  it("closes the OPEN span the typed marker names, leaving the caret AFTER the closer", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    // Build the open span exactly the way the palette does: `\nd` + Space at the caret.
    await placeCaretIn(lexical, "hello world", 5);
    await act(async () => {
      ref.current?.commitTypedMarker("nd");
    });

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    expect(committed).toBe(true);
    lexical.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(1);
      expect(chars[0].getMarker()).toBe("nd");
    });

    // The caret sits after the closing glyph, not inside the span and not before its backslash.
    const { paraText, offset, block } = readCaretOffsetInPara(lexical);
    expect(block).toBe("para");
    expect(paraText).toContain("\\nd*");
    expect(offset).toBe(paraText.indexOf("\\nd*") + "\\nd*".length);
  });

  it("leaves the caret AFTER a PARAGRAPH-DIRECT closer too (a verse attribute run)", async () => {
    // The closer-caret contract must not depend on what kind of construct the closer completes.
    // A `\va`/`\vp` value riding beside a verse (and a `\ca` beside a chapter, the shape this was
    // reported from) settles into an attribute run rather than a character span, so it exercises a
    // different rebuild shape than the `nd` case above — the caret must still land past the closer.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    // Verse-attribute position: caret immediately after the verse marker.
    await placeCaretIn(lexical, "hello world", 0);
    await act(async () => {
      ref.current?.commitTypedMarker("va");
    });
    await act(async () =>
      lexical.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("3");
      }),
    );

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("va");
    });

    expect(committed).toBe(true);
    const { paraText, offset, block } = readCaretOffsetInPara(lexical);
    expect(paraText).toContain("\\va*");
    // The caret must not escape the paragraph — the fallback that fires when the closer cannot be
    // stepped past lands it in a different block entirely.
    expect(block).toBe("para");
    expect(offset).toBe(paraText.indexOf("\\va*") + "\\va*".length);
  });

  it("commits NO trailing space and NO opening glyph", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaretIn(lexical, "hello world", 5);
    await act(async () => {
      ref.current?.commitTypedMarker("nd");
    });
    // Close at the END of the span's content — the position the user reaches by typing the text
    // and then the closer, and the one the whole `*` trigger exists to serve.
    await act(async () =>
      lexical.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const texts = para.getAllTextNodes();
        const last = texts[texts.length - 1];
        last.select(last.getTextContentSize(), last.getTextContentSize());
      }),
    );
    await act(async () => {
      ref.current?.commitTypedCloser("nd");
    });

    const closedParaText = lexical
      .getEditorState()
      .read(() => $getRoot().getChildren().filter($isParaNode)[0].getTextContent());
    // The closer is the LAST thing in the paragraph: `*` adds no terminating space of its own
    // (that is Space's job, and the whole point of having a second commit key).
    expect(closedParaText.endsWith("\\nd*")).toBe(true);

    lexical.getEditorState().read(() => {
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)[0]
        .getChildren()
        .filter($isCharNode);
      expect(chars).toHaveLength(1);
      // Exactly two glyphs: the opening one Space committed and the closing one `*` just did —
      // no SECOND opening glyph, which is what distinguishes `*` from another Space commit.
      expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(2);
      // The span is no longer open: the engine resolved the typed closer against it.
      expect(chars[0].getUnknownAttributes()?.closed).toBeUndefined();
    });
  });

  it("lands the typed closer LITERALLY when no matching span is open at the caret", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaretIn(lexical, "hello world", 5);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    // Not a silent no-op: the typed bytes land and the engine flags them unmatched.
    expect(committed).toBe(true);
    const paraText = lexical
      .getEditorState()
      .read(() => $getRoot().getChildren().filter($isParaNode)[0].getTextContent());
    expect(paraText).toContain("\\nd*");
  });

  it("lands literally when the typed closer does not match the span that IS open", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaretIn(lexical, "hello world", 5);
    await act(async () => {
      ref.current?.commitTypedMarker("nd");
    });

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("wj");
    });

    expect(committed).toBe(true);
    const paraText = lexical
      .getEditorState()
      .read(() => $getRoot().getChildren().filter($isParaNode)[0].getTextContent());
    // The `nd` span stays open; the mismatched closer is the user's typed bytes, preserved.
    expect(paraText).toContain("\\wj*");
    lexical.getEditorState().read(() => {
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)[0]
        .getChildren()
        .filter($isCharNode);
      expect(chars.map((char) => char.getMarker())).toContain("nd");
    });
  });

  it("over a non-collapsed selection, DELETES the selection and inserts the typed closer", async () => {
    // Paratext 9 semantics for a typed closer over a selection: typing `\nd*` with text selected
    // replaces that text with the literal `\nd*`, which is then unmatched unless an open `\nd`
    // precedes it. The closer is NOT refused and the selection is NOT wrapped — a selection wrap
    // is what Space commits, and `*` is a different key with a different job.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await act(async () =>
      lexical.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "hello world");
        if (!$isTextNode(text)) throw new Error("fixture text node not found");
        text.select(0, 5); // "hello"
      }),
    );

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    expect(committed).toBe(true);
    const { paraText, offset, block } = readCaretOffsetInPara(lexical);
    // The selected word is gone and the typed closer took its place.
    expect(paraText).not.toContain("hello");
    expect(paraText).toContain("\\nd*");
    // Same caret contract as the collapsed case: after the asterisk, still in the paragraph.
    expect(block).toBe("para");
    expect(offset).toBe(paraText.indexOf("\\nd*") + "\\nd*".length);
  });

  it("over a selection INSIDE an open span, the closer closes that span", async () => {
    // The delete-then-insert lands real bytes that the engine re-tokenizes, exactly as the
    // collapsed commit does — so an `\nd` open before the selection is genuinely closed by the
    // inserted closer rather than left dangling.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaretIn(lexical, "hello world", 0);
    await act(async () => {
      ref.current?.commitTypedMarker("nd");
    });

    // Select the tail of the span's content, then close over it.
    await act(async () =>
      lexical.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const texts = para.getAllTextNodes().filter((node) => !$isMarkerNode(node));
        const last = texts[texts.length - 1];
        last.select(last.getTextContentSize() - 5, last.getTextContentSize());
      }),
    );

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    expect(committed).toBe(true);
    lexical.getEditorState().read(() => {
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)[0]
        .getChildren()
        .filter($isCharNode);
      expect(chars).toHaveLength(1);
      expect(chars[0].getMarker()).toBe("nd");
      expect(chars[0].getUnknownAttributes()?.closed).toBeUndefined();
    });
  });

  it("returns false when there is no range selection", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    const before = JSON.stringify(lexical.getEditorState().toJSON());

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    expect(committed).toBe(false);
    expect(JSON.stringify(lexical.getEditorState().toJSON())).toBe(before);
  });

  it("throws in readonly mode", async () => {
    const ref = createRef<EditorRef>();
    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={baseUsj}
          options={{ view: requireStandardViewOptions(), isReadonly: true }}
        />,
      );
    });

    expect(() => ref.current?.commitTypedCloser("nd")).toThrow(/readonly/);
  });
});

/**
 * A PICKED close-tag entry is the SAME commit as a typed `*`, at every caret position — owner-
 * directed (2026-08-19), reported against the shape below.
 *
 * It used to run a structural close instead (`$closeCharSpanAtCaret`), and that produced no closer
 * bytes anywhere. Measured, on `\p \v 1 \nd stuff and things` with the span still open:
 *
 * | caret | displayed bytes | USJ reaching the file |
 * | --- | --- | --- |
 * | content end | UNCHANGED | UNCHANGED — `closed="false"` intact |
 * | mid-content | UNCHANGED | span truncated to `["st"]` + plain tail, `closed="false"` KEPT |
 * | after the span | UNCHANGED | UNCHANGED |
 *
 * So at two of three positions the keystroke did nothing at all, and at the third it silently
 * restructured the document while still writing no `\nd*` — the span stayed marked unclosed. That
 * is the owner's report ("it closes the `\nd` in editor state without actually putting in an
 * `\nd*`, so it doesn't save anything to file") and a "no silent no-ops" violation (invariant I).
 *
 * These pins therefore assert the FILE side, not just the tree: a tree-only assertion would have
 * passed on the mid-content row above while the saved document was still wrong.
 */
describe("EditorRef.applyMarkerMenuSelection — a PICKED closeTag entry", () => {
  const reference: SerializedVerseRef = { book: "GEN", chapterNum: 1, verseNum: 1 };

  /** Two paragraphs: the reported one, plus a second to park an unrelated pending edit in. */
  const twoParaUsj: Usj = {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1" },
      {
        type: "para",
        marker: "p",
        content: [{ type: "verse", marker: "v", number: "1" }, "stuff and things"],
      },
      { type: "para", marker: "p", content: ["a second paragraph"] },
    ],
  };

  const closeTagItem: MarkerMenuItem = { marker: "nd*", kind: "closeTag", isBasic: false };

  /** Mount, then open an `\nd` span over "stuff and things" exactly as the palette's Space commit
   * does — the state the owner was in when they reached for the close-tag entry. */
  async function mountWithOpenNdSpan(): Promise<{
    ref: RefObject<EditorRef | null>;
    lexical: LexicalEditor;
  }> {
    const { ref, lexical } = await mountStandardViewEditor(twoParaUsj, { scrRef: reference });
    await placeCaretIn(lexical, "stuff and things", 0);
    await act(async () => {
      ref.current?.commitTypedMarker("nd");
    });
    // Precondition: the span really is OPEN, which is what makes a closer meaningful.
    expect(ndSpanOf(ref.current?.getUsj())?.closed).toBe("false");
    return { ref, lexical };
  }

  /** The reported paragraph's own displayed bytes. */
  function reportedParaText(lexical: LexicalEditor): string {
    return lexical
      .getEditorState()
      .read(() => $getRoot().getChildren().filter($isParaNode)[0].getTextContent());
  }

  /** The `\nd` span's USJ entry in the FIRST paragraph, or undefined when there isn't one. */
  function ndSpanOf(usj: Usj | undefined): (MarkerObject & { closed?: string }) | undefined {
    const para = usj?.content[2];
    if (!para || typeof para === "string") return undefined;
    const span = para.content?.find((entry) => typeof entry !== "string" && entry.type === "char");
    return span && typeof span !== "string" ? span : undefined;
  }

  /** Park the caret at one of the three positions the unification has to cover. */
  async function placeCaret(
    lexical: LexicalEditor,
    where: "contentEnd" | "midContent" | "afterSpan",
  ): Promise<void> {
    await act(async () =>
      lexical.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const char = para.getChildren().filter($isCharNode)[0];
        const contentTexts = char.getAllTextNodes().filter((node) => !$isMarkerNode(node));
        const last = contentTexts[contentTexts.length - 1];
        if (where === "contentEnd") {
          last.select(last.getTextContentSize(), last.getTextContentSize());
        } else if (where === "midContent") {
          // Between "stuff" and " and things" (the content text is NBSP + "stuff and things").
          last.select(6, 6);
        } else {
          const index = char.getIndexWithinParent();
          para.select(index + 1, index + 1);
        }
      }),
    );
  }

  async function pickCloseTag(ref: RefObject<EditorRef | null>): Promise<void> {
    await act(async () => {
      ref.current?.applyMarkerMenuSelection(closeTagItem, {
        trigger: "backslash",
        literalPrefixLanded: false,
      });
    });
  }

  it("lands `\\nd*` at the caret and the closer REACHES THE FILE (the reported shape)", async () => {
    const { ref, lexical } = await mountWithOpenNdSpan();
    await placeCaret(lexical, "contentEnd");

    await pickCloseTag(ref);

    // On screen: the bytes the entry names, at the caret.
    expect(reportedParaText(lexical)).toContain("stuff and things\\nd*");

    // In the FILE: `getUsj()` is the host's save read. Nothing is pending here (the closer settles
    // within the same update), so this is the cached editor -> USJ leg.
    expect(getPendedDisplayOwners(lexical)?.size ?? 0).toBe(0);
    const span = ndSpanOf(ref.current?.getUsj());
    // The engine resolved the typed bytes against the open span: genuinely closed now.
    expect(span?.closed).toBeUndefined();
    expect(span?.content).toEqual(["stuff and things"]);
  });

  it("reaches the file on the read-only `$settledUsj` save leg too", async () => {
    // `getUsj()` has two legs: the cached editor -> USJ above, and a `$settledUsj` recompute taken
    // whenever anything is pending. A host that saves while an unrelated edit is still settling
    // elsewhere in the chapter takes the second one, and the closer must be in that output too.
    const { ref, lexical } = await mountWithOpenNdSpan();
    await placeCaret(lexical, "contentEnd");
    await pickCloseTag(ref);

    // Pend an UNRELATED edit in the second paragraph: rename its prefix glyph with the caret left
    // inside it (the same pend shape `settledGetUsj.test.tsx` uses).
    await act(async () => {
      lexical.update(() => {
        const secondPara = $getRoot().getChildren().filter($isParaNode)[1];
        const glyph = secondPara.getFirstChild();
        if (!$isTextNode(glyph)) throw new Error("expected a prefix glyph");
        glyph.setTextContent("\\q1");
        glyph.select(3, 3);
      });
      await Promise.resolve();
    });

    // The read-only leg is now the one `getUsj()` takes.
    expect(getPendedDisplayOwners(lexical)?.size ?? 0).toBeGreaterThan(0);
    const span = ndSpanOf(ref.current?.getUsj());
    expect(span?.closed).toBeUndefined();
    expect(span?.content).toEqual(["stuff and things"]);
  });

  it("settles to exactly what re-tokenizing the DISPLAYED bytes produces", async () => {
    // The engine is not asked to be clever about a picked entry: the bytes land and re-tokenize.
    // Comparing against the standalone tokenizer is what proves that — if the apply had reached
    // any structural shortcut, the two would disagree.
    const { ref, lexical } = await mountWithOpenNdSpan();
    await placeCaret(lexical, "contentEnd");
    await pickCloseTag(ref);

    // Editable marker mode separates glyphs from content with NBSP; the tokenizer reads USFM, in
    // which those separators are ordinary spaces.
    const displayedBytes = reportedParaText(lexical).replaceAll(NBSP, " ");
    // Guard the comparison below against being trivially true: with no closer in the displayed
    // bytes both sides would simply agree that the span is still open, which is what the broken
    // structural close produced.
    expect(displayedBytes).toContain("\\nd*");

    const retokenized = usfmFragmentToUsjContent(displayedBytes, { getMarker });
    const retokenizedPara = retokenized[0];
    if (!retokenizedPara || typeof retokenizedPara === "string")
      throw new Error("expected a para from the tokenizer");
    const retokenizedSpan = retokenizedPara.content?.find(
      (entry) => typeof entry !== "string" && entry.type === "char",
    );
    // The standalone tokenizer's own verdict on those bytes: a CLOSED span.
    expect(retokenizedSpan).toBeDefined();
    expect((retokenizedSpan as MarkerObject & { closed?: string }).closed).toBeUndefined();

    expect(ndSpanOf(ref.current?.getUsj())).toEqual(retokenizedSpan);
  });

  it.each(["midContent", "afterSpan"] as const)(
    "lands the closer and reaches the file with the caret %s too",
    async (where) => {
      // The unification is per-caret-position: mid-content used to restructure the tree while
      // writing no closer bytes, and past the span the apply could not find a span at all and
      // refused silently. Both now do what the content-end case does.
      const { ref, lexical } = await mountWithOpenNdSpan();
      await placeCaret(lexical, where);

      await pickCloseTag(ref);

      expect(reportedParaText(lexical)).toContain("\\nd*");
      const span = ndSpanOf(ref.current?.getUsj());
      expect(span?.closed).toBeUndefined();
      expect(span?.content).toEqual(where === "midContent" ? ["stuff"] : ["stuff and things"]);
    },
  );
});
