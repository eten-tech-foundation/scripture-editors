import FloatingBoxAtCursor from "../FloatingBox/FloatingBoxAtCursor";
import { NodeSelectionMenu, OptionItem } from "../NodesMenu";
import UsfmNodesMenuPlugin from "../UsfmNodesMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
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
  /** Whether a literal `\marker` trigger prefix landed before the caret (backslash trigger,
   * collapsed selection only) - passed straight through to `apply`. */
  literalPrefixLanded: boolean;
  /** The `\` trigger fired over a NON-collapsed selection: committing wraps the selection, and
   * because that trigger preventDefaulted, nothing the user typed reached the document — the
   * palette's own filter query is the only record of the marker they typed. */
  wrapsSelection: boolean;
  /** The entries the menu offers, from the harness's item source. */
  items: MarkerMenuItemLike[];
}

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
 * Selection-shape rule for the `\` trigger (PT9 `MarkerDropdownEditHandler.HandleBackslash`):
 * a collapsed caret does NOT preventDefault (the literal `\` lands as text; the menu opens as
 * an overlay over it) while a non-collapsed selection DOES (wrap case, no literal text).
 * Escape always just closes (never mutates the document / never touches the selection).
 *
 * Space is the PASSIVE palette's key and always dismisses. Over a collapsed caret it is left
 * un-prevented so the literal space lands after the typed `\marker` and marker completion
 * resolves it from those bytes. Over a selection there are no such bytes — the trigger
 * preventDefaulted — so the palette's own filter query is the record of what was typed, and an
 * EXACT match against the offered entries commits the wrap (the same closed span the Enter
 * commit produces). A marker that is not offered commits nothing: the palette closes and the
 * selection is left untouched, rather than the space replacing the selected text or a
 * near-miss entry being applied as a guess.
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
            // Already open: Space is the PASSIVE palette's own key; every other keystroke goes
            // to `NodeSelectionMenu`'s capture below (filters/Escape/Backspace) or to
            // `LexicalMenuNavigation` (arrows/Enter/Tab).
            if (event.key !== " ") return false;
            setMenuState(undefined); // Space always dismisses the palette
            // Collapsed caret: the literal `\marker` is IN the document, so the space is left
            // un-prevented to land after it and let marker completion resolve the typed literal.
            // `true` still claims the event so the capture below cannot swallow it as a filter
            // character — a swallowed space is a keystroke accepted and discarded.
            if (!menuState.wrapsSelection) return true;
            // Wrap case: the trigger preventDefaulted, so no literal exists to resolve and the
            // space must not be allowed to replace the selection either.
            event.preventDefault();
            event.stopPropagation();
            // The marker is whatever was literally TYPED, not whatever is highlighted — an
            // exact match against the offered entries. A marker that is not offered (unknown, or
            // not valid here) has nothing to commit: the palette is dismissed and the selection
            // left untouched rather than wrapped in a guess.
            const typed = filterRef.current.query;
            const item = menuState.items.find((candidate) => candidate.marker === typed);
            if (item) harness.apply(item, { trigger: "backslash", literalPrefixLanded: false });
            return true;
          }
          if (event.key !== trigger) return false;
          const context = harness.getContext();
          if (!context) return false;

          const collapsed = !context.hasTextSelection;
          if (!collapsed) event.preventDefault(); // wrap case: no literal trigger text
          filterRef.current = { query: "", options: [] };
          setMenuState({
            trigger: "backslash",
            literalPrefixLanded: collapsed,
            wrapsSelection: !collapsed,
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
            literalPrefixLanded: false,
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
        toHarnessOptionItem(item, {
          trigger: menuState.trigger,
          literalPrefixLanded: menuState.literalPrefixLanded,
        }),
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
          />
        )}
      </FloatingBoxAtCursor>
    )
  );
}
