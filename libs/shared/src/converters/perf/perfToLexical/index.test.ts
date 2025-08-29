import { getLexicalState } from "../../../contentManager/index.js";
import { FlatDocument } from "../../../plugins/PerfOperations/Types/Document.js";
import { lexicalStateTit, perfDocumentTit } from "test-data";

describe("Testing Perf To Lexical", () => {
  it("should convert perf to lexical", () => {
    const lexicalPerfState = getLexicalState(perfDocumentTit as FlatDocument);
    expect(lexicalPerfState).toEqual(lexicalStateTit);
  });
});
