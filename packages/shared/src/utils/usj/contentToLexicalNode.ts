import {
  MarkerContent,
  Usj,
  USJ_TYPE,
  USJ_VERSION,
} from "@eten-tech-foundation/scripture-utilities";
import { EditorAdaptor } from "../../adaptors/editor-adaptor.model";
import { isSerializedImpliedParaNode } from "../../nodes/usj/ImpliedParaNode";

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
  const lexicalSerializedRoot = editorAdaptor.serializeEditorState(usj, viewOptions);
  const lexicalSerializedNode = isSerializedImpliedParaNode(lexicalSerializedRoot.root.children[0])
    ? lexicalSerializedRoot.root.children[0].children[0]
    : lexicalSerializedRoot.root.children[0];
  return lexicalSerializedNode;
}
