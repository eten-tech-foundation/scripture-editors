/**
 * Rejoining an unknown-marker paragraph split when its marker is corrected to an inline marker.
 *
 * Typing a terminated unknown marker (`\asdf `) mid-paragraph splits the paragraph — the
 * tokenizer defaults an unknown token to a paragraph in body context (PT9
 * DetermineUnknownTokenType), so the split is correct while the marker is block-shaped. When the
 * user then corrects the marker to a KNOWN char-kind one (`\w`), the split's only reason to exist
 * is gone: in the file, `\p some` + newline + `\w stuff` is ONE paragraph (a newline before an
 * inline marker is ordinary whitespace). Re-tokenizing the artifact paragraph in isolation
 * instead hands the tokenizer content with a leading inline marker, which forces a fabricated
 * default `\p` wrapper — a paragraph the user never typed. The settle scope must widen to include
 * the PREVIOUS paragraph so re-tokenization rejoins them.
 *
 * The guard half: only the unknown-split artifact rejoins. A paragraph whose own marker is a
 * KNOWN paragraph marker (a user-authored `\p`/`\q1`) has real blockness — neither renaming its
 * glyph to a char marker nor any unrelated settle may merge it into its predecessor.
 *
 * The rename's sibling case: the marker stops being a marker AT ALL. Deleting the `\` of an
 * unknown paragraph's glyph leaves plain text (`asdf`) with no marker interpretation — in the
 * file, `\p stuff` + newline + `asdf` is ONE paragraph (a line without a leading marker continues
 * the previous paragraph, PT9's token join). The same widened `[previous, para]` scope applies;
 * re-tokenizing the artifact alone instead fabricates a default `\p` around the now-plain word.
 * An unknown paragraph LOADED from file (not a split artifact) rejoins by the same rule — the
 * joined bytes are what the tokenizer sees — and with no paragraph predecessor the degraded
 * bytes take the tokenizer's body-context default (`\p`), pinned against the tokenizer directly.
 */
import {
  $retypeGlyph,
  requireDefined,
  testEnvironment,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { mountStandardViewEditor } from "../settledGetUsj.test-helpers";
import { act } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  getPendedDisplayOwners,
  NBSP,
  ParaNode,
  usfmFragmentToUsjContent,
} from "shared";

/** The editor's current USJ, through the production adaptor. */
function usjOf(editor: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
}

/** Seeds `\p some stuff` with its editable `[glyph, separator]` prefix. */
function $seedParagraph(): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createMarkerTrailingSeparator(),
      $createTextNode("some stuff"),
    ),
  );
}

/** Seeds `\p stuff` with its editable `[glyph, separator]` prefix. */
function $seedParagraph2(): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createMarkerTrailingSeparator(),
      $createTextNode("stuff"),
    ),
  );
}

function $typeAtCaret(text: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
  selection.insertText(text);
}

/** The n-th ParaNode of the root (throws when absent). */
function $paraAt(index: number): ParaNode {
  return requireDefined(
    $getRoot().getChildren().filter($isParaNode)[index],
    `para ${index} missing`,
  );
}

describe("correcting an unknown block marker to an inline marker", () => {
  it("rejoins the split paragraph: \\asdf corrected to \\w settles to ONE \\p some \\w stuff", async () => {
    const { editor } = await testEnvironment($seedParagraph);

    // Type `\asdf ` mid-paragraph, character by character, with the caret after "some ".
    await act(async () =>
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => !$isMarkerNode(node) && node.getTextContent().includes("some stuff"));
        if (!$isTextNode(body)) throw new Error("seed body text not found");
        body.select("some ".length, "some ".length);
      }),
    );
    for (const ch of "\\asdf ") await act(async () => editor.update(() => $typeAtCaret(ch)));

    // Correct so far: the terminated unknown marker split the paragraph (block-shaped default).
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("asdf");
      expect(paras[1].getTextContent()).toContain("stuff");
    });

    // Edit the glyph `asdf` -> `w` (a known char/inline marker), live at the caret.
    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(1).getChildren().filter($isMarkerNode).at(0),
          "unknown paragraph glyph missing",
        );
        $retypeGlyph(glyph, "\\w");
      }),
    );
    // Depart: the caret leaves the glyph for the first paragraph's body, which settles the pend.
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) =>
              $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent().includes("some"),
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve()); // flush the deferred caret-departure resolve

    // The paragraph REJOINS its predecessor: the split existed only because the marker was
    // block-shaped, and its leading marker is now inline.
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      expect(paras[0].getMarker()).toBe("p");
      const char = paras[0].getChildren().find($isCharNode);
      expect(char?.getMarker()).toBe("w");
      expect(char?.getTextContent()).toContain("stuff");
    });
    // Byte-exactly what re-tokenizing `\p some \w stuff` produces — the space after "some"
    // included ("some " + the char span, no fabricated `\p`).
    expect(usjOf(editor)?.content).toEqual(usfmFragmentToUsjContent("\\p some \\w stuff", {}));
  });

  it("keeps a user-authored \\p paragraph its own scope when its glyph is retyped to \\w", async () => {
    // Renaming a REAL paragraph marker's glyph to a char marker is the same Tier-2 route, but
    // the paragraph's blockness is user-authored — it must NOT merge into its predecessor.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("one"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("two"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(1).getChildren().filter($isMarkerNode).at(0),
          "second paragraph glyph missing",
        );
        $retypeGlyph(glyph, "\\w");
      }),
    );
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) => $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent() === "one",
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve());

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).not.toContain("two");
      expect(paras[1].getMarker()).toBe("p");
    });
  });

  it("rejoins when the marker stops being a marker: deleting \\asdf's backslash settles to ONE \\p stuff asdf", async () => {
    const { editor } = await testEnvironment($seedParagraph2);

    // Type `\asdf ` at the end of "stuff", character by character.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => !$isMarkerNode(node) && node.getTextContent().includes("stuff"));
        if (!$isTextNode(body)) throw new Error("seed body text not found");
        body.select(body.getTextContentSize(), body.getTextContentSize());
      }),
    );
    for (const ch of "\\asdf ") await act(async () => editor.update(() => $typeAtCaret(ch)));

    // Correct so far: the terminated unknown marker split off its own (empty) paragraph.
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("asdf");
    });

    // Delete the `\` of the `\asdf` glyph, live at the caret: the glyph's bytes are now the
    // plain word `asdf` — no marker interpretation remains.
    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(1).getChildren().filter($isMarkerNode).at(0),
          "unknown paragraph glyph missing",
        );
        $retypeGlyph(glyph, "asdf");
      }),
    );
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) =>
              $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent().includes("stuff"),
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve()); // flush the deferred caret-departure resolve

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      expect(paras[0].getMarker()).toBe("p");
    });
    // Byte-exactly what re-tokenizing the joined displayed bytes produces: `\p stuff` + the
    // degraded word `asdf` + the split's separator space (paragraph-final, which the USFM
    // writer's newline consumes on save).
    expect(usjOf(editor)?.content).toEqual(usfmFragmentToUsjContent("\\p stuff asdf ", {}));
  });

  it("does not merge when a REAL \\p glyph's backslash is deleted (user-authored blockness)", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("one"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("two"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(1).getChildren().filter($isMarkerNode).at(0),
          "second paragraph glyph missing",
        );
        $retypeGlyph(glyph, "p");
      }),
    );
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) => $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent() === "one",
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve());

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).not.toContain("two");
      expect(paras[1].getTextContent()).toContain("two");
    });
  });

  it("rejoins a LOADED unknown paragraph the same way when its backslash is deleted", async () => {
    // Not a split artifact — the unknown paragraph was authored in the file (`\p stuff` newline
    // `\asdf more`). Deleting the `\` leaves `asdf more` with no marker: in the file that line
    // continues the previous paragraph, so the same rejoin applies — the joined bytes are what
    // the tokenizer sees.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("stuff"),
        ),
        $createParaNode("asdf").append(
          $createMarkerNode("asdf"),
          $createMarkerTrailingSeparator(),
          $createTextNode("more"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(1).getChildren().filter($isMarkerNode).at(0),
          "unknown paragraph glyph missing",
        );
        $retypeGlyph(glyph, "asdf");
      }),
    );
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) =>
              $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent() === "stuff",
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve());

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
    });
    expect(usjOf(editor)?.content).toEqual(usfmFragmentToUsjContent("\\p stuff asdf more", {}));
  });

  it("degrades to the tokenizer's default \\p when the unknown paragraph has no predecessor", async () => {
    // No paragraph to rejoin: the degraded bytes re-tokenize alone, and the tokenizer's
    // body-context default wraps them in `\p` — pinned against the tokenizer on the same bytes.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("asdf").append(
          $createMarkerNode("asdf"),
          $createMarkerTrailingSeparator(),
          $createTextNode("more"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("park here"),
        ),
      );
    });

    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined(
          $paraAt(0).getChildren().filter($isMarkerNode).at(0),
          "unknown paragraph glyph missing",
        );
        $retypeGlyph(glyph, "asdf");
      }),
    );
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(1)
          .getChildren()
          .find(
            (node) =>
              $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent() === "park here",
          );
        if (!$isTextNode(body)) throw new Error("parking paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve());

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getMarker()).toBe("p");
      expect(paras[1].getTextContent()).toContain("park here");
    });
    expect(usjOf(editor)?.content?.slice(0, 1)).toEqual(usfmFragmentToUsjContent("asdf more", {}));
  });

  it("does not merge a genuine \\p whose first content child is a \\w span on an unrelated settle", async () => {
    // The artifact detection must key on the paragraph's own (unknown) marker, never on "the
    // paragraph's content starts with a char span" — this shape settles all the time.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("one"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createCharNode("w").append(
            $createMarkerNode("w"),
            $createTextNode(`${NBSP}word`),
            $createMarkerNode("w", "closing"),
          ),
          $createTextNode(" tail"),
        ),
      );
    });

    // An unrelated settle of the second paragraph: a terminated `\nd x\nd*` literal typed into
    // its tail re-tokenizes the paragraph in the same commit.
    await act(async () =>
      editor.update(() => {
        const tail = $paraAt(1)
          .getChildren()
          .find((node) => $isTextNode(node) && node.getTextContent() === " tail");
        if (!$isTextNode(tail)) throw new Error("tail text not found");
        const typed = " tail \\nd x\\nd*";
        tail.setTextContent(typed);
        tail.select(typed.length, typed.length);
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).toBe(`\\p${NBSP}one`);
      expect(paras[1].getMarker()).toBe("p");
      const chars = paras[1].getChildren().filter($isCharNode);
      expect(chars.map((char) => char.getMarker())).toEqual(["w", "nd"]);
    });
  });
});

/** `\p stuff` plus a paragraph to park the caret in, through the public `Editor`. */
const rejoinUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: ["stuff"] },
    { type: "para", marker: "p", content: ["park here"] },
  ],
};

/** The n-th ParaNode's leading glyph. */
function $glyphOfPara(index: number) {
  return requireDefined(
    $paraAt(index).getChildren().filter($isMarkerNode).at(0),
    `paragraph ${index} glyph missing`,
  );
}

describe("the rejoin reaches the SAVE path, in the SAME settle the screen rejoins in", () => {
  it("never serializes the fabricated \\p — not even while the degraded glyph is still pending", async () => {
    // The screen and the file must agree (invariants IV): `getUsj()` runs the SAME settle
    // computation the caret-departure settle runs, so a host save landing anywhere in the pend
    // window — between the user deleting the `\` and the settle — must already read the rejoined
    // document. When it does not, the fabricated `\p` reaches the file and only a LATER settle
    // takes it back out.
    const { ref, lexical } = await mountStandardViewEditor(rejoinUsj);
    const oracle = usfmFragmentToUsjContent("\\p stuff asdf ", {});

    await act(async () => {
      lexical.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => !$isMarkerNode(node) && node.getTextContent().includes("stuff"));
        if (!$isTextNode(body)) throw new Error("seed body text not found");
        body.select(body.getTextContentSize(), body.getTextContentSize());
      });
      await Promise.resolve();
    });
    for (const ch of "\\asdf ") {
      await act(async () => {
        lexical.update(() => $typeAtCaret(ch));
        await Promise.resolve();
      });
    }

    // Delete the `\`, and read the save path INSIDE the same act() — the pend only survives up to
    // this commit (see settledGetUsj.test.tsx's own note on reading the virtual settle early).
    let pendedUsj: Usj | undefined;
    await act(async () => {
      lexical.update(() => $retypeGlyph($glyphOfPara(1), "asdf"));
      await Promise.resolve();
      // Vacuity guard: with nothing pending, `getUsj()` takes its cached fast path and the read
      // below would prove nothing about the settle computation at all.
      expect(getPendedDisplayOwners(lexical)?.size).toBeGreaterThan(0);
      pendedUsj = ref.current?.getUsj();
    });
    expect(pendedUsj?.content.slice(2, 3)).toEqual(oracle);

    // Depart: ONE settle, and the screen agrees with what the save path already reported.
    await act(async () => {
      lexical.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => !$isMarkerNode(node) && node.getTextContent().includes("park here"));
        if (!$isTextNode(body)) throw new Error("parking paragraph body not found");
        body.select(0, 0);
      });
      await Promise.resolve();
    });
    await act(async () => Promise.resolve());

    lexical.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2); // the rejoined paragraph plus the parking paragraph
      expect(paras[0].getMarker()).toBe("p");
      expect(paras[0].getTextContent()).toContain("asdf");
    });
    expect(ref.current?.getUsj()?.content.slice(2, 3)).toEqual(oracle);
  });
});

describe("an unknown split whose glyph regains a marker interpretation that is not block-shaped", () => {
  // TJ's repro: `\wj things\wj*` mid-paragraph, then the separator space deleted so the bytes read
  // `\wjthings` — which renames the marker to an unknown one and correctly splits off its own
  // paragraph (the closer gains the separator, becoming an unmatched `\wj*`). Typing the space
  // BACK makes the leading glyph name `wj` again — a CHAR marker, which is not block-shaped, so
  // the split's only reason to exist is gone and the content must rejoin the previous paragraph.
  /** The paragraph pair exactly as the first settle leaves it. */
  const splitUsj: Usj = {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1" },
      { type: "para", marker: "p", content: ["some "] },
      {
        type: "para",
        marker: "wjthings",
        content: [{ type: "unmatched", marker: "wj*" }, "stuff"],
      },
      { type: "para", marker: "p", content: ["park here"] },
    ],
  };

  it("rejoins the previous paragraph instead of fabricating a \\p around the char span", async () => {
    const { ref, lexical } = await mountStandardViewEditor(splitUsj);

    await act(async () => {
      lexical.update(() => $retypeGlyph($glyphOfPara(1), "\\wj things"));
      await Promise.resolve();
    });
    await act(async () => {
      lexical.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => !$isMarkerNode(node) && node.getTextContent().includes("park here"));
        if (!$isTextNode(body)) throw new Error("parking paragraph body not found");
        body.select(0, 0);
      });
      await Promise.resolve();
    });
    await act(async () => Promise.resolve());

    lexical.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      // The artifact paragraph is gone: the rejoined paragraph plus the parking paragraph.
      expect(paras).toHaveLength(2);
      expect(paras[0].getMarker()).toBe("p");
      const char = paras[0].getChildren().find($isCharNode);
      expect(char?.getMarker()).toBe("wj");
      expect(paras[0].getTextContent()).toContain("stuff");
    });
    // Byte-exactly the tokenizer over the joined displayed bytes.
    expect(ref.current?.getUsj()?.content.slice(2, 3)).toEqual(
      usfmFragmentToUsjContent("\\p some  \\wj things \\wj*stuff", {}),
    );
  });

  it("does NOT rejoin when the glyph names a genuine BLOCK marker (the split is still authored)", async () => {
    // Same artifact shape, but the glyph is retyped to a real paragraph marker. Its blockness is
    // now the user's, not the unknown-token default's, so the paragraphs must stay apart.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("some"),
        ),
        $createParaNode("wjthings").append(
          $createMarkerNode("wjthings"),
          $createMarkerTrailingSeparator(),
          $createTextNode("stuff"),
        ),
      );
    });

    await act(async () => editor.update(() => $retypeGlyph($glyphOfPara(1), "\\q1 things")));
    await act(async () =>
      editor.update(() => {
        const body = $paraAt(0)
          .getChildren()
          .find(
            (node) => $isTextNode(node) && !$isMarkerNode(node) && node.getTextContent() === "some",
          );
        if (!$isTextNode(body)) throw new Error("first paragraph body not found");
        body.select(0, 0);
      }),
    );
    await act(async () => Promise.resolve());

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[0].getTextContent()).not.toContain("stuff");
    });
  });
});
