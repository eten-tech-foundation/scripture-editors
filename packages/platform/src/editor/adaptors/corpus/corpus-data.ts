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
];
