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
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createUnknownNode,
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
});
