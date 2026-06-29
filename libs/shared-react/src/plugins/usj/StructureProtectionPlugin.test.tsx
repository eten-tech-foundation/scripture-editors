// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj";
import { StructureProtectionPlugin } from "./StructureProtectionPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $createTextNode,
  $setSelection,
  LexicalNode,
  TextNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { $createParaNode, $isParaNode, ParaNode } from "shared";

// NOTE: jsdom cannot drive collapsed mid-text deletes (domSelection.modify) or printable-char
// insertion via dispatchCommand, and IS_APPLE is false so Alt+Backspace is a no-op. Those cases
// (mid-text-allowed, Alt/Cmd+Backspace blocked, insertText-allowed, verse removal) are covered as
// deterministic unit tests in structureProtection.utils.test.ts. Behavior tests here cover only
// the jsdom-working paths: block-boundary merge and Enter split.
describe("StructureProtectionPlugin — keyboard", () => {
  it("blocks Backspace-at-start merge when protected", async () => {
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createParaNode("q").append(t2),
      );
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2); // unchanged
    });
  });

  it("blocks Enter (paragraph split) when protected", async () => {
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);

    await pressKey(editor, "Enter", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // not split
    });
  });
});

describe("StructureProtectionPlugin — non-keydown vectors", () => {
  it("blocks controlled text insertion over a selection spanning a block boundary when protected", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2); // not merged/replaced
    });
  });

  it("blocks insertion over a selection containing a verse marker when protected", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("text");
      $getRoot().append(para.append($createImmutableVerseNode("1"), t1));
    });
    updateSelection(editor, para!, 0, t1!, 4);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      const firstBlock = $getRoot().getChildren()[0];
      if (!$isParaNode(firstBlock)) throw new Error("Expected a ParaNode");
      const hasVerse = firstBlock
        .getChildren()
        .some((n: LexicalNode) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(true); // verse marker survives
    });
  });

  it("consumes CUT over an unsafe selection when protected (low-priority spy not reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(CUT_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(CUT_COMMAND, null);
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler blocked propagation
  });

  it("consumes DRAGSTART over an unsafe selection when protected (low-priority spy not reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(DRAGSTART_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(DRAGSTART_COMMAND, null as unknown as DragEvent);
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler blocked propagation
  });
});

function htmlPasteEvent(html: string, plain = ""): ClipboardEvent {
  return {
    clipboardData: { getData: (type: string) => (type === "text/html" ? html : plain) },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

function htmlDropEvent(html: string, plain = ""): DragEvent {
  return {
    dataTransfer: { getData: (type: string) => (type === "text/html" ? html : plain) },
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

const VERSE_HTML =
  '<p data-marker="p" class="para">' +
  '<span data-marker="v" data-number="2" class="verse">2</span>pasted</p>';

describe("StructureProtectionPlugin — paste/drop payload sanitization", () => {
  it("strips a verse marker from pasted HTML, inserting text only, when protected", async () => {
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("hello world");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 5);

    await act(async () => {
      editor.update(() => {
        editor.dispatchCommand(PASTE_COMMAND, htmlPasteEvent(VERSE_HTML));
      });
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // no new paragraph
      const para = $getRoot().getChildren()[0];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const hasVerse = para.getChildren().some((n: LexicalNode) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(false); // verse marker stripped
      expect($getRoot().getTextContent()).toContain("pasted"); // text kept
    });
  });

  it("strips a verse marker from dropped HTML, inserting text only, when protected", async () => {
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("hello world");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 5);

    await act(async () => {
      editor.update(() => {
        editor.dispatchCommand(DROP_COMMAND, htmlDropEvent(VERSE_HTML));
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[0];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const hasVerse = para.getChildren().some((n: LexicalNode) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(false);
      expect($getRoot().getTextContent()).toContain("pasted");
    });
  });

  it("lets a plain-text-only paste pass through to the default handler when protected", async () => {
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("hello world");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 5);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(PASTE_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, htmlPasteEvent("", "plain text"));
    });
    unregister();

    expect(spy).toHaveBeenCalled(); // our handler returned false; default reached
  });

  it("consumes paste when there is no range selection, inserting nothing (structure-safe silent drop)", async () => {
    let t1: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("hello world");
      $getRoot().append($createParaNode("p").append(t1));
    });

    // Clear selection so $getSelection() returns null inside the command handler,
    // exercising the !$isRangeSelection branch in $sanitizeAndInsert.
    await act(async () => {
      editor.update(() => $setSelection(null), { discrete: true });
    });

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(PASTE_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.update(() => {
        editor.dispatchCommand(PASTE_COMMAND, htmlPasteEvent(VERSE_HTML));
      });
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler consumed the command
    editor.getEditorState().read(() => {
      // No verse node inserted and document text unchanged
      const para = $getRoot().getChildren()[0];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const hasVerse = para.getChildren().some((n: LexicalNode) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(false);
      expect($getRoot().getTextContent()).not.toContain("pasted");
    });
  });

  it("still hard-blocks paste over a selection spanning a block boundary when protected", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(PASTE_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, htmlPasteEvent(VERSE_HTML));
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler consumed it
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2); // unchanged
    });
  });
});

async function testEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <StructureProtectionPlugin isStructureProtected={true} />,
  );
}
