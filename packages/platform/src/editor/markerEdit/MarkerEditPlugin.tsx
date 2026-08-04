import { $removeCharFormattingFromSelection } from "./charFormatting.utils";
import {
  $charNodeDeletionTransform,
  $noteDeletionTransform,
  $paraMarkerDeletionTransform,
} from "./markerEditDeletion.utils";
import {
  $adoptDomCaretInExpandedNote,
  $handleEnterInNote,
  $handlePasteLinesInNote,
} from "./markerEditNote.utils";
import {
  $chapterNodeTransform,
  $isSelectionInMarkerNode,
  $markerNodeTransform,
  $milestoneAttributeDisplayText,
  $resolvePendingMarkers,
  $verseNodeTransform,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import { $rependPendShapedNodes, $textNodeTier2Transform } from "./markerEditTier2Trigger.utils";
import {
  $displayWhitespaceTransform,
  $handleCopyForStandardView,
  $handlePasteForStandardView,
  htmlPasteText,
} from "./whitespaceDisplay.plugin.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  createCommand,
  CUT_COMMAND,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
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
  $hasCaretHeldAttributeRun,
  $hasCaretHeldMilestoneRun,
  $hasCaretHeldSeparatorGap,
  $hasCaretHeldVerseAttributeRun,
  $isMarkerNode,
  $isMilestoneNode,
  $isVerseNode,
  $syncMilestoneDisplayRun,
  $syncVerseAttributeDisplay,
  canonicalAttributeText,
  ChapterNode,
  CharNode,
  CURSOR_CHANGE_TAG,
  defaultMarkerAttribute,
  getMarker as bundledGetMarker,
  LoggerBasic,
  MarkerLookup,
  MarkerNode,
  MilestoneNode,
  NBSP,
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
 * Sync `node`'s milestone display run to its fields, and pend it while the caret holds the run's
 * site (mid-edit grace) so caret departure settles it ($resolvePendingMarkers). Shared by the
 * MilestoneNode transform and the MarkerNode transform (via {@link $milestoneOfOpeningGlyph}): a
 * milestone's run rides as its FOLLOWING SIBLINGS, so an edit that touches only the run — deleting
 * just its attribute TextNode — dirties the flanking glyphs but never the DecoratorNode-based
 * MilestoneNode, whose own transform would then never fire. Running this off the dirtied opening
 * glyph gives attribute-only deletion the pend path it needs; without it the run silently
 * resurrects from the still-set fields on the next unrelated dirtying.
 */
function $syncAndPendMilestone(node: MilestoneNode, context: MarkerEditContext): void {
  const expectedText = $milestoneAttributeDisplayText(node);
  $syncMilestoneDisplayRun(node, expectedText);
  if (node.isAttached() && $hasCaretHeldMilestoneRun(node, expectedText))
    context.pendingKeys.add(node.getKey());
}

/**
 * The MilestoneNode that `node` is the OPENING display glyph of — the glyph rides as the
 * milestone's direct next sibling — or `undefined`. Lets the MarkerNode transform re-drive the
 * owning milestone's sync/pend when a run-only edit dirties the glyph but leaves the milestone
 * itself clean (see {@link $syncAndPendMilestone}).
 */
function $milestoneOfOpeningGlyph(node: MarkerNode): MilestoneNode | undefined {
  if (node.getMarkerSyntax() !== "opening") return undefined;
  const previous = node.getPreviousSibling();
  return $isMilestoneNode(previous) && previous.getMarker() === node.getMarker()
    ? previous
    : undefined;
}

/**
 * Sync `node`'s verse `\va`/`\vp` display runs to its altnumber/pubnumber, and pend it while the
 * caret holds a run's site (mid-edit grace) so caret departure settles it ($resolvePendingMarkers).
 * The verse analogue of {@link $syncAndPendMilestone}: a verse's runs ride as its FOLLOWING
 * SIBLINGS, so an edit that touches only a run — deleting just its value TextNode — dirties the
 * flanking `\va`/`\vp` glyphs but NOT the VerseNode (a TextNode whose own transform fires only when
 * the verse node itself is dirtied). Running this off the dirtied glyph (via
 * {@link $verseOfAttributeGlyph}) gives value-only deletion the pend path it needs; without it the
 * deleted run would silently resurrect from the still-set altnumber/pubnumber on the next unrelated
 * dirtying.
 */
function $syncAndPendVerse(node: VerseNode, context: MarkerEditContext): void {
  const altnumber = node.getAltnumber();
  const pubnumber = node.getPubnumber();
  $syncVerseAttributeDisplay(node, altnumber, pubnumber);
  if (node.isAttached() && $hasCaretHeldVerseAttributeRun(node, altnumber, pubnumber))
    context.pendingKeys.add(node.getKey());
}

/**
 * The VerseNode whose `\va`/`\vp` display run `node` is an OPENING glyph of — walking back over any
 * preceding run pieces (a `\va` run sitting before a `\vp`) to the verse the run rides on — or
 * `undefined`. Lets the MarkerNode transform re-drive the owning verse's sync/pend when a run-only
 * edit dirties a run glyph but leaves the verse itself clean (see {@link $syncAndPendVerse}).
 */
function $verseOfAttributeGlyph(node: MarkerNode): VerseNode | undefined {
  if (node.getMarkerSyntax() !== "opening") return undefined;
  const marker = node.getMarker();
  if (marker !== "va" && marker !== "vp") return undefined;
  for (
    let previous = node.getPreviousSibling();
    previous;
    previous = previous.getPreviousSibling()
  ) {
    if ($isVerseNode(previous)) return previous;
    const isRunPiece =
      ($isMarkerNode(previous) &&
        (previous.getMarker() === "va" || previous.getMarker() === "vp")) ||
      ($isTextNode(previous) && $getState(previous, textTypeState) === "attribute");
    if (!isRunPiece) return undefined;
  }
  return undefined;
}

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
        // A milestone's display run rides as its FOLLOWING SIBLINGS, so deleting only the run's
        // attribute TextNode dirties this flanking glyph but NOT the DecoratorNode-based
        // MilestoneNode — its own transform never fires. Re-run the owning milestone's sync/pend
        // off the dirtied opening glyph so an attribute-only deletion settles on caret departure
        // instead of silently resurrecting from the milestone's still-set fields.
        const milestone = $milestoneOfOpeningGlyph(node);
        if (milestone) $syncAndPendMilestone(milestone, context);
        // Same reasoning for a verse's \va/\vp run: deleting only its value TextNode dirties the
        // flanking glyph but not the VerseNode (a TextNode dirtied only when the verse itself
        // changes), so its own transform below never fires. Re-drive the owning verse's sync/pend
        // off the dirtied opening glyph so a value-only deletion settles on caret departure.
        const verse = $verseOfAttributeGlyph(node);
        if (verse) $syncAndPendVerse(verse, context);
      }),
      editor.registerNodeTransform(VerseNode, (node) => {
        if (editor.isComposing()) return;
        $verseNodeTransform(node, context);
        // Same grace/pend pairing for a deleted or diverged \va/\vp attribute run
        // (attributeDisplay.utils.ts): while the caret holds the run's site, TextSpacingPlugin's
        // sync leaves it alone, so pend the verse here for the caret-departure settle — otherwise
        // a full-triplet deletion never re-tokenizes and the sync just re-derives the run from the
        // still-set altnumber/pubnumber (the deletion silently undoes itself).
        if (
          node.isAttached() &&
          $hasCaretHeldVerseAttributeRun(node, node.getAltnumber(), node.getPubnumber())
        )
          context.pendingKeys.add(node.getKey());
      }),
      editor.registerNodeTransform(ChapterNode, (node) => {
        if (editor.isComposing()) return;
        $chapterNodeTransform(node);
      }),
      editor.registerNodeTransform(ParaNode, (node) => {
        if (editor.isComposing()) return;
        $paraMarkerDeletionTransform(node, context);
      }),
      editor.registerNodeTransform(CharNode, (node) => {
        if (editor.isComposing()) return;
        $charNodeDeletionTransform(node, context);
        // A just-deleted opener separator is left alone by the CharNodePlugin sync while the
        // caret sits at it (mid-edit grace, markerSeparators.utils.ts); pend the span so caret
        // departure settles it back to canonical via the Tier-2 completion path, exactly like a
        // pending marker literal.
        if (node.isAttached() && $hasCaretHeldSeparatorGap(node))
          context.pendingKeys.add(node.getKey());
        // Same grace/pend pairing for a deleted or diverged attribute display run
        // (attributeDisplay.utils.ts): while the caret holds it, CharNodePlugin's sync leaves it
        // alone, so pend the span here for the caret-departure settle.
        const expectedText = canonicalAttributeText(
          node.getUnknownAttributes() ?? {},
          defaultMarkerAttribute(node.getMarker()),
        );
        if (node.isAttached() && $hasCaretHeldAttributeRun(node, expectedText))
          context.pendingKeys.add(node.getKey());
      }),
      // Self-healing milestone display run (attributeDisplay.utils.ts): a `MilestoneNode` exists
      // in every markerMode, so — unlike CharNode/VerseNode, whose editable-only node types make
      // an ungated shared-react plugin registration safe — this sync is registered HERE, gated by
      // this whole plugin's markerMode-"editable" check, so visible/hidden mode's
      // ImmutableTypedTextNode-based milestone runs (built by the adaptor, never edited) are never
      // touched. Same grace/pend pairing as the char/verse cases: while the caret holds the run's
      // site — inside the attribute text (reachable when a remote collab update changes
      // sid/eid/unknownAttributes while the local caret is mid-editing that same run), or at a
      // just-deleted run's insertion point (the run is the milestone's entire byte
      // representation, so deleting all of it must delete the milestone, not resurrect the run)
      // — the sync leaves it alone and the milestone is pended for the caret-departure settle
      // ($resolvePendingMarkers).
      editor.registerNodeTransform(MilestoneNode, (node) => {
        if (editor.isComposing()) return;
        $syncAndPendMilestone(node, context);
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
          // ordering: `$handleEnterInNote` runs (and may edit the note) first; the in-marker
          // check only runs when the note path declined.
          const noteOutcome = $handleEnterInNote();
          // The note path removed a selection but left the caret with no intact note at it
          // (a boundary-crossing range, or the removal destroyed the note's opening glyph):
          // Enter finishes as a NORMAL paragraph split. Claiming the key bypasses RichText's
          // KEY_ENTER — which would have dispatched exactly this — so dispatch it here: the
          // INSERT_PARAGRAPH handler below sets `splitExpected` and RichText's own handler
          // performs the split, giving the new paragraph its marker prefix instead of letting
          // the paragraph transform merge it straight back.
          if (noteOutcome === "needs-plain-split")
            editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
          const claimed = noteOutcome !== "declined" || $isSelectionInMarkerNode();
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
        PASTE_COMMAND,
        (event) => {
          // Inside EXPANDED note content a pasted line break is an `\fp` (footnote-paragraph)
          // break — the same break Enter makes there — never a paragraph split: the generic
          // fall-through would let @lexical/clipboard's per-newline `insertParagraph()` (or its
          // html branch's node insertion) split the paragraph THROUGH the (inline, non-block)
          // note, threading `\p` paragraphs into the footnote. So multi-line pastes whose
          // selection touches an expanded note are claimed and replayed with note semantics.
          //
          // Registered at COMMAND_PRIORITY_CRITICAL: with structure protection on (the
          // Simple-mode default) StructureProtectionPlugin handles PASTE at HIGH and
          // sanitize-inserts any html-bearing payload before a lower-priority claim could run —
          // but an `\fp` break edits NOTE CONTENT, not document structure, so the in-note claim
          // must win. Outranking the standard-view NBSP normalization at HIGH is fine because
          // the claim applies the same NBSP → `~` display mapping itself (below).
          //
          // The claim covers editor-internal rich pastes (application/x-lexical-editor) too:
          // an internal copy of multi-paragraph text replays REAL paragraph nodes, which
          // inside a note is the very split this claim prevents — its text/plain lines become
          // `\fp` breaks like any other source's. Outside notes (and for single-line pastes)
          // the note gate declines and internal pastes keep their rich node semantics.
          const clipboardData =
            event && typeof event === "object" && "clipboardData" in event
              ? (event as ClipboardEvent).clipboardData
              : null;
          if (!clipboardData) return false;
          // text/plain is authoritative when present; some sources (word processors,
          // intermediaries) ship text/html alone, so fall back to its decoded text — otherwise
          // those pastes reach RichText's html branch and split paragraphs through the note.
          // Line endings normalize BEFORE the multi-line check so `\r\n` (and bare-`\r`)
          // clipboards break correctly and no `\r` ever reaches note content.
          const plainText = clipboardData.getData("text/plain");
          const rawText = plainText || htmlPasteText(clipboardData.getData("text/html"));
          const pastedText = rawText.replace(/\r\n?/g, "\n");
          if (pastedText.includes("\n")) {
            // Standard view: a pasted data-NBSP takes its `~` display form here, exactly as
            // `$handlePasteForStandardView` does for the pastes that reach it — inserted raw
            // it is indistinguishable from a display-NBSP (a plain space in a run), so
            // serialization would corrupt it into a plain space. A pasted literal `~` is
            // already the display form and passes through in both paths.
            const noteText = isStandardView ? pastedText.replaceAll(NBSP, "~") : pastedText;
            const lines = noteText.split("\n");
            let outcome = $handlePasteLinesInNote(lines, context.getMarker);
            if (outcome === "declined" && $adoptDomCaretInExpandedNote(editor)) {
              // The editor-state caret had strayed from the user-visible one (a live paste is
              // dispatched async — ClipboardPlugin reads the clipboard first — and selection
              // processing in that gap can park the state caret outside the note, observed on
              // the popover wrapper's marker glyph). The DOM caret was inside expanded note
              // content, so it was adopted; re-run the claim against it.
              outcome = $handlePasteLinesInNote(lines, context.getMarker);
            }
            if (outcome === "handled") {
              // Same contract as the Enter handler: claiming must also preventDefault the DOM
              // event itself, or the browser's native paste still lands after Lexical's
              // (preventDefault-issuing) RichText handler is bypassed.
              event?.preventDefault();
              return true;
            }
            // "needs-plain-split" falls through with the selection removal already applied:
            // the caret's note did not survive, so the rest of the paste is the ordinary
            // paragraph-splitting insertion below — exactly the outside-note behavior.
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        () => {
          // A multi-line paste splits paragraphs WITHOUT the Enter path: @lexical/clipboard's
          // text/plain handling calls `selection.insertParagraph()` directly per newline (never
          // INSERT_PARAGRAPH_COMMAND), so the INSERT_PARAGRAPH handler above can't arm the flag
          // for it. Arm it here instead — the whole paste (RichText's handler runs below this
          // one, at COMMAND_PRIORITY_EDITOR) lands in the same update, so every fresh
          // prefix-less paragraph it creates gets its marker prefix injected instead of being
          // read as marker-deleted and merged straight back into the paragraph above (a paste
          // of three lines collapsed into one). The update listener below resets the flag after
          // the commit, exactly as for Enter. Kept at LOW — BELOW the handlers at HIGH — so a
          // paste consumed there never arms the flag, exactly as before the in-note claim moved
          // up to CRITICAL.
          context.splitExpected.current = true;
          return false;
        },
        COMMAND_PRIORITY_LOW,
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
          // While the app-placed-caret window is armed (a scrRef-sync yank or an undo/redo
          // restore), focus loss carries no user intent over the restored content: clicking
          // ANOTHER PANEL right after an undo would otherwise re-settle the explicitly-undone
          // literal behind the user's back. The literal stays pending — it serializes as
          // literal bytes, which ParatextData parses — and the user's next in-editor gesture
          // (click or keystroke) releases the window so departure/blur settle normally again.
          if (appPlacedCaret) return false;
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
        if (tags.has(HISTORIC_TAG)) {
          // Undo/redo: Lexical restores this state via setEditorState, which never runs node
          // transforms — so a restored literal (an undone settle's `\nd …\nd*` bytes, a closed
          // span's `|attrs` text, a diverged glyph or attribute run) would never re-pend itself,
          // and caret departure would settle NOTHING, leaving it literal forever (reviving only
          // when typed inside). Re-derive the pend set from the restored bytes with a strictly
          // READ-ONLY scan: keys land in the plain pendingKeys Set, no node is mutated, so this
          // commit produces no history entry and the undo/redo stacks stay intact. Stale keys
          // are cleared first — they describe the pre-restore document, and a leftover key
          // pointing at a now-canonical node would drive a pointless refused rebuild later.
          context.pendingKeys.clear();
          editorState.read(() => $rependPendShapedNodes(context));
          // The restored caret is app-placed (history put it there, not a fresh user gesture),
          // and a historic restore is NOT a departure: resolving now — or on any follow-on
          // bookkeeping commit — would re-settle the just-undone literal immediately, making
          // the undo look dead and burying the user's next undo under the re-settle (the undo
          // trap). Arm the same suppression window the scrRef yank uses; the user's next
          // keystroke or mouse click clears it, and the normal departure settle takes over.
          appPlacedCaret = true;
          // Keep the anchor fresh so the BLUR/Enter except-the-user's-node fallbacks and the
          // next departure comparison read the restored caret, not a pre-undo one.
          if (anchorKey !== undefined) lastAnchorKey = anchorKey;
          return;
        }
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
          editor.update(() => {
            const mutated = $resolvePendingMarkers(context, lastAnchorKey);
            // A resolve pass that only REFUSED (fixed-point rebuilds — e.g. a re-pended
            // degradation literal after an undo, or a canonical attribute run) changes nothing
            // visible, but each refused $rebuildParas probe still created parse orphans that
            // count as dirty leaves — without this tag that visually-no-op commit PUSHES a
            // phantom undo entry (one dead Ctrl+Z press) and wipes the redo stack. Merge it
            // into the current history entry instead; a resolve that actually settled anything
            // keeps its own entry (undo must restore the pre-settle literal).
            if (!mutated) $addUpdateTag(HISTORY_MERGE_TAG);
          });
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
