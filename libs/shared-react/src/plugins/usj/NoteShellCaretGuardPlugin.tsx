import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  LexicalNode,
  PointType,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect, useRef } from "react";
import {
  $isMarkerNode,
  $isNoteNode,
  $noteEditableCallerNode,
  $placeCaretAtBoundary,
  CURSOR_CHANGE_TAG,
  NoteNode,
} from "shared";

/**
 * An expanded note's SHELL — its leading opening glyph(s) and its editable caller, the `\f + ` a
 * reader sees — as the nodes that carry it, or an empty list when this note has no protected shell.
 *
 * Read off the nodes' MODE rather than the view options, the same way every other note rule is read
 * off the tree: the adaptor puts exactly these nodes in `token` mode when the host governs the
 * marker and the caller through its own UI (`ViewOptions.isNoteShellEditable: false`), so a view
 * that leaves the shell editable builds `normal` nodes and every rule here is structurally a no-op
 * for it. Nothing has to stay in sync with a flag.
 */
function $noteShellNodes(note: NoteNode): LexicalNode[] {
  if (note.getIsCollapsed() !== false) return [];
  const shell: LexicalNode[] = [];
  for (const child of note.getChildren()) {
    if (!$isMarkerNode(child) || child.getMarkerSyntax() !== "opening") break;
    shell.push(child);
  }
  const caller = $noteEditableCallerNode(note);
  if (caller) shell.push(caller);
  // Protected only when the adaptor marked it so. A partly-token shell is not a shape the adaptor
  // builds; requiring ALL of it keeps this from half-applying to one it did not.
  return shell.length > 0 && shell.every((node) => $isTextNode(node) && node.getMode() === "token")
    ? shell
    : [];
}

/** The note whose protected shell `node` belongs to, or `undefined`. */
function $shellOwner(node: LexicalNode): NoteNode | undefined {
  const note = node.getParent();
  if (!$isNoteNode(note)) return undefined;
  return $noteShellNodes(note).some((shellNode) => shellNode.is(node)) ? note : undefined;
}

/**
 * The boundary index just past `note`'s shell — the start of the note's own content, and the only
 * caret position at the shell's trailing edge that is inside the note.
 */
function $contentStartIndex(note: NoteNode): number {
  const shell = $noteShellNodes(note);
  const last = shell[shell.length - 1];
  return last ? last.getIndexWithinParent() + 1 : 0;
}

/** `note`'s own child that contains `node`, or `undefined` when `node` is not inside `note`. */
function $noteChildContaining(note: NoteNode, node: LexicalNode): LexicalNode | undefined {
  for (let cursor: LexicalNode | null = node; cursor; cursor = cursor.getParent())
    if (note.is(cursor.getParent())) return cursor;
  return undefined;
}

/**
 * Whether the caret reached the shell from the note's CONTENT side — which is what a leftward move
 * out of the note looks like, and the one case where pushing it forward again would trap it.
 *
 * Taken from the PREVIOUS selection because the shell is crossed whole in either direction and the
 * landing point alone cannot say which way the user was going. Anything else — a rightward move
 * from before the note, no previous selection at all — reads as travelling forward, which is also
 * the safe default: forward lands in editable content.
 *
 * Only asked of a KEYBOARD move. A pointer is not travelling anywhere — it names a destination
 * outright — so the previous caret says nothing about the user's intent, and reading it as a
 * direction sends a click away from the note it landed in. That is not hypothetical: a popover
 * that focuses its editor with no selection parks the caret at the document end, which for a
 * document holding one note is that note's own closing glyph — so the FIRST click on the shell
 * read as "coming from the content side" and threw the caret past the whole note.
 */
function $arrivedFromContentSide(note: NoteNode): boolean {
  const previous = $getPreviousSelection();
  if (!$isRangeSelection(previous)) return false;
  const { anchor } = previous;
  const node = anchor.getNode();
  if (note.is(node)) return anchor.offset >= $contentStartIndex(note);
  const child = $noteChildContaining(note, node);
  return child !== undefined && child.getIndexWithinParent() >= $contentStartIndex(note);
}

/**
 * The note whose shell `point` rests in ILLEGITIMATELY, or `undefined`.
 *
 * Exactly one offset in the whole shell is a caret position: the trailing edge of its last node.
 * Lexical's `token` mode redirects an insertion at a token node's boundary to a sibling, and only
 * there does it pick the right one — a fresh node after the caller, which is the start of the
 * note's content. At the shell's LEADING edge it inserts a text node inside the note before the
 * opening glyph (a `NoteNode` does not refuse text before it), and at the seam between the glyph
 * and the caller it inserts BETWEEN them. Every other offset is strictly inside a token node,
 * where an insertion replaces that node outright.
 *
 * So the trailing edge is where this guard puts the caret, and the one place it leaves alone —
 * which is also what stops it from correcting its own correction.
 */
function $shellAt(point: PointType): NoteNode | undefined {
  if (point.type !== "text") return undefined;
  const node = point.getNode();
  const note = $shellOwner(node);
  if (!note) return undefined;
  return $isShellTrailingEdge(note, node, point.offset) ? undefined : note;
}

/** Whether `point` is at the shell's trailing edge — the caret position just past `\f + `. */
function $isShellTrailingEdge(note: NoteNode, node: LexicalNode, offset: number): boolean {
  const shell = $noteShellNodes(note);
  const last = shell[shell.length - 1];
  return last !== undefined && last.is(node) && offset === last.getTextContentSize();
}

/** Collapse the caret to the shell's trailing edge, the start of the note's own content. */
function $placeAtShellTrailingEdge(note: NoteNode): void {
  const shell = $noteShellNodes(note);
  const last = shell[shell.length - 1];
  if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize());
  else $placeCaretAtBoundary(note, $contentStartIndex(note));
}

/**
 * Move a caret that has come to rest inside an expanded note's protected shell to the nearest
 * position outside it: the start of the note's own content, or — for a KEYBOARD move coming back
 * out of that content — the position before the whole note, so the shell can be crossed leftward
 * instead of trapping the caret against it.
 *
 * `isPointerGesture` says the caret was placed by a pointer, which is a destination rather than a
 * direction: such a caret always goes to the content, the position the user was pointing into.
 *
 * Returns `true` when the selection was corrected.
 *
 * Exported for direct unit testing; production reaches it through
 * {@link NoteShellCaretGuardPlugin}.
 *
 * Mutating (moves the selection): call inside `editor.update()` or a command handler.
 */
export function $guardCaretOutOfNoteShell(isPointerGesture = false): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  if (!selection.isCollapsed()) return $expandSelectionPastShell(selection.anchor, selection.focus);

  const note = $shellAt(selection.anchor);
  if (!note) return false;
  if (!isPointerGesture && $arrivedFromContentSide(note)) {
    const parent = note.getParent();
    if (!parent) return false;
    $placeCaretAtBoundary(parent, note.getIndexWithinParent());
  } else {
    $placeAtShellTrailingEdge(note);
  }
  return true;
}

/**
 * Push a RANGE's endpoints out of any shell they land in, away from the other endpoint, so the
 * shell ends up wholly inside the selection or wholly outside it.
 *
 * A range that stops partway through the shell is the other way a keystroke reaches it: replacing
 * such a selection edits the shell node the range clipped. Growing the range instead makes the
 * shell behave as the single unit it is drawn as — the same treatment `token` mode gives deletion.
 */
function $expandSelectionPastShell(anchor: PointType, focus: PointType): boolean {
  const anchorNote = $shellAt(anchor);
  const focusNote = $shellAt(focus);
  if (!anchorNote && !focusNote) return false;
  // Which endpoint leads is the range's own direction; each offending one moves to the shell edge
  // that is farther from the other, which is what grows rather than shrinks the selection.
  const anchorLeads = anchor.isBefore(focus);
  if (anchorNote) $movePointPastShell(anchor, anchorNote, anchorLeads);
  if (focusNote) $movePointPastShell(focus, focusNote, !anchorLeads);
  return true;
}

/** Move `point` to the shell's leading edge (`toStart`) or to the start of the note's content. */
function $movePointPastShell(point: PointType, note: NoteNode, toStart: boolean): void {
  const parent = note.getParent();
  if (toStart && parent) point.set(parent.getKey(), note.getIndexWithinParent(), "element");
  else point.set(note.getKey(), $contentStartIndex(note), "element");
}

/**
 * Keeps the caret out of an expanded note's shell — the opening glyph and caller a host governs
 * through its own UI rather than as text (`ViewOptions.isNoteShellEditable: false`; Paratext 10's
 * footnote editor has a dropdown for each, as does Paratext 9).
 *
 * Rendering those nodes in Lexical's `token` mode is what makes them atomic to the operations that
 * ASK a node whether it can be split, but it does not keep a caret from landing among their
 * characters, and a caret that does land there is not inert: an insertion with the caret strictly
 * inside a token node replaces the WHOLE node with the typed character. The measured results are a
 * caller replaced by the keystroke — which then leaks into the note's content on save — and, for
 * the opening glyph, a note destroyed outright, since a note that has lost its opener is unwrapped
 * as deletion damage. Both read on screen as an edit that was accepted and then quietly reverted.
 *
 * So the caret is corrected the moment it comes to rest there, in the same update, before anything
 * can be typed. It lands at the start of the note's content — where the note IS editable, and where
 * a `\cat` category run belongs. The one exception is a KEYBOARD move coming back out of that
 * content: that one lands before the whole note, so the shell is crossed in a single hop rather
 * than trapping the caret against it.
 *
 * A pointer is held to a destination, never a direction. It is read from the pointer being DOWN
 * when the selection lands, which is the order a click delivers (`pointerdown`, then the selection
 * change, then `pointerup`) — the click event itself arrives too late to answer in the same update,
 * and correcting twice would let other selection listeners see the wrong position in between.
 *
 * Not gated on view options: the rule reads the shell's own node mode, so it is structurally a
 * no-op in the views that build an editable shell (the main editor's Markers view expands notes
 * precisely so the whole note can be edited as text).
 *
 * @returns Always `null`; this plugin renders no UI.
 */
export function NoteShellCaretGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const isPointerDown = useRef(false);

  useEffect(() => {
    const markDown = () => {
      isPointerDown.current = true;
    };
    const markUp = () => {
      isPointerDown.current = false;
    };
    // Listened for on the DOCUMENT in the capture phase, and released on `pointercancel` as well
    // as `pointerup`: a drag that starts in the editor can finish anywhere, and a pointer flag
    // that fails to clear would make every later keyboard move read as a click.
    return editor.registerRootListener((rootElement, prevRootElement) => {
      const previous = prevRootElement?.ownerDocument;
      previous?.removeEventListener("pointerdown", markDown, true);
      previous?.removeEventListener("pointerup", markUp, true);
      previous?.removeEventListener("pointercancel", markUp, true);
      isPointerDown.current = false;
      const current = rootElement?.ownerDocument;
      current?.addEventListener("pointerdown", markDown, true);
      current?.addEventListener("pointerup", markUp, true);
      current?.addEventListener("pointercancel", markUp, true);
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        // Command handlers already run inside an update, so the tag joins that commit rather than
        // opening a new one. Nothing here changes content, so tagging it costs nothing already
        // excluded from saved Scripture and collaborative traffic.
        if ($guardCaretOutOfNoteShell(isPointerDown.current)) $addUpdateTag(CURSOR_CHANGE_TAG);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
