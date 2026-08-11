import {
  TEXT_SPACING_CLASS_NAME,
  FORMATTED_FONT_CLASS_NAME,
  MARKER_MODE_CLASS_NAME_PREFIX,
  VerseNode,
} from "shared";
import { ImmutableVerseNode } from "../nodes/usj/ImmutableVerseNode";
import {
  ViewMode,
  BLOCK_VERSE_VIEW_MODE,
  FORMATTED_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  viewModeToViewNames,
} from "./view-mode.model";
import { deepEqual } from "fast-equals";

/**
 * How USFM markers are displayed.
 *
 * @public
 */
export type MarkerMode =
  /** USFM markers are visible. */
  | "visible"
  /** USFM markers are editable. */
  | "editable"
  /** USFM markers are hidden. */
  | "hidden";

/**
 * How notes are displayed.
 *
 * @public
 */
export type NoteMode =
  /** All notes are always collapsed. Only the callers are displayed. */
  | "collapsed"
  /** A note is expanded inline when the cursor enters it via the caller and collapses on exit. */
  | "expandInline"
  /** All notes are always expanded. */
  | "expanded";

/**
 * How each verse is laid out in the document.
 *
 * @public
 */
export type VerseLayout =
  /** The verse marker is an inline milestone; verse text flows within its paragraph. */
  | "inline"
  /**
   * Each verse is a block-level element containing its own paragraphs, so it can be placed on a
   * layout row. Read-only: the editor forces read-only when this is selected, and neither USJ
   * export nor USJ-addressed selection is available, because a paragraph spanning several verses
   * is split across their blocks and no longer matches the source USJ's content indexes.
   */
  | "block";

/**
 * Configuration options for controlling the display and behavior of Scripture text views.
 *
 * @example
 * ```typescript
 * const viewOptions: ViewOptions = {
 *   markerMode: "hidden",
 *   hasSpacing: true,
 *   isFormattedFont: true
 * };
 * ```
 *
 * @public
 */
export interface ViewOptions {
  /** How USFM markers are displayed */
  markerMode: MarkerMode;
  /** How notes are displayed. */
  noteMode?: NoteMode;
  /** Does the text have spacing including indenting. */
  hasSpacing: boolean;
  /** Is the text in a formatted font. */
  isFormattedFont: boolean;
  /**
   * When false, an expanded note's SHELL — its opening marker glyph and its caller — is rendered
   * atomic: the caret cannot enter it and typing cannot change it. Only meaningful in `editable`
   * marker mode with an expanded note, which is the one shape that renders those bytes as ordinary
   * editable text.
   *
   * For a host that governs the marker and the caller through its own UI (Paratext 10's footnote
   * editor has a dropdown for each, and Paratext 9 works the same way), leaving them typeable is a
   * trap: the edit looks accepted, does not persist, and — because the note-scoped rebuild refuses
   * a caller it cannot recognize — takes anything else typed into that slot down with it.
   *
   * Default (undefined or true) keeps the shell editable, which is what a view with no such UI
   * needs: the main editor's Markers view expands notes precisely so the whole note can be edited
   * as text.
   */
  isNoteShellEditable?: boolean;
  /**
   * When false, `CharNode.createDOM` skips setting the `title=__marker` attribute on rendered
   * char spans. Useful for consumers that don't want the USFM marker name surfaced as a browser
   * tooltip. Default (undefined or true) preserves the marker hint for consumers authoring USFM.
   */
  showCharMarkerTitles?: boolean;
  /**
   * Show a fixed-width gutter at the inline-start of the editor containing paragraph-level USFM markers,
   * styled verse numbers, and decorative chapter numbers. When enabled, paragraph markers are
   * rendered as immutable typed-text nodes (so they exist in the DOM to be repositioned into the
   * gutter) regardless of `markerMode`. Inline char/verse/note markers are NOT shown.
   */
  hasGutterParaMarkers?: boolean;
  /**
   * Show an outline box around the active text section (the verse range under the cursor).
   * Can be used independently of `hasGutterParaMarkers`, though poetry-paragraph alignment of
   * the box relies on indent variables set by the gutter feature.
   */
  hasActiveTextFocusBox?: boolean;
  /**
   * When `false`, paragraphs render WITHOUT their marker prefix — no editable glyph and separator
   * under `markerMode: "editable"`, and no immutable marker text under `markerMode: "visible"` or
   * `hasGutterParaMarkers`. Default (undefined or true) renders the prefix each of those modes
   * calls for.
   *
   * For surfaces whose paragraph is scaffolding rather than content: the footnote editor wraps the
   * note it is editing in a marker-less paragraph purely so the editor has an element to host it,
   * and that paragraph is never saved (the save path reads the note subtree alone). Defaulting the
   * marker-less para to `\p` and displaying that glyph put a `\p ` prefix in front of the
   * footnote's own text.
   *
   * This suppresses the prefix in the ADAPTOR, so the glyph bytes are never built. Hiding them in
   * CSS instead would leave editable-but-invisible bytes in the document that the caret could
   * traverse into, breaking the rule that displayed bytes are the document. Inline markers
   * (char/verse/note) are unaffected — only the paragraph's own prefix is suppressed.
   */
  showParaMarkerPrefixes?: boolean;
  /**
   * How each verse is laid out. Default (undefined) is `"inline"`, which is what every view other
   * than block verse uses.
   *
   * Switching this between `"inline"` and `"block"` recreates the editor, because the node types a
   * Lexical editor can hold are fixed when it is created. That discards the undo history and any
   * annotations the host has applied since the last USJ change, so hosts should choose a layout
   * when they mount the editor rather than toggling a live one.
   */
  verseLayout?: VerseLayout;
}

/**
 * Whether `viewOptions` renders paragraph marker prefixes at all — the single spelling of the
 * `showParaMarkerPrefixes !== false` default. The adaptor (which builds the glyph), the
 * marker-edit transforms (which police or heal it), and the prefix-deletion guard (which reacts
 * to its absence) must all answer this identically: a surface that never builds the prefix must
 * never treat its absence as user intent to change the paragraph.
 *
 * @public
 */
export function showParaMarkerPrefix(viewOptions: ViewOptions | undefined): boolean {
  return viewOptions?.showParaMarkerPrefixes !== false;
}

let defaultViewMode: ViewMode;
let defaultViewOptions: ViewOptions;

/**
 * Sets the default view mode and options.
 *
 * @param viewMode - View mode of the editor.
 *
 * @public
 */
export function setDefaultView(viewMode: ViewMode) {
  const _viewOptions = getViewOptions(viewMode);
  if (!_viewOptions) throw new Error(`Invalid view mode: ${viewMode}`);
  defaultViewMode = viewMode;
  defaultViewOptions = _viewOptions;
}

setDefaultView(FORMATTED_VIEW_MODE);

/**
 * Gets the default view mode.
 *
 * @returns the default view mode.
 *
 * @public
 */
export const getDefaultViewMode = () => defaultViewMode;

/**
 * Gets the default view options.
 *
 * @returns the default view options.
 *
 * @public
 */
export const getDefaultViewOptions = () => defaultViewOptions;

/**
 * Get view option properties based on the view mode.
 *
 * @param viewMode - View mode of the editor.
 * @returns the view options if the view exists, the default options if the viewMode is undefined,
 *   `undefined` otherwise.
 *
 * @public
 */
export function getViewOptions(viewMode?: string | undefined): ViewOptions | undefined {
  let viewOptions: ViewOptions | undefined;
  switch (viewMode ?? defaultViewMode) {
    case FORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
      };
      break;
    case UNFORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "editable",
        noteMode: "expanded",
        hasSpacing: false,
        isFormattedFont: false,
      };
      break;
    case PARAGRAPH_STRUCTURE_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
        hasGutterParaMarkers: true,
        hasActiveTextFocusBox: true,
      };
      break;
    case STANDARD_VIEW_MODE:
      viewOptions = {
        markerMode: "editable",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
      };
      break;
    case BLOCK_VERSE_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
        verseLayout: "block",
      };
      break;
    default:
      break;
  }
  return viewOptions;
}

/**
 * Convert view options to view mode if the view exists.
 *
 * Inverts {@link getViewOptions} by comparison, so a view option added later cannot be forgotten
 * here and leave two modes indistinguishable. Matching is exact: options derived from a mode and
 * then tweaked describe a view that is no longer that mode, and yield `undefined`.
 *
 * @param viewOptions - View options of the editor.
 * @returns the view mode if the view is defined, `undefined` otherwise.
 *
 * @public
 */
export function getViewMode(viewOptions: ViewOptions | undefined): ViewMode | undefined {
  if (!viewOptions) return undefined;

  const normalized = withoutDefaultVerseLayout(viewOptions);
  return (Object.keys(viewModeToViewNames) as ViewMode[]).find((viewMode) =>
    deepEqual(withoutDefaultVerseLayout(getViewOptions(viewMode)), normalized),
  );
}

/**
 * The options with an explicit `verseLayout: "inline"` dropped. It is the default, so saying it
 * out loud describes the same view as leaving it out and must compare equal.
 */
function withoutDefaultVerseLayout(viewOptions: ViewOptions | undefined) {
  if (viewOptions?.verseLayout !== "inline") return viewOptions;

  const { verseLayout: _inline, ...rest } = viewOptions;
  return rest;
}

/**
 * Whether the standard-view whitespace/display normalization rules apply to these view options.
 *
 * These rules — the display NBSP/`~` mapping at load time, the live display-whitespace transform
 * and clipboard normalization, and the inverse normalization on serialization — are all gated on
 * this ONE predicate, so a document always serializes under the same whitespace regime it was
 * loaded with; no combination of options can apply the display mapping without its inversion.
 *
 * The invariant is the STANDARD view fingerprint with the `noteMode` axis dropped: editable
 * markers in a spacing+formatted view with NEITHER `hasGutterParaMarkers` NOR
 * `hasActiveTextFocusBox`. It is `true` for both collapsed (the named `standard` mode) and
 * expanded notes. It is `false` for the Unformatted view (editable but neither spaced nor
 * formatted, where whitespace is shown literally) and for gutter/focus-box views: those render
 * paragraph markers as immutable typed text — a different whitespace regime with no
 * display-mapped text to invert (their named mode hides markers entirely, so the editable
 * engine's separators never combine with them). Deliberately NOT expressed via
 * {@link getViewMode}: expanded is not the named `standard` mode, and overloading `getViewMode`
 * would break its invertibility contract and the user-facing mode labels. `getViewMode` compares
 * whole option objects against {@link getViewOptions}, so this predicate stays independent of it:
 * it is the one place the whitespace fingerprint — the STANDARD options with the `noteMode` axis
 * dropped — is written down.
 *
 * @param viewOptions - View options of the editor.
 * @returns `true` when standard-view whitespace normalization applies.
 *
 * @public
 */
export function hasStandardViewWhitespace(viewOptions: ViewOptions | undefined): boolean {
  if (!viewOptions) return false;

  const { markerMode, hasSpacing, isFormattedFont, hasGutterParaMarkers, hasActiveTextFocusBox } =
    viewOptions;
  return (
    markerMode === "editable" &&
    hasSpacing &&
    isFormattedFont &&
    !hasGutterParaMarkers &&
    !hasActiveTextFocusBox
  );
}

/**
 * Get the verse node class for the given view options.
 *
 * @param viewOptions - View options of the editor.
 * @returns the verse node class if the view is defined, `undefined` otherwise.
 *
 * @public
 */
export function getVerseNodeClass(viewOptions: ViewOptions | undefined) {
  if (!viewOptions) return;

  // Block verse is read-only, so its marker is never the editable `VerseNode`. Today the marker
  // mode below would reach the same answer - block verse hides markers - but dispatching on the
  // layout first keeps that independent of how markers happen to be configured.
  if (viewOptions.verseLayout === "block") return ImmutableVerseNode;

  return viewOptions.markerMode === "editable" ? VerseNode : ImmutableVerseNode;
}

/**
 * Whether the view options select the block verse layout.
 *
 * That layout is read-only: its paragraphs are split across verse blocks, so an edit has no
 * correct USJ to go back to. Anything that offers editing - or an affordance that depends on
 * editing, such as comment authoring - should treat it as read-only whatever `isReadonly` says.
 *
 * @param viewOptions - View options of the editor.
 * @returns `true` if verses are laid out as blocks.
 *
 * @public
 */
export function isBlockVerseLayout(viewOptions: ViewOptions | undefined): boolean {
  return viewOptions?.verseLayout === "block";
}

/**
 * Get the class name list for the given view options.
 *
 * @param viewOptions - View options of the editor.
 * @returns the element class name list based on view options.
 *
 * @public
 */
export function getViewClassList(viewOptions: ViewOptions | undefined) {
  const classList: string[] = [];
  const _viewOptions = viewOptions ?? defaultViewOptions;
  if (_viewOptions) {
    classList.push(`${MARKER_MODE_CLASS_NAME_PREFIX}${_viewOptions.markerMode}`);
    if (_viewOptions.hasSpacing) classList.push(TEXT_SPACING_CLASS_NAME);
    if (_viewOptions.isFormattedFont) classList.push(FORMATTED_FONT_CLASS_NAME);
  }
  return classList;
}
