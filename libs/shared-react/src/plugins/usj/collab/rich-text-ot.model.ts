/**
 * Models for the rich-text Operational Transform documents used in Scripture Forge.
 * `OT_???_PROPS` are the properties that can be set on the corresponding Lexical node. The rest go
 *   into unknownAttributes.
 */

import { DeltaOp } from "./delta-common.utils";

/**
 * A Delta operation attribute for a Para-like node.
 * @public
 */
export interface OTParaAttribute {
  /** USX style (USJ marker) attribute. */
  style: string;
}
export const OT_PARA_PROPS: (keyof OTParaAttribute)[] = ["style"];

export interface OTBookAttribute extends OTParaAttribute {
  code: string;
}
export const OT_BOOK_PROPS: (keyof OTBookAttribute)[] = ["style", "code"];

export interface OTCharItem extends OTParaAttribute {
  cid?: string;
}
export type OTCharAttribute = OTCharItem | OTCharItem[];
export const OT_CHAR_PROPS: (keyof OTCharItem)[] = ["style", "cid"];

/**
 * Operational Transform Chapter Embed
 * @public
 */
export interface OTChapterEmbed extends OTParaAttribute {
  /** Chapter number */
  number: string;
  /** Start ID */
  sid?: string;
  /** Chapter number for an alternate versification scheme */
  altnumber?: string;
  /** Published chapter character */
  pubnumber?: string;
}
export const OT_CHAPTER_PROPS: (keyof OTChapterEmbed)[] = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

/**
 * Operational Transform Verse Embed
 * @public
 */
export interface OTVerseEmbed extends OTParaAttribute {
  /** Verse number */
  number: string;
  /** Start ID */
  sid?: string;
  /** Verse number for an alternate versification scheme */
  altnumber?: string;
  /** Published verse character */
  pubnumber?: string;
}
export const OT_VERSE_PROPS: (keyof OTVerseEmbed)[] = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

/**
 * Operational Transform Milestone Embed
 * @public
 */
export interface OTMilestoneEmbed extends OTParaAttribute {
  /**
   * A unique identifier which can be used to unambiguously identify the starting milestone, and to
   * clearly associate the starting milestone with the ending milestone (`eid`). The `sid` can be
   * composed of any mixture of numbers, letters, and underscores.
   */
  sid?: string;
  /**
   * A unique identifier which can be used to unambiguously identify the ending milestone, and to
   * clearly associate the ending milestone with the starting milestone (`sid`). If an `sid`
   * attribute is used for the starting milestone in a milestone pair, the ending milestone must
   * include `eid`.
   */
  eid?: string;
  /** The speaker of the quotation. */
  who?: string;
  /** Status */
  status?: "start" | "end";
}
export const OT_MILESTONE_PROPS: (keyof OTMilestoneEmbed)[] = ["style", "sid", "eid"];

/**
 * A Delta operation that inserts a Note embed.
 * @public
 */
export interface DeltaOpInsertNoteEmbed extends DeltaOp {
  /** note insert */
  insert: { note: OTNoteEmbed | null };
}
/**
 * Operational Transform Note Embed
 * @public
 */
export interface OTNoteEmbed extends OTParaAttribute {
  /** Note caller */
  caller: string;
  /** Note category */
  category?: string;
  /** Character type note contents */
  contents?: { ops?: DeltaOp[] };
}
// Note that `contents` is not a property of a NoteNode, but we don't want it in unknownAttributes.
export const OT_NOTE_PROPS: (keyof OTNoteEmbed)[] = ["style", "caller", "category", "contents"];

/**
 * Operational Transform Unknown Embed - contains any unknown node and its children. It might be
 * unknown because it isn't in the USJ spec or it is known but hasn't yet been implemented.
 * @public
 */
export interface OTUnknownEmbed {
  /** Tag name of the unknown node */
  tag: string;
  /** Marker of the unknown node */
  marker?: string;
  /** Children contents */
  contents?: { ops?: DeltaOp[] };
}
export const OT_UNKNOWN_PROPS: (keyof OTUnknownEmbed)[] = ["tag", "marker", "contents"];

/**
 * Operational Transform Unmatched Embed
 * @public
 */
export interface OTUnmatchedEmbed {
  /** Marker that is unmatched */
  marker: string;
}
// Ignore any unknown properties on an OTUnmatchedEmbed.

/**
 * All valid embed types for USJ Operational Transform docs.
 * @public
 */
export interface OTEmbedTypes {
  /** chapter embed */
  chapter: OTChapterEmbed;
  /** immutable chapter embed */
  "immutable-chapter": OTChapterEmbed;
  /** verse embed */
  verse: OTVerseEmbed;
  /** immutable verse embed */
  "immutable-verse": OTVerseEmbed;
  /** milestone embed */
  ms: OTMilestoneEmbed;
  /** note embed */
  note: OTNoteEmbed;
  /** unknown embed */
  unknown: OTUnknownEmbed;
  /** unmatched embed */
  unmatched: OTUnmatchedEmbed;
}
export const validOTEmbedTypes = [
  "chapter",
  "immutable-chapter",
  "verse",
  "immutable-verse",
  "ms",
  "note",
  "unknown",
  "unmatched",
] as const satisfies readonly (keyof OTEmbedTypes)[];
