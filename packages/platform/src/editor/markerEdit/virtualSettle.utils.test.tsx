/**
 * The read-only settle: the USJ a Tier-2 settle WOULD produce, computed without touching the
 * editor. Each case drives a real pending edit through the mounted engine, reads the settled USJ,
 * and then asserts the editor itself is unchanged — the two halves of the contract.
 */
import { testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { $settledUsj } from "./virtualSettle.utils";
import { Tier2Context } from "./tier2Rebuild.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createUnknownNode,
  $isMarkerNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
} from "shared";

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Read the settled USJ exactly as `Editor.tsx`'s `getUsj()` does. */
function settledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  const serializedState = editorState.toJSON();
  const pendedKeys = getPendedDisplayOwners(editor) ?? new Set<string>();
  return editorState.read(() => $settledUsj(serializedState, pendedKeys, context));
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
});
