/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/ms/index.html */

import { UnknownAttributes } from "./node-constants.js";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $applyNodeReplacement,
  DecoratorNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export const STARTING_MS_COMMENT_MARKER = "zmsc-s";
export const ENDING_MS_COMMENT_MARKER = "zmsc-e";

/** Milestone markers used to mark a comment annotation */
const milestoneCommentMarkers = [STARTING_MS_COMMENT_MARKER, ENDING_MS_COMMENT_MARKER];

/** @see https://docs.usfm.bible/usfm/3.1/ms/index.html */
const VALID_MILESTONE_MARKERS = [
  "ts-s",
  "ts-e",
  "t-s",
  "t-e",
  "ts",
  "qt1-s",
  "qt1-e",
  "qt2-s",
  "qt2-e",
  "qt3-s",
  "qt3-e",
  "qt4-s",
  "qt4-e",
  "qt5-s",
  "qt5-e",
  "qt-s",
  "qt-e",
  // custom markers used for annotations
  STARTING_MS_COMMENT_MARKER,
  ENDING_MS_COMMENT_MARKER,
] as const;

export const MILESTONE_VERSION = 1;

export type SerializedMilestoneNode = Spread<
  {
    marker: string;
    sid?: string;
    eid?: string;
    unknownAttributes?: UnknownAttributes;
    /**
     * The order the source document authored this milestone's attributes in, when that order is
     * NOT the canonical one — see {@link milestoneAttributeOrder}. Present only for a
     * non-canonically ordered milestone, so every state written before this field existed, and
     * every canonically ordered milestone written since, serialize byte-identically and read back
     * with the same meaning they always had: absent means canonical. That backwards compatibility
     * is why {@link MILESTONE_VERSION} does not change for it.
     */
    attributeOrder?: string[];
  },
  SerializedLexicalNode
>;

/** List of known properties of `MarkerObject` */
export const MS_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = [
  "type",
  "marker",
  "sid",
  "eid",
  "content",
];

/**
 * The milestone `MarkerObject` properties that are never attribute bytes. Everything ELSE a
 * milestone carries — `sid` and `eid` just as much as an unknown attribute like `who` — is written
 * into its `|…` run, so those are the names that have an order relative to one another. Derived
 * from {@link MS_MARKER_OBJECT_PROPS} so the two cannot drift.
 */
export const MS_NON_ATTRIBUTE_PROPS: (keyof MarkerObject)[] = MS_MARKER_OBJECT_PROPS.filter(
  (property) => property !== "sid" && property !== "eid",
);

export class MilestoneNode extends DecoratorNode<string> {
  __marker: string;
  __sid?: string;
  __eid?: string;
  __unknownAttributes?: UnknownAttributes;
  __attributeOrder?: string[];

  constructor(
    marker = "",
    sid?: string,
    eid?: string,
    unknownAttributes?: UnknownAttributes,
    attributeOrder?: string[],
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = marker;
    this.__sid = sid;
    this.__eid = eid;
    this.__unknownAttributes = unknownAttributes;
    this.__attributeOrder = attributeOrder;
  }

  static override getType(): string {
    return "ms";
  }

  static override clone(node: MilestoneNode): MilestoneNode {
    const { __marker, __sid, __eid, __unknownAttributes, __attributeOrder, __key } = node;
    return new MilestoneNode(__marker, __sid, __eid, __unknownAttributes, __attributeOrder, __key);
  }

  static override importJSON(serializedNode: SerializedMilestoneNode): MilestoneNode {
    return $createMilestoneNode().updateFromJSON(serializedNode);
  }

  static isValidMarker(marker: string | undefined, extraValidMarkers?: readonly string[]): boolean {
    return (
      marker !== undefined &&
      (VALID_MILESTONE_MARKERS.includes(marker as (typeof VALID_MILESTONE_MARKERS)[number]) ||
        marker.startsWith("z") ||
        (extraValidMarkers?.includes(marker) ?? false))
    );
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMilestoneNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker)
      .setSid(serializedNode.sid)
      .setEid(serializedNode.eid)
      .setUnknownAttributes(serializedNode.unknownAttributes)
      .setAttributeOrder(serializedNode.attributeOrder);
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

  setSid(sid: string | undefined): this {
    if (this.__sid === sid) return this;

    const self = this.getWritable();
    self.__sid = sid;
    return self;
  }

  getSid(): string | undefined {
    const self = this.getLatest();
    return self.__sid;
  }

  setEid(eid: string | undefined): this {
    if (this.__eid === eid) return this;

    const self = this.getWritable();
    self.__eid = eid;
    return self;
  }

  getEid(): string | undefined {
    const self = this.getLatest();
    return self.__eid;
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

  setAttributeOrder(attributeOrder: string[] | undefined): this {
    const self = this.getWritable();
    self.__attributeOrder = attributeOrder;
    return self;
  }

  /**
   * The authored attribute order this milestone was loaded with, or `undefined` when its order is
   * the canonical one. Feed it to `milestoneAttributes` (attributeDisplay.utils.ts) — every site
   * that turns a milestone back into bytes or back into USJ goes through there, so the order
   * cannot be honored in one place and dropped in another.
   */
  getAttributeOrder(): string[] | undefined {
    const self = this.getLatest();
    return self.__attributeOrder;
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(this.__type, `usfm_${this.__marker}`);
    return dom;
  }

  override updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  /**
   * A milestone paints nothing of its own: in editable marker mode its `\qt-s …\*` glyphs are real
   * sibling nodes, and in the other modes an `ImmutableTypedTextNode` carries them.
   *
   * Keep this payload EMPTY. A decorator payload with STABLE IDENTITY is unsound for any node that
   * can be re-parented, and a milestone can be — it rides a Tier-2 paragraph rebuild as a preserved
   * sentinel and is moved into the freshly created paragraph, whose children Lexical builds new
   * elements for. Lexical skips notifying its decorator listener whenever the payload is unchanged
   * (`reconcileDecorator` bails on `currentDecorators[key] === decorator`, and equal strings always
   * compare equal), so `@lexical/react`'s portal would stay bound to the OLD, detached element and
   * the live one would render nothing from then on. `""` is what makes that harmless here: there is
   * nothing to lose. Giving this node visible payload would reintroduce exactly that defect — render
   * such bytes from `createDOM` instead, the way `ImmutableTypedTextNode` does.
   */
  override decorate(): string {
    return "";
  }

  override exportJSON(): SerializedMilestoneNode {
    return {
      type: this.getType(),
      marker: this.getMarker(),
      sid: this.getSid(),
      eid: this.getEid(),
      unknownAttributes: this.getUnknownAttributes(),
      attributeOrder: this.getAttributeOrder(),
      version: MILESTONE_VERSION,
    };
  }

  // Mutation

  override isKeyboardSelectable(): false {
    return false;
  }
}

export function isMilestoneCommentMarker(marker: string) {
  return milestoneCommentMarkers.includes(marker);
}

export function $createMilestoneNode(
  marker?: string,
  sid?: string,
  eid?: string,
  unknownAttributes?: UnknownAttributes,
  attributeOrder?: string[],
): MilestoneNode {
  return $applyNodeReplacement(
    new MilestoneNode(marker, sid, eid, unknownAttributes, attributeOrder),
  );
}

export function $isMilestoneNode(node: LexicalNode | null | undefined): node is MilestoneNode {
  return node instanceof MilestoneNode;
}

export function isSerializedMilestoneNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMilestoneNode {
  return node?.type === MilestoneNode.getType();
}
