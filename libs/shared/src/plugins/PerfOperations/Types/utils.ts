import Block from "./Block.js";
import ContentElement from "./ContentElement.js";
import Sequence from "./Sequence.js";
import { Atts, isAtts } from "./common.js";

export type NumberString = `${number}`;

export type SemVer =
  | `${number}.${number}.${number}-${string}`
  | `${number}.${number}.${number}+${string}`
  | `${number}.${number}.${number}`;

export type ChapterVerse = `${number}` | `${number}-${number}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isChapterVerse(value: any): value is ChapterVerse {
  return typeof value === "string" && /^(\d+|\d+-\d+)$/.test(value);
}

export interface PerfProps {
  [key: string]: string | Atts;
}

export function isPerfProp(value: unknown): value is PerfProps[""] {
  return typeof value === "string" || isAtts(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPerfProps(obj: any): obj is PerfProps {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  return Object.values(obj).every((value) => isPerfProp(value));
}

export function getPerfProps<T extends Sequence | Block | ContentElement>(element: T): Props<T> {
  const filteredProps: Partial<Props<T>> = {};
  for (const key in element) {
    const value = element[key];
    if (isPerfProp(value)) {
      filteredProps[key as unknown as keyof Props<T>] = value as
        | Props<T>[keyof Props<T>]
        | undefined;
    }
  }
  return filteredProps as Props<T>;
}

type UnionAllKeys<T> = T extends T ? keyof T : never;

type UnionValues<T, K extends UnionAllKeys<T>> = T extends T
  ? K extends keyof T
    ? T[K]
    : never
  : never;

type All<T> = {
  [K in UnionAllKeys<T>]: UnionValues<T, K>;
};

export type PerfAttributes<T> = Exclude<
  {
    [K in keyof T]: T[K] extends PerfProps[""] | undefined ? K : never;
  }[keyof T],
  undefined
>;

export type PerfContainers<T> = Exclude<
  {
    [K in keyof T]: T[K] extends PerfProps[""] | undefined ? never : K;
  }[keyof T],
  undefined
>;

type CommonKeys<T> = PerfAttributes<T>;

type AllKeys<T> = PerfAttributes<All<T>>;

type AllProps<T> = Pick<All<T>, AllKeys<T>>;

type UncommonProps<T> = Partial<Omit<AllProps<T>, CommonKeys<T>>>;
type CommonProps<T> = Pick<T, CommonKeys<T>>;

export type JoinedProps<T> = UncommonProps<T> & CommonProps<T>;

export type Props<T> = T extends T ? Omit<T, PerfContainers<T>> : never;
