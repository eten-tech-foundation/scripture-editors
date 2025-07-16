import { $getNodeByKey, $getSelection, LexicalEditor, NodeKey } from "lexical";
import { GraftNode } from "../../nodes/GraftNode";
import { $findMatchingParent } from "@lexical/utils";

export function registerFocusableGrafts(
  editor: LexicalEditor,
  focusableGraftTypes: string[] = ["xref", "footnote"],
) {
  const $removeFocusedGrafts = () => {
    if (focusedGrafts.length === 0) return;
    editor.update(
      () => {
        focusedGrafts.forEach((focusedGraft) => {
          const node = $getNodeByKey<GraftNode>(focusedGraft);
          if (!node) return;
          node.removeUIAttribute("active");
        });
        focusedGrafts.length = 0;
      },
      { tag: "history-merge" },
    );
  };

  const focusedGrafts: NodeKey[] = [];
  editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection();
      const nodes = selection?.getNodes();
      if (nodes?.length !== 1) return;
      const graft = $findMatchingParent(
        nodes[0],
        (node): node is GraftNode =>
          node instanceof GraftNode &&
          focusableGraftTypes.includes(node.getAttributes()["perf-subtype"]),
      );
      if (!graft) {
        $removeFocusedGrafts();
        return;
      }
      if (focusedGrafts.includes(graft.getKey())) {
        return;
      }
      editor.update(
        () => {
          focusedGrafts.forEach((focusedGraft) => {
            try {
              const node = $getNodeByKey<GraftNode>(focusedGraft);
              if (!node) return;
              node.removeUIAttribute("active");
            } catch (e) {
              console.error(e);
            }
          });
          focusedGrafts.length = 0;
          graft.setUIAttribute("active", "true");
          focusedGrafts.push(graft.getKey());
        },
        { tag: "history-merge" },
      );
    });
  });
}
