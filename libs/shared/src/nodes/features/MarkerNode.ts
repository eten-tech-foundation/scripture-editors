/** Marker node used when displaying USFM */

import { closingMarkerText, openingMarkerText } from "../usj/node.utils.js";
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  SerializedTextNode,
  Spread,
  TextNode,
} from "lexical";

export const MARKER_VERSION = 1;

export type MarkerSyntax = "opening" | "closing" | "selfClosing";
export type SerializedMarkerNode = Spread<
  {
    marker: string;
    markerSyntax?: MarkerSyntax;
    /**
     * Whether this glyph belongs to a char span nested inside another char span. A nested span's
     * glyph text carries the `+` prefix (`\+w …\+w*`) — ParatextData's writer rule and PT9's
     * on-screen display for USFM ≤3.0.
     *
     * This is a CACHE of tree-derived state (nesting truth is parent-is-CharNode; markers stay
     * clean everywhere), stored because Lexical renders a TextNode's stored `__text` — there is
     * no computed-text hook, and nothing re-runs when an ANCESTOR moves — so the `+` must be
     * baked into `__text` at write time (see `getMarkerText`). Serialized only when `true`
     * because transforms do not run on `setEditorState`: a restored state renders straight from
     * `__text`, so the flag must survive serialization for `setMarker`/`setMarkerSyntax` to
     * re-derive the text correctly later. Glyph builders set it at construction, and the
     * `$syncNestedGlyphs` CharNode transform re-derives it from tree position whenever a span is
     * dirtied — see nestedGlyphs.utils.ts for the full representation rules.
     */
    nested?: boolean;
  },
  SerializedTextNode
>;

export class MarkerNode extends TextNode {
  __marker: string;
  __markerSyntax: MarkerSyntax;
  __nested: boolean;

  // `key` stays in Lexical's own third-parameter slot (`TextNode(text, key)`), with `nested`
  // appended after it: a node's key is the last argument every Lexical node constructor takes, and
  // slotting a new field ahead of it would silently reinterpret an existing 3-argument call's
  // `NodeKey` as this flag.
  constructor(marker = "", markerSyntax: MarkerSyntax = "opening", key?: NodeKey, nested = false) {
    super(getMarkerText(marker, markerSyntax, nested), key);
    this.__marker = marker;
    this.__markerSyntax = markerSyntax;
    this.__nested = nested;
  }

  static override getType(): string {
    return "marker";
  }

  static override clone(node: MarkerNode): MarkerNode {
    return new MarkerNode(node.__marker, node.__markerSyntax, node.__key, node.__nested);
  }

  static override importJSON(serializedNode: SerializedMarkerNode): MarkerNode {
    return $createMarkerNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMarkerNode>): this {
    const { marker, markerSyntax = "opening", nested = false } = serializedNode;
    const self = super.updateFromJSON({
      ...serializedNode,
      // An EMPTY serialized text is the "build canonical bytes" sentinel — the adaptor's
      // createMarker serializes glyphs with `text: ""` and relies on the import deriving them.
      // Any non-empty text is the glyph's actual displayed bytes and is kept verbatim.
      text: serializedNode.text || getMarkerText(marker, markerSyntax, nested),
    });
    // Assigned directly rather than via setMarker/setMarkerSyntax/setNested, which rewrite the
    // just-applied text to canonical and lose a serialized mid-edit divergence: a glyph whose
    // `*` the user deleted must round-trip through parseEditorState or clipboard
    // deserialization still divergent — rewriting it here heals against a user edit, and
    // $isCanonicalMarkerNode then wrongly reports the glyph at rest. Same treatment as
    // ImmutableUnmatchedNode.updateFromJSON.
    const writable = self.getWritable();
    writable.__marker = marker;
    writable.__markerSyntax = markerSyntax;
    writable.__nested = nested;
    return writable;
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    self.__text = getMarkerText(marker, self.__markerSyntax, self.__nested);
    return self;
  }

  getMarker(): string {
    const self = this.getLatest();
    return self.__marker;
  }

  setMarkerSyntax(markerSyntax: MarkerSyntax): this {
    if (this.__markerSyntax === markerSyntax) return this;

    const self = this.getWritable();
    self.__markerSyntax = markerSyntax;
    self.__text = getMarkerText(self.__marker, markerSyntax, self.__nested);
    return self;
  }

  getMarkerSyntax(): MarkerSyntax {
    const self = this.getLatest();
    return self.__markerSyntax;
  }

  setNested(nested: boolean): this {
    if (this.__nested === nested) return this;

    const self = this.getWritable();
    self.__nested = nested;
    self.__text = getMarkerText(self.__marker, self.__markerSyntax, nested);
    return self;
  }

  getNested(): boolean {
    const self = this.getLatest();
    return self.__nested;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(this.__markerSyntax);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // TextNode implements updateDOM, so unlike CharNode.updateDOM this can - and must - defer to
    // super: its return value decides whether Lexical reuses the element or rebuilds it via
    // createDOM. On reuse, createDOM does not run again, so the marker-derived attribute and class
    // it set have to be rewritten here by hand. setMarker/setMarkerSyntax already reconcile the
    // visible text; without this the presentational data-marker and syntax class go stale, which is
    // the same gap CharNode.updateDOM closes for the char span.
    const isRecreated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__marker !== this.__marker) dom.setAttribute("data-marker", this.__marker);
    if (prevNode.__markerSyntax !== this.__markerSyntax) {
      dom.classList.remove(prevNode.__markerSyntax);
      dom.classList.add(this.__markerSyntax);
    }
    return isRecreated;
  }

  override exportJSON(): SerializedMarkerNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      text: this.getTextContent(),
      marker: this.getMarker(),
      markerSyntax: this.getMarkerSyntax(),
      // Only serialize the flag for genuinely nested glyphs; absence means non-nested, so
      // existing states (and the overwhelmingly common non-nested markers) stay unchanged.
      ...(this.getNested() ? { nested: true } : {}),
      version: MARKER_VERSION,
    };
  }
}

export function $createMarkerNode(
  marker?: string,
  markerSyntax?: MarkerSyntax,
  nested?: boolean,
): MarkerNode {
  return $applyNodeReplacement(new MarkerNode(marker, markerSyntax, undefined, nested));
}

export function $isMarkerNode(node: LexicalNode | null | undefined): node is MarkerNode {
  return node instanceof MarkerNode;
}

export function isSerializedMarkerNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMarkerNode {
  return node?.type === MarkerNode.getType();
}

/**
 * Whether `node`'s RENDERED bytes still spell the glyph its own state describes — the single
 * definition of "this glyph is at rest", as opposed to mid-edit (pend-shaped).
 *
 * A glyph's text is a cache of (marker, syntax, nested) that only the setters below rewrite, so a
 * user edit to the displayed characters — deleting the `*` from `\va*`, backspacing into `\qt-s` —
 * leaves the node's state fully intact while the bytes on screen say something else. Anything that
 * classifies a glyph must ask this, not just the state: a glyph whose bytes have drifted is
 * mid-edit, and treating it as canonical is how a run comes to be canonical to one subsystem and
 * pending to another at the same time. That standing disagreement is the defect shape this
 * predicate exists to make impossible, so it belongs next to the `__text` writer it mirrors, not
 * beside any one of its callers — the marker transform, the pending-marker resolve, the historic
 * re-pend scan, the read-only settle, and the display-run piece scanners all key on it. A nested
 * span's `\+w*` is canonical FOR A NESTED GLYPH; the `+` comes from the node's own stored nesting,
 * so a rest-state nested glyph is never mistaken for a damaged one.
 *
 * Read-only: call inside `editor.getEditorState().read(...)` or an update.
 */
export function $isCanonicalMarkerNode(node: MarkerNode): boolean {
  return (
    node.getTextContent() ===
    getMarkerText(node.getMarker(), node.getMarkerSyntax(), node.getNested())
  );
}

/**
 * Rewrite `node`'s rendered bytes to the canonical spelling of its own (marker, syntax, nested)
 * state — the HEAL arm for machine drift on a glyph's displayed characters. The one writer of the
 * canonical form lives in this module ({@link getMarkerText}); exposing the restore here keeps a
 * healer from re-deriving the spelling and drifting from it. Callers own the provenance decision
 * (invariants: machine drift heals, a user edit pends) — this function only writes the bytes.
 *
 * Mutating: call inside `editor.update()` (dispatched from the marker-edit engine's `MarkerNode`
 * transform when a non-user divergence is detected).
 */
export function $restoreCanonicalMarkerText(node: MarkerNode): void {
  node.setTextContent(getMarkerText(node.getMarker(), node.getMarkerSyntax(), node.getNested()));
}

/**
 * The single writer of a glyph's `__text` — the ONLY place the `+` becomes literal characters.
 * `marker` is always clean (`"w"`); `nested` contributes the `+` (`\+w`). Called from the
 * constructor and every setter, so `__text` always reflects (marker, syntax, nested) — keeping
 * the cached text honest is therefore exactly the job of keeping `nested` honest, which
 * `$syncNestedGlyphs` (nestedGlyphs.utils.ts) does from tree position.
 */
function getMarkerText(marker: string, markerSyntax: MarkerSyntax, nested = false) {
  // The self-closing form is a milestone terminator (`\*`); milestones never nest inside a char
  // span, so the `+` prefix does not apply to it.
  if (markerSyntax === "closing") return closingMarkerText(marker, nested);
  if (markerSyntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(marker, nested);
}
