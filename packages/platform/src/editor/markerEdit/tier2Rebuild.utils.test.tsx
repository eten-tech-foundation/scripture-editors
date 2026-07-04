import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { $isParaNode, getMarker as bundledGetMarker, ParaNode, TypedMarkNode } from "shared";
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

  // Phase 4 (Task 4): the old guard refused ANY unknown para marker outright. The guard is
  // now relaxed — unknown/custom.sty para markers round-trip, because the tokenizer (Task 3)
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
});

describe("unknown-para rebuild round-trip (Phase 4)", () => {
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
