import { SerializedUsfmElementNode } from "../../../nodes/UsfmElementNode.js";
import { PerfKind } from "../../../plugins/PerfOperations/types.js";
import transformLexicalStateToPerf from "./index.js";
import { lexicalStateTit, perfDocumentTit } from "test-data";

describe("Testing Perf To Lexical", () => {
  it("should roundtrip perf to lexical and back", () => {
    const perfResult = transformLexicalStateToPerf(
      lexicalStateTit.root as SerializedUsfmElementNode,
      PerfKind.Sequence,
    );
    const perfNode = {
      ...perfDocumentTit,
      sequences: { ...perfResult.sequences, [perfDocumentTit.main_sequence_id]: perfResult.result },
    };
    expect(perfNode).toEqual(perfDocumentTit);
  });
});
