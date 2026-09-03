/**
 * `EditorRef.commitTypedMarker` — the host-rendered marker palette's Space commit ("commit what
 * was typed"). The method materializes the typed query as the SAME literal bytes passive typing
 * would have accumulated in the document (`\` + typed + space) in one update, and the marker-edit
 * engine's Tier 2 resolves them exactly as it resolved passive typing — so the ratified Space end
 * states hold BY CONSTRUCTION, identical to the in-editor palette's own Space commit: an inline
 * marker settles as an open span (`closed="false"`, no auto-closer), an unknown marker settles as
 * typed, and `\f ` tokenizes to the full note ("commits like Enter", emergent from the tokenizer).
 *
 * A non-collapsed selection REFUSES (returns false, document untouched): a host palette over a
 * text selection must commit a specific offered item through
 * `EditorRef.applyMarkerMenuSelection` (the wrap), never materialize bytes over the selection.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { mountStandardViewEditor, requireStandardViewOptions } from "./settledGetUsj.test-helpers";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { $dfs } from "@lexical/utils";
import { act, render, waitFor } from "@testing-library/react";
import { $getRoot, $isTextNode, LexicalEditor } from "lexical";
import { createRef } from "react";
import { $isCharNode, $isMarkerNode, $isNoteNode, $isParaNode } from "shared";
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

/** Collapse the caret inside the fixture's "hello world" text node at `offset`. */
async function placeCaret(lexical: LexicalEditor, offset: number): Promise<void> {
  await act(async () =>
    lexical.update(() => {
      const text = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === "hello world");
      if (!$isTextNode(text)) throw new Error("fixture text node not found");
      text.select(offset, offset);
    }),
  );
}

describe("EditorRef.commitTypedMarker", () => {
  it('commits an inline marker as an open span (closed="false") — no closing marker', async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 5);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("nd");
    });

    expect(committed).toBe(true);
    lexical.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(1);
      expect(chars[0].getMarker()).toBe("nd");
      // Passive-Space semantics: NO closing marker — the span records closed="false" and
      // carries only the opening glyph.
      expect(chars[0].getUnknownAttributes()?.closed).toBe("false");
      expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(1);
      // The pre-existing content stays put; the literal trigger byte was consumed by the
      // settle, not left behind as plain text.
      expect(para.getTextContent()).toContain("hello");
    });
  });

  it("omits the terminating space when `trailingSpace: false` — the `\\` commit", async () => {
    // The palette's `\` commit ("commit what was typed, then open a new palette for the
    // backslash just pressed") needs the same materialization WITHOUT the separator byte: the
    // next session's own commit supplies the `\` that terminates this marker's name.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 11);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("nd", { trailingSpace: false });
    });

    expect(committed).toBe(true);
    const paraText = lexical
      .getEditorState()
      .read(() => $getRoot().getChildren().filter($isParaNode)[0].getTextContent());
    // The literal is the last thing in the paragraph — no separator space of its own.
    expect(paraText.endsWith("\\nd")).toBe(true);
  });

  it("`trailingSpace: false` settles to the SAME open span the spaced commit produces", async () => {
    // Measured equivalence, and the reason dropping the separator is safe: a marker-name scan
    // terminates at end-of-text just as it does at a space, so both byte shapes settle
    // identically. Anything else would make `\` and Space commit different documents.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 11);

    await act(async () => {
      ref.current?.commitTypedMarker("nd", { trailingSpace: false });
    });

    // No terminating separator means the settle runs on the engine's DEFERRED clock rather than
    // inside the commit update (invariant IV), so the end state is awaited.
    await waitFor(() =>
      lexical.getEditorState().read(() => {
        const chars = $getRoot()
          .getChildren()
          .filter($isParaNode)[0]
          .getChildren()
          .filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("nd");
        expect(chars[0].getUnknownAttributes()?.closed).toBe("false");
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(1);
      }),
    );
  });

  it("`f` materializes the full note — the tokenizer's emergent end state, byte-identical to passive", async () => {
    // The primitive's contract is BYTE-FIDELITY to passive typing, and mid-text that means the
    // tokenizer absorbs the word after the caret as the note's CALLER — the same end state
    // passive `\f ` typing produced, NOT the empty note an Enter commit inserts. A host whose
    // palette wants note markers to commit like Enter must route them through
    // `applyMarkerMenuSelection` (the item commit) instead of this method — exactly what the
    // app's Space handling does for note markers.
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 5);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("f");
    });

    expect(committed).toBe(true);
    lexical.getEditorState().read(() => {
      const notes = $dfs()
        .map(({ node }) => node)
        .filter($isNoteNode);
      expect(notes).toHaveLength(1);
      expect(notes[0].getMarker()).toBe("f");
    });
    const settled = JSON.stringify(ref.current?.getUsj());
    expect(settled).toContain(`"type":"note","marker":"f","caller":"world"`);
  });

  it("an unknown typed marker settles as typed", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 5);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("zz");
    });

    expect(committed).toBe(true);
    // Tier 2 settles the unknown literal AS TYPED — the marker byte sequence survives into the
    // settled state (as an unknown-marker structure, not silently dropped).
    const json = JSON.stringify(lexical.getEditorState().toJSON());
    expect(json).toContain(`"marker":"zz"`);
  });

  it("an empty typed query materializes just the trigger byte — byte-identical to passive", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    await placeCaret(lexical, 11);

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("");
    });

    expect(committed).toBe(true);
    lexical.getEditorState().read(() => {
      // An unterminated bare backslash plus space is not a marker; the literal stays, exactly
      // the bytes passive typing would have left.
      const hasLiteral = $getRoot()
        .getAllTextNodes()
        .some((node) => node.getTextContent().endsWith("world\\ "));
      expect(hasLiteral).toBe(true);
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
      committed = ref.current?.commitTypedMarker("nd");
    });

    expect(committed).toBe(false);
    expect(JSON.stringify(lexical.getEditorState().toJSON())).toBe(before);
  });

  it("returns false when there is no range selection", async () => {
    const { ref, lexical } = await mountStandardViewEditor(baseUsj);
    const before = JSON.stringify(lexical.getEditorState().toJSON());

    let committed: boolean | undefined;
    await act(async () => {
      committed = ref.current?.commitTypedMarker("nd");
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

    expect(() => ref.current?.commitTypedMarker("nd")).toThrow(/readonly/);
  });
});
