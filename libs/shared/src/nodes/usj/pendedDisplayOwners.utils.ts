/**
 * Editor-scoped registry of display-run OWNER keys the marker-edit engine currently holds
 * pending. The engine (MarkerEditPlugin, platform) registers its live pending set here so the
 * self-healing display syncs — which live in shared/shared-react and cannot import the engine —
 * can leave a pended owner's run alone instead of resurrecting a deletion the engine has not
 * settled yet. Keyed per editor (main editor and footnote popover each register their own set).
 */
import { $getEditor, LexicalEditor, LexicalNode, NodeKey } from "lexical";

const pendedOwnersByEditor = new WeakMap<LexicalEditor, ReadonlySet<NodeKey>>();

export function registerPendedDisplayOwners(
  editor: LexicalEditor,
  pendedKeys: ReadonlySet<NodeKey>,
): () => void {
  pendedOwnersByEditor.set(editor, pendedKeys);
  return () => {
    if (pendedOwnersByEditor.get(editor) === pendedKeys) pendedOwnersByEditor.delete(editor);
  };
}

/** Whether `node`'s key is pended in the active editor. Call inside a read/update. */
export function $isDisplayOwnerPended(node: LexicalNode): boolean {
  return pendedOwnersByEditor.get($getEditor())?.has(node.getKey()) ?? false;
}
