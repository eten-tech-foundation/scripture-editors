import { useTransientCaretHost } from "./transientCaretHost";
import { $getSelection, $isElementNode, $isRangeSelection } from "lexical";
import { $isNoteNode, NoteNode } from "shared";

/**
 * The collapsed note after which a caret host is needed, or `undefined`.
 *
 * The property being detected: the caret rests at the end of a block whose last child is a note
 * that renders no caret position of its own. A collapsed note shows only its caller and hides its
 * content, so nothing inside it can carry the caret, and with nothing after it the only position
 * past it is the block's own end — an element point with no text node. The browser paints no
 * insertion point where there is no rendered text, so the caret vanishes and the next keypress is
 * the page's rather than the editor's.
 *
 * Three deliberate limits:
 *
 * - **Collapsed only.** An EXPANDED note's own end is rendered text and is a legitimate resting
 *   place, so it needs nothing. `getIsCollapsed()` is the node's own declared property, which is
 *   also the axis the note-as-atom rule is keyed on everywhere else.
 * - **Last child of a non-inline element only.** That is the one boundary where "nothing rendered
 *   follows" is decidable from the node alone. At an interior boundary the answer depends on what
 *   the next sibling renders — an inline span's own text sits at the same screen location and hosts
 *   the caret fine, a decorator does not — and that scan belongs to whoever owns rendered-content
 *   traversal, not here.
 * - **No existing host.** The check is the anchored node's next sibling rather than a placeholder
 *   test, so a paragraph that already ends in any text node (real content or a host) is left alone
 *   and hosts cannot stack.
 *
 * Read-only: call inside `editor.getEditorState().read()`.
 */
export function $trailingNoteNeedingHost(): NoteNode | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const { anchor } = selection;
  if (anchor.type !== "element") return undefined;
  const element = anchor.getNode();
  if (!$isElementNode(element) || element.isInline()) return undefined;
  // The caret is somewhere other than the block's end, so something follows and this rule is silent.
  if (anchor.offset !== element.getChildrenSize()) return undefined;

  const note = element.getChildAtIndex(anchor.offset - 1);
  if (!$isNoteNode(note) || note.getIsCollapsed() !== true) return undefined;
  return note;
}

/**
 * Keeps a visible caret at the end of a block that a collapsed note ends.
 *
 * A collapsed note is one opaque atom on screen — only its caller renders, its content is hidden —
 * so when it is its block's last child there is no text node anywhere past it to draw an insertion
 * point in. The caret really is there (one backward press recovers it), but the browser shows
 * nothing and hands the next keystroke to the page: the reported symptom is a footnote at a
 * paragraph's end where clicking to its right loses the cursor and Space scrolls instead of typing.
 * This plugin materializes a zero-width-space "caret host" text node past the note and moves the
 * caret into it, so the position is visible and typing lands in the paragraph after the note rather
 * than inside its hidden body.
 *
 * {@link useTransientCaretHost} owns the host's lifetime — created on arrival, removed on departure
 * or blur, stripped the moment real text is typed — and the exclusions that keep it out of saved
 * Scripture and out of collaborative traffic; this file supplies only the rule for WHERE one is
 * needed. `EmptyVerseCaretGuardPlugin` supplies the other rule.
 *
 * Not gated on view options: whether a note renders as an atom is the note's own `isCollapsed`
 * state, which is the same axis every other collapsed-note rule reads.
 *
 * @returns Always `null`; this plugin renders no UI.
 */
export function TrailingNoteCaretGuardPlugin(): null {
  useTransientCaretHost($trailingNoteNeedingHost);
  return null;
}
