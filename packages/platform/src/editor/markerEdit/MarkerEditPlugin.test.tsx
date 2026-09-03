import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { requireDefined } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, KEY_DOWN_COMMAND, TextNode } from "lexical";
import { $createCharNode, $createParaNode, $isCharNode, $isParaNode, NBSP } from "shared";
import { FORMATTED_VIEW_MODE, getViewOptions } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

/**
 * Mounts `MarkerEditPlugin` in FORMATTED view (`markerMode: "hidden"`) — a non-editable marker
 * mode, so the whole engine must stay unregistered. The serialize adaptor is initialized exactly
 * as the editable `testEnvironment` does: were the markerMode gate to break, the Tier-2 rebuild
 * machinery would then actually run and the assertions below would see its tokenization.
 */
async function nonEditableTestEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin
      viewOptions={requireDefined(
        getViewOptions(FORMATTED_VIEW_MODE),
        "Formatted view options are required for these tests.",
      )}
    />,
  );
}

describe("MarkerEditPlugin gating (non-editable marker mode)", () => {
  it("leaves a terminated typed char marker as literal text — no tokenization", async () => {
    // The editable-mode control is "re-tokenizes a terminated typed char marker"
    // (markerEditTier2Trigger.utils.test.tsx): the same edit there produces a `\nd` CharNode.
    // Here the engine must be inert, so if this test sees a CharNode (or loses the literal),
    // the markerMode gate has broken and hidden-marker views would start restructuring text.
    let text: TextNode;
    const { editor } = await nonEditableTestEnvironment(() => {
      text = $createTextNode("hello world");
      $getRoot().append($createParaNode("p").append(text));
    });
    await act(async () => editor.update(() => text.setTextContent("hello \\nd Lord\\nd* world")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain("\\\\nd ");
    expect(json).not.toContain('"marker":"nd"');
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("hello \\nd Lord\\nd* world");
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((p) => p.getChildren())
        .filter($isCharNode);
      expect(chars).toHaveLength(0);
    });
  });

  it("does not claim Ctrl+Space — no span split, document unchanged", async () => {
    // In editable mode this keystroke splits the span at the caret and inserts a plain space
    // (charFormatting.utils.test.tsx). With markerMode "hidden" the KEY_DOWN handler is never
    // registered, so the dispatch must fall through unhandled and mutate nothing.
    let content: TextNode;
    const { editor } = await nonEditableTestEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}Lord`);
      $getRoot().append(para.append(char.append(content)));
    });
    const stateBefore = JSON.stringify(editor.getEditorState().toJSON());
    await act(async () => editor.update(() => content.select(3, 3)));
    // The dispatch return value is not asserted: Lexical CORE routes every KEY_DOWN at EDITOR
    // priority regardless of this plugin, so "handled" is true either way. Inertness shows in
    // the document: byte-identical state, where the editable engine would have split the span.
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(stateBefore);
  });
});
