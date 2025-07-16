import Epitelete from "epitelete";
import { usfm2perf } from "../converters/perf/usfmToPerf";
import transformPerfDocumentToSerializedLexicalState from "../converters/perf/perfToLexical";

const readOptions = { readPipeline: "stripAlignmentPipeline" };
const writeOptions = { writePipeline: "mergeAlignmentPipeline", ...readOptions };

export class BookStore extends Epitelete {
  read(bookCode) {
    return this.readPerf(bookCode, readOptions);
  }
  write(bookCode) {
    return this.writePerf(bookCode, writeOptions);
  }
  sideload(bookCode, perf) {
    return this.sideloadPerf(bookCode, perf, readOptions);
  }
}

export const getBookHandler = async ({
  usfm,
  serverName,
  organizationId,
  languageCode,
  versionId,
  bookCode,
}) => {
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

export const getLexicalState = (perf) => {
  const _lexicalState = transformPerfDocumentToSerializedLexicalState(perf, perf.main_sequence_id);
  return _lexicalState;
};

// export const lexicalState = getTestLexicalState();

/**
 * A class with useful methods for managing
 * multiple intances of epitelete, each epitelete instance
 * can hold one Bible version (docSet), so this store allows
 * managing multiple Bible versions. Each Bible Version
 * is identified by a docSetId
 */
class BibleStore {
  constructor() {
    this.store = new Map();
  }

  /** creates a new Epitelete instance given a docsetId
   * and params for Epitelete's constructor
   */
  create(epiteleteParams) {
    const epitelete = new BookStore(epiteleteParams);
    this.store.set(epiteleteParams.docSetId, epitelete);
    return epitelete;
  }

  /** adds an Epitelete instance to the store
   * @param { Epitelete } epiteleteInstance
   */
  add(epiteleteInstance) {
    const docSetId = epiteleteInstance?.docSetId;
    if (docSetId) this.store.set(docSetId, epiteleteInstance);
  }

  /** removes a Epitelete instance from the store
   * @param {string} docSetId
   */
  remove(docSetId) {
    this.store.delete(docSetId);
  }

  /** gets an Epitelete instance given a docsetId
   * @param {string} docSetId
   */
  get(docSetId) {
    this.store.get(docSetId);
  }
}

export default BibleStore;
