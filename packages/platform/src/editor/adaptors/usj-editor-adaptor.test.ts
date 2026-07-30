// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { removeNoteCallerOnClick } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  CHAPTER_1_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  NOTE_CALLER_INDEX,
  NOTE_INDEX,
  NOTE_PARA_INDEX,
  NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
  VERSE_PARA_INDEX,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import { serializeEditorState, reset, initialize } from "./usj-editor.adaptor";
import {
  EMPTY_USJ,
  MarkerObject,
  Usj,
  usxStringToUsj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isTextNode,
  LexicalNode,
  NODE_STATE_KEY,
  SerializedElementNode,
  SerializedLexicalNode,
  SerializedTextNode,
} from "lexical";
import {
  $createImpliedParaNode,
  $createParaNode,
  $isCharNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  closingMarkerText,
  HIDDEN_NOTE_CALLER,
  ImmutableTypedTextNode,
  ImpliedParaNode,
  isSerializedBookNode,
  isSerializedCharNode,
  isSerializedImmutableChapterNode,
  isSerializedImmutableTypedTextNode,
  isSerializedMarkerNode,
  isSerializedNoteNode,
  isSerializedParaNode,
  isSerializedTextNode,
  MarkerNode,
  NBSP,
  NoteNode,
  openingMarkerText,
  ParaNode,
  SerializedCharNode,
  SerializedNoteNode,
  SerializedParaNode,
  textTypeState,
} from "shared";
import {
  $applyUpdate,
  $insertNote,
  defaultNoteCallers,
  LF,
  FORMATTED_VIEW_MODE,
  getDefaultViewOptions,
  getViewOptions,
  ImmutableNoteCallerNode,
  isSerializedImmutableNoteCallerNode,
  isSerializedImmutableVerseNode,
  isSomeSerializedVerseNode,
  SerializedImmutableNoteCallerNode,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
} from "shared-react";
import { MockInstance } from "vitest";

describe("USJ Editor Adaptor", () => {
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    // Spy on console methods before each test and provide mock implementations
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Restore console methods after each test to their original implementations
    consoleWarnSpy.mockRestore();
  });

  it("should convert from undefined USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(undefined);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from empty USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(EMPTY_USJ);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from USJ to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjGen1v1);

    const note = (serializedEditorState.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    expect(typeof noteCaller.onClick).toBe("function");
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateGen1v1);
  });

  it("should convert from USJ with empty implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedParaEmpty);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedParaEmpty);
  });

  it("should convert from USJ with implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedPara);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedPara);
  });

  it("should convert from USJ with nonstandard features to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1Nonstandard);

    expect(serializedEditorState).toEqual(editorStateGen1v1Nonstandard);
  });

  it("should convert from USJ to Lexical editor state JSON in visible marker mode", () => {
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleView);

    // Book marker rendered as typed-text marker with code and NBSP
    const book = serializedEditorState.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const bookMarker = book.children?.[0];
    if (!isSerializedImmutableTypedTextNode(bookMarker)) throw new Error("No book marker found");
    expect(bookMarker.textType).toBe("marker");
    expect(bookMarker.text).toBe(`${openingMarkerText("id")} GEN${NBSP}`);

    // Chapter is immutable with showMarker flag
    const chapter = serializedEditorState.root.children[CHAPTER_1_INDEX];
    if (!isSerializedImmutableChapterNode(chapter)) throw new Error("No chapter node found");
    expect(chapter.showMarker).toBe(true);

    // Para 'p' begins with a typed-text marker and NBSP
    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pFirst = pPara.children?.[0];
    if (!isSerializedImmutableTypedTextNode(pFirst)) throw new Error("No para marker found");
    expect(pFirst.textType).toBe("marker");
    expect(pFirst.text).toBe(`${openingMarkerText("p")}${NBSP}`);

    // Verse is immutable with showMarker flag
    const verse2 = pPara.children.find(
      (n: SerializedLexicalNode) => isSerializedImmutableVerseNode(n) && n.number === "2",
    );
    if (!isSerializedImmutableVerseNode(verse2)) throw new Error("Verse 2 not found");
    expect(verse2.showMarker).toBe(true);

    // Note has typed-text markers for open/close and immutable caller
    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX];
    if (!isSerializedParaNode(notePara)) throw new Error("No note para node found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    const noteChildren = note.children;
    const noteOpening = noteChildren[0];
    if (!isSerializedImmutableTypedTextNode(noteOpening)) throw new Error("No note opening marker");
    expect(noteOpening.textType).toBe("marker");
    expect(noteOpening.text).toBe(`${openingMarkerText("f")} `);
    const noteCaller = noteChildren[1];
    expect(isSerializedImmutableNoteCallerNode(noteCaller)).toBe(true);
    // Closing marker at the end with NBSP
    const noteClosing = noteChildren[noteChildren.length - 1];
    if (!isSerializedImmutableTypedTextNode(noteClosing)) throw new Error("No note closing marker");
    expect(noteClosing.textType).toBe("marker");
    expect(noteClosing.text).toBe(`${closingMarkerText("f")}`);

    // Note inner char 'fr' contains a typed marker as first child and text without NBSP
    const frChar = noteChildren.find((n) => isSerializedCharNode(n) && n.marker === "fr");
    if (!isSerializedCharNode(frChar)) throw new Error("No fr char found");
    const frFirst = frChar.children?.[0];
    expect(
      isSerializedImmutableTypedTextNode(frFirst) &&
        frFirst.textType === "marker" &&
        frFirst.text.startsWith(openingMarkerText("fr")),
    ).toBe(true);
    const frText = frChar.children?.find((n) => isSerializedTextNode(n));
    expect(isSerializedTextNode(frText) && frText.text.startsWith(NBSP)).toBe(false);
  });

  it("should add line breaks before verses when visible mode has no spacing", () => {
    const visibleCompact: ViewOptions = {
      markerMode: "visible",
      hasSpacing: false,
      isFormattedFont: false,
    };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleCompact);

    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pChildren: SerializedLexicalNode[] = pPara.children;
    const idxVerse2 = pChildren.findIndex((n) => isSomeSerializedVerseNode(n) && n.number === "2");
    expect(idxVerse2).toBeGreaterThan(0);
    expect(pChildren[idxVerse2 - 1].type).toBe("linebreak");
  });

  it("should render para markers but not inline char/verse markers in paragraph structure view", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
    );

    // Book \id begins with a typed-text marker (no book code suffix in gutter mode — the gutter
    // only shows the opening marker text, not the per-marker arguments).
    const book = serializedEditorState.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const bookMarker = book.children?.[0];
    if (!isSerializedImmutableTypedTextNode(bookMarker)) throw new Error("No book marker found");
    expect(bookMarker.textType).toBe("marker");
    expect(bookMarker.text).toBe(`${openingMarkerText("id")}${NBSP}`);

    // Para 'p' begins with a typed-text marker (rendered for the gutter to consume)
    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pFirst = pPara.children?.[0];
    if (!isSerializedImmutableTypedTextNode(pFirst)) throw new Error("No para marker found");
    expect(pFirst.textType).toBe("marker");
    expect(pFirst.text).toBe(`${openingMarkerText("p")}${NBSP}`);

    // Verse is immutable and does NOT show its inline marker (markerMode is "hidden")
    const verse2 = pPara.children.find(
      (n: SerializedLexicalNode) => isSerializedImmutableVerseNode(n) && n.number === "2",
    );
    if (!isSerializedImmutableVerseNode(verse2)) throw new Error("Verse 2 not found");
    expect(verse2.showMarker).toBeUndefined();

    // Char nodes in notes should not have inline typed-text markers
    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX];
    if (!isSerializedParaNode(notePara)) throw new Error("No note para node found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    const frChar = note.children.find((n) => isSerializedCharNode(n) && n.marker === "fr");
    if (!isSerializedCharNode(frChar)) throw new Error("No fr char found");
    const hasInlineMarker = frChar.children?.some((n) => isSerializedImmutableTypedTextNode(n));
    expect(hasInlineMarker).toBe(false);
  });

  it("should convert from USJ to Lexical editor state JSON in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    expect(serializedEditorState).toEqual(editorStateGen1v1Editable);
  });

  it("should render editable caller text and markers in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    const editableNoteParaNode = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(editableNoteParaNode)) throw new Error("Editable para not found");
    const noteNode = editableNoteParaNode.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(noteNode)) throw new Error("Editable note not found");
    const noteChildren = noteNode.children;
    // opening marker node for note
    expect(isSerializedMarkerNode(noteChildren[0])).toBe(true);
    // caller is editable text
    const callerNode = noteChildren[1];
    if (!isSerializedTextNode(callerNode)) throw new Error("Caller text not found");
    // Hard-coded display form (space + caller + NBSP separator) instead of the helper the
    // implementation itself calls, so a drift in that contract fails this test.
    expect(callerNode.text).toBe(` +${NBSP}`);
    // closing marker node for note appears later
    const hasClosingMarker = noteChildren.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(true);
  });

  it("maps NBSP to tilde in standard-view text content", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe("3~000 men");
  });

  it("maps NBSP to tilde in editable+expanded standard view (noteMode expanded)", () => {
    // Standard view with expanded notes is still standard-view text: the editable marker engine
    // runs, so the same NBSP->tilde display mapping MUST run too. Before the gating fix,
    // getViewMode returned undefined for editable+expanded, silently disabling this mapping while
    // the marker engine kept producing NBSP separators -> NBSP/tilde corruption.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const standard = getViewOptions(STANDARD_VIEW_MODE);
    if (!standard) throw new Error("standard view options not found");
    const expandedStandard = { ...standard, noteMode: "expanded" as const };
    const state = serializeEditorState(usj, expandedStandard);

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe("3~000 men");
  });

  it("maps NBSP to tilde in standard-view book id text", () => {
    // Book \id description text must be display-encoded like body text: the reverse adaptor
    // inverts display whitespace on ALL text nodes (book children included), so a stored NBSP
    // left raw here would corrupt to a plain space on save.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id">Ruth A${NBSP}B</book><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />Text</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const book = state.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const text = book.children?.find((child) => isSerializedTextNode(child));
    if (!isSerializedTextNode(text)) throw new Error("No book text found");
    expect(text.text).toBe("Ruth A~B");
  });

  it("displays a paragraph-leading space as NBSP in standard view", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"> Leading space text.</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("Leading"),
    ) as SerializedTextNode;
    expect(text.text).toBe(`${NBSP}Leading space text.`);
  });

  it("keeps a space plain when inline content precedes the first text node in standard view", () => {
    // The leading-space -> NBSP display rule is for paragraph-leading spaces only. Here the
    // first text node follows a char span, so its leading space sits mid-paragraph (after
    // \add*): it is already visible there and an NBSP would wrongly forbid line-wrap at that
    // point.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><char style="add">added text</char> plain.</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("plain"),
    ) as SerializedTextNode;
    expect(text.text).toBe(" plain.");
  });

  it("does not map NBSP in formatted view", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(FORMATTED_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe(`3${NBSP}000 men`);
  });

  it("renders an atomic note caller with editable markers in standard view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const notePara = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(notePara)) throw new Error("Note para not found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("Note not found");
    // Children: opening MarkerNode, ImmutableNoteCallerNode, NBSP text, content..., closing MarkerNode
    expect(isSerializedMarkerNode(note.children[0])).toBe(true);
    expect(isSerializedImmutableNoteCallerNode(note.children[1])).toBe(true);
    expect(isSerializedMarkerNode(note.children[note.children.length - 1])).toBe(true);
    expect(note.isCollapsed).toBe(true);
  });

  it("renders an unclosed note (closed=false) expanded even in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f" closed="false"><char style="ft">open note</char></note> after</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(false);
    // expanded editable layout uses editable caller TEXT, not an ImmutableNoteCallerNode
    expect(note.children.some((c) => isSerializedImmutableNoteCallerNode(c))).toBe(false);
    const callerTextNode = note.children[1];
    if (!isSerializedTextNode(callerTextNode)) throw new Error("Caller text not found");
    // Hard-coded display form (space + caller + NBSP separator) instead of the helper the
    // implementation itself calls, so a drift in that contract fails this test.
    expect(callerTextNode.text).toBe(` +${NBSP}`);
    // no synthesized closing marker for an unclosed note
    const hasClosingMarker = note.children.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(false);
    // round-trips the closed flag
    expect(JSON.stringify(note)).toContain(`"closed":"false"`);
  });

  it('renders no closing glyph for a closed="false" char span in editable mode', () => {
    // ParatextData emits closed="false" on every char span with no explicit closing marker
    // (near universal on footnote-content chars). Such spans must render WITHOUT a closing
    // glyph — mirroring the unclosed-note handling above — and round-trip the flag.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><char style="nd" closed="false">Lord</char></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const char = para.children.find((c) => isSerializedCharNode(c)) as SerializedCharNode;
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "opening"),
    ).toBe(true);
    // no synthesized closing marker for an unclosed span
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(false);
    // round-trips the closed flag
    expect(JSON.stringify(char)).toContain(`"closed":"false"`);
  });

  it('emits no closer and derives closed="false" for a footnote char with no closed attribute', () => {
    // Honesty rule: a footnote/cross-ref content char (here \fr) never has an explicit closer, so
    // the adaptor renders no closing glyph even when the source USJ omits `closed`. The derived
    // closed="false" must ride along so a downstream USFM writer emits no \fr* the source lacked.
    // The explicit-`closed` char case is pinned above; this pins the derived case.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><note caller="+" style="f"><char style="fr">1.1 </char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    // Editable mode renders closing glyphs for normal chars, so a missing closer is meaningful.
    const state = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    const frChar = note.children.find(
      (c) => isSerializedCharNode(c) && c.marker === "fr",
    ) as SerializedCharNode;
    expect(
      frChar.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "opening"),
    ).toBe(true);
    // no synthesized closer even though the source USJ carried no `closed` attribute
    expect(
      frChar.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(false);
    // the flag is derived (the source omitted it) and rides through unknownAttributes
    expect(frChar.unknownAttributes?.closed).toBe("false");
  });

  it("still collapses a closed note in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f"><char style="ft">closed note</char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(true);
    expect(note.children.some((c) => isSerializedImmutableNoteCallerNode(c))).toBe(true);
    const hasClosingMarker = note.children.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(true);
  });

  it("still renders editable caller text in unformatted view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const notePara = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(notePara)) throw new Error("Note para not found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("Note not found");
    expect(note.children.some((child) => isSerializedImmutableNoteCallerNode(child))).toBe(false);
  });

  it("should convert from USJ to Lexical editor state JSON including the hidden caller", () => {
    // Clone USJ and ensure the note caller is '-'
    const usjGen1v1Updated = JSON.parse(JSON.stringify(usjGen1v1));
    const usjNote = (
      (usjGen1v1Updated.content[NOTE_PARA_INDEX] as MarkerObject).content as MarkerObject[]
    )[NOTE_INDEX];
    usjNote.caller = HIDDEN_NOTE_CALLER;

    const serializedEditorState = serializeEditorState(usjGen1v1Updated);

    const editorStateCallerUpdated = editorStateGen1v1;
    const note = (editorStateCallerUpdated.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    note.caller = HIDDEN_NOTE_CALLER;
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    noteCaller.caller = HIDDEN_NOTE_CALLER;
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateCallerUpdated);
  });

  it("should convert from USJ with Marks to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
  });

  it("should call `addMissingComments` if it's set", () => {
    const mockAddMissingComments = vi.fn();
    const nodeOptions = { addMissingComments: mockAddMissingComments };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
    expect(mockAddMissingComments.mock.calls).toHaveLength(1); // called once
    // Called with `sid` array argument from `usjMarks`.
    expect(mockAddMissingComments.mock.calls[0][0]).toEqual(["1", "1", "2", "1", "2", "1", "2"]);
  });

  it("should convert from USJ with unknown items to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);
    reset();

    const serializedEditorState = serializeEditorState(usjWithUnknownItems);

    removeNoteCallerOnClick(serializedEditorState, NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX);
    expect(serializedEditorState).toEqual(editorStateWithUnknownItems);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(6);
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(1, "Unknown type-marker 'wat-z'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(2, "Unknown type-marker 'optbreak-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(3, "Unknown type-marker 'ref-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(4, "Unknown type-marker 'sidebar-esb'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(5, "Unknown type-marker 'periph-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(6, "Unknown type-marker 'figure-fig'!");
  });

  it("warns on an unknown char marker when no extra valid markers are configured", () => {
    initialize({}, console);
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "char", marker: "qqq", content: ["x"] } as MarkerObject],
    };

    serializeEditorState(usj);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected char marker 'qqq'"),
    );
  });

  it("does not warn on a char marker listed in extraValidMarkers", () => {
    initialize({ extraValidMarkers: ["qqq"] }, console);
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "char", marker: "qqq", content: ["x"] } as MarkerObject],
    };

    serializeEditorState(usj);

    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Unexpected char marker"),
    );
  });
});

describe("load/insert note drift pins", () => {
  // Marker glyph nodes are presentation-only (they never serialize to USJ), so every document
  // shows the LOAD path's glyph shapes after a save/reload. The insert path ($insertNote →
  // $createWholeNote / note-content chars) must build the identical shapes, or a freshly
  // inserted note is visibly different from the same note reloaded. These pins make that
  // agreement a test failure instead of a "keep in sync" comment.

  /** Note node classes needed to build a note via the insert path in a headless editor. */
  const insertPathNodes = [
    ParaNode,
    NoteNode,
    CharNode,
    ImmutableNoteCallerNode,
    ImmutableTypedTextNode,
    MarkerNode,
  ];

  /** USJ note equivalent to what `$insertNote("f", "+", …, GEN 1:5)` builds (fr + empty ft). */
  const usjWithFootnote = {
    ...EMPTY_USJ,
    content: [
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [
              { type: "char", marker: "fr", content: ["1:5 "] },
              { type: "char", marker: "ft" },
            ],
          },
          " after",
        ],
      } as MarkerObject,
    ],
  };

  /** Marker glyph texts (typed-text "marker" nodes) of a serialized note subtree, in order. */
  function serializedGlyphTexts(nodes: SerializedLexicalNode[]): string[] {
    const texts: string[] = [];
    const walk = (node: SerializedLexicalNode) => {
      if (isSerializedImmutableTypedTextNode(node) && node.textType === "marker")
        texts.push(node.text);
      const children = (node as Partial<SerializedElementNode>).children;
      children?.forEach(walk);
    };
    nodes.forEach(walk);
    return texts;
  }

  /** Marker glyph texts (typed-text "marker" nodes) of a live note subtree, in order. */
  function $liveGlyphTexts(node: LexicalNode): string[] {
    const texts: string[] = [];
    const $walk = (current: LexicalNode) => {
      if ($isImmutableTypedTextNode(current) && current.getTextType() === "marker")
        texts.push(current.getTextContent());
      if ($isElementNode(current)) current.getChildren().forEach($walk);
    };
    $walk(node);
    return texts;
  }

  /** The serialized note inside `usjWithFootnote`'s single para. */
  function serializedNote(state: ReturnType<typeof serializeEditorState>): SerializedNoteNode {
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const note = para.children.find((node) => isSerializedNoteNode(node));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    return note;
  }

  /** Build the same footnote through the INSERT path and read a result off the live note. */
  function withInsertedFootnote<T>(viewOptions: ViewOptions, $read: (note: NoteNode) => T): T {
    const { editor } = createBasicTestEnvironment(insertPathNodes);
    editor.update(
      () => {
        const text = $createTextNode("text after");
        $getRoot().append($createParaNode("p").append(text));
        text.select(4, 4);
      },
      { discrete: true },
    );
    let result: { value: T } | undefined;
    editor.update(
      () => {
        const note = $insertNote(
          "f",
          "+",
          undefined,
          { book: "GEN", chapterNum: 1, verseNum: 5 },
          viewOptions,
          {},
          undefined,
        );
        if (!note) throw new Error("Note was not inserted");
        result = { value: $read(note) };
      },
      { discrete: true },
    );
    if (!result) throw new Error("Note was not read");
    return result.value;
  }

  it("visible mode: an inserted footnote carries the same marker glyphs as a loaded one", () => {
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };
    initialize({}, console);
    reset();

    const loadedGlyphTexts = serializedGlyphTexts(
      serializedNote(serializeEditorState(usjWithFootnote, visibleView)).children,
    );

    // The load path's shape (pinned above in "visible marker mode"): opening glyph with a plain
    // space, bare char glyphs, closer without trailing space.
    expect(loadedGlyphTexts).toEqual([
      `${openingMarkerText("f")} `,
      openingMarkerText("fr"),
      openingMarkerText("ft"),
      closingMarkerText("f"),
    ]);

    expect(withInsertedFootnote(visibleView, $liveGlyphTexts)).toEqual(loadedGlyphTexts);
  });

  /** Comparable shape of a serialized note's char spans: marker, closed flag, child layout. */
  function serializedCharShapes(note: SerializedNoteNode): unknown[] {
    return note.children.filter(isSerializedCharNode).map((char) => ({
      marker: char.marker,
      closed: char.unknownAttributes?.closed,
      children: char.children.map((child) =>
        isSerializedMarkerNode(child)
          ? { glyphMarker: child.marker, markerSyntax: child.markerSyntax }
          : { text: (child as SerializedTextNode).text },
      ),
    }));
  }

  /** Comparable shape of a live note's char spans: marker, closed flag, child layout. */
  function $liveCharShapes(note: NoteNode): unknown[] {
    return note
      .getChildren()
      .filter($isCharNode)
      .map((char) => ({
        marker: char.getMarker(),
        closed: char.getUnknownAttributes()?.closed,
        children: char
          .getChildren()
          .map((child) =>
            $isMarkerNode(child)
              ? { glyphMarker: child.getMarker(), markerSyntax: child.getMarkerSyntax() }
              : { text: child.getTextContent() },
          ),
      }));
  }

  it("editable mode: an inserted footnote's char spans match a loaded one's (glyph + NBSP prefix)", () => {
    const standardView = getViewOptions(STANDARD_VIEW_MODE);
    if (!standardView) throw new Error("Standard view options are required");
    initialize({}, console);
    reset();

    const loadedCharShapes = serializedCharShapes(
      serializedNote(serializeEditorState(usjWithFootnote, standardView)),
    );

    // The load path's shape: each char span opens with its MarkerNode glyph; real content
    // carries the structural NBSP prefix; an empty span holds the lone-NBSP placeholder; the
    // implicitly-closed note-content chars carry closed="false" and no closing glyph.
    expect(loadedCharShapes).toEqual([
      {
        marker: "fr",
        closed: "false",
        children: [{ glyphMarker: "fr", markerSyntax: "opening" }, { text: `${NBSP}1:5 ` }],
      },
      {
        marker: "ft",
        closed: "false",
        children: [{ glyphMarker: "ft", markerSyntax: "opening" }, { text: NBSP }],
      },
    ]);

    expect(withInsertedFootnote(standardView, $liveCharShapes)).toEqual(loadedCharShapes);
  });
});

describe("load/delta para prefix drift pin", () => {
  // The adaptor's `createPara` (load), the marker-edit engine's `$createMarkerPrefix` (pinned
  // against the adaptor in markerEditDeletion.utils.test.tsx), and the collab delta path's
  // paragraph materialization (`$applyUpdate` handling a remote insert-paragraph op) all build
  // the editable `[glyph, separator]` paragraph prefix. Every layout and caret computation
  // assumes the shapes are identical — most critically the separator's exact-NBSP text, token
  // mode, and marker-trailing-space tag, which keep typed text out of the separator and out of
  // serialized USJ. This pin makes disagreement a test failure instead of a "keep in sync"
  // comment.
  it("a delta-inserted paragraph carries the same [glyph, separator] prefix the adaptor loads", () => {
    interface PrefixShape {
      glyphMarker?: string;
      glyphSyntax?: string;
      separatorText?: string;
      separatorMode?: string;
      separatorTextType?: unknown;
    }
    const standardView = getViewOptions(STANDARD_VIEW_MODE);
    if (!standardView) throw new Error("Standard view options are required");

    // Delta side: a remote insert-paragraph op materialized into a live tree.
    const { editor } = createBasicTestEnvironment([ParaNode, ImpliedParaNode, MarkerNode], () => {
      $getRoot().append($createImpliedParaNode());
    });
    let delta: PrefixShape = {};
    editor.update(
      () => {
        $applyUpdate([{ insert: LF, attributes: { para: { style: "q1" } } }], standardView, {});
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("No para node materialized");
        const [glyphNode, separatorNode] = para.getChildren();
        if ($isMarkerNode(glyphNode))
          delta = { glyphMarker: glyphNode.getMarker(), glyphSyntax: glyphNode.getMarkerSyntax() };
        if ($isTextNode(separatorNode) && !$isMarkerNode(separatorNode))
          delta = {
            ...delta,
            separatorText: separatorNode.getTextContent(),
            separatorMode: separatorNode.getMode(),
            separatorTextType: $getState(separatorNode, textTypeState),
          };
      },
      { discrete: true },
    );

    // Load side: the same `\q1` paragraph serialized by the adaptor under identical options.
    initialize({}, console);
    reset();
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "q1", content: ["hi"] } as MarkerObject],
    };
    const state = serializeEditorState(usj, standardView);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const [glyph, separator] = para.children;
    if (!isSerializedMarkerNode(glyph)) throw new Error("No para marker glyph found");
    if (!isSerializedTextNode(separator)) throw new Error("No separator found");
    const stateObject: unknown = separator[NODE_STATE_KEY];
    const loaded: PrefixShape = {
      glyphMarker: glyph.marker,
      glyphSyntax: glyph.markerSyntax,
      separatorText: separator.text,
      separatorMode: separator.mode,
      separatorTextType:
        stateObject && typeof stateObject === "object" && "textType" in stateObject
          ? stateObject.textType
          : undefined,
    };

    // Sanity-pin the load shape itself so both sides drifting together still fails loudly.
    expect(loaded).toEqual({
      glyphMarker: "q1",
      glyphSyntax: "opening",
      separatorText: NBSP,
      separatorMode: "token",
      separatorTextType: "marker-trailing-space",
    });

    expect(delta).toEqual(loaded);
  });
});

describe("char-span attribute display (editable mode)", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** A one-paragraph USJ document wrapping a single char span. */
  function usjWithChar(charObject: MarkerObject): Usj {
    return {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "p", content: [charObject] } as MarkerObject],
    };
  }

  /** Serializes `usj` and returns its paragraph's single char span. */
  function firstChar(usj: Usj, viewOptions?: ViewOptions): SerializedCharNode {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, viewOptions);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const char = para.children.find((c) => isSerializedCharNode(c));
    if (!isSerializedCharNode(char)) throw new Error("No char node found");
    return char;
  }

  it("renders a lone default attribute collapsed, between content and closer", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "w",
        lemma: "grace",
        content: ["word"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children).toHaveLength(4);
    const [opening, content, attribute, closing] = char.children;
    expect(isSerializedMarkerNode(opening) && opening.markerSyntax === "opening").toBe(true);
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe(`${NBSP}word`);
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe("|grace");
    expect(textTypeOf(attribute)).toBe("attribute");
    expect(isSerializedMarkerNode(closing) && closing.markerSyntax === "closing").toBe(true);
  });

  it("renders multiple attributes named, insertion order", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "w",
        lemma: "grace",
        strong: "G5485",
        content: ["word"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = char.children.find((n) => textTypeOf(n) === "attribute");
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe('|lemma="grace" strong="G5485"');
  });

  it("renders named form for a non-default lone attribute", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "nd",
        "x-custom": "y",
        content: ["Lord"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = char.children.find((n) => textTypeOf(n) === "attribute");
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe('|x-custom="y"');
  });

  it("builds no run for closed-only unknownAttributes (footnote content chars)", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "ft",
        closed: "false",
        content: ["note"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(false);
  });

  it("builds no run on an unclosed span", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "nd",
        closed: "false",
        lemma: "x",
        content: ["a"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
  });

  it("builds no run in visible/hidden marker modes", () => {
    const usj = usjWithChar({
      type: "char",
      marker: "w",
      lemma: "grace",
      content: ["word"],
    } as MarkerObject);

    const visibleChar = firstChar(usj, { ...getDefaultViewOptions(), markerMode: "visible" });
    expect(visibleChar.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);

    const hiddenChar = firstChar(usj, { ...getDefaultViewOptions(), markerMode: "hidden" });
    expect(hiddenChar.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
  });
});
