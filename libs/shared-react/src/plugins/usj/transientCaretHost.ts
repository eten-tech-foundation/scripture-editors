import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
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
import { useEffect, useRef } from "react";
import {
  $createCursorPlaceholderNode,
  $isCursorPlaceholderOnlyText,
  $removeCursorPlaceholder,
  CURSOR_CHANGE_TAG,
  CURSOR_PLACEHOLDER_CHAR,
  isCursorPlaceholderOnly,
} from "shared";

/**
 * Answers "does the caret's current resting place need a host, and after which node" — the ONE
 * thing that differs between caret-host guards. Returns the node the host belongs immediately
 * after, or `undefined` when the caret is somewhere a host is neither needed nor wanted.
 *
 * Read-only: called inside `editor.getEditorState().read()`, and must not mutate.
 */
export type CaretHostAnchor = () => LexicalNode | undefined;

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
 */
export function useTransientCaretHost($caretHostAnchor: CaretHostAnchor): void {
  const [editor] = useLexicalComposerContext();
  const hostKeyRef = useRef<NodeKey | undefined>(undefined);

  useEffect(() => {
    // Insert a host at a newly-hostless position and/or drop a stale host the caret has left. Runs
    // from SELECTION_CHANGE (a command, the sanctioned place to mutate) and reads first so it only
    // opens an update when something must change. It converges: after inserting, the caret sits
    // inside the host, so the next SELECTION_CHANGE finds no hostless position and no stale host,
    // and does nothing.
    const $syncCaretHost = (): void => {
      let target: LexicalNode | undefined;
      let anchorKey: NodeKey | undefined;
      let needRemoveStale = false;
      const staleKey = hostKeyRef.current;

      editor.getEditorState().read(() => {
        target = $caretHostAnchor();
        const selection = $getSelection();
        anchorKey =
          $isRangeSelection(selection) && selection.isCollapsed()
            ? selection.anchor.key
            : undefined;
        // A tracked host that the caret has left, and is still a bare placeholder, should go.
        needRemoveStale = !!staleKey && staleKey !== anchorKey && $isPlaceholderHost(staleKey);
        // A tracked host that is no longer a bare placeholder (typed into) is no longer ours.
        if (staleKey && !$isPlaceholderHost(staleKey)) hostKeyRef.current = undefined;
      });

      if (!target && !needRemoveStale) return;

      editor.update(
        () => {
          if (needRemoveStale && staleKey) {
            const stale = $getNodeByKey(staleKey);
            if ($isTextNode(stale)) stale.remove();
            if (hostKeyRef.current === staleKey) hostKeyRef.current = undefined;
          }
          if (target) {
            // An anchor rule only names a node when the position after it is hostless, so there is
            // never an existing host to reuse here — always create a fresh one.
            const host = $createCursorPlaceholderNode();
            target.insertAfter(host);
            host.select(0, 0);
            hostKeyRef.current = host.getKey();
          }
        },
        { tag: CURSOR_CHANGE_TAG },
      );
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
  }, [editor, $caretHostAnchor]);
}
