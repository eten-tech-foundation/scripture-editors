/**
 * TS port of PT9 CSSCreator.CreateUsfmCss's per-tag emissions
 * (ParatextInternalShared/ScriptureEditor/CSSCreator.cs:103-247), design spec
 * Phase 4 §CSS generator. Emits a base rule (project default font/size — the
 * PT9 `.usfm` rule, CSSCreator.cs:127-129) followed by one `.usfm_<marker>`
 * rule per marker with any presentation fields. StyleInfo units are .sty
 * units (inches/points), so PT9's ×1000-int /50 vw scaling becomes ×20.
 * Not ported (spec non-goals): @font-face emission, vertical text mode.
 */
import { MarkerStyleInfo, StyleInfo } from "shared";

/**
 * Options controlling {@link generateUsjCss}'s output.
 *
 * @public
 */
export interface UsjCssOptions {
  /** PT9 zoom factor; scales the base font-size (pt) and vw/pt lengths. */
  zoom?: number;
  /** Swap left/right margins and justification (PT9 rtl handling). */
  rtl?: boolean;
  /** Scope prefix; must at least match the static usj-nodes.css rules' specificity. */
  containerSelector?: string;
}

function formatLength(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function markerDeclarations(entry: MarkerStyleInfo, zoom: number, rtl: boolean): string[] {
  const decls: string[] = [];
  if (entry.fontName) decls.push(`font-family: "${entry.fontName}"`);
  if (entry.bold) decls.push("font-weight: bold");
  if (entry.italic) decls.push("font-style: italic");
  if (entry.color) decls.push(`color: ${entry.color}`);
  if (entry.fontSize) decls.push(`font-size: ${Math.floor((entry.fontSize * 100) / 12)}%`);
  if (entry.firstLineIndent)
    decls.push(`text-indent: ${formatLength(entry.firstLineIndent * 20 * zoom)}vw`);
  if (entry.leftMargin && entry.leftMargin > 0)
    decls.push(`margin-${rtl ? "right" : "left"}: ${formatLength(entry.leftMargin * 20 * zoom)}vw`);
  if (entry.rightMargin && entry.rightMargin > 0)
    decls.push(
      `margin-${rtl ? "left" : "right"}: ${formatLength(entry.rightMargin * 20 * zoom)}vw`,
    );
  if (entry.spaceBefore && entry.spaceBefore > 0)
    decls.push(`margin-top: ${formatLength(entry.spaceBefore * zoom)}pt`);
  if (entry.spaceAfter && entry.spaceAfter > 0)
    decls.push(`margin-bottom: ${formatLength(entry.spaceAfter * zoom)}pt`);
  if (entry.lineSpacing === 1) decls.push("line-height: 1.5");
  else if (entry.lineSpacing === 2) decls.push("line-height: 2");
  // Deliberate duplicate-property cascade: a marker with both fontSize and sub/superscript emits
  // font-size twice — the later 66% wins per CSS cascade (matches PT9's independent emissions).
  if (entry.subscript) decls.push("vertical-align: text-bottom", "font-size: 66%");
  else if (entry.superscript) decls.push("vertical-align: text-top", "font-size: 66%");
  if (entry.underline) decls.push("text-decoration: underline");
  if (entry.smallCaps) decls.push("font-variant: small-caps");
  if (entry.justification) {
    const align =
      entry.justification === "both"
        ? "justify"
        : rtl && entry.justification === "left"
          ? "right"
          : rtl && entry.justification === "right"
            ? "left"
            : entry.justification;
    decls.push(`text-align: ${align}`);
  }
  if (entry.textProperties?.includes("verse"))
    decls.push("white-space: nowrap", "unicode-bidi: embed");
  return decls;
}

/**
 * Generate CSS for a project's USJ Scripture editor from its stylesheet
 * (usfm.sty + custom.sty), mirroring PT9 CSSCreator.CreateUsfmCss. Emits a
 * base rule for the project default font/size followed by one
 * `.usfm_<marker>` rule per marker with any presentation fields the marker
 * declares. Rules with no declarations (e.g. an unstyled marker) are omitted.
 *
 * @public
 */
export function generateUsjCss(styleInfo: StyleInfo, options: UsjCssOptions = {}): string {
  const { zoom = 1, rtl = false, containerSelector = ".editor-input" } = options;
  const rules: string[] = [];
  const baseDecls: string[] = [];
  if (styleInfo.defaultFont) baseDecls.push(`font-family: "${styleInfo.defaultFont}"`);
  if (styleInfo.defaultFontSize)
    baseDecls.push(`font-size: ${formatLength(styleInfo.defaultFontSize * zoom)}pt`);
  if (baseDecls.length > 0) rules.push(`${containerSelector} { ${baseDecls.join("; ")}; }`);
  for (const [marker, entry] of Object.entries(styleInfo.markers)) {
    const decls = markerDeclarations(entry, zoom, rtl);
    if (decls.length > 0)
      rules.push(`${containerSelector} .usfm_${marker} { ${decls.join("; ")}; }`);
  }
  return rules.join("\n");
}
