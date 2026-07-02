/**
 * Round-trip corpus for Standard view (spec §7/§10, Phase 0).
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
      `<para style="p"><verse number="1" style="v" />Text before<note caller="+" style="f"><char style="fr">1.1 </char><char style="ft">A footnote text.</char></note> and after. <verse number="2" style="v" />More<note caller="-" style="x"><char style="xo">1.2 </char><char style="xt">Gen 1.1</char></note> text.</para>`,
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
];
