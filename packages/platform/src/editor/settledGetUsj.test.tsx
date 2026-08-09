/**
 * `getUsj()` is settled, uniformly and without side effects. Uniform means there is no caret-held
 * exception: a half-typed attribute run settles to the literal content those bytes mean, even while
 * the caret sits inside it. Without side effects means the editor still shows the pending edit
 * afterwards — reading the document must never settle it under the user.
 */
import { mountStandardViewEditor, spanUsj } from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $getState, $isTextNode, TextNode } from "lexical";
import { $isCharNode, $isMarkerNode, $isParaNode, CharNode, textTypeState } from "shared";

/** The `\nd` span's USJ entry in a doc shaped like `spanUsj`, or undefined when it is gone. */
function ndSpanOf(usj: Usj | undefined): MarkerObject | undefined {
  const para = usj?.content[2];
  if (!para || typeof para === "string") return undefined;
  const span = (para as MarkerObject).content?.find(
    (entry) => typeof entry !== "string" && entry.type === "char",
  );
  return span && typeof span !== "string" ? span : undefined;
}

/** The `\nd` span's own CONTENT text node — NOT its opening/closing glyphs, which are `MarkerNode`
 * (a `TextNode` subclass) and would otherwise be the first match `getAllTextNodes()` yields, since
 * they precede the content node in tree order. */
function $findSpanContentText(): TextNode {
  const node = $getRoot()
    .getAllTextNodes()
    .find(
      (candidate) =>
        $isTextNode(candidate) && !$isMarkerNode(candidate) && $isCharNode(candidate.getParent()),
    );
  if (!node || !$isTextNode(node)) throw new Error("span content text not found");
  return node;
}

/** The `\nd` span itself, found via its own content text node's parent. */
function $findNdChar(): CharNode {
  const parent = $findSpanContentText().getParent();
  if (!parent || !$isCharNode(parent)) throw new Error("nd char span not found");
  return parent;
}

/** `char`'s own attribute display run — the TextNode tagged textType "attribute" that
 * `$syncCharAttributeDisplay` (attributeDisplay.utils.ts) builds automatically once the span
 * carries real `unknownAttributes` and has a closing glyph. */
function $findAttributeRun(char: CharNode): TextNode {
  const run = char
    .getChildren()
    .find(
      (child): child is TextNode =>
        $isTextNode(child) && $getState(child, textTypeState) === "attribute",
    );
  if (!run) throw new Error("attribute run not found");
  return run;
}

/** The `\p`/renamed paragraph's own `marker` field, read live from the tree — independent of
 * `getUsj()` (the thing under test) and of the DISPLAYED bytes, which stay identical whether the
 * rename is pending or already committed (a pending literal renders the exact bytes a settle would
 * produce); only this structural field actually moves. */
function $livePara1Marker(): string {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("expected a ParaNode");
  return para.getMarker();
}

describe("settled getUsj — uniform settling", () => {
  it("settles a half-typed attribute run to literal content while the caret is still inside it", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    // Give the `\nd` span a real attribute first, so its canonical `|mykey="myval"` display run
    // exists (built automatically by the char-attribute sync). Plain content with no display run
    // at all round-trips identically whether or not the paragraph is re-tokenized — it cannot tell
    // settled output apart from the cached one — so an attribute RUN is the shape this pin needs.
    await act(async () => {
      lexical.update(() => {
        $findNdChar().setUnknownAttributes({ mykey: "myval" });
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Half-type over the attribute run: replace its canonical bytes with an incomplete `|stuf`,
    // and leave the caret inside it — the exact caret shape the MUTATING sync's mid-edit grace
    // (`$isCaretAtAttributeRunBoundary`, attributeDisplay.utils.ts) would recognize and leave
    // alone. The read-only settle grants no such grace.
    await act(async () => {
      lexical.update(() => {
        const run = $findAttributeRun($findNdChar());
        run.setTextContent("|stuf");
        run.select(5, 5);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Settled: `nd` has no default attribute, so PT9 cannot promote the incomplete run to a real
    // attribute — the bytes degrade to literal CONTENT, and the STALE `mykey` attribute the run
    // used to represent is gone along with it (those bytes now mean something else entirely).
    const span = ndSpanOf(ref.current?.getUsj());
    expect(span?.content?.[0]).toContain("|stuf");
    expect(Object.keys(span ?? {}).sort()).toEqual(["content", "marker", "type"]);

    // Still pending on screen: the editor holds the typed bytes and the stale attribute, untouched.
    lexical.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("|stuf");
      expect($findNdChar().getUnknownAttributes()).toEqual({ mykey: "myval" });
    });
  });

  it("leaves the document pending after a read, so a later commit still has work to do", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    await act(async () => {
      lexical.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!glyph || !$isTextNode(glyph)) throw new Error("expected a prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    const before = ref.current?.getUsj();
    const beforeMarker = lexical.getEditorState().read($livePara1Marker);
    // Still pending: the internal marker field hasn't moved, even though the DISPLAYED bytes
    // already read "\q1" (that display IS the pending literal).
    expect(beforeMarker).toBe("p");
    // Reading twice must be idempotent AND side-effect free.
    expect(ref.current?.getUsj()).toEqual(before);
    expect(lexical.getEditorState().read($livePara1Marker)).toBe(beforeMarker);

    act(() => ref.current?.commitPendingMarkerEdits());
    // The commit is what actually changes the DOCUMENT: the marker field moves for real.
    expect(lexical.getEditorState().read($livePara1Marker)).not.toBe(beforeMarker);
  });
});
