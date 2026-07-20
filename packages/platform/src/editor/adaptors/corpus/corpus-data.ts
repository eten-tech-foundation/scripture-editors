import { NBSP } from "shared";

/**
 * Round-trip corpus for Standard view.
 * Fixtures are authored as USX and converted to USJ at test time via
 * `usxStringToUsj`, guaranteeing shape-valid USJ.
 *
 * Fixture USX must not contain newlines/indentation *within* running text
 * (i.e. inside a `<para>`'s inline content) because `usxStringToUsj`
 * preserves inter-element whitespace verbatim as text content; only
 * whitespace-only text between block-level siblings (e.g. between two
 * `<para>` elements) is safely discarded. Keep each `<para>`'s content on a
 * single line.
 */

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
    name: "NBSP in text content",
    usx: book(
      `<para style="p"><verse number="1" style="v" />About 3${NBSP}000 men and women.</para>`,
    ),
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
