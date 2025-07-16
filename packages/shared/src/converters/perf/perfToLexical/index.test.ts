import { getLexicalState } from "../../../contentManager";
import perfDocument from "../../../data/tit.perf";
import lexicalState from "../../../data/tit.lexical";

describe("Testing Perf To Lexical", () => {
  it("should convert perf to lexical", () => {
    const lexicalPerfState = getLexicalState(perfDocument);
    expect(lexicalPerfState).toEqual(lexicalState);
  });
});
