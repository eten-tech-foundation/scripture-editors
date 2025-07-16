import PerfRenderFromJson from "../../renderers/PerfRenderFromJson";
import mergeActions from "../../renderers/mergeActions";
const { identityActions } = require("../../perfToPerf/renderActions/identity");
const { stripMarkupActions } = require("../renderActions/stripAlignment");

const stripMarkupCode = function ({ perf, verseWords }) {
  const cl = new PerfRenderFromJson({
    srcJson: perf,
    actions: mergeActions([stripMarkupActions, identityActions]),
  });
  const output = {};
  cl.renderDocument({ docId: "", config: { verseWords }, output });
  return {
    perf: output.perf,
    strippedAlignment: output.stripped,
    unalignedWords: output.unalignedWords,
  };
};

const stripAlignment = {
  name: "stripAlignment",
  type: "Transform",
  description: "PERF=>PERF: Strips alignment markup",
  inputs: [
    {
      name: "perf",
      type: "json",
      source: "",
    },
    {
      name: "verseWords",
      type: "json",
      source: "",
    },
  ],
  outputs: [
    {
      name: "perf",
      type: "json",
    },
    {
      name: "strippedAlignment",
      type: "json",
    },
    {
      name: "unalignedWords",
      type: "json",
    },
  ],
  code: stripMarkupCode,
};
module.exports = { stripAlignment };
