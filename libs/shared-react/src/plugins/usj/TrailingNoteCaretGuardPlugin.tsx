import { useTransientCaretHost } from "./transientCaretHost";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $addUpdateTag,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  getDOMSelectionFromTarget,
  isDOMNode,
  LexicalNode,
  PointType,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { $isCursorPlaceholderOnlyText, $isNoteNode, CURSOR_CHANGE_TAG, NoteNode } from "shared";

/**
 * `node` when it is a collapsed note that nothing in its block renders past — the one shape with no
 * caret position of its own and none after it either — or `undefined`.
 */
function $asTrailingCollapsedNote(node: LexicalNode | null | undefined): NoteNode | undefined {
  if (!$isNoteNode(node) || node.getIsCollapsed() !== true) return undefined;
  const block = node.getParent();
  if (!block || block.isInline()) return undefined;
  const rendersPastNote = node
    .getNextSiblings()
    .some((sibling) => !$isCursorPlaceholderOnlyText(sibling));
  return rendersPastNote ? undefined : node;
}

/** The child an element-point caret is resting immediately AFTER. */
function $childBeforeCaret(anchor: PointType): LexicalNode | undefined {
  if (anchor.type !== "element") return undefined;
  const element = anchor.getNode();
  if (!$isElementNode(element)) return undefined;
  return element.getChildAtIndex(anchor.offset - 1) ?? undefined;
}

/**
 * The collapsed note the caret belongs after, or `undefined`.
 *
 * The property being detected: the caret has come to rest at a collapsed note that nothing in its
 * block renders past. A collapsed note shows only its caller and hides its content, so nothing
 * inside it can carry a visible caret, and with nothing rendered after it the only position past it
 * is a boundary no text node sits on. The browser paints no insertion point where there is no
 * rendered text, so the caret vanishes and the next keypress is the page's rather than the
 * editor's.
 *
 * This is where a forward arrow press lands, since a collapsed note is crossed whole. A click cannot
 * land here at all — no DOM position at the block's end resolves to this boundary — so a pointer is
 * answered separately, by {@link $trailingNoteUnderUnresolvedSelection} and
 * {@link $trailingNoteUnderClick}.
 *
 * Two deliberate limits:
 *
 * - **Collapsed only.** An EXPANDED note's own content is rendered text and is a legitimate resting
 *   place, so it needs nothing. `getIsCollapsed()` is the node's own declared property, which is
 *   also the axis the note-as-atom rule is keyed on everywhere else.
 * - **Nothing rendered may follow the note in its block.** That is the one boundary where "nothing
 *   rendered follows" is decidable from the node alone; where a sibling does render, its own start
 *   is a caret position at the same screen location and there is nothing to repair. A bare caret
 *   host renders nothing and is this guard's own doing, so it does not count as rendered — which is
 *   what lets a second arrival at the same position reuse the host instead of stacking another.
 *
 * Read-only: call inside `editor.getEditorState().read()`.
 */
export function $trailingNoteCaretAnchor(): NoteNode | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  return $asTrailingCollapsedNote($childBeforeCaret(selection.anchor));
}

/**
 * The collapsed note a CLICK came to rest at or inside, or `undefined`.
 *
 * Measured, against the DOM a collapsed note actually renders: not one DOM position at the end of
 * that line resolves to the boundary past the note. The paragraph's own end descends into the note's
 * hidden closing glyph, the position just past the caller lands in its hidden separator, a position
 * on the note span itself becomes an element point ON the note, and a position inside the caller —
 * a decorator, rendered `contenteditable="false"` — resolves to no Lexical point at all, leaving the
 * editor with no selection, no drawn caret, and the next keypress the page's. So a rule that reads
 * where the caret came to rest can never fire for a click, however the caret's resting place is
 * described, and this asks the click's own question instead: the caret when there is one, and the
 * DOM selection when there is not — the same fallback, for the same reason, that the gutter-marker
 * click guard makes to the click's target.
 *
 * Scoped to the CLICK deliberately. A caret inside a collapsed note is not wrong in general: the
 * marker menu puts one there on purpose when inserting a char marker into a footnote, and hauling
 * that caret out would break the flow it exists for. What is wrong is a caret the user put there by
 * pointing at a blank stretch of line, which is a bid for the end of the line and nothing else.
 *
 * Read-only despite running inside an update; it only decides.
 */
function $trailingNoteUnderClick(event: MouseEvent): NoteNode | undefined {
  const selection = $getSelection();
  let landed: LexicalNode | undefined;
  if ($isRangeSelection(selection)) {
    if (selection.isCollapsed()) landed = selection.anchor.getNode();
  } else if (!selection) {
    landed = $nodeUnderDomSelection(event.target);
  }
  return landed ? $asTrailingCollapsedNote($findMatchingParent(landed, $isNoteNode)) : undefined;
}

/** The node the DOM selection is currently pointing at, in `target`'s document. */
function $nodeUnderDomSelection(target: EventTarget | null): LexicalNode | undefined {
  const anchorDom = getDOMSelectionFromTarget(target)?.anchorNode;
  if (!isDOMNode(anchorDom)) return undefined;
  return $getNearestNodeFromDOMNode(anchorDom) ?? undefined;
}

/**
 * The collapsed note a DOM selection the editor could NOT resolve is pointing at, or `undefined`.
 *
 * This is the one moment at which a click that also delivers focus can still be answered, and the
 * order behind that was measured in a browser, since jsdom supplies no hit testing to measure it
 * with. The browser hands focus to the editor, hit-tests the blank stretch at the end of the line
 * onto the note's caller — a decorator, which Lexical resolves to no point at all — and so the
 * editor-state selection becomes `null`. Committing a null selection over one the editor already
 * had makes Lexical's reconciler clear the DOM range, and the browser then reports the caret at the
 * start of the editable. `click` fires only after all of that, by which time neither the caret nor
 * the DOM selection recalls where the click came down: {@link $trailingNoteUnderClick} finds a
 * caret at the top of the document and correctly declines to touch it. The selection change is
 * where the landing is still known, so that is where it has to be read.
 *
 * The distinction that keeps this from becoming the general "evict any caret inside a collapsed
 * note" rule — which the marker menu needs, since it puts a caret in a footnote on purpose to
 * insert a char marker into it — is that here there is NO caret. A DOM position the editor could
 * make nothing of is not somebody's deliberate placement; it is an insertion point about to be
 * thrown away, and giving it the one position at that spot that can hold a caret takes nothing from
 * anyone.
 *
 * Read-only despite running inside an update; it only decides.
 */
function $trailingNoteUnderUnresolvedSelection(
  rootElement: HTMLElement | null,
): NoteNode | undefined {
  if ($getSelection()) return undefined;
  const landed = $nodeUnderDomSelection(rootElement);
  return landed ? $asTrailingCollapsedNote($findMatchingParent(landed, $isNoteNode)) : undefined;
}

/**
 * Keeps a visible caret at the end of a block that a collapsed note ends, and keeps it out of the
 * note's hidden content.
 *
 * A collapsed note is one opaque atom on screen — only its caller renders, its content is hidden —
 * so when nothing renders after it in its block there is no text node anywhere past it to draw an
 * insertion point in. The reported symptom is a footnote at a paragraph's end where clicking to its
 * right loses the cursor and Space scrolls the page instead of typing. This plugin puts the caret
 * at the boundary past the note and materializes a zero-width-space "caret host" text node there
 * when nothing else renders one, so the position is visible and typing lands in the paragraph after
 * the note rather than inside its hidden body.
 *
 * {@link useTransientCaretHost} owns the host's lifetime — created on arrival, removed on departure
 * or blur, stripped the moment real text is typed — and the exclusions that keep it out of saved
 * Scripture and out of collaborative traffic; this file supplies only the rule for WHERE the caret
 * belongs. `EmptyVerseCaretGuardPlugin` supplies the other rule.
 *
 * An arrow press announces itself as a caret at the boundary, so the caret's own resting place is
 * the rule for it. A pointer never produces that position — every DOM position at the end of that
 * line resolves into the note's hidden content, or to nothing — so it is answered from where it
 * DOES announce itself, and both routes drive the same repair. A click into an editor that already
 * has focus still knows its landing when `CLICK_COMMAND` arrives. A click that also delivers focus
 * does not: the editor is handed a DOM position it can make nothing of, and the null selection that
 * follows makes Lexical clear the DOM range before the click is even dispatched. That one is caught
 * a step earlier, on `SELECTION_CHANGE_COMMAND`, which is the last moment the landing survives.
 *
 * Not gated on view options: whether a note renders as an atom is the note's own `isCollapsed`
 * state, which is the same axis every other collapsed-note rule reads.
 *
 * @returns Always `null`; this plugin renders no UI.
 */
export function TrailingNoteCaretGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const $repairCaret = useTransientCaretHost($trailingNoteCaretAnchor);

  useEffect(() => {
    // Command handlers already run inside an update, so the tag has to be added to that one rather
    // than opened around a new one. Neither arrival changes content, so tagging the whole commit
    // costs nothing that is not already excluded.
    const $repairPast = (note: NoteNode): void => {
      $addUpdateTag(CURSOR_CHANGE_TAG);
      $repairCaret(note);
    };

    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const note = $trailingNoteUnderUnresolvedSelection(editor.getRootElement());
          if (note) $repairPast(note);
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          const note = $trailingNoteUnderClick(event);
          if (note) $repairPast(note);
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor, $repairCaret]);

  return null;
}
