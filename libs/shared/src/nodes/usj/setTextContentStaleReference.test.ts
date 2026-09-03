import { createBasicTestEnvironment } from "./test.utils.js";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";

/**
 * Capture pins of Lexical's `TextNode` reference semantics — dependency behavior, not this
 * codebase's. `TextNode.setTextContent` short-circuits by comparing the new text against the
 * CAPTURED instance's own `__text` (not the latest version's), so a reference held across a
 * cloning text mutation of the same node can silently no-op exactly when the written value equals
 * the pre-clone text. The shed in `$removeCharFormattingFromSelection` (platform,
 * `charFormatting.utils.ts`) hit this live and writes through `getLatest()` for that reason.
 *
 * The repo-wide audit of `setTextContent` call sites rests on the three facts pinned here. If a
 * Lexical upgrade turns any of these red, re-run that audit — every "safe" verdict derives from
 * them.
 */

function $textNodeByKey(key: string): TextNode {
  const node = $getNodeByKey(key);
  if (!$isTextNode(node)) throw new Error(`expected a TextNode for key ${key}`);
  return node;
}

describe("Lexical TextNode reference semantics (capture pins)", () => {
  it("setTextContent silently no-ops on a stale reference when the new text equals the pre-clone text; getLatest() defeats it", () => {
    const { editor } = createBasicTestEnvironment();
    let key = "";
    editor.update(
      () => {
        const node = $createTextNode("one");
        $getRoot().append($createParagraphNode().append(node));
        key = node.getKey();
      },
      { discrete: true },
    );

    // The hazard: hold the committed instance, text-mutate the node through a different
    // (writable) reference, then write the held instance's own old text back.
    editor.update(
      () => {
        const held = $textNodeByKey(key);
        held.getWritable().setTextContent("prefix one");
        expect(held.getLatest()).not.toBe(held); // the mutation cloned; `held` is now stale
        held.setTextContent("one"); // equals the STALE instance's text — short-circuits
      },
      { discrete: true },
    );
    expect(editor.getEditorState().read(() => $textNodeByKey(key).getTextContent())).toBe(
      "prefix one", // the write never landed
    );

    // The fix shape: the same write through getLatest() lands.
    editor.update(
      () => {
        const held = $textNodeByKey(key);
        held.getWritable().setTextContent("prefix prefix one");
        held.getLatest().setTextContent("prefix one");
      },
      { discrete: true },
    );
    expect(editor.getEditorState().read(() => $textNodeByKey(key).getTextContent())).toBe(
      "prefix one",
    );
  });

  it("a reference cloned under you by STRUCTURAL surgery still compares text correctly (clones copy __text)", () => {
    const { editor } = createBasicTestEnvironment();
    let key = "";
    editor.update(
      () => {
        const node = $createTextNode("one");
        $getRoot().append($createParagraphNode().append(node));
        key = node.getKey();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const held = $textNodeByKey(key);
        // Appending a sibling rewrites `held`'s linked-list pointers, cloning it — identity goes
        // stale, but the clone copies `__text`, so the short-circuit still compares correctly.
        const parent = held.getParent();
        if (!$isParagraphNode(parent)) throw new Error("expected the paragraph parent");
        const sibling = $createTextNode("q");
        sibling.toggleFormat("bold"); // unmergeable with `held`, so normalization keeps both
        parent.append(sibling);
        expect(held.getLatest()).not.toBe(held); // the structural clone happened
        held.setTextContent("two"); // differs from the (unchanged) text — must land
      },
      { discrete: true },
    );
    expect(editor.getEditorState().read(() => $textNodeByKey(key).getTextContent())).toBe("two");
  });

  it("a registered transform receives the LIVE instance and its enforcement write lands, even when normalization forward-merges first", () => {
    const { editor } = createBasicTestEnvironment();
    let targetKey = "";
    let siblingKey = "";
    const observations: { text: string; receiverWasLive: boolean }[] = [];
    const unregister = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getKey() !== targetKey) return;
      observations.push({
        text: node.getTextContent(),
        receiverWasLive: node.getLatest() === node,
      });
      if (node.getTextContent() !== "A") node.setTextContent("A");
    });

    editor.update(
      () => {
        const target = $createTextNode("A");
        const sibling = $createTextNode("q");
        sibling.toggleFormat("bold"); // keeps the initial pair unmerged
        $getRoot().append($createParagraphNode().append(target, sibling));
        targetKey = target.getKey();
        siblingKey = sibling.getKey();
      },
      { discrete: true },
    );
    observations.length = 0;

    // Dirty the target via sibling surgery, then append a mergeable stray: at transform time,
    // $normalizeTextNode forward-merges the stray INTO the target before the transform runs.
    editor.update(
      () => {
        $getNodeByKey(siblingKey)?.remove();
        const parent = $getRoot().getFirstChild();
        if (!$isParagraphNode(parent)) throw new Error("expected the paragraph");
        parent.append($createTextNode("B"));
      },
      { discrete: true },
    );

    // The merge happened before the transform saw the node…
    expect(observations.some(({ text }) => text === "AB")).toBe(true);
    // …the receiver was the live instance every time (dirtying routes clone the node first)…
    expect(observations.every(({ receiverWasLive }) => receiverWasLive)).toBe(true);
    // …and the enforcement write landed in the committed state.
    expect(editor.getEditorState().read(() => $textNodeByKey(targetKey).getTextContent())).toBe(
      "A",
    );
    unregister();
  });
});
