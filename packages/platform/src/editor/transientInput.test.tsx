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
import { getPendedDisplayOwners } from "shared";

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

  it("verifies only the bytes before the caret, leaving the rest of the sentence untouched", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "second" }));

    // The palette can open mid-sentence: the caret sits right after "second", with " paragraph"
    // still ahead of it on the SAME node — verification must match against the bytes ending at the
    // caret only, never the whole node's text.
    await act(async () => {
      lexical.update(() => {
        $textContaining("a second paragraph").select(8, 8);
      });
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("second");
    expect(allText(settled)).toContain("paragraph");
  });
});

describe("setTransientInput — forces its paragraph into the settle scopes even with nothing pended", () => {
  it("excludes the run when pendedKeys is empty, and restores it once the declaration clears", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);

    // No marker literal typed, and no mutation at all — a caret move alone never dirties a
    // TextNode, so the marker-edit engine's transform never runs and nothing pends. This reaches
    // "pendedKeys empty, declaration verified" without ever touching the pend/resolve machinery —
    // the simplest state the owner-named property can hold in.
    await act(async () => {
      lexical.update(() => {
        $textContaining("tell them").select(9, 9);
      });
      await Promise.resolve();
    });
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "them" }));
    expect(getPendedDisplayOwners(lexical)?.size ?? 0).toBe(0);

    // Forced: this paragraph is otherwise a no-op read (nothing pended in it, or anywhere else, at
    // all), yet the verified declaration alone puts it in the settle scopes and its bytes come out.
    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("them");
    expect(allText(settled)).toContain("tell");

    // Inverse, same pended-empty state: cleared, the bytes are exactly what they always were.
    act(() => ref.current?.setTransientInput(undefined));
    expect(allText(ref.current?.getUsj())).toContain("tell them");
  });
});

describe("setTransientInput — a stale declaration is ignored, never trusted", () => {
  it("ignores it when the caret moves to a node whose bytes don't end with the declared run", async () => {
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

  it("falls back to the last-known caret when there is no live selection, honoring the declaration", async () => {
    // A real cross-frame blur (e.g. a palette overlay click, which lives outside this editor's
    // iframe) can null Lexical's live selection before a getUsj() read races it — the same shape
    // as `$setSelection(null)` below. Live-verified: this is the pre-fix corruption shape (typing
    // `\f`, then a window blur before the debounced save's getUsj() read), and the declared run
    // must still be excluded from the save via the remembered caret, not just "settle normally".
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => $setSelection(null));
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("\\q1");
    // No phantom paragraph: honored via the remembered caret exactly as if the selection had
    // never gone missing.
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
  });

  it("still ignores it when the remembered caret no longer matches, even through the fallback", async () => {
    // The fallback is not "trust any remembered caret" — it re-applies the SAME byte-exact check.
    // Move the caret to a DIFFERENT node first (updating what gets remembered), then lose the live
    // selection: the remembered caret no longer ends with the declared run, so the fallback must
    // fail the same way a live mismatch already does.
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => {
        $textContaining("a second paragraph").select(0, 0);
      });
      await Promise.resolve();
    });
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
