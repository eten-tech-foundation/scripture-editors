import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import {
  MarkerContent,
  MarkerObject,
  usxStringToUsj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setState,
  ElementNode,
  LexicalEditor,
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
  $reportDestroyedDisplayOwner,
  AttributeRunNode,
  CharNode,
  createMarkerLookup,
  getVisibleOpenMarkerText,
  LoggerBasic,
  MarkerNode,
  MilestoneNode,
  NBSP,
  NoteNode,
  StyleInfo,
  textTypeState,
  usfmFragmentToUsjContent,
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

/**
 * Simulates the user retyping `glyph`'s bytes LIVE: writes `text` and leaves the collapsed caret
 * at its end, the way real typing does. A caret-less glyph byte write is MACHINE drift, which the
 * engine heals in place (glyphDriftHeal.test.tsx) — a test simulating a user edit must carry
 * either the caret (this helper) or a pend-ledger entry ({@link $pendGlyphEdit}).
 */
export function $retypeGlyph(glyph: TextNode, text: string): void {
  glyph.setTextContent(text);
  glyph.select(text.length, text.length);
}

/**
 * Simulates a RESTORED or ABANDONED pending glyph edit — the undo shape, where
 * `$rependPendShapedNodes` re-derives every damaged literal's pend caret-lessly from the restored
 * bytes: writes `text` and records the glyph in the engine's live pend ledger through
 * `$reportDestroyedDisplayOwner`, the sync's public write channel into the same Set. The recorded
 * pend is what tells the engine's heal this divergence is a USER edit even with no caret at it.
 * Use where a test needs SEVERAL pends at once (live typing can hold only one — the caret departs
 * the first to make the second, settling it) or a pend with no caret anywhere (a blur sweep, a
 * read-only settle).
 */
export function $pendGlyphEdit(glyph: TextNode, text: string): void {
  glyph.setTextContent(text);
  $reportDestroyedDisplayOwner(glyph);
}

/**
 * Commits a damaged-glyph settle needs: the edit itself, the graced follow-up, the departure, and
 * the settle's own rebuild plus its fixed-point follow-up. Generous — the point is to separate
 * "terminates" from "does not", not to pin an exact number that churns with unrelated work.
 */
export const COMMIT_BOUND = 20;

export interface CommitBound {
  /** Start counting `editor`'s commits. Call once, right after mounting. */
  watch: (editor: LexicalEditor) => void;
  /** Commits counted so far. */
  commits: () => number;
  /**
   * Collects the engine's warnings. Pass it to the environment and assert the settle-cascade
   * backstop stayed silent: the backstop's own ceiling is BELOW `COMMIT_BOUND`, so a regressed
   * root fix that only the backstop catches would otherwise slip through the commit assertion
   * looking healthy. The backstop is a backstop; these tests are about not needing it.
   */
  logger: LoggerBasic;
  /** Warnings the engine logged so far. */
  warnings: () => string[];
}

/**
 * Runs `body` with every watched commit counted and the engine's deferred settle hard-stopped once
 * the count passes `COMMIT_BOUND`.
 *
 * The stop is what makes a regression FAIL rather than HANG. The engine defers each settle with
 * `queueMicrotask`, and a cascade that re-queues on every commit never yields to the macrotask
 * queue, so no timer — including vitest's own timeout — ever runs again. Dropping deferrals once
 * the commit count has already proven the loop lets the assertion report it instead.
 */
export async function withCommitBound(body: (bound: CommitBound) => Promise<void>): Promise<void> {
  let commits = 0;
  const warnings: string[] = [];
  const originalQueueMicrotask = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (callback: () => void) => {
    if (commits > COMMIT_BOUND) return;
    originalQueueMicrotask(callback);
  };
  try {
    await body({
      watch: (editor) =>
        editor.registerUpdateListener(() => {
          commits += 1;
        }),
      commits: () => commits,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: (message: string) => warnings.push(message),
        error: () => undefined,
      },
      warnings: () => warnings,
    });
  } finally {
    globalThis.queueMicrotask = originalQueueMicrotask;
  }
}

/** Standard-view options shared by the note test helpers below. */
export const viewOptions = requireDefined(
  getViewOptions(STANDARD_VIEW_MODE),
  "Standard view options are required for these tests.",
);

/** Standard view but with expanded notes — the editable+expanded survivability combination. */
export const expandedViewOptions = { ...viewOptions, noteMode: "expanded" as const };

/**
 * Mounts a headless editor with `MarkerEditPlugin` active in Standard view (markerMode
 * "editable"). `markerSettleDelayMs` is passed straight to the engine — the idle-settle delay
 * override (default clock when omitted, `0` commit-adjacent, `-1` disabled).
 */
export async function testEnvironment(
  $initialEditorState: () => void,
  markerSettleDelayMs?: number,
) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin
      viewOptions={getViewOptions(STANDARD_VIEW_MODE)}
      markerSettleDelayMs={markerSettleDelayMs}
    />,
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
 * Like `testEnvironment`, but with EVERY display-run sync the real app mounts — `CharNodePlugin`
 * and `TextSpacingPlugin` around the engine, in `Editor.tsx`'s own order. The narrower helpers
 * above each omit one of them, which is fine for a test scoped to one kind's sync but hides
 * cross-plugin interactions: the settle-loop freeze needed the CHAR sync's adjacent-span merge and
 * the VERSE run's pend/settle in the same tree, and reproduces on neither helper alone.
 *
 * `logger` is optional and passed straight to the engine — the settle-cascade backstop reports
 * itself only through `logger.warn`, so a test asserting the backstop fired needs one.
 */
export async function testEnvironmentWithDisplaySyncs(
  $initialEditorState: Parameters<typeof baseTestEnvironment>[0],
  logger?: LoggerBasic,
) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} logger={logger} />
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
 * Like `testEnvironmentWithCharSync` (app mount order only), but also mounts `HistoryPlugin` — for
 * undo/redo pins on a char-attribute-run fixture, where both the self-healing sync AND undo
 * availability are needed at once (`historyTestEnvironment` alone has no `CharNodePlugin`, and the
 * sibling char-attribute suites that need the sync have no `HistoryPlugin`).
 */
export async function testEnvironmentWithCharSyncAndHistory($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <HistoryPlugin />
    </>,
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
 * the same shape the milestone descriptor's `expectedPieces` (displayRun/displayRunRegistry.ts)
 * derives — or `""` for a glyph pair with no attribute text between them.
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
 * The single note object inside `content`, at any depth. Comparing NOTES rather than whole
 * documents lets a fixture keep whatever paragraph shape it likes while still being checked
 * against real USFM bytes.
 */
export function findUsjNote(content: MarkerContent[] | undefined): MarkerObject {
  const found: MarkerObject[] = [];
  const walk = (items: MarkerContent[] | undefined) =>
    items?.forEach((item) => {
      if (typeof item !== "object") return;
      if (item.type === "note") found.push(item);
      walk(item.content);
    });
  walk(content);
  if (found.length !== 1)
    throw new Error(`expected exactly one note in USJ, found ${found.length}`);
  return found[0];
}

/**
 * The note the editor currently SERIALIZES to — what the file gets, as opposed to what the screen
 * shows. Display bytes (marker glyphs, structural separators) are excluded by the adaptor, so a
 * difference here is a difference in the document.
 */
export function usjNoteOf(editor: LexicalEditor): MarkerObject {
  initializeDeserialize(undefined);
  const usj = requireDefined(
    editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions),
    "editor state did not serialize to USJ",
  );
  return findUsjNote(usj.content);
}

/**
 * The note `usfm` means, straight from the tokenizer — the oracle a serialized note is compared
 * against, so an assertion states the BYTES it expects rather than a hand-built object graph.
 */
export function usjNoteFromUsfm(usfm: string): MarkerObject {
  return findUsjNote(usfmFragmentToUsjContent(usfm));
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
