/**
 * The single authority for what a MARKER NAME is in the editor's byte-level regexes.
 *
 * USFM 3.x marker syntax: a marker is a backslash `\` followed by a lowercase alphanumeric name —
 * letters then an optional digit suffix (`\p`, `\q1`, `\th2`) — and milestone names additionally
 * carry a hyphenated suffix (`\qt-s`, `\ts-e`). Nested character markers PREFIX the name with `+`
 * (`\+nd`), and a closing marker SUFFIXES it with `*` (`\nd*`); the `+`/`*` are marker syntax, not
 * name bytes. (USFM documentation: "Markers", "Character styles > Nesting", "Milestones".)
 *
 * Two byte classes exist DELIBERATELY, and every marker-name regex in the editor derives from one
 * of them — the derivations below are the only places the classes are spelled:
 *
 * - {@link ENGINE_MARKER_NAME_BYTES} — the liberal class (`\w` plus `-`) the marker-edit engine
 *   uses to RECOGNIZE a marker-shaped byte run mid-edit. Wider than canonical USFM (uppercase,
 *   `_`) on purpose: the tokenizer's own name scan runs to the next whitespace/`\`/`|`/`*`
 *   (usfmFragmentToUsj.ts), so a wrong-case or unknown name is still a marker-shaped edit that
 *   must pend and re-tokenize rather than sit unnoticed in content.
 * - {@link CANONICAL_MARKER_NAME_BYTES} — the strict class canonical USFM names are built from
 *   (lowercase letters and digits), for sites CLASSIFYING a name against the stylesheet rather
 *   than detecting an edit.
 *
 * Sites needing a semantic the authority cannot express as a variant (e.g. the tokenizer's
 * scan-based rule itself) do not import from here; keeping the byte classes single-sourced is the
 * goal, not forcing every marker test through one regex.
 */

/** The engine's marker-name byte class CONTENTS (no brackets): `\w` plus the milestone hyphen. */
export const ENGINE_MARKER_NAME_BYTES = String.raw`\w-`;

/** Canonical USFM marker-name byte class CONTENTS (no brackets): lowercase letters and digits. */
export const CANONICAL_MARKER_NAME_BYTES = "a-z0-9";

/**
 * A complete canonical marker NAME: a lowercase letter, then canonical name bytes (`p`, `q1`,
 * `th2`). No hyphen — the strict-name consumers below classify paragraph/note names, which never
 * carry the milestone suffix.
 */
export const CANONICAL_MARKER_NAME_PATTERN = `[a-z][${CANONICAL_MARKER_NAME_BYTES}]*`;

/**
 * An ENTIRE glyph that is an opener terminated by exactly one separator (space or NBSP):
 * `\marker ` with the name (nesting `+` included) captured. The terminated half of the
 * opener-shape pair (see {@link BARE_OPENER_REGEX}).
 */
export const TERMINATED_OPENER_REGEX = new RegExp(
  String.raw`^\\(\+?[${ENGINE_MARKER_NAME_BYTES}]+)[ \u00A0]$`,
);

/**
 * An ENTIRE glyph that is a bare (unterminated) opener: `\marker` with the name (nesting `+`
 * included) captured, no trailing separator yet.
 *
 * Shared between the live resolve loop (markerEditTier1.utils.ts) and the read-only settle's
 * mirror of the note-glyph-rename decision surface (virtualSettle.utils.ts's
 * `$noteGlyphRenameTarget`), which must recognize a pending opener rename using the IDENTICAL
 * shape — a second, independently-derived regex could silently drift out of sync.
 */
export const BARE_OPENER_REGEX = new RegExp(String.raw`^\\(\+?[${ENGINE_MARKER_NAME_BYTES}]+)$`);

/** An ENTIRE glyph in closer form: `\marker*` (nesting `+` allowed, name may be empty — `\*`). */
export const CLOSER_FORM_REGEX = new RegExp(String.raw`^\\\+?[${ENGINE_MARKER_NAME_BYTES}]*\*$`);

/**
 * An opening glyph's LEADING marker name, by the tokenizer's own name-scan rule: the scan ends at
 * whitespace (or at the end of the bytes), so `\wj things` names `wj` exactly as the tokenizer
 * reads it, while `\wjthings` names the whole unknown run. Shapes the scan does not terminate
 * cleanly (a closer form, an attribute delimiter) deliberately do not match — see
 * `openerBytesEndTheSplit` (markerEditTier1.utils.ts).
 */
export const OPENER_NAME_REGEX = new RegExp(
  String.raw`^\\(\+?[${ENGINE_MARKER_NAME_BYTES}]+)(?:[ \u00A0]|$)`,
);

/**
 * The leading opener SPAN pieces of a glyph's bytes: group 1 the nesting `+` (possibly empty),
 * group 2 the name — for sites that need the name's `[start, end)` offsets rather than a whole
 * shape test (markerEditTier1.utils.ts's `markerNameSpan`).
 */
export const OPENER_NAME_SPAN_REGEX = new RegExp(
  String.raw`^\\(\+?)([${ENGINE_MARKER_NAME_BYTES}]+)`,
);

/**
 * A backslash sequence ANYWHERE in text, completed by a space/NBSP separator or a `*` closer —
 * the "did the user just finish typing a marker?" trigger test (markerEditTier2Trigger.utils.ts).
 */
export const TERMINATED_MARKER_IN_TEXT_REGEX = new RegExp(
  String.raw`\\\+?[${ENGINE_MARKER_NAME_BYTES}]+(?:\*|[ \u00A0])`,
);

/**
 * A fragment TAIL that is an unterminated marker token (`\wj`, `\+`, or a bare `\`): the
 * tokenizer's name scan stops only at `\`, `|`, whitespace, or `*`, so ANY other character
 * appended next — the U+FFFC placeholder included — would extend the marker name
 * (tier2Rebuild.utils.ts's sentinel guard).
 */
export const UNTERMINATED_MARKER_TAIL = new RegExp(
  String.raw`\\\+?[${ENGINE_MARKER_NAME_BYTES}]*$`,
);

/**
 * A pasted line's leading `\marker ` token, CANONICAL name shape only — the strict class, because
 * the consumer (markerEditNote.utils.ts's paragraph-marker strip) classifies the name against the
 * stylesheet, and canonical USFM paragraph markers are lowercase letters then digits with no
 * hyphen/underscore/uppercase.
 */
export const LINE_LEADING_MARKER_REGEX = new RegExp(
  String.raw`^\\(${CANONICAL_MARKER_NAME_PATTERN})( |$)`,
);

/**
 * The literal `\…` trigger prefix ending at the caret that the marker palette deletes on apply:
 * a backslash plus PT9's marker characters (MarkerDropdownControl.cs:216-219) — canonical name
 * bytes case-folded (the `i` flag) plus the nesting `+` and closer `*` the user may have typed as
 * part of the marker (consumer: markerMenuApply.utils.ts).
 */
export const LITERAL_TRIGGER_PREFIX_REGEX = new RegExp(
  String.raw`\\[${CANONICAL_MARKER_NAME_BYTES}+*]*$`,
  "i",
);
