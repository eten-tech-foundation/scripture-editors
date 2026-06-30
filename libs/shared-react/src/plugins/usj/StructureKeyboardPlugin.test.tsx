// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj";
import { StructureKeyboardPlugin } from "./StructureKeyboardPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $createTextNode,
  $getSelection,
  $isNodeSelection,
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
describe("StructureKeyboardPlugin — keyboard", () => {
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

describe("StructureKeyboardPlugin — non-keydown vectors", () => {
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

describe("StructureKeyboardPlugin — paste/drop payload sanitization", () => {
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

describe("StructureKeyboardPlugin — two-step delete (unprotected)", () => {
  it("verse Backspace: first press node-selects the verse, second press removes it", async () => {
    let verse: ImmutableVerseNode;
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append(verse, t1));
    });
    updateSelection(editor, t1!, 0);

    await pressKey(editor, "Backspace", 0);
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      expect($isNodeSelection(sel)).toBe(true);
      expect(sel!.getNodes().some((n) => n instanceof ImmutableVerseNode)).toBe(true);
      // not yet deleted
      const para = $getRoot().getChildren()[0];
      const hasVerse =
        "getChildren" in para &&
        (para as ParaNode).getChildren().some((n) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(true);
    });

    await pressKey(editor, "Backspace", 0);
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[0] as ParaNode;
      expect(para.getChildren().some((n) => n instanceof ImmutableVerseNode)).toBe(false);
      expect(para.getTextContent()).toBe("text");
    });
  });

  it("verse Delete (forward): first press selects, second removes the following verse", async () => {
    let verse: ImmutableVerseNode;
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      t1 = $createTextNode("text");
      verse = $createImmutableVerseNode("2");
      $getRoot().append($createParaNode("p").append(t1, verse));
    });
    updateSelection(editor, t1!, 4);

    await pressKey(editor, "Delete", 0);
    editor.getEditorState().read(() => {
      expect($isNodeSelection($getSelection())).toBe(true);
    });

    await pressKey(editor, "Delete", 0);
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[0] as ParaNode;
      expect(para.getChildren().some((n) => n instanceof ImmutableVerseNode)).toBe(false);
    });
  });

  it("paragraph Backspace at start: first press selects the block, second merges into previous", async () => {
    let q: ParaNode;
    let t2: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      q = $createParaNode("q");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append($createTextNode("first")), q.append(t2));
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      expect(sel && !$isNodeSelection(sel) && !sel.isCollapsed()).toBe(true);
      expect($getRoot().getChildrenSize()).toBe(2); // not yet merged
    });

    await pressKey(editor, "Backspace", 0);
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
      const merged = $getRoot().getChildren()[0] as ParaNode;
      expect(merged.getMarker()).toBe("p");
      expect(merged.getTextContent()).toBe("firstsecond");
    });
  });

  it("paragraph Delete at end: first press selects the next block, second merges it up", async () => {
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append(
        $createParaNode("p").append(t1),
        $createParaNode("q").append($createTextNode("second")),
      );
    });
    updateSelection(editor, t1!, 5);

    await pressKey(editor, "Delete", 0);
    await pressKey(editor, "Delete", 0);
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
      expect(($getRoot().getChildren()[0] as ParaNode).getTextContent()).toBe("firstsecond");
    });
  });

  it("mid-text Backspace does nothing structural (handler returns false)", async () => {
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);

    // jsdom does not implement domSelection.modify, so the RichText plugin's deleteCharacter
    // call throws when it falls through after the plugin returns false. Catch the jsdom error
    // and verify our plugin did NOT arm (no NodeSelection, no block select).
    try {
      await pressKey(editor, "Backspace", 0);
    } catch (e) {
      // jsdom does not implement domSelection.modify; the RichText fallthrough throws when the
      // handler returns false and Lexical attempts a native collapsed delete. Anything else is real.
      if (!(e instanceof Error) || !e.message.includes("domSelection.modify")) throw e;
    }
    editor.getEditorState().read(() => {
      // No arm: selection stays a collapsed range caret (no NodeSelection, no block select).
      const sel = $getSelection();
      expect($isNodeSelection(sel)).toBe(false);
      expect(sel && !sel.isCollapsed()).toBe(false);
    });
  });
});

describe("StructureKeyboardPlugin — two-step delete guards", () => {
  it("latch resets when the caret moves between presses (no delete)", async () => {
    let verse: ImmutableVerseNode;
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append(verse, t1));
    });
    updateSelection(editor, t1!, 0);

    await pressKey(editor, "Backspace", 0); // arm
    updateSelection(editor, t1!, 2); // move caret away → latch clears
    // Second Backspace is now mid-text (latch cleared) → plugin returns false → native delete →
    // jsdom throws because domSelection.modify is not implemented.
    try {
      await pressKey(editor, "Backspace", 0); // should NOT fire the armed delete
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("domSelection.modify")) throw e;
    }

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[0] as ParaNode;
      expect(para.getChildren().some((n) => n instanceof ImmutableVerseNode)).toBe(true);
    });
  });

  it("mismatched direction cancels without deleting", async () => {
    let verse: ImmutableVerseNode;
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append(verse, t1));
    });
    updateSelection(editor, t1!, 0);

    await pressKey(editor, "Backspace", 0); // arm backward
    // Mismatched direction: plugin handles this (preventDefault, returns true), no native path hit.
    await pressKey(editor, "Delete", 0); // forward → cancel, no delete

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[0] as ParaNode;
      expect(para.getChildren().some((n) => n instanceof ImmutableVerseNode)).toBe(true);
    });
  });

  it("no-neighbor paragraph boundary does not arm (first para start)", async () => {
    let t1: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0);

    // No previous para to arm against → plugin returns false → native delete → jsdom may throw.
    try {
      await pressKey(editor, "Backspace", 0);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("domSelection.modify")) throw e;
    }
    editor.getEditorState().read(() => {
      expect($isNodeSelection($getSelection())).toBe(false);
      expect($getRoot().getChildrenSize()).toBe(1);
    });
  });

  it("protected mode never runs the two-step path (boundary delete is blocked)", async () => {
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createParaNode("q").append(t2),
      );
    });
    updateSelection(editor, t2!, 0);

    // Protected mode: plugin blocks this (preventDefault, returns true) — no native path hit.
    await pressKey(editor, "Backspace", 0);
    editor.getEditorState().read(() => {
      // Blocked, not armed: still two paragraphs, selection stays a collapsed caret.
      expect($getRoot().getChildrenSize()).toBe(2);
      expect($isNodeSelection($getSelection())).toBe(false);
    });
  });

  it("manual whole-paragraph selection + Backspace is NOT hijacked into a merge", async () => {
    let q: ParaNode;
    let t2: TextNode;
    const { editor } = await unprotectedEnvironment(() => {
      q = $createParaNode("q");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append($createTextNode("first")), q.append(t2));
    });
    // User selects the whole second paragraph by hand (latch is empty).
    updateSelection(editor, t2!, 0, t2!, 6);

    // No latch → plugin's FIRE branch is skipped; ARM requires collapsed selection → also skipped.
    // Plugin returns false → native range delete → jsdom does not implement this either → may throw.
    try {
      await pressKey(editor, "Backspace", 0);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("domSelection.modify")) throw e;
    }
    editor.getEditorState().read(() => {
      // With no latch, the handler does not treat this as an armed merge; both paras remain
      // (jsdom does not perform the native range delete, so structure is unchanged here —
      // the point is that OUR merge did not run and "first" was not joined with leftover text).
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);
      expect((root.getChildren()[0] as ParaNode).getTextContent()).toBe("first");
    });
  });
});

async function testEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <StructureKeyboardPlugin isStructureProtected={true} />,
  );
}

async function unprotectedEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <StructureKeyboardPlugin isStructureProtected={false} />,
  );
}
