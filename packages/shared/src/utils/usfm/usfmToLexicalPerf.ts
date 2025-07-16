import { FlatDocument } from "../../plugins/PerfOperations/Types/Document";
import { usfm2perf } from "../../converters/perf/usfmToPerf";
import { transformPerfNodeToSerializedLexicalNode } from "../../converters/perf/perfToLexical";
import { PerfKind } from "../../plugins/PerfOperations/types";
import { SerializedElementNode } from "lexical";
import { Marker, MarkerType } from "./usfmTypes";
import { CURSOR_PLACEHOLDER_CHAR } from "../../plugins/CursorHandler";
import { ScriptureReference } from "../get-marker-action.model";

//For now only markers that are allowed to be under \p marker
export const createLexicalPerfNodeFromUsfm = (usfm: string, kind: "inline" | "block") => {
  const usfmDocument = String.raw`
  \mt title
  \p \c 1 placeholder
  ${usfm}
  `;

  const perf = usfm2perf(usfmDocument, {
    serverName: "local",
    organizationId: "local",
    languageCode: "any",
    versionId: "any",
  }) as FlatDocument;

  const lexicalSerializedRoot = transformPerfNodeToSerializedLexicalNode({
    source: {
      node: perf.sequences[perf.main_sequence_id],
      kind: PerfKind.Sequence,
    },
    perfSequences: perf.sequences,
  }) as SerializedElementNode<SerializedElementNode>;

  const lexicalSerializedNode =
    kind === "inline"
      ? lexicalSerializedRoot.children[1].children[2]
      : lexicalSerializedRoot.children[2];

  return lexicalSerializedNode;
};

export const usfmToLexicalAdapter = (
  usfm: string | undefined,
  _: ScriptureReference,
  markerData?: Marker,
) => {
  return createLexicalPerfNodeFromUsfm(
    usfm || `\\${usfm} ${CURSOR_PLACEHOLDER_CHAR}${markerData?.hasEndMarker ? ` \\${usfm}*` : ""}`,
    !markerData || markerData.type === MarkerType.Character || markerData.type === MarkerType.Note
      ? "inline"
      : "block",
  );
};
