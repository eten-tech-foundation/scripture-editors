import { $removeCharFormattingFromSelection } from "./charFormatting.utils";
import {
  $charNodeDeletionTransform,
  $noteDeletionTransform,
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
  $handlePasteForStandardView,
} from "./whitespaceDisplay.plugin.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isRangeSelection,
  BLUR_COMMAND,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  createCommand,
  CUT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  LexicalCommand,
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
  NoteNode,
  ParaNode,
  textTypeState,
  VerseNode,
} from "shared";
import { hasStandardViewWhitespace, ViewOptions } from "shared-react";

/**
 * The command behind the public `EditorRef.commitPendingMarkerEdits()` method — `Editor.tsx`
 * dispatches it when a host calls that method. Resolving a pending marker re-tokenizes its
 * edited text into finished structure; this command resolves every pending marker so the
 * serialized USJ matches what is on screen. Without it, a marker the user renamed but walked
 * away from mid-edit stays pending forever and serializes its OLD text.
 *
 * The resolve-everything rule has one exception: the node the caret is in stays pending, but
 * only while the user is genuinely editing it — while the editor still holds DOM focus (a
 * mid-typing pause must not settle under the user). During a programmatic scrRef caret move
 * (the "yank", defined below) the caret is not on a node the user chose, so the exception is
 * instead the last node the user themselves placed the caret in. The caller's own obligations
 * (e.g. do not call while a marker palette is open) are documented on
 * `EditorRef.commitPendingMarkerEdits`.
 */
export const COMMIT_PENDING_MARKERS_COMMAND: LexicalCommand<void> = createCommand(
  "COMMIT_PENDING_MARKERS_COMMAND",
);

/**
 * The Standard-view marker-editing engine. Tier 1 node
 * transforms keep structural state in sync with edited marker text; completion
 * commands (Enter/blur) resolve mid-edit markers; deletion transforms
 * handle marker-prefix removal (para merge, char unwrap); Ctrl+Space
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
    // The standard-view whitespace transform + clipboard normalization travel with the editable
    // marker engine, so they must be active whenever editable markers are on in a spaced+formatted
    // view — for expanded notes too, not only the named `standard` (collapsed) mode. Still gated
    // separately from the rest of this plugin so they do not leak into Unformatted view.
    const isStandardView = hasStandardViewWhitespace(viewOptions);
    const context: MarkerEditContext = {
      viewOptions,
      getMarker: getMarker ?? bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
      logger,
    };
    // Tracks the caret's node key as of the most recent commit — keyed off the selection FOCUS
    // (the live cursor end, so it stays correct even for a backward range selection), updated
    // synchronously by the update listener below (which never lags, unlike command handlers
    // re-entered from Lexical's async native-DOM selectionchange handling). Read again at
    // resolution time so the deferred resolution below always excepts the node the caret is
    // CURRENTLY in. (Named `*AnchorKey` for historical reasons; the value is the focus/caret node.)
    let lastAnchorKey: NodeKey | undefined;
    // True while the live caret was placed by a programmatic scrRef sync — the CURSOR_CHANGE
    // caret move ScriptureReferencePlugin makes to follow the active scripture reference, which
    // the comments below call a "yank" — and NOT yet re-established by user input. The runtime
    // smoke proved the CURSOR_CHANGE tag-skip alone is insufficient — the yank ejects
    // the caret to the para's marker glyph, then a FOLLOW-ON untagged commit (Lexical's own
    // selectionchange reconcile) sees the caret off the pending node and resolves it → paragraph
    // split. Suppressing resolution across that whole app-placed window (until real user input)
    // keeps the just-typed literal alive. Cleared by the KEY_DOWN and CLICK handlers below
    // (a mouse click is user intent just like a keystroke — a keydown-only clear would leave the
    // window open across mouse-only interaction).
    let appPlacedCaret = false;
    // Anchor of the most recent commit (tagged or not) — the tagged-branch "did this commit move
    // the caret" comparison. Distinct from lastAnchorKey, which deliberately ignores tagged/
    // app-placed moves (it feeds the BLUR except-the-user's-node fallback).
    let lastCommitAnchorKey: NodeKey | undefined;
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
      editor.registerNodeTransform(NoteNode, (node) => {
        if (editor.isComposing()) return;
        $noteDeletionTransform(node, context);
      }),
      // Plain-TextNode catch-all for typed/pasted literal backslash sequences (Tier 2).
      // Lexical dispatches transforms by exact node type, so this never fires for
      // MarkerNode/VerseNode subclasses — TextSpacingPlugin relies on the same fact.
      editor.registerNodeTransform(TextNode, (node) => {
        if (editor.isComposing()) return;
        $textNodeTier2Transform(node, context);
      }),
      // Plain TextNodes can't emit a DOM class from node state the way
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
      // Standard-view-only whitespace display invariant and clipboard
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
            editor.registerCommand(
              PASTE_COMMAND,
              (event) =>
                $handlePasteForStandardView(
                  // Same jsdom-safe duck-check as COPY above.
                  event && typeof event === "object" && "clipboardData" in event
                    ? (event as ClipboardEvent)
                    : null,
                ),
              COMMAND_PRIORITY_HIGH,
            ),
          ]
        : []),
      editor.registerCommand(
        CLICK_COMMAND,
        () => {
          // A mouse click re-establishes user intent over the caret, ending the app-placed
          // suppression window opened by a scrRef-sync yank — same contract as KEY_DOWN below.
          // Without this, literals typed before a yank could never settle via a mouse-only
          // caret departure.
          appPlacedCaret = false;
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          // Any real keystroke re-establishes user intent over the caret, ending the app-placed
          // suppression window opened by a scrRef-sync yank. Runs for every keydown,
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
        (event) => {
          // PT9 SmartEnter: Enter inside expanded note content starts an `\fp`
          // footnote-paragraph span instead of splitting the (inline, non-block) note; Enter
          // inside marker glyph text is swallowed (complete the marker, don't split).
          //
          // Whenever this handler CLAIMS the key (returns true), it must also preventDefault the
          // DOM event itself: returning true suppresses Lexical's RichText
          // KEY_ENTER handler — including the preventDefault RichText would have issued — so
          // without this the BROWSER's native contenteditable Enter still splits the DOM and
          // Lexical reconciles that into a real paragraph split. Invisible in jsdom (no native
          // editing engine); live it split the footnote popover's wrapper paragraph with the
          // caret genuinely inside the note. Deriving `claimed` once keeps the preventDefault and
          // the return value from drifting apart as claim paths are added. `||` preserves the
          // ordering: `$handleEnterInNote` runs (and may insert the `\fp`) first; the in-marker
          // check only runs when the note path did not claim.
          const claimed = $handleEnterInNote() || $isSelectionInMarkerNode();
          if (claimed) event?.preventDefault();
          $resolvePendingMarkers(context);
          return claimed;
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
        COMMIT_PENDING_MARKERS_COMMAND,
        () => {
          // See the command's doc comment. The rule is "resolve every pending marker"; the one
          // exception is the node the caret is in — kept pending so we never settle a marker the
          // user is still editing. Compute that exception only while the editor holds DOM focus:
          // a live mid-typing pause must not settle under the user, but an abandoned (blurred)
          // edit has no such node and settles fully. When the caret was moved programmatically
          // (the scrRef "yank"), the current selection is not a node the user chose, so the
          // exception is `lastAnchorKey` — the last node the user themselves placed the caret in
          // — not the live selection. (Same fallback the BLUR handler uses.)
          const rootElement = editor.getRootElement();
          const doc = rootElement?.ownerDocument;
          const hasFocus =
            !!rootElement && !!doc && doc.hasFocus() && rootElement.contains(doc.activeElement);
          let exceptKey: NodeKey | undefined;
          if (hasFocus) {
            if (appPlacedCaret) exceptKey = lastAnchorKey;
            else {
              const selection = $getSelection();
              // Focus, not anchor: the focus point is the caret's live end, so the exception is
              // the right node even when a range selection is extended backward.
              exceptKey = $isRangeSelection(selection) ? selection.focus.key : lastAnchorKey;
            }
          }
          $resolvePendingMarkers(context, exceptKey);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          // Focus loss resolves pending markers, with the same exception as the command above:
          // the node the caret is still parked in stays pending. Clicking a marker-menu item (or
          // any host overlay taking focus) blurs the editor while the caret still sits in the
          // menu's own literal `\...` trigger text; resolving THAT node here would re-tokenize
          // the literal into structure before the menu's apply can consume it (observed
          // corruption: `the wic\ked,` became an unknown-marker paragraph whose prefix glyph then
          // absorbed the "ked," remainder as phantom marker text). The caret's own node still
          // finishes later — via Enter or the caret moving away.
          //
          // A real cross-frame blur — clicking a renderer-overlay palette item outside the editor
          // iframe — can null Lexical's live selection before this handler runs, leaving no
          // selection to read the exception from. Falling back to `undefined` would resolve EVERY
          // pending, including the literal the palette is about to replace (the exact corruption
          // this guard prevents), so fall back to `lastAnchorKey` — the last committed caret node,
          // which the update listener preserves through null-selection commits.
          const selection = $getSelection();
          const anchorKey = $isRangeSelection(selection) ? selection.focus.key : lastAnchorKey;
          $resolvePendingMarkers(context, anchorKey);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(({ editorState, tags }) => {
        context.splitExpected.current = false;
        context.rebuildAttempted.clear();
        // Typing path: ScriptureReferencePlugin's async scrRef echo re-enters
        // `$moveCursorToVerseStart` and yanks the caret to the para/verse start via
        // `editor.update(..., { tag: CURSOR_CHANGE_TAG })` ~90-190ms after a keystroke (timeline:
        // `\` lands, caret sits in the pending literal, then the caret is pulled
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
        // resolution (below) until the user's next keystroke or mouse click clears the flag — not
        // just for this one commit.
        const anchorKey = editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) ? selection.focus.key : undefined;
        });
        // "Did THIS commit move the caret to a different node" — tracked per commit (tagged or
        // not) so the tagged-branch comparison below is never stale. NOT read from
        // prevEditorState inside this listener: entering another state's read() here taints
        // Lexical's active-state bookkeeping mid-commit and stalls the deferred resolution's
        // microtask (observed as departure settles never firing in jsdom — same frozen-state
        // hazard family as the frozen-state bugs documented below).
        const prevCommitAnchorKey = lastCommitAnchorKey;
        lastCommitAnchorKey = anchorKey;
        if (tags.has(CURSOR_CHANGE_TAG)) {
          // Narrowing: arm the suppression window only when the tagged commit
          // actually MOVED the caret to a different node — an app-placed yank. Tagged commits
          // that leave the anchor where it was (or carry no selection) are bookkeeping, not
          // yanks; arming on them re-opened the window after every echo cycle and, combined with
          // the mouse-only-clear residual, could freeze departure settling indefinitely.
          if (anchorKey !== undefined && anchorKey !== prevCommitAnchorKey) appPlacedCaret = true;
          return;
        }
        // Caret still sits where the scrRef sync parked it (no user input since): a follow-on move is
        // not a user departure, so don't advance the anchor or resolve anything.
        if (appPlacedCaret) return;
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
        // the committed state (the frozen-state bugs documented above). The microtask runs before any further
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
