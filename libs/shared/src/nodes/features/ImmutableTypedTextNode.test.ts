/**
 * The node-level half of the optbreak-glyph-vanish regression (live QA 2026-08-12; the
 * user-visible gesture is pinned in `packages/platform`'s optbreakGlyphRerender.test.tsx).
 *
 * `ImmutableTypedTextNode` renders every read-only USFM glyph run — a book id, an `UnknownNode`'s
 * display bytes, an `\optbreak`'s `//` token. It used to paint those bytes through the DECORATOR
 * portal (`decorate()` returned its text, and `@lexical/react`'s `useDecorators` portalled the
 * string into this node's element). That is unsound for a payload with stable identity: Lexical's
 * `reconcileDecorator` bails on `currentDecorators[key] === decorator`, so re-creating the node's
 * ELEMENT while the node itself survives — which is precisely what re-parenting does — notified
 * nobody, and the portal kept painting into the old, detached element while the live one stayed
 * empty.
 *
 * So the contract these pin is: the bytes live on the element `createDOM` builds. The re-parent
 * test is the one that was RED — it reproduces, at node level, what a Tier-2 paragraph rebuild does
 * to a preserved node (`$replaceSentinels`, tier2Rebuild.utils.ts) — and it is deliberately written
 * against `getElementByKey`, the live element, rather than against `decorate()`'s return value, so
 * it keeps holding for any future rendering strategy that puts the bytes on screen.
 */

import {
  $createImmutableTypedTextNode,
  $isImmutableTypedTextNode,
} from "./ImmutableTypedTextNode.js";
import { $createParaNode } from "../usj/ParaNode.js";
import { createBasicTestEnvironment } from "../usj/test.utils.js";
import { $getNodeByKey, $getRoot, $isElementNode } from "lexical";
import { describe, expect, it } from "vitest";

describe("ImmutableTypedTextNode rendering", () => {
  it("renders its bytes into its own element", () => {
    let key = "";
    const { editor } = createBasicTestEnvironment(undefined, () => {
      const glyph = $createImmutableTypedTextNode("marker", "//");
      key = glyph.getKey();
      $getRoot().append($createParaNode("p").append(glyph));
    });

    expect(editor.getElementByKey(key)?.textContent).toBe("//");
  });

  it("keeps its bytes rendered after being MOVED to another parent (the Tier-2 rebuild shape)", () => {
    let key = "";
    let destinationKey = "";
    const { editor } = createBasicTestEnvironment(undefined, () => {
      const glyph = $createImmutableTypedTextNode("marker", "//");
      key = glyph.getKey();
      const destination = $createParaNode("p"); // stands in for a freshly rebuilt paragraph
      destinationKey = destination.getKey();
      $getRoot().append($createParaNode("p").append(glyph), destination);
    });
    const firstElement = editor.getElementByKey(key);
    expect(firstElement?.textContent).toBe("//");

    editor.update(
      () => {
        const glyph = $getNodeByKey(key);
        const destination = $getNodeByKey(destinationKey);
        if (!glyph || !$isElementNode(destination))
          throw new Error("expected the glyph and its destination");
        // Same node, same key, new parent — Lexical builds it a NEW element here.
        destination.append(glyph);
      },
      { discrete: true },
    );

    const movedElement = editor.getElementByKey(key);
    expect(movedElement).not.toBe(firstElement); // the element really was re-created
    expect(movedElement?.textContent).toBe("//");
  });

  it("re-renders its bytes when the text is set in place", () => {
    let key = "";
    const { editor } = createBasicTestEnvironment(undefined, () => {
      const glyph = $createImmutableTypedTextNode("marker", "\\nd");
      key = glyph.getKey();
      $getRoot().append($createParaNode("p").append(glyph));
    });

    editor.update(
      () => {
        const glyph = $getNodeByKey(key);
        if (!$isImmutableTypedTextNode(glyph)) throw new Error("expected the glyph");
        // `updateFromJSON`'s path — the only way this node's text ever changes in place.
        glyph.setTextContent("\\wj");
      },
      { discrete: true },
    );

    expect(editor.getElementByKey(key)?.textContent).toBe("\\wj");
  });
});
