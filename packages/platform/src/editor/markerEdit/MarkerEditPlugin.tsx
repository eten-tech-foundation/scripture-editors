import {
  $charNodeDeletionTransform,
  $paraMarkerDeletionTransform,
} from "./markerEditDeletion.utils";
import {
  $chapterNodeTransform,
  $isSelectionInMarkerNode,
  $markerNodeTransform,
  $resolvePendingMarkers,
  $verseNodeTransform,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import { $textNodeTier2Transform } from "./markerEditTier2Trigger.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
  NodeKey,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import { ChapterNode, CharNode, LoggerBasic, MarkerNode, ParaNode, VerseNode } from "shared";
import { ViewOptions } from "shared-react";

/**
 * The Standard-view marker-editing engine (design spec §5). Tier 1 node
 * transforms keep structural state in sync with edited marker text; completion
 * commands (Enter/blur) resolve mid-edit markers; deletion transforms (§5.5)
 * handle marker-prefix removal (para merge, char unwrap); Tier 2 re-tokenization
 * handles everything else. Active only when markers are editable text.
 */
export function MarkerEditPlugin({
  viewOptions,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled || !viewOptions) return;
    const context: MarkerEditContext = {
      viewOptions,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
      logger,
    };
    // Tracks the anchor key as of the most recent commit, updated synchronously by the
    // update listener below. SELECTION_CHANGE_COMMAND can also be re-entered from Lexical's
    // own async native-DOM selectionchange handling; by that point further updates may
    // already have landed, so reading $getSelection() from inside that handler can observe
    // a stale anchor. The update listener never lags, so it's the reliable source here.
    let lastAnchorKey: NodeKey | undefined;
    return mergeRegister(
      editor.registerNodeTransform(MarkerNode, (node) => {
        if (editor.isComposing()) return;
        $markerNodeTransform(node, context);
      }),
      editor.registerNodeTransform(VerseNode, (node) => {
        if (editor.isComposing()) return;
        $verseNodeTransform(node, context);
      }),
      editor.registerNodeTransform(ChapterNode, (node) => {
        if (editor.isComposing()) return;
        $chapterNodeTransform(node, context);
      }),
      editor.registerNodeTransform(ParaNode, (node) => {
        if (editor.isComposing()) return;
        $paraMarkerDeletionTransform(node, context);
      }),
      editor.registerNodeTransform(CharNode, (node) => {
        if (editor.isComposing()) return;
        $charNodeDeletionTransform(node, context);
      }),
      // Plain-TextNode catch-all for typed/pasted literal backslash sequences (§5.2).
      // Lexical dispatches transforms by exact node type, so this never fires for
      // MarkerNode/VerseNode subclasses — TextSpacingPlugin relies on the same fact.
      editor.registerNodeTransform(TextNode, (node) => {
        if (editor.isComposing()) return;
        $textNodeTier2Transform(node, context);
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          const inMarker = $isSelectionInMarkerNode();
          $resolvePendingMarkers(context);
          return inMarker; // swallow Enter inside marker text (complete, don't split)
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          context.splitExpected.current = true; // consumed by $paraMarkerDeletionTransform below
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          $resolvePendingMarkers(context);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          // PT9's debounced reformat completes a marker once the user moves on;
          // our deterministic equivalent: resolve pendings the caret is no longer in. An
          // absent selection (no RangeSelection at all, e.g. before the editor has ever been
          // focused) is not evidence the caret left a pending node - only an *observed* move
          // to somewhere else counts, so pendings stay untouched until it's known where the
          // caret actually is.
          if (context.pendingKeys.size === 0 || lastAnchorKey === undefined) return false;
          $resolvePendingMarkers(context, lastAnchorKey);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        context.splitExpected.current = false;
        context.rebuildAttempted.clear();
        lastAnchorKey = editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) ? selection.anchor.key : undefined;
        });
        // Lexical's native selectionchange-driven SELECTION_CHANGE_COMMAND dispatch is async
        // (a browser/DOM event) and, in headless/test environments especially, isn't guaranteed
        // to fire promptly - or at all - relative to further synchronous updates. Re-dispatching
        // here, synchronously at the end of every commit, makes the caret-departure completion
        // trigger deterministic instead of depending on that native event's timing. Safe from
        // runaway recursion: the handler only mutates when `lastAnchorKey` differs from a pending
        // key, and each such mutation removes that key from `pendingKeys`, so the set shrinks
        // monotonically to empty (at which point the command handler is a no-op).
        if (context.pendingKeys.size > 0 && lastAnchorKey !== undefined)
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );
  }, [editor, isEnabled, viewOptions, logger]);

  return null;
}
