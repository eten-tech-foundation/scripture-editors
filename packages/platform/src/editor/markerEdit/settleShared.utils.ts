/**
 * Rules BOTH settles must apply identically: the mutating Tier-2 settle over live Lexical nodes
 * (`tier2Rebuild.utils.ts`) and the read-only settle over serialized JSON
 * (`virtualSettle.utils.ts`).
 *
 * Those two stay separate implementations of one rule set over two representations — that
 * separation is deliberate, and nothing here is an attempt to unify them. What belongs in this
 * module is only the subset of rules whose INPUT is already the same on both sides: a plain string,
 * or `usjEditorAdaptor.serializeEditorState`'s own output. Those need no representation
 * abstraction to be shared, and a duplicated copy of one is pure drift risk — the two halves are
 * held to producing identical output scope by scope, so a rule that silently diverges in one copy
 * only shows up as a failing equivalence test far from the edit. A rule that WOULD need a
 * representation abstraction to be shared stays mirrored in both files on purpose.
 */

import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { MarkerContent, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { SerializedLexicalNode } from "lexical";
import {
  getEditableCallerText,
  isSerializedMarkerNode,
  MarkerSyntax,
  NBSP,
  NoteNode,
} from "shared";
import { ViewOptions } from "shared-react";

/**
 * The U+FFFC OBJECT REPLACEMENT CHARACTER that stands for exactly one PRESERVED (sentinel) node
 * wherever a rebuild's bytes are tokenized, signed, or compared. Both settles emit it into the
 * fragment text they hand the tokenizer and both splice the real nodes back over it afterwards, so
 * it must be the same character on both sides.
 */
export const ATOMIC_SENTINEL = "￼";

/**
 * A CharNode's own direct child, for signature purposes, given that child's display text as it
 * stands BEFORE `toFragmentText` normalization — the mirror of `editor-usj.adaptor.ts`'s TWO
 * SEPARATE structural-NBSP rules for a char's own content, which this must reproduce exactly, not
 * conflate into one:
 *
 * 1. TEXT-FIRST content: `createChar` (usj-editor.adaptor.ts) prepends a structural NBSP directly
 *    onto the first content child's OWN text (`\u00A0name`, a MIXED node — separator plus real
 *    content). Extraction strips exactly that one leading NBSP (`isCharChild &&
 *    text.startsWith(NBSP) -> text.slice(1)`), keeping the rest as real content. Mirrored here by
 *    stripping one leading NBSP off text that is LONGER than just that one character.
 * 2. ELEMENT-FIRST content (a nested char/note/milestone/verse comes first): `createChar` instead
 *    inserts a whole SEPARATE text node containing NOTHING BUT that one NBSP (a pure spacer, never
 *    merged with anything). Extraction drops such a node WHOLESALE (`text !== NBSP`), but the node
 *    itself is real, structural evidence that a separator IS present — as opposed to a live tree
 *    missing one, e.g. right after a user deletes the text between an opening glyph and a sentinel
 *    span. Left UNSTRIPPED here (returned as-is, so the caller's `toFragmentText` turns it into a
 *    plain " "), so the signature still tells "has a separator" apart from "has none at all" for
 *    this shape.
 *
 *    One narrow, ACCEPTED consequence of rule 2 being keyed on shape rather than provenance: a
 *    pure spacer node NOT actually followed by an element — a `glyph + pure-NBSP-spacer + plain
 *    TEXT sibling` shape `createChar` itself never produces (only a hand-built fixture or a
 *    pre-heal collab state would), since ordinary text-first content always uses rule 1's single
 *    merged node instead — no longer coincidentally signature-matches a fresh rebuild's own merged
 *    `NBSP + text` node, so the paragraph is no longer refused as a fixed point and converges to
 *    that canonical merged form on its next touch. A converging canonicalization, not a
 *    data-loss risk: the represented content is identical either way, only the node count changes.
 *
 * `toFragmentText`'s blanket NBSP->space normalization, which each caller applies to this
 * function's RESULT, cannot make either distinction on its own — a structural separator and a
 * user's own literal typed space both collapse to the same plain space — so without rule 1, a live
 * char content run holding exactly one user-typed space can signature-match a fresh rebuild's own
 * single structural NBSP by coincidence, and the fixed-point check refuses a rebuild that
 * editor->USJ extraction would actually have produced DIFFERENT bytes for. Without rule 2 kept
 * narrow to MIXED nodes only, a pure spacer node would collapse to nothing, making "a separator is
 * present" signature-indistinguishable from "no separator at all" — silently defeating the
 * fixed-point check's OTHER job of noticing a missing display separator needs restoring
 * (tier2Rebuild.utils.test.tsx's "rebuilds (not aborts) when a sentinel span directly follows an
 * opening glyph").
 *
 * This runs BEFORE either settle splices its preserved nodes back in (`$replaceSentinels` /
 * `replaceSerializedSentinels`, each call site's own comment explains why): a fresh rebuild's
 * would-be rule-2 spacer has NOT been split out into its own node yet at this point — it is still
 * fused, in the SAME string, with the raw {@link ATOMIC_SENTINEL} placeholder character standing in
 * for whatever preserved node follows it (e.g. `"\u00A0￼e"`, not yet `"\u00A0"` + the preserved
 * node + `"e"`). Stripping that NBSP by LENGTH alone would misread rule 2 as rule 1 the moment ANY
 * content follows the placeholder inline. Checking the very next character is the placeholder
 * itself catches it before the split: that is exactly the position the splice cuts at, leaving the
 * NBSP standing alone afterward — the same rule-2 shape as an unedited nested-char span, which
 * never has a placeholder to begin with and is caught by the plain length check.
 *
 * Shared verbatim by both settles: the live side reads its child's text off a `TextNode` first, the
 * serialized side reads it off a JSON `text` field, and from there the rule is one string-to-string
 * computation.
 */
export function charOwnChildSignatureText(text: string): string {
  const isMixedRealContent =
    text.length > 1 && text.startsWith(NBSP) && text.charAt(1) !== ATOMIC_SENTINEL;
  return isMixedRealContent ? text.slice(1) : text;
}

/**
 * Why {@link $serializeExpandedNoteContent} has no content children to hand back:
 *
 * - `"shape"` — the serialization did not come out as one wrapper element with children.
 * - `"caller"` — the expected editable caller text is not in its slot after the opening glyph(s),
 *   so the shell is not the one this unwrap knows how to slice.
 * - `"empty"` — the unwrap left nothing between the shell's two ends.
 *
 * Returned rather than logged, because the two settles report the same guard differently (their own
 * wording, and their own level for `"empty"`).
 */
export type ExpandedNoteContentFailure = "shape" | "caller" | "empty";

/** {@link $serializeExpandedNoteContent}'s result: content children, or why there are none. */
export type ExpandedNoteContentResult =
  | { children: SerializedLexicalNode[]; failure?: undefined }
  | { children?: undefined; failure: ExpandedNoteContentFailure };

/**
 * A serialized MarkerNode's glyph syntax, or `undefined` for anything that is not one. An absent
 * `markerSyntax` field reads as `"opening"`, mirroring `MarkerNode.updateFromJSON`'s own default
 * for it, so this agrees with what parsing the same node would produce.
 */
function serializedMarkerSyntax(node: SerializedLexicalNode | undefined): MarkerSyntax | undefined {
  return isSerializedMarkerNode(node) ? (node.markerSyntax ?? "opening") : undefined;
}

/**
 * The serialized CONTENT children of `note` rebuilt from freshly tokenized `noteContent`: serialize
 * the WHOLE note — shell plus rebuilt content — with `noteMode: "expanded"` so char spans render
 * editable inline, then unwrap the shell (opening glyph(s), caller, trailing closing glyph(s)).
 *
 * Serializing through `createNote` rather than through a bare `\p` wrapper is what rebuilds the
 * folded category's canonical `\cat` display run in the SAME pass: the fresh children then carry
 * the run exactly where the live tree's do, so a settle's fixed-point comparison sees like against
 * like — a content-only serialization never rebuilt the run, making every category-bearing rebuild
 * look structurally different from its own output forever.
 *
 * The unwrap slices the serialized shell the same way `$buildNoteFragment` (tier2Rebuild.utils.ts)
 * slices the LIVE one: skip leading opening MarkerNode(s) and the caller text, drop trailing
 * closing MarkerNode(s). Other MarkerNodes among the remaining children are real display glyphs — a
 * freshly tokenized milestone's opening `\ts-s` and self-closing `\*` glyphs, or the rebuilt `\cat`
 * run's own pair — and must survive.
 *
 * Shared unchanged by both settles because the whole of it lives in the SERIALIZED domain:
 * `serializeEditorState` hands back the same JSON on both sides, and the mutating settle parses the
 * returned content children into live nodes only after this returns them.
 *
 * Read-only: reads the note's own marker, caller, and unknown attributes, so call inside
 * `editor.update()` or an editor-state read.
 */
export function $serializeExpandedNoteContent(
  note: NoteNode,
  noteContent: MarkerContent[],
  foldedCategory: string | undefined,
  viewOptions: ViewOptions,
): ExpandedNoteContentResult {
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const topLevel = usjEditorAdaptor.serializeEditorState(
    {
      type: USJ_TYPE,
      version: USJ_VERSION,
      content: [
        {
          ...note.getUnknownAttributes(),
          type: "note",
          marker: note.getMarker(),
          caller: note.getCaller(),
          ...(foldedCategory !== undefined && { category: foldedCategory }),
          content: noteContent,
        },
      ],
    },
    noteViewOptions,
  ).root.children;
  const wrapper = topLevel.length === 1 ? (topLevel[0] as { children?: unknown }) : undefined;
  const wrapperChildren = Array.isArray(wrapper?.children)
    ? (wrapper.children as SerializedLexicalNode[])
    : undefined;
  if (!wrapperChildren) return { failure: "shape" };

  let contentStart = 0;
  while (serializedMarkerSyntax(wrapperChildren[contentStart]) === "opening") contentStart++;
  const caller = wrapperChildren[contentStart] as { text?: string } | undefined;
  if (caller?.text !== getEditableCallerText(note.getCaller())) return { failure: "caller" };
  contentStart++;
  let contentEnd = wrapperChildren.length;
  while (
    contentEnd > contentStart &&
    serializedMarkerSyntax(wrapperChildren[contentEnd - 1]) === "closing"
  )
    contentEnd--;

  const children = wrapperChildren.slice(contentStart, contentEnd);
  if (children.length === 0) return { failure: "empty" };
  return { children };
}
