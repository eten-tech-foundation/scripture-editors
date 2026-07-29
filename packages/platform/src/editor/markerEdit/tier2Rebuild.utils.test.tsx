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
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  getMarker as bundledGetMarker,
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

  it("carries a milestone's display run through the rebuild", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" /><ms style="ts-s" sid="ts.RUT.1" />text \\nd x\\nd* end`,
      ),
    );
    let msKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        const msNode = requireDefined(
          para.getChildren().find((n) => n.getType() === "ms"),
          "milestone node not found",
        );
        msKey = msNode.getKey();
        expect($rebuildParas([para], context)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex((n) => n.getType() === "ms");
      expect(children[msIndex]?.getKey()).toBe(msKey);
      // display glyphs survived: opening \ts-s, attribute text, self-closing \*
      expect(children[msIndex + 1]?.getTextContent()).toBe("\\ts-s");
      expect(children[msIndex + 2]?.getTextContent()).toContain('sid="ts.RUT.1"');
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
