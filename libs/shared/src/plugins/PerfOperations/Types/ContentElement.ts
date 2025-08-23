import Hook from "./Hook.js";
import { Atts, NameSpacedSubtype, XSubtype } from "./common.js";
import { ChapterVerse, Props, getPerfProps } from "./utils.js";
import { Graft } from "./Graft.js";

export type ContentElement = ContentElementGraft | Mark | Wrapper | StartMilestone | EndMilestone;

export default ContentElement;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContentElementifValid(obj: any) {
  if (typeof obj !== "object" || obj === null) {
    return undefined;
  }
  return isContentElementGraft(obj) ||
    isMark(obj) ||
    isWrapper(obj) ||
    isStartMilestone(obj) ||
    isEndMilestone(obj)
    ? obj
    : undefined;
}

export type ContentElementProps = Props<ContentElement>;

export const getContentElementProps = <T extends ContentElement>(
  element: T,
): ContentElementProps => {
  return getPerfProps(element);
};

export type ContentElementTypeMap<Type extends string, Subtype = string> = Type extends "graft"
  ? ContentElementGraft
  : Type extends "mark"
    ? Subtype extends "chapter" | "verses"
      ? DivisionMark
      : Mark
    : Type extends "wrapper"
      ? Wrapper
      : Type extends "start_milestone"
        ? StartMilestone
        : Type extends "end_milestone"
          ? EndMilestone
          : ContentElement;

// COMMON -----------------------------------

export type Content = (string | ContentElement)[];

// GRAFT -----------------------------------

type ContentElementGraftSubtype = "footnote" | "xref" | "note_caller";

export type ContentElementGraft = Graft<ContentElementGraftSubtype>;

// MARK -----------------------------------

type MarkType = "mark";

type MarkSubtype = "alt_chapter" | "alt_verse" | "pub_chapter" | "pub_verse";

interface BaseMark<CustomSubtypes extends string = never> {
  type: MarkType;
  subtype: MarkSubtype | XSubtype | CustomSubtypes;
  atts: Atts;
  content?: Content;
}

export type DivisionMark = BaseMark<"chapter" | "verses"> & {
  atts: {
    number: number | ChapterVerse;
  };
  content?: ChapterVerse;
  meta_content?: Content;
  hooks?: Hook;
};

export type Mark = BaseMark<NameSpacedSubtype> | DivisionMark;

// WRAPPER -----------------------------------

type WrapperType = "wrapper";

type WrapperSubtype = "meta_content";

export interface Wrapper {
  type: WrapperType;
  subtype: WrapperSubtype | XSubtype | NameSpacedSubtype;
  atts?: Atts;
  content?: Content;
}

// MILESTONE -----------------------------------

type MilestoneType = "start_milestone" | "end_milestone";

interface BaseMilestone {
  type: MilestoneType;
  subtype: XSubtype | NameSpacedSubtype;
  content?: Content;
  meta_content?: Content;
  hooks?: Hook;
}

export type StartMilestone = BaseMilestone & {
  atts?: Atts;
};

export type EndMilestone = BaseMilestone;

// TYPE GUARDS -----------------------------------

export function isContentElementGraft(element: ContentElement): element is ContentElementGraft {
  return element.type === "graft";
}

export function isMark(element: ContentElement): element is Mark {
  return element.type === "mark";
}

export function isDivisionMark(element: ContentElement): element is DivisionMark {
  return isMark(element) && ["chapter", "verses"].includes(element.subtype);
}

export function isWrapper(element: ContentElement): element is Wrapper {
  return element.type === "wrapper";
}

export function isStartMilestone(element: ContentElement): element is StartMilestone {
  return element.type === "start_milestone";
}

export function isEndMilestone(element: ContentElement): element is EndMilestone {
  return element.type === "end_milestone";
}
