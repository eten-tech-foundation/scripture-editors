/** Models for the rich-text Operational Transform documents used in Scripture Forge */

export type OTParaAttribute = {
  style: string;
};
export const OT_PARA_PROPS: Array<keyof OTParaAttribute> = ["style"];

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
