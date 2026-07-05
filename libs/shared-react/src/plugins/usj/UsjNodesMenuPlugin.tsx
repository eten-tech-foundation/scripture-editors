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
import { useCallback, useEffect, useMemo, useState } from "react";
import { GetMarkerAction, ScriptureReference } from "shared";

/**
 * One offered menu entry, typed structurally (not imported from the platform package -
 * `shared-react` must not depend on `platform`; the dependency runs the other way). A
 * platform-built `MarkerMenuItem` (richer, with `isBasic`/a narrower `kind` union) is
 * structurally assignable here and flows through unmodified.
 */
export interface MarkerMenuItemLike {
  marker: string;
  kind: string;
  description?: string;
}

/**
 * Caret/selection context the editable-mode harness reads to decide open vs. pass-through
 * behavior - only the fields this file inspects, typed structurally against the platform's
 * real `MarkerMenuContext` (Task 1/2) so no platform import is needed here either.
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

export interface UsjNodesMenuPluginProps {
  trigger: string;
  scrRef: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: GetMarkerAction;
  /**
   * QA-ONLY editable-mode branch (see the doc comment on {@link EditableMarkerMenu}). When
   * provided, the plugin runs the document-first harness instead of the legacy typeahead
   * below - non-editable views (which never pass this) are unaffected.
   */
  editableHarness?: EditableMarkerMenuHarness;
}

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

interface MenuState {
  trigger: "backslash" | "enter";
  /** Whether a literal `\marker` trigger prefix landed before the caret (backslash trigger,
   * collapsed selection only) - passed straight through to `apply`. */
  literalPrefixLanded: boolean;
  items: MarkerMenuItemLike[];
}

interface HarnessOptionItem extends OptionItem {
  markerMenuItem: MarkerMenuItemLike;
  applyOpts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean };
}

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
 * QA HARNESS ONLY - P10 renders marker menus via the host overlay service (spec §1.5). Not
 * maintained for production; no polish or completeness guarantees beyond what demo QA needs.
 *
 * Document-first `\`/Enter marker menu for editable marker modes (standard view), mounted by
 * `UsjNodesMenuPlugin` in place of the legacy typeahead when `editableHarness` is supplied.
 * Selection-shape rule for the `\` trigger (PT9 `MarkerDropdownEditHandler.HandleBackslash`):
 * a collapsed caret does NOT preventDefault (the literal `\` lands as text; the menu opens as
 * an overlay over it) while a non-collapsed selection DOES (wrap case, no literal text).
 * Escape always just closes (never mutates the document / never touches the selection).
 * `INSERT_PARAGRAPH_COMMAND` is intercepted at `COMMAND_PRIORITY_CRITICAL` - above
 * `MarkerEditPlugin`'s own `COMMAND_PRIORITY_HIGH` handler - to offer the Enter/SmartEnter
 * paragraph menu instead of splitting; the caret being inside a note (Phase 3's `\fp` path) or
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

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          // Already open: leave every keystroke to `NodeSelectionMenu`'s own capture below.
          if (menuState || event.key !== trigger) return false;
          const context = harness.getContext();
          if (!context) return false;

          const collapsed = !context.hasTextSelection;
          if (!collapsed) event.preventDefault(); // wrap case: no literal trigger text
          setMenuState({
            trigger: "backslash",
            literalPrefixLanded: collapsed,
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
            inverse={placement === "top-start"}
            menuOpenKey={trigger}
          />
        )}
      </FloatingBoxAtCursor>
    )
  );
}
