import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
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
import { $isSomeVerseNode, SomeVerseNode } from "../../nodes/usj";

/**
 * The verse marker after which an empty-verse caret host is needed, or `undefined`.
 *
 * A verse whose content has all been deleted collapses to just its marker — an
 * `ImmutableVerseNode` is a childless decorator, so the caret can only land as an element point
 * wedged between markers, which the browser renders with no visible caret (PT-4308). This detects
 * that state: a collapsed element-type caret sitting immediately after a verse marker that is
 * followed by nothing, or by another verse marker (i.e. no `TextNode` to host the caret).
 *
 * Returns `undefined` when a text node already follows the marker (real content, or an existing
 * placeholder host), or when the caret is not at such a boundary.
 */
export function $emptyVerseNeedingHost(): SomeVerseNode | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const { anchor } = selection;
  if (anchor.type !== "element") return undefined;
  const element = anchor.getNode();
  if (!$isElementNode(element)) return undefined;

  const children = element.getChildren();
  const verse = children[anchor.offset - 1];
  if (!$isSomeVerseNode(verse)) return undefined;

  const following = children[anchor.offset];
  // A text node already hosts the caret here (real content or an existing placeholder).
  if ($isTextNode(following)) return undefined;
  // Nothing, or another verse marker, follows: this verse has no caret host.
  if (following === undefined || $isSomeVerseNode(following)) return verse;
  return undefined;
}

/** Whether `key` currently resolves to a bare cursor-host text node (only placeholder chars). */
function $isPlaceholderHost(key: NodeKey | undefined): boolean {
  return !!key && $isCursorPlaceholderOnlyText($getNodeByKey(key));
}

/**
 * Keeps a visible caret in a verse whose text has been fully deleted.
 *
 * A verse number is rendered by a childless `ImmutableVerseNode` decorator, so once a verse has no
 * text the caret can only rest as an element point between decorators — which the browser draws
 * with no visible caret. This plugin drops a zero-width-space "caret host" text node into such an
 * empty verse and moves the caret into it, so the insertion point stays visible and typing lands in
 * the verse. The host is transient: removed as soon as the caret leaves the verse or on blur, and
 * stripped the moment real text is typed, so it never lingers. Every mutation is tagged
 * {@link CURSOR_CHANGE_TAG} so it is excluded from save emission; the USJ serializer also skips a
 * bare-placeholder node, so a host cannot reach saved Scripture. All placeholder handling is scoped
 * to this host — a zero-width space is legitimate content in some scripts and is never touched.
 *
 * Unlike the arrow-driven `CursorHandler` placeholder system (perf-react), this hosts a *resting*
 * caret and is aware of verse markers, so it fits the platform editor's immutable verse numbers.
 *
 * @returns Always `null`; this plugin renders no UI.
 */
export function EmptyVerseCaretGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const hostKeyRef = useRef<NodeKey | undefined>(undefined);

  useEffect(() => {
    // Insert a host in a newly-empty verse and/or drop a stale host the caret has left. Runs from
    // SELECTION_CHANGE (a command, the sanctioned place to mutate) and reads first so it only opens
    // an update when something must change. It converges: after inserting, the caret sits inside the
    // host, so the next SELECTION_CHANGE finds no empty verse and no stale host, and does nothing.
    const $syncCaretHost = (): void => {
      let target: SomeVerseNode | undefined;
      let anchorKey: NodeKey | undefined;
      let needRemoveStale = false;
      const staleKey = hostKeyRef.current;

      editor.getEditorState().read(() => {
        target = $emptyVerseNeedingHost();
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
            const following = target.getNextSibling();
            let host: TextNode;
            if ($isCursorPlaceholderOnlyText(following)) {
              host = following;
            } else {
              host = $createCursorPlaceholderNode();
              target.insertAfter(host);
            }
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
  }, [editor]);

  return null;
}
