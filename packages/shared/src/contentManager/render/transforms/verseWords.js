import PerfRenderFromJson from "../../renderers/PerfRenderFromJson";
const { verseWordsActions } = require("../renderActions/verseWords");

const verseWordsCode = function ({ perf }) {
  const cl = new PerfRenderFromJson({
    srcJson: perf,
    actions: verseWordsActions,
  });
  const output = {};
  try {
    cl.renderDocument({ docId: "", config: {}, output });
  } catch (err) {
    throw new Error(`Error from renderDocument in verseWords: ${err.message}`);
  }
  return { verseWords: output.cv };
};

const verseWords = {
  name: "verseWords",
  type: "Transform",
  description: "PERF=>JSON: Counts words occurrences",
  inputs: [
    {
      name: "perf",
      type: "json",
      source: "",
    },
  ],
  outputs: [
    {
      name: "verseWords",
      type: "json",
    },
  ],
  code: verseWordsCode,
};

module.exports = { verseWords };
