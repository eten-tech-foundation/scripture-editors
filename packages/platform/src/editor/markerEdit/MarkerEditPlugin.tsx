import { $removeCharFormattingFromSelection } from "./charFormatting.utils";
import {
  $charNodeDeletionTransform,
  $paraMarkerDeletionTransform,
} from "./markerEditDeletion.utils";
import { $handleEnterInNote } from "./markerEditNote.utils";
import {
  $chapterNodeTransform,
  $isSelectionInMarkerNode,
  $markerNodeTransform,
  $resolvePendingMarkers,
  $verseNodeTransform,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import { $textNodeTier2Transform } from "./markerEditTier2Trigger.utils";
import {
  $displayWhitespaceTransform,
  $handleCopyForStandardView,
} from "./whitespaceDisplay.plugin.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  NodeKey,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  ChapterNode,
  CharNode,
  getMarker as bundledGetMarker,
  LoggerBasic,
  MarkerLookup,
  MarkerNode,
  ParaNode,
  textTypeState,
  VerseNode,
} from "shared";
import { getViewMode, STANDARD_VIEW_MODE, ViewOptions } from "shared-react";

/**
 * The Standard-view marker-editing engine (design spec §5). Tier 1 node
 * transforms keep structural state in sync with edited marker text; completion
 * commands (Enter/blur) resolve mid-edit markers; deletion transforms (§5.5)
 * handle marker-prefix removal (para merge, char unwrap); Ctrl+Space (§5.5)
 * strips character formatting at the caret/selection; Tier 2 re-tokenization
 * handles everything else. Active only when markers are editable text.
 */
export function MarkerEditPlugin({
  viewOptions,
  getMarker,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  /** Project StyleInfo-backed lookup; defaults to the bundled table. */
  getMarker?: MarkerLookup;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled || !viewOptions) return;
    const isStandardView = getViewMode(viewOptions) === STANDARD_VIEW_MODE;
    const context: MarkerEditContext = {
      viewOptions,
      getMarker: getMarker ?? bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
      logger,
    };
    // Tracks the anchor key as of the most recent commit, updated synchronously by the
    // update listener below (which never lags, unlike command handlers re-entered from
    // Lexical's async native-DOM selectionchange handling). Read again at resolution time
    // so the deferred resolution below always excepts the node the caret is CURRENTLY in.
    let lastAnchorKey: NodeKey | undefined;
    // One pending-marker resolution queued at a time; disposed on effect cleanup.
    let resolveQueued = false;
    let disposed = false;
    const unregister = mergeRegister(
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
      // Finding #1 (Phase 0): plain TextNodes can't emit a DOM class from node state the way
      // ImmutableTypedTextNode does in createDOM(), so milestone attribute runs (`|sid="…"`,
      // textType "attribute") render without the `.attribute` dim-until-hover styling that
      // PT9 applies. DOM-only decoration from OUTSIDE the update cycle reconciles it post-render
      // — no editor.update here, since mutating state from inside a mutation listener risks a
      // cascading update loop. skipInitialization: false so nodes already in the initial editor
      // state (not just later edits) get the class too.
      editor.registerMutationListener(
        TextNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") continue;
              const node = $getNodeByKey<TextNode>(key);
              if (!node || $getState(node, textTypeState) !== "attribute") continue;
              editor.getElementByKey(key)?.classList.add("attribute");
            }
          });
        },
        { skipInitialization: false },
      ),
      // §4/§5.6: Standard-view-only whitespace display invariant and clipboard
      // normalization. Gated separately from the rest of this plugin (which is
      // markerMode-gated and also active in Unformatted view) — must not leak there.
      ...(isStandardView
        ? [
            editor.registerNodeTransform(TextNode, (node) => {
              if (editor.isComposing()) return;
              $displayWhitespaceTransform(node);
            }),
            editor.registerCommand(
              COPY_COMMAND,
              (event) =>
                $handleCopyForStandardView(
                  // COPY_COMMAND's payload is `ClipboardEvent | KeyboardEvent | null`. A plain
                  // `event instanceof ClipboardEvent` narrows this correctly in real browsers,
                  // but jsdom (our test environment) doesn't implement `ClipboardEvent` at all —
                  // `instanceof` against the undefined global throws — so this duck-checks the
                  // one property `$handleCopyForStandardView` actually needs instead.
                  event && typeof event === "object" && "clipboardData" in event ? event : null,
                  editor,
                  false,
                ),
              COMMAND_PRIORITY_HIGH,
            ),
            editor.registerCommand(
              CUT_COMMAND,
              (event) =>
                $handleCopyForStandardView(
                  event && typeof event === "object" && "clipboardData" in event ? event : null,
                  editor,
                  true,
                ),
              COMMAND_PRIORITY_HIGH,
            ),
          ]
        : []),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
          if (event.key !== " " && event.code !== "Space") return false;
          // Only claim the keystroke (preventDefault + return true) when we actually acted;
          // otherwise let it fall through untouched (e.g. no range selection).
          if (!$removeCharFormattingFromSelection()) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          // PT9 SmartEnter (§6): Enter inside expanded note content starts an `\fp`
          // footnote-paragraph span instead of splitting the (inline, non-block) note.
          if ($handleEnterInNote()) {
            $resolvePendingMarkers(context);
            return true; // note handled: suppress the paragraph split
          }
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
      editor.registerUpdateListener(({ editorState }) => {
        context.splitExpected.current = false;
        context.rebuildAttempted.clear();
        lastAnchorKey = editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) ? selection.anchor.key : undefined;
        });
        // PT9's debounced reformat completes a marker once the user moves on; our
        // deterministic equivalent resolves pendings the caret is no longer in, keyed off
        // every commit here rather than off SELECTION_CHANGE_COMMAND — Lexical's native
        // selectionchange dispatch is async (a browser/DOM event) and, in headless/test
        // environments especially, isn't guaranteed to fire promptly (or at all), while a
        // caret move IS a commit, so this listener never misses a departure. An absent
        // selection (no RangeSelection at all, e.g. before the editor has ever been
        // focused) is not evidence the caret left a pending node — only an *observed* move
        // to somewhere else counts, so pendings stay untouched until it's known where the
        // caret actually is.
        //
        // The resolution is deferred to a microtask and re-entered through a fresh
        // top-level editor.update(): this listener runs INSIDE $commitPendingUpdates,
        // after the just-committed state (and, in dev builds, its selection and node map)
        // is frozen. Mutating synchronously from here can execute against that frozen
        // state and throw — reachable in production because a commit can be force-flushed
        // MID-dispatch by any SELECTION_CHANGE handler calling editor.read() (e.g.
        // OnSelectionChangePlugin), leaving this listener's dispatch to short-circuit into
        // the committed state (Task 9 QA bugs A/B). The microtask runs before any further
        // input event, so completion stays deterministic. (Not editor.update() directly in
        // the listener — that nests a queued update mid-commit; see the repo rule.)
        //
        // Termination guarantee: resolving a pending key ALWAYS deletes it from
        // `pendingKeys` first, then requests a Tier 2 rebuild. The rebuild either (a)
        // makes real progress — producing a structurally different paragraph, whose new
        // nodes may re-add a key, but that is genuine forward motion, not a cycle — or (b)
        // is a fixed point, in which case `$rebuildParas` refuses and mutates nothing, so
        // the deferred update commits nothing, this listener doesn't fire again, and
        // nothing re-queues. Either way `pendingKeys` cannot grow without a corresponding
        // structural change, so the resolve/rebuild cascade terminates. (An earlier
        // version claimed the set shrinks monotonically; that was false — the fixed-point
        // refusal is the real guarantee.)
        if (resolveQueued || lastAnchorKey === undefined) return;
        const anchorKey = lastAnchorKey;
        if (![...context.pendingKeys].some((key) => key !== anchorKey)) return;
        resolveQueued = true;
        queueMicrotask(() => {
          resolveQueued = false;
          if (disposed) return;
          // lastAnchorKey is re-read here: if further commits landed before this microtask,
          // the freshest anchor wins (never except a node the caret has already left).
          editor.update(() => $resolvePendingMarkers(context, lastAnchorKey));
        });
      }),
    );
    return () => {
      disposed = true;
      unregister();
    };
  }, [editor, isEnabled, viewOptions, getMarker, logger]);

  return null;
}
