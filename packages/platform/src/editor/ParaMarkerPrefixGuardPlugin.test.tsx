import { describe, expect, it } from "vitest";
import { $createTextNode, $getRoot, LexicalNode } from "lexical";
import {
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  CharNode,
  ImmutableTypedTextNode,
  MarkerNode,
  NBSP,
  ParaNode,
  VerseNode,
} from "shared";
import { ImmutableVerseNode } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";
import { $resetMarkerIfPrefixDeleted } from "./ParaMarkerPrefixGuardPlugin";

const nodes = [
  ParaNode,
  VerseNode,
  ImmutableVerseNode,
  MarkerNode,
  ImmutableTypedTextNode,
  CharNode,
];

/**
 * The marker-prefix shapes the adaptor injects in markerPrefix views. The transform must reset
 * markers regardless of which shape the prefix took.
 *
 * - `editable`: `markerMode: "editable"` — prefix is a mutable `MarkerNode("\\p")` followed by a
 *   `TextNode(NBSP)` (the "marker-trailing-space").
 * - `gutter-hidden`: `markerMode: "hidden"` + `hasGutterParaMarkers: true` — prefix is an
 *   `ImmutableTypedTextNode("marker", "\\p\\u00A0")`.
 */
type PrefixShape = "editable" | "gutter-hidden";

function $paraMarkerPrefix(shape: PrefixShape, marker: string): LexicalNode[] {
  if (shape === "editable") return [$createMarkerNode(marker), $createTextNode(NBSP)];
  return [$createImmutableTypedTextNode("marker", `\\${marker}${NBSP}`)];
}

describe("$resetMarkerIfPrefixDeleted", () => {
  const shapes: PrefixShape[] = ["editable", "gutter-hidden"];

  describe.each(shapes)("%s shape", (shape) => {
    it("resets a non-default paragraph's marker when the prefix has been removed", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q1").append($createTextNode("a poetry line"));
        $getRoot().append(para);
      });

      editor.update(() => $resetMarkerIfPrefixDeleted(para), { discrete: true });

      editor.getEditorState().read(() => {
        expect(para.getMarker()).toBe("p");
      });
    });

    it("does not reset when the prefix is still the first child", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q1").append(
          ...$paraMarkerPrefix(shape, "q1"),
          $createTextNode("a poetry line"),
        );
        $getRoot().append(para);
      });

      editor.update(() => $resetMarkerIfPrefixDeleted(para), { discrete: true });

      editor.getEditorState().read(() => {
        expect(para.getMarker()).toBe("q1");
      });
    });

    it("does not reset an empty paragraph (transient mid-edit state)", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q1");
        $getRoot().append(para);
      });

      editor.update(() => $resetMarkerIfPrefixDeleted(para), { discrete: true });

      editor.getEditorState().read(() => {
        expect(para.getMarker()).toBe("q1");
      });
    });

    it("does not reset a paragraph already at the default marker", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("p").append($createTextNode("plain text"));
        $getRoot().append(para);
      });

      editor.update(() => $resetMarkerIfPrefixDeleted(para), { discrete: true });

      editor.getEditorState().read(() => {
        expect(para.getMarker()).toBe("p");
      });
    });
  });
});
