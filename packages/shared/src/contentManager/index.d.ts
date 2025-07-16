/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "epitelete" {
  export default class Epitelete {
    constructor(options: { docSetId: string });

    validator: any;
  }
}

import { SerializedEditorState } from "lexical";
import { PerfDocument } from "../plugins/PerfOperations/perfTypes";
import { PipelineHandler } from "proskomma-json-tools";

export function getLexicalState(perf: PerfDocument): SerializedEditorState | SerializedLexicalNode;

export function getBookHandler({
  usfm,
  serverName,
  organizationId,
  languageCode,
  versionId,
  bookCode,
}: {
  usfm: string;
  serverName: string;
  organizationId: string;
  languageCode: string;
  versionId: string;
  bookCode: string;
}): BookStore;

export const pipelineHandler = new PipelineHandler({
  pipelines:
    pipelines || options.pipelines
      ? { ...pipelines, ...options.pipelines, ...fnr.pipelines }
      : null,
  transforms:
    transformActions || options.transforms
      ? { ...transformActions, ...options.transforms, ...fnr.transforms }
      : null,
  proskomma: proskomma,
});

export class BookStore extends Epitelete {
  read(bookCode: string): Promise<PerfDocument>;
  write(bookCode: string, perfDocument: PerfDocument): Promise<PerfDocument>;
  sideload(bookCode: string, perfDocument: PerfDocument): Promise<PerfDocument>;
  readUsfm(bookCode): Promise<string>;
}
