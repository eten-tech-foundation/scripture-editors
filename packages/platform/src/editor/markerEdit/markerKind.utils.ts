/**
 * The marker-edit engine's positional-KIND rules: given a marker name, is it a paragraph-kind
 * marker, or a character-kind one?
 *
 * A leaf module by design. Both tiers ask the question — Tier 1 to decide whether a rename keeps
 * a glyph in the same position, Tier 2's own-marker-prefix dedup to recognize a pasted line's own
 * paragraph marker — and they must answer it identically or a rename and a rebuild disagree about
 * what the same bytes mean. Its only inputs are a plain string and a stylesheet lookup, so it
 * needs nothing from either tier, and keeping it out of both is what stops them importing each
 * other for it.
 *
 * Milestone-name heuristic shared with the fragment tokenizer (`isMilestoneHeuristicName`): only
 * stylesheet-family milestone names (`\qt#-s/-e`, `\ts-s/-e`) plus annotation comment markers —
 * see its doc comment for why bare `ts`/`t-s`/`t-e` and the z-prefix wildcard are deliberately
 * excluded. Keeping one predicate here and in the tokenizer means Tier-1 kind guards and Tier-2
 * re-tokenization can never disagree about what is positionally a milestone.
 */

import { isMilestoneHeuristicName, MarkerLookup, MarkerType, NoteNode } from "shared";

/**
 * Same-positional-kind rule for paragraph openers. Stylesheet-first: a marker the effective sheet
 * KNOWS classifies by its styleType; heuristics cover only markers absent from the sheet. Unknown
 * markers stay as typed (Tier-1 renames to unknown markers stay in place).
 *
 * `tier2Rebuild.utils.ts`'s own-marker-prefix dedup needs this exact rule too — the SAME
 * stylesheet-first/unknown-as-paragraph classification `$buildParaFragment` already uses for the
 * paragraph's own marker. A second, narrower `type === MarkerType.Paragraph` check there
 * disagreed with it for any unknown/custom.sty marker.
 */
export function isParaKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Paragraph;
  if (NoteNode.isValidMarker(clean) || isMilestoneHeuristicName(clean)) return false;
  return true;
}

/** Same-positional-kind rule for char openers (see {@link isParaKindMarker}). */
export function isCharKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Character;
  if (NoteNode.isValidMarker(clean) || isMilestoneHeuristicName(clean)) return false;
  return true;
}
