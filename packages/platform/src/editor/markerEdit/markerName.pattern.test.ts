/**
 * Pins for the marker-name authority (markerName.pattern.ts).
 *
 * Two kinds of pin, deliberately both:
 *
 * 1. BYTE pins — each derived regex's `source`/`flags` equal the exact literal its consumer
 *    carried before the consolidation. The derivations are template-built, so a typo in the
 *    authority (or in a derivation) would silently change several consumers at once; these pins
 *    make any such change visible as the byte diff it is.
 * 2. BEHAVIOR pins — the semantic each VARIANT exists for (liberal vs canonical class, the `i`
 *    flag, `+`/`*` handling, separator anchoring), one small example per edge, so the byte pins
 *    can be updated deliberately without losing what each variant means.
 */
import {
  BARE_OPENER_REGEX,
  CANONICAL_MARKER_NAME_PATTERN,
  CLOSER_FORM_REGEX,
  LINE_LEADING_MARKER_REGEX,
  LITERAL_TRIGGER_PREFIX_REGEX,
  OPENER_NAME_REGEX,
  OPENER_NAME_SPAN_REGEX,
  TERMINATED_MARKER_IN_TEXT_REGEX,
  TERMINATED_OPENER_REGEX,
  UNTERMINATED_MARKER_TAIL,
} from "./markerName.pattern";

describe("derived regexes are byte-identical to the literals they replaced", () => {
  it.each([
    [TERMINATED_OPENER_REGEX, String.raw`^\\(\+?[\w-]+)[ \u00A0]$`, ""],
    [BARE_OPENER_REGEX, String.raw`^\\(\+?[\w-]+)$`, ""],
    [CLOSER_FORM_REGEX, String.raw`^\\\+?[\w-]*\*$`, ""],
    [OPENER_NAME_REGEX, String.raw`^\\(\+?[\w-]+)(?:[ \u00A0]|$)`, ""],
    [OPENER_NAME_SPAN_REGEX, String.raw`^\\(\+?)([\w-]+)`, ""],
    // The two-spellings closer (`\\?\*`) is a deliberate semantic change from the historical
    // literal: the standalone milestone closer `\*` terminates too, not just the attached `nd*`.
    [TERMINATED_MARKER_IN_TEXT_REGEX, String.raw`\\\+?[\w-]+(?:\\?\*|[ \u00A0])`, ""],
    [UNTERMINATED_MARKER_TAIL, String.raw`\\\+?[\w-]*$`, ""],
    [LINE_LEADING_MARKER_REGEX, String.raw`^\\([a-z][a-z0-9]*)( |$)`, ""],
    [LITERAL_TRIGGER_PREFIX_REGEX, String.raw`\\[a-z0-9+*]*$`, "i"],
  ] as const)("%s", (regex, source, flags) => {
    expect(regex.source).toBe(source);
    expect(regex.flags).toBe(flags);
  });
});

const NBSP = "\u00A0";

describe("engine-class variants (liberal [\\w-] byte class)", () => {
  it("BARE_OPENER accepts uppercase, underscore, hyphen, and the nesting +", () => {
    expect(BARE_OPENER_REGEX.exec("\\q1")?.[1]).toBe("q1");
    expect(BARE_OPENER_REGEX.exec("\\Q1")?.[1]).toBe("Q1");
    expect(BARE_OPENER_REGEX.exec("\\z_thing")?.[1]).toBe("z_thing");
    expect(BARE_OPENER_REGEX.exec("\\qt-s")?.[1]).toBe("qt-s");
    expect(BARE_OPENER_REGEX.exec("\\+nd")?.[1]).toBe("+nd");
    expect(BARE_OPENER_REGEX.test("\\nd ")).toBe(false); // terminated, not bare
  });

  it("TERMINATED_OPENER requires exactly one trailing separator (space or NBSP)", () => {
    expect(TERMINATED_OPENER_REGEX.exec("\\p ")?.[1]).toBe("p");
    expect(TERMINATED_OPENER_REGEX.exec(`\\p${NBSP}`)?.[1]).toBe("p");
    expect(TERMINATED_OPENER_REGEX.test("\\p")).toBe(false);
    expect(TERMINATED_OPENER_REGEX.test("\\p  ")).toBe(false);
  });

  it("CLOSER_FORM allows an empty name (the bare \\* milestone terminator)", () => {
    expect(CLOSER_FORM_REGEX.test("\\nd*")).toBe(true);
    expect(CLOSER_FORM_REGEX.test("\\+nd*")).toBe(true);
    expect(CLOSER_FORM_REGEX.test("\\*")).toBe(true);
    expect(CLOSER_FORM_REGEX.test("\\nd")).toBe(false);
  });

  it("OPENER_NAME ends the name scan at a separator OR the end of the bytes", () => {
    expect(OPENER_NAME_REGEX.exec("\\wj things")?.[1]).toBe("wj");
    expect(OPENER_NAME_REGEX.exec("\\wjthings")?.[1]).toBe("wjthings");
    expect(OPENER_NAME_REGEX.test("\\wj*")).toBe(false); // closer form, not an opener
  });

  it("OPENER_NAME_SPAN splits the nesting prefix from the name", () => {
    const match = OPENER_NAME_SPAN_REGEX.exec("\\+nd rest");
    expect(match?.[1]).toBe("+");
    expect(match?.[2]).toBe("nd");
  });

  it("TERMINATED_MARKER_IN_TEXT fires only once a separator or closer lands", () => {
    expect(TERMINATED_MARKER_IN_TEXT_REGEX.test("foo \\nd bar")).toBe(true);
    expect(TERMINATED_MARKER_IN_TEXT_REGEX.test("foo \\nd*")).toBe(true);
    // The standalone milestone closer terminates too — a complete `\qt1-s\*` needs no separator.
    expect(TERMINATED_MARKER_IN_TEXT_REGEX.test("foo \\qt1-s\\*")).toBe(true);
    expect(TERMINATED_MARKER_IN_TEXT_REGEX.test("foo \\nd")).toBe(false);
  });

  it("UNTERMINATED_MARKER_TAIL matches a trailing \\name, \\+, or bare \\ only", () => {
    expect(UNTERMINATED_MARKER_TAIL.test("foo \\wj")).toBe(true);
    expect(UNTERMINATED_MARKER_TAIL.test("foo \\+")).toBe(true);
    expect(UNTERMINATED_MARKER_TAIL.test("foo \\")).toBe(true);
    expect(UNTERMINATED_MARKER_TAIL.test("foo \\wj ")).toBe(false);
  });
});

describe("canonical-class variants (strict lowercase alphanumeric)", () => {
  it("CANONICAL_MARKER_NAME_PATTERN spells the strict name shape", () => {
    expect(CANONICAL_MARKER_NAME_PATTERN).toBe("[a-z][a-z0-9]*");
  });

  it("LINE_LEADING_MARKER takes canonical names only — no uppercase, no hyphen", () => {
    expect(LINE_LEADING_MARKER_REGEX.exec("\\q1 poetry")?.[1]).toBe("q1");
    expect(LINE_LEADING_MARKER_REGEX.exec("\\p")?.[1]).toBe("p");
    expect(LINE_LEADING_MARKER_REGEX.test("\\Q1 poetry")).toBe(false);
    // A milestone-shaped name fails: `-` is not a canonical name byte and the shape demands a
    // space (or end) directly after the name.
    expect(LINE_LEADING_MARKER_REGEX.test("\\qt-s x")).toBe(false);
  });

  it("LITERAL_TRIGGER_PREFIX is case-folded and admits + and * but never the hyphen", () => {
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("before \\nd")).toBe(true);
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("before \\ND")).toBe(true);
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("before \\+nd*")).toBe(true);
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("before \\")).toBe(true); // bare trigger
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("before \\qt-s")).toBe(false);
    expect(LITERAL_TRIGGER_PREFIX_REGEX.test("no trigger here")).toBe(false);
  });
});
