/**
 * Regression coverage for the no-flush fix: `OnSelectionChangePlugin`'s
 * `SELECTION_CHANGE_COMMAND` handler used to call `editor.read($getUsjSelectionFromEditor)`.
 * `LexicalEditor.read()` unconditionally calls `$commitPendingUpdates` — even when invoked from
 * inside an already-active (uncommitted) `editor.update()`. That force-flush is exactly the
 * enabler of the frozen-commit crash class fixed for `MarkerEditPlugin` in
 * `packages/platform/src/editor/markerEdit/markerEditComposed.test.tsx`: a
 * plugin that synchronously self-dispatches `SELECTION_CHANGE_COMMAND` from inside an in-flight
 * update hits `OnSelectionChangePlugin`'s handler, which force-commits (and, in dev builds,
 * freezes) the still-in-flight pending state mid-dispatch; any further mutation attempted by the
 * outer update after that point then writes into the now-frozen state and throws.
 *
 * That composed reproduction lives in `platform` (it needs `MarkerEditPlugin` to supply the
 * self-dispatch); this file reproduces the same mechanism directly against
 * `OnSelectionChangePlugin` alone, without a platform dependency, by performing the nested
 * `dispatchCommand(SELECTION_CHANGE_COMMAND, ...)` inline (mirroring the shape of the composed
 * test's "one update moves the caret AND dispatches SELECTION_CHANGE within it").
 */

import { OnSelectionChangePlugin } from "./OnSelectionChangePlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, SELECTION_CHANGE_COMMAND, TextNode } from "lexical";
import { $createParaNode } from "shared";

describe("OnSelectionChangePlugin (no-flush regression, frozen-commit crash class)", () => {
  it("does not throw and still reports the last COMMITTED selection when a nested SELECTION_CHANGE dispatch occurs mid-update", async () => {
    let textA: TextNode;
    let textB: TextNode;
    const onChange = vi.fn();

    const { editor } = await baseTestEnvironment(
      () => {
        textA = $createTextNode("Hello world");
        textB = $createTextNode("Second node");
        $getRoot().append($createParaNode().append(textA), $createParaNode().append(textB));
      },
      <OnSelectionChangePlugin onChange={onChange} />,
    );

    // Establish and fully commit an initial selection: caret at the start of textA. This is the
    // "last committed selection" the fixed handler must still report from mid-update below.
    await act(async () => editor.update(() => textA.select(0, 0)));
    onChange.mockClear();

    let thrown: unknown;
    await act(async () => {
      try {
        editor.update(() => {
          // Make the pending update dirty (an edit is in flight).
          textA.setTextContent("Hello world!!!");
          // Move the caret - NOT YET committed when the nested dispatch below runs.
          textB.select(3, 3);
          // Mirrors the browser's native selectionchange re-entering mid-update: a nested
          // SELECTION_CHANGE dispatch fires from inside this still-active editor.update().
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
          // Pre-fix, OnSelectionChangePlugin's handler force-committed (and dev-froze) the
          // in-flight state above via editor.read(); any further mutation attempted here then
          // throws against the frozen selection ("Cannot assign to read only property
          // '_cachedNodes'") - the exact failure mode this fix prevents.
          textB.setTextContent("Second node edited");
        });
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeUndefined();
    // Reported from inside the nested dispatch: the last COMMITTED selection (textA, offset 0),
    // not the not-yet-committed in-flight move to textB.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      start: { jsonPath: "$.content[0].content[0]", offset: 0 },
    });

    // The outer update itself still completes and commits normally.
    editor.getEditorState().read(() => {
      expect(textA.getTextContent()).toBe("Hello world!!!");
      expect(textB.getTextContent()).toBe("Second node edited");
    });
  });
});
