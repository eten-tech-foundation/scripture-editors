/**
 * The document-order note index, in a module of its own.
 *
 * `ImmutableNoteCallerNode` needs this coordinate, and the rest of the note machinery in
 * `note.utils.ts` needs `ImmutableNoteCallerNode`. Keeping the index here — a leaf that imports
 * neither — is what keeps those two from importing each other: a cycle between them works only for
 * as long as every use stays inside a function body, and the first module-level use (or a CJS
 * evaluation order that puts the caller node first) fails at load with an uninitialized binding.
 */
import { $dfs } from "@lexical/utils";
import { NodeKey } from "lexical";
import { $isNoteNode } from "shared";

/**
 * Document-order index of the note with the given key, or `undefined` when the key is not a note
 * in the document. This is the coordinate a USJ-built notes list (e.g. a host footnotes pane)
 * addresses notes by; hosts should not re-derive it by content comparison.
 *
 * Must be called inside an editor read or update.
 */
export function $getNoteIndex(noteNodeKey: NodeKey): number | undefined {
  let index = 0;
  for (const { node } of $dfs()) {
    if (!$isNoteNode(node)) continue;
    if (node.getKey() === noteNodeKey) return index;
    index += 1;
  }
  return undefined;
}
