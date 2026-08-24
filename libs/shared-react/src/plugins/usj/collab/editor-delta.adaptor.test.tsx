// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateGen1v1Standard,
  editorStateWithUnknownItems,
  editorStateWithUnknownItemsNoTable,
  opsGen1v1,
  opsGen1v1Editable,
  opsGen1v1ImpliedPara,
  opsGen1v1ImpliedParaEmpty,
  opsGen1v1Nonstandard,
  opsGen1v1Standard,
  opsWithUnknownItems,
  opsWithUnknownItemsNoTable,
} from "../../../../../../packages/utilities/src/converters/usj/converter-test.data";
import { $createImmutableNoteCallerNode } from "../../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import { baseTestEnvironment } from "../react-test.utils";
import { DeltaOp, isInsertEmbedOpOfType, LF } from "./delta-common.utils";
import { $getParticularNodeOps, getEditorDelta } from "./editor-delta.adaptor";
import { $setState, $createTextNode, $getRoot, LexicalNode } from "lexical";
import { $dfs } from "@lexical/utils";
import {
  $createAttributeRunNode,
  $createBookNode,
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createImpliedParaNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  $createUnknownNode,
  $createCursorPlaceholderNode,
  $createVerseNode,
  $isNoteNode,
  charIdState,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  GENERATOR_NOTE_CALLER,
  getEditableCallerText,
  getVisibleOpenMarkerText,
  NBSP,
  segmentState,
  textTypeState,
} from "shared";

describe("getEditorDelta", () => {
  it("should return an empty array for an empty editor state", async () => {
    const { editor } = await testEnvironment();

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([]);
  });

  it("should return the correct ops for a book", async () => {
    const { editor } = await testEnvironment(() => {
      const bookText = $createTextNode("John ");
      $setState(bookText, segmentState, "id_1");
      $getRoot().append($createBookNode("JHN").append(bookText));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John ", attributes: { segment: "id_1" } },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
    ]);
  });

  it("should return the correct ops for a chapter", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createImmutableChapterNode("3"));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([{ insert: { chapter: { style: "c", number: "3" } } }]);
  });

  it("should return the correct ops for a book and chapter", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createBookNode("JHN").append($createTextNode("John ")),
        $createImmutableChapterNode("3"),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John " },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
      { insert: { chapter: { style: "c", number: "3" } } },
    ]);
  });

  it("should return the correct ops for a verse and implied para", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createImpliedParaNode().append($createImmutableVerseNode("16")));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: { verse: { style: "v", number: "16" } } },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for a milestone and para", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append($createParaNode("q1").append($createMilestoneNode("ts-s", "TS1")));
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: { milestone: { style: "ts-s", sid: "TS1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  // Hand-built directly (rather than via the forward adaptor) to pin the ops exclusion in
  // isolation: the adaptor always builds this run wrapped now, so this is the only shape the ops
  // builder needs to exclude — a verse's own following-sibling \va/\vp glyphs and value, not
  // inside a note or char span, must never leak into content ops since altnumber/pubnumber
  // already flow through the verse's own embed op.
  it("excludes a verse's \\va/\\vp display runs from canonical ops when wrapped in AttributeRunNode (dual-read)", async () => {
    const ops = await getOpsFor(() => {
      const verse = $createVerseNode("1", "\\v 1 ", undefined, "2", "1b");
      const vaWrapper = $createAttributeRunNode("va");
      const vaValue = $createTextNode(`${NBSP}2`);
      $setState(vaValue, textTypeState, "attribute");
      vaWrapper.append($createMarkerNode("va"), vaValue, $createMarkerNode("va", "closing"));
      const vpWrapper = $createAttributeRunNode("vp");
      const vpValue = $createTextNode(`${NBSP}1b`);
      $setState(vpValue, textTypeState, "attribute");
      vpWrapper.append($createMarkerNode("vp"), vpValue, $createMarkerNode("vp", "closing"));
      $getRoot().append($createParaNode("q1").append(verse, vaWrapper, vpWrapper));
    });

    expect(ops).toEqual([
      { insert: { verse: { style: "v", number: "1", altnumber: "2", pubnumber: "1b" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("excludes a milestone's display run from canonical ops when wrapped in AttributeRunNode (dual-read), including a glyph pair with no attribute text between them", async () => {
    // The no-attribute-text shape is one a sibling-adjacency check couldn't catch on its own
    // (neither glyph has an attribute-tagged sibling to key off of) — the ANCESTRY check
    // ($hasAttributeRunAncestor) is what excludes it here.
    const ops = await getOpsFor(() => {
      const ms = $createMilestoneNode("qt-s", "q1");
      const wrapper = $createAttributeRunNode("milestone");
      wrapper.append($createMarkerNode("qt-s", "opening"), $createMarkerNode("", "selfClosing"));
      $getRoot().append($createParaNode("q1").append(ms, wrapper));
    });

    expect(ops).toEqual([
      { insert: { milestone: { style: "qt-s", sid: "q1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("excludes an UNTAGGED text node riding inside an AttributeRunNode wrapper — ancestry alone, no textType tag needed", async () => {
    // A conscious, tested call (not an accidental side effect): $handleTextNodes' ancestry check
    // ($hasAttributeRunAncestor) excludes a wrapper's op contribution ENTIRELY, including any
    // plain text inside it that carries no "attribute" state tag at all — the wrapper is an
    // engine-owned presentation region (AttributeRunNode.ts), so anything riding inside it is
    // presentation, not content, regardless of its own tagging. A real \va/\vp/milestone run never
    // actually contains untagged text (its value piece is always tagged "attribute"), but the
    // exclusion is ancestry-based, not tag-based, so this hand-built shape pins the intended
    // semantics directly rather than relying on it only ever being exercised incidentally.
    const ops = await getOpsFor(() => {
      const ms = $createMilestoneNode("qt-s", "q1");
      const wrapper = $createAttributeRunNode("milestone");
      const untagged = $createTextNode("stray"); // no textType "attribute" state
      wrapper.append(
        $createMarkerNode("qt-s", "opening"),
        untagged,
        $createMarkerNode("", "selfClosing"),
      );
      $getRoot().append($createParaNode("q1").append(ms, wrapper));
    });

    expect(ops).toEqual([
      { insert: { milestone: { style: "qt-s", sid: "q1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("excludes a nested verse's \\va glyphs from a cross-verse char span's ops (byte-identical to no runs)", async () => {
    // Legal ≤3.0: a char span (\wj) crosses a verse boundary, so the VerseNode — and its \va
    // attribute run — genuinely nests inside the CharNode. That run (wrapped in an
    // AttributeRunNode, the only shape the adaptor builds now) describes the VERSE, not the char
    // span, so it must stay out of content ops. altnumber already rides on the verse's own embed
    // op, so adding the display run must not change the ops at all — ANCESTRY
    // ($hasAttributeRunAncestor) is what excludes it here, regardless of nesting inside the span.
    // Both the relative (withRunsOps === bareOps) and literal shape are pinned.
    const withRunsOps = await getOpsFor(() => {
      const verse = $createVerseNode("2", "\\v 2 ", undefined, "3", undefined);
      const vaWrapper = $createAttributeRunNode("va");
      const vaValue = $createTextNode(`${NBSP}3`);
      $setState(vaValue, textTypeState, "attribute");
      vaWrapper.append($createMarkerNode("va"), vaValue, $createMarkerNode("va", "closing"));
      $getRoot().append(
        $createParaNode("q1").append(
          $createCharNode("wj").append(
            $createMarkerNode("wj"),
            $createTextNode("before "),
            verse,
            vaWrapper,
            $createTextNode("after"),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });

    const bareOps = await getOpsFor(() => {
      const verse = $createVerseNode("2", "\\v 2 ", undefined, "3", undefined);
      $getRoot().append(
        $createParaNode("q1").append(
          $createCharNode("wj").append(
            $createMarkerNode("wj"),
            $createTextNode("before "),
            verse,
            $createTextNode("after"),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });

    expect(withRunsOps).toEqual(bareOps);
    expect(bareOps).toEqual([
      { insert: "\\wjbefore ", attributes: { char: { style: "wj" } } },
      { insert: { verse: { style: "v", number: "2", altnumber: "3" } } },
      { insert: "after\\wj*", attributes: { char: { style: "wj" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("excludes a LOOSE \\va run glyph from content ops", async () => {
    // A run's pieces ride wrapped at rest, but caret-grace, an undo stack, and a
    // collab-materialized bare verse all leave them loose for at least one commit. A loose glyph
    // is exactly as much engine-owned display as a wrapped one, so its bytes must never reach the
    // ops stream.
    const ops = await getOpsFor(() => {
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
      const value = $createTextNode(`${NBSP}2`);
      $setState(value, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          verse,
          $createMarkerNode("va", "opening"),
          value,
          $createMarkerNode("va", "closing"),
          $createTextNode("In the beginning"),
        ),
      );
    });

    const inserted = ops.map((op) => (typeof op.insert === "string" ? op.insert : "")).join("");
    expect(inserted).not.toContain("\\va");
    expect(inserted).toContain("In the beginning");
  });

  it("excludes a \\va run's glyphs from content ops even when its AttributeRunNode wrapper is separated from the owning verse by intervening content", async () => {
    // The registry's per-kind `ownerOf` chain walk requires the wrapper to sit DIRECTLY after its
    // verse — it gives up at the first non-run-piece sibling — so an intervening node between the
    // owner and its wrapper (a remote insert landing at that boundary, an undo stack, a mid-edit
    // tree) makes $isDisplayRunPiece alone miss it. This pins the OUTCOME (an unanchored wrapper's
    // glyphs never reach ops), not a single mechanism: two independent checks in $handleTextNodes
    // currently uphold it — the gate's own $hasAttributeRunAncestor arm, and (a few lines further
    // down) `isNodeAttributeText`'s unconditional ancestor walk, which alone already excludes any
    // TextNode with an AttributeRunNode ancestor regardless of adjacency. Deleting the gate's arm
    // alone does NOT turn this red — that was verified directly — because the second check still
    // catches it; only removing BOTH would.
    const ops = await getOpsFor(() => {
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
      const vaWrapper = $createAttributeRunNode("va");
      const vaValue = $createTextNode(`${NBSP}2`);
      $setState(vaValue, textTypeState, "attribute");
      vaWrapper.append(
        $createMarkerNode("va", "opening"),
        vaValue,
        $createMarkerNode("va", "closing"),
      );
      $getRoot().append(
        $createParaNode("p").append(
          verse,
          $createTextNode("between "), // intervening content — breaks wrapper/owner adjacency
          vaWrapper,
          $createTextNode("In the beginning"),
        ),
      );
    });

    const inserted = ops.map((op) => (typeof op.insert === "string" ? op.insert : "")).join("");
    expect(inserted).not.toContain("\\va");
    expect(inserted).toContain("between ");
    expect(inserted).toContain("In the beginning");
  });

  it("excludes an editable verse's own glyph text from content ops (only real content flows)", async () => {
    // \v 1 the first verse — an editable VerseNode's own `__text` ("\v 1 ") is the marker
    // glyph (VerseNode extends TextNode so it can sit inline for caret placement), not
    // content. The verse is already conveyed by its own embed op ($getVerseOp); the glyph
    // text must not ALSO surface as a content text op, or it would double-count the verse
    // in the OT content length (once as the embed's implicit 1 unit, once as 5 leaked
    // glyph bytes) and shift every offset that follows it.
    const ops = await getOpsFor(() => {
      const verse = $createVerseNode("1", "\\v 1 ");
      $getRoot().append($createParaNode("p").append(verse, $createTextNode("the first verse")));
    });

    expect(ops).toEqual([
      { insert: { verse: { style: "v", number: "1" } } },
      { insert: "the first verse" },
      { insert: LF, attributes: { para: { style: "p" } } },
    ]);

    // No content op may carry verse glyph bytes, and the total inserted text length must
    // equal the real content exactly — no leaked glyph length inflating the content span.
    const textOps = ops.filter((op): op is { insert: string } => typeof op.insert === "string");
    expect(textOps.some((op) => op.insert.includes("\\v"))).toBe(false);
    const textLength = textOps.reduce((sum, op) => sum + op.insert.length, 0);
    expect(textLength).toBe("the first verse".length + LF.length);
  });

  it("excludes the paragraph's own marker-prefix glyph and separator from content ops", async () => {
    // [MarkerNode "\p"][NBSP marker-trailing-space token][TextNode "hello"] — the editable-mode
    // prefix `$createMarkerPrefix` builds (markerEditDeletion.utils.ts). `$applyUpdate`
    // re-synthesizes the whole prefix when materializing the paragraph, so neither the glyph nor
    // its separator may flow into content ops: doing so would leak presentation bytes into USJ
    // content and shift every offset that follows.
    const ops = await getOpsFor(() => {
      const separator = $createTextNode(NBSP);
      $setState(separator, textTypeState, "marker-trailing-space");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), separator, $createTextNode("hello")),
      );
    });

    const joined = ops
      .filter((op): op is { insert: string } => typeof op.insert === "string")
      .map((op) => op.insert)
      .join("");
    expect(joined).toBe(`hello${LF}`);
    expect(joined).not.toContain("\\p");
    expect(joined).not.toContain(NBSP);
  });

  it("should return the correct ops for nested chars", async () => {
    const { editor } = await testEnvironment(() => {
      const qtChar = $createCharNode("qt");
      $setState(qtChar, charIdState, "1");
      const godChar = $createCharNode("w");
      $setState(godChar, charIdState, "2");
      const lovedChar = $createCharNode("w");
      $setState(lovedChar, charIdState, "3");
      $getRoot().append(
        $createImpliedParaNode().append(
          qtChar.append(
            godChar.append($createTextNode("God")),
            $createTextNode(" so "),
            lovedChar.append($createTextNode("loved")),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: "God",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "2" },
          ],
        },
      },
      { insert: " so ", attributes: { char: { style: "qt", cid: "1" } } },
      {
        insert: "loved",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "3" },
          ],
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for adjacent chars with different markers", async () => {
    const { editor } = await testEnvironment(() => {
      const addChar = $createCharNode("add");
      $setState(addChar, charIdState, "1");
      const wjChar = $createCharNode("wj");
      $setState(wjChar, charIdState, "2");
      $getRoot().append(
        $createImpliedParaNode().append(
          addChar.append($createTextNode("added text")),
          wjChar.append($createTextNode("words of Jesus")),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "added text", attributes: { char: { style: "add", cid: "1" } } },
      { insert: "words of Jesus", attributes: { char: { style: "wj", cid: "2" } } },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for adjacent chars where second has nested char", async () => {
    const { editor } = await testEnvironment(() => {
      const addChar = $createCharNode("add");
      $setState(addChar, charIdState, "1");
      const wjChar = $createCharNode("wj");
      $setState(wjChar, charIdState, "2");
      const bdChar = $createCharNode("bd");
      $setState(bdChar, charIdState, "3");
      $getRoot().append(
        $createImpliedParaNode().append(
          addChar.append($createTextNode("added text")),
          wjChar.append($createTextNode("words of "), bdChar.append($createTextNode("Jesus"))),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "added text", attributes: { char: { style: "add", cid: "1" } } },
      { insert: "words of ", attributes: { char: { style: "wj", cid: "2" } } },
      {
        insert: "Jesus",
        attributes: {
          char: [
            { style: "wj", cid: "2" },
            { style: "bd", cid: "3" },
          ],
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for an empty char", async () => {
    const { editor } = await testEnvironment(() => {
      const addChar = $createCharNode("add");
      $setState(addChar, charIdState, "1");
      const wjChar = $createCharNode("wj");
      $setState(wjChar, charIdState, "2");
      $getRoot().append(
        $createImpliedParaNode().append(
          addChar.append($createTextNode("added text")),
          wjChar.append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT)),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "added text", attributes: { char: { style: "add", cid: "1" } } },
      { insert: "", attributes: { char: { style: "wj", cid: "2" } } },
      { insert: LF },
    ]);
  });

  it("should include empty chars inside note contents", async () => {
    const { editor } = await testEnvironment(() => {
      const frChar = $createCharNode("fr");
      $setState(frChar, charIdState, "1");
      const ftChar = $createCharNode("ft");
      $setState(ftChar, charIdState, "2");
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("Lead"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "ref"),
            frChar.append($createTextNode("ref ")),
            ftChar.append($createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT)),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "Lead" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "ref ", attributes: { char: { style: "fr", cid: "1" } } },
                { insert: "", attributes: { char: { style: "ft", cid: "2" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for a note and para", async () => {
    const reference = "3:16 ";
    const footnoteText = "Footnote text ";
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, `${reference} ${footnoteText}`),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for a note with editable caller", async () => {
    const reference = "3:16 ";
    const footnoteText = "Footnote text ";
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  // Canonical glyph-free note ops in editable marker mode: presentation-only MarkerNode
  // glyphs, the expanded editable caller text, and the structural NBSP separator after a
  // char span's opening glyph must NOT flow into note contents ops. `$applyUpdate`
  // re-synthesizes all of them (`$createWholeNote`/`$createNestedChars`), so note contents
  // ops carry CONTENT only — the same shape non-editable marker modes produce.
  it("should return canonical glyph-free contents ops for an expanded editable-mode note", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER, false).append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}3:2 `)),
            $createCharNode("fk").append(
              $createMarkerNode("fk"),
              $createTextNode(EMPTY_CHAR_PLACEHOLDER_TEXT),
            ),
            $createCharNode("ft").append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}Footnote text `),
            ),
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:2 ", attributes: { char: { style: "fr" } } },
                { insert: "", attributes: { char: { style: "fk" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return canonical contents ops for a nested char in an editable-mode note", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER, false).append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}1:1 `)),
            $createCharNode("ft").append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}see `),
              $createCharNode("fv").append($createMarkerNode("fv"), $createTextNode(`${NBSP}2`)),
              $createTextNode(`${NBSP} more`),
            ),
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "1:1 ", attributes: { char: { style: "fr" } } },
                { insert: "see ", attributes: { char: { style: "ft" } } },
                {
                  insert: "2",
                  attributes: { char: [{ style: "ft" }, { style: "fv" }] },
                },
                { insert: " more", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should exclude a char span's attribute display run from canonical contents ops", async () => {
    // \w word|gloss\w* — the display run is engine-owned presentation, re-derived from the char's
    // own unknownAttributes by the CharNodePlugin sync ($syncDisplayRun, char descriptor), not by
    // $applyUpdate (milestones, by contrast, have no such sync yet). Either way it must not shift
    // content length.
    const { editor } = await testEnvironment(() => {
      const attribute = $createTextNode("|gloss");
      $setState(attribute, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER, false).append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("w").append(
              $createMarkerNode("w"),
              $createTextNode(`${NBSP}word`),
              attribute,
              $createMarkerNode("w", "closing"),
            ),
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [{ insert: "word", attributes: { char: { style: "w" } } }],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should carry unknown attributes and no closer for an unclosed editable-mode note", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          // closed="false": an unterminated note — no closing glyph exists in the editor.
          $createNoteNode("f", GENERATOR_NOTE_CALLER, false, undefined, {
            closed: "false",
          }).append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText(GENERATOR_NOTE_CALLER)),
            $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}1:2 `)),
            $createCharNode("ft").append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}unterminated`),
            ),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            closed: "false",
            contents: {
              ops: [
                { insert: "1:2 ", attributes: { char: { style: "fr" } } },
                { insert: "unterminated", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should keep note content text that merely equals the caller text", async () => {
    // The caller-text skip is POSITIONAL (caller position = immediately after the note's
    // opening glyph). A pathological content text node whose value coincidentally equals
    // getEditableCallerText(caller) but sits elsewhere in the note must still flow into ops.
    const callerText = getEditableCallerText(GENERATOR_NOTE_CALLER);
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER, false).append(
            $createMarkerNode("f"),
            $createTextNode(callerText), // the real caller (skipped: caller position)
            $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}1:1 `)),
            $createTextNode(callerText), // pathological CONTENT equal to the caller text
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "1:1 ", attributes: { char: { style: "fr" } } },
                { insert: callerText },
              ],
            },
          },
        },
      },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  it("should return the correct ops for a note with visible markers", async () => {
    const { editor } = await testEnvironment(() => {
      const whenText = $createTextNode("When");
      $setState(whenText, segmentState, "verse_2_1");
      const note = $createNoteNode("f", GENERATOR_NOTE_CALLER);
      $setState(note, segmentState, "verse_2_1");
      const frChar = $createCharNode("fr");
      $setState(frChar, charIdState, "a4f30846-b45c-4bc0-aebe-103dd36a9af3");
      frChar.setUnknownAttributes({ closed: "false" });
      const ftChar = $createCharNode("ft");
      $setState(ftChar, charIdState, "6b911d54-dd6f-41a8-948e-52c7bd03aeb6");
      ftChar.setUnknownAttributes({ closed: "false" });
      $getRoot().append(
        $createImpliedParaNode().append(
          whenText,
          note.append(
            $createImmutableTypedTextNode("marker", `\\f${NBSP}`),
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "2.1  in time."),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", "\\fr"),
            frChar.append($createTextNode("2.1 ")),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", "\\ft"),
            ftChar.append($createTextNode("in time.")),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", `\\f*${NBSP}`),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When", attributes: { segment: "verse_2_1" } },
      {
        attributes: { segment: "verse_2_1" },
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                {
                  insert: "2.1 ",
                  attributes: {
                    char: {
                      style: "fr",
                      closed: "false",
                      cid: "a4f30846-b45c-4bc0-aebe-103dd36a9af3",
                    },
                  },
                },
                {
                  insert: "in time.",
                  attributes: {
                    char: {
                      style: "ft",
                      closed: "false",
                      cid: "6b911d54-dd6f-41a8-948e-52c7bd03aeb6",
                    },
                  },
                },
              ],
            },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for a note with nested chars & visible markers", async () => {
    const { editor } = await testEnvironment(() => {
      const whenText = $createTextNode("When");
      $setState(whenText, segmentState, "verse_2_1");
      const note = $createNoteNode("f", GENERATOR_NOTE_CALLER);
      $setState(note, segmentState, "verse_2_1");
      const frChar = $createCharNode("fr");
      $setState(frChar, charIdState, "char-id1");
      const ftChar = $createCharNode("ft");
      $setState(ftChar, charIdState, "char-id2");
      // CLEAN marker on the nested span — the `+` lives only in the glyph text below, exactly as
      // the load adaptor builds nested chars. The emitted delta style must be clean too.
      const bdChar = $createCharNode("bd");
      $setState(bdChar, charIdState, "char-id3");
      $getRoot().append(
        $createImpliedParaNode().append(
          whenText,
          note.append(
            $createImmutableTypedTextNode("marker", `\\f${NBSP}`),
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "2.1  in \\+bdtime\\+bd*"),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", "\\fr"),
            frChar.append($createTextNode("2.1 ")),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", "\\ft"),
            ftChar.append(
              $createTextNode("in "),
              $createImmutableTypedTextNode("marker", "\\+bd"),
              bdChar.append($createTextNode("time")),
              $createImmutableTypedTextNode("marker", "\\+bd*"),
            ),
            $createTextNode(NBSP),
            $createImmutableTypedTextNode("marker", `\\f*${NBSP}`),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "When", attributes: { segment: "verse_2_1" } },
      {
        attributes: { segment: "verse_2_1" },
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "2.1 ", attributes: { char: { style: "fr", cid: "char-id1" } } },
                { insert: "in ", attributes: { char: { style: "ft", cid: "char-id2" } } },
                {
                  insert: "time",
                  attributes: {
                    char: [
                      { style: "ft", cid: "char-id2" },
                      { style: "bd", cid: "char-id3" },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for an unknown node", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createImpliedParaNode().append(
          $createUnknownNode("wat", "z", { "attr-unknown": "watAttr" }),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: {
          unknown: { tag: "wat", marker: "z", "attr-unknown": "watAttr" },
        },
      },
      { insert: LF },
    ]);
  });

  it("should include child contents for an unknown node", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createImpliedParaNode().append(
          $createUnknownNode("wat", "z", { "attr-unknown": "watAttr" }).append(
            $createTextNode("child text"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: {
          unknown: {
            tag: "wat",
            marker: "z",
            "attr-unknown": "watAttr",
            contents: { ops: [{ insert: "child text" }] },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("should include nested unknown nodes inside contents", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createImpliedParaNode().append(
          $createUnknownNode("outer", "om", { "attr-outer": "outerAttr" }).append(
            $createUnknownNode("inner", "im", { "attr-inner": "innerAttr" }),
            $createTextNode("tail"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: {
          unknown: {
            tag: "outer",
            marker: "om",
            "attr-outer": "outerAttr",
            contents: {
              ops: [
                {
                  insert: {
                    unknown: {
                      tag: "inner",
                      marker: "im",
                      "attr-inner": "innerAttr",
                    },
                  },
                },
                { insert: "tail" },
              ],
            },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("should include char attributes within unknown contents", async () => {
    const { editor } = await testEnvironment(() => {
      const charNode = $createCharNode("bd");
      $setState(charNode, charIdState, "char-id-1");
      charNode.append($createTextNode("bold"));
      $getRoot().append(
        $createImpliedParaNode().append($createUnknownNode("wat", "z").append(charNode)),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: {
          unknown: {
            tag: "wat",
            marker: "z",
            contents: {
              ops: [
                {
                  insert: "bold",
                  attributes: { char: { style: "bd", cid: "char-id-1" } },
                },
              ],
            },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("excludes an unknown node's marker/attribute display children from its contents ops", async () => {
    // ImmutableTypedTextNode is a DecoratorNode, not a Lexical TextNode: `createUnknown`
    // (usj-editor.adaptor.ts) flanks an unknown node's content with `.marker`/`.attribute`
    // ImmutableTypedTextNode display children in editable mode, but `$handleTextNodes` never
    // even sees them (its `$isTextNode` guard excludes DecoratorNode), so they contribute no
    // ops here. The expected `contents.ops` below is byte-identical to "should include child
    // contents for an unknown node" above, which has no display children at all — proving the
    // display children are invisible to the delta, not merely deduplicated.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createImpliedParaNode().append(
          $createUnknownNode("wat", "z", { "attr-unknown": "watAttr" }).append(
            $createImmutableTypedTextNode("marker", "\\z "),
            $createTextNode("child text"),
            $createImmutableTypedTextNode("marker", "\\z*"),
          ),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      {
        insert: {
          unknown: {
            tag: "wat",
            marker: "z",
            "attr-unknown": "watAttr",
            contents: { ops: [{ insert: "child text" }] },
          },
        },
      },
      { insert: LF },
    ]);
  });

  it("should return the correct ops for a complex editor state", async () => {
    const { editor } = await testEnvironment(() => {
      const bookText = $createTextNode("John ");
      $setState(bookText, segmentState, "id_1");
      const qtChar = $createCharNode("qt");
      $setState(qtChar, charIdState, "1");
      const godChar = $createCharNode("w");
      $setState(godChar, charIdState, "2");
      const lovedChar = $createCharNode("w");
      $setState(lovedChar, charIdState, "3");
      const reference = "3:16 ";
      const footnoteText = "Footnote text ";
      $getRoot().append(
        $createBookNode("JHN").append(bookText),
        $createImmutableChapterNode("3"),
        $createImpliedParaNode().append(
          $createImmutableVerseNode("16"),
          qtChar.append(
            godChar.append($createTextNode("God")),
            $createTextNode(" so "),
            lovedChar.append($createTextNode("loved")),
          ),
        ),
        $createParaNode("q1").append(
          $createTextNode("When"),
          $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
            $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, `${reference} ${footnoteText}`),
            $createCharNode("fr").append($createTextNode(reference)),
            $createCharNode("ft").append($createTextNode(footnoteText)),
          ),
          $createMilestoneNode("ts-s", "TS1"),
        ),
      );
    });

    const delta = getEditorDelta(editor.getEditorState());

    expect(delta.ops).toEqual([
      { insert: "John ", attributes: { segment: "id_1" } },
      { insert: LF, attributes: { book: { style: "id", code: "JHN" } } },
      { insert: { chapter: { style: "c", number: "3" } } },
      { insert: { verse: { style: "v", number: "16" } } },
      {
        insert: "God",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "2" },
          ],
        },
      },
      { insert: " so ", attributes: { char: { style: "qt", cid: "1" } } },
      {
        insert: "loved",
        attributes: {
          char: [
            { style: "qt", cid: "1" },
            { style: "w", cid: "3" },
          ],
        },
      },
      { insert: LF + "When" },
      {
        insert: {
          note: {
            style: "f",
            caller: GENERATOR_NOTE_CALLER,
            contents: {
              ops: [
                { insert: "3:16 ", attributes: { char: { style: "fr" } } },
                { insert: "Footnote text ", attributes: { char: { style: "ft" } } },
              ],
            },
          },
        },
      },
      { insert: { milestone: { style: "ts-s", sid: "TS1" } } },
      { insert: LF, attributes: { para: { style: "q1" } } },
    ]);
  });

  // An embed's `contents` ops are a self-contained sub-document, so char spans opened OUTSIDE the
  // embed are not part of it. They used to ride in anyway: the walk's char stack is ambient, and
  // a note inserted mid-span (`\nd as<note>df\nd*` — an ordinary Ctrl+T with the caret inside a
  // styled word) shipped the enclosing `\nd` as the outer entry of its OWN content ops' char
  // stack. The receive side then built that `\nd` INSIDE the note with a nested `\+fr` under it,
  // so the footnote editor opened on `\f + \nd\+fr1:8 \nd*\ft \f*` instead of `\f + \fr 1:8 \ft \f*`.
  //
  // The property, stated without reference to that symptom: a note's contents ops name the note's
  // OWN char spans and no others. `$getParticularNodeOps(noteNode)` — the other producer of the
  // same ops, used by `getNoteOps` — starts its walk AT the note and so never had an outer stack
  // to leak; these tests pin the two producers into agreement.
  describe("embed contents ops carry only the embed's own char spans", () => {
    /** `\nd as<note>df\nd*` — the reported gesture: a note inserted mid-content of a char span. */
    function $noteInsideNdSpan(noteContent: () => LexicalNode[], marker = "f") {
      $getRoot().append(
        $createParaNode("p").append(
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}as`),
            $createNoteNode(marker, GENERATOR_NOTE_CALLER).append(
              $createMarkerNode(marker),
              $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "preview"),
              ...noteContent(),
              $createMarkerNode(marker, "closing"),
            ),
            $createTextNode("df"),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    }

    /** The `contents.ops` of the one note embed in `ops` (a `\x` cross-reference is one too). */
    function embedContentsOps(ops: DeltaOp[]) {
      const embed = ops.find((op) => isInsertEmbedOpOfType("note", op));
      if (!embed) throw new Error("no note embed in ops");
      return embed.insert.note?.contents?.ops;
    }

    it("drops a char span opened outside the note from a footnote's contents ops", async () => {
      const ops = await getOpsFor(() =>
        $noteInsideNdSpan(() => [
          $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}1:8 `)),
          $createCharNode("ft").append(
            $createMarkerNode("ft"),
            $createTextNode(`${NBSP}note text`),
          ),
        ]),
      );

      expect(embedContentsOps(ops)).toEqual([
        { insert: "1:8 ", attributes: { char: { style: "fr" } } },
        { insert: "note text", attributes: { char: { style: "ft" } } },
      ]);
    });

    it("drops it from a cross-reference's contents ops too", async () => {
      // The Ctrl+Shift+T shape. Same leak, same fix — the scoping is per embed, not per marker.
      const ops = await getOpsFor(() =>
        $noteInsideNdSpan(
          () => [
            $createCharNode("xo").append($createMarkerNode("xo"), $createTextNode(`${NBSP}1:8 `)),
            $createCharNode("xt").append($createMarkerNode("xt"), $createTextNode(`${NBSP}see`)),
          ],
          "x",
        ),
      );

      expect(embedContentsOps(ops)).toEqual([
        { insert: "1:8 ", attributes: { char: { style: "xo" } } },
        { insert: "see", attributes: { char: { style: "xt" } } },
      ]);
    });

    it("drops EVERY outer span when the note sits inside nested char spans", async () => {
      const ops = await getOpsFor(() => {
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("nd").append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}as`),
              $createCharNode("add").append(
                $createMarkerNode("add"),
                $createNoteNode("f", GENERATOR_NOTE_CALLER).append(
                  $createMarkerNode("f"),
                  $createImmutableNoteCallerNode(GENERATOR_NOTE_CALLER, "preview"),
                  $createCharNode("ft").append(
                    $createMarkerNode("ft"),
                    $createTextNode(`${NBSP}note text`),
                  ),
                  $createMarkerNode("f", "closing"),
                ),
                $createTextNode("df"),
                $createMarkerNode("add", "closing"),
              ),
              $createMarkerNode("nd", "closing"),
            ),
          ),
        );
      });

      expect(embedContentsOps(ops)).toEqual([
        { insert: "note text", attributes: { char: { style: "ft" } } },
      ]);
    });

    it("KEEPS a char span opened inside the note below its top level", async () => {
      // The other half of the containment test, and the one a too-narrow predicate would break:
      // `\fv` is not a direct child of the note, it is nested inside `\ft`. It belongs to the
      // note's own sub-document and must still stack — while the outer `\nd` must not.
      const ops = await getOpsFor(() =>
        $noteInsideNdSpan(() => [
          $createCharNode("ft").append(
            $createMarkerNode("ft"),
            $createTextNode(`${NBSP}see `),
            $createCharNode("fv").append($createMarkerNode("fv"), $createTextNode(`${NBSP}2`)),
          ),
        ]),
      );

      expect(embedContentsOps(ops)).toEqual([
        { insert: "see ", attributes: { char: { style: "ft" } } },
        { insert: "2", attributes: { char: [{ style: "ft" }, { style: "fv" }] } },
      ]);
    });

    it("agrees with $getParticularNodeOps, the other producer of the same ops", async () => {
      const { editor } = await testEnvironment(() =>
        $noteInsideNdSpan(() => [
          $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}1:8 `)),
          $createCharNode("ft").append(
            $createMarkerNode("ft"),
            $createTextNode(`${NBSP}note text`),
          ),
        ]),
      );

      const wholeDocument = embedContentsOps(getEditorDelta(editor.getEditorState()).ops);
      const noteAlone = editor.getEditorState().read(() => {
        const note = $dfs($getRoot())
          .map(({ node }) => node)
          .find($isNoteNode);
        if (!note) throw new Error("no note node");
        return embedContentsOps($getParticularNodeOps(note));
      });

      expect(wholeDocument).toEqual(noteAlone);
    });
  });

  // Paired with the same tests in `./delta-apply-update.utils.test.tsx`.
  describe("Adaptor Roundtrip", () => {
    it("should roundtrip the empty editor state", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateEmpty);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual([]);
    });

    it("should roundtrip the editor state", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1);
    });

    it("should roundtrip the editor state with empty implied para", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1ImpliedParaEmpty);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1ImpliedParaEmpty);
    });

    it("should roundtrip the editor state with implied para", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1ImpliedPara);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1ImpliedPara);
    });

    // The table-free half of this fixture. Everything the whole-document state was built to cover
    // EXCEPT the table survives the wire, so it is asserted here rather than parked behind the one
    // shape that does not: genuinely unknown node types (`z`, `optbreak`, `ref`, `esb`, `periph`,
    // `fig`) emit as structured per-item embeds, and unknown attributes ride along on note, char
    // and unknown embeds.
    //
    it("should roundtrip the editor state with unknown items, minus the table", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateWithUnknownItemsNoTable);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsWithUnknownItemsNoTable);
    });

    // Skipped: TABLES HAVE NO OT REPRESENTATION. Owned by the track that decides whether tables
    // become editable and how tables/figures/sidebars reconcile — the same work that owns the dead
    // table arm of `unknownDisplayParts`.
    //
    // Since table/table:row/table:cell became real ImmutableTable* nodes, nothing in
    // `getEditorDelta` matches them (it dispatches on book/para/char/note/milestone/unknown/… and
    // `rich-text-ot.model` defines embeds for immutable-chapter and immutable-verse but none for
    // tables), so the whole table flattens to its descendant text — this fixture's `tc1` cell,
    // carrying marker and `category`, arrives on the wire as a bare `{ insert: "cell1" }`.
    // Refreshing `opsWithUnknownItems` now would pin that loss as expected, so the adaptor (and
    // the OT model) need a table representation first. Deleting this entry is part of that fix;
    // the test above already covers everything else the fixture was built for.
    it.skip("should roundtrip the editor state with unknown items, including the table", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateWithUnknownItems);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsWithUnknownItems);
    });

    // The send and receive sides agree on unknown attributes for all seven kinds — book, para,
    // chapter, verse, milestone, note and unknown. `delta-apply-update.utils.ts` calls
    // `getUnknownAttributes` for each, and `editor-delta.adaptor.ts` writes each one back, so a
    // client holding `category` on a chapter transmits it and the receiver restores it.
    it("should carry unknown attributes on every embed kind the apply side accepts", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateWithUnknownItemsNoTable);

      const delta = getEditorDelta(editorState);

      const unknownAttrs = { category: "watCat", "attr-unknown": "watAttr" };
      expect(delta.ops[0]).toEqual({
        insert: LF,
        attributes: { book: { style: "id", code: "GEN", ...unknownAttrs } },
      });
      expect(delta.ops[1]).toEqual({
        insert: { chapter: { style: "c", number: "1", sid: "GEN 1", ...unknownAttrs } },
      });
      expect(delta.ops[2]).toEqual({
        insert: { verse: { style: "v", number: "1", ...unknownAttrs } },
      });
      expect(delta.ops[5]).toEqual({ insert: { milestone: { style: "ts", ...unknownAttrs } } });
      expect(delta.ops.at(-1)).toEqual({
        insert: LF,
        attributes: { para: { style: "p", ...unknownAttrs } },
      });
    });

    // Emitting `closed: "false"` on implicitly-closed char spans is correct by design (it matches
    // real ParatextData output; the serializer records it whenever the closing glyph is skipped).
    // The `opsGen1v1Nonstandard` fixture now expects that attribute on its nd spans.
    it("should roundtrip the editor state with nonstandard features", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1Nonstandard);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1Nonstandard);
    });

    it("should roundtrip the editor state in editable mode", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1Editable);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1Editable);
    });

    // EmptyVerseCaretGuardPlugin's transient caret host (a bare zero-width space) is never sent to
    // peers, so it must be invisible to the delta/OT stream — otherwise typing into an emptied verse
    // would emit ops that reference a character the backend never received (PT-4308).
    it("is transparent to the delta: a bare cursor host emits no op", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode("p").append(
            $createImmutableVerseNode("1"),
            $createCursorPlaceholderNode(), // caret host in the now-empty verse 1
            $createImmutableVerseNode("2"),
            $createTextNode("text"),
          ),
        );
      });

      const delta = getEditorDelta(editor.getEditorState());

      // Identical to the ops the same tree would produce with no host at all.
      expect(delta.ops).toEqual([
        { insert: { verse: { style: "v", number: "1" } } },
        { insert: { verse: { style: "v", number: "2" } } },
        { insert: "text" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
    });

    // The same exclusion covers TrailingNoteCaretGuardPlugin's host, which sits after a note in an
    // ordinary paragraph rather than inside a verse: the rule is keyed on the node's own bare
    // placeholder text, not on what surrounds it. Asserted against the ops for the identical tree
    // with no host, so this stays correct without restating the note embed's shape.
    it("is transparent to the delta: a caret host past a trailing note emits no op", async () => {
      const $buildNote = () =>
        $createNoteNode("f", "+").append(
          $createImmutableNoteCallerNode("+", "note preview"),
          $createCharNode("ft").append($createTextNode("note body")),
        );

      const withHost = await getOpsFor(() => {
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("before "),
            $buildNote(),
            $createCursorPlaceholderNode(), // caret host past the trailing note
          ),
        );
      });
      const withoutHost = await getOpsFor(() => {
        $getRoot().append($createParaNode("p").append($createTextNode("before "), $buildNote()));
      });

      expect(withHost).toEqual(withoutHost);
    });

    it("should roundtrip the editor state in standard view (editable markers, collapsed notes)", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateGen1v1Standard);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsGen1v1Standard);
    });
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment($initialEditorState);
}

/** Builds an editor state from `$initialEditorState` and returns its canonical delta ops. */
async function getOpsFor($initialEditorState: () => void) {
  const { editor } = await testEnvironment($initialEditorState);
  return getEditorDelta(editor.getEditorState()).ops;
}
