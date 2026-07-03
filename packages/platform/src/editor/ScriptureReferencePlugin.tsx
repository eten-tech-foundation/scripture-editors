import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { SerializedVerseRef } from "@sillsdev/scripture";
import {
  $getRoot,
  $getSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect, useRef } from "react";
import {
  $findChapter,
  $findNextChapter,
  $findThisChapter,
  $isBookNode,
  $isParaNode,
  BookNode,
  CURSOR_CHANGE_TAG,
  getSelectionStartNode,
  isVerseInRange,
  isVerseRange,
  removeNodeAndAfter,
  removeNodesBeforeNode,
  VerseNode,
} from "shared";
import {
  $findThisVerse,
  $findVerseOrPara,
  $getEffectiveVerseForBcv,
  $resolveVerseNode,
  ImmutableVerseNode,
} from "shared-react";

/*
 * ============================================================================================
 * HOW THIS PLUGIN WORKS - READ BEFORE CHANGING ANYTHING
 * ============================================================================================
 *
 * Contract: the host owns `scrRef`; this plugin (a) applies scrRef changes to the caret and
 * (b) reports genuine user caret moves back via `onScrRefChange`. Exactly two emission shapes
 * exist, both produced only by `report()`:
 *   - position report: chapter + verse read from the loaded document in ONE snapshot, with the
 *     book from that same snapshot's BookNode - falling back to the scrRef prop's book ONLY
 *     when the document has no book code (a book-less document cannot name its own book, and
 *     corrections never fire there, so the prop is the sole authority) - and the prop's
 *     versificationStr riding along (a document states no versification);
 *   - book correction: { ...scrRef, book: <document's book> } - the one deliberate mixed-source
 *     shape ("keep your position, fix the book"), for documents whose book differs from scrRef.
 *
 * Why this file is shaped the way it is - three async signals meet here, plus a feedback loop:
 *   1. the scrRef prop (the host's intent - never wrong, but everything else lags it);
 *   2. document content (arrives a USJ-load later than the intent it belongs to; a SUPERSEDED
 *      navigation's document can land after a NEWER navigation started);
 *   3. selection events (browser macrotasks; can describe positions that are already obsolete);
 *   4. our own emissions return as the scrRef prop (the echo loop).
 *
 * The races these caused (regression tests exist for each):
 *   R1 echo treated as navigation      -> caret yanked mid-typing
 *   R2 settle reported as a user move  -> verse resets to 0 (e.g. 78:9 -> 78:0 on reattach)
 *   R3 stale queued selectionchange    -> rapid navigation hijacked back to a previous target
 *   R4 superseded document lands late  -> navigation hijacked to an abandoned target
 *   R5 mixed-source emissions          -> references that describe no real position
 *   R6 doc mutations mid-navigation    -> old book echoed during cross-book navigation
 *
 * The machine: phase is "idle" or "navigating" (see NavPhase). While "navigating", this plugin
 * emits NOTHING (kills R2, R3, R4, R6). The window opens on any external scrRef change, after
 * emitting a book correction, or on a document REPLACEMENT while idle (a same-book reload's own
 * settle transiently resolves verse 0 - reporting it is the R2 clobber; pinned by test). It
 * closes on real user input (pointerdown/keydown/beforeinput on the root - beforeinput catches
 * IME/voice/paste input paths that move the selection without a pointerdown or keydown) or when
 * one of our own emissions echoes back as the prop. `pendingEchoes` (a FIFO, deliberately not a
 * boolean or a single slot) recognizes echoes (kills R1). `report()` enforces the two emission
 * shapes and dedupes (kills R5). `$resolvePosition` refuses to describe positions the document
 * cannot address; content before the first chapter of a loaded document addresses as chapter 1
 * verse 0 by USFM convention - verse 0 is DATA here, never a sentinel.
 *
 * Invariants (each backed by a named test in ScriptureReferencePlugin.test.tsx):
 *   I1 single-source        position reports come from one document snapshot (book falls back
 *                           to the prop only when the document has no book code;
 *                           versificationStr always rides from the prop - a document has none)
 *   I2 navigating-silence   zero emissions while navigating
 *   I3 echo-inert           echoed props never move the caret nor open a window
 *   I4 user-report          after user input, the next differing selection reports (sole
 *                           exception: the pending-echo dedupe trade-off below)
 *   I5 resolved-position    never emit a position the document cannot address
 *   I6 placement-book-gate  prop-driven placement never moves the caret in a different book's
 *                           document; arrival-driven placement targets the arriving document only
 *   I7 mount-correction     a mounted document with a mismatched book corrects the host once
 *   I8 verse-0-is-data      verse 0 reports from idle and applies as a target
 *
 * Documented trade-offs (deliberate; do not "fix" one without weighing its counterpart):
 *   - A late echo arriving after a newer external navigation cleared the queue is treated as a
 *     real navigation (pinned: "treats an echo arriving after a newer external navigation...").
 *   - A user selection equal to a STILL-PENDING echo of an earlier report is deduped, not
 *     re-emitted - report() cannot distinguish it from the echo. The host may briefly hold a
 *     newer ref than the caret; the next differing selection self-heals. Emitting instead would
 *     leave a never-consumed echo in the FIFO that would later swallow a REAL navigation to that
 *     ref - strictly worse. This is the sole exception to I4.
 *   - A cross-editor paste or undo that (re)creates a BookNode while a document is already loaded
 *     triggers neither placement nor a window: pastes must not teleport the caret (pinned).
 *
 * UNSAFE without re-running the full test suite AND the live Platform.Bible repros:
 *   - re-registering any listener on chapter/verse deps (skipInitialization replay fires against
 *     whatever document happens to be mounted - this exact mistake caused the NUM 27:1 bug);
 *   - emitting anything while phase === "navigating" (no "genuine jump" carve-outs: every such
 *     carve-out forces settle-shape classification, which is how verse-0 sentinels are born);
 *   - collapsing pendingEchoes to a boolean or single slot (two reports can be in flight);
 *   - building an emission from more than one source (except the book-correction shape and
 *     I1's documented no-book fallback).
 *
 * SAFE (additive) changes:
 *   - adding more events that close the window;
 *   - placement internals ($moveCursorToVerseStart), as long as it stays a pure caret move;
 *   - additional validity checks before report().
 * ============================================================================================
 */

/** "idle": selection changes are the user's. "navigating": an external scrRef change (or a book
 * correction we emitted) is still being applied; every emission is suppressed until real user
 * input on the editor ends the window or our own echo returns. */
type NavPhase = "idle" | "navigating";

/** All plugin state plus the latest wiring values, one mutable object shared by the handlers. */
interface Machine {
  phase: NavPhase;
  /** Emissions not yet seen back as the `scrRef` prop (FIFO, newest last). A queue, not a slot:
   * two reports can be in flight before the first echo returns. */
  pendingEchoes: SerializedVerseRef[];
  scrRef: SerializedVerseRef;
  onScrRefChange: (scrRef: SerializedVerseRef) => void;
  /** Whether a BookNode-created mutation has ever been observed. Distinguishes the mount of a
   * fresh editor (no window needed - a null selection or one already at scrRef) from a later
   * pure-created BookNode arriving while a document is already loaded (paste/undo - must not
   * teleport the caret). */
  sawDocument: boolean;
}

const MAX_PENDING_ECHOES = 8;

function refsEqual(a: SerializedVerseRef, b: SerializedVerseRef): boolean {
  return (
    a.book === b.book &&
    a.chapterNum === b.chapterNum &&
    a.verseNum === b.verseNum &&
    (a.verse ?? undefined) === (b.verse ?? undefined)
  );
}

/** Consume `ref` as an echo of an earlier emission. Consuming closes any open window: a returned
 * echo means the host and editor agree. Returns false when `ref` is not ours. */
function consumePendingEcho(machine: Machine, ref: SerializedVerseRef): boolean {
  const index = machine.pendingEchoes.findIndex((echo) => refsEqual(echo, ref));
  if (index < 0) return false;
  machine.pendingEchoes.splice(0, index + 1);
  machine.phase = "idle";
  return true;
}

/** The only caller of `onScrRefChange`. Drops emissions equal to the current prop or to a
 * pending echo. Returns whether an emission actually happened. */
function report(machine: Machine, ref: SerializedVerseRef): boolean {
  if (refsEqual(ref, machine.scrRef)) return false;
  if (machine.pendingEchoes.some((echo) => refsEqual(echo, ref))) return false;
  machine.pendingEchoes.push(ref);
  if (machine.pendingEchoes.length > MAX_PENDING_ECHOES) machine.pendingEchoes.shift();
  machine.onScrRefChange(ref);
  return true;
}

interface ResolvedPosition {
  /** The document's book code (first BookNode of the root); undefined when it has none. */
  book: string | undefined;
  chapterNum: number;
  verseNum: number;
  verse: string | undefined;
}

/** First BookNode of the root (documents put it first; strays after content are ignored). */
function $getFirstBookNode(): BookNode | undefined {
  let node = $getRoot().getFirstChild();
  while (node) {
    if ($isBookNode(node)) return node;
    node = node.getNextSibling();
  }
  return undefined;
}

/** Resolve the selection to a position the document can address, or undefined (no selection, or
 * an empty document). Content before the first chapter of a loaded document addresses as
 * chapter 1 per USFM convention (its verse resolves to 0). */
function $resolvePosition(): ResolvedPosition | undefined {
  const selection = $getSelection();
  const startNode = getSelectionStartNode(selection);
  if (!startNode) return undefined;

  // The unaddressable check needs the NODE's existence - a BookNode with an empty code still
  // makes a document addressable.
  const bookNode = $getFirstBookNode();
  const chapterNode = $findThisChapter(startNode);
  if (!chapterNode && !bookNode) return undefined;
  const chapterNum = chapterNode ? parseInt(chapterNode.getNumber() ?? "1", 10) : 1;
  if (Number.isNaN(chapterNum)) return undefined; // unaddressable - consistent with I5

  const verseNode = $resolveVerseNode(startNode, selection);
  const { verseNum, verse } = $getEffectiveVerseForBcv(verseNode ?? undefined, selection);
  if (Number.isNaN(verseNum)) return undefined; // unaddressable - consistent with I5
  return { book: bookNode?.getCode() || undefined, chapterNum, verseNum, verse };
}

/** isVerseInRange throws on malformed ranges (reversed, 3-part) from imported USFM; a malformed
 * range simply doesn't contain the verse. */
function verseInRangeSafe(verseNum: number, verseRange: string): boolean {
  try {
    return isVerseInRange(verseNum, verseRange);
  } catch {
    return false;
  }
}

/** Whether the resolved position is already what `scrRef` describes (verse-range aware). */
function positionMatchesScrRef(position: ResolvedPosition, scrRef: SerializedVerseRef): boolean {
  if (position.book && position.book !== scrRef.book) return false;
  if (position.chapterNum !== scrRef.chapterNum) return false;
  return position.verse
    ? verseInRangeSafe(scrRef.verseNum, position.verse)
    : scrRef.verseNum === position.verseNum;
}

function positionToScrRef(
  position: ResolvedPosition,
  hostRef: SerializedVerseRef,
): SerializedVerseRef {
  const ref: SerializedVerseRef = {
    book: position.book || hostRef.book,
    chapterNum: position.chapterNum,
    verseNum: position.verseNum,
  };
  if (position.verse != null) ref.verse = position.verse;
  // A document states no versification, so the host's rides along on every position report;
  // stripping it could map the reference to the wrong physical verse under a divergent
  // versification. refsEqual ignores it, so echo detection is unaffected.
  if (hostRef.versificationStr != null) ref.versificationStr = hostRef.versificationStr;
  return ref;
}

/** `propChanged`: echo of our own report, or an external navigation. */
function onPropChanged(machine: Machine, editor: LexicalEditor, newRef: SerializedVerseRef) {
  if (consumePendingEcho(machine, newRef)) return; // echoes never move the caret

  machine.phase = "navigating";
  machine.pendingEchoes.length = 0;
  // Prop-driven placement gate: never move the caret inside a different book's (stale) document.
  const contentBook = editor
    .getEditorState()
    .read(() => $getFirstBookNode()?.getCode() || undefined);
  if (!contentBook || contentBook === newRef.book) {
    editor.update(() => $moveCursorToVerseStart(newRef.chapterNum, newRef.verseNum), {
      tag: CURSOR_CHANGE_TAG,
    });
  }
}

/** `documentChanged`: the loaded document's book identity was established or changed. */
function onDocumentChanged(
  machine: Machine,
  editor: LexicalEditor,
  code: string | undefined,
  batch: { hasCreated: boolean; hasDestroyed: boolean },
) {
  if (machine.phase === "navigating") {
    // Silence - except the arrival of the document the navigation is waiting for.
    if (batch.hasCreated && code && code === machine.scrRef.book) {
      schedulePlacement(machine, editor);
    }
    if (batch.hasCreated) machine.sawDocument = true;
    return;
  }

  if (batch.hasCreated && batch.hasDestroyed) {
    // REPLACEMENT (LoadStatePlugin's setEditorState swap, in-editor book jump): the swap's own
    // synthetic selection settle fires before the deferred placement and must be silenced -
    // regardless of book match, since a same-book reload's transient chapter-top settle is the
    // R2 clobber this branch exists to prevent. The correction below (d), if any, runs after.
    schedulePlacement(machine, editor);
    machine.phase = "navigating";
  } else if (batch.hasCreated && !machine.sawDocument) {
    // MOUNT: fresh editor, no window needed - a null selection or one already at scrRef.
    schedulePlacement(machine, editor);
  }
  // else: a later pure-created BookNode (cross-editor paste, undo recreating a BookNode) while a
  // document is already loaded - neither placement nor a window. A paste must not teleport the
  // caret.
  if (batch.hasCreated) machine.sawDocument = true;

  // Book correction: "keep your position, fix the book". Emitting one opens a navigation window
  // (the swap's own synthetic selection settle fires before the deferred placement and must be
  // silenced); the correction's echo closes it. Runs after (a)-(c); under (a) phase is already
  // "navigating" here, so this assignment is harmless.
  if (code && code !== machine.scrRef.book) {
    if (report(machine, { ...machine.scrRef, book: code })) machine.phase = "navigating";
  }
}

/** Mutation listeners must not call editor.update synchronously (repo rule); defer one
 * microtask, as LoadStatePlugin does. Reads the latest scrRef at execution time. Deliberately
 * NOT book-gated at fire time: on an idle cross-book REPLACEMENT the book correction's echo is
 * still in flight when this fires, so scrRef.book still names the old book and a gate here
 * would skip the placement that makes the caret match the just-emitted correction. */
function schedulePlacement(machine: Machine, editor: LexicalEditor) {
  queueMicrotask(() => {
    editor.update(
      () => $moveCursorToVerseStart(machine.scrRef.chapterNum, machine.scrRef.verseNum),
      { tag: CURSOR_CHANGE_TAG },
    );
  });
}

/** `selectionSettled`: the caret is somewhere; the phase decides whose action that was.
 * `position` must be resolved by the caller (inline in the SELECTION_CHANGE_COMMAND listener,
 * not re-fetched in here via `editor.getEditorState()`): dispatchCommand always invokes that
 * listener inside an active editor-state context - a fresh implicit update, or, for the native
 * selectionchange path, the surrounding not-yet-committed update's pending state reused in place.
 * Reading `editor.getEditorState()` from a plain helper like this one would instead see the
 * *last committed* state, which on that nested/native path is one selection change stale - the
 * very commit still in flight - so a genuine settle would compare against the old position and be
 * silently dropped. */
function onSelectionSettled(machine: Machine, position: ResolvedPosition | undefined) {
  if (machine.phase === "navigating") return; // settles of an in-flight navigation are noise
  if (!position) return; // never report a position the document cannot address
  if (positionMatchesScrRef(position, machine.scrRef)) return;
  report(machine, positionToScrRef(position, machine.scrRef));
}

/** `userInteracted`: real input ends settling; what follows is the user's. */
function onUserInteracted(machine: Machine) {
  machine.phase = "idle";
}

/**
 * A component (plugin) that keeps the Scripture reference updated.
 * @param scrRef - Scripture reference.
 * @param onScrRefChange - Callback function when the Scripture reference has changed.
 * @returns null, i.e. no DOM elements.
 */
export default function ScriptureReferencePlugin({
  scrRef,
  onScrRefChange,
}: {
  scrRef: SerializedVerseRef;
  onScrRefChange: (scrRef: SerializedVerseRef) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const machineRef = useRef<Machine>({
    phase: "idle",
    pendingEchoes: [],
    scrRef,
    onScrRefChange,
    sawDocument: false,
  });

  // propChanged + keep wiring values fresh. Declared first so handlers below always see the
  // latest scrRef/onScrRefChange within the same effects flush.
  useEffect(() => {
    const machine = machineRef.current;
    const previous = machine.scrRef;
    machine.scrRef = scrRef;
    machine.onScrRefChange = onScrRefChange;
    if (!refsEqual(previous, scrRef)) onPropChanged(machine, editor, scrRef);
  }, [editor, scrRef, onScrRefChange]);

  // documentChanged: the single BookNode listener, registered once per editor.
  // skipInitialization: false replays the mounted document so mount-time placement and the
  // mount-time book correction work. Reads the FIRST BookNode of the root only - stray extra
  // BookNodes (malformed USJ, cross-editor paste) must not drive contradictory corrections.
  // Must register BEFORE the verse-node listener below: Lexical delivers mutation listeners in
  // registration order, and a document swap must flip phase to "navigating" here before the
  // verse listener's synchronous SELECTION_CHANGE_COMMAND dispatch is classified - reordering
  // reintroduces the R2 clobber (pinned by the swap-correction and view-option-toggle tests).
  useEffect(
    () =>
      editor.registerMutationListener(
        BookNode,
        (nodeMutations) => {
          const kinds = [...nodeMutations.values()];
          if (kinds.every((kind) => kind === "destroyed")) return;
          const code = editor
            .getEditorState()
            .read(() => $getFirstBookNode()?.getCode() || undefined);
          onDocumentChanged(machineRef.current, editor, code, {
            hasCreated: kinds.includes("created"),
            hasDestroyed: kinds.includes("destroyed"),
          });
        },
        { skipInitialization: false },
      ),
    [editor],
  );

  // selectionSettled
  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const machine = machineRef.current;
          if (machine.phase === "idle") onSelectionSettled(machine, $resolvePosition());
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  // Verse node destroyed - SELECTION_CHANGE_COMMAND won't fire if the cursor position didn't
  // change (e.g. cursor was at offset 0 of the node after the verse, and stays there after
  // deletion of the non-keyboard-selectable DecoratorNode). Must register AFTER the BookNode
  // listener above - see the registration-order note there.
  useEffect(() => {
    const onVerseDestroyed = (nodeMutations: Map<string, "created" | "updated" | "destroyed">) => {
      const hasCreatedOrDestroyedVerse = [...nodeMutations.values()].some(
        (m) => m === "created" || m === "destroyed",
      );
      // Defer to a microtask so this lands as a fresh top-level update instead of a nested commit
      // inside the current update's mutation-listener phase. Mutation listeners run mid-commit
      // (before update/history listeners); a synchronous SELECTION_CHANGE_COMMAND here spawns a
      // no-dirty selection commit whose stock-HistoryPlugin entry advances the undo baseline to the
      // post-mutation state *before* the triggering update's own history push runs. A Standard-view
      // Tier-2 rebuild that creates/destroys a verse (e.g. pasting `\p …\v 99 …`) would then push the
      // already-rebuilt state as the baseline, so a single Undo restores the identical-looking
      // rebuilt state instead of the pre-edit one. Deferring keeps the triggering edit one undo step
      // while still re-evaluating the reference.
      if (hasCreatedOrDestroyedVerse)
        queueMicrotask(() => editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined));
    };
    return mergeRegister(
      editor.registerMutationListener(ImmutableVerseNode, onVerseDestroyed),
      editor.registerMutationListener(VerseNode, onVerseDestroyed),
    );
  }, [editor]);

  // userInteracted: pointer/keyboard/beforeinput on the editor root is the only reliable signal
  // that programmatic settling is over and selection changes are the user's again. beforeinput
  // catches IME/voice/paste input paths that move the selection without a pointerdown or keydown.
  // ANY keydown counts, including pure modifiers and Escape: closing the window early fails
  // toward user control (worst case, one stale settle reports), while filtering keys fails
  // toward suppressing a real user move - eager close is the deliberate choice.
  useEffect(() => {
    const handleUserInput = () => onUserInteracted(machineRef.current);
    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("pointerdown", handleUserInput);
      prevRootElement?.removeEventListener("keydown", handleUserInput);
      prevRootElement?.removeEventListener("beforeinput", handleUserInput);
      rootElement?.addEventListener("pointerdown", handleUserInput);
      rootElement?.addEventListener("keydown", handleUserInput);
      rootElement?.addEventListener("beforeinput", handleUserInput);
    });
  }, [editor]);

  return null;
}

function $moveCursorToVerseStart(chapterNum: number, verseNum: number) {
  const startNode = getSelectionStartNode($getSelection());
  const selectedVerse = $findThisVerse(startNode)?.getNumber();
  if (selectedVerse && isVerseRange(selectedVerse) && verseInRangeSafe(verseNum, selectedVerse)) {
    return;
  }

  const children = $getRoot().getChildren();
  const chapterNode = $findChapter(children, chapterNum);
  if (!chapterNode) return;

  const nodesInChapter = removeNodesBeforeNode(children, chapterNode);
  const nextChapterNode = $findNextChapter(nodesInChapter, true);
  removeNodeAndAfter(nodesInChapter, nextChapterNode);
  // $findVerseOrPara (shared-react) walks every verse node with the same unguarded isVerseInRange
  // used above; a malformed range there must likewise not throw out of this listener.
  let verseOrParaNode;
  try {
    verseOrParaNode = $findVerseOrPara(nodesInChapter, verseNum);
  } catch {
    return;
  }
  if (!verseOrParaNode) return;

  if ($isParaNode(verseOrParaNode)) {
    const firstChild = verseOrParaNode.getFirstChild();
    if ($isTextNode(firstChild)) firstChild.select(0, 0);
    else verseOrParaNode.select(0, 0);
  } else verseOrParaNode.selectNext(0, 0);
}
