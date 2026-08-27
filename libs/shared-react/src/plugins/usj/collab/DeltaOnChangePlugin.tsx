/**
 * Adapted from https://github.com/facebook/lexical/blob/d0456a81955bc6fef7cc7f87907f2a172d41bbf2/packages/lexical-react/src/LexicalOnChangePlugin.ts
 */

import { $getOTPositionOfNode, $isFastPathContentText, DeltaOp } from "./delta-common.utils";
import { $getTextOp, getEditorDelta } from "./editor-delta.adaptor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorState, LexicalEditor, UpdateListenerPayload } from "lexical";
import { $getNodeByKey, $isTextNode, HISTORY_MERGE_TAG } from "lexical";
import Delta from "quill-delta";
import { useLayoutEffect } from "react";
import { $findFirstAncestorNoteNode, MARKER_SETTLE_TAG } from "shared";

/** Stable default for {@link DeltaOnChangePlugin}'s `ignoreTags` so the effect deps stay stable. */
const EMPTY_TAGS: readonly string[] = [];

/** Adapted from the LexicalOnChangePlugin to include collaborative editing operations. */
export function DeltaOnChangePlugin({
  ignoreHistoryMergeTagChange = true,
  ignoreSelectionChange = false,
  ignoreTags = EMPTY_TAGS,
  onChange,
}: {
  ignoreHistoryMergeTagChange?: boolean;
  ignoreSelectionChange?: boolean;
  /**
   * Update tags for which no delta should be computed or emitted. Updates carrying any of these
   * tags are skipped before `$getUpdateOps` runs. Use this for programmatic, non-collaborative
   * mutations (e.g. loading a new chapter via `EXTERNAL_USJ_MUTATION_TAG`): computing a delta for
   * a full-document replacement diffs the entire old text against the entire new text, which is
   * O(n×d) and can take minutes for large documents - and the result is discarded by consumers
   * that already filter these tags anyway.
   */
  ignoreTags?: readonly string[];
  onChange: (
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
    ops: DeltaOp[],
  ) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    if (!onChange) return;

    return editor.registerUpdateListener((payload) => {
      const { editorState, dirtyElements, dirtyLeaves, prevEditorState, tags } = payload;
      if (
        (ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
        // A `MARKER_SETTLE_TAG` commit carries the merge tag only to stay out of the undo
        // stack — its bytes really did change, so it must reach `onChange` like any edit.
        // Without this exemption the cached USJ and the emitted delta both keep showing the
        // pre-settle bytes, and the host saves a document the editor is no longer displaying.
        (ignoreHistoryMergeTagChange &&
          tags.has(HISTORY_MERGE_TAG) &&
          !tags.has(MARKER_SETTLE_TAG)) ||
        ignoreTags.some((tag) => tags.has(tag)) ||
        prevEditorState.isEmpty()
      ) {
        return;
      }

      const ops = $getUpdateOps(editor, payload);
      // TODO: this may have been added because nodes are made dirty when they shouldn't be as a
      // result of NoteNode collapsing/expanding. If so, we should fix that instead.
      if (ops.length === 0) return;

      onChange(editorState, editor, tags, ops);
    });
  }, [editor, ignoreHistoryMergeTagChange, ignoreSelectionChange, ignoreTags, onChange]);

  return null;
}

function $getUpdateOps(
  editor: LexicalEditor,
  { dirtyLeaves, prevEditorState }: UpdateListenerPayload,
): DeltaOp[] {
  let update = new Delta();
  editor.getEditorState().read(() => {
    const nodeKey = dirtyLeaves.values().next().value ?? "";
    const dirtyNode = $getNodeByKey(nodeKey);
    // Note-internal edits must NOT take the fast path: a note is ONE opaque embed unit in
    // delta-doc coordinates, so $getOTPositionOfNode for a text node INSIDE it resolves to the
    // note's OUTER position and the emitted op would land the edit AFTER the note. The full-diff
    // fallback replaces the note embed wholesale instead.
    const isInsideNote = dirtyNode !== null && $findFirstAncestorNoteNode(dirtyNode) !== undefined;
    // Presentation-carrying text must not take the fast path either: the fast path's insert is
    // the node's RAW bytes while its retain is counted in delta-doc coordinates, and for a node
    // the ops-stream exclusions treat specially (a `\q1` prefix glyph, a `\va 2\va*` run,
    // attribute text) those are different currencies — a peer would receive display bytes as
    // Scripture and every later offset would shift. $isFastPathContentText derives eligibility
    // from the same delta-doc counting instead of re-listing the exclusions; anything ineligible
    // falls to the full diff, whose $handleTextNodes applies the one authoritative list.
    if (
      dirtyLeaves.size === 1 &&
      $isTextNode(dirtyNode) &&
      !isInsideNote &&
      $isFastPathContentText(dirtyNode)
    ) {
      // Handle the most common case of text changing in a single text node.
      // Default "delta-doc" coordinates (NOT "apply"): this fast path and the `getEditorDelta`
      // diff fallback below feed the same doc-delta op stream emitted to the host via
      // `onChange`, so they must agree. They do: `$getOTPositionOfNode` counts a preceding
      // editable verse as its 1-unit embed (matching the doc delta, which emits only the verse
      // embed op — the glyph text is engine-owned display, excluded from content ops), and a
      // preceding editable chapter as its glyph-length body text (matching the doc delta too).
      // See `OTCoordinateSystem` in delta-common.utils.ts.
      const retain = $getOTPositionOfNode(dirtyNode);
      if (retain !== undefined) {
        const prevTextDoc = prevEditorState.read(() => {
          const prevNode = $getNodeByKey(nodeKey);
          return new Delta([$isTextNode(prevNode) ? $getTextOp(prevNode) : { insert: "" }]);
        });
        const textDoc = new Delta([$getTextOp(dirtyNode)]);
        const nodePositionRetain = new Delta(retain > 0 ? [{ retain }] : []);
        update = update.concat(nodePositionRetain).concat(prevTextDoc.diff(textDoc));
      }
    } else {
      const prevDoc = getEditorDelta(prevEditorState);
      const currentDoc = getEditorDelta(editor.getEditorState());
      update = prevDoc.diff(currentDoc);
    }
  });
  return update.ops;
}
