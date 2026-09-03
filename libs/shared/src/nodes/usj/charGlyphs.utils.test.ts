import {
  $buildContinuationCharSpan,
  $charHasClosingGlyph,
  $charOwesClosingGlyph,
  $continuationCharAttributes,
} from "./charGlyphs.utils.js";
import { $createCharNode, CharNode } from "./CharNode.js";
import { NBSP, UnknownAttributes } from "./node-constants.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { $createTextNode, $getRoot, LexicalEditor, LexicalNode } from "lexical";
import { describe, expect, it } from "vitest";

/**
 * Builds `<p><char marker>…children…</char></p>` — with the char span wrapped in an outer `\wj`
 * span when `nested` — and returns the editor and the span.
 */
function buildSourceSpan({
  marker = "nd",
  unknownAttributes,
  nested = false,
  $children = () => [],
}: {
  marker?: string;
  unknownAttributes?: UnknownAttributes;
  nested?: boolean;
  $children?: () => LexicalNode[];
} = {}): { editor: LexicalEditor; source: CharNode } {
  const { editor } = createBasicTestEnvironment();
  let source!: CharNode;
  editor.update(
    () => {
      source = $createCharNode(marker, unknownAttributes);
      source.append(...$children());
      const para = $createParaNode("p");
      para.append(nested ? $createCharNode("wj").append(source) : source);
      $getRoot().append(para);
    },
    { discrete: true },
  );
  return { editor, source };
}

/** A span's children as plain data — node type and rendered text — for assertions. */
function readChildren(span: CharNode): { type: string; text: string }[] {
  return span
    .getChildren()
    .map((child: LexicalNode) => ({ type: child.getType(), text: child.getTextContent() }));
}

/**
 * Runs the builder over `content` for a span continuing `source` and returns the continuation's
 * children. The continuation is inserted after `source`, exactly as the split paths do.
 */
function buildContinuation(
  editor: LexicalEditor,
  source: CharNode,
  $content: () => LexicalNode[],
  renderGlyphs: boolean,
): { type: string; text: string }[] {
  let children: { type: string; text: string }[] = [];
  editor.update(
    () => {
      const span = $createCharNode(source.getMarker(), $continuationCharAttributes(source));
      $buildContinuationCharSpan(span, source, $content(), renderGlyphs);
      source.insertAfter(span);
      children = readChildren(span);
    },
    { discrete: true },
  );
  return children;
}

describe("$charOwesClosingGlyph", () => {
  it("a span with no attributes owes a closing glyph", () => {
    const { editor, source } = buildSourceSpan();
    editor.getEditorState().read(() => {
      expect($charOwesClosingGlyph(source)).toBe(true);
    });
  });

  it("a span carrying the implicit-close convention owes none", () => {
    const { editor, source } = buildSourceSpan({
      marker: "ft",
      unknownAttributes: { closed: "false" },
    });
    editor.getEditorState().read(() => {
      expect($charOwesClosingGlyph(source)).toBe(false);
    });
  });

  it("display attributes have no say in it", () => {
    const { editor, source } = buildSourceSpan({
      marker: "w",
      unknownAttributes: { lemma: "grace" },
    });
    editor.getEditorState().read(() => {
      expect($charOwesClosingGlyph(source)).toBe(true);
    });
  });

  it('only the exact string "false" opts out', () => {
    // The convention is the USJ byte `closed="false"`, not truthiness of a `closed` key.
    const { editor, source } = buildSourceSpan({ unknownAttributes: { closed: "true" } });
    editor.getEditorState().read(() => {
      expect($charOwesClosingGlyph(source)).toBe(true);
    });
  });
});

describe("$charHasClosingGlyph", () => {
  it("finds the span's own closing glyph", () => {
    const { editor, source } = buildSourceSpan({
      $children: () => [
        $createMarkerNode("nd", "opening"),
        $createTextNode(`${NBSP}word`),
        $createMarkerNode("nd", "closing"),
      ],
    });
    editor.getEditorState().read(() => {
      expect($charHasClosingGlyph(source)).toBe(true);
    });
  });

  it("an opener-only span has none", () => {
    const { editor, source } = buildSourceSpan({
      marker: "ft",
      unknownAttributes: { closed: "false" },
      $children: () => [$createMarkerNode("ft", "opening"), $createTextNode(`${NBSP}note`)],
    });
    editor.getEditorState().read(() => {
      expect($charHasClosingGlyph(source)).toBe(false);
    });
  });

  it("a glyph-less span (no glyphs are rendered at all) has none", () => {
    const { editor, source } = buildSourceSpan({ $children: () => [$createTextNode("word")] });
    editor.getEditorState().read(() => {
      expect($charHasClosingGlyph(source)).toBe(false);
    });
  });

  it("a self-closing glyph is not a closer — that is a milestone terminator", () => {
    const { editor, source } = buildSourceSpan({
      $children: () => [$createTextNode("word"), $createMarkerNode("", "selfClosing")],
    });
    editor.getEditorState().read(() => {
      expect($charHasClosingGlyph(source)).toBe(false);
    });
  });

  it("reads marker-agnostically: any closing glyph among the children counts", () => {
    // The collab-flattened shape parks a nested child span's glyphs among the parent's children.
    // Unlike `$charClosingGlyph` (attributeDisplay.utils.ts), which must match the span's own
    // marker to anchor its attribute run, this read does not.
    const { editor, source } = buildSourceSpan({
      $children: () => [$createTextNode("word"), $createMarkerNode("wj", "closing", true)],
    });
    editor.getEditorState().read(() => {
      expect($charHasClosingGlyph(source)).toBe(true);
    });
  });
});

describe("$continuationCharAttributes", () => {
  it("an explicitly closed span passes on no attributes", () => {
    const { editor, source } = buildSourceSpan();
    editor.getEditorState().read(() => {
      expect($continuationCharAttributes(source)).toBeUndefined();
    });
  });

  it("an implicitly closed span passes on the convention", () => {
    const { editor, source } = buildSourceSpan({
      marker: "ft",
      unknownAttributes: { closed: "false" },
    });
    editor.getEditorState().read(() => {
      expect($continuationCharAttributes(source)).toEqual({ closed: "false" });
    });
  });

  it("display attributes are never passed on — they stay on the left half", () => {
    // Copying `|lemma="grace"` onto the continuation would double those bytes on serialization.
    const { editor, source } = buildSourceSpan({
      marker: "w",
      unknownAttributes: { lemma: "grace", closed: "false" },
    });
    editor.getEditorState().read(() => {
      expect($continuationCharAttributes(source)).toEqual({ closed: "false" });
    });
  });
});

describe("$buildContinuationCharSpan", () => {
  /** A source span rendering the full editable-mode shape: `\nd ⍽word\nd*`. */
  function buildClosedSource(nested = false) {
    return buildSourceSpan({
      nested,
      $children: () => [
        $createMarkerNode("nd", "opening", nested),
        $createTextNode(`${NBSP}word`),
        $createMarkerNode("nd", "closing", nested),
      ],
    });
  }

  it("opens, separates, and closes — mirroring a source span that renders all three", () => {
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(editor, source, () => [$createTextNode("tail")], true);
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "text", text: `${NBSP}tail` },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("emits no opener and no separator when glyphs are not rendered", () => {
    // A "hidden"/"visible" mode reopen: the span still continues structurally, but a MarkerNode
    // there would be literal `\nd ` text in the content.
    const { editor, source } = buildSourceSpan({ $children: () => [$createTextNode("word")] });
    const children = buildContinuation(editor, source, () => [$createTextNode("tail")], false);
    expect(children).toEqual([{ type: "text", text: "tail" }]);
  });

  it("gates the closer on the SOURCE's shape, not on renderGlyphs", () => {
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(editor, source, () => [$createTextNode("tail")], false);
    expect(children).toEqual([
      { type: "text", text: "tail" },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("reopens an implicitly closed span closer-less", () => {
    const { editor, source } = buildSourceSpan({
      marker: "ft",
      unknownAttributes: { closed: "false" },
      $children: () => [$createMarkerNode("ft", "opening"), $createTextNode(`${NBSP}note`)],
    });
    const children = buildContinuation(editor, source, () => [$createTextNode("tail")], true);
    expect(children).toEqual([
      { type: "marker", text: "\\ft" },
      { type: "text", text: `${NBSP}tail` },
    ]);
  });

  it("carries the + onto both glyphs when the source is nested", () => {
    // The continuation becomes the source's sibling, so it nests exactly where the source does.
    const { editor, source } = buildClosedSource(true);
    const children = buildContinuation(editor, source, () => [$createTextNode("tail")], true);
    expect(children).toEqual([
      { type: "marker", text: "\\+nd" },
      { type: "text", text: `${NBSP}tail` },
      { type: "marker", text: "\\+nd*" },
    ]);
  });

  it("keeps content in order, with the closer last", () => {
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(
      editor,
      source,
      () => [$createTextNode("one"), $createTextNode("two")],
      true,
    );
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "text", text: `${NBSP}one` },
      { type: "text", text: "two" },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("does not double a separator the leading text already carries", () => {
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(
      editor,
      source,
      () => [$createTextNode(`${NBSP}tail`)],
      true,
    );
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "text", text: `${NBSP}tail` },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("leaves element-first content alone — the separator sync adds its spacer", () => {
    // A standalone NBSP spacer belongs between the glyph and an element; `$syncOpenerSeparators`
    // inserts it when the span is next dirtied, so the builder must not touch the element.
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(
      editor,
      source,
      () => [$createCharNode("wj").append($createTextNode("inner")), $createTextNode("tail")],
      true,
    );
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "char", text: "inner" },
      { type: "text", text: "tail" },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("never prefixes a leading glyph — its text is its own marker bytes", () => {
    // A MarkerNode is a TextNode subclass; prefixing an NBSP into it would corrupt the glyph.
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(
      editor,
      source,
      () => [$createMarkerNode("wj", "opening", true), $createTextNode("inner")],
      true,
    );
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "marker", text: "\\+wj" },
      { type: "text", text: "inner" },
      { type: "marker", text: "\\nd*" },
    ]);
  });

  it("builds nothing but glyphs for empty content", () => {
    const { editor, source } = buildClosedSource();
    const children = buildContinuation(editor, source, () => [], true);
    expect(children).toEqual([
      { type: "marker", text: "\\nd" },
      { type: "marker", text: "\\nd*" },
    ]);
  });
});
