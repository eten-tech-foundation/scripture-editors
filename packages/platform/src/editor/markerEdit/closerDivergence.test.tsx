/**
 * Editor/file agreement after closer edits — the three reported divergences, each of which left
 * the screen and the file disagreeing. The oracle is the fragment tokenizer: it deliberately
 * models ParatextData's parse, so "the file agrees" is asserted by comparing the settled editor
 * USJ against `usfmFragmentToUsjContent` run over the SAME displayed bytes. Equality means
 * ParatextData will read the saved file exactly as the editor shows it.
 */

import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { deserializeSerializedEditorState } from "../adaptors/editor-usj.adaptor";
import {
  $appendCharPara,
  $retypeGlyph,
  requireDefined,
  testEnvironment,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, TextNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isMarkerNode,
  NBSP,
  textTypeState,
  usfmFragmentToUsjContent,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

/** The settled editor USJ content, for comparing against the tokenizer's own reading. */
function editorUsjContent(editor: import("lexical").LexicalEditor) {
  initializeDeserialize(undefined);
  const usj = deserializeSerializedEditorState(
    editor.getEditorState().toJSON(),
    getViewOptions(STANDARD_VIEW_MODE),
  );
  return requireDefined(usj, "editor USJ missing").content;
}

describe("closer edits leave the editor and the file agreeing", () => {
  it("editing the closer of a span WITH attributes demotes them to bytes on both sides", async () => {
    const { editor } = await testEnvironment(() => {
      const char = $createCharNode("w");
      char.setUnknownAttributes({ lemma: "faith" });
      const attrRun = $createTextNode("|faith");
      $setState(attrRun, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("w"),
            $createTextNode(`${NBSP}faith`),
            attrRun,
            $createMarkerNode("w", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const closer = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .findLast((n) => n.getTextContent() === "\\w*"),
          "closer missing",
        );
        closer.setTextContent("\\wj*");
        closer.select(3, 3);
      }),
    );
    await act(async () => editor.update(() => $getRoot().getChildren()[0].selectStart()));
    // The mismatched closer unmatches; the span auto-closes; its former attribute run is now
    // literal content bytes on screen AND in the file — the tokenizer only extracts attributes
    // at an explicit matching closer.
    expect(editorUsjContent(editor)).toEqual(usfmFragmentToUsjContent("\\p \\w faith|faith\\wj*"));
  });

  it("typing a new closer before an edited one keeps both on screen and in the file", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    // Damage the closer (pends), then supply a fresh `\nd*` as typed content before it.
    await act(async () => editor.update(() => $retypeGlyph(parts.closer, "\\ndx*")));
    await act(async () =>
      editor.update(() => {
        // The span's CONTENT text — not its glyphs, which are MarkerNodes (TextNode subclasses).
        const content = requireDefined(
          parts.char.getChildren().find((n): n is TextNode => $isTextNode(n) && !$isMarkerNode(n)),
          "span content missing",
        );
        content.setTextContent(`${NBSP}Lord\\nd*`);
        content.select(content.getTextContentSize(), content.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => $getRoot().getChildren()[0].selectStart()));
    // The typed closer matches the span; the edited old closer resolves unmatched — visible in
    // the editor and present in the file alike.
    expect(editorUsjContent(editor)).toEqual(usfmFragmentToUsjContent("\\p \\nd Lord\\nd*\\ndx*"));
  });

  it("deleting a closer with trailing content moves that content into the now-open span", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
      parts.char.insertAfter($createTextNode(" after"));
    });
    await act(async () =>
      editor.update(() => {
        parts.closer.remove();
      }),
    );
    await act(async () => editor.update(() => $getRoot().getChildren()[0].selectStart()));
    // Nothing closes the span any more, so the tokenizer extends it to the paragraph end — the
    // editor must show the same structure the file round-trip produces.
    expect(editorUsjContent(editor)).toEqual(usfmFragmentToUsjContent("\\p \\nd Lord after"));
  });
});
