// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  baseTestEnvironment,
  deleteTextAtSelection,
} from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  CHAPTER_1_INDEX,
  VERSE_2_EDITABLE_INDEX,
  VERSE_2_INDEX,
  VERSE_PARA_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import editorUsjAdaptor, {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "./editor-usj.adaptor";
import usjEditorAdaptor, {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "./usj-editor.adaptor";
import {
  EMPTY_USJ,
  MarkerContent,
  MarkerObject,
  Usj,
  usxStringToUsj,
} from "@eten-tech-foundation/scripture-utilities";
import { deepEqual } from "fast-equals";
import {
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setState,
  SerializedEditorState,
  SerializedTextNode,
  TextNode,
} from "lexical";
import {
  $createImmutableVerseNode,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
  usjReactNodes,
} from "shared-react";
import {
  $createAttributeRunNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createVerseNode,
  $isParaNode,
  CHAPTER_MARKER,
  CURSOR_PLACEHOLDER_CHAR,
  getVisibleOpenMarkerText,
  isSerializedImmutableTypedTextNode,
  isSerializedTextNode,
  isSerializedUnknownNode,
  NBSP,
  SerializedChapterNode,
  SerializedParaNode,
  SerializedVerseNode,
  ImmutableTableCellMarker,
  textTypeState,
  TypedMarkNode,
  VERSE_MARKER,
} from "shared";

const nodes = [TypedMarkNode, ...usjReactNodes];
const { editor } = createBasicTestEnvironment(nodes);

describe("Editor USJ Adaptor", () => {
  it("should convert to USJ from empty Lexical editor state JSON", () => {
    const editorState = editor.parseEditorState(editorStateEmpty);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(EMPTY_USJ);
  });

  it("should convert to USJ from Lexical editor state JSON", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1);
  });

  it("should convert to USJ from Lexical editor state JSON with an empty implied para", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1ImpliedParaEmpty);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1ImpliedParaEmpty);
  });

  it("should convert to USJ from Lexical editor state JSON with implied para", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1ImpliedPara);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1ImpliedPara);
  });

  it("should convert to USJ from Lexical editor state JSON with nonstandard features", () => {
    const editorState = editor.parseEditorState(editorStateGen1v1Nonstandard);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjGen1v1Nonstandard);
  });

  it("should convert to USJ from Lexical editor state JSON with edits", () => {
    const editorStateEdited = editorStateGen1v1Editable;
    const chapter1 = editorStateEdited.root.children[CHAPTER_1_INDEX] as SerializedChapterNode;
    const chapter1Number = "101";
    (chapter1.children[0] as SerializedTextNode).text = getVisibleOpenMarkerText(
      CHAPTER_MARKER,
      chapter1Number,
    );
    const verse2 = (editorStateEdited.root.children[VERSE_PARA_INDEX] as SerializedParaNode)
      .children[VERSE_2_EDITABLE_INDEX] as SerializedVerseNode;
    const verse2Number = "202";
    verse2.text = getVisibleOpenMarkerText(VERSE_MARKER, verse2Number);
    const editorState = editor.parseEditorState(editorStateEdited);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    const usjGen1v1Edited = usjGen1v1;
    const usjChapter1 = usjGen1v1Edited.content[CHAPTER_1_INDEX] as MarkerObject;
    usjChapter1.number = chapter1Number;
    const usjVerse2 = (
      (usjGen1v1Edited.content[VERSE_PARA_INDEX] as MarkerObject).content as MarkerObject[]
    )[VERSE_2_INDEX];
    usjVerse2.number = verse2Number;
    expect(usj).toEqual(usjGen1v1Edited);
  });

  it("should convert USJ to Lexical editor state JSON and back again", () => {
    const serializedEditorState = usjEditorAdaptor.serializeEditorState(usjGen1v1);
    const editorState = editor.parseEditorState(serializedEditorState);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    const isEqual = deepEqual(usj, usjGen1v1);
    expect(usj).toEqual(usjGen1v1);
    expect(isEqual).toBe(true);
  });

  it("keys footnote-content closer/closed on state, not the marker family", () => {
    // Closer display keys on the span's ACTUAL closed state. A \fr the source marked
    // closed="false" (real ParatextData's genuinely-unclosed shape) renders closer-less and keeps
    // closed="false" on the round trip; a \fr the source did NOT mark closed is an explicitly-closed
    // span — it renders its \fr* closer and must NOT acquire a phantom closed="false" that a C#
    // writer would then use to DROP the real closer.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />Text<note caller="+" style="f"><char style="fr" closed="false">1.1 </char><char style="xt">Gen 1:1</char></note></para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    reset();
    initializeDeserialize(undefined);
    const serializedEditorState = serializeEditorState(usj);
    const editorState = editor.parseEditorState(serializedEditorState);

    const result = editorUsjAdaptor.deserializeEditorState(editorState);

    const flatten = (items: MarkerContent[] | undefined): MarkerObject[] =>
      (items ?? []).flatMap((item) =>
        typeof item === "string" ? [] : [item, ...flatten(item.content)],
      );
    const flat = flatten(result?.content);
    const frChar = flat.find((m) => m.marker === "fr");
    const xtChar = flat.find((m) => m.marker === "xt");
    expect(frChar).toBeDefined();
    expect((frChar as MarkerObject & { closed?: string }).closed).toBe("false");
    expect(xtChar).toBeDefined();
    expect((xtChar as MarkerObject & { closed?: string }).closed).toBeUndefined();
  });

  it("should convert to USJ from Lexical editor state JSON with Marks", () => {
    const editorState = editor.parseEditorState(editorStateMarks);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjMarks);
  });

  it("should convert to USJ from Lexical editor state JSON with unknown items", () => {
    const editorState = editor.parseEditorState(editorStateWithUnknownItems);

    const usj = editorUsjAdaptor.deserializeEditorState(editorState);

    expect(usj).toEqual(usjWithUnknownItems);
  });

  it("serializes a table back to USJ", () => {
    const serializedEditorState = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [
          {
            type: "immutable-table",
            format: "",
            indent: 0,
            version: 1,
            direction: null,
            children: [
              {
                type: "immutable-table-row",
                marker: "tr",
                format: "",
                indent: 0,
                version: 1,
                direction: null,
                children: [
                  {
                    type: "immutable-table-cell",
                    marker: "tc1",
                    align: "start",
                    colspan: "2",
                    format: "",
                    indent: 0,
                    version: 1,
                    direction: null,
                    children: [
                      {
                        type: "text",
                        text: "Header",
                        detail: 0,
                        format: 0,
                        mode: "normal",
                        style: "",
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const usj = deserializeSerializedEditorState(
      serializedEditorState as unknown as SerializedEditorState,
    );

    expect(usj?.content).toEqual([
      {
        type: "table",
        content: [
          {
            type: "table:row",
            marker: "tr",
            content: [
              {
                type: "table:cell",
                marker: "tc1",
                align: "start",
                colspan: "2",
                content: ["Header"],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("round-trips a multi-row table (header + body) through both adaptors, preserving align/colspan", () => {
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "table",
          content: [
            {
              type: "table:row",
              marker: "tr",
              content: [
                // Logical alignment (start/end) must survive so RTL rendering stays correct.
                { type: "table:cell", marker: "th1", align: "start", content: ["Name"] },
                { type: "table:cell", marker: "thr2", align: "end", content: ["Amount"] },
              ],
            },
            {
              type: "table:row",
              marker: "tr",
              content: [
                {
                  type: "table:cell",
                  marker: "tc1",
                  colspan: "2",
                  content: ["Total"],
                } as ImmutableTableCellMarker,
              ],
            },
          ],
        },
      ],
    };

    const serializedEditorState = usjEditorAdaptor.serializeEditorState(usj);
    const roundTripped = deserializeSerializedEditorState(serializedEditorState);

    expect(roundTripped).toEqual(usj);
  });
});

// EmptyVerseCaretGuardPlugin drops a transient zero-width-space "caret host" into an emptied verse
// so the insertion point stays visible (PT-4308). A node that is *only* placeholders carries no
// Scripture text and is skipped, but a zero-width space is legitimate content in some scripts
// (Thai/Khmer/Lao line breaks), so an embedded one in real text must survive.
describe("Editor USJ Adaptor — caret-host placeholder", () => {
  it("drops a bare zero-width-space caret host and keeps surrounding verse text", () => {
    editor.update(
      () => {
        $getRoot().clear();
        $getRoot().append(
          $createParaNode("p").append(
            $createImmutableVerseNode("1"),
            $createTextNode(CURSOR_PLACEHOLDER_CHAR), // caret host in the now-empty verse 1
            $createImmutableVerseNode("2"),
            $createTextNode("real text"),
          ),
        );
      },
      { discrete: true },
    );

    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState());
    const serialized = JSON.stringify(usj);

    expect(serialized.includes(CURSOR_PLACEHOLDER_CHAR)).toBe(false); // bare host never reaches USJ
    expect(serialized.includes("real text")).toBe(true); // verse 2's real text survives
  });

  it("preserves a zero-width space embedded in real Scripture text", () => {
    const withZwsp = `first${CURSOR_PLACEHOLDER_CHAR}second`;
    editor.update(
      () => {
        $getRoot().clear();
        $getRoot().append(
          $createParaNode("p").append($createImmutableVerseNode("1"), $createTextNode(withZwsp)),
        );
      },
      { discrete: true },
    );

    const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState());

    // The ZWSP is content here (not a bare host), so it must round-trip untouched.
    expect(JSON.stringify(usj).includes(withZwsp)).toBe(true);
  });

  function buildPatchedStandardState(displayText: string) {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />in the days</para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("in the days"),
    ) as SerializedTextNode;
    text.text = displayText;
    return state;
  }

  it("inverts display whitespace when deserializing standard view", () => {
    // display tilde (= data NBSP) + display-NBSP run (= space run, collapses to one)
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const roundTripped = deserializeSerializedEditorState(
      state,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    expect(JSON.stringify(roundTripped)).toContain(`in${NBSP}the days`);
  });

  it("inverts display whitespace when deserializing editable+expanded standard view", () => {
    // Expanded notes do not change that this is standard-view text: the display `~` (= data NBSP)
    // and display-NBSP space run MUST invert on deserialization exactly as in collapsed standard
    // view. Before the gating fix, editable+expanded skipped inversion, so a display `~` survived
    // into the saved data as a literal tilde.
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const standard = getViewOptions(STANDARD_VIEW_MODE);
    if (!standard) throw new Error("standard view options not found");
    const expandedStandard = { ...standard, noteMode: "expanded" as const };
    const roundTripped = deserializeSerializedEditorState(state, expandedStandard);
    expect(JSON.stringify(roundTripped)).toContain(`in${NBSP}the days`);
  });

  it("leaves whitespace untouched when deserializing without standard viewOptions", () => {
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const roundTripped = deserializeSerializedEditorState(state);
    expect(JSON.stringify(roundTripped)).toContain(`in~the${NBSP}${NBSP}days`);
  });

  it("uses per-call viewOptions, not a latched module singleton (task zero)", () => {
    // Build a standard-view state with a stored NBSP (renders as display `~`).
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined); // no viewOptions latched
    reset();
    const standardState = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    // Deserializing WITH standard viewOptions inverts display `~` back to a data NBSP...
    const asStandard = deserializeSerializedEditorState(
      standardState,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    expect(JSON.stringify(asStandard)).toContain(`3${NBSP}000 men`);

    // ...and deserializing the SAME state WITHOUT standard viewOptions leaves display `~` literal,
    // proving the result depends on the per-call arg, not on whatever `initialize` last saw.
    const asDefault = deserializeSerializedEditorState(standardState, undefined);
    expect(JSON.stringify(asDefault)).toContain(`3~000 men`);
  });

  it("excludes a char span's attribute display run from saved USJ content", () => {
    // \w word|lemma="grace"\w* — the attribute belongs in USJ as a MarkerObject prop
    // (unknownAttributes), not as literal `|…` text in the char's content array.
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [
            { type: "char", marker: "w", lemma: "grace", content: ["word"] } as MarkerObject,
          ],
        } as MarkerObject,
      ],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const state = serializeEditorState(usj, standardViewOptions);
    const editorState = editor.parseEditorState(state);
    initializeDeserialize(undefined);

    const result = editorUsjAdaptor.deserializeEditorState(editorState, standardViewOptions);

    const para = result?.content?.[0] as MarkerObject;
    const char = para.content?.[0] as MarkerObject & { lemma?: string };
    expect(char.lemma).toBe("grace");
    expect(char.content).toEqual(["word"]);
  });

  it("excludes a verse's \\va/\\vp display runs from saved USJ content", () => {
    // \v 1 \va 2\va*\vp 1b\vp* — altnumber/pubnumber belong in USJ as verse MarkerObject props,
    // not as literal glyph/value text riding alongside the verse in the paragraph's content.
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "verse",
              marker: "v",
              number: "1",
              altnumber: "2",
              pubnumber: "1b",
            } as MarkerObject,
            "text after",
          ],
        } as MarkerObject,
      ],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const state = serializeEditorState(usj, standardViewOptions);
    // Sanity check: the intermediate serialized state genuinely carries the display runs, wrapped
    // in an attribute-run node (the round-trip assertion below would pass vacuously if there were
    // nothing to exclude).
    const serializedPara = state.root.children[0] as SerializedParaNode;
    expect(
      serializedPara.children.some(
        (n) => n.type === "attribute-run" && "runKind" in n && n.runKind === "va",
      ),
    ).toBe(true);
    const editorState = editor.parseEditorState(state);
    initializeDeserialize(undefined);

    const result = editorUsjAdaptor.deserializeEditorState(editorState, standardViewOptions);

    const para = result?.content?.[0] as MarkerObject;
    const verse = para.content?.[0] as MarkerObject & { altnumber?: string; pubnumber?: string };
    expect(verse.altnumber).toBe("2");
    expect(verse.pubnumber).toBe("1b");
    expect(para.content).toEqual([
      { type: "verse", marker: "v", number: "1", altnumber: "2", pubnumber: "1b" },
      "text after",
    ]);
  });

  // AttributeRunNode is registered in `nodes` above via `...usjReactNodes`. The forward adaptor
  // (usj-editor.adaptor.ts) always builds this shape now — these tests build it by hand anyway to
  // pin the REVERSE (editor -> USJ) exclusion directly, independent of the forward adaptor's own
  // output (a hand-built tree also covers a wrapper healed forward from a pre-flip state, which
  // the adaptor itself would never produce). Each uses its OWN freshly-created editor (rather than
  // the module-level `editor` other tests in this file share) so hand-built nodes never leak
  // across tests.
  it("excludes a verse's \\va/\\vp display runs from saved USJ content when wrapped in AttributeRunNode (dual-read)", () => {
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    initializeDeserialize(undefined);
    const { editor: localEditor } = createBasicTestEnvironment(nodes);
    localEditor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          "1b",
        );
        const vaWrapper = $createAttributeRunNode("va");
        const vaValue = $createTextNode(`${NBSP}2`);
        $setState(vaValue, textTypeState, "attribute");
        vaWrapper.append(
          $createMarkerNode("va", "opening"),
          vaValue,
          $createMarkerNode("va", "closing"),
        );
        const vpWrapper = $createAttributeRunNode("vp");
        const vpValue = $createTextNode(`${NBSP}1b`);
        $setState(vpValue, textTypeState, "attribute");
        vpWrapper.append(
          $createMarkerNode("vp", "opening"),
          vpValue,
          $createMarkerNode("vp", "closing"),
        );
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vaWrapper,
            vpWrapper,
            $createTextNode("text after"),
          ),
        );
      },
      { discrete: true },
    );

    const result = editorUsjAdaptor.deserializeEditorState(
      localEditor.getEditorState(),
      standardViewOptions,
    );

    const para = result?.content?.[0] as MarkerObject;
    // Identical to the loose-shape assertion above: the two wrappers contribute NOTHING beyond
    // the verse's own altnumber/pubnumber fields (already carried on the VerseNode itself,
    // independent of whichever shape its display run rides in).
    expect(para.content).toEqual([
      { type: "verse", marker: "v", number: "1", altnumber: "2", pubnumber: "1b" },
      "text after",
    ]);
  });

  it("excludes a milestone's display run from saved USJ content when wrapped in AttributeRunNode (dual-read)", () => {
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    initializeDeserialize(undefined);
    const { editor: localEditor } = createBasicTestEnvironment(nodes);
    localEditor.update(
      () => {
        const ms = $createMilestoneNode("qt-s", "q1");
        const wrapper = $createAttributeRunNode("milestone");
        const attribute = $createTextNode(`${NBSP}|sid="q1"`);
        $setState(attribute, textTypeState, "attribute");
        wrapper.append(
          $createMarkerNode("qt-s", "opening"),
          attribute,
          $createMarkerNode("", "selfClosing"),
        );
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("before "),
            ms,
            wrapper,
            $createTextNode(" after"),
          ),
        );
      },
      { discrete: true },
    );

    const result = editorUsjAdaptor.deserializeEditorState(
      localEditor.getEditorState(),
      standardViewOptions,
    );

    const para = result?.content?.[0] as MarkerObject;
    expect(para.content).toEqual(["before ", { type: "ms", marker: "qt-s", sid: "q1" }, " after"]);
  });

  it("excludes an unknown node's display marker/attribute runs from saved USJ content", () => {
    // \fig caption|src="image.jpg" size="span" ref="1.18"\fig* — the marker/attribute display
    // children `createUnknown` adds in editable mode are presentation only; they must not leak
    // into the saved USJ's unknownAttributes or content array.
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "figure",
              marker: "fig",
              file: "image.jpg",
              size: "span",
              ref: "1.18",
              content: ["figure content"],
            } as MarkerObject,
          ],
        } as MarkerObject,
      ],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const state = serializeEditorState(usj, standardViewOptions);
    // Sanity check: the intermediate serialized state genuinely carries the display children
    // (the round-trip assertion below would pass vacuously if there were nothing to exclude).
    const serializedPara = state.root.children[0] as SerializedParaNode;
    const serializedUnknown = serializedPara.children.find(isSerializedUnknownNode);
    if (!serializedUnknown) throw new Error("No unknown node found in the serialized state");
    expect(serializedUnknown.children.some(isSerializedImmutableTypedTextNode)).toBe(true);
    const editorState = editor.parseEditorState(state);
    initializeDeserialize(undefined);

    const result = editorUsjAdaptor.deserializeEditorState(editorState, standardViewOptions);

    const para = result?.content?.[0] as MarkerObject;
    expect(para.content).toEqual([
      {
        type: "figure",
        marker: "fig",
        file: "image.jpg",
        size: "span",
        ref: "1.18",
        content: ["figure content"],
      },
    ]);
  });

  it("round-trips a `//` optbreak to a single clean {type:'optbreak'} — one `//` child, no duplicate", () => {
    // Live bug: a single `//` optbreak DISPLAYED as `////` and drove an endless PDP deferral loop.
    // This pins the editor's contract from both angles:
    //   (1) standard view renders the optbreak's `//` token as exactly ONE real
    //       ImmutableTypedTextNode child — so any extra `//` on screen (the observed `////`) comes
    //       from OUTSIDE the editor (a stale vendored CSS `::before`), not from the editor emitting
    //       it twice; and
    //   (2) the editor -> USJ round-trip is idempotent: `{type:'optbreak'}` in yields
    //       `{type:'optbreak'}` out — no `marker`/`content` added, no second optbreak — so the
    //       editor is NOT the source of any editorUsj-vs-PDP difference that would sustain the loop
    //       (that difference is the PDP's USFM round-trip of `//`, not the editor's).
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [{ type: "optbreak" } as MarkerObject],
        } as MarkerObject,
      ],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const state = serializeEditorState(usj, standardViewOptions);
    // (1) Display pin: exactly one `//` marker text node renders for the optbreak.
    const serializedPara = state.root.children[0] as SerializedParaNode;
    const serializedUnknown = serializedPara.children.find(isSerializedUnknownNode);
    if (!serializedUnknown) throw new Error("No unknown node found in the serialized state");
    const slashChildren = serializedUnknown.children.filter(
      (child) => isSerializedImmutableTypedTextNode(child) && child.text === "//",
    );
    expect(slashChildren).toHaveLength(1);
    const editorState = editor.parseEditorState(state);
    initializeDeserialize(undefined);

    const result = editorUsjAdaptor.deserializeEditorState(editorState, standardViewOptions);

    // (2) Round-trip pin: a single clean optbreak, no duplicate and no added props.
    const para = result?.content?.[0] as MarkerObject;
    expect(para.content).toEqual([{ type: "optbreak" }]);
  });

  // The spaces around an optbreak are SIGNIFICANT (Paratext 9 preserves them byte-for-byte). Each
  // of the four spacing variants must round-trip through the editor unchanged and stay distinct
  // from the others — a lone single space next to the optbreak stays a plain space (Standard view
  // only maps runs of 2+ spaces to NBSP), so it survives the serialize -> parse -> deserialize trip.
  it.each([
    { name: "tight (one//two)", content: ["one", { type: "optbreak" }, "two"] },
    { name: "spaced both sides (one // two)", content: ["one ", { type: "optbreak" }, " two"] },
    { name: "leading space only (one //two)", content: ["one ", { type: "optbreak" }, "two"] },
    { name: "trailing space only (one// two)", content: ["one", { type: "optbreak" }, " two"] },
  ])("round-trips optbreak spacing variant $name unchanged", ({ content }) => {
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "p", content } as MarkerObject],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const state = serializeEditorState(usj, standardViewOptions);
    const editorState = editor.parseEditorState(state);
    initializeDeserialize(undefined);

    const result = editorUsjAdaptor.deserializeEditorState(editorState, standardViewOptions);

    const para = result?.content?.[0] as MarkerObject;
    expect(para.content).toEqual(content);
  });

  // Hardening pin composing the two pins above with TextSpacingPlugin.test.tsx's live "delete the
  // space before an optbreak" pin: a user deleting the space in a LIVE editor (TextSpacingPlugin
  // mounted, so the trailing-space transform is active and must not re-add what was just deleted)
  // must survive all the way to the editor -> USJ export — not just to the in-memory TextNode's
  // content, which TextSpacingPlugin.test.tsx already covers on its own.
  it("keeps a user-deleted space before an optbreak out of the serialized USJ", async () => {
    // Starting point: the "leading space only" variant pinned above.
    const usj: Usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: ["one ", { type: "optbreak" }, "two"],
        } as MarkerObject,
      ],
    };
    initializeSerialize(undefined, undefined);
    reset();
    const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
    const initialState = serializeEditorState(usj, standardViewOptions);

    const { editor: liveEditor } = await baseTestEnvironment(
      JSON.stringify({ root: initialState.root }),
      <TextSpacingPlugin />,
    );

    let textBeforeOptbreak: TextNode | undefined;
    let spaceOffset = 0;
    liveEditor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const found = para
        .getChildren()
        .find((child) => $isTextNode(child) && child.getTextContent() === "one ");
      if (!$isTextNode(found))
        throw new Error("Expected to find the 'one ' TextNode before the optbreak");
      textBeforeOptbreak = found;
      spaceOffset = found.getTextContentSize() - 1;
    });
    if (!textBeforeOptbreak) throw new Error("Failed to locate the TextNode before the optbreak");

    // Delete the trailing space live, with TextSpacingPlugin mounted — it must not re-add it.
    await deleteTextAtSelection(
      liveEditor,
      textBeforeOptbreak,
      spaceOffset,
      textBeforeOptbreak,
      spaceOffset + 1,
    );

    initializeDeserialize(undefined);
    const result = editorUsjAdaptor.deserializeEditorState(
      liveEditor.getEditorState(),
      standardViewOptions,
    );

    // The deletion survives the export: the space-less "tight" form pinned above, not "one "
    // reappearing because the transform re-added it.
    const para = result?.content?.[0] as MarkerObject;
    expect(para.content).toEqual(["one", { type: "optbreak" }, "two"]);
  });
});
