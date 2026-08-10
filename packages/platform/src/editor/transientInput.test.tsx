/**
 * `setTransientInput` — in-progress input an in-editor command surface owns. While declared, the
 * settled output excludes those bytes; the document keeps them for the surface to consume. The
 * declaration is re-verified at every read, and every way it can go stale must degrade to "ignored,
 * settle normally" — a visible phantom marker in one save, never silently dropped content.
 */
import { expectTier2FixedPoint, mountStandardViewEditor } from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $setSelection, TextNode } from "lexical";

const paletteUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: ["tell them"] },
    { type: "para", marker: "p", content: ["a second paragraph"] },
  ],
};

/** Every text string anywhere in `usj`, flattened — what the save would actually carry. */
function allText(usj: Usj | undefined): string {
  const out: string[] = [];
  const walk = (content: MarkerObject["content"]): void => {
    content?.forEach((entry) => {
      if (typeof entry === "string") out.push(entry);
      else walk(entry.content);
    });
  };
  walk(usj?.content);
  return out.join("|");
}

/** Every top-level `para` marker in `usj`, in order. */
function paraMarkers(usj: Usj | undefined): (string | undefined)[] {
  return (usj?.content ?? [])
    .filter((entry): entry is MarkerObject => typeof entry !== "string" && entry.type === "para")
    .map((entry) => entry.marker);
}

/** The first text node whose content includes `needle`. */
function $textContaining(needle: string): TextNode {
  const node = $getRoot()
    .getAllTextNodes()
    .find((text) => text.getTextContent().includes(needle));
  if (!node) throw new Error(`no text node containing ${JSON.stringify(needle)}`);
  return node;
}

/** Type `run` at the end of the first paragraph's body and leave the caret right after it —
 * the exact shape a passive palette session produces, one keystroke at a time. */
async function typePaletteLiteral(
  lexical: Awaited<ReturnType<typeof mountStandardViewEditor>>["lexical"],
  run: string,
): Promise<void> {
  await act(async () => {
    lexical.update(() => {
      const body = $textContaining("tell them");
      const typed = `tell them${run}`;
      body.setTextContent(typed);
      body.select(typed.length, typed.length);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("setTransientInput — declared input is excluded from settled output", () => {
  it("omits the declared run and still yields a Tier-2 fixed point", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("\\q1");
    expect(allText(settled)).toContain("tell them");
    // No phantom paragraph: the document settles as if the trigger had never been typed.
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
    expectTier2FixedPoint(settled ?? { type: "USJ", version: "3.1", content: [] });

    // The document still holds the literal for the palette's apply to consume.
    lexical.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\q1");
    });
  });

  it("settles the literal into structure once the declaration is cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "p"]);

    act(() => ref.current?.setTransientInput(undefined));

    // Undeclared, the same bytes mean what they say: a new `\q1` paragraph.
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("tracks the filter across keystrokes when the host re-declares each time", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\" }));
    await typePaletteLiteral(lexical, "\\");
    expect(allText(ref.current?.getUsj())).not.toContain("\\");

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q" }));
    await typePaletteLiteral(lexical, "\\q");
    expect(allText(ref.current?.getUsj())).not.toContain("\\q");

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");
    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("\\q");
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
    expectTier2FixedPoint(settled ?? { type: "USJ", version: "3.1", content: [] });
  });
});

describe("setTransientInput — a stale declaration is ignored, never trusted", () => {
  it("ignores it when the caret has moved off the declared node", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => {
        $textContaining("a second paragraph").select(0, 0);
      });
      await Promise.resolve();
    });

    // Nothing dropped: the bytes settle to what they say, phantom paragraph and all.
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("ignores it when the bytes before the caret are not the declared run", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    // The user typed one more character than the host declared.
    await typePaletteLiteral(lexical, "\\q12");

    // Nothing dropped: the whole run settles to what it says. The extra "2" is not left behind as
    // dangling literal content either — the tokenizer's marker-name scan consumes every
    // non-separator character after the backslash, so "\q12" forms its own "q12" marker rather than
    // a "q1" marker with a stray "2" trailing it. If the declaration had wrongly been honored
    // (truncating to the declared "\q1"), this paragraph would instead have settled to plain literal
    // text "tell them2" with no third paragraph at all — the assertion below rules that out.
    const settled = ref.current?.getUsj();
    expect(allText(settled)).toContain("tell them");
    expect(paraMarkers(settled)).toEqual(["p", "q12", "p"]);
  });

  it("ignores it when there is no caret at all", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => $setSelection(null));
      await Promise.resolve();
    });

    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("ignores it when the literal is already gone and the host never cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    // The palette's apply consumed the literal; the host forgot to clear the declaration.
    await act(async () => {
      lexical.update(() => {
        const body = $textContaining("tell them");
        body.setTextContent("tell them");
        body.select(9, 9);
      });
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    expect(allText(settled)).toContain("tell them");
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
  });
});

describe("setTransientInput — the apply hand-off", () => {
  it("matches the real settle once the literal is consumed and the declaration cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    // Apply: the literal prefix is removed and the marker is applied structurally, then the
    // surface releases its claim — exactly the order the palette's apply path uses.
    await act(async () => {
      lexical.update(() => {
        const body = $textContaining("tell them");
        body.setTextContent("tell them");
        body.select(9, 9);
      });
      await Promise.resolve();
    });
    act(() => {
      ref.current?.setTransientInput(undefined);
      ref.current?.formatPara("q1");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = lexical.getRootElement();
    if (!root) throw new Error("editor root not found");
    act(() => root.blur());
    const virtualUsj = ref.current?.getUsj();

    act(() => ref.current?.commitPendingMarkerEdits());
    expect(virtualUsj).toEqual(ref.current?.getUsj());
  });
});
