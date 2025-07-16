/**
 * Models for the rich-text Operational Transform documents used in Scripture Forge.
 * `OT_???_PROPS` are the properties that can be set on the corresponding Lexical node. The rest go
 *   into unknownAttributes.
 */

import { Op } from "quill-delta";

export type OTParaAttribute = {
  style: string;
};
export const OT_PARA_PROPS: Array<keyof OTParaAttribute> = ["style"];

export type OTBookAttribute = OTParaAttribute & {
  code: string;
};
export const OT_BOOK_PROPS: Array<keyof OTBookAttribute> = ["style", "code"];

export type OTCharItem = OTParaAttribute & {
  cid?: string;
};
export type OTCharAttribute = OTCharItem | OTCharItem[];
export const OT_CHAR_PROPS: Array<keyof OTCharItem> = ["style", "cid"];

export type OTChapterEmbed = OTParaAttribute & {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
};
export const OT_CHAPTER_PROPS: Array<keyof OTChapterEmbed> = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export type OTVerseEmbed = OTParaAttribute & {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
};
export const OT_VERSE_PROPS: Array<keyof OTVerseEmbed> = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export type OTMilestoneEmbed = OTParaAttribute & {
  sid?: string;
  eid?: string;
  who?: string;
  status?: "start" | "end";
};
export const OT_MILESTONE_PROPS: Array<keyof OTMilestoneEmbed> = ["style", "sid", "eid"];

export type OTNoteEmbed = OTParaAttribute & {
  caller: string;
  category?: string;
  contents?: { ops?: Op[] };
};
// Note that `contents` is not a property of a NoteNode, but we don't want it in unknownAttributes.
export const OT_NOTE_PROPS: Array<keyof OTNoteEmbed> = ["style", "caller", "category", "contents"];
