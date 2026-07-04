/**
 * Project StyleInfo — the host-agnostic shape of a Paratext project's merged
 * stylesheet (usfm.sty + custom.sty), per design spec
 * docs/superpowers/specs/2026-07-03-standard-view-phase4-styleinfo-design.md.
 *
 * Unit conventions (match usfm.sty as parsed, not PT9's internal ints):
 * - fontSize, spaceBefore, spaceAfter: points
 * - firstLineIndent, leftMargin, rightMargin: inches (PT9 ScrTag stores
 *   thousandths of an inch; hosts divide by 1000 when serializing)
 * - color: "#RRGGBB", omitted when black (PT9 CSSCreator skips black)
 * - lineSpacing: PT9 quirk — 1 renders as line-height 1.5, 2 as 2, else nothing
 */
import getMarker from "./getMarker.js";
import { usfmMarkers } from "./usfmMarkers.js";
import { CategoryType, Marker, MarkerType } from "./usfmTypes.js";

export type StyleType = "paragraph" | "character" | "note" | "milestone";

export interface MarkerStyleInfo {
  marker: string;
  styleType: StyleType;
  endMarker?: string;
  /** Allowed parent markers; absent/empty = valid anywhere (PT9 semantics). */
  occursUnder?: string[];
  rank?: number;
  textType?: string;
  textProperties?: string[];
  notRepeatable?: boolean;
  description?: string;
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string;
  justification?: "left" | "center" | "right" | "both";
  firstLineIndent?: number;
  leftMargin?: number;
  rightMargin?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
}

export interface StyleInfo {
  /** Project default font/size (ScrText settings) — drives the base CSS rule like PT9. */
  defaultFont?: string;
  defaultFontSize?: number;
  markers: { [marker: string]: MarkerStyleInfo };
}

/** The `getMarker` seam shape (design spec: signature preserved). */
export type MarkerLookup = (marker: string) => Marker | undefined;

const STYLE_TYPE_TO_MARKER_TYPE: { [K in StyleType]: MarkerType } = {
  paragraph: MarkerType.Paragraph,
  character: MarkerType.Character,
  note: MarkerType.Note,
  milestone: MarkerType.Milestone,
};

/**
 * StyleInfo-backed replacement for the bundled `getMarker`. With `styleInfo`,
 * the project sheet is authoritative: markers absent from it return
 * `undefined` (PT9: unknown to the stylesheet), and `usfmMarkersOverwrites`
 * never applies. Without `styleInfo`, the bundled `getMarker` (table +
 * overwrites) is returned unchanged so non-project consumers keep today's
 * behavior exactly.
 */
export function createMarkerLookup(styleInfo?: StyleInfo): MarkerLookup {
  if (!styleInfo) return getMarker;
  const cache = new Map<string, Marker | undefined>();
  return (marker: string): Marker | undefined => {
    if (cache.has(marker)) return cache.get(marker);
    const entry = styleInfo.markers[marker];
    const result: Marker | undefined = entry
      ? {
          category: usfmMarkers[marker]?.category ?? CategoryType.Uncategorized,
          type: STYLE_TYPE_TO_MARKER_TYPE[entry.styleType] ?? MarkerType.Unknown,
          description: entry.description ?? "",
          hasEndMarker: Boolean(entry.endMarker),
        }
      : undefined;
    cache.set(marker, result);
    return result;
  };
}
