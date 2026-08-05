import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { $createMarkerPrefix } from "./markerEditDeletion.utils";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
} from "lexical";
import {
  $charAttributeDisplayNode,
  $createMilestoneNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isVerseNode,
  CharNode,
  getMarker as bundledGetMarker,
  getVisibleOpenMarkerText,
  $isParaNode,
  NBSP,
  ParaNode,
  TypedMarkNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes } from "shared-react";

const viewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!viewOptions) throw new Error("Standard view options are required for these tests.");
const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function usjFromUsx(paraContent: string) {
  return usxStringToUsj(
    `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" /><para style="p">${paraContent}</para></usx>`,
  );
}

/** Load `usj` into a fresh headless editor in standard view; returns the editor. */
function loadEditor(usj: ReturnType<typeof usjFromUsx>) {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

function $lastPara(): ParaNode {
  const paras = $getRoot().getChildren().filter($isParaNode);
  return paras[paras.length - 1];
}

function $firstPara(usj: ReturnType<typeof deserializeSerializedEditorState>) {
  const defined = requireDefined(usj, "no USJ reconstructed");
  return requireDefined(
    defined.content.find((c) => typeof c !== "string" && c.type === "para"),
    "no para in reconstructed USJ",
  );
}

/** Depth-first search for a CharNode by marker anywhere under `root` (nested spans included). */
function $findCharDescendant(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findCharDescendant(child, marker);
    if (found) return found;
  }
  return undefined;
}

/** A char span's plain-text content, excluding its glyph MarkerNode children (MarkerNode is
 * itself a TextNode subclass) and the structural leading NBSP separator — just the text a user
 * would see/type as the span's content. */
function $charContentText(char: CharNode): string {
  return char
    .getChildren()
    .filter((node) => $isTextNode(node) && !$isMarkerNode(node))
    .map((node) => node.getTextContent())
    .join("")
    .replace(NBSP, "");
}

describe("$rebuildParas", () => {
  it("turns literal typed char markers into a CharNode span", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before  after`));
    editor.update(
      () => {
        const para = $lastPara();
        // simulate the user having typed "\nd Lord\nd*" between "before " and " after"
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("before")),
          "text node containing 'before' not found",
        );
        text.setTextContent("before \\nd Lord\\nd* after");
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "before ",
        { type: "char", marker: "nd", content: ["Lord"] },
        " after",
      ],
    });
  });

  // The single most important pin: a loaded, structurally-nested char span must survive an
  // unrelated Tier-2 pass in the same paragraph. Depth-aware glyphs render the inner span as
  // `\+w …\+w*`, so the re-tokenized fragment reproduces the SAME nesting and the rebuild
  // recognizes the fixed point and refuses. Without the `+` the fragment reads `\nd Lo\w rd\nd*`,
  // which close-on-bare flattens (w exits nd; `\nd*` becomes unmatched) — a silent corruption.
  it("treats a loaded nested char span as a Tier-2 fixed point (no-edit rebuild is a no-op)", () => {
    const editor = loadEditor(
      usjFromUsx(`before <char style="nd">Lo<char style="w">rd</char></char> after`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => $isCharNode(n) && n.getMarker() === "nd"),
        "nd char span not found",
      );
      // w is still NESTED inside nd (not flattened into a sibling), and no unmatched node was
      // produced by a bogus rebuild.
      const nested = $isCharNode(nd)
        ? nd.getChildren().filter((n) => $isCharNode(n) && n.getMarker() === "w")
        : [];
      expect(nested).toHaveLength(1);
      expect(
        $lastPara()
          .getChildren()
          .some((n) => n.getType() === "unmatched"),
      ).toBe(false);
      // The inner span's editable glyphs carry the `+` (depth-aware): \+w … \+w*.
      const markers = $isCharNode(nested[0]) ? nested[0].getChildren().filter($isMarkerNode) : [];
      expect(markers.map((m) => m.getTextContent())).toEqual(["\\+w", "\\+w*"]);
    });
  });

  // D5: a char span that crosses a verse boundary (the verse nests inside it, PT9 ≤3.0) must
  // survive an unrelated Tier-2 pass. The tokenizer keeps char styles open across a verse for
  // ≤3.0, so re-tokenizing the visible text reproduces the same structure — a fixed point.
  it("treats a char span crossing a verse boundary as a Tier-2 fixed point (D5)", () => {
    const editor = loadEditor(
      usjFromUsx(`before <char style="nd">Lord<verse number="2" style="v" />next</char> after`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => $isCharNode(n) && n.getMarker() === "nd"),
        "nd char span not found",
      );
      // The verse is still INSIDE the nd span (not flattened out to paragraph level), and no
      // unmatched node was produced by a bogus rebuild.
      const hasVerse = $isCharNode(nd)
        ? nd.getChildren().some((n) => n.getType() === "verse")
        : false;
      expect(hasVerse).toBe(true);
      expect(
        $lastPara()
          .getChildren()
          .some((n) => n.getType() === "unmatched"),
      ).toBe(false);
    });
  });

  // Text that FOLLOWS a nested closing marker inside a char span must not get the structural
  // leading-NBSP separator — that prefix belongs only to the content right after the OPENING
  // glyph. Otherwise the NBSP leaks to the file and Tier-2 accumulates a fresh one each rebuild.
  it("does not put a structural NBSP before text after a nested closer, and stays a fixed point", () => {
    const editor = loadEditor(
      usjFromUsx(`asdf <char style="wj">li<char style="nd">g</char>ht</char>`),
    );
    editor.getEditorState().read(() => {
      const wj = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => $isCharNode(n) && n.getMarker() === "wj"),
        "wj char span not found",
      );
      const texts = $isCharNode(wj)
        ? wj.getChildren().filter((n) => $isTextNode(n) && !$isMarkerNode(n))
        : [];
      // "li" (right after the \wj opener) keeps its structural NBSP prefix; "ht" (after the
      // nested \+nd*) must NOT — its content is a plain "ht", never an NBSP-prefixed one.
      expect(texts.map((t) => t.getTextContent())).toEqual([`${NBSP}li`, "ht"]);
    });
    // A no-edit rebuild is a fixed point: no accumulation of a leading space before "ht".
    editor.update(() => expect($rebuildParas([$lastPara()], context)).toBe(false), {
      discrete: true,
    });
  });

  // The display separator after an opening glyph must exist even when the span's FIRST content is
  // an element (a nested char): `\nd \+wj on\+wj*e\nd*` renders a spacer NBSP between `\nd` and
  // `\+wj`. The spacer is display-only (dropped on save) and the paragraph stays a fixed point.
  it("shows a separator after an opener whose first content is a nested char, and stays a fixed point", () => {
    const editor = loadEditor(
      usjFromUsx(`x <char style="nd"><char style="wj">on</char>e</char> after`),
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => $isCharNode(n) && n.getMarker() === "nd"),
        "nd char span not found",
      );
      if (!$isCharNode(nd)) throw new Error("nd is not a CharNode");
      const children = nd.getChildren();
      // [opener \nd, spacer NBSP, wj span, "e", closer \nd*]
      expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\nd");
      expect($isTextNode(children[1]) && children[1].getTextContent()).toBe(NBSP);
      expect($isCharNode(children[2]) && children[2].getMarker()).toBe("wj");
    });
    // The spacer is presentation-only: the USJ round trip carries no stray space.
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      content: [
        "x ",
        { type: "char", marker: "nd", content: [{ type: "char", marker: "wj" }, "e"] },
        " after",
      ],
    });
    editor.update(() => expect($rebuildParas([$lastPara()], context)).toBe(false), {
      discrete: true,
    });
  });

  // A preserved (sentinel) node directly after an opening glyph must not corrupt the fragment:
  // without a separator, the U+FFFC placeholder would EXTEND the marker name (`\wj` + U+FFFC
  // scans as unknown marker "wj￼"), vanish from the text, and trip the sentinel-count abort —
  // so a deleted separator before a sentinel span could never settle back. The fragment builder
  // now emits a separator space before a placeholder that would otherwise glue onto a marker.
  //
  // A char span with a closing glyph renders its attributes as an ordinary display run among its
  // children, so an ATTRIBUTE-bearing nested span no longer exercises this code path at all — it
  // re-tokenizes like any other known-marker char instead of riding through as a sentinel.
  // Retargeted at an UNKNOWN-marker nested span (`zx`, custom.sty), which is still a sentinel and
  // is exactly the case this separator-insertion logic guards.
  it("rebuilds (not aborts) when a sentinel span directly follows an opening glyph", () => {
    const editor = loadEditor(
      usjFromUsx(`x <char style="wj">a<char style="zx">dsa</char>e</char> after`),
    );
    let preservedKey = "";
    editor.update(
      () => {
        const wj = requireDefined(
          $lastPara()
            .getChildren()
            .find((n) => $isCharNode(n) && n.getMarker() === "wj"),
          "wj span not found",
        );
        if (!$isCharNode(wj)) throw new Error("wj is not a CharNode");
        // Make the unknown-marker span (a Tier-2 sentinel: custom.sty markers are not
        // text-recoverable) directly follow the opener: remove everything between them,
        // simulating the user deleting the separator/leading text.
        const zxSpan = requireDefined(
          wj.getChildren().find((n) => $isCharNode(n)),
          "zx span not found",
        );
        preservedKey = zxSpan.getKey();
        for (const child of wj.getChildren()) {
          if ($isMarkerNode(child) || child.is(zxSpan)) continue;
          if (child.getTextContent().includes("e")) continue; // keep the tail text
          child.remove();
        }
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const wj = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => $isCharNode(n) && n.getMarker() === "wj"),
        "wj span not found after rebuild",
      );
      if (!$isCharNode(wj)) throw new Error("wj is not a CharNode");
      // The preserved span survived as the SAME instance (moved, not recreated)...
      const zxSpan = wj.getChildren().find((n) => $isCharNode(n));
      expect(zxSpan?.getKey()).toBe(preservedKey);
      // ...and the display separator is restored between the opener and the span.
      const children = wj.getChildren();
      expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\wj");
      expect($isTextNode(children[1]) && children[1].getTextContent()).toBe(NBSP);
    });
  });

  it("splits the paragraph when the text contains a literal \\p", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />one \\p two`));
    editor.update(() => expect($rebuildParas([$lastPara()], context)).toBe(true), {
      discrete: true,
    });
    const usj = requireDefined(
      deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions),
      "no USJ reconstructed",
    );
    const paras = usj.content.filter((c) => typeof c !== "string" && c.type === "para");
    expect(paras).toHaveLength(2);
    expect(paras[1]).toMatchObject({ type: "para", marker: "p", content: ["two"] });
  });

  it("creates a verse from literal \\v text", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />one \\v 2 two`));
    editor.update(() => $rebuildParas([$lastPara()], context), { discrete: true });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      content: [{ type: "verse", number: "1" }, "one ", { type: "verse", number: "2" }, "two"],
    });
  });

  it("creates a collapsed note from literal typed note markers", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" />text \\f + \\ft A note.\\f* end`),
    );
    editor.update(() => $rebuildParas([$lastPara()], context), { discrete: true });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      content: [
        { type: "verse", number: "1" },
        "text ",
        {
          type: "note",
          marker: "f",
          caller: "+",
          content: [{ type: "char", marker: "ft", content: ["A note."] }],
        },
        " end",
      ],
    });
  });

  it("moves an existing NoteNode through the rebuild without recreating it (sentinel)", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" />a<note caller="+" style="f"><char style="ft">n</char></note> b \\nd x\\nd* c`,
      ),
    );
    let noteKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        const noteNode = requireDefined(
          para.getChildren().find((n) => n.getType() === "note"),
          "note node not found",
        );
        noteKey = noteNode.getKey();
        $rebuildParas([para], context);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      const note = para.getChildren().find((n) => n.getType() === "note");
      expect(note?.getKey()).toBe(noteKey); // same instance, not a recreation
    });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(JSON.stringify(para)).toContain('"marker":"nd"'); // the typed span was built
    expect(JSON.stringify(para)).toContain('"type":"note"'); // the note survived
  });

  it("moves an unknown-marker char span through the rebuild as a sentinel", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" />a <char style="zx">custom</char> b \\nd x\\nd* c`),
    );
    let charKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        const charNode = requireDefined(
          para.getChildren().find((n) => n.getType() === "char"),
          "char node not found",
        );
        charKey = charNode.getKey();
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const chars = $lastPara()
        .getChildren()
        .filter((n) => n.getType() === "char");
      expect(chars.some((c) => c.getKey() === charKey)).toBe(true); // same instance
    });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    expect(JSON.stringify(usj)).toContain('"marker":"zx"'); // custom span intact
    expect(JSON.stringify(usj)).toContain('"marker":"nd"'); // typed span built
  });

  it("aborts untouched when the serialize->parse round trip drops a preserved-node placeholder", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" />a <char style="zx">custom</char> b \\nd x\\nd* c`),
    );
    // The tokenizer-level count check (countSentinels on the MarkerContent) passes, but the
    // serialize->parse round trip is a second place a U+FFFC placeholder can vanish. Simulate a
    // lossy serialize that silently drops one placeholder: without the parsed-tree count guard,
    // $replaceSentinels would then quietly drop the preserved custom span. The rebuild must abort
    // untouched instead.
    const original = usjEditorAdaptor.serializeEditorState;
    const spy = vi
      .spyOn(usjEditorAdaptor, "serializeEditorState")
      .mockImplementation((usj, opts) =>
        JSON.parse(JSON.stringify(original.call(usjEditorAdaptor, usj, opts)).replace("￼", "")),
      );
    try {
      let charKey = "";
      let returned: boolean | undefined;
      editor.update(
        () => {
          const para = $lastPara();
          charKey = requireDefined(
            para.getChildren().find((n) => n.getType() === "char"),
            "char node not found",
          ).getKey();
          returned = $rebuildParas([para], context);
        },
        { discrete: true },
      );
      expect(returned).toBe(false); // rebuild refused, not a lossy splice
      editor.getEditorState().read(() => {
        // Nothing was mutated: the preserved custom span is still the same attached instance.
        const chars = $lastPara()
          .getChildren()
          .filter((n) => n.getType() === "char");
        expect(chars.some((c) => c.getKey() === charKey)).toBe(true);
      });
    } finally {
      spy.mockRestore();
    }
  });

  // The old guard refused ANY unknown para marker outright. The guard is
  // now relaxed — unknown/custom.sty para markers round-trip, because the tokenizer
  // emits them as paragraphs in body context (PT9 DetermineUnknownTokenType), so the rebuild
  // no longer invents bytes by re-wrapping the fragment in a default \p.
  it("rebuilds a paragraph whose marker is unknown to the sheet (relaxed guard, deviation #4)", () => {
    const editor = loadEditor(
      usxStringToUsj(
        `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" /><para style="zq">custom para \\nd x\\nd*</para></usx>`,
      ),
    );
    editor.update(
      () => {
        const para = $lastPara();
        expect(para.getMarker()).toBe("zq");
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      // The unknown para marker is preserved (not rewrapped as a default \p)...
      expect(para.getMarker()).toBe("zq");
      // ...and the literal "\nd x\nd*" text really did rebuild into a CharNode span.
      expect(para.getChildren().some((n) => n.getType() === "char")).toBe(true);
    });
  });

  // `ts-s` is a stylesheet-family milestone name the tokenizer classifies on its own (no
  // project StyleInfo needed, see `isMilestoneHeuristicName`), so it now genuinely
  // re-tokenizes through the rebuild rather than riding through as a preserved sentinel —
  // a fresh MilestoneNode is built from the re-tokenized fragment, so it does NOT keep the
  // original node's key. Only the visible glyph/attribute TEXT is asserted here; the
  // key-identity assertion this test used to make belonged to the old whole-node-sentinel
  // classification and no longer holds.
  it("re-tokenizes a milestone's display run through the rebuild", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" /><ms style="ts-s" sid="ts.RUT.1" />text \\nd x\\nd* end`,
      ),
    );
    editor.update(
      () => {
        const para = $lastPara();
        expect(para.getChildren().some((n) => n.getType() === "ms")).toBe(true);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex((n) => n.getType() === "ms");
      // display glyphs materialize fresh: opening \ts-s, attribute text (sid is ts-s's default
      // attribute, so it collapses to the bare value), self-closing \*
      expect(children[msIndex + 1]?.getTextContent()).toBe("\\ts-s");
      expect(children[msIndex + 2]?.getTextContent()).toContain("ts.RUT.1");
      expect(children[msIndex + 3]?.getTextContent()).toBe("\\*");
    });
  });

  it("skips paragraphs with unknownAttributes (guard rail)", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />text`));
    editor.update(
      () => {
        const para = $lastPara();
        para.setUnknownAttributes({ custom: "x" });
        expect($rebuildParas([para], context)).toBe(false);
      },
      { discrete: true },
    );
  });

  it("restores the caret to the same display offset", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" />before \\nd Lord\\nd* after`),
    );
    editor.update(
      () => {
        const para = $lastPara();
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("after")),
          "text node containing 'after' not found",
        );
        // caret between "af" and "ter" of the trailing text
        const offset = text.getTextContent().indexOf("ter");
        text.select(offset, offset);
        $rebuildParas([para], context);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        expect(anchorNode.getTextContent().slice(selection.anchor.offset)).toMatch(/^ter/);
      }
    });
  });

  it("lands the caret AFTER a typed closer glyph, on the following content (not inside it)", () => {
    // The user typed a complete `\nd Lord\nd*` span; the caret sits right after the just-typed
    // closer `\nd*`, before " after". After the rebuild builds the real CharNode span, the caret
    // must land on the following content (" after"), not inside the closer glyph — otherwise
    // continued typing edits the `\nd*` glyph instead of the paragraph text. A closer is a
    // COMPLETE marker (unlike a half-typed opener, whose caret stays in the glyph to extend it).
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before  after`));
    editor.update(
      () => {
        const para = $lastPara();
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("before")),
          "text node containing 'before' not found",
        );
        text.setTextContent("before \\nd Lord\\nd* after");
        const offset = "before \\nd Lord\\nd*".length; // right after the typed closer
        text.select(offset, offset);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        // Not parked inside the closer glyph…
        expect($isMarkerNode(anchorNode)).toBe(false);
        // …but on the content that follows it.
        expect(anchorNode.getTextContent()).toMatch(/after/);
      }
    });
  });

  it("lands the caret AFTER a typed closer glyph at paragraph END (append position, not inside)", () => {
    // Para-END variant of the case above: the user typed a complete `\nd hello\nd*` at the very
    // end of the paragraph, with NOTHING after the closer. The caret sat right after `\nd*`. After
    // the rebuild builds the real CharNode span, the caret must sit AFTER the whole span — an
    // append position in the paragraph — NOT at the end of the span's inner "hello" text (which is
    // the start-of-glyph boundary of the closer), or continued typing lands STYLED inside the nd
    // span. Pre-fix, the forward offset scan skipped the trailing closing glyph and the fallback
    // parked the caret at the end of the last text span ("hello"), i.e. inside the span.
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before `));
    editor.update(
      () => {
        const para = $lastPara();
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("before")),
          "text node containing 'before' not found",
        );
        text.setTextContent("before \\nd hello\\nd*");
        const offset = "before \\nd hello\\nd*".length; // right after the typed closer, at para end
        text.select(offset, offset);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined(
        $findCharDescendant($lastPara(), "nd"),
        "nd span not found after rebuild",
      );
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        // Not parked on the closer glyph itself…
        expect($isMarkerNode(anchorNode)).toBe(false);
        // …and NOT anywhere inside the nd span (continued typing must be unstyled paragraph text).
        let insideNd = false;
        for (let node: LexicalNode | null = anchorNode; node; node = node.getParent())
          if (node.is(nd)) {
            insideNd = true;
            break;
          }
        expect(insideNd).toBe(false);
      }
    });
  });

  it("keeps the caret in the paragraph after a paragraph-DIRECT closer at absolute end (\\va*)", () => {
    // Para-END variant of the case above, but for a closer whose enclosing "span" is NOT a
    // CharNode: a verse's \va/\vp display glyphs ride as ordinary PARAGRAPH siblings, never
    // wrapped in a char span (see $verseAttributeRun's doc comment; same is true of a
    // milestone's opening/closing glyphs — see $milestoneDisplayRun). So the closing \va* glyph's
    // `.getParent()` is the paragraph itself. Pre-fix, $selectAfterClosingSpan called
    // `enclosingSpan.selectNext(0, 0)` on the PARAGRAPH unconditionally, which places the point
    // PAST THE WHOLE PARAGRAPH instead of after the closer glyph within it — the caret escaped
    // the paragraph instead of landing at its append position.
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />`));
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        // Simulate the user having typed "\va 2\va*" directly after the verse, at paragraph end.
        const typed = $createTextNode(" \\va 2\\va*");
        verse.insertAfter(typed);
        const offset = typed.getTextContentSize();
        typed.select(offset, offset);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        let insidePara = false;
        for (let node: LexicalNode | null = anchorNode; node; node = node.getParent())
          if (node.is(para)) {
            insidePara = true;
            break;
          }
        expect(insidePara).toBe(true);
      }
    });
  });

  it("keeps the caret in the paragraph after a paragraph-DIRECT milestone closer at absolute end (\\*)", () => {
    // Milestone analog of the \va* case above — the OTHER paragraph-direct closer shape the
    // guard's doc comment names. A milestone's display run (opening glyph, attribute text,
    // self-closing `\*`) rides as ordinary paragraph siblings of the MilestoneNode
    // ($milestoneDisplayRun), so the self-closing glyph's `.getParent()` is the paragraph too,
    // and a settle whose caret sat past a para-end `\*` hits the same fallback path.
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before`));
    editor.update(
      () => {
        const para = $lastPara();
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("before")),
          "text node containing 'before' not found",
        );
        // Simulate the user having typed a complete milestone at the very end of the paragraph.
        text.setTextContent('before \\qt-s |who="TJ"\\*');
        const offset = text.getTextContentSize();
        text.select(offset, offset);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      // The milestone materialized (its self-closing glyph is the paragraph's trailing span).
      expect(para.getChildren().some((n) => n.getType() === "ms")).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        let insidePara = false;
        for (let node: LexicalNode | null = anchorNode; node; node = node.getParent())
          if (node.is(para)) {
            insidePara = true;
            break;
          }
        expect(insidePara).toBe(true);
      }
    });
  });

  it("restores the caret to the END of a marker glyph split out mid-paragraph (no scramble)", () => {
    // Typing `\z` mid-paragraph immediately terminates against the pre-existing following
    // space, so the rebuild splits the paragraph. The caret sat right after the just-typed
    // "z"; after the rebuild it must sit at the END of the new "\z" glyph (offset 2), so
    // continued typing extends the marker name. Pre-fix, the caret was mapped through RAW
    // fragment-string offsets, but the new fragment gains an inter-paragraph joiner space
    // that the old fragment didn't have — every offset past the split point shifted by
    // one, landing the caret INSIDE the glyph (between "\" and "z") and scrambling all
    // subsequent keystrokes (e.g. `\zfoo ` rendered as `\foo z `).
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />For Yahweh knows the way`));
    editor.update(
      () => {
        const para = $lastPara();
        const text = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((node) => node.getTextContent().includes("knows")),
          "text node containing 'knows' not found",
        );
        // simulate the user having just typed "\z" after "knows"; caret right after the "z"
        text.setTextContent("For Yahweh knows\\z the way");
        const offset = "For Yahweh knows\\z".length;
        text.select(offset, offset);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        expect(anchorNode.getTextContent()).toBe("\\z");
        expect(selection.anchor.offset).toBe(2); // END of the glyph, not inside it
      }
    });
  });
});

describe("unknown-para rebuild round-trip", () => {
  it("rebuilds a paragraph whose marker is unknown to the sheet (no more guard refusal)", () => {
    const editor = loadEditor(
      usxStringToUsj(
        `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" /><para style="zfoo">x \\nd y\\nd* z</para></usx>`,
      ),
    );
    editor.update(
      () => {
        const para = $lastPara();
        expect(para.getMarker()).toBe("zfoo");
        // Previously $buildParaFragment refused: getMarker("zfoo") === undefined.
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      expect(para.getMarker()).toBe("zfoo"); // preserved, not rewrapped as a default \p
      expect(para.getChildren().some((n) => n.getType() === "char")).toBe(true); // "nd" span built
    });
  });
});

describe("attribute-bearing char spans re-tokenize", () => {
  it('no-edit rebuild of `\\w x|lemma="y"\\w*` is a fixed point', () => {
    // Loaded from USJ, the span already carries its canonical collapsed run (`|y`, since lemma
    // is "w"'s default attribute) — the same materialized shape a settle would produce from the
    // literal source `\w x|lemma="y"\w*`. An untouched rebuild must not perturb it.
    const editor = loadEditor(usjFromUsx(`before <char style="w" lemma="y">x</char> after`));
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toMatchObject({ lemma: "y" });
    });
  });

  it('no-edit rebuild of an explicitly-closed `\\xt Gen 1:1|link-href="GEN 1:1"\\xt*` is a fixed point', () => {
    // \xt is a cross-reference content marker, but this span is EXPLICITLY closed (the source USJ
    // carries no closed="false"): closer display keys on state, not the marker family, so the span
    // renders its `\xt*` closer, its `link-href` attribute run (`|GEN 1:1`, link-href being xt's
    // default) is built, and the span is text-recoverable — no longer an atomic sentinel. An
    // untouched rebuild must recognize it as a fixed point and leave the attribute intact.
    const editor = loadEditor(
      usjFromUsx(`See <char style="xt" link-href="GEN 1:1">Gen 1:1</char> here.`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const xt = requireDefined($findCharDescendant($lastPara(), "xt"), "xt char span not found");
      expect(xt.getUnknownAttributes()).toMatchObject({ "link-href": "GEN 1:1" });
      // No phantom closed flag stamped onto the explicitly-closed span.
      expect(xt.getUnknownAttributes()?.closed).toBeUndefined();
      // The closing glyph is present (the recoverability anchor for the attribute run).
      expect(
        xt.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
      ).toBe(true);
    });
  });

  it("no-edit rebuild of a span whose attribute value contains // is a fixed point", () => {
    // The span's display run collapses to `|http://x.y` (link-href is jmp's default attribute),
    // so the re-tokenized fragment carries `//` INSIDE the attribute segment. That `//` is
    // attribute-value bytes (ParatextData parses attributes from the raw segment between the `|`
    // and the closer), not a discretionary break — a no-edit rebuild must reproduce the same
    // span instead of splitting the URL around an optbreak and dropping the attribute.
    const editor = loadEditor(
      usjFromUsx(`go to <char style="jmp" link-href="http://x.y">go</char> now`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const jmp = requireDefined(
        $findCharDescendant($lastPara(), "jmp"),
        "jmp char span not found",
      );
      expect(jmp.getUnknownAttributes()).toMatchObject({ "link-href": "http://x.y" });
      // The attribute display run survives as one intact `|value` — the URL is not split.
      const run = requireDefined($charAttributeDisplayNode(jmp), "attribute display run not found");
      expect(run.getTextContent()).toBe("|http://x.y");
      // And the span's visible text is exactly content + that run (no stray literal bytes).
      expect($charContentText(jmp)).toBe(`go${run.getTextContent()}`);
    });
  });

  it("no-edit rebuild of the nested zzz6 shape `\\wj \\+w dsa|stuff\\+w*` is a fixed point", () => {
    const editor = loadEditor(
      usjFromUsx(`<char style="wj"><char style="w" lemma="stuff">dsa</char>e</char>`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toMatchObject({ lemma: "stuff" });
    });
  });

  // Treating an attribute-bearing span as a whole-node Tier-2 sentinel meant ANYTHING edited
  // inside it — including its own nested closer glyph — was preserved verbatim (moved, never
  // re-derived), so the edit could never settle: $rebuildParas kept refusing as a "fixed point" no
  // matter how many times it ran, because the sentinel comparison never looked past the
  // placeholder. Deleting the nested closer glyph now flows into the paragraph fragment like any
  // other glyph text, so the tokenizer sees the still-open span and genuinely resolves it
  // (implicitly closed, its `|stuff` bytes literal — no closer ever matched to run
  // `extractAttributes`).
  it("editing a nested closer glyph inside an attribute span settles (deferred finding 2)", () => {
    const editor = loadEditor(
      usjFromUsx(`<char style="wj"><char style="w" lemma="stuff">dsa</char>e</char>`),
    );
    editor.update(
      () => {
        const wSpan = requireDefined(
          $findCharDescendant($lastPara(), "w"),
          "w char span not found",
        );
        const closer = requireDefined(
          wSpan.getChildren().find((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing"),
          "w closing glyph not found",
        );
        closer.remove(); // simulates the user backspacing through the whole `\+w*` glyph
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      // Never explicitly closed: no frame ran extractAttributes, so the lemma attribute was
      // never derived and the `|stuff` bytes are ordinary content, merged with the trailing "e".
      // `closed: "false"` is the honesty-rule flag every implicitly-closed span carries.
      expect(w.getUnknownAttributes()).toEqual({ closed: "false" });
      expect(w.getTextContent().replace(NBSP, "")).toContain("dsa|stuffe");
    });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    // closed="false": the span round-trips as implicitly closed, exactly like an unclosed note.
    expect(JSON.stringify(para)).toContain('"closed":"false"');
  });

  it('`|lemma="gloss"` settles to `|gloss` on rebuild (PT9 settle-time simplification)', () => {
    const editor = loadEditor(usjFromUsx(`<char style="w" lemma="grace">x</char>`));
    editor.update(
      () => {
        const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
        const run = requireDefined($charAttributeDisplayNode(w), "attribute display run not found");
        // Simulate the user having typed the explicit (non-canonical) form directly.
        run.setTextContent('|lemma="gloss"');
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toMatchObject({ lemma: "gloss" });
      // Re-tokenize + re-materialize collapses back to the canonical bare-value form.
      const run = requireDefined(
        $charAttributeDisplayNode(w),
        "attribute display run not found after rebuild",
      );
      expect(run.getTextContent()).toBe("|gloss");
    });
  });

  it("deleting the whole run settles to a span with no attributes", () => {
    const editor = loadEditor(usjFromUsx(`<char style="w" lemma="grace">x</char>`));
    editor.update(
      () => {
        const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
        const run = requireDefined($charAttributeDisplayNode(w), "attribute display run not found");
        run.remove(); // the user deleted the entire `|grace` run
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toBeUndefined();
      expect($charAttributeDisplayNode(w)).toBeUndefined();
    });
  });

  it("malformed attribute text settles to literal span content (no default: `\\nd a|x=\\nd*`)", () => {
    // "nd" has no default attribute (defaultMarkerAttribute("nd") is undefined), so a bare
    // (non-"name=value") chunk after `|` can never resolve to an attribute — PT9 leaves it as
    // literal span content.
    const editor = loadEditor(usjFromUsx(`<char style="nd" foo="bar">a</char>`));
    editor.update(
      () => {
        const nd = requireDefined($findCharDescendant($lastPara(), "nd"), "nd char span not found");
        const run = requireDefined(
          $charAttributeDisplayNode(nd),
          "attribute display run not found",
        );
        run.setTextContent("|x="); // malformed: "x=" has no closing quote, no "=value" pair
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined($findCharDescendant($lastPara(), "nd"), "nd char span not found");
      expect(nd.getUnknownAttributes()).toBeUndefined(); // "foo" is gone, "x" was never derived
      expect($charContentText(nd)).toBe("a|x=");
    });
  });

  it("no-edit rebuild of an already-settled malformed-attribute span is a fixed point", () => {
    // The previous test's OUTPUT — literal `|x=` bytes, no attributes, since "nd" has no
    // default attribute for a bare chunk to resolve against — loaded directly (not produced by
    // an in-session edit) and pushed back through the real rebuild pipeline. Re-tokenizing
    // `\nd a|x=\nd*` must fail attribute parsing exactly the same way and reproduce the same
    // literal span, not oscillate into some other shape on a second pass.
    const editor = loadEditor(usjFromUsx(`<char style="nd">a|x=</char>`));
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const nd = requireDefined($findCharDescendant($lastPara(), "nd"), "nd char span not found");
      expect(nd.getUnknownAttributes()).toBeUndefined();
      expect($charContentText(nd)).toBe("a|x=");
    });
  });

  it("`|gloss` typed before `\\nd*` stays literal content; before `\\w*` becomes lemma", () => {
    const editor = loadEditor(
      usjFromUsx(`<char style="nd" foo="bar">a</char> <char style="w" lemma="grace">x</char>`),
    );
    editor.update(
      () => {
        const nd = requireDefined($findCharDescendant($lastPara(), "nd"), "nd char span not found");
        const ndRun = requireDefined(
          $charAttributeDisplayNode(nd),
          "nd attribute display run not found",
        );
        ndRun.setTextContent("|gloss");
        const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
        const wRun = requireDefined(
          $charAttributeDisplayNode(w),
          "w attribute display run not found",
        );
        wRun.setTextContent("|gloss");
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      // "nd" has no default attribute: the bare value stays literal content, not an attribute.
      const nd = requireDefined($findCharDescendant($lastPara(), "nd"), "nd char span not found");
      expect(nd.getUnknownAttributes()).toBeUndefined();
      expect($charContentText(nd)).toBe("a|gloss");
      // "w"'s default attribute IS lemma: the bare value resolves to lemma="gloss".
      const w = requireDefined($findCharDescendant($lastPara(), "w"), "w char span not found");
      expect(w.getUnknownAttributes()).toMatchObject({ lemma: "gloss" });
    });
  });
});

describe("milestones re-tokenize", () => {
  it("no-edit rebuild of a paragraph containing a sid-bearing milestone is a fixed point", () => {
    const editor = loadEditor(usjFromUsx(`before <ms style="qt-s" sid="q1" /> after`));
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex((n) => n.getType() === "ms");
      expect(msIndex).toBeGreaterThanOrEqual(0);
      expect(children[msIndex + 2]?.getTextContent()).toBe(`${NBSP}|sid="q1"`);
    });
  });

  // THE edit-loss regression: before this task, a milestone was ALWAYS a Tier-2 sentinel, so
  // an edit made directly to its displayed attribute text (the only way to edit a milestone's
  // attributes at all) could never settle — $rebuildParas kept refusing as a "fixed point" no
  // matter how many times it ran, because the sentinel comparison never looked past the
  // placeholder. Editing the run's `sid` value must now flow through re-tokenization and land
  // in the rebuilt MilestoneNode's own state, which the editor->USJ conversion then reflects.
  it("editing the run's sid value settles into the milestone's serialized USJ", () => {
    const editor = loadEditor(usjFromUsx(`before <ms style="qt-s" sid="q1" /> after`));
    editor.update(
      () => {
        const para = $lastPara();
        const children = para.getChildren();
        const msIndex = children.findIndex((n) => n.getType() === "ms");
        const attributeNode = children[msIndex + 2];
        if (!$isTextNode(attributeNode)) throw new Error("attribute display run not found");
        // A real in-place value edit KEEPS the run's leading NBSP (the user changes only the
        // "q1" bytes). This is the demanding shape for fixed-point detection: the edited run
        // text is byte-identical to what re-tokenizing it would regenerate, so ONLY the
        // milestone's own stale node state (still sid="q1") can reveal that this rebuild is
        // not a no-op — the signature must fold that state in, or the rebuild refuses and the
        // edit is silently lost.
        attributeNode.setTextContent(`${NBSP}|sid="q2"`);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(JSON.stringify(para)).toContain('"sid":"q2"');
    expect(JSON.stringify(para)).not.toContain('"sid":"q1"');
  });

  // Bare `ts` is syntactically a valid milestone marker (`MilestoneNode.isValidMarker`), but no
  // stylesheet — bundled or project — declares it as one, and the tokenizer's own heuristic
  // deliberately excludes it (`isMilestoneHeuristicName`: only `-s`/`-e` suffixed names, since
  // ParatextData itself parses standalone `ts` as an unknown marker). A milestone the tokenizer
  // could never re-derive as a milestone must stay an atomic sentinel, or re-tokenizing it would
  // silently change what it is.
  it("a milestone whose marker cannot be classified (bare `ts`) stays atomic", () => {
    const editor = loadEditor(usjFromUsx(`before <ms style="ts" /> after \\nd x\\nd* end`));
    let msKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        const msNode = requireDefined(
          para.getChildren().find((n) => n.getType() === "ms"),
          "milestone node not found",
        );
        msKey = msNode.getKey();
        // The literal `\nd x\nd*` elsewhere in the paragraph still tokenizes into a CharNode,
        // so the rebuild as a whole is not a no-op even though the milestone itself is untouched.
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const msNode = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => n.getType() === "ms"),
        "milestone node not found after rebuild",
      );
      // Same node, moved (not recreated) — the sentinel-preservation path.
      expect(msNode.getKey()).toBe(msKey);
    });
  });

  // The collab materializer ($createMilestone in delta-apply-update.utils.ts) builds bare
  // MilestoneNodes with NO display-run siblings; the adaptor always builds a run, so only the
  // collab path produces this shape. A re-tokenizable milestone whose run is empty contributes
  // ZERO bytes to the rebuild fragment, so the rebuild would splice it away entirely (silent
  // deletion). With no displayable bytes it must degrade to an atomic sentinel and survive —
  // the spec's "no displayable bytes → atomic" self-protection.
  it("preserves a bare collab-shaped milestone (no display run) as a sentinel", () => {
    const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
    let msKey = "";
    editor.update(
      () => {
        const [glyph, separator] = $createMarkerPrefix("p");
        const ms = $createMilestoneNode("qt-s", "q1");
        msKey = ms.getKey();
        $getRoot().append(
          $createParaNode("p").append(
            glyph,
            separator,
            $createTextNode("before "),
            ms,
            $createTextNode(" \\nd x\\nd* after"),
          ),
        );
      },
      { discrete: true },
    );
    editor.update(
      () => {
        // The literal `\nd x\nd*` tokenizes into a CharNode, so the rebuild as a whole is not a
        // no-op even though the milestone itself is untouched.
        expect($rebuildParas([$lastPara()], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const msNode = requireDefined(
        $lastPara()
          .getChildren()
          .find((n) => n.getType() === "ms"),
        "milestone must survive the rebuild (not be silently deleted)",
      );
      // Same node, moved (not recreated) — the sentinel-preservation path.
      expect(msNode.getKey()).toBe(msKey);
    });
  });
});

// A verse carrying altnumber/pubnumber re-tokenizes (verseNeedsSentinel: only unknownAttributes
// forces atomicity now); its \va/\vp display runs (attributeDisplay.utils.ts) ride as ordinary
// paragraph siblings after the verse, not children of it, so the fragment/signature builders
// recurse into them like any other content and fold the verse's own altnumber/pubnumber state in
// alongside (mirroring $milestoneDisplayRun's re-tokenizable branch). An untouched verse+run is
// still a genuine no-edit fixed point — now because re-tokenizing it reproduces the same bytes
// and the same state, not because the whole unit rides as an opaque sentinel.
describe("verses with \\va/\\vp display runs", () => {
  it("no-edit rebuild of a paragraph containing a verse with \\va/\\vp runs is a fixed point", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" altnumber="2" pubnumber="1b" />text after`),
    );
    editor.update(
      () => {
        expect($rebuildParas([$lastPara()], context)).toBe(false);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const verseIndex = children.findIndex((n) => n.getType() === "verse");
      expect(verseIndex).toBeGreaterThanOrEqual(0);
      // The \va/\vp runs still ride directly after the verse, unchanged by the no-op rebuild.
      expect(children[verseIndex + 1]?.getTextContent()).toBe("\\va");
      expect(children[verseIndex + 2]?.getTextContent()).toBe(`${NBSP}2`);
      expect(children[verseIndex + 3]?.getTextContent()).toBe("\\va*");
      expect(children[verseIndex + 4]?.getTextContent()).toBe("\\vp");
      expect(children[verseIndex + 5]?.getTextContent()).toBe(`${NBSP}1b`);
      expect(children[verseIndex + 6]?.getTextContent()).toBe("\\vp*");
    });
  });
});

describe("verses re-tokenize", () => {
  it("no-edit rebuild of a paragraph with `\\v 1 \\va 2\\va*` is a fixed point", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" altnumber="2" />text`));
    editor.update(() => expect($rebuildParas([$lastPara()], context)).toBe(false), {
      discrete: true,
    });
  });

  it("sid-bearing verses rebuild (no longer sentinels) and keep their sid when the number is unchanged", () => {
    const editor = loadEditor(
      usjFromUsx(`<verse number="1" style="v" sid="RUT 1:1" />text \\nd x\\nd* end`),
    );
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        // Not a sentinel: a bare sid carries no unknownAttributes.
        expect(verse.getUnknownAttributes()).toBeUndefined();
        // The literal `\nd x\nd*` elsewhere in the paragraph forces a genuine (non-fixed-point)
        // rebuild even though the verse itself is untouched.
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      content: [
        { type: "verse", number: "1", sid: "RUT 1:1" },
        "text ",
        { type: "char", marker: "nd", content: ["x"] },
        " end",
      ],
    });
  });

  // The verse's own text is retyped to a new number, but nothing has resynced the `__number`
  // field yet (the state $rebuildParas actually sees mid-edit) — the fragment re-tokenizes the
  // NEW number, and the old-paragraph snapshot for carry-over reads the STILL-STALE field, so
  // the old and new numbers genuinely disagree: no sid is synthesized for the renumbered verse.
  it("an edited verse number drops the stale sid", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" sid="RUT 1:1" />text`));
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        verse.setTextContent("\\v 2 ");
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({ content: [{ type: "verse", number: "2" }, "text"] });
    // No synthesis: the renumbered verse gets no sid at all, not even a different one.
    if (typeof para === "string") throw new Error("para is unexpectedly a string");
    const verseContent = requireDefined(
      para.content?.find((c) => typeof c !== "string" && c.type === "verse"),
      "verse not found in rebuilt para",
    );
    expect(verseContent).not.toHaveProperty("sid");
  });

  // The state-lags-run direction, applied to verse the same way a milestone's own sid/eid state
  // is folded into its fixed-point signature: a real in-place value edit keeps the triplet's
  // structural leading NBSP and changes only the value bytes, so the edited run text is
  // byte-identical to what re-tokenizing it would regenerate — only the verse's own stale
  // `altnumber` field can reveal the rebuild is not a no-op.
  it("editing a \\va value settles into the verse's altnumber", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" altnumber="2" />text`));
    editor.update(
      () => {
        const para = $lastPara();
        const children = para.getChildren();
        const verseIndex = children.findIndex((n) => n.getType() === "verse");
        const attributeNode = children[verseIndex + 2];
        if (!$isTextNode(attributeNode)) throw new Error("va attribute display run not found");
        attributeNode.setTextContent(`${NBSP}3`);
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = $firstPara(usj);
    expect(para).toMatchObject({
      content: [{ type: "verse", number: "1", altnumber: "3" }, "text"],
    });
  });

  it("deleting the whole \\va triplet settles the verse to no altnumber (does not resurrect)", () => {
    // The settle-on-departure endpoint for a deleted \va/\vp run: with the triplet's bytes absent
    // from the re-tokenized fragment, the rebuild must drop altnumber. The tokenizer already does
    // this — the verse just needs to actually rebuild (which the pend/settle wiring now drives in
    // the live app). This pins that the rebuild clears it and no triplet resurrects.
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" altnumber="2" />text`));
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        // The user deleted the whole `\va 2\va*` triplet (the verse's following siblings).
        const open = verse.getNextSibling();
        const value = open?.getNextSibling();
        const close = value?.getNextSibling();
        close?.remove();
        value?.remove();
        open?.remove();
        // altnumber is still "2" on the node here; the rebuild re-tokenizes the fragment (which no
        // longer carries `\va` bytes) and drops it.
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const verse = requireDefined(
        $lastPara().getChildren().find($isVerseNode),
        "verse node not found after rebuild",
      );
      expect(verse.getAltnumber()).toBeUndefined();
      // No triplet resurrected: the verse's next sibling is plain content, not a `\va` glyph.
      expect(verse.getNextSibling()?.getTextContent()).not.toBe("\\va");
    });
  });

  it("a whitespace-only verse glyph edit settles (glyph text folded into the fixed-point signature)", () => {
    // A VerseNode is a TextNode; the signature's verse branch shortcuts the generic text case, so
    // without folding the glyph text a whitespace-only edit that leaves number/altnumber/pubnumber
    // unchanged would compare equal to its canonical re-tokenization and refuse forever.
    const editor = loadEditor(usjFromUsx(`<verse number="2" style="v" />`));
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        verse.setTextContent(`${verse.getTextContent()} `); // extra trailing space, nothing else
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const verse = requireDefined(
        $lastPara().getChildren().find($isVerseNode),
        "verse node not found after rebuild",
      );
      // The glyph settled back to its canonical single-separator form.
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "2"));
    });
  });

  it("a verse with arbitrary unknownAttributes stays atomic", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" /> after \\nd x\\nd* end`));
    let verseKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse node not found");
        verse.setUnknownAttributes({ foo: "bar" });
        verseKey = verse.getKey();
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const verse = requireDefined(
        $lastPara().getChildren().find($isVerseNode),
        "verse node not found after rebuild",
      );
      // Same instance, moved (not recreated) — the sentinel-preservation path.
      expect(verse.getKey()).toBe(verseKey);
      expect(verse.getUnknownAttributes()).toEqual({ foo: "bar" });
    });
  });
});
