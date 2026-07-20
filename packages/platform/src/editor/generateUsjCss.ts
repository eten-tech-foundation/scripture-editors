/**
 * TS port of PT9 CSSCreator.CreateUsfmCss's per-tag emissions
 * (ParatextInternalShared/ScriptureEditor/CSSCreator.cs:103-247). Emits a base
 * rule (project default font/size — the PT9 `.usfm` rule, CSSCreator.cs:127-129)
 * followed by one `.usfm_<marker>` rule per marker with any presentation fields.
 * StyleInfo units are .sty units (inches/points), so PT9's ×1000-int /50 vw
 * scaling collapses to ×20. Not ported (out of scope): @font-face emission,
 * vertical text mode.
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
  /**
   * Scope prefix; must at least match the static usj-nodes.css rules' specificity. Defaults to
   * `".editor-input.usfm"` (the editor ContentEditable carries both classes): at (0,2,0) the base
   * rule ties the static `.usfm.formatted-font` rules and wins by injection order, so the project
   * default font/size actually applies (project styles win where defined).
   */
  containerSelector?: string;
}

function formatLength(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Escape a value for safe embedding inside a double-quoted CSS `<string>` (e.g. font-family). */
function escapeCssString(value: string): string {
  return value.replace(/["\\\n\r\f]/g, (ch) => {
    if (ch === "\n") return "\\a ";
    if (ch === "\r") return "\\d ";
    if (ch === "\f") return "\\c ";
    return `\\${ch}`;
  });
}

/**
 * Escape a marker for safe use inside the `.usfm_<marker>` class selector. `CSS.escape` is the
 * correct tool and is present in the renderer (and every modern browser); the jsdom test env
 * lacks it, so fall back to an equivalent per-character escape. The marker always follows
 * `usfm_`, so it is never at identifier start — the leading-digit case never applies.
 */
function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
}

/**
 * Characters permitted in a color value — hex (`#0a3`), functional (`rgb(0 0 0 / 50%)`), and named
 * colors. Excludes every declaration/selector/comment breakout character (`;{}:"'*<>` and `\`), so
 * a value that passes cannot escape `color: <value>`. Anything else is dropped with a warning.
 */
const SAFE_COLOR_REGEX = /^[#\w().,%/\s-]+$/;

function markerDeclarations(
  marker: string,
  entry: MarkerStyleInfo,
  zoom: number,
  rtl: boolean,
): string[] {
  const decls: string[] = [];
  if (entry.fontName) decls.push(`font-family: "${escapeCssString(entry.fontName)}"`);
  if (entry.bold) decls.push("font-weight: bold");
  if (entry.italic) decls.push("font-style: italic");
  if (entry.color) {
    if (SAFE_COLOR_REGEX.test(entry.color)) {
      decls.push(`color: ${entry.color}`);
    } else {
      // eslint-disable-next-line no-console -- no logger seam in this pure function; loud-fail per project convention.
      console.warn(
        `[generateUsjCss] Skipping unsafe color "${entry.color}" for marker "${marker}".`,
      );
    }
  }
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
  const { zoom = 1, rtl = false, containerSelector = ".editor-input.usfm" } = options;
  const rules: string[] = [];
  const baseDecls: string[] = [];
  if (styleInfo.defaultFont)
    baseDecls.push(`font-family: "${escapeCssString(styleInfo.defaultFont)}"`);
  if (styleInfo.defaultFontSize)
    baseDecls.push(`font-size: ${formatLength(styleInfo.defaultFontSize * zoom)}pt`);
  if (baseDecls.length > 0) rules.push(`${containerSelector} { ${baseDecls.join("; ")}; }`);
  for (const [marker, entry] of Object.entries(styleInfo.markers)) {
    const decls = markerDeclarations(marker, entry, zoom, rtl);
    if (decls.length > 0)
      rules.push(
        `${containerSelector} .usfm_${escapeCssIdentifier(marker)} { ${decls.join("; ")}; }`,
      );
  }
  return rules.join("\n");
}
