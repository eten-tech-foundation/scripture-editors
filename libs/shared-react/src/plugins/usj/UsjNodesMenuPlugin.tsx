import FloatingBoxAtCursor from "../FloatingBox/FloatingBoxAtCursor";
import { NodeSelectionMenu, OptionItem } from "../NodesMenu";
import UsfmNodesMenuPlugin from "../UsfmNodesMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GetMarkerAction, ScriptureReference } from "shared";

/**
 * One offered menu entry, typed structurally (not imported from the platform package -
 * `shared-react` must not depend on `platform`; the dependency runs the other way). A
 * platform-built `MarkerMenuItem` (richer, with `isBasic`/a narrower `kind` union) is
 * structurally assignable here and flows through unmodified.
 */
export interface MarkerMenuItemLike {
  /** The USFM marker this entry offers, e.g. `"q1"`, `"nd"`, `"f"`. */
  marker: string;
  /** What applying the entry does, e.g. `"paragraph"`, `"character"`, `"note"`, `"closeTag"`. */
  kind: string;
  /** Human-readable description shown beside the marker in the menu. */
  description?: string;
}

/**
 * Caret/selection context the editable-mode harness reads to decide open vs. pass-through
 * behavior - only the fields this file inspects, typed structurally against the platform's
 * real `MarkerMenuContext` so no platform import is needed here either.
 */
export interface MarkerMenuContextLike {
  /** Non-collapsed selection (wrap case, PT9 HandleBackslash). */
  hasTextSelection: boolean;
  /** Set when the caret is inside a note's content - Enter passes through untouched. */
  noteMarker?: string;
  /** Caret is inside marker glyph text - Enter passes through (marker-completion swallow). */
  inMarkerText: boolean;
}

/**
 * Editable-mode marker-menu harness, supplied by the host (the platform package builds it from
 * `EditorRef` methods + the marker item source). Only hosts that let the editor render the marker
 * menu supply one; see the doc comment on {@link EditableMarkerMenu}.
 */
export interface EditableMarkerMenuHarness {
  /** Snapshot of the current caret/selection context, or `undefined` when there's nothing to
   * offer a menu for (readonly, no selection). */
  getContext: () =>
    | (MarkerMenuContextLike & {
        anchorRect?: { x: number; y: number; width: number; height: number };
      })
    | undefined;
  /** `\`-triggered items for `context` (paragraph or character source per the caller). */
  getItems: (context: MarkerMenuContextLike) => MarkerMenuItemLike[];
  /** Enter-triggered items for `context` (paragraph source, SmartEnter choice first). */
  getEnterItems: (context: MarkerMenuContextLike) => MarkerMenuItemLike[];
  /** Applies the chosen item at the current editor selection. */
  apply: (
    item: MarkerMenuItemLike,
    opts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean },
  ) => void;
  /**
   * Commits `typedMarker` as a CLOSING marker (`\` + marker + `*`) — the palette's `*` commit. No
   * opening glyph and no terminating space; the engine resolves the landed bytes against whatever
   * span is open there. Over a non-collapsed selection the selected content is replaced by the
   * closer.
   */
  commitTypedCloser: (typedMarker: string) => void;
}

/** Props for {@link UsjNodesMenuPlugin}. */
export interface UsjNodesMenuPluginProps {
  /** The character that opens the menu when typed, e.g. `"\\"`. */
  trigger: string;
  /** Current Scripture reference — inserted markers (e.g. a footnote's origin) derive from it. */
  scrRef: ScriptureReference;
  /** Marker of the node containing the caret, used to filter the offered markers. */
  contextMarker: string | undefined;
  /** Resolves a chosen marker to the structural action that inserts it. */
  getMarkerAction: GetMarkerAction;
  /**
   * Editable-mode branch (see the doc comment on {@link EditableMarkerMenu}). When provided, the
   * plugin runs the document-first marker menu instead of the legacy typeahead below -
   * non-editable views (which never pass this) are unaffected.
   */
  editableHarness?: EditableMarkerMenuHarness;
}

/**
 * Renders the in-editor marker menu — the marker menu for hosts that do not bring their own UI.
 * Two mutually exclusive branches:
 *
 * - Legacy typeahead (default): `UsfmNodesMenuPlugin`'s trigger-character menu, used by
 *   non-editable marker modes.
 * - Editable mode: when {@link UsjNodesMenuPluginProps.editableHarness} is provided, a
 *   document-first `\`/Enter marker menu driven entirely by the host-supplied harness (see
 *   {@link EditableMarkerMenu}).
 *
 * A host that renders marker menus itself (`EditorOptions.hasExternalUI`, e.g. Platform.Bible,
 * which drives them through its own overlay service) never mounts this plugin at all — `Editor`
 * only renders it while `hasExternalUI` is false.
 */
export function UsjNodesMenuPlugin({
  trigger,
  scrRef,
  contextMarker,
  getMarkerAction,
  editableHarness,
}: UsjNodesMenuPluginProps) {
  const { book, chapterNum, verseNum, verse, versificationStr } = scrRef;
  // Recompute when individual fields change without relying on scrRef identity.
  const scriptureReference = useMemo<ScriptureReference>(
    () => ({ book, chapterNum, verseNum, verse, versificationStr }),
    [book, chapterNum, verseNum, verse, versificationStr],
  );

  if (editableHarness) return <EditableMarkerMenu trigger={trigger} harness={editableHarness} />;

  return (
    <UsfmNodesMenuPlugin
      trigger={trigger}
      scriptureReference={scriptureReference}
      contextMarker={contextMarker}
      getMarkerAction={getMarkerAction}
    />
  );
}

/** An open harness menu's session state, captured when the trigger key opened it. */
interface MenuState {
  /** Which key opened the menu — decides the apply semantics (retag-or-split vs split-only). */
  trigger: "backslash" | "enter";
  /** Whether the `\` trigger arrived over a NON-collapsed selection (the wrap case). The
   * active palette preventDefaults the trigger in every shape, so nothing the user typed is in
   * the document either way and the palette's filter query is the only record of the marker
   * they typed — this flag only decides which Space COMMIT the query feeds (wrap the selection
   * vs materialize the passive literal at the caret). */
  hasTextSelection: boolean;
  /** The entries the menu offers, from the harness's item source. */
  items: MarkerMenuItemLike[];
  /**
   * Monotonic id of THIS session, used as the menu's React `key`. Without it, a `\` commit that
   * reopens the palette leaves `NodeSelectionMenu` mounted, and the component keeps its internal
   * query — so the new session starts pre-filtered by the marker the old one just committed.
   */
  session: number;
}

/** Keys `NodeSelectionMenu`'s query capture must decline for the `\` palette so the harness
 * handler receives them wherever it sits in the same priority chain: the palette's two COMMIT
 * keys, Space (opening marker) and `*` (closing marker). Space is also the one keystroke whose
 * capture-vs-harness registration order flips (the capture registers ahead of the re-registered
 * harness handler for the FIRST key after the menu opens). Both keys commit in every selection
 * shape, so this is one list rather than one per shape. Module-level so the prop is referentially
 * stable across renders. */
const BACKSLASH_MENU_PASSTHROUGH_KEYS: readonly string[] = [" ", "*"];

/** The palette's live filter state, mirrored from `NodeSelectionMenu` via `onFilterChange`. */
interface FilterState {
  /** Exactly what the user typed after the trigger character. */
  query: string;
  /** The options still offered under `query` — empty means there is nothing to commit. */
  options: OptionItem[];
}

/** A menu {@link OptionItem} carrying its source item + apply options for `onSelectOption`. */
interface HarnessOptionItem extends OptionItem {
  markerMenuItem: MarkerMenuItemLike;
  applyOpts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean };
}

/** Adapts one harness menu entry to the {@link NodeSelectionMenu}'s option-item shape. */
function toHarnessOptionItem(
  item: MarkerMenuItemLike,
  applyOpts: HarnessOptionItem["applyOpts"],
): HarnessOptionItem {
  return {
    name: item.marker,
    label: item.marker,
    description: item.description ?? "",
    // Selection is routed through `NodeSelectionMenu`'s `onSelectOption` (below), never through
    // an `OptionItem`'s own `.action` fallback - this is present only to satisfy the type.
    action: () => undefined,
    markerMenuItem: item,
    applyOpts,
  };
}

/**
 * The IN-EDITOR marker menu for editable marker modes (standard view): a document-first
 * `\`/Enter menu mounted by `UsjNodesMenuPlugin` in place of the legacy typeahead when
 * `editableHarness` is supplied. This is the real marker menu for every host that does not
 * bring its own UI — the repo's demos and the scribe package. A host that does
 * (`EditorOptions.hasExternalUI`, e.g. Platform.Bible, which renders marker menus through its
 * own overlay service) never mounts the plugin, so none of this runs there.
 *
 * The `\` palette is ACTIVE (owner-directed, 2026-08-18, superseding the earlier passive
 * design): the trigger preventDefaults in EVERY selection shape, so neither the `\` nor any
 * subsequent typing reaches the document — typed characters filter the palette instead, in
 * every context (collapsed caret, selection, note content alike). Escape always just closes,
 * leaving the document untouched (nothing landed that could need cleaning up).
 *
 * Space commits WHAT WAS TYPED, preserving the end states passive typing settles to:
 * - Collapsed caret: the typed query is materialized at the caret as the SAME literal bytes
 *   passive typing would have accumulated (`\` + query + space) in one update, and Tier 2
 *   resolves them exactly as it resolved passive typing — open span `closed="false"` for an
 *   inline marker (no auto-closer), unknown markers settle as typed, and `\f ` tokenizes to
 *   the full note (the "commits like Enter" row, emergent from the tokenizer, not a palette
 *   branch). Byte-identical by construction; the palette re-implements none of it.
 * - Non-collapsed selection: an EXACT match of the typed query against the offered entries
 *   commits the wrap (the same closed span the Enter commit produces). A marker that is not
 *   offered commits nothing: the palette closes and the selection is left untouched, rather
 *   than the space replacing the selected text or a near-miss entry being applied as a guess.
 *   (A wrap has no literal for Tier 2 to settle, so the unknown-settles-as-typed row cannot
 *   apply here — the refusal is deliberate and visible.)
 *
 * `*` is the palette's second commit key, for CLOSING markers, in EVERY selection shape: it
 * commits `\` + query + `*` and closes, with no terminating space and no opening glyph. The bytes
 * land and the engine resolves them — against a matching open span they become that span's real
 * closer, otherwise they settle as an unmatched closer, flagged as typed. Over a NON-COLLAPSED
 * selection the selected content is DELETED and the closer lands in its place, which is Paratext
 * 9's behavior for typing `\nd*` with text selected — a different gesture from Space's WRAP, which
 * is why the two keys are not interchangeable over a selection. Because `*` commits, it is never a
 * filter character, so a `closeTag` entry can no longer be narrowed to by typing its trailing `*`;
 * pressing `*` commits the end state that entry would have applied.
 *
 * `INSERT_PARAGRAPH_COMMAND` is intercepted at `COMMAND_PRIORITY_CRITICAL` - above
 * `MarkerEditPlugin`'s own `COMMAND_PRIORITY_HIGH` handler - to offer the Enter/SmartEnter
 * paragraph menu instead of splitting; the caret being inside a note (the `\fp` path) or
 * inside marker glyph text (marker-completion swallow) passes through untouched, and so does a
 * `getContext()` returning `undefined` (readonly / no selection).
 *
 * Reuses `NodeSelectionMenu`'s existing query-capture keydown handling (filters/Escape/
 * Backspace once open) rather than rebuilding it, mirroring the palette focus model the legacy
 * typeahead below already uses.
 */
function EditableMarkerMenu({
  trigger,
  harness,
}: {
  trigger: string;
  harness: EditableMarkerMenuHarness;
}) {
  const [editor] = useLexicalComposerContext();
  const [menuState, setMenuState] = useState<MenuState | undefined>(undefined);
  const filterRef = useRef<FilterState>({ query: "", options: [] });
  /** Monotonic session id — see {@link MenuState.session}. */
  const sessionCounterRef = useRef(0);

  /**
   * The `\` palette's OPENING-marker commit, shared by its two commit keys so they cannot drift:
   * Space (`trailingSpace: true`) and `\` (`trailingSpace: false`, which also reopens the palette
   * at the call site). Resolves the marker from what was literally TYPED, never from what is
   * highlighted.
   *
   * A NOTE marker commits through the item commit — the same one Enter uses — rather than through
   * the literal. Materializing `\f ` hands the bytes to the tokenizer, which opens an unterminated
   * note that runs to the end of the paragraph: the first word after the caret becomes the note's
   * CALLER (a leading attribute) and the rest of the sentence becomes its content, so a note taken
   * mid-sentence takes the sentence with it. At the END of a paragraph there is no tail, which is
   * why the literal looks equivalent there and why `\f` looks like it commits the way Enter does.
   * Routing notes here makes that true in every caret position instead of only that one.
   *
   * Everything else materializes the SAME literal bytes passive typing would have put in the
   * document and lets the marker-edit engine resolve them — see the component doc comment for why
   * this is the whole of the passive-Space semantics, byte-identical. Dropping the terminating
   * space is safe because a marker-name scan terminates at the next `\` (measured: `\nd` and
   * `\nd ` settle to the same open span at a caret).
   */
  const commitTypedQuery = useCallback(
    (typed: string, items: MarkerMenuItemLike[], trailingSpace: boolean) => {
      const noteItem = items.find(
        (candidate) => candidate.kind === "note" && candidate.marker === typed,
      );
      if (noteItem) {
        harness.apply(noteItem, { trigger: "backslash", literalPrefixLanded: false });
        return;
      }
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection))
          selection.insertText(`${trigger}${typed}${trailingSpace ? " " : ""}`);
      });
    },
    [editor, harness, trigger],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (menuState) {
            // PT9 parity (owner-directed, revising the earlier zero-candidate dismiss): a commit
            // with nothing to commit is a NO-OP and the palette stays open — the user can
            // Backspace the filter wider, Space-commit the typed marker, or Escape out. The key
            // is still claimed here because `useMenuCore`'s select() silently returns on an
            // empty list — an unclaimed Enter would fall through and split the paragraph under
            // the open palette.
            if (
              (event.key === "Enter" || event.key === "Tab") &&
              filterRef.current.options.length === 0
            ) {
              event.preventDefault();
              event.stopPropagation();
              return true;
            }
            // `*` is the `\` palette's CLOSING-marker commit key: commit `\typed*` and close,
            // with no terminating space and no opening glyph. It commits in EVERY selection
            // shape — over a non-collapsed selection the selected content is deleted and the
            // closer lands in its place (Paratext 9's behavior for typing `\nd*` with text
            // selected), which is a different gesture from Space's selection WRAP.
            if (event.key === "*" && menuState.trigger === "backslash") {
              // Nothing may land: an un-prevented `*` would append a literal asterisk after the
              // committed closer.
              event.preventDefault();
              event.stopPropagation();
              setMenuState(undefined);
              harness.commitTypedCloser(filterRef.current.query);
              return true;
            }
            // `\` is the palette's THIRD commit key (owner-directed): it commits what was typed
            // exactly as Space does but emits NO terminating space byte, then opens a FRESH
            // palette for the backslash just pressed — so `\qt-s\qt-e` is one continuous flow.
            // The separator is unnecessary because a marker-name scan terminates at `\` anyway,
            // and the next session's own commit supplies that backslash.
            //
            // Scoped to the collapsed-caret `\` palette: over a selection the commit is the WRAP,
            // which consumes the selection and leaves nothing for a second marker to attach to.
            if (
              event.key === trigger &&
              menuState.trigger === "backslash" &&
              !menuState.hasTextSelection
            ) {
              event.preventDefault();
              event.stopPropagation();
              const typedBeforeTrigger = filterRef.current.query;
              if (!typedBeforeTrigger) {
                // Nothing typed, so there is nothing to commit and `\` is just a character:
                // land it and close, WITHOUT opening a new palette (owner-directed — typing `\`
                // twice types a backslash, and that is the behavior being preserved).
                setMenuState(undefined);
                editor.update(() => {
                  const selection = $getSelection();
                  if ($isRangeSelection(selection)) selection.insertText(trigger);
                });
                return true;
              }
              commitTypedQuery(typedBeforeTrigger, menuState.items, false);
              // Reopen through the same path the `\` trigger itself uses, so the new session's
              // ranking, search bar and zero-match rules are identical to any other session's.
              const reopenContext = harness.getContext();
              filterRef.current = { query: "", options: [] };
              sessionCounterRef.current += 1;
              setMenuState(
                reopenContext
                  ? {
                      trigger: "backslash",
                      hasTextSelection: reopenContext.hasTextSelection,
                      items: harness.getItems(reopenContext),
                      session: sessionCounterRef.current,
                    }
                  : undefined,
              );
              return true;
            }
            // Otherwise Space is the `\` palette's COMMIT key ("commit what was typed"); every
            // other keystroke — and every key of the Enter-triggered menu, whose only commit is
            // the highlighted item — goes to `NodeSelectionMenu`'s capture below
            // (filters/Escape/Backspace) or to `LexicalMenuNavigation` (arrows/Enter/Tab).
            if (event.key !== " " || menuState.trigger !== "backslash") return false;
            // Nothing may land: an un-prevented space would insert a real browser space on top
            // of whatever the commit produces (and would replace a live selection).
            event.preventDefault();
            event.stopPropagation();
            setMenuState(undefined); // Space always dismisses the palette, commit or refusal
            const typed = filterRef.current.query;
            if (menuState.hasTextSelection) {
              // Wrap case: the marker is whatever was literally TYPED, not whatever is
              // highlighted — an exact match against the offered entries. A marker that is not
              // offered (unknown, or not valid here) has nothing to commit: the palette is
              // dismissed and the selection left untouched rather than wrapped in a guess.
              const item = menuState.items.find((candidate) => candidate.marker === typed);
              if (item) harness.apply(item, { trigger: "backslash", literalPrefixLanded: false });
              return true;
            }
            commitTypedQuery(typed, menuState.items, true);
            return true;
          }
          if (event.key !== trigger) return false;
          const context = harness.getContext();
          if (!context) return false;

          // ACTIVE palette: the trigger never lands, whatever the selection shape — typing
          // filters the palette, not the document.
          event.preventDefault();
          filterRef.current = { query: "", options: [] };
          sessionCounterRef.current += 1;
          setMenuState({
            trigger: "backslash",
            hasTextSelection: context.hasTextSelection,
            items: harness.getItems(context),
            session: sessionCounterRef.current,
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          if (menuState) return false; // shouldn't be reachable while a menu is open; stay defensive
          const context = harness.getContext();
          // The noteMarker/inMarkerText guards are DEFENSIVE against non-keyboard
          // INSERT_PARAGRAPH_COMMAND dispatch sources (host calls, paste/IME paths can dispatch
          // it without any keydown). Via keyboard they are unreachable in the current topology:
          // the platform's MarkerEditPlugin KEY_ENTER_COMMAND handler (HIGH) swallows Enter
          // first for exactly these states ($handleEnterInNote / $isSelectionInMarkerNode), so
          // rich-text's KEY_ENTER fallback never dispatches INSERT_PARAGRAPH from typing there.
          if (!context || context.noteMarker || context.inMarkerText) return false;

          sessionCounterRef.current += 1;
          setMenuState({
            trigger: "enter",
            hasTextSelection: false,
            items: harness.getEnterItems(context),
            session: sessionCounterRef.current,
          });
          return true; // suppress the split - Escape below cancels outright (it never happened)
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, trigger, harness, menuState, commitTypedQuery]);

  const handleClose = useCallback(() => setMenuState(undefined), []);

  const handleFilterChange = useCallback((query: string, options: OptionItem[]) => {
    filterRef.current = { query, options };
  }, []);

  const handleSelectOption = useCallback(
    (option: OptionItem) => {
      const { markerMenuItem, applyOpts } = option as HarnessOptionItem;
      harness.apply(markerMenuItem, applyOpts);
    },
    [harness],
  );

  const options = useMemo(
    () =>
      menuState?.items.map((item) =>
        // `literalPrefixLanded` is constant `false` under the active palette: the trigger never
        // lands, so an item commit never has a literal prefix to clean up. The field stays in
        // the apply contract because hosts whose own palettes DO land literals still pass true.
        toHarnessOptionItem(item, { trigger: menuState.trigger, literalPrefixLanded: false }),
      ),
    [menuState],
  );

  return (
    menuState && (
      <FloatingBoxAtCursor isOpen>
        {({ placement }) => (
          <NodeSelectionMenu
            // Remount per session so a reopened palette starts with an empty query.
            key={menuState.session}
            options={options ?? []}
            onSelectOption={handleSelectOption}
            onClose={handleClose}
            onFilterChange={handleFilterChange}
            inverse={placement === "top-start"}
            menuOpenKey={trigger}
            passthroughKeys={
              menuState.trigger === "backslash" ? BACKSLASH_MENU_PASSTHROUGH_KEYS : undefined
            }
          />
        )}
      </FloatingBoxAtCursor>
    )
  );
}
