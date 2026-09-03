import { NBSP } from "shared";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
} from "shared-react";

/**
 * Round-trip corpus for Standard view.
 * Fixtures are authored as USX and converted to USJ at test time via
 * `usxStringToUsj`, guaranteeing shape-valid USJ.
 *
 * Fixture whitespace rule: `usxStringToUsj` preserves whitespace-only text
 * verbatim as document content unless it contains a line break, which marks
 * it as XML formatting to drop. So newline+indent between block-level
 * siblings (e.g. between two `<para>` elements) is safely discarded, but any
 * spaces inside a `<para>`'s inline content are document bytes — keep each
 * `<para>`'s content on a single line and author its inner spaces
 * deliberately.
 */

const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!standardViewOptions) throw new Error("standard view options not found");

/**
 * The view configurations every adaptor round-trip suite runs each fixture in: the named view
 * modes, plus standard view with expanded notes — the combination that made getViewMode return
 * undefined and silently disabled the standard-view whitespace machinery. The label doubles as the
 * `skipModes` key prefix (`<label>: <reason>`).
 */
export const ROUND_TRIP_VIEW_CONFIGS: { label: string; viewOptions: ViewOptions | undefined }[] = [
  { label: STANDARD_VIEW_MODE, viewOptions: standardViewOptions },
  { label: FORMATTED_VIEW_MODE, viewOptions: getViewOptions(FORMATTED_VIEW_MODE) },
  { label: UNFORMATTED_VIEW_MODE, viewOptions: getViewOptions(UNFORMATTED_VIEW_MODE) },
  {
    label: PARAGRAPH_STRUCTURE_VIEW_MODE,
    viewOptions: getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
  },
  { label: "standard-expanded", viewOptions: { ...standardViewOptions, noteMode: "expanded" } },
];

export interface CorpusFixture {
  /** Unique fixture name, used as the test name. */
  name: string;
  /** USX 3.0 document string. */
  usx: string;
  /**
   * View modes to skip with a reason, e.g. while a failure is recorded in the
   * findings doc. Format: "<mode>: <reason>". Empty/absent = run all modes.
   */
  skipModes?: string[];
}

export const USX_HEADER = `<usx version="3.0">
  <book code="RUT" style="id">Corpus fixture</book>
  <para style="mt1">Ruth</para>`;
export const USX_FOOTER = `</usx>`;

/** Wrap chapter-level USX content in a minimal valid book. */
export function book(content: string): string {
  return `${USX_HEADER}\n  <chapter number="1" style="c" />\n${content}\n${USX_FOOTER}`;
}

export const corpusFixtures: CorpusFixture[] = [
  {
    name: "baseline: paragraphs, verses, char markers",
    usx: book(`<para style="s1">Naomi Loses Her Husband and Sons</para>
  <para style="p"><verse number="1" style="v" />In the days when the judges ruled there was a famine in the land. <char style="nd">Lord</char> <verse number="2" style="v" />The name of the man was Elimelek.</para>
  <para style="q1"><verse number="3" style="v" />Poetry line one</para>
  <para style="q2">poetry line two</para>`),
  },
  {
    name: "baseline: footnote and cross-reference",
    usx: book(
      `<para style="p"><verse number="1" style="v" />Text before<note caller="+" style="f"><char style="fr" closed="false">1.1 </char><char style="ft" closed="false">A footnote text.</char></note> and after. <verse number="2" style="v" />More<note caller="-" style="x"><char style="xo" closed="false">1.2 </char><char style="xt" closed="false">Gen 1.1</char></note> text.</para>`,
    ),
  },
  {
    name: "baseline: nested char markers",
    usx: book(
      `<para style="p"><verse number="1" style="v" /><char style="add">added <char style="nd">Lord</char> text</char> plain.</para>`,
    ),
  },
  {
    name: "verse bridges and segments",
    usx: book(
      `<para style="p"><verse number="1-2" style="v" />Bridged verse text. <verse number="3a" style="v" />Segment a. <verse number="3b" style="v" />Segment b. <verse number="4a-5b" style="v" />Segmented bridge.</para>`,
    ),
  },
  {
    name: "alternate and publishing chapter/verse numbers (ca/cp/va/vp)",
    usx: `${USX_HEADER}
  <chapter number="1" style="c" altnumber="2" pubnumber="A" />
  <para style="p"><verse number="1" style="v" altnumber="2" pubnumber="1b" />Text with alternate numbering.</para>
${USX_FOOTER}`,
  },
  {
    name: "empty va char element coexisting with a folded verse altnumber",
    // PT9 empty leading-attribute-marker semantics: an EMPTY `\va` (`<char style="va" />`) is a
    // first-class char element, never an empty attribute — it must round-trip as an ordinary
    // (empty) char span, NOT get folded into the verse's `\va` display run. And a verse that DOES
    // carry an `altnumber` (its folded run) coexists in the same paragraph with a separate,
    // later `va` char span: the two representations are independent.
    usx: book(
      `<para style="p"><verse number="1" style="v" altnumber="2" />Alt-numbered text with a later <char style="va">standalone</char> span. <verse number="2" style="v" /><char style="va" />after an empty va marker.</para>`,
    ),
  },
  {
    name: "cross-reference ref target",
    usx: book(
      `<para style="p"><verse number="1" style="v" />See <ref loc="GEN 1:1">Genesis 1:1</ref> for details.</para>`,
    ),
  },
  {
    name: "optional line break (optbreak)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />First part<optbreak />second part.</para>`,
    ),
  },
  {
    name: "milestones (ts)",
    usx: book(
      `<para style="p"><ms style="ts-s" /><verse number="1" style="v" />Translator section text.<ms style="ts-e" /></para>`,
    ),
  },
  {
    name: "RTL text (Hebrew)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />וַיְהִ֗י בִּימֵי֙ שְׁפֹ֣ט הַשֹּׁפְטִ֔ים <char style="nd">יהוה</char> וַיְהִ֥י רָעָ֖ב׃</para>`,
    ),
  },
  {
    name: "table with header and cells",
    usx: book(`<para style="p"><verse number="1" style="v" />Before the table.</para>
  <table><row style="tr"><cell style="th1" align="start">Day</cell><cell style="th2" align="start">Tribe</cell></row>
  <row style="tr"><cell style="tc1" align="start">First</cell><cell style="tc2" align="start">Judah</cell></row></table>
  <para style="p">After the table.</para>`),
  },
  {
    name: "figure (USFM 3 attributes)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />Text with figure.<figure style="fig" file="cn01617.jpg" size="span" ref="1:31">At once they left their nets.</figure>More text.</para>`,
    ),
  },
  {
    name: "sidebar (esb)",
    usx: book(`<para style="p"><verse number="1" style="v" />Main text.</para>
  <sidebar style="esb" category="History"><para style="p">Sidebar paragraph content.</para></sidebar>
  <para style="p">Continues after sidebar.</para>`),
  },
  {
    name: "periph",
    usx: `<usx version="3.0">
  <book code="FRT" style="id">Front matter</book>
  <periph id="title" alt="Title Page"><para style="mt1">The Title</para></periph>
${USX_FOOTER}`,
  },
  {
    // Note-content spaces are CONTENT, not structure: only the caller's space is
    // leading-attribute structure. A note authored WITHOUT spaces between its spans
    // (`\f + \fr 2.0\fq stuff\ft text\f*`) must round-trip spaceless — the collapsed layout's
    // NBSP spacers are view scaffolding, rebuilt at load and dropped at save, and must never
    // surface as data spaces the file did not have.
    name: "note without content spaces between spans",
    usx: book(
      `<para style="p"><verse number="1" style="v" />Text<note caller="+" style="f"><char style="fr" closed="false">2.0</char><char style="fq" closed="false">stuff</char><char style="ft" closed="false">text</char></note> after.</para>`,
    ),
  },
  {
    name: "unclosed note (closed=false)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />Text<note caller="+" style="f" closed="false"><char style="fr" closed="false">1.1 </char><char style="ft" closed="false">Unterminated note</char></note></para>`,
    ),
  },
  {
    // A body char span with no explicit closing marker: ParatextData records closed="false".
    // It must round-trip WITHOUT the editor synthesizing a \nd* closer the source never had.
    name: "closed=false body char span (implicit close, no closer)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />Tell the <char style="nd" closed="false">Lord</char> plainly.</para>`,
    ),
  },
  {
    // An EXPLICITLY closed body \xt span — no `closed` attribute, so it genuinely carries a
    // `\xt*` closer. Closer display keys on the span's actual closed state, never on the
    // footnote/cross-reference marker family, so this span renders its closing glyph and must
    // round-trip WITHOUT the editor stamping a phantom closed="false" that a save would then use
    // to DROP the real `\xt*` (the byte-lossy save this fix repairs).
    name: "explicitly-closed body xt span (closer, no closed flag)",
    usx: book(
      `<para style="p"><verse number="1" style="v" />See <char style="xt">2Sam 1:2</char> for context.</para>`,
    ),
  },
  {
    // An explicitly-closed \xt carrying its default attribute (`link-href`). With the closer
    // rendered, the char attribute display run (`|…`) is built and the span is text-recoverable,
    // so the attribute round-trips through the display bytes rather than hiding in an atomic
    // sentinel.
    name: "explicitly-closed xt span with link-href attribute",
    usx: book(
      `<para style="p"><verse number="1" style="v" />See <char style="xt" link-href="GEN 1:1">Gen 1:1</char>.</para>`,
    ),
  },
  {
    name: "NBSP in text content",
    usx: book(
      `<para style="p"><verse number="1" style="v" />About 3${NBSP}000 men and women.</para>`,
    ),
  },
  {
    // Book \id description text follows the same display mapping as body text: the reverse
    // adaptor inverts display whitespace on ALL text nodes (book children included), so the
    // forward adaptor must display-encode book text too or a stored NBSP corrupts to a plain
    // space on save.
    name: "NBSP in book id description text",
    usx: `<usx version="3.0">
  <book code="RUT" style="id">Ruth A${NBSP}B</book>
  <chapter number="1" style="c" />
  <para style="p"><verse number="1" style="v" />Verse text.</para>
${USX_FOOTER}`,
  },
  {
    // Paragraph leading-space display rule: a paragraph whose first content text starts
    // with a single leading space. Standard view displays that space as NBSP; the reverse
    // adaptor inverts it back (and normalizeSpaceRuns leaves a lone space alone), so the pair
    // round-trips. The other three modes carry the leading space through untouched.
    name: "paragraph-leading space (display rule)",
    usx: book(`<para style="p"> Leading space precedes this text.</para>`),
  },
];
