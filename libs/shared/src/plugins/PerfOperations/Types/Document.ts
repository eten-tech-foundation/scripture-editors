import Hooks from "./Hook.js";
import Sequence from "./Sequence.js";
import { ChapterVerse, SemVer } from "./utils.js";

export type PerfDocument = FlatDocument | NestedDocument;

export default PerfDocument;

export interface Metadata {
  tags?: string[];
  properties?: { [key: string]: string };
  selectors?: { [key: string]: string };
}

export interface DocumentMetadata {
  tags?: string[];
  properties?: { [key: string]: string };
  chapters?: ChapterVerse;
}

export interface Schema {
  structure: "flat" | "nested";
  structure_version: SemVer;
  constraints: {
    name: "perf" | "sofria";
    version: SemVer;
  }[];
}

interface CommonDocument {
  schema: Schema;
  metadata: {
    translation?: Metadata | { [key: string]: string };
    document?: DocumentMetadata | { [key: string]: string };
  };
  hooks?: Hooks;
}

export type FlatDocument = CommonDocument & {
  sequences: { [key: string]: Sequence };
  main_sequence_id: string;
};

export type NestedDocument = CommonDocument & {
  sequence: Sequence;
};

// TYPE GUARDS -----------------------------------

export function isFlatDocument(doc: PerfDocument): doc is FlatDocument {
  return "sequences" in doc && "main_sequence_id" in doc;
}

export function isNestedDocument(doc: PerfDocument): doc is NestedDocument {
  return "sequence" in doc;
}
