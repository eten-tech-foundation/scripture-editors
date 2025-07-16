import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isElementNode, LexicalNode } from "lexical";
import { useEffect } from "react";
import { $isUsfmElementNode, UsfmElementNode } from "shared/nodes/UsfmElementNode";
import { ScriptureReference } from "shared/utils/get-marker-action.model";

//TODO: move plugin functions to vanilla javascript plugin
const getNodeDepth = (node: LexicalNode) => {
  let currNode: LexicalNode | null = node;
  let depth = 0;
  while (currNode) {
    currNode = currNode.getParent();
    if (currNode) depth++;
  }
  return depth;
};
const getPrevAncestorNode = (node: LexicalNode): LexicalNode | null => {
  const parent = node.getParent();
  if (!parent) return null;
  return parent.getPreviousSibling() ?? getPrevAncestorNode(parent);
};

/** Get a node that is either an older sibling of startNode or its older relative */
const findNodeInTree = (
  startNode: LexicalNode,
  matchFunction: (node: LexicalNode) => boolean,
  targetDepth?: number,
): LexicalNode | null => {
  let currentNode: LexicalNode | null = startNode;
  while (currentNode) {
    const currentDepth = getNodeDepth(currentNode);
    // Check if the current node matches at the target depth (if specified)
    if ((!targetDepth || currentDepth === targetDepth) && matchFunction(currentNode)) {
      return currentNode;
    }

    if (targetDepth && currentDepth > targetDepth) {
      currentNode = currentNode.getParent();
      continue;
    }

    if (targetDepth && currentDepth < targetDepth) {
      if ($isElementNode(currentNode)) {
        const childrenNodes = currentNode.getChildren();
        if (childrenNodes.length) {
          currentNode = childrenNodes[childrenNodes.length - 1];
          continue;
        }
      }

      currentNode = currentNode.getPreviousSibling() || getPrevAncestorNode(currentNode);

      continue;
    }

    // Check previous siblings and their descendants
    let sibling = currentNode.getPreviousSibling();
    while (sibling) {
      if (matchFunction(sibling)) return sibling;
      sibling = sibling.getPreviousSibling();
    }

    // Move up to the parent
    const parent: LexicalNode | null = currentNode.getParent();

    // If there's no parent, we've reached the root, so stop the search
    if (!parent) break;

    currentNode = getPrevAncestorNode(currentNode);
  }

  return null;
};

export function $getCurrentChapterNode(selectedNode: LexicalNode) {
  const chapterNode = findNodeInTree(
    selectedNode,
    (node: LexicalNode) => {
      if ($isUsfmElementNode(node) && node.getAttribute("data-marker") === "c") {
        return true;
      }
      return false;
    },
    2,
  ) as UsfmElementNode | null;
  return chapterNode ?? null;
}

export function $getCurrentVerseNode(selectedNode: LexicalNode) {
  const verseNode = findNodeInTree(
    selectedNode,
    (node: LexicalNode) => {
      if ($isUsfmElementNode(node) && node.getAttribute("data-marker") === "v") {
        return true;
      }
      return false;
    },
    2,
  ) as UsfmElementNode | null;
  return verseNode ?? null;
}

export default function ScriptureReferencePlugin({
  book,
  onChangeReference,
}: {
  book?: string;
  onChangeReference?: (reference: ScriptureReference) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      onChangeReference &&
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyLeaves.size === 0 || dirtyElements.size === 0)
          editorState.read(() => {
            const selectedNode = $getSelection()?.getNodes()?.[0];
            if (!selectedNode) return;
            const verseNode = $getCurrentVerseNode(selectedNode);
            const chapterNode = $getCurrentChapterNode(verseNode ?? selectedNode);
            const verse = verseNode?.getAttribute("data-number");
            const verseNum = parseInt(verse ?? "0", 10);
            const reference: ScriptureReference = {
              book: book ?? "",
              chapterNum: parseInt(chapterNode?.getAttribute("data-number") ?? "1", 10),
              verseNum,
            };
            if (verse != null && verseNum.toString() !== verse) reference.verse = verse;
            onChangeReference(reference);
          });
      }),
    [book, editor, onChangeReference],
  );

  return null;
}
