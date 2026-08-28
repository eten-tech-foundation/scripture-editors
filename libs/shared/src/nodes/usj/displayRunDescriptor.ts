/**
 * The display-run registry's descriptor type: one record per engine-owned display kind, naming
 * every duty that kind owes. Each kind (a char span's `|…` attribute run, a verse's `\va`/`\vp`
 * value runs, a milestone's attribute run, an optbreak's `//` token, an opening char glyph's
 * separator, a nested glyph's `+`) supplies the SAME eight fields, and the shared drivers
 * (displayRunSync.utils.ts, and the marker-edit engine's pend/settle path) read only those
 * fields. Because every field is required, adding a kind without deciding one of its duties is a
 * type error rather than a quadrant that silently does nothing at runtime.
 *
 * Every callback here reads or writes the Lexical tree and must be invoked inside an
 * `editor.read()` / `editor.update()`. The callbacks take a bare `LexicalNode` and narrow with
 * their own type guard: a heterogeneous registry array cannot be generic over its owner type and
 * still be iterable by a driver that only has a dirtied node in hand.
 */

import { AttributeRunKind, AttributeRunNode } from "./AttributeRunNode.js";
import { MarkerNode } from "../features/MarkerNode.js";
import { LexicalNode } from "lexical";

/** Which display kind a descriptor governs. Also the key the deletion classifier reports and the
 * collab exclusion gate is indexed by, so a run piece's kind is never re-derived by shape. */
export type DisplayRunKind =
  | "char"
  | "va"
  | "vp"
  | "cat"
  | "ca"
  | "cp"
  | "milestone"
  | "optbreak"
  | "opaqueUnknown"
  | "separator"
  | "nestedGlyph";

/**
 * What an owner's run SHOULD be right now, derived from owner state alone.
 *
 * `wantsRun` and `valueText` are deliberately independent. A milestone's opening/self-closing
 * glyph pair is UNCONDITIONAL — it always wants a run — while the attribute text between the
 * glyphs comes and goes, so an attribute-less milestone is `{ wantsRun: true, valueText:
 * undefined }`. A char span or a verse wants no run at all once its attribute state is empty:
 * `{ wantsRun: false, valueText: undefined }`. Collapsing the two into "is there text" is what
 * makes an attribute-less milestone's deletion look like an ordinary heal-removal.
 */
export interface ExpectedRun {
  readonly wantsRun: boolean;
  readonly valueText: string | undefined;
}

/**
 * The run pieces currently in the tree, scanned tolerantly: a mid-edit tree can be missing any
 * subset, so every field is individually optional. `value` is a bare `LexicalNode` because an
 * optbreak's display token is an `ImmutableTypedTextNode` (a DecoratorNode), not a `TextNode`;
 * writers narrow with `$isTextNode` before calling `setTextContent`.
 */
export interface ScannedRun {
  readonly opener?: MarkerNode;
  readonly value?: LexicalNode;
  readonly closer?: MarkerNode;
  readonly wrapper?: AttributeRunNode;
}

/** Whose key the pend/settle machinery holds for this kind. `"none"` means the kind has no edit
 * surface at all (nested glyphs: nothing about a `+` can be pending). */
export type SettleScope = "owner" | "none";

/**
 * What a settle does when the run is ENTIRELY absent:
 * - `"remove-owner"` — the run was the owner's whole byte representation, so deleting all of it
 *   deletes the owner (a milestone, an optbreak `UnknownNode`);
 * - `"retokenize"` — the absent run's missing bytes re-tokenize into cleared owner state (a char
 *   span's attributes, a verse's altnumber/pubnumber);
 * - `"none"` — the settle has nothing to do but must still report the owner as handled, so the
 *   caller's re-tokenize fallback never routes it anywhere (an opaque `UnknownNode` block).
 */
export type DeletionPolicy = "remove-owner" | "retokenize" | "none";

/** How a kind's run is materialized in the tree. */
export interface RunByteFormat {
  /**
   * Who writes this kind's pieces:
   * - `"wrapper"` — the shared sync driver writes them as children of an `AttributeRunNode`;
   * - `"owner-children"` — the shared sync driver writes them among the owner's own children;
   * - `"kind-owned"` — the kind keeps its own writer (the separator's prefix/spacer sync, the
   *   nested-glyph `+` sync) and the shared sync driver never writes for it;
   * - `"read-only"` — nothing ever heals this run back; it is built once and only deleted (an
   *   optbreak's `//` token). A `"read-only"` run that is absent is therefore statically known to
   *   mean "settle removes this owner", which a healable run's absence never means.
   */
  readonly writer: "wrapper" | "owner-children" | "kind-owned" | "read-only";
  /** The wrapper's `runKind`, required when `writer` is `"wrapper"`. */
  readonly runKind?: AttributeRunKind;
  /**
   * Whether the run carries its own glyph pair. Only the `"none"` / not-`"none"` split is
   * load-bearing — every consumer tests exactly that, and nothing branches on `"with-value"` vs
   * `"unconditional"`. That pair is DOCUMENTATION: it records, at the descriptor, whether the kind's
   * glyphs survive an empty value, but the behavior itself is carried by `expectedPieces`, whose
   * `wantsRun` stays true for an attribute-less milestone and goes false for an empty char/verse.
   * So read the two spellings as a label on the kind, never as a switch the drivers obey.
   */
  readonly glyphs: "none" | "with-value" | "unconditional";
  /** The glyph pair's marker name for `owner`, required when `glyphs` is not `"none"`. */
  readonly glyphMarker?: (owner: LexicalNode) => string;
  /** The trailing glyph's syntax, required when `glyphs` is not `"none"`. `"none"` means the
   * kind has an OPENER but no trailing glyph at all (a chapter's `\cp`, whose span closes
   * implicitly at the next block boundary in the file): the writer builds no closer and the
   * divergence rule does not demand one. */
  readonly closerSyntax?: "closing" | "selfClosing" | "none";
  /** The owner's own child the run is inserted BEFORE, for `"owner-children"` writers. */
  readonly insertRunBefore?: (owner: LexicalNode) => LexicalNode | undefined;
  /** The sibling the run's wrapper is inserted AFTER, for `"wrapper"` writers. Also the scan
   * anchor, so the scanner and the writer can never disagree about where a run belongs. */
  readonly insertRunAfter?: (owner: LexicalNode) => LexicalNode | undefined;
}

/** An owner plus the kind whose run a piece belonged to — what the one owner walk reports. */
export interface DisplayRunOwnerRef {
  readonly owner: LexicalNode;
  readonly kind: DisplayRunKind;
}

/** One display kind's complete set of duties. See the module comment for the invocation rules. */
export interface DisplayRunDescriptor {
  readonly kind: DisplayRunKind;
  /** Whether `node` is an owner this descriptor governs. */
  readonly ownerPredicate: (node: LexicalNode) => boolean;
  /** The owner whose run `node` is (or was) a piece of, or `undefined`. Safe to call against a
   * node read from a previous editor state, where a destroyed piece still has its tree position. */
  readonly ownerOf: (node: LexicalNode) => LexicalNode | undefined;
  /** What `owner`'s run should be, from owner state alone. */
  readonly expectedPieces: (owner: LexicalNode) => ExpectedRun;
  /** What `owner`'s run currently is in the tree. */
  readonly scanPieces: (owner: LexicalNode) => ScannedRun;
  /** Caret anchors this kind graces BEYOND the shared ones (inside the wrapper's subtree, or on
   * the value node), which `$caretHoldsRunSite` already covers for every writer-driven kind. */
  readonly graceSite: (owner: LexicalNode, pieces: ScannedRun) => boolean;
  readonly settleScope: SettleScope;
  readonly deletionPolicy: DeletionPolicy;
  readonly byteFormat: RunByteFormat;
}
