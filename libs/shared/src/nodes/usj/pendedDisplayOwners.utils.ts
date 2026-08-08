/**
 * Editor-scoped registry of display-run OWNER keys the marker-edit engine currently holds
 * pending. The engine (MarkerEditPlugin, platform) registers its live pending set here so the
 * self-healing display syncs — which live in shared/shared-react and cannot import the engine —
 * can leave a pended owner's run alone instead of resurrecting a deletion the engine has not
 * settled yet. Keyed per editor (main editor and footnote popover each register their own set).
 */
import { $getEditor, LexicalEditor, LexicalNode, NodeKey } from "lexical";

const pendedOwnersByEditor = new WeakMap<LexicalEditor, Set<NodeKey>>();

export function registerPendedDisplayOwners(
  editor: LexicalEditor,
  pendedKeys: Set<NodeKey>,
): () => void {
  pendedOwnersByEditor.set(editor, pendedKeys);
  return () => {
    if (pendedOwnersByEditor.get(editor) === pendedKeys) pendedOwnersByEditor.delete(editor);
  };
}

/**
 * The live pending-owner set registered for `editor`, or `undefined` when no marker-edit engine is
 * mounted on it (a non-editable marker mode, or an editor that has torn down). The SAME mutable Set
 * the engine holds, not a snapshot — a reader that keeps the reference sees later pends — so
 * callers must treat it as read-only. Takes the editor explicitly rather than reading `$getEditor()`
 * so it can be called from outside a read/update (the editor-facing `getUsj()` path decides whether
 * to enter a read at all based on whether anything is pending).
 */
export function getPendedDisplayOwners(editor: LexicalEditor): ReadonlySet<NodeKey> | undefined {
  return pendedOwnersByEditor.get(editor);
}

/** Whether `node`'s key is pended in the active editor. Call inside a read/update. */
export function $isDisplayOwnerPended(node: LexicalNode): boolean {
  return pendedOwnersByEditor.get($getEditor())?.has(node.getKey()) ?? false;
}

/**
 * Lets a self-healing display sync (attributeDisplay.utils.ts) report that it just found an
 * owner's run destroyed by something other than itself, so the marker-edit engine settles it on
 * caret departure instead of the sync resurrecting it. Writes directly into the SAME mutable Set
 * `registerPendedDisplayOwners` was given, rather than routing the report back through one of the
 * engine's own node transforms: which plugin's transform runs first on a shared dirty node
 * depends on mount order (the sync and the engine are registered by separate, independently
 * ordered plugins), so a report that only took effect via a later engine-side transform would
 * still lose the race whenever the sync happens to run first. A direct write has no such
 * ordering dependency. Call inside a read/update. No-op if no engine is currently registered for
 * the active editor.
 */
export function $reportDestroyedDisplayOwner(node: LexicalNode): void {
  pendedOwnersByEditor.get($getEditor())?.add(node.getKey());
}
