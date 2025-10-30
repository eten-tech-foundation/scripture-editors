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

export interface OTChapterEmbed extends OTParaAttribute {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
}
export const OT_CHAPTER_PROPS: (keyof OTChapterEmbed)[] = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export interface OTVerseEmbed extends OTParaAttribute {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
}
export const OT_VERSE_PROPS: (keyof OTVerseEmbed)[] = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export interface OTMilestoneEmbed extends OTParaAttribute {
  sid?: string;
  eid?: string;
  who?: string;
  status?: "start" | "end";
}
export const OT_MILESTONE_PROPS: (keyof OTMilestoneEmbed)[] = ["style", "sid", "eid"];

/**
 * A Delta operation embed for a Note node.
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
/**
 * A Delta operation that inserts a Note embed.
 * @public
 */
export interface DeltaOpInsertNoteEmbed extends DeltaOp {
  /** note insert */
  insert: { note: OTNoteEmbed | null };
}
// Note that `contents` is not a property of a NoteNode, but we don't want it in unknownAttributes.
export const OT_NOTE_PROPS: (keyof OTNoteEmbed)[] = ["style", "caller", "category", "contents"];

export interface OTUnmatchedEmbed {
  marker: string;
}
// Ignore any unknown properties on an OTUnmatchedEmbed.

export interface embedTypes {
  chapter: OTChapterEmbed;
  "immutable-chapter": OTChapterEmbed;
  verse: OTVerseEmbed;
  "immutable-verse": OTVerseEmbed;
  ms: OTMilestoneEmbed;
  note: OTNoteEmbed;
  unmatched: OTUnmatchedEmbed;
}
export const validEmbedTypes = [
  "chapter",
  "immutable-chapter",
  "verse",
  "immutable-verse",
  "ms",
  "note",
  "unmatched",
] as const satisfies readonly (keyof embedTypes)[];
