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
  CURSOR_CHANGE_TAG,
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
    // Task 15 cluster A: true while the live caret was placed by a programmatic scrRef sync
    // (ScriptureReferencePlugin's CURSOR_CHANGE yank) and NOT yet re-established by user input.
    // The runtime smoke proved the CURSOR_CHANGE tag-skip alone is insufficient — the yank ejects
    // the caret to the para's marker glyph, then a FOLLOW-ON untagged commit (Lexical's own
    // selectionchange reconcile) sees the caret off the pending node and resolves it → paragraph
    // split. Suppressing resolution across that whole app-placed window (until a real keystroke)
    // keeps the just-typed literal alive. Cleared by the KEY_DOWN handler below.
    // Known residual: the flag persists across mouse-only interaction until the next keydown or
    // blur — benign, since the suppression only PRESERVES pending literals (nothing is committed
    // early) and the BLUR handler still sweeps non-caret pendings on focus loss.
    let appPlacedCaret = false;
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
          // Any real keystroke re-establishes user intent over the caret, ending the app-placed
          // suppression window opened by a scrRef-sync yank (cluster A). Runs for every keydown,
          // ahead of the Ctrl+Space handling below.
          appPlacedCaret = false;
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
          // §5.5 completion on focus loss — EXCEPT the node the caret is still parked in.
          // Clicking a marker-menu item (or any host overlay taking focus, P10 spec §1.5)
          // blurs the editor while the caret still sits in the menu's own literal `\...`
          // trigger text; resolving that node here Tier-2-reformats the literal into
          // structure BEFORE the menu's apply can clean it up (Task 8 QA items 1/4:
          // `the wic\ked,` became an unknown-marker paragraph whose prefix glyph then
          // absorbed the "ked," word remainder as phantom marker text). PT9's dropdown
          // never commits the typed run this way — selecting from it REPLACES the run
          // (MarkerDropdownControl.cs:216-219). The caret's own node still completes via
          // Enter or caret departure, the other two PT9-debounce-equivalent triggers.
          //
          // Task 15 cluster A (click path): a REAL cross-frame blur — clicking a renderer-overlay
          // palette item outside the editor iframe — can null Lexical's live selection before this
          // handler runs, so `$getSelection()` yields no anchor to except. Falling back to
          // `undefined` would resolve EVERY pending, including the literal the palette apply is about
          // to replace (the exact corruption this except-the-caret guard exists to prevent). Fall
          // back to `lastAnchorKey` — the last COMMITTED real anchor, which the update listener keeps
          // through null-selection commits — so the node the user was editing is still excepted.
          const selection = $getSelection();
          const anchorKey = $isRangeSelection(selection) ? selection.anchor.key : lastAnchorKey;
          $resolvePendingMarkers(context, anchorKey);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(({ editorState, tags }) => {
        context.splitExpected.current = false;
        context.rebuildAttempted.clear();
        // Task 15 cluster A (typing path): ScriptureReferencePlugin's async scrRef echo re-enters
        // `$moveCursorToVerseStart` and yanks the caret to the para/verse start via
        // `editor.update(..., { tag: CURSOR_CHANGE_TAG })` ~90-190ms after a keystroke (QA run 2
        // items 1-4 timeline: `\` lands, caret sits in the pending literal, then the caret is pulled
        // to the `\s1` glyph start). That is a PROGRAMMATIC cursor move, NOT a user caret departure,
        // so it must not update the tracked anchor nor queue resolution — otherwise the just-typed
        // literal is force-settled and the paragraph splits (`\p \` autosaved to disk). The popover
        // footnote editor has no ScriptureReferencePlugin, which is why it never raced in QA. This
        // FALSIFIES the "blur nulls the selection" hypothesis for the typing path: QA confirmed focus
        // never leaves the editor there; the cross-frame-blur null path is a separate, click-only
        // actor handled by the BLUR handler's lastAnchorKey fallback above.
        //
        // The tag only rides on the yank commit itself; the runtime smoke proved a FOLLOW-ON untagged
        // commit then resolves the pending. So mark the caret app-placed here and keep suppressing
        // resolution (below) until the user's next keystroke clears the flag — not just for this one
        // commit.
        if (tags.has(CURSOR_CHANGE_TAG)) {
          appPlacedCaret = true;
          return;
        }
        // Caret still sits where the scrRef sync parked it (no user input since): a follow-on move is
        // not a user departure, so don't advance the anchor or resolve anything.
        if (appPlacedCaret) return;
        const anchorKey = editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) ? selection.anchor.key : undefined;
        });
        // Keep the last REAL anchor when the selection goes null (a cross-frame blur clears the DOM
        // selection): a null selection is "don't know where the caret is", not a departure, so it
        // must not clobber the anchor the BLUR handler falls back to. Only an observed move to a real
        // selection advances it.
        if (anchorKey !== undefined) lastAnchorKey = anchorKey;
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
        //
        // Gate on THIS commit's real anchor (`anchorKey`), not the preserved `lastAnchorKey`: a
        // null-selection commit (anchorKey === undefined) is not an observed departure, so it queues
        // nothing even though lastAnchorKey still points at the user's node. The BLUR handler, not
        // this deferred path, does the final sweep when focus is genuinely lost.
        if (resolveQueued || anchorKey === undefined) return;
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
