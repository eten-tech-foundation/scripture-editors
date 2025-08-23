import Block from "./Block.js";
import { Hooks } from "./Hook.js";
import { Props } from "./utils.js";

export type SequenceType =
  | "main"
  | "introduction"
  | "intro_title"
  | "intro_end_title"
  | "title"
  | "end_title"
  | "heading"
  | "remark"
  | "sidebar"
  | "table"
  | "tree"
  | "kv"
  | "footnote"
  | "note_caller"
  | "xref"
  | "pub_number"
  | "alt_number"
  | "esb_cat"
  | "fig"
  | "temp";

export interface Sequence {
  type: SequenceType;
  preview_text?: string;
  blocks?: Block[];
  hooks?: Hooks;
}

export type SequenceProps = Props<Sequence>;

export function getSequenceIfValid(obj: unknown): Sequence | undefined {
  if (typeof obj !== "object" || obj === null) {
    return undefined;
  }
  return isSequence(obj) ? obj : undefined;
}

export function isSequence(value: unknown): value is Sequence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "type" in value && typeof value.type === "string";
}

export default Sequence;
