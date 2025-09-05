/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/ms/index.html */

import {
  $applyNodeReplacement,
  DecoratorNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { UnknownAttributes } from "./node-constants.js";

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
  },
  SerializedLexicalNode
>;

export class MilestoneNode extends DecoratorNode<void> {
  __marker: string;
  __sid?: string;
  __eid?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    marker = "",
    sid?: string,
    eid?: string,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = marker;
    this.__sid = sid;
    this.__eid = eid;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "ms";
  }

  static override clone(node: MilestoneNode): MilestoneNode {
    const { __marker, __sid, __eid, __unknownAttributes, __key } = node;
    return new MilestoneNode(__marker, __sid, __eid, __unknownAttributes, __key);
  }

  static override importJSON(serializedNode: SerializedMilestoneNode): MilestoneNode {
    return $createMilestoneNode().updateFromJSON(serializedNode);
  }

  static isValidMarker(marker: string | undefined): boolean {
    return (
      marker !== undefined &&
      (VALID_MILESTONE_MARKERS.includes(marker as (typeof VALID_MILESTONE_MARKERS)[number]) ||
        marker.startsWith("z"))
    );
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMilestoneNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker)
      .setSid(serializedNode.sid)
      .setEid(serializedNode.eid)
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
): MilestoneNode {
  return $applyNodeReplacement(new MilestoneNode(marker, sid, eid, unknownAttributes));
}

export function $isMilestoneNode(node: LexicalNode | null | undefined): node is MilestoneNode {
  return node instanceof MilestoneNode;
}

export function isSerializedMilestoneNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMilestoneNode {
  return node?.type === MilestoneNode.getType();
}
