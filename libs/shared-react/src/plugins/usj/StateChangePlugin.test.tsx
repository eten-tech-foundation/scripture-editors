import { $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { usjBlockVerseNodes } from "../../nodes/usj";
import { baseTestEnvironment, updateSelection } from "./react-test.utils";
import { StateChangePlugin, StateChangeSnapshot } from "./StateChangePlugin";
import { $createTextNode, $getRoot, LexicalEditor, LexicalNode } from "lexical";
import { describe, expect, it, vi } from "vitest";
import {
  $createImmutableChapterNode,
  $createParaNode,
  $createVerseBlockNode,
  $isParaNode,
  $isVerseBlockNode,
} from "shared";

/** The paragraph marker the plugin most recently reported, or `undefined` if it never fired. */
function lastBlockMarker(onStateChange: ReturnType<typeof vi.fn>): string | undefined {
  const { calls } = onStateChange.mock;
  if (calls.length === 0) return undefined;

  return (calls[calls.length - 1][0] as StateChangeSnapshot).blockMarker;
}

/** Puts the caret in the chosen node and returns the marker the plugin reported for it. */
function reportedBlockMarkerAfterSelecting(
  editor: LexicalEditor,
  onStateChange: ReturnType<typeof vi.fn>,
  $getNodeToSelect: () => LexicalNode | null,
): string | undefined {
  const nodeToSelect = editor.getEditorState().read($getNodeToSelect);
  if (!nodeToSelect) throw new Error("expected a node to select");

  onStateChange.mockClear();
  updateSelection(editor, nodeToSelect);

  return lastBlockMarker(onStateChange);
}

/** The last text of the nth paragraph inside the verse block at `blockIndex` among root children. */
function $textInBlockPara(blockIndex: number, paraIndex: number): LexicalNode | null {
  const verseBlock = $getRoot().getChildren()[blockIndex];
  if (!$isVerseBlockNode(verseBlock)) throw new Error("expected a verse block");
  const para = verseBlock.getChildren()[paraIndex];
  if (!$isParaNode(para)) throw new Error("expected a para");

  return para.getLastChild();
}

/** A psalm verse whose two poetry lines are separate paragraphs inside one verse block. */
function $appendPoetryVerseBlock() {
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createVerseBlockNode("1").append(
      $createParaNode("q1").append(
        $createImmutableVerseNode("1"),
        $createTextNode("Blessed is the one "),
      ),
      $createParaNode("q2").append($createTextNode("who walks not in step ")),
    ),
  );
}

describe("StateChangePlugin block marker", () => {
  // The host's marker UI is driven by this callback. The plugin resolves the caret's top-level
  // element, which in the block verse layout is the verse block - and a verse block carries no
  // marker, so without resolving through it the callback never fires and the host's marker freezes
  // on whatever it last saw.
  it("reports the paragraph marker for a caret inside a verse block", async () => {
    const onStateChange = vi.fn();
    const { editor } = await baseTestEnvironment(
      $appendPoetryVerseBlock,
      <StateChangePlugin onStateChange={onStateChange} />,
      usjBlockVerseNodes,
    );

    const blockMarker = reportedBlockMarkerAfterSelecting(editor, onStateChange, () =>
      $textInBlockPara(1, 0),
    );

    expect(blockMarker).toBe("q1");
  });

  // Poetry lines are separate paragraphs within the one block, so the marker has to track which of
  // them holds the caret rather than reporting the block's first.
  it("reports the second paragraph's marker for a caret in the same block", async () => {
    const onStateChange = vi.fn();
    const { editor } = await baseTestEnvironment(
      $appendPoetryVerseBlock,
      <StateChangePlugin onStateChange={onStateChange} />,
      usjBlockVerseNodes,
    );

    const blockMarker = reportedBlockMarkerAfterSelecting(editor, onStateChange, () =>
      $textInBlockPara(1, 1),
    );

    expect(blockMarker).toBe("q2");
  });

  // Control: the inline layouts must behave exactly as before, since the paragraph is top-level
  // there and never goes through the verse-block resolution.
  it("reports the paragraph marker for a caret in an inline paragraph", async () => {
    const onStateChange = vi.fn();
    const { editor } = await baseTestEnvironment(
      () => {
        $getRoot().append(
          $createParaNode("p").append(
            $createImmutableVerseNode("1"),
            $createTextNode("the first verse "),
          ),
        );
      },
      <StateChangePlugin onStateChange={onStateChange} />,
    );

    const blockMarker = reportedBlockMarkerAfterSelecting(editor, onStateChange, () => {
      const para = $getRoot().getChildren()[0];
      if (!$isParaNode(para)) throw new Error("expected a para");

      return para.getLastChild();
    });

    expect(blockMarker).toBe("p");
  });
});
