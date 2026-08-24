import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  LexicalNode,
  NodeKey,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import { useCallback, useEffect, useRef } from "react";
import {
  $caretHostAtBoundary,
  $createCursorPlaceholderNode,
  $isCursorPlaceholderOnlyText,
  $placeCaretAtBoundary,
  $removeCursorPlaceholder,
  CURSOR_CHANGE_TAG,
  CURSOR_PLACEHOLDER_CHAR,
  isCursorPlaceholderOnly,
} from "shared";

/**
 * Answers "is the caret somewhere it cannot rest, and which node does it belong after" — the ONE
 * thing that differs between caret-host guards. Returns the node the caret belongs immediately
 * after, or `undefined` when the caret is somewhere this guard has no opinion about.
 *
 * The boundary just past that node is where the caret is put; whether a host has to be
 * materialized there is {@link useTransientCaretHost}'s question, not the rule's, so a rule may
 * name a node whose boundary already has one.
 *
 * Read-only: called inside `editor.getEditorState().read()`, and must not mutate.
 */
export type CaretHostAnchor = () => LexicalNode | undefined;

/**
 * Puts the caret at the boundary just past `target`, materializing a host there when nothing else
 * renders one, and drops a host the caret has left behind. Passing `undefined` does only the
 * latter.
 *
 * {@link useTransientCaretHost} returns this so a guard can drive the same repair from an arrival
 * the caret cannot report itself — a click Lexical resolved to no caret at all.
 *
 * Mutating: call inside `editor.update()`.
 */
export type CaretHostRepair = (target: LexicalNode | undefined) => void;

/** Whether `key` currently resolves to a bare cursor-host text node (only placeholder chars). */
function $isPlaceholderHost(key: NodeKey | undefined): boolean {
  return !!key && $isCursorPlaceholderOnlyText($getNodeByKey(key));
}

/**
 * The transient caret-host lifecycle, shared by every guard that needs one.
 *
 * Some caret positions in this editor can only be expressed as an ELEMENT point — a boundary with
 * no text node on it — because what surrounds them renders no text the browser can draw an
 * insertion point in: a childless decorator such as an immutable verse number, or a collapsed note
 * whose content is hidden. Lexical is perfectly happy with such a caret; the browser paints
 * nothing, so the user sees no cursor and the next keypress becomes the page's rather than the
 * editor's. The repair is to materialize a zero-width-space text node at that position and move the
 * caret into it.
 *
 * The repair is stated once, as "put the caret at the boundary past this node, and give that
 * boundary something to render the caret in if nothing there already does". Stating it that way
 * lets a guard drive it from an arrival the caret's own resting place cannot express — a click that
 * came down inside hidden content, or produced no caret at all — and get the same position and the
 * same single host as the arrival that does announce itself.
 *
 * The host is TRANSIENT, and this hook is what makes that true in one place rather than once per
 * guard: it is created only when the caret comes to rest at such a position, removed as soon as the
 * caret leaves or the editor blurs, and stripped the moment real text is typed into it. It never
 * accumulates and never appears in a document nobody put a caret into.
 *
 * Every mutation carries {@link CURSOR_CHANGE_TAG}, which is in `blackListedChangeTags` — so the
 * commit never reaches the host application's USJ-change handler and produces no delta op. The USJ
 * serializer drops a placeholder-only text node as well, and the collab coordinate systems give it
 * zero length, so a host cannot reach saved Scripture or a peer even if one somehow outlived a
 * commit. All placeholder handling is scoped to the tracked host by node key — a zero-width space
 * is legitimate content in some scripts (Thai/Khmer/Lao line breaks) and is never touched.
 *
 * Unlike the arrow-driven `CursorHandler` placeholder system (perf-react), this hosts a *resting*
 * caret.
 *
 * @param $caretHostAnchor - The guard's own rule for when a host is needed. Must be stable across
 *   renders (declare it at module scope), since it is an effect dependency.
 * @returns The repair step itself, for a guard that has an arrival of its own to drive it from.
 */
export function useTransientCaretHost($caretHostAnchor: CaretHostAnchor): CaretHostRepair {
  const [editor] = useLexicalComposerContext();
  const hostKeyRef = useRef<NodeKey | undefined>(undefined);

  // See CaretHostRepair. Deliberately free of `editor`: everything it touches is resolved from the
  // active editor state, so it is safe to hand to a caller that is already inside an update.
  const $repairCaret = useCallback<CaretHostRepair>((target) => {
    const selection = $getSelection();
    const anchorKey =
      $isRangeSelection(selection) && selection.isCollapsed() ? selection.anchor.key : undefined;
    const staleKey = hostKeyRef.current;
    // A tracked host that is no longer a bare placeholder (typed into) is no longer ours.
    const staleIsBareHost = $isPlaceholderHost(staleKey);
    if (staleKey && !staleIsBareHost) hostKeyRef.current = undefined;

    // The host the caret was just put into, which is therefore not stale whatever it was before.
    let occupiedKey: NodeKey | undefined;
    if (target) {
      // The repair is the same however the caret got here: put it at the boundary just past the
      // named node, materializing a host there only when nothing already renders one. Reusing an
      // existing host is what keeps a second arrival at the same position — a click, once an
      // earlier arrival has already put a host there — from stacking hosts.
      const parent = target.getParentOrThrow();
      const boundary = target.getIndexWithinParent() + 1;
      const existing = $caretHostAtBoundary(parent, boundary);
      if (existing) {
        // Track the adopted host too: every cleanup path (the stale-host pass below, blur,
        // unmount) acts solely on hostKeyRef, so a host reused from another instance — or one
        // this instance forgot after $stripPlaceholderOnEdit cleared the ref — would otherwise
        // never be removed when the caret leaves it.
        hostKeyRef.current = existing.getKey();
        occupiedKey = existing.getKey();
      } else {
        const host = $createCursorPlaceholderNode();
        target.insertAfter(host);
        hostKeyRef.current = host.getKey();
        occupiedKey = host.getKey();
      }
      $placeCaretAtBoundary(parent, boundary);
    }

    // A tracked host the caret has left, and has not just been put back into, should go.
    if (staleKey && staleIsBareHost && staleKey !== anchorKey && staleKey !== occupiedKey) {
      const stale = $getNodeByKey(staleKey);
      if ($isTextNode(stale)) stale.remove();
      if (hostKeyRef.current === staleKey) hostKeyRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    // Repair the caret's resting place and/or drop a stale host it has left. Runs from
    // SELECTION_CHANGE (a command, the sanctioned place to mutate), which Lexical dispatches
    // from WITHIN the update that applies the new selection — so `$getSelection()` must be read
    // DIRECTLY here, where it resolves against the pending state. Wrapping the reads in
    // `editor.getEditorState().read(...)` evaluated the PREVIOUS commit: the anchor was the
    // caret's old position, so no host was created where the caret just arrived, and on the
    // next move the stale-host pass treated the still-current host as abandoned and yanked the
    // caret back to the previous boundary. A nested `editor.update(...)` is queued rather than
    // run inline while an update is active, so the repair also runs directly, tagging the
    // active update instead. It converges: after the repair the caret sits in a host past the
    // anchor, so the next SELECTION_CHANGE finds nothing to repair and no stale host.
    const $syncCaretHost = (): void => {
      const target = $caretHostAnchor();
      const selection = $getSelection();
      const anchorKey =
        $isRangeSelection(selection) && selection.isCollapsed() ? selection.anchor.key : undefined;
      const staleKey = hostKeyRef.current;
      // Either a position to repair, or a tracked host the caret is no longer resting in.
      const hasWork = !!target || (!!staleKey && staleKey !== anchorKey);
      if (!hasWork) return;
      $addUpdateTag(CURSOR_CHANGE_TAG);
      $repairCaret(target);
    };

    /**
     * Strip the placeholder once real text is typed into *our* host, fixing the caret offset.
     * Scoped to the tracked host node by key so a legitimate ZWSP elsewhere (e.g. a Thai/Khmer
     * line-break in real text) is never touched.
     */
    const $stripPlaceholderOnEdit = (node: TextNode): void => {
      if (node.getKey() !== hostKeyRef.current) return;
      const text = node.getTextContent();
      // Still a bare host (nothing typed yet), or no placeholder to remove: leave it.
      if (isCursorPlaceholderOnly(text) || !text.includes(CURSOR_PLACEHOLDER_CHAR)) return;
      const selection = $getSelection();
      const anchorOffset =
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.key === node.getKey()
          ? selection.anchor.offset
          : undefined;
      $removeCursorPlaceholder(node);
      hostKeyRef.current = undefined;
      if (anchorOffset !== undefined) {
        const removedBefore = text.slice(0, anchorOffset).split(CURSOR_PLACEHOLDER_CHAR).length - 1;
        const nextOffset = Math.max(0, anchorOffset - removedBefore);
        node.select(nextOffset, nextOffset);
      }
    };

    const unregister = mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $syncCaretHost();
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          const key = hostKeyRef.current;
          if (!key) return false;
          let isBareHost = false;
          editor.getEditorState().read(() => {
            isBareHost = $isPlaceholderHost(key);
          });
          if (isBareHost) {
            editor.update(
              () => {
                const host = $getNodeByKey(key);
                if ($isTextNode(host)) host.remove();
              },
              { tag: CURSOR_CHANGE_TAG },
            );
          }
          hostKeyRef.current = undefined;
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerNodeTransform(TextNode, $stripPlaceholderOnEdit),
    );
    // Drop the tracked key when the editor changes so it can't resolve into a different editor.
    return () => {
      unregister();
      hostKeyRef.current = undefined;
    };
  }, [editor, $caretHostAnchor, $repairCaret]);

  return $repairCaret;
}
