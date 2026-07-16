/**
 * Marker menu item-source — a port of PT9's `MarkerItemSource`
 * (`ParatextBase/ScriptureEditor/MarkerItemSource.cs:16-296`), the class that
 * decides which markers a `\`-triggered or Enter-triggered popup offers at
 * the caret. Consumed by the extension wiring which
 * build a `MarkerMenuContext` from the live selection and turn the returned
 * `MarkerMenuItem[]` into command-palette entries.
 *
 * Two entry points mirror PT9's two `MarkerDropdownEditHandler` call sites:
 * - `getMarkerMenuItems` — the `\` (backslash) trigger
 *   (`MarkerDropdownEditHandler.cs:96-139`), paragraph or character source
 *   chosen by the caller per `HandleBackslash`'s selection-shape rule.
 * - `getEnterMenuItems` — the Enter/SmartEnter trigger
 *   (`KeyPressEditHandler.cs:189-201`), always paragraph source with the
 *   `ip`-or-`p` SmartEnter choice moved to the front.
 */
import { isUsjMarkerSupported } from "../adaptors/usj-marker-action.utils";
import { isParagraphTagValid, ParaStackEntry } from "../markerEdit/markerValidation.utils";
import { MarkerStyleInfo, StyleInfo } from "shared";

/**
 * Inputs describing the caret/selection context a marker menu is being built
 * for. Callers (`EditorRef.getMarkerMenuContext`) are responsible
 * for populating this from the live selection; this module only reads it.
 *
 * @public
 */
export interface MarkerMenuContext {
  /** Chosen per PT9 HandleBackslash (MarkerDropdownEditHandler.cs:96-139). */
  source: "paragraph" | "character";
  /** Current paragraph's marker (undefined at e.g. book level). */
  paraMarker?: string;
  /** styleType-paragraph markers before the caret, forward order (validity stack replay). */
  previousParaMarkers: string[];
  /** Currently open char-span markers, innermost first (SelectionStyleTags.CharacterStyles). */
  openCharMarkers: string[];
  /** Set when the caret is inside a note's content (note marker, e.g. "f"). */
  noteMarker?: string;
  /** Non-collapsed selection (wrap case). */
  hasTextSelection: boolean;
  /** Caret is inside visible marker glyph text (extension lets Enter pass through). */
  inMarkerText: boolean;
}

/**
 * One offered menu entry.
 *
 * @public
 */
export interface MarkerMenuItem {
  /** e.g. "q1" | "ft*" | "+wj*" | "f". */
  marker: string;
  /** "closeTag" entries terminate an open character span rather than opening one. */
  kind: "paragraph" | "character" | "note" | "closeTag";
  /** StyleInfo description, when available. */
  description?: string;
  /** PT9 ScrTag.IsBasic — ordering + host greying (ScrTag.cs:425). */
  isBasic: boolean;
}

/** PT9 ScrTag.IsBasic (ScrTag.cs:425): `Description.Contains("(basic)")`. */
function markerIsBasic(description?: string): boolean {
  return !!description?.includes("(basic)");
}

/**
 * Skip rules (rule 5): `zpa*` markers (Concordance Builder artifacts,
 * MarkerDropdownControl.cs:100-102) and anything our structural insert path
 * doesn't support (`isUsjMarkerSupported` — adapted divergence, excludes
 * `id`; PT9 does not filter deprecated markers, and neither do we).
 *
 * `\c` (chapter) is also skipped: the sheet types it `styleType: "paragraph"`, but it is a
 * structural marker inserted via its own `getUsjMarkerAction` chapter action, not a paragraph
 * style to retag/split into. Offering it in the paragraph menu let it be picked from the Enter
 * split menu, where `$splitParagraphWithMarker("c")` produced a malformed `<para marker="c">`.
 */
function includeMarker(marker: string): boolean {
  return !marker.startsWith("zpa") && marker !== "c" && isUsjMarkerSupported(marker);
}

function toStackEntry(styleInfo: StyleInfo, marker: string): ParaStackEntry | undefined {
  const entry = styleInfo.markers[marker];
  if (!entry) return undefined;
  return { marker, rank: entry.rank ?? 0, occursUnder: entry.occursUnder ?? [] };
}

/**
 * Replays previousParaMarkers (forward order) into a validity stack — PT9
 * GetValidParagraphTags's build pass, which calls
 * `TagValidator.IsParagraphTagValid(stack, tag, addTag: true)` for each
 * previous tag (MarkerItemSource.cs:183-194).
 */
function buildParaStack(styleInfo: StyleInfo, previousParaMarkers: string[]): ParaStackEntry[] {
  const stack: ParaStackEntry[] = [];
  for (const marker of previousParaMarkers) {
    const tag = toStackEntry(styleInfo, marker);
    if (tag) isParagraphTagValid(stack, tag);
  }
  return stack;
}

function toItem(entry: MarkerStyleInfo, kind: MarkerMenuItem["kind"]): MarkerMenuItem {
  return {
    marker: entry.marker,
    kind,
    description: entry.description,
    isBasic: markerIsBasic(entry.description),
  };
}

/**
 * Natural alphanumeric compare, splitting off a trailing digit run so
 * `s2 < s10` (PT9 TagComparer, MarkerItemSource.cs:201-294) — sufficient for
 * USFM marker naming (a letter prefix plus an optional trailing level
 * number, e.g. `q1..q4`, `s1..s2`).
 *
 * Exported (module-internal, not re-exported from the package barrel) so
 * the digit-tie-break can be unit-tested directly: no real USFM marker in
 * the supported allowlists (`ParaNode`/`CharNode`/`NoteNode.isValidMarker`)
 * has a 2+ digit suffix, so `s2 < s10`-style ordering can never actually
 * surface through `getMarkerMenuItems`/`getEnterMenuItems` today — only
 * single-digit levels exist (q1..q4, s1..s4, etc.).
 */
export function compareMarkerText(a: string, b: string): number {
  const splitTrailingDigits = (marker: string): { prefix: string; digits?: number } => {
    const match = /^(.*?)(\d+)$/.exec(marker);
    return match ? { prefix: match[1], digits: Number(match[2]) } : { prefix: marker };
  };
  const partsA = splitTrailingDigits(a);
  const partsB = splitTrailingDigits(b);
  if (partsA.prefix !== partsB.prefix) return partsA.prefix < partsB.prefix ? -1 : 1;
  if (partsA.digits === undefined) return partsB.digits === undefined ? 0 : -1;
  if (partsB.digits === undefined) return 1;
  return partsA.digits - partsB.digits;
}

/** Basic-first (stable), then natural alphanumeric — TagComparer (MarkerItemSource.cs:201-294). */
function compareItems(a: MarkerMenuItem, b: MarkerMenuItem): number {
  if (a.isBasic !== b.isBasic) return a.isBasic ? -1 : 1;
  return compareMarkerText(a.marker, b.marker);
}

/**
 * Paragraph source (MarkerItemSource.cs:168-199): empty inside notes;
 * otherwise every `styleType === "paragraph"` sheet entry for which a
 * non-mutating validity probe passes against the replayed stack.
 *
 * `isParagraphTagValid` mutates its stack on success (PT9's `addTag: true`
 * replay behavior baked into the existing 2-arg port) — probe with a fresh
 * copy of the stack per candidate so one candidate's probe can't affect the
 * next (PT9's separate `addTag: false` call, TagValidator.cs:18-57).
 */
function paragraphItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[] {
  if (context.noteMarker) return [];
  const stack = buildParaStack(styleInfo, context.previousParaMarkers);
  return Object.values(styleInfo.markers)
    .filter((entry) => entry.styleType === "paragraph" && includeMarker(entry.marker))
    .filter((entry) => {
      const tag = toStackEntry(styleInfo, entry.marker);
      return tag !== undefined && isParagraphTagValid([...stack], tag);
    })
    .map((entry) => toItem(entry, "paragraph"))
    .sort(compareItems);
}

/**
 * Character source, without close tags or the empty-to-paragraph fallback
 * (MarkerItemSource.cs:109-147). Requires `paraMarker` outside of notes
 * (else empty list, per `:123-124`).
 */
function characterItemsRaw(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[] {
  const { noteMarker, paraMarker } = context;
  const entries = Object.values(styleInfo.markers).filter((entry) => includeMarker(entry.marker));

  if (noteMarker) {
    // In-note (:114-119): only character styles whose occursUnder includes the note marker.
    return entries
      .filter(
        (entry) =>
          entry.styleType === "character" && (entry.occursUnder ?? []).includes(noteMarker),
      )
      .map((entry) => toItem(entry, "character"))
      .sort(compareItems);
  }

  if (!paraMarker) return []; // :123-124

  const charItems = entries.filter((entry) => {
    if (entry.styleType !== "character") return false;
    const occursUnder = entry.occursUnder ?? [];
    return occursUnder.length === 0 || occursUnder.includes(paraMarker); // :142-144
  });
  // Note styles are offered alongside character styles, but only outside of a note (:130-135).
  const noteItems = entries.filter((entry) => entry.styleType === "note");

  return [
    ...charItems.map((entry) => toItem(entry, "character")),
    ...noteItems.map((entry) => toItem(entry, "note")),
  ].sort(compareItems);
}

/**
 * Close-tag entries (:149-159): one per open char span, innermost first,
 * `+`-prefixed endmarker unless it is the outermost span. Inserted at the
 * front of the character list (PT9 `tags.Insert(i, ...)`), before the final
 * combined basic-first pass in {@link characterItems} runs.
 */
function closeTagItems(styleInfo: StyleInfo, openCharMarkers: string[]): MarkerMenuItem[] {
  return openCharMarkers.map((marker, i) => {
    const endMarker = styleInfo.markers[marker]?.endMarker ?? `${marker}*`;
    const prefix = i === openCharMarkers.length - 1 ? "" : "+";
    return { marker: `${prefix}${endMarker}`, kind: "closeTag", isBasic: false };
  });
}

/**
 * PT9 GetTags's final pass (MarkerItemSource.cs:100): a stable
 * `OrderBy(tag => tag.IsBasic ? 0 : 1)` over the COMBINED list. Close-tag
 * entries are never basic, so basic character/note items float above them,
 * while stability preserves the relative order within the basic group and
 * within the non-basic group (close tags innermost-first, then the sorted
 * non-basic items). `Array.prototype.sort` is stable, matching OrderBy.
 * PT9 also runs this over the paragraph source, where it is a no-op because
 * {@link compareItems} already ordered basic items first.
 */
function compareBasicFirst(a: MarkerMenuItem, b: MarkerMenuItem): number {
  if (a.isBasic === b.isBasic) return 0;
  return a.isBasic ? -1 : 1;
}

function characterItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[] {
  return [
    ...closeTagItems(styleInfo, context.openCharMarkers),
    ...characterItemsRaw(styleInfo, context),
  ].sort(compareBasicFirst);
}

/**
 * Builds the `\`-triggered marker menu (MarkerDropdownEditHandler.cs:96-139).
 * Character-empty to paragraph fallback (rule 4, PT9 FB 21054, `:118-127`):
 * if the character source (close tags + character/note items) yields
 * nothing, recompute as paragraph source.
 *
 * @public
 */
export function getMarkerMenuItems(
  styleInfo: StyleInfo,
  context: MarkerMenuContext,
): MarkerMenuItem[] {
  if (context.source === "paragraph") return paragraphItems(styleInfo, context);
  const items = characterItems(styleInfo, context);
  return items.length > 0 ? items : paragraphItems(styleInfo, context);
}

/**
 * Builds the Enter-triggered marker menu (KeyPressEditHandler.cs:189-201):
 * paragraph-source items with the SmartEnter choice — `ip` if valid at the
 * replayed stack, else `p` — moved to index 0. If the chosen marker isn't
 * offered (absent from the sheet, filtered, or invalid here), the plain
 * paragraph ordering is returned unchanged.
 *
 * @public
 */
export function getEnterMenuItems(
  styleInfo: StyleInfo,
  context: MarkerMenuContext,
): MarkerMenuItem[] {
  const items = paragraphItems(styleInfo, context);
  const stack = buildParaStack(styleInfo, context.previousParaMarkers);
  const ipTag = toStackEntry(styleInfo, "ip");
  // SmartEnter defaults to `\ip` (introduction prose) ONLY inside the book introduction — before any
  // `\c`. PT9's rank guard normally rejects `\ip` once chapters start, but only when the effective
  // stylesheet supplies ranks on `ip`/`c`; a host project sheet that omits them (both are optional)
  // lets `\ip` validate for the whole book body via isParagraphTagValid's rank-0 bypass, wrongly
  // promoting it to the first/highlighted Enter choice mid-chapter (e.g. `\ip`
  // highlighted in GEN 1 where `\p` is expected). Gating on the actual introduction context — no
  // chapter marker collected before the caret — keeps the choice correct regardless of sheet ranks.
  const inIntroduction = !context.previousParaMarkers.includes("c");
  const chosenMarker =
    inIntroduction && ipTag && isParagraphTagValid([...stack], ipTag) ? "ip" : "p";
  const chosenIndex = items.findIndex((item) => item.marker === chosenMarker);
  if (chosenIndex <= 0) return items;
  const [chosen] = items.splice(chosenIndex, 1);
  return [chosen, ...items];
}
