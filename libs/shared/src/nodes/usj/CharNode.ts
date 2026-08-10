/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/char/index.html */

import { UnknownAttributes } from "./node-constants.js";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
  isHTMLElement,
} from "lexical";

/** @see https://docs.usfm.bible/usfm/3.1/char/notes/footnote/index.html */
const VALID_CHAR_FOOTNOTE_MARKERS = [
  "fr",
  "fq",
  "fqa",
  "fk",
  "ft",
  "fl",
  "fw",
  "fp",
  "fv",
  "fm",
  "fdc", // Deprecated marker.
];
/** @see https://docs.usfm.bible/usfm/3.1/char/notes/crossref/index.html */
const VALID_CHAR_CROSS_REFERENCE_MARKERS = [
  "xo",
  "xop",
  "xk",
  "xq",
  "xt",
  "xta",
  "xot",
  "xnt",
  "xdc", // Deprecated marker.
];
/** @see https://docs.usfm.bible/usfm/3.1/char/index.html */
const VALID_CHAR_MARKERS = [
  // Chapter & Verse
  "ca",
  "cp",
  "va",
  "vp",

  // Text Features
  "add",
  "bk",
  "dc",
  "em",
  "jmp",
  "k",
  "nd",
  "ord",
  "pn",
  "png",
  "qt",
  "rb",
  "rq",
  // "ref", // This has its own tag and is not a Char
  "sig",
  "sls",
  "tl",
  "w",
  "wa",
  "wg",
  "wh",
  "wj",
  "addpn", // Deprecated marker.
  "pro", // Deprecated marker.

  // Text Formatting
  "bd",
  "it",
  "bdit",
  "no",
  "sc",
  "sup",

  // Introductions
  "ior",
  "iqt",

  // Poetry
  "qac",
  "qs",

  // Lists
  "litl",
  "lik",
  "liv",
  "liv1",
  "liv2",
  "liv3",
  "liv4",
  "liv5",

  ...VALID_CHAR_FOOTNOTE_MARKERS,
  ...VALID_CHAR_CROSS_REFERENCE_MARKERS,
] as const;

export const CHAR_VERSION = 1;

export type SerializedCharNode = Spread<
  {
    marker: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

/** List of known properties of `MarkerObject` */
export const CHAR_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export class CharNode extends ElementNode {
  __marker: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(marker = "", unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__marker = marker;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "char";
  }

  static override clone(node: CharNode): CharNode {
    const { __marker, __unknownAttributes, __key } = node;
    return new CharNode(__marker, __unknownAttributes, __key);
  }

  static isValidMarker(marker: string | undefined, extraValidMarkers?: readonly string[]): boolean {
    return (
      marker !== undefined &&
      (VALID_CHAR_MARKERS.includes(marker) || (extraValidMarkers?.includes(marker) ?? false))
    );
  }

  static isValidFootnoteMarker(marker: string | undefined): boolean {
    return marker !== undefined && VALID_CHAR_FOOTNOTE_MARKERS.includes(marker);
  }

  static isValidCrossReferenceMarker(marker: string | undefined): boolean {
    return marker !== undefined && VALID_CHAR_CROSS_REFERENCE_MARKERS.includes(marker);
  }

  /**
   * Whether a character marker belongs to the note-content families - footnote or cross-reference.
   *
   * These markers only ever occur inside a `NoteNode`, and unlike every other character marker they
   * are written without a closing marker. Callers branch on this for one reason or the other, so the
   * predicate names the family rather than either consequence; each call site documents which
   * consequence it cares about.
   *
   * @param marker - The character marker to check.
   * @returns `true` if the marker is a footnote or cross-reference marker, `false` otherwise.
   */
  static isNoteContentMarker(marker: string | undefined): boolean {
    return CharNode.isValidFootnoteMarker(marker) || CharNode.isValidCrossReferenceMarker(marker);
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!isCharElement(node)) return null;

        return {
          conversion: $convertCharElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(serializedNode: SerializedCharNode): CharNode {
    return $createCharNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCharNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker)
      .setUnknownAttributes(serializedNode.unknownAttributes);
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): string {
    const self = this.getLatest();
    return self.__marker;
  }

  setUnknownAttributes(unknownAttributes: UnknownAttributes | undefined): this {
    const self = this.getWritable();
    self.__unknownAttributes = unknownAttributes;
    return self;
  }

  getUnknownAttributes(): UnknownAttributes | undefined {
    const self = this.getLatest();
    return self.__unknownAttributes;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("span");
    applyMarkerToDom(dom, this.__marker, config);
    dom.classList.add(this.__type);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // Returning false tells Lexical the element can be reused — but reuse means createDOM does not
    // run again, so a marker change has to be written onto the existing element by hand: the
    // data-marker, the title (gated by showCharMarkerTitles, same as createDOM), and the usfm_*
    // class.
    //
    // Scope: this span's own attributes and classes, nothing else. The synthesized marker children
    // that markerMode "editable"/"visible" add are not touched here - $setCharNodeMarker
    // (node.utils.ts) is what retargets those, and callers changing a marker on a rendered node
    // should go through it. The collaboration path in delta-apply-update.utils.ts still calls
    // setMarker directly, so it gets this attribute refresh but not the child retargeting.
    //
    // No super.updateDOM() call, unlike ParaNode.updateDOM: ParaNode extends ParagraphNode, which
    // implements it. CharNode extends ElementNode, which does not, so super would reach
    // LexicalNode's base method and throw.
    if (prevNode.__marker !== this.__marker) {
      dom.classList.remove(`usfm_${prevNode.__marker}`);
      // The same writes createDOM makes, so the two paths cannot drift: a reused element ends up
      // indistinguishable from a freshly created one, title gating included.
      applyMarkerToDom(dom, this.__marker, config);
    }
    return false;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.setAttribute("data-marker", this.getMarker());
      element.classList.add(this.getType(), `usfm_${this.getMarker()}`);
    }

    return { element };
  }

  override exportJSON(): SerializedCharNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      marker: this.getMarker(),
      unknownAttributes: this.getUnknownAttributes(),
      version: CHAR_VERSION,
    };
  }

  // Mutation

  override insertNewAfter(_selection: RangeSelection, restoreSelection: boolean): CharNode {
    const newElement = $createCharNode(this.getMarker());
    newElement.setDirection(this.getDirection());
    newElement.setFormat(this.getFormatType());
    newElement.setStyle(this.getTextStyle());
    this.insertAfter(newElement, restoreSelection);
    return newElement;
  }

  override canBeEmpty(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }
}

/**
 * Write a marker onto a `CharNode`'s rendered span.
 *
 * Shared by `createDOM` and `updateDOM` so the created and the reused element can't drift. Only the
 * `usfm_*` class is added, never removed — `updateDOM` removes the previous marker's class itself,
 * and `createDOM` has no previous marker to remove.
 *
 * @param dom - The span to write to.
 * @param marker - The character marker to apply.
 * @param config - The editor config, read for the `showCharMarkerTitles` theme flag.
 */
function applyMarkerToDom(dom: HTMLElement, marker: string, config: EditorConfig): void {
  dom.setAttribute("data-marker", marker);
  // Consumers can suppress the per-char marker tooltip via
  // `ViewOptions.showCharMarkerTitles = false` - useful when the marker name shouldn't
  // surface as a browser tooltip on every char span. Default (undefined or true) preserves
  // the marker hint for consumers that want it while authoring USFM.
  if (config.theme?.showCharMarkerTitles !== false) {
    dom.setAttribute("title", marker);
  }
  dom.classList.add(`usfm_${marker}`);
}

function $convertCharElement(element: HTMLElement): DOMConversionOutput {
  const marker = element.getAttribute("data-marker") ?? "f";
  const node = $createCharNode(marker);
  return { node };
}

export function $createCharNode(marker?: string, unknownAttributes?: UnknownAttributes): CharNode {
  return $applyNodeReplacement(new CharNode(marker, unknownAttributes));
}

function isCharElement(node: HTMLElement | null | undefined): boolean {
  if (!node) return false;

  const marker = node.getAttribute("data-marker") ?? "";
  return CharNode.isValidMarker(marker) && node.classList.contains(CharNode.getType());
}

export function $isCharNode(node: LexicalNode | null | undefined): node is CharNode {
  return node instanceof CharNode;
}

export function isSerializedCharNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedCharNode {
  return node?.type === CharNode.getType();
}
