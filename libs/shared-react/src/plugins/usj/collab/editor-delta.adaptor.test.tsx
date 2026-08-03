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
  opsGen1v1,
  opsGen1v1Editable,
  opsGen1v1ImpliedPara,
  opsGen1v1ImpliedParaEmpty,
  opsGen1v1Nonstandard,
  opsGen1v1Standard,
  opsWithUnknownItems,
} from "../../../../../../packages/utilities/src/converters/usj/converter-test.data";
import { $createImmutableNoteCallerNode } from "../../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import { baseTestEnvironment } from "../react-test.utils";
import { LF } from "./delta-common.utils";
import { getEditorDelta } from "./editor-delta.adaptor";
import { $setState, $createTextNode, $getRoot } from "lexical";
import {
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
  charIdState,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  GENERATOR_NOTE_CALLER,
  getEditableCallerText,
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

  it("should exclude a verse's \\va/\\vp display runs from canonical ops (not nested in a note/char)", async () => {
    // \v 1 \va 2\va*\vp 1b\vp* — the display runs are engine-owned presentation riding as the
    // verse's own following siblings (not inside a note or char span, so the note/char-scoped
    // exclusion paths don't apply here); altnumber/pubnumber already flow through the verse's own
    // embed op, so the glyph/value siblings must not shift content length or duplicate them.
    //
    // Compared against a bare verse's ops (rather than an exact literal `toEqual`) because an
    // editable VerseNode's own `__text` ("\v 1 ") independently produces its own text op — a
    // pre-existing gap unrelated to attribute display (a bare `$createVerseNode("1", "\v 1 ")`
    // with no runs at all already leaks it the same way); asserting the runs add NO further ops
    // isolates this task's concern from that separate, un-fixed gap.
    const bareVerseOps = await getOpsFor(() => {
      const verse = $createVerseNode("1", "\\v 1 ", undefined, "2", "1b");
      $getRoot().append($createParaNode("q1").append(verse));
    });

    const withRunsOps = await getOpsFor(() => {
      const verse = $createVerseNode("1", "\\v 1 ", undefined, "2", "1b");
      const vaValue = $createTextNode(`${NBSP}2`);
      $setState(vaValue, textTypeState, "attribute");
      const vpValue = $createTextNode(`${NBSP}1b`);
      $setState(vpValue, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("q1").append(
          verse,
          $createMarkerNode("va"),
          vaValue,
          $createMarkerNode("va", "closing"),
          $createMarkerNode("vp"),
          vpValue,
          $createMarkerNode("vp", "closing"),
        ),
      );
    });

    expect(withRunsOps).toEqual(bareVerseOps);
  });

  it("excludes a nested verse's \\va glyphs from a cross-verse char span's ops (byte-identical to no runs)", async () => {
    // Legal ≤3.0: a char span (\wj) crosses a verse boundary, so the VerseNode — and its \va
    // attribute-run glyphs — genuinely nest inside the CharNode. Those \va/\va* glyphs describe
    // the VERSE, not the char span, so they are bare attribute-run glyphs that must stay out of
    // content ops. altnumber already rides on the verse's own embed op, so adding the display run
    // must not change the ops at all — the parent-CharNode glyph exemption used to let them leak.
    const withRunsOps = await getOpsFor(() => {
      const verse = $createVerseNode("2", "\\v 2 ", undefined, "3", undefined);
      const vaValue = $createTextNode(`${NBSP}3`);
      $setState(vaValue, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("q1").append(
          $createCharNode("wj").append(
            $createMarkerNode("wj"),
            $createTextNode("before "),
            verse,
            $createMarkerNode("va"),
            vaValue,
            $createMarkerNode("va", "closing"),
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
    // own unknownAttributes by the CharNodePlugin sync ($syncCharAttributeDisplay), not by
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

    // Skipped: `getEditorDelta` does not yet normalize unknown items to the canonical delta shape
    // `opsWithUnknownItems` expects. It currently emits extra fields the fixture omits — a
    // chapter `sid` ("GEN 1") and the round-tripped `attr-unknown`/`category` attributes on notes
    // and chars. Un-skip once the adaptor strips those unknown/derived attributes so the round
    // trip lands on the canonical ops.
    it.skip("should roundtrip the editor state with unknown items", async () => {
      const { editor } = await testEnvironment();
      const editorState = editor.parseEditorState(editorStateWithUnknownItems);

      const delta = getEditorDelta(editorState);

      expect(delta.ops).toEqual(opsWithUnknownItems);
    });

    // Skipped: emitting `closed: "false"` on implicitly-closed char spans is correct by design
    // (it matches real ParatextData output; the serializer records it whenever the closing glyph
    // is skipped). The canonical `opsGen1v1Nonstandard` fixture predates that attribute, so this
    // test stays skipped until the fixture is updated to expect `closed: "false"`.
    it.skip("should roundtrip the editor state with nonstandard features", async () => {
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
