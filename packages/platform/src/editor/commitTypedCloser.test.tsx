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
 * This deliberately does NOT route through `$closeCharSpanAtCaret`, which remains the apply for a
 * PICKED `closeTag` menu entry. The two diverge exactly where the user is most likely to press
 * `*` — with the caret at the span's CONTENT END, that helper takes its "already effectively
 * closed" branch, changing no text and only moving the caret, so the span stays `closed="false"`
 * with no closing glyph on screen. Landing the literal is what actually puts `\nd*` there.
 *
 * Caret placement is part of the contract: after a closing-marker commit the caret belongs AFTER
 * the closer, never between the content and the closer's backslash.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { mountStandardViewEditor, requireStandardViewOptions } from "./settledGetUsj.test-helpers";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, LexicalEditor } from "lexical";
import { createRef } from "react";
import { $isCharNode, $isMarkerNode, $isParaNode } from "shared";
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

  it("refuses a non-collapsed selection — returns false, document untouched", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    const before = JSON.stringify(lexical.getEditorState().toJSON());
    await act(async () =>
      lexical.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "hello world");
        if (!$isTextNode(text)) throw new Error("fixture text node not found");
        text.select(0, 5);
      }),
    );

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedCloser("nd");
    });

    expect(committed).toBe(false);
    expect(JSON.stringify(lexical.getEditorState().toJSON())).toBe(before);
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
