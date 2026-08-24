/**
 * `AttributeRunNode` — the ONE sibling `ElementNode` that holds a leaf display owner's attribute
 * display run: a verse's `\va`/`\vp` value triplet, or a milestone's attribute value. Both owners
 * are leaves that cannot hold children of their own — a `VerseNode` is itself a `TextNode`, and a
 * `MilestoneNode` is a `DecoratorNode` — unlike a `CharNode`, whose attribute run lives INSIDE the
 * span as ordinary children. `AttributeRunNode` gives those two owners the same "run lives inside
 * a container" shape a char span already has, without changing either owner's own node type.
 *
 * Its children are the run's pieces — `MarkerNode` opening/closing (or self-closing) glyphs and,
 * in between, the attribute-tagged value `TextNode` (textType "attribute") — the same pieces that
 * used to ride as bare following siblings directly on the owner's parent. The wrapper itself
 * contributes no USFM bytes of its own: it is pure editor-owned structure, never part of a
 * conversion to USJ in its own right — only its children's bytes matter.
 *
 * Ownership is POSITION-derived, not stored: the wrapper directly follows the leaf it belongs to —
 * a verse's `\va` wrapper follows the `VerseNode` itself, and its `\vp` wrapper follows the `\va`
 * wrapper (or the verse, when no `\va` wrapper exists); a milestone's wrapper follows the
 * `MilestoneNode`. Nothing stores a back-reference — a caller locates a wrapper by walking from
 * its owner, the same sibling-walk shape the pre-wrapper display-run code already used.
 *
 * An `AttributeRunNode` with no children is a transient husk — every piece of its run was deleted,
 * leaving an empty wrapper with nothing left to display. It is not itself meaningful state: the
 * marker-edit engine's deletion driver removes empty wrappers as part of settling a deletion, the
 * same way a milestone with its run entirely gone is itself removed. `canBeEmpty()` reports `true`
 * so Lexical's own empty-element normalization does not race that driver by deleting the wrapper
 * on its own schedule.
 */

import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMExportOutput,
  ElementNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export const ATTRIBUTE_RUN_VERSION = 1;

/** The class every `AttributeRunNode` carries, regardless of `runKind`. */
export const ATTRIBUTE_RUN_CLASS_NAME = "attribute-run";

/**
 * Which owner's display run an `AttributeRunNode` wraps: a verse's `\va` value triplet, its
 * `\vp` value triplet, a milestone's attribute value, a note's `\cat` category triplet, or a
 * chapter's `\ca` alternate-number triplet. The first three owners are leaves that cannot hold
 * children; a note and an editable chapter CAN (both are ElementNodes), so their wrappers ride
 * as CHILDREN — directly after the caller / the `\c N` glyph text (a chapter's `\cp` run after
 * its `\ca` run), rather than as following siblings. `cp` is the one kind with NO closing
 * glyph: its span closes implicitly at the next block boundary in the file, so its run is
 * opener + value only (`closerSyntax: "none"`).
 */
export type AttributeRunKind = "va" | "vp" | "milestone" | "cat" | "ca" | "cp";

export type SerializedAttributeRunNode = Spread<
  {
    runKind: AttributeRunKind;
  },
  SerializedElementNode
>;

/** The `usfm_<marker>` DOM class a runKind's wrapper carries so the stylesheet styles the run
 * exactly like the standalone `char <marker>` span it folds from/unfolds to — or `undefined` for
 * the kinds with no such stylesheet hook (see `createDOM`'s comment). */
function runKindMarkerClass(runKind: AttributeRunKind): string | undefined {
  return runKind === "va" || runKind === "vp" || runKind === "ca" || runKind === "cp"
    ? `usfm_${runKind}`
    : undefined;
}

export class AttributeRunNode extends ElementNode {
  __runKind: AttributeRunKind;

  constructor(runKind: AttributeRunKind, key?: NodeKey) {
    super(key);
    this.__runKind = runKind;
  }

  static override getType(): string {
    return "attribute-run";
  }

  static override clone(node: AttributeRunNode): AttributeRunNode {
    const { __runKind, __key } = node;
    return new AttributeRunNode(__runKind, __key);
  }

  static override importJSON(serializedNode: SerializedAttributeRunNode): AttributeRunNode {
    return $createAttributeRunNode(serializedNode.runKind).updateFromJSON(serializedNode);
  }

  // No HTML shape ever round-trips: `exportDOM` below contributes no wrapper element of its own
  // (a DocumentFragment leaves no markup behind), so there is nothing for a paste to hand back
  // for conversion.
  // Declared explicitly (rather than left unimplemented) so Lexical's dev-mode registration check
  // — which otherwise warns that a custom `exportDOM` needs a matching `importDOM` — recognizes the
  // omission as deliberate.
  static override importDOM(): DOMConversionMap | null {
    return null;
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedAttributeRunNode>): this {
    return super.updateFromJSON(serializedNode).setRunKind(serializedNode.runKind);
  }

  setRunKind(runKind: AttributeRunKind): this {
    if (this.__runKind === runKind) return this;

    const self = this.getWritable();
    self.__runKind = runKind;
    return self;
  }

  getRunKind(): AttributeRunKind {
    const self = this.getLatest();
    return self.__runKind;
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.classList.add(ATTRIBUTE_RUN_CLASS_NAME);
    // va/vp/ca/cp carry a marker-specific class (matching a standalone CharNode's
    // `usfm_<marker>` class, per CharNode.test.ts's standalone-attribute-marker pin), so the
    // stylesheet styles the run and the standalone span IDENTICALLY — the run must not look
    // different just because the same bytes currently ride as an attribute. "milestone" gets
    // nothing extra — a milestone's marker varies per instance (ts-s, qt1-e, ...) and is not a
    // fixed stylesheet hook — and "cat" has no standalone stylesheet styling to match.
    const markerClass = runKindMarkerClass(this.__runKind);
    if (markerClass !== undefined) dom.classList.add(markerClass);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    // On a key-reused node whose runKind changed, sync the usfm_<runKind> class in place so
    // createDOM's discriminator doesn't go stale. `attribute-run` never changes (always present on
    // every runKind), so only the marker-class toggle needs syncing here.
    if (prevNode.__runKind !== this.__runKind) {
      const prevClass = runKindMarkerClass(prevNode.__runKind);
      if (prevClass !== undefined) dom.classList.remove(prevClass);
      const nextClass = runKindMarkerClass(this.__runKind);
      if (nextClass !== undefined) dom.classList.add(nextClass);
    }
    // Returning false keeps the existing DOM element (updated in place, never recreated — the
    // run-piece children reconcile independently).
    return false;
  }

  override exportDOM(): DOMExportOutput {
    // A DocumentFragment rather than null: @lexical/html's $appendNodesToHTML treats a null
    // element as "skip this subtree" and never walks the children, so the run's glyphs AND its
    // value text (the "2" of `\va 2\va*`) vanished from the text/html clipboard flavor while
    // getTextContent() kept them on text/plain — and most rich paste targets prefer HTML. The
    // fragment exports the children while still contributing no wrapper markup of its own.
    return { element: document.createDocumentFragment() };
  }

  override exportJSON(): SerializedAttributeRunNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      runKind: this.getRunKind(),
      version: ATTRIBUTE_RUN_VERSION,
    };
  }

  // Mutation

  override canBeEmpty(): true {
    return true;
  }

  override isInline(): true {
    return true;
  }
}

export function $createAttributeRunNode(runKind: AttributeRunKind): AttributeRunNode {
  return $applyNodeReplacement(new AttributeRunNode(runKind));
}

export function $isAttributeRunNode(
  node: LexicalNode | null | undefined,
): node is AttributeRunNode {
  return node instanceof AttributeRunNode;
}

export function isSerializedAttributeRunNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedAttributeRunNode {
  return node?.type === AttributeRunNode.getType();
}
