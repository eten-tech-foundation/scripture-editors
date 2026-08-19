/**
 * The rendering half of the corpus nets.
 *
 * Every other corpus suite asserts on DATA — the serialized USJ, the tokenized bytes, the USX
 * round trip. All of them stayed green through the one rendering defect this codebase has actually
 * seen reported from live QA: after a Tier-2 rebuild re-parented a preserved node, its decorator's
 * React portal stayed pointed at the old detached element and the new one was left permanently
 * empty. The node was intact, `getUsj()` was intact, the file was intact, and the glyph was gone
 * from the screen. `glyphDecoratorRerender.test.tsx` pins that mechanism on three hand-built
 * shapes; this generalizes the same property over every corpus fixture.
 *
 * The property: a node that REPORTS text content must RENDER that text. It is stated over
 * `TextNode` and `DecoratorNode` rather than over a list of node classes, so a new glyph kind is
 * covered the day it is added — and a node whose visible form is CSS-generated (a collapsed note's
 * caller, the gutter view's chapter and verse numbers) reports no text content and is therefore
 * out of scope by construction, not by exemption.
 *
 * What this deliberately does NOT check, because jsdom cannot: anything the stylesheet paints. No
 * stylesheet is loaded in any test here, and the visible output of several view modes is
 * `content: attr(...)` pseudo-elements over `font-size: 0` text. A jsdom assertion there would pass
 * on markup the user cannot see and fail on markup they can. The honest home for that is a browser
 * or visual-regression harness, which this repo does not have.
 */

import { $dfs } from "@lexical/utils";
import { $getRoot, $isDecoratorNode, $isTextNode, LexicalEditor } from "lexical";
import { expect } from "vitest";

/**
 * Assert every text-bearing node in `editor` rendered its text into its own DOM element.
 *
 * `when` names the moment being checked (e.g. `"after load"`), so a failure says which of the two
 * moments broke — the reported defect rendered correctly at load and blanked only on rebuild.
 *
 * Read-only: takes its own `getEditorState().read()`, so call it OUTSIDE an update.
 */
export function expectEveryTextBearingNodeRendered(editor: LexicalEditor, when: string): void {
  const unrendered: string[] = [];
  editor.getEditorState().read(() => {
    $dfs($getRoot()).forEach(({ node }) => {
      if (!$isTextNode(node) && !$isDecoratorNode(node)) return;
      const text = node.getTextContent();
      if (!text) return;
      const rendered = editor.getElementByKey(node.getKey())?.textContent;
      if (rendered !== text)
        unrendered.push(
          `${node.getType()} ${JSON.stringify(text)} rendered as ${JSON.stringify(rendered)}`,
        );
    });
  });
  expect(unrendered, when).toEqual([]);
}
