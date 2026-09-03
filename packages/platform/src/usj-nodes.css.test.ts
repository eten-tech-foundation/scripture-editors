// @vitest-environment node
// (jsdom rewrites `import.meta.url` to an http URL, which breaks the stylesheet read; this test
// only reads a file, so the node environment is the correct one anyway.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Pins the `+`-caller counter rules in `usj-nodes.css` to the `data-note-kind` classification the
 * editor stamps on every rendered note (see `NoteNode.createDOM` and `getNoteKind` in
 * `libs/shared`). PT9's Standard view assigns the footnote caller sequence iff the note style
 * starts with `f` or `ef` and the cross-reference sequence to every other note style (Paratext
 * repo `ParatextInternalShared/ScriptureViews/Standard.xslt` lines 446-449); selecting on the
 * stamped family — instead of enumerating `usfm_<marker>` classes — is what extends the rule to
 * custom note markers. This stylesheet is mirrored into consumers (paranext-core carries a copy),
 * so the selector strings themselves are contract: a drift here silently renumbers callers there.
 */
describe("usj-nodes.css note caller counter rules", () => {
  const css = readFileSync(new URL("./usj-nodes.css", import.meta.url), "utf-8");
  /** The stylesheet with whitespace runs collapsed, so prettier's selector wrapping is ignored. */
  const flatCss = css.replace(/\s+/g, " ");

  it.each([
    [
      `.note[data-note-kind="footnote"] .immutable-note-caller[data-caller="+"] { counter-increment: caller; }`,
    ],
    [
      `.note.collapsed[data-note-kind="footnote"] .immutable-note-caller[data-caller="+"] > button::before { content: counter(caller, note-callers); }`,
    ],
    [
      `.note[data-note-kind="crossref"] .immutable-note-caller[data-caller="+"] { counter-increment: crossref; }`,
    ],
    [
      `.note.collapsed[data-note-kind="crossref"] .immutable-note-caller[data-caller="+"] > button::before { content: counter(crossref, cross-ref-callers); }`,
    ],
  ])("selects `+`-callers by data-note-kind: %s", (rule) => {
    expect(flatCss).toContain(rule);
  });

  it.each([
    [
      `.note:not([data-note-kind]) .immutable-note-caller[data-caller="+"] { counter-increment: caller; }`,
    ],
    [
      `.note.collapsed:not([data-note-kind]) .immutable-note-caller[data-caller="+"] > button::before { content: counter(caller, note-callers); }`,
    ],
  ])("keeps the transitional pre-stamping fallback: %s", (rule) => {
    expect(flatCss).toContain(rule);
  });

  it("no longer enumerates note markers for the counter rules", () => {
    expect(flatCss).not.toContain(`.note.usfm_f .immutable-note-caller`);
    expect(flatCss).not.toContain(`.note.usfm_x .immutable-note-caller`);
  });
});
