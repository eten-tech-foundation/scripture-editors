// Reaching inside only for app css.
// eslint-disable-next-line @nx/enforce-module-boundaries
import "../../../libs/shared/src/styles/perf-app.css";
// eslint-disable-next-line @nx/enforce-module-boundaries
import "../../../libs/shared/src/styles/perf-editor.css";
import { registerRichText } from "@lexical/rich-text";
import { createEditor } from "lexical";
import {
  createEmptyHistoryState,
  getBookHandler,
  getLexicalState,
  getPerfHistoryUpdater,
  registerDefaultPerfHandlers,
  registerHistory,
  scriptureNodes,
} from "shared";
import { fetchUsfm } from "test-data";

(async () => {
  // Configuration for the editor
  const config = {
    namespace: "PerfVanillaEditor",
    theme: {},
    nodes: [...scriptureNodes],
    onError: console.error,
  };

  const documentData = {
    serverName: "dbl",
    organizationId: "bfbs",
    languageCode: "fra",
    versionId: "lsg",
    bookCode: "rev",
  };

  const usfm = await fetchUsfm(documentData);
  const bookHandler = await getBookHandler({
    usfm,
    ...documentData,
  });
  const perfSource = await bookHandler.read(documentData.bookCode);
  const lexicalState = JSON.stringify(getLexicalState(perfSource));

  //Initialize editor
  const editor = createEditor(config);
  editor.setEditorState(editor.parseEditorState(lexicalState), {
    tag: "history-merge",
  });
  registerRichText(editor);
  registerDefaultPerfHandlers(editor);

  registerHistory(editor, createEmptyHistoryState(), getPerfHistoryUpdater(perfSource), 1000);
  editor.setRootElement(document.getElementById("editor"));
})();

const infoBar = document.createElement("div");
infoBar.classList.add("info-bar");
infoBar.classList.add("noprint");

const info = document.createElement("span");
info.classList.add("info");
infoBar.appendChild(info);

info.innerText = "";

document.body.appendChild(infoBar);

//None Lexical event listener
document.addEventListener("click", function (event) {
  // Check if the hovered element matches the selector
  const _target = event.target as HTMLElement;
  const target = _target.closest("[perf-type]");
  const targetAttributes = Array.from(target?.attributes ?? []);
  const perfAttributes = targetAttributes.filter((attr) =>
    ["perf-type", "perf-subtype", "perf-subtype-ns"].includes(attr.name),
  );
  if (perfAttributes.length === 0) return;
  const perfAttributeNames = perfAttributes.map((attr) => attr.value);
  info.innerText = `${perfAttributeNames.join("/")}`;
});
