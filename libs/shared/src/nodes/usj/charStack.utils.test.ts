import {
  $charStackContainer,
  $innermostCharAncestor,
  $isCharContentEmpty,
  $liftOutOfCharStack,
} from "./charStack.utils.js";
import { $createCharNode, CharNode } from "./CharNode.js";
import { NBSP } from "./node-constants.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { $createTextNode, $getRoot, ElementNode, LexicalEditor, TextNode } from "lexical";
import { describe, expect, it } from "vitest";

/**
 * `<p>\wj <char wj>\+nd <char nd>thing</char>\+nd*</char>\wj*</p>` — the two-deep stack the
 * close-and-reopen has to take apart, with the outer span's separator riding as a standalone NBSP
 * spacer (its content is element-first).
 */
function buildNestedStack(): { editor: LexicalEditor; content: TextNode; outer: CharNode } {
  const { editor } = createBasicTestEnvironment();
  let content!: TextNode;
  let outer!: CharNode;
  editor.update(
    () => {
      content = $createTextNode(`${NBSP}thing`);
      outer = $createCharNode("wj");
      $getRoot().append(
        $createParaNode("p").append(
          outer.append(
            $createMarkerNode("wj"),
            $createTextNode(NBSP),
            $createCharNode("nd").append(
              $createMarkerNode("nd", "opening", true),
              content,
              $createMarkerNode("nd", "closing", true),
            ),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    },
    { discrete: true },
  );
  return { editor, content, outer };
}

/**
 * The USFM bytes `node`'s subtree stands for: every text node in document order (glyph nodes
 * included) with the structural NBSP separators rendered as the plain spaces they serialize to.
 */
function $usfmBytes(node: ElementNode): string {
  return node
    .getAllTextNodes()
    .map((textNode) => textNode.getTextContent())
    .join("")
    .replaceAll(NBSP, " ");
}

describe("$isCharContentEmpty", () => {
  it("is true for a span holding only its glyphs and their separator", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const span = $createCharNode("nd").append(
          $createMarkerNode("nd"),
          $createTextNode(NBSP),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(span));
        expect($isCharContentEmpty(span)).toBe(true);
      },
      { discrete: true },
    );
  });

  it("is false for a span whose content is a single real space", () => {
    // A space the user typed is content; only the structural NBSP is not.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const span = $createCharNode("nd").append(
          $createMarkerNode("nd"),
          $createTextNode(`${NBSP} `),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(span));
        expect($isCharContentEmpty(span)).toBe(false);
      },
      { discrete: true },
    );
  });
});

describe("$liftOutOfCharStack", () => {
  it("closes innermost-out and reopens outermost-in around the lifted node", () => {
    const { editor, content } = buildNestedStack();
    editor.update(
      () => {
        const lifted = $createTextNode("|");
        const [left] = content.splitText(4); // between "thi" and "ng"
        left.insertAfter(lifted);

        $liftOutOfCharStack(lifted, true);

        // Closers innermost-then-outermost before the lifted node, openers outermost-then-innermost
        // after it, with the `+` on the nested one only. No ordering code produces this — it falls
        // out of each iteration's continuation landing in the next iteration's "after" set.
        //
        // The reopened `\wj` carries no separator because its content is element-first: a
        // standalone NBSP spacer is not part of the built shape, it is added by the separator sync
        // when the span is next dirtied (markerSeparators.utils.ts), which no plugin runs here.
        expect($usfmBytes($getRoot())).toBe("\\wj \\+nd thi\\+nd*\\wj*|\\wj\\+nd ng\\+nd*\\wj*");
        expect($charStackContainer(lifted)?.getType()).toBe("para");
      },
      { discrete: true },
    );
  });

  it("ends an implicitly-closed span at an implicitly-closed marker and hands it the remainder", () => {
    // `\ft A \+nd holy\+nd* B` with a `\fq` at the caret inside `\nd`. `\nd` closes explicitly, so
    // it closes and reopens; `\ft` closes IMPLICITLY and `\fq` does too, so writing `\fq` is how
    // `\ft` ends — no `\ft*`, no reopened `\ft`, and everything after becomes `\fq`'s content.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const content = $createTextNode(`${NBSP}holy`);
        const ft = $createCharNode("ft", { closed: "false" });
        const fq = $createCharNode("fq", { closed: "false" }).append($createMarkerNode("fq"));
        $getRoot().append(
          $createParaNode("p").append(
            ft.append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}A `),
              $createCharNode("nd").append(
                $createMarkerNode("nd", "opening", true),
                content,
                $createMarkerNode("nd", "closing", true),
              ),
              $createTextNode(" B"),
            ),
          ),
        );
        const [left] = content.splitText(3); // between "ho" and "ly"
        left.insertAfter(fq);

        $liftOutOfCharStack(fq, true);

        // `\fq` shows no separator here for the same reason a reopened span does not: its content
        // is element-first, so the standalone NBSP spacer comes from the separator sync when the
        // span is next dirtied, and no plugin runs it in this harness.
        expect($usfmBytes($getRoot())).toBe("\\ft A \\+nd ho\\+nd*\\fq\\+nd ly\\+nd* B");
        expect($innermostCharAncestor(content)?.getMarker()).toBe("nd");
        expect($charStackContainer(fq)?.getType()).toBe("para");
      },
      { discrete: true },
    );
  });

  it("reopens an explicitly-closed span even for an implicitly-closed marker", () => {
    // The mirror of the case above: `\wj` needs a real `\wj*`, which a `\fq` cannot supply, so it
    // closes and reopens around the new marker instead of handing over its remainder.
    const { editor, content } = buildNestedStack();
    editor.update(
      () => {
        const fq = $createCharNode("fq", { closed: "false" }).append($createMarkerNode("fq"));
        const [left] = content.splitText(4);
        left.insertAfter(fq);

        $liftOutOfCharStack(fq, true);

        expect($usfmBytes($getRoot())).toBe("\\wj \\+nd thi\\+nd*\\wj*\\fq\\wj\\+nd ng\\+nd*\\wj*");
      },
      { discrete: true },
    );
  });

  it("drops a half left with no content rather than reopening an empty marker pair", () => {
    const { editor, content } = buildNestedStack();
    editor.update(
      () => {
        const lifted = $createTextNode("|");
        content.insertBefore(lifted); // at the innermost run's very start

        $liftOutOfCharStack(lifted, true);

        // Both left halves would have held nothing but glyphs and separators, so neither survives.
        expect($usfmBytes($getRoot())).toBe("|\\wj\\+nd thing\\+nd*\\wj*");
      },
      { discrete: true },
    );
  });

  it("leaves a node that is not inside a char span alone", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const text = $createTextNode("plain");
        $getRoot().append($createParaNode("p").append(text));

        $liftOutOfCharStack(text, true);

        expect($usfmBytes($getRoot())).toBe("plain");
      },
      { discrete: true },
    );
  });
});
