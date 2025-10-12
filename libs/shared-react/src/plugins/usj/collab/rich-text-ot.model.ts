/**
 * Models for the rich-text Operational Transform documents used in Scripture Forge.
 * `OT_???_PROPS` are the properties that can be set on the corresponding Lexical node. The rest go
 *   into unknownAttributes.
 */

import { DeltaOp } from "./delta-common.utils";

export interface OTParaAttribute {
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

export interface OTUnmatchedEmbed {
  marker: string;
}
// Ignore any unknown properties on an OTUnmatchedEmbed.

export interface OTNoteEmbed extends OTParaAttribute {
  caller: string;
  category?: string;
  contents?: { ops?: DeltaOp[] };
}
// Note that `contents` is not a property of a NoteNode, but we don't want it in unknownAttributes.
export const OT_NOTE_PROPS: (keyof OTNoteEmbed)[] = ["style", "caller", "category", "contents"];
