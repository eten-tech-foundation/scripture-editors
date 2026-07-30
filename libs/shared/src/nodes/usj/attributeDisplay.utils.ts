/**
 * Attribute display runs: the single place that owns HOW a node's USFM attribute bytes
 * (`|lemma="grace" strong="G5485"`, `|gloss`) are rendered as engine-owned display text and kept
 * in sync. Sibling of nestedGlyphs.utils.ts (glyph `+`) and markerSeparators.utils.ts (opener
 * separators), following the same owning-module shape.
 *
 * ## The representations (who owns what)
 *
 * - **Node state is the truth.** Char-span attributes live in `CharNode.__unknownAttributes`;
 *   milestone attributes in `MilestoneNode` props + `__unknownAttributes`. The display run is a
 *   derived cache, never a second store.
 * - **The display run** is a TextNode tagged textType "attribute" holding the canonical PT9 byte
 *   form produced by {@link canonicalAttributeText}: a lone default attribute collapses to
 *   `|value`; anything else is `|name="value" …` (double quotes, single spaces, insertion
 *   order). `closed` is derived metadata, never displayed. Char runs are bare `|…` directly
 *   before the closing glyph (PT9's shape; an NBSP prefix would flatten to a space and leak
 *   into span content on a Tier-2 rebuild). Milestone runs keep the NBSP+`|` prefix — that NBSP
 *   flattens to the space genuinely in the file (`\qt-s |sid="…"\*`).
 * - **Excluded from data paths**: textType "attribute" text never enters OT content ops or the
 *   editor→USJ conversion; the Tier-2 fragment is the one place it DOES flow, so edited bytes
 *   re-tokenize back into node state (extractAttributes / scanMilestone).
 *
 * ## Keeping the cache honest
 *
 * Builders construct the run (usj-editor.adaptor's `createChar`/`addAttributes`; transforms do
 * not run on `setEditorState`), and {@link $syncCharAttributeDisplay} — registered as a CharNode
 * transform in CharNodePlugin — re-derives it whenever a span is dirtied, healing remote collab
 * updates and structure surgery. While the collapsed caret sits inside the run the sync leaves
 * it alone (mid-edit grace); the marker-edit engine settles it on caret departure by pending
 * the edited run into its Tier-2 completion path.
 */

/** USJ artifacts that are not USFM attribute bytes and must never display. */
export const CHAR_ATTRIBUTE_EXCLUDED_KEYS: ReadonlySet<string> = new Set(["closed"]);

/**
 * The canonical PT9 byte form of an attribute set, including the leading `|` — or `""` when
 * nothing displays. A lone attribute that IS the marker's default collapses to the bare value
 * (`|gloss`); everything else is explicit `name="value"` pairs, double-quoted, single-spaced,
 * insertion order. Values are kept byte-exact (ParatextData treats trailing space as value).
 */
export function canonicalAttributeText(
  attributes: { [name: string]: string | undefined },
  defaultAttributeName?: string,
): string {
  const entries = Object.entries(attributes).filter(
    ([name, value]) => value !== undefined && !CHAR_ATTRIBUTE_EXCLUDED_KEYS.has(name),
  );
  if (entries.length === 0) return "";
  if (entries.length === 1 && entries[0][0] === defaultAttributeName) return `|${entries[0][1]}`;
  return `|${entries.map(([name, value]) => `${name}="${value}"`).join(" ")}`;
}
