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
   * default font/size actually applies (project styles win where defined). A value carrying
   * anything outside {@link SAFE_SELECTOR_REGEX} is replaced by the default with a warning.
   */
  containerSelector?: string;
}

function formatLength(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Escape a value for safe embedding inside a double-quoted CSS `<string>` (e.g. font-family).
 * Angle brackets are hex-escaped too: the generated CSS may be injected as `<style>` element
 * text, where the HTML parser ends the element at any literal `</style` regardless of CSS
 * string context.
 */
function escapeCssString(value: string): string {
  return value.replace(/["\\\n\r\f<>]/g, (ch) => {
    if (ch === "\n") return "\\a ";
    if (ch === "\r") return "\\d ";
    if (ch === "\f") return "\\c ";
    if (ch === "<") return "\\3C ";
    if (ch === ">") return "\\3E ";
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

/**
 * Presence gate for numeric stylesheet fields: emit iff the serializer delivered a value —
 * INCLUDING an explicit 0. PT9's ScrTag cannot distinguish "unset" from "explicitly 0" (both are
 * the int 0, so CSSCreator.cs gates on `!= 0`/`> 0`), but this wire can: an explicit stylesheet 0
 * (e.g. `\FirstLineIndent 0`) must EMIT `text-indent: 0` so it overrides the static base sheet's
 * declaration for the marker, while an absent field must emit nothing so the base sheet applies.
 * The wire type says `number | undefined`, but the value crosses a JSON boundary where a host-side
 * null survives parsing, so null is treated as absent too.
 */
function hasValue(value: number | undefined): value is number {
  return value !== undefined && value !== null;
}

/**
 * `text-align` for each stylesheet justification. A closed table, so only these four values can
 * ever reach the emitted CSS; anything else the wire delivers is dropped rather than interpolated.
 */
const JUSTIFICATION_TO_TEXT_ALIGN: Readonly<{ [justification: string]: string | undefined }> = {
  left: "left",
  right: "right",
  center: "center",
  both: "justify",
};

/** Justifications that swap sides in a right-to-left project; the rest are direction-neutral. */
const MIRRORED_JUSTIFICATION: Readonly<{ [justification: string]: string | undefined }> = {
  left: "right",
  right: "left",
};

/** The scope prefix used when none is supplied — see {@link UsjCssOptions.containerSelector}. */
const DEFAULT_CONTAINER_SELECTOR = ".editor-input.usfm";

/**
 * Characters permitted in the container selector — type/class/id/attribute selectors, pseudo-
 * classes, and the combinators. Excludes every rule/comment/element breakout character (`;{}<\` and
 * `/`), so a value that passes cannot close the rule it prefixes, start a comment, or end a
 * `<style>` element. Anything else falls back to the default with a warning.
 */
const SAFE_SELECTOR_REGEX = /^[\w.#[\]="':()>+~*,\s-]+$/;

/** The container selector to emit: the caller's, or the default when the caller's is unsafe. */
function safeContainerSelector(containerSelector: string): string {
  if (SAFE_SELECTOR_REGEX.test(containerSelector)) return containerSelector;
  // eslint-disable-next-line no-console -- no logger seam in this pure function; loud-fail per project convention.
  console.warn(
    `[generateUsjCss] Ignoring unsafe containerSelector "${containerSelector}"; using "${DEFAULT_CONTAINER_SELECTOR}".`,
  );
  return DEFAULT_CONTAINER_SELECTOR;
}

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
  // An explicit fontSize 0 stays un-emitted BY DESIGN (PT9 `FontSize > 0`): `font-size: 0%`
  // would blank the marker's text, and unlike the length fields there is no meaningful
  // "override to zero" reading of it.
  if (hasValue(entry.fontSize) && entry.fontSize > 0)
    decls.push(`font-size: ${Math.floor((entry.fontSize * 100) / 12)}%`);
  if (hasValue(entry.firstLineIndent))
    decls.push(`text-indent: ${formatLength(entry.firstLineIndent * 20 * zoom)}vw`);
  // Margins and spaces: an explicit 0 emits (see `hasValue`); negative values stay un-emitted
  // like PT9 (`> 0` in CSSCreator.cs — only firstLineIndent supports negatives, for hanging
  // indents).
  if (hasValue(entry.leftMargin) && entry.leftMargin >= 0)
    decls.push(`margin-${rtl ? "right" : "left"}: ${formatLength(entry.leftMargin * 20 * zoom)}vw`);
  if (hasValue(entry.rightMargin) && entry.rightMargin >= 0)
    decls.push(
      `margin-${rtl ? "left" : "right"}: ${formatLength(entry.rightMargin * 20 * zoom)}vw`,
    );
  if (hasValue(entry.spaceBefore) && entry.spaceBefore >= 0)
    decls.push(`margin-top: ${formatLength(entry.spaceBefore * zoom)}pt`);
  if (hasValue(entry.spaceAfter) && entry.spaceAfter >= 0)
    decls.push(`margin-bottom: ${formatLength(entry.spaceAfter * zoom)}pt`);
  // lineSpacing is a discrete code, not a length: 1 → 1.5, 2 → double. An explicit 0 (single
  // spacing) emits nothing BY DESIGN, matching PT9 (CSSCreator.cs deliberately comments out its
  // `case 0: line-height:1`).
  if (entry.lineSpacing === 1) decls.push("line-height: 1.5");
  else if (entry.lineSpacing === 2) decls.push("line-height: 2");
  // Deliberate duplicate-property cascade: a marker with both fontSize and sub/superscript emits
  // font-size twice — the later 66% wins per CSS cascade (matches PT9's independent emissions).
  if (entry.subscript) decls.push("vertical-align: text-bottom", "font-size: 66%");
  else if (entry.superscript) decls.push("vertical-align: text-top", "font-size: 66%");
  if (entry.underline) decls.push("text-decoration: underline");
  if (entry.smallCaps) decls.push("font-variant: small-caps");
  if (entry.justification) {
    // Mapped through a fixed table rather than interpolated: the declared union is a compile-time
    // claim about a value that crosses the JSON wire from a project's stylesheet, so an unexpected
    // string would otherwise land verbatim in `text-align: <value>` and could close the rule (the
    // same reason `color` and `containerSelector` are guarded above). An unmapped value is dropped.
    const align =
      JUSTIFICATION_TO_TEXT_ALIGN[
        rtl
          ? (MIRRORED_JUSTIFICATION[entry.justification] ?? entry.justification)
          : entry.justification
      ];
    if (align) decls.push(`text-align: ${align}`);
  }
  if (entry.textProperties?.includes("verse"))
    decls.push("white-space: nowrap", "unicode-bidi: embed");
  return decls;
}

/**
 * The static usj-nodes.css font sizes (percent of base) for the chapter and its `\ca`/`\cp`
 * attribute runs — the fallbacks when the sheet declares no size of its own for one of them.
 * Must stay in step with `.formatted-font .usfm_c` / `.usfm_ca` / `.usfm_cp` there.
 */
const STATIC_CHAPTER_FONT_PERCENTS = { c: 150, ca: 133, cp: 150 } as const;

/** Percent-of-base font size the sheet's per-marker rule emits for `entry`, or `fallback` when
 * it emits none — the same `fontSize * 100 / 12` mapping {@link markerDeclarations} uses. */
function fontSizePercent(entry: MarkerStyleInfo | undefined, fallback: number): number {
  return entry && hasValue(entry.fontSize) && entry.fontSize > 0
    ? Math.floor((entry.fontSize * 100) / 12)
    : fallback;
}

/**
 * De-compounding rules for the chapter's own NESTED `\ca`/`\cp` attribute runs, computed from
 * this sheet's sizes. Paratext 9 sizes every marker's text against the BASE text size, never
 * against its container: a `\ca` at FontSize 16 renders at 16/12 of body whether it stands alone
 * or rides inside the chapter (measured live in PT9 — base 16px, `\c` 24px, `\ca` 21.28px, `\cp`
 * 24px, the marker glyphs at 0.7em of each). CSS percentage font sizes instead resolve against
 * the PARENT, so a run inside the chapter element compounds (`133% × 150%` ≈ 200% of body)
 * unless divided back down. The static usj-nodes.css carries this division for the static sizes;
 * these rules carry it for the sheet's OWN sizes, so "project styles win" and "sizes are
 * base-relative like PT9" hold at the same time. Extra selector weight (the doubled run class,
 * plus this scope) keeps them above both the static nested rules and this sheet's flat
 * per-marker rules.
 */
function chapterNestedRunRules(styleInfo: StyleInfo, scope: string): string[] {
  // Nothing to correct when the sheet sizes none of the three: the static rules already carry the
  // division for the static sizes. One declared size is enough to need all of them, since it moves
  // either the divisor (`\c`) or the dividend (`\ca`/`\cp`) away from what the static rules assume.
  const sized = (["c", "ca", "cp"] as const).filter((marker) => {
    const entry = styleInfo.markers[marker];
    return entry && hasValue(entry.fontSize) && entry.fontSize > 0;
  });
  if (sized.length === 0) return [];
  const chapterPercent = fontSizePercent(styleInfo.markers.c, STATIC_CHAPTER_FONT_PERCENTS.c);
  return (["ca", "cp"] as const).map((marker) => {
    const percent = fontSizePercent(
      styleInfo.markers[marker],
      STATIC_CHAPTER_FONT_PERCENTS[marker],
    );
    const nestedPercent = formatLength((percent * 100) / chapterPercent);
    return `${scope} .usfm_c .usfm_${marker}.usfm_${marker} { font-size: ${nestedPercent}%; }`;
  });
}

/**
 * Generate CSS for a project's USJ Scripture editor from its stylesheet
 * (usfm.sty + custom.sty), mirroring PT9 CSSCreator.CreateUsfmCss. Emits a
 * base rule for the project default font/size followed by one
 * `.usfm_<marker>` rule per marker with any presentation fields the marker
 * declares. Rules with no declarations (e.g. an unstyled marker) are omitted.
 * A sheet that sizes any of `\c`/`\ca`/`\cp` also gets a trailing pair of
 * chapter-nested `\ca`/`\cp` rules, keeping those runs sized against the BASE
 * text like PT9 does rather than compounding against the chapter — see
 * {@link chapterNestedRunRules}.
 *
 * @public
 */
export function generateUsjCss(styleInfo: StyleInfo, options: UsjCssOptions = {}): string {
  const { zoom = 1, rtl = false, containerSelector = DEFAULT_CONTAINER_SELECTOR } = options;
  const scope = safeContainerSelector(containerSelector);
  const rules: string[] = [];
  const baseDecls: string[] = [];
  if (styleInfo.defaultFont)
    baseDecls.push(`font-family: "${escapeCssString(styleInfo.defaultFont)}"`);
  // Like the per-marker fontSize: a 0 default would blank the whole editor, so only positive
  // sizes emit.
  if (hasValue(styleInfo.defaultFontSize) && styleInfo.defaultFontSize > 0)
    baseDecls.push(`font-size: ${formatLength(styleInfo.defaultFontSize * zoom)}pt`);
  if (baseDecls.length > 0) rules.push(`${scope} { ${baseDecls.join("; ")}; }`);
  for (const [marker, entry] of Object.entries(styleInfo.markers)) {
    const decls = markerDeclarations(marker, entry, zoom, rtl);
    if (decls.length > 0)
      rules.push(`${scope} .usfm_${escapeCssIdentifier(marker)} { ${decls.join("; ")}; }`);
  }
  rules.push(...chapterNestedRunRules(styleInfo, scope));
  return rules.join("\n");
}
