import Hooks from "./Hook";
import Sequence from "./Sequence";
import { ChapterVerse, SemVer } from "./utils";

export type PerfDocument = FlatDocument | NestedDocument;

export default PerfDocument;

type Metadata = {
  tags?: string[];
  properties?: Record<string, string>;
  selectors?: Record<string, string>;
};

type DocumentMetadata = {
  tags?: string[];
  properties?: Record<string, string>;
  chapters?: ChapterVerse;
};

type Schema = {
  structure: "flat" | "nested";
  structure_version: SemVer;
  constraints: {
    name: "perf" | "sofria";
    version: SemVer;
  }[];
};

type CommonDocument = {
  schema: Schema;
  metadata: {
    translation?: Metadata | Record<string, string>;
    document?: DocumentMetadata | Record<string, string>;
  };
  hooks?: Hooks;
};

export type FlatDocument = CommonDocument & {
  sequences: Record<string, Sequence>;
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
