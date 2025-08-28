import { usfm2perf } from "../converters/perf/usfmToPerf.js";
import transformPerfDocumentToSerializedLexicalState from "../converters/perf/perfToLexical/index.js";
import { FlatDocument as PerfDocument } from "../plugins/PerfOperations/Types/Document.js";
import Epitelete from "epitelete";

const readOptions = { readPipeline: "stripAlignmentPipeline" };
const writeOptions = { writePipeline: "mergeAlignmentPipeline", ...readOptions };

export class BookStore extends Epitelete {
  read(bookCode: string): Promise<PerfDocument> {
    return this.readPerf(bookCode, readOptions);
  }
  write(bookCode: string): Promise<PerfDocument> {
    return this.writePerf(bookCode, writeOptions);
  }
  sideload(bookCode: string, perfDocument: PerfDocument): Promise<PerfDocument> {
    return this.sideloadPerf(bookCode, perfDocument, readOptions);
  }
  override readUsfm(bookCode: string): Promise<string> {
    return super.readUsfm(bookCode, readOptions);
  }
}

export const getBookHandler = async ({
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
}): Promise<BookStore> => {
  const perf = usfm2perf(usfm, {
    serverName,
    organizationId,
    languageCode,
    versionId,
  });

  const bibleStore = new BibleStore();
  const bookHandler = bibleStore.create({
    docSetId: perf.metadata.translation.id,
    options: { historySize: 1 },
  });
  await bookHandler.sideload(bookCode, perf);
  return bookHandler;
};

export const getLexicalState = (perf: PerfDocument) => {
  const _lexicalState = transformPerfDocumentToSerializedLexicalState(perf, perf.main_sequence_id);
  return _lexicalState;
};

/**
 * A class with useful methods for managing
 * multiple instances of epitelete, each epitelete instance
 * can hold one Bible version (docSet), so this store allows
 * managing multiple Bible versions. Each Bible Version
 * is identified by a docSetId
 */
export class BibleStore {
  store: Map<string, Epitelete>;

  constructor() {
    this.store = new Map();
  }

  /** creates a new Epitelete instance given a docSetId
   * and params for Epitelete's constructor
   */
  create(epiteleteParams: { docSetId: string; options?: { historySize?: number } }) {
    const epitelete = new BookStore(epiteleteParams);
    this.store.set(epiteleteParams.docSetId, epitelete);
    return epitelete;
  }

  /** adds an Epitelete instance to the store
   * @param epiteleteInstance
   */
  add(epiteleteInstance: Epitelete) {
    const docSetId = epiteleteInstance?.docSetId;
    if (docSetId) this.store.set(docSetId, epiteleteInstance);
  }

  /** removes a Epitelete instance from the store
   * @param docSetId
   */
  remove(docSetId: string) {
    this.store.delete(docSetId);
  }

  /** gets an Epitelete instance given a docSetId
   * @param docSetId
   */
  get(docSetId: string) {
    return this.store.get(docSetId);
  }
}
