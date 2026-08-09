/**
 * The read-only settle: the USJ a Tier-2 settle WOULD produce, computed without touching the
 * editor. Each case drives a real pending edit through the mounted engine, reads the settled USJ,
 * and then asserts the editor itself is unchanged — the two halves of the contract.
 */
import { deserializeSerializedEditorState } from "../adaptors/editor-usj.adaptor";
import { testEnvironment, testEnvironmentExpanded, viewOptions } from "./markerEdit.test-helpers";
import { $settledUsj } from "./virtualSettle.utils";
import { Tier2Context } from "./tier2Rebuild.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, LexicalEditor } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createUnknownNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  getEditableCallerText,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
  textTypeState,
} from "shared";

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Read the settled USJ exactly as `Editor.tsx`'s `getUsj()` does. */
function settledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  const serializedState = editorState.toJSON();
  const pendedKeys = getPendedDisplayOwners(editor) ?? new Set<string>();
  return editorState.read(() => $settledUsj(serializedState, pendedKeys, context));
}

/**
 * The UNSETTLED USJ: a plain editor->USJ conversion of the editor's current serialized state,
 * with no settle logic involved at all — what the caller already has cached before ever calling
 * `$settledUsj` (see its `undefined` fast-path return). The reference a refusing scope's settled
 * output must match byte-for-byte, since a refusal contributes "as-is", never a partial patch.
 */
function unsettledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  return editorState.read(() =>
    deserializeSerializedEditorState(editorState.toJSON(), viewOptions),
  );
}

/** The `marker` of the USJ content entry at `index`, or undefined when it is not a marker object. */
function markerAt(usj: Usj | undefined, index: number): string | undefined {
  const entry = usj?.content[index];
  if (!entry || typeof entry === "string") return undefined;
  return (entry as MarkerObject).marker;
}

describe("$settledUsj — paragraph scopes", () => {
  it("returns undefined when nothing is pending, so the caller keeps its cached USJ", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });
    expect(settledUsjOf(editor)).toBeUndefined();
  });

  it("settles an abandoned in-place marker rename in the OUTPUT without mutating the editor", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });

    // Rename the `\p` glyph to `\q1` in place and leave it pending (no caret departure).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    expect(markerAt(settledUsjOf(editor), 0)).toBe("q1");

    // The editor is untouched: the paragraph is still `\p` with the pending literal on screen.
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      expect(para.getMarker()).toBe("p");
      expect(para.getTextContent()).toContain("\\q1");
    });
  });

  it("keeps a preserved node's own USJ in place where its U+FFFC placeholder stood", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}before `),
        $createUnknownNode("optbreak", "optbreak"),
        $createTextNode(" after"),
      );
      $getRoot().append(para);
    });

    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    expect(markerAt(settled, 0)).toBe("q1");
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const optbreakIndex = (para as MarkerObject).content?.findIndex(
      (entry) => typeof entry !== "string" && entry.type === "optbreak",
    );
    // The sentinel serialized IN PLACE: between the two text runs, not moved to an end.
    expect(optbreakIndex).toBe(1);
  });

  it("refuses a guard-railed scope AS-IS while an unrelated pended scope still settles (per-scope refusal, not whole-document)", async () => {
    const { editor } = await testEnvironment(() => {
      const refusingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}refuses`),
      );
      // `$buildParaFragment`'s guard rail refuses any paragraph carrying unknownAttributes,
      // regardless of what is pending inside it — set directly on the live node, since
      // unrecognized USFM attributes have no display representation of their own to type.
      refusingPara.setUnknownAttributes({ custom: "x" });
      const settlingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}settles`),
      );
      $getRoot().append(refusingPara, settlingPara);
    });

    // Rename BOTH paragraphs' glyphs in place and leave both pending — so both scopes land in
    // the engine's live pended-owner set, proving the refusal below is a per-scope decision made
    // inside `$settledParaNodes`, not a short-circuit that abandons the whole document.
    await act(async () => {
      editor.update(() => {
        const [firstPara, secondPara] = $getRoot().getChildren().filter($isParaNode);
        const firstGlyph = firstPara?.getFirstChild();
        const secondGlyph = secondPara?.getFirstChild();
        if (!$isMarkerNode(firstGlyph) || !$isMarkerNode(secondGlyph))
          throw new Error("expected MarkerNode prefix glyphs on both paragraphs");
        firstGlyph.setTextContent("\\q1");
        secondGlyph.setTextContent("\\q2");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The unrelated scope genuinely re-tokenized.
    expect(markerAt(settled, 1)).toBe("q2");
    // The refusing scope did NOT re-tokenize: still `\p`, not `\q1`.
    expect(markerAt(settled, 0)).toBe("p");

    // Byte-identical to the unsettled serialization for the refusing paragraph specifically —
    // the "refusal contributes the UNSETTLED serialization, never an error, never a partial
    // patch" invariant, verified structurally rather than just by the marker check above.
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });
});

describe("$settledUsj — expanded note scopes", () => {
  it("settles a typed marker literal inside expanded note content", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      // The caller must be the exact bytes `$buildNoteFragment` expects
      // (`getEditableCallerText`, not the bare caller symbol) or its caller-slot check refuses the
      // whole note. It also needs a NodeState distinct from the plain body TextNode that follows —
      // otherwise Lexical's own adjacent-simple-TextNode merge (unrelated to this engine) coalesces
      // the two into one node on mount, and the merged text no longer matches the caller check
      // either. `"note-caller-boundary"` carries no meaning to any transform (unlike the recognized
      // `"attribute"`/`"marker-trailing-space"` tags), so it blocks the merge without side effects.
      const callerNode = $createTextNode(getEditableCallerText("+"));
      $setState(callerNode, textTypeState, "note-caller-boundary");
      note.append(
        $createMarkerNode("f"),
        callerNode,
        $createTextNode("note body"),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });

    // Type a complete char-span literal into the note content and leave it pending. A caret
    // anchored right after the just-typed "\nd" (before its terminating space) is required: with no
    // caret in the node, the engine's own termination check tests the WHOLE text, and a complete
    // `\nd body\nd*` span always matches it somewhere — settling for real instead of staying
    // pending, defeating the point of this test.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const body = note
          .getChildren()
          .find(
            (child) =>
              $isTextNode(child) && !$isMarkerNode(child) && child.getTextContent() === "note body",
          );
        if (!body || !$isTextNode(body)) throw new Error("expected note body text");
        body.setTextContent("note \\nd body\\nd*");
        body.select(8, 8);
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The literal became a real char span in the OUTPUT; the note node, marker and caller survive.
    expect((note as MarkerObject).marker).toBe("f");
    expect((note as MarkerObject).caller).toBe("+");
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "nd",
      ),
    ).toBe(true);

    // The editor still holds the literal.
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\nd body\\nd*");
    });
  });

  it("refuses a collapsed note AS-IS while an unrelated pended scope still settles (per-scope refusal, not whole-document)", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      // `$createNoteNode`'s default `isCollapsed` is `true` — a collapsed note is exactly the
      // shape `$buildNoteFragment` refuses ("only inline-expanded notes are re-tokenizable"),
      // so `setIsCollapsed(false)` is deliberately NOT called here.
      const note = $createNoteNode("f", "+");
      const callerNode = $createTextNode(getEditableCallerText("+"));
      // An implicitly-closed char span (no closing MarkerNode child, matching the
      // `closed="false"` footnote-content convention elsewhere in this test suite) — its own
      // opening glyph gets renamed below, mirroring the settling note test, except this time the
      // enclosing note stays collapsed, so the rename must never reach the tokenizer.
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append($createMarkerNode("f"), callerNode, boldChar, $createMarkerNode("f", "closing"));
      const refusingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        note,
      );
      const settlingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}settles`),
      );
      $getRoot().append(refusingPara, settlingPara);
    });

    // Rename the char span's opening glyph inside the collapsed note, and the unrelated
    // paragraph's own opening glyph, in the SAME update — both bare (no trailing space), which
    // Tier 1 unconditionally pends without ever needing a live caret/selection. Both scopes land
    // in the engine's live pended-owner set, proving the refusal below is a per-scope decision
    // made inside `$settledNoteContent`, not a short-circuit that abandons the whole document.
    await act(async () => {
      editor.update(() => {
        const [refusingPara, settlingPara] = $getRoot().getChildren().filter($isParaNode);
        const note = refusingPara?.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        boldGlyph.setTextContent("\\it");

        const settlingGlyph = settlingPara?.getFirstChild();
        if (!$isMarkerNode(settlingGlyph)) throw new Error("expected settlingPara's prefix glyph");
        settlingGlyph.setTextContent("\\q2");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The unrelated scope genuinely re-tokenized.
    expect(markerAt(settled, 1)).toBe("q2");

    // The collapsed note's paragraph did NOT re-tokenize: byte-identical to the unsettled
    // serialization — the "refusal contributes the UNSETTLED serialization, never an error,
    // never a partial patch" invariant, mirroring the paragraph-scope refusal test above.
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });

  it("settles an independently pending paragraph edit and an independently pending note edit in one call, with the note's already-settled content riding through the paragraph's settled result", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      const callerNode = $createTextNode(getEditableCallerText("+"));
      // Implicitly closed (no closing MarkerNode child), same shape as the refusal test above —
      // sidesteps any question of a mismatched opener/closer pair while the rename below is
      // still pending (the closer, if there were one, would not get renamed until the pend
      // actually resolves).
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append($createMarkerNode("f"), callerNode, boldChar, $createMarkerNode("f", "closing"));
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), note),
      );
    });

    // Two INDEPENDENT bare (no trailing space) marker renames in the SAME update: the
    // paragraph's own opening glyph, and the opening glyph of a char span living inside the
    // paragraph's expanded note. Neither needs a live caret — both are Tier 1's unconditional
    // "bare opener rename, stays pending until Enter/blur/departure" shape — so neither risks the
    // caret-departure listener's queued resolve pass settling the OTHER one for real before this
    // test ever reads `$settledUsj` (a live caret anchored on just one of them would leave the
    // other exposed to that departure sweep).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const paraGlyph = para.getFirstChild();
        if (!$isMarkerNode(paraGlyph)) throw new Error("expected a ParaNode prefix glyph");
        paraGlyph.setTextContent("\\q1");

        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        boldGlyph.setTextContent("\\it");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The paragraph genuinely re-tokenized.
    expect(markerAt(settled, 0)).toBe("q1");

    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The note's content ALSO genuinely re-tokenized, and rides through INSIDE the paragraph's
    // own settled result — the mechanism the notes-first ordering in `$settledUsj` exists for:
    // by the time the paragraph pass substitutes the note's serialized subtree in place of its
    // sentinel placeholder, the notes pass has already rewritten that subtree to this settled
    // shape.
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "it",
      ),
    ).toBe(true);

    // Both edits are unmutated in the live editor.
    editor.getEditorState().read(() => {
      const livePara = $getRoot().getChildren().find($isParaNode);
      if (!livePara) throw new Error("expected a ParaNode");
      expect(livePara.getMarker()).toBe("p");
      const liveNote = livePara.getChildren().find($isNoteNode);
      if (!liveNote) throw new Error("expected a NoteNode");
      const liveChar = liveNote.getChildren().find($isCharNode);
      if (!liveChar) throw new Error("expected a char span inside the note");
      expect(liveChar.getMarker()).toBe("bd");
    });
  });
});
