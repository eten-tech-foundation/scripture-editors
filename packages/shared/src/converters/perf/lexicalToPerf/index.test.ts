import perfDocument from "../../../data/tit.perf";
import lexicalState from "../../../data/tit.lexical";
import transformLexicalStateToPerf from ".";
import { SerializedUsfmElementNode } from "../../../nodes/UsfmElementNode";
import { PerfKind } from "../../../plugins/PerfOperations/types";

describe("Testing Perf To Lexical", () => {
  it("should roundtrip perf to lexical and back", () => {
    const perfResult = transformLexicalStateToPerf(
      lexicalState.root as SerializedUsfmElementNode,
      PerfKind.Sequence,
    );
    const perfNode = {
      ...perfDocument,
      sequences: { ...perfResult.sequences, [perfDocument.main_sequence_id]: perfResult.result },
    };
    expect(perfNode).toEqual(perfDocument);
  });
});
