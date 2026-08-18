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
 * QA-ONLY editable-mode marker-menu harness, supplied by the platform (built from
 * `EditorRef` methods + the marker item source). See the doc comment on
 * {@link EditableMarkerMenu} for what this is and isn't.
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
   * QA-ONLY editable-mode branch (see the doc comment on {@link EditableMarkerMenu}). When
   * provided, the plugin runs the document-first harness instead of the legacy typeahead
   * below - non-editable views (which never pass this) are unaffected.
   */
  editableHarness?: EditableMarkerMenuHarness;
}

/**
 * Renders the in-editor marker menu. Two mutually exclusive branches:
 *
 * - Legacy typeahead (default): `UsfmNodesMenuPlugin`'s trigger-character menu, used by
 *   non-editable marker modes.
 * - QA-only editable-mode harness: when {@link UsjNodesMenuPluginProps.editableHarness} is
 *   provided, a document-first `\`/Enter marker menu driven entirely by the host-supplied
 *   harness (see {@link EditableMarkerMenu} — production hosts render marker menus via their
 *   own overlay UI instead and never pass a harness).
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
}

/** Keys `NodeSelectionMenu`'s query capture must decline for the `\` palette so the harness
 * handler receives them wherever it sits in the same priority chain: Space is the palette's
 * commit key, and the one keystroke whose capture-vs-harness registration order flips (the
 * capture registers ahead of the re-registered harness handler for the FIRST key after the
 * menu opens). Module-level so the prop is referentially stable across renders. */
const BACKSLASH_MENU_PASSTHROUGH_KEYS: readonly string[] = [" "];

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
 * QA HARNESS ONLY - P10 renders marker menus via the host overlay service. Not
 * maintained for production; no polish or completeness guarantees beyond what demo QA needs.
 *
 * Document-first `\`/Enter marker menu for editable marker modes (standard view), mounted by
 * `UsjNodesMenuPlugin` in place of the legacy typeahead when `editableHarness` is supplied.
 *
 * The `\` palette is ACTIVE (owner-directed, 2026-08-18, superseding the earlier passive
 * design): the trigger preventDefaults in EVERY selection shape, so neither the `\` nor any
 * subsequent typing reaches the document — typed characters filter the palette instead, in
 * every context (collapsed caret, selection, note content alike). Escape always just closes,
 * leaving the document untouched (nothing landed that could need cleaning up).
 *
 * Space commits WHAT WAS TYPED, preserving the passive palette's ratified Space end states:
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
 * `INSERT_PARAGRAPH_COMMAND` is intercepted at `COMMAND_PRIORITY_CRITICAL` - above
 * `MarkerEditPlugin`'s own `COMMAND_PRIORITY_HIGH` handler - to offer the Enter/SmartEnter
 * paragraph menu instead of splitting; the caret being inside a note (the `\fp` path) or
 * inside marker glyph text (marker-completion swallow) passes through untouched, and so does a
 * `getContext()` returning `undefined` (readonly / no selection).
 *
 * Reuses `NodeSelectionMenu`'s existing query-capture keydown handling (filters/Escape/
 * Backspace once open) rather than rebuilding it - acceptable for a QA harness, mirrors the
 * palette focus model already used by the legacy typeahead below.
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

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (menuState) {
            // P9 parity (owner-directed, revising the earlier zero-candidate dismiss): a commit
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
            // Collapsed caret: materialize the typed query as the SAME literal bytes passive
            // typing would have put in the document (trigger + query + terminating space) and
            // let the marker-edit engine resolve them — see the component doc comment for why
            // this is the whole of the passive-Space semantics, byte-identical.
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) selection.insertText(`${trigger}${typed} `);
            });
            return true;
          }
          if (event.key !== trigger) return false;
          const context = harness.getContext();
          if (!context) return false;

          // ACTIVE palette: the trigger never lands, whatever the selection shape — typing
          // filters the palette, not the document.
          event.preventDefault();
          filterRef.current = { query: "", options: [] };
          setMenuState({
            trigger: "backslash",
            hasTextSelection: context.hasTextSelection,
            items: harness.getItems(context),
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

          setMenuState({
            trigger: "enter",
            hasTextSelection: false,
            items: harness.getEnterItems(context),
          });
          return true; // suppress the split - Escape below cancels outright (it never happened)
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, trigger, harness, menuState]);

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
