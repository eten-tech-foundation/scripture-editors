/**
 * Closer-glyph resolution timing: editing a closing glyph pends — like an opening-glyph edit —
 * and settles through Tier 2 only when the caret departs (or Enter/blur completes it). The old
 * behavior resolved the moment the edited text ended with `*`, which is every mid-glyph edit of
 * a closer (the trailing `*` is still there), so the span went unmatched under the user's caret
 * on the first keystroke and could not be edited further.
 */

import { $appendCharPara, requireDefined } from "./markerEdit.test-helpers";
import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $getSelection, $isRangeSelection, $isTextNode, TextNode } from "lexical";
import { $isMarkerNode } from "shared";

function $caret(): { key: string; offset: number } {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
  return { key: selection.anchor.key, offset: selection.anchor.offset };
}

describe("closer-glyph edits pend and settle on caret departure", () => {
  it("keeps a retyped closer pending with the caret where the user put it", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        parts.closer.setTextContent("\\wj*");
        parts.closer.select(3, 3); // caret after the just-typed "j"
      }),
    );
    editor.getEditorState().read(() => {
      // No rebuild: the span and its edited closer are intact, still mid-edit.
      expect(parts.char.isAttached()).toBe(true);
      expect(parts.closer.getTextContent()).toBe("\\wj*");
      expect($caret()).toEqual({ key: parts.closer.getKey(), offset: 3 });
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('"type":"unmatched"');
  });

  it("stays editable across several keystrokes", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        parts.closer.setTextContent("\\w*");
        parts.closer.select(2, 2);
      }),
    );
    await act(async () =>
      editor.update(() => {
        parts.closer.setTextContent("\\wj*");
        parts.closer.select(3, 3);
      }),
    );
    editor.getEditorState().read(() => {
      expect(parts.closer.isAttached()).toBe(true);
      expect(parts.closer.getTextContent()).toBe("\\wj*");
    });
  });

  it("settles through Tier 2 when the caret departs the glyph", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        parts.closer.setTextContent("\\wj*");
        parts.closer.select(3, 3);
      }),
    );
    // Caret departs into the span's content text (not a glyph — MarkerNode extends TextNode):
    // the pended closer settles.
    await act(async () =>
      editor.update(() => {
        const content = requireDefined(
          parts.char.getChildren().find((n): n is TextNode => $isTextNode(n) && !$isMarkerNode(n)),
          "span content text missing",
        );
        content.select(1, 1);
      }),
    );
    // Tokenizer sees `\nd ␣Lord\wj*`: the span auto-closes (closed="false") and the unmatched
    // `\wj*` resolves per PT9 sink.Unmatched.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).toContain('"type":"unmatched"');
    expect(json).toContain('"marker":"wj*"');
  });
});
