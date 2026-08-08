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
  $setState,
  ElementNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createAttributeRunNode,
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isAttributeRunNode,
  $isCharNode,
  $isNoteNode,
  AttributeRunNode,
  CharNode,
  createMarkerLookup,
  getVisibleOpenMarkerText,
  MarkerNode,
  MilestoneNode,
  NBSP,
  NoteNode,
  StyleInfo,
  textTypeState,
  VerseNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  CharNodePlugin,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
} from "shared-react";

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

/** Standard view but with expanded notes — the editable+expanded survivability combination. */
export const expandedViewOptions = { ...viewOptions, noteMode: "expanded" as const };

/** Mounts a headless editor with `MarkerEditPlugin` active in Standard view (markerMode "editable"). */
export async function testEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />,
  );
}

/**
 * Like `testEnvironment`, but also mounts `TextSpacingPlugin` — the shared-react home of the
 * self-healing `\va`/`\vp` display-run sync. Needed for verse attribute-run tests where the sync
 * (which would re-derive a just-deleted run from the still-set altnumber/pubnumber) and the
 * marker-edit engine's pend/settle must interact, matching the real app's plugin stack.
 */
export async function testEnvironmentWithSpacing($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <TextSpacingPlugin />
    </>,
  );
}

/**
 * Like `testEnvironment`, but also mounts `CharNodePlugin` — the shared-react home of the
 * self-healing char attribute-run sync — for tests where the sync and the engine's pend/settle
 * must interact, matching the real app's plugin stack.
 *
 * `pluginOrder` picks which of the two plugins mounts first. They are registered by independently
 * ordered host components — Lexical runs a node's transforms in registration order, so whichever
 * plugin's `CharNode` transform registers first is the one that runs first whenever a char span is
 * dirtied — so a fix that only works under ONE order is not actually fixed for hosts using the
 * other. `"app"` (the default) matches `Editor.tsx`'s real mount order (`CharNodePlugin` before
 * `MarkerEditPlugin`); `"engine-first"` is the inverse, kept as an explicit regression check so a
 * future change that reintroduces an order dependency fails loudly under at least one of the two.
 */
export async function testEnvironmentWithCharSync(
  $initialEditorState: () => void,
  pluginOrder: "app" | "engine-first" = "app",
) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    pluginOrder === "app" ? (
      <>
        <CharNodePlugin />
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      </>
    ) : (
      <>
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
        <CharNodePlugin />
      </>
    ),
  );
}

/**
 * Like `testEnvironment`, but in Standard view with EXPANDED notes (`markerMode: "editable"`,
 * `noteMode: "expanded"`) — the combination that used to make `getViewMode` return undefined and
 * silently disable the standard-view whitespace machinery.
 */
export async function testEnvironmentExpanded($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={expandedViewOptions} />,
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
 * Append a WRAPPED `\va`/`\vp` display run to `verse` — the shape usj-editor.adaptor's
 * `addVerseAttributeRun` builds post-flip: one `AttributeRunNode` (runKind `marker`) holding the
 * opening glyph, the NBSP-prefixed value TextNode (textType "attribute"), and the closing glyph.
 * Inserted after `verse`'s LAST existing run wrapper (so a `va` call followed by a `vp` call chains
 * correctly), or directly after `verse` itself when none exists yet.
 */
export function $appendVerseAttributeRun(
  verse: VerseNode,
  marker: "va" | "vp",
  value: string,
): AttributeRunNode {
  const wrapper = $createAttributeRunNode(marker);
  const valueNode = $createTextNode(`${NBSP}${value}`);
  $setState(valueNode, textTypeState, "attribute");
  wrapper.append(
    $createMarkerNode(marker, "opening"),
    valueNode,
    $createMarkerNode(marker, "closing"),
  );
  let anchor: LexicalNode = verse;
  let next = anchor.getNextSibling();
  while ($isAttributeRunNode(next)) {
    anchor = next;
    next = anchor.getNextSibling();
  }
  anchor.insertAfter(wrapper);
  return wrapper;
}

/**
 * Append a WRAPPED display run to `milestone` — the shape usj-editor.adaptor's
 * `addMilestoneAttributeRun` builds post-flip: one `AttributeRunNode` (runKind "milestone") holding
 * the opening glyph, an optional attribute TextNode (textType "attribute"), and the self-closing
 * glyph. `attributeText` is the FULL canonical bytes (NBSP-prefixed, e.g. `${NBSP}|sid="q1"`) —
 * the same shape `$milestoneAttributeDisplayText` (markerEditTier1.utils.ts) returns — or `""` for
 * a glyph pair with no attribute text between them.
 */
export function $appendMilestoneRun(
  milestone: MilestoneNode,
  attributeText: string,
): AttributeRunNode {
  const wrapper = $createAttributeRunNode("milestone");
  wrapper.append($createMarkerNode(milestone.getMarker(), "opening"));
  if (attributeText) {
    const valueNode = $createTextNode(attributeText);
    $setState(valueNode, textTypeState, "attribute");
    wrapper.append(valueNode);
  }
  wrapper.append($createMarkerNode("", "selfClosing"));
  milestone.insertAfter(wrapper);
  return wrapper;
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

/**
 * jsdom doesn't implement `ClipboardEvent`/`DataTransfer`; the copy/cut handlers under test only
 * touch `clipboardData.getData`/`setData`/`preventDefault`, so a minimal stub covers both dispatch
 * and direct-call sites. Shared by every suite that dispatches `COPY_COMMAND`/`CUT_COMMAND`.
 */
export function copyEvent(): { event: ClipboardEvent; getData: (type: string) => string } {
  const store = new Map<string, string>();
  const clipboardData = {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, data: string) => {
      store.set(type, data);
    },
  };
  return {
    event: { clipboardData, preventDefault: vi.fn() } as unknown as ClipboardEvent,
    getData: (type: string) => clipboardData.getData(type),
  };
}

/**
 * jsdom-safe paste-event stub carrying an arbitrary clipboard MIME payload. `types`/`files` are
 * populated so Lexical's own default paste handling (reached whenever a Standard-view/protection
 * handler declines and the dispatch falls through to a lower-priority `PASTE_COMMAND` listener)
 * can duck-type it the same way a real `ClipboardEvent` would — jsdom implements neither
 * `ClipboardEvent` nor `DataTransfer`. Shared by every suite that dispatches `PASTE_COMMAND` or
 * calls a paste handler directly.
 */
export function pasteEvent(payload: { [key: string]: string }): {
  event: ClipboardEvent;
  prevented: () => boolean;
} {
  const store = new Map(Object.entries(payload));
  const preventDefault = vi.fn();
  const clipboardData = {
    types: [...store.keys()],
    files: [],
    getData: (type: string) => store.get(type) ?? "",
  };
  return {
    event: { clipboardData, preventDefault } as unknown as ClipboardEvent,
    prevented: () => preventDefault.mock.calls.length > 0,
  };
}

/** A paste event whose only payload is `text/plain` — what pasting from a plain-text source
 * (terminal, text editor, address bar) delivers. */
export function plainTextPasteEvent(text: string): ClipboardEvent {
  return pasteEvent({ "text/plain": text }).event;
}
