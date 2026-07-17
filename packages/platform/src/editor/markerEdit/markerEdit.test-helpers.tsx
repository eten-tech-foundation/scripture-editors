import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  ElementNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isNoteNode,
  CharNode,
  createMarkerLookup,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  NoteNode,
  StyleInfo,
  VerseNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

/** Narrow away `T | undefined` without a banned non-null assertion. */
export function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Standard-view options shared by the note test helpers below. */
export const viewOptions = requireDefined(
  getViewOptions(STANDARD_VIEW_MODE),
  "Standard view options are required for these tests.",
);

/** Mounts a headless editor with `MarkerEditPlugin` active in Standard view (markerMode "editable"). */
export async function testEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />,
  );
}

/** Like `testEnvironment`, but with a project-StyleInfo-backed MarkerLookup. */
export async function testEnvironmentWithSheet(
  $initialEditorState: () => void,
  styleInfo: StyleInfo,
) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin
      viewOptions={getViewOptions(STANDARD_VIEW_MODE)}
      getMarker={createMarkerLookup(styleInfo)}
    />,
  );
}

/**
 * Like `testEnvironment`, but also mounts `HistoryPlugin` so undo/redo commands are
 * available — for tests asserting that a Tier 2 rebuild coalesces into the triggering
 * edit's undo step rather than becoming a separate one.
 */
export async function historyTestEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <HistoryPlugin />
    </>,
  );
}

export function $appendCharPara(): { marker: MarkerNode; char: CharNode; closer: MarkerNode } {
  const para = $createParaNode("p");
  const paraMarker = $createMarkerNode("p");
  const char = $createCharNode("nd");
  const marker = $createMarkerNode("nd");
  const closer = $createMarkerNode("nd", "closing");
  $getRoot().append(
    para.append(
      paraMarker,
      $createTextNode(NBSP),
      char.append(marker, $createTextNode(`${NBSP}Lord`), closer),
    ),
  );
  return { marker, char, closer };
}

export function $appendVersePara(): { verse: VerseNode } {
  const para = $createParaNode("p");
  const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
  $getRoot().append(
    para.append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      verse,
      $createTextNode("In the beginning"),
    ),
  );
  return { verse };
}

/**
 * USX for a paragraph with an inline note. `closed` controls whether the note renders
 * expanded inline (`closed="false"` → PT9 `opennote`) or collapsed.
 */
// Footnote-content chars carry closed="false" in real ParatextData USJ (they never have their
// own closing markers) — fixtures mirror that so Tier-2 re-tokenization is a true fixed point.
export function noteUsx(
  noteAttrs: string,
  noteContent = `<char style="ft" closed="false">A note</char>`,
) {
  return usxStringToUsj(
    `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" />` +
      `<para style="p"><verse number="1" style="v" />text` +
      `<note caller="+" style="f" ${noteAttrs}>${noteContent}</note> after</para></usx>`,
  );
}

/** Serialize `usj` to a standard-view editor state string (root wrapper). */
export function serializedState(usj: ReturnType<typeof usxStringToUsj>): string {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  return JSON.stringify({ root: state.root });
}

/**
 * Mount a headless standard-view editor with `MarkerEditPlugin` active, containing an
 * inline-expanded (unclosed) note whose `\ft` content is a single char span.
 */
export async function renderStandardEditorWithUnclosedNote() {
  return baseTestEnvironment(
    serializedState(noteUsx(`closed="false"`)),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
}

/**
 * Mount a headless standard-view editor with `MarkerEditPlugin` active, containing a closed
 * (collapsed) note whose `\ft` content is a single char span.
 */
export async function renderStandardEditorWithCollapsedNote() {
  return baseTestEnvironment(
    serializedState(noteUsx("")),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
}

/** The single NoteNode in the tree (throws if not exactly one). */
export function findOnlyNote(root: ElementNode): NoteNode {
  const notes: NoteNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isNoteNode(node)) notes.push(node);
    if ($isElementNode(node)) node.getChildren().forEach(walk);
  };
  root.getChildren().forEach(walk);
  if (notes.length !== 1) throw new Error(`expected exactly one note, found ${notes.length}`);
  return notes[0];
}

/** The `\ft` content TextNode of the note (the one holding "A note"). */
export function $noteContentText(note: NoteNode): TextNode {
  const text = note
    .getChildren()
    .filter($isCharNode)
    .flatMap((char) => char.getChildren())
    .find(
      (node): node is TextNode => $isTextNode(node) && node.getTextContent().includes("A note"),
    );
  return requireDefined(text, "note content text node not found");
}
