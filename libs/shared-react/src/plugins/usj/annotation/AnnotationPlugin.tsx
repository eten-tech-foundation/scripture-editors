import { AnnotationRange } from "./selection.model";
import { $getRangeFromUsjSelection } from "./selection.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister, registerNestedElementResolver } from "@lexical/utils";
import { $getNodeByKey, HISTORIC_TAG, LexicalEditor, NodeKey } from "lexical";
import { ForwardedRef, forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import {
  $createTypedMarkNode,
  $isTypedMarkNode,
  $unwrapTypedMarkNode,
  $wrapSelectionInTypedMarkNode,
  ANNOTATION_CHANGE_TAG,
  LoggerBasic,
  TypedIDs,
  TypedMarkNode,
  TypedMarkOnClick,
  TypedMarkOnMouseEnter,
  TypedMarkOnMouseLeave,
  TypedMarkOnRemove,
} from "shared";

/** Identifies an ephemeral annotation. @public */
export interface AnnotationReference {
  type: string;
  id: string;
}

/** An ephemeral annotation and its optional event handlers. @public */
export interface Annotation extends AnnotationReference {
  selection: AnnotationRange;
  onClick?: TypedMarkOnClick;
  onRemove?: TypedMarkOnRemove;
  onMouseEnter?: TypedMarkOnMouseEnter;
  onMouseLeave?: TypedMarkOnMouseLeave;
}

/** Forward reference for annotations. */
export interface AnnotationRef {
  setAnnotations(annotations: readonly Annotation[]): void;
  removeAnnotations(refs: readonly AnnotationReference[]): void;
  setAnnotation(
    selection: AnnotationRange,
    type: string,
    id: string,
    onClick?: TypedMarkOnClick,
    onRemove?: TypedMarkOnRemove,
    onMouseEnter?: TypedMarkOnMouseEnter,
    onMouseLeave?: TypedMarkOnMouseLeave,
  ): void;
  removeAnnotation(type: string, id: string): void;
}

function getTypeIDMapKey(type: string, id: string): string {
  return JSON.stringify([type, id]);
}

function useAnnotations(editor: LexicalEditor, markNodeMap: Map<string, Set<NodeKey>>) {
  useEffect(() => {
    if (!editor.hasNodes([TypedMarkNode])) {
      throw new Error("AnnotationPlugin: TypedMarkNode not registered on editor!");
    }

    const markNodeKeysToTypedIDs = new Map<NodeKey, TypedIDs>();

    return mergeRegister(
      registerNestedElementResolver<TypedMarkNode>(
        editor,
        TypedMarkNode,
        (from: TypedMarkNode) => {
          return $createTypedMarkNode(
            from.getTypedIDs(),
            from.getTypedOnClicks(),
            from.getTypedOnRemoves(),
            from.getTypedOnMouseEnters(),
            from.getTypedOnMouseLeaves(),
          );
        },
        (from: TypedMarkNode, to: TypedMarkNode) => {
          // Merge the IDs
          const fromOnClicks = from.getTypedOnClicks();
          const fromOnRemoves = from.getTypedOnRemoves();
          const fromOnMouseEnters = from.getTypedOnMouseEnters();
          const fromOnMouseLeaves = from.getTypedOnMouseLeaves();
          for (const [type, ids] of Object.entries(from.getTypedIDs())) {
            ids.forEach((id) => {
              const onClick = fromOnClicks[type]?.[id];
              const onRemove = fromOnRemoves[type]?.[id];
              const onMouseEnter = fromOnMouseEnters[type]?.[id];
              const onMouseLeave = fromOnMouseLeaves[type]?.[id];
              to.addID(type, id, onClick, onRemove, onMouseEnter, onMouseLeave);
            });
          }

          // The resolver replaces the original node with a new one; suppress callbacks so the
          // transferred IDs do not emit "destroyed" notifications during the teardown.
          from.getWritable().__suppressOnRemoveCallbacks = true;
        },
      ),
      editor.registerMutationListener(
        TypedMarkNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            // Keep track of mutated mark node keys so they can be removed later.
            for (const [key, mutation] of mutations) {
              const node = $getNodeByKey<TypedMarkNode>(key);
              let typedIDs: TypedIDs = {};

              if (mutation === "destroyed") {
                typedIDs = markNodeKeysToTypedIDs.get(key) ?? {};
              } else if ($isTypedMarkNode(node)) {
                typedIDs = node.getTypedIDs();
              }

              for (const [type, ids] of Object.entries(typedIDs)) {
                // Skip reserved types as they will handle their own keys.
                if (TypedMarkNode.isReservedType(type)) continue;

                for (const id of ids) {
                  let markNodeKeys = markNodeMap.get(getTypeIDMapKey(type, id));
                  typedIDs[type] = ids;
                  markNodeKeysToTypedIDs.set(key, typedIDs);

                  if (mutation === "destroyed") {
                    if (markNodeKeys !== undefined) {
                      markNodeKeys.delete(key);
                      if (markNodeKeys.size === 0) {
                        markNodeMap.delete(getTypeIDMapKey(type, id));
                      }
                    }
                  } else {
                    if (markNodeKeys === undefined) {
                      markNodeKeys = new Set();
                      markNodeMap.set(getTypeIDMapKey(type, id), markNodeKeys);
                    }
                    if (!markNodeKeys.has(key)) {
                      markNodeKeys.add(key);
                    }
                  }
                }
              }
            }
          });
        },
        { skipInitialization: true },
      ),
    );
  }, [editor, markNodeMap]);
}

export const AnnotationPlugin = forwardRef(function AnnotationPlugin<TLogger extends LoggerBasic>(
  { logger }: { logger?: TLogger },
  ref: ForwardedRef<AnnotationRef>,
) {
  const [editor] = useLexicalComposerContext();
  const markNodeMap = useMemo<Map<string, Set<NodeKey>>>(() => {
    return new Map();
  }, []);
  useAnnotations(editor, markNodeMap);

  /**
   * Removes all mark nodes associated with the given type/id pair.
   *
   * @param type - Annotation type to remove.
   * @param id - Annotation ID to remove.
   */
  const $removeMarkNodesForTypeID = (type: string, id: string) => {
    const keys = Array.from(markNodeMap.get(getTypeIDMapKey(type, id)) ?? []);
    if (keys.length === 0) return;

    for (const key of keys) {
      const node: TypedMarkNode | null = $getNodeByKey(key);
      if ($isTypedMarkNode(node)) {
        node.deleteID(type, id);
        if (node.hasNoIDsForEveryType()) {
          $unwrapTypedMarkNode(node);
        }
      }
    }
  };

  const validateTypes = (refs: readonly AnnotationReference[], action: string, verb: string) => {
    for (const { type } of refs) {
      if (TypedMarkNode.isReservedType(type))
        throw new Error(
          `${action}: Can't directly ${verb} this reserved annotation type '${type}'.` +
            " Use the appropriate plugin instead.",
        );
    }
  };

  const updateAnnotations = ($update: () => void) => {
    // Flush any pending user edit before adding HISTORIC_TAG. Otherwise Lexical can batch that
    // edit with this update and discard it from history too. Commit this update discretely so
    // the next edit cannot inherit the tag, and the mark index is ready for a following removal.
    editor.read(() => undefined);
    editor.update($update, { tag: [ANNOTATION_CHANGE_TAG, HISTORIC_TAG], discrete: true });
  };

  const setAnnotations = (annotations: readonly Annotation[], action = "setAnnotations") => {
    if (annotations.length === 0) return;
    validateTypes(annotations, action, "set");
    // Resolve repeated identities before wrapping: the mutation listener indexes new marks only
    // after the batch commits. The last entry for a type/id is the requested final annotation.
    const byIdentity = new Map(
      annotations.map((annotation) => [
        getTypeIDMapKey(annotation.type, annotation.id),
        annotation,
      ]),
    );
    updateAnnotations(() => {
      for (const {
        selection,
        type,
        id,
        onClick,
        onRemove,
        onMouseEnter,
        onMouseLeave,
      } of byIdentity.values()) {
        // Apply the annotation to the selected range.
        const editorSelection = $getRangeFromUsjSelection(selection);
        if (editorSelection === undefined) {
          logger?.error("Failed to find start or end node of the annotation.");
          continue;
        }

        $removeMarkNodesForTypeID(type, id);

        $wrapSelectionInTypedMarkNode(
          editorSelection,
          type,
          id,
          onClick,
          onRemove,
          onMouseEnter,
          onMouseLeave,
        );
      }
    });
  };

  const removeAnnotations = (
    refs: readonly AnnotationReference[],
    action = "removeAnnotations",
  ) => {
    if (refs.length === 0) return;
    validateTypes(refs, action, "remove");
    updateAnnotations(() => {
      for (const { type, id } of refs) $removeMarkNodesForTypeID(type, id);
    });
  };

  useImperativeHandle(ref, () => ({
    setAnnotations,
    removeAnnotations,
    setAnnotation(selection, type, id, onClick, onRemove, onMouseEnter, onMouseLeave) {
      setAnnotations(
        [{ selection, type, id, onClick, onRemove, onMouseEnter, onMouseLeave }],
        "setAnnotation",
      );
    },
    removeAnnotation(type, id) {
      removeAnnotations([{ type, id }], "removeAnnotation");
    },
  }));

  return null;
});
