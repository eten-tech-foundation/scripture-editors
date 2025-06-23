/** Models for the rich-text Operational Transform documents used in Scripture Forge */

type OTEmbed = {
  style: string;
};

export type OTEmbedChapter = OTEmbed & {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
};
export const OT_CHAPTER_PROPS: Array<keyof OTEmbedChapter> = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export type OTEmbedVerse = OTEmbed & {
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
};
export const OT_VERSE_PROPS: Array<keyof OTEmbedVerse> = [
  "style",
  "number",
  "sid",
  "altnumber",
  "pubnumber",
];

export type OTEmbedMilestone = OTEmbed & {
  sid?: string;
  eid?: string;
  who?: string;
  status?: "start" | "end";
};
export const OT_MILESTONE_PROPS: Array<keyof OTEmbedMilestone> = ["style", "sid", "eid"];

export type OTParaAttribute = OTEmbed;
export const OT_PARA_PROPS: Array<keyof OTParaAttribute> = ["style"];

export type OTEmbedChar = OTEmbed;
export const OT_CHAR_PROPS: Array<keyof OTEmbedChar> = ["style"];
