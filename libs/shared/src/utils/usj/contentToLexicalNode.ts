import {
  MarkerContent,
  Usj,
  USJ_TYPE,
  USJ_VERSION,
} from "@eten-tech-foundation/scripture-utilities";
import { EditorAdaptor } from "../../adaptors/editor-adaptor.model.js";
import { isSerializedImpliedParaNode } from "../../nodes/usj/ImpliedParaNode.js";

export function createLexicalUsjNode(
  content: MarkerContent[],
  editorAdaptor: EditorAdaptor,
  viewOptions?: unknown,
) {
  const usj: Usj = {
    type: USJ_TYPE,
    version: USJ_VERSION,
    content,
  };
  // This builds a single node to splice into an existing document, so it is never block-shaped
  // however the document is laid out: a verse block wrapper here would be spliced inline, and the
  // implied-para unwrap below would miss it.
  const fragmentViewOptions =
    viewOptions && typeof viewOptions === "object"
      ? { ...viewOptions, verseLayout: "inline" }
      : viewOptions;
  const lexicalSerializedRoot = editorAdaptor.serializeEditorState(usj, fragmentViewOptions);
  const lexicalSerializedNode = isSerializedImpliedParaNode(lexicalSerializedRoot.root.children[0])
    ? lexicalSerializedRoot.root.children[0].children[0]
    : lexicalSerializedRoot.root.children[0];
  return lexicalSerializedNode;
}
