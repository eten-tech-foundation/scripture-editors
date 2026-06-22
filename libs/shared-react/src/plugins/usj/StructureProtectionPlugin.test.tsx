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
  TextNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
} from "lexical";
import { $createParaNode, ParaNode } from "shared";

// NOTE: jsdom cannot drive collapsed mid-text deletes (domSelection.modify) or printable-char
// insertion via dispatchCommand, and IS_APPLE is false so Alt+Backspace is a no-op. Those cases
// (mid-text-allowed, Alt/Cmd+Backspace blocked, insertText-allowed, verse removal) are covered as
// deterministic unit tests in structureProtection.utils.test.ts. Behavior tests here cover only
// the jsdom-working paths: block-boundary merge and Enter split.
describe("StructureProtectionPlugin — keyboard", () => {
  it("blocks Backspace-at-start merge when protected", async () => {
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t2 = $createTextNode("second");
        $getRoot().append(
          $createParaNode("p").append($createTextNode("first")),
          $createParaNode("q").append(t2),
        );
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2); // unchanged
    });
  });

  it("allows Backspace-at-start merge when NOT protected", async () => {
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t2 = $createTextNode("second");
        $getRoot().append(
          $createParaNode("p").append($createTextNode("first")),
          $createParaNode("q").append(t2),
        );
      },
      <StructureProtectionPlugin isProtected={false} />,
    );
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // merged
    });
  });

  it("blocks Enter (paragraph split) when protected", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("abcdef");
        $getRoot().append($createParaNode("p").append(t1));
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
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
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2); // not merged/replaced
    });
  });

  it("allows controlled text insertion spanning a boundary when NOT protected", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={false} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // replaced/merged
    });
  });

  it("blocks insertion over a selection containing a verse marker when protected", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        para = $createParaNode("p");
        t1 = $createTextNode("text");
        $getRoot().append(para.append($createImmutableVerseNode("1"), t1));
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
    updateSelection(editor, para!, 0, t1!, 4);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      const firstBlock = $getRoot().getChildren()[0];
      const hasVerse =
        "getChildren" in firstBlock &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (firstBlock as any).getChildren().some((n: unknown) => n instanceof ImmutableVerseNode);
      expect(hasVerse).toBe(true); // verse marker survives
    });
  });

  it("consumes CUT over an unsafe selection when protected (low-priority spy not reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(CUT_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(CUT_COMMAND, null);
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler blocked propagation
  });

  it("does NOT consume CUT when not protected (low-priority spy reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={false} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => true); // claim handled so RichText's own cut does nothing
    const unregister = editor.registerCommand(CUT_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(CUT_COMMAND, null);
    });
    unregister();

    expect(spy).toHaveBeenCalled(); // plugin inert; propagation continued
  });

  it("consumes DRAGSTART over an unsafe selection when protected (low-priority spy not reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={true} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => false);
    const unregister = editor.registerCommand(DRAGSTART_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(DRAGSTART_COMMAND, null as unknown as DragEvent);
    });
    unregister();

    expect(spy).not.toHaveBeenCalled(); // HIGH handler blocked propagation
  });

  it("does NOT consume DRAGSTART when not protected (low-priority spy reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        t1 = $createTextNode("first");
        t2 = $createTextNode("second");
        $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
      },
      <StructureProtectionPlugin isProtected={false} />,
    );
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => true);
    const unregister = editor.registerCommand(DRAGSTART_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(DRAGSTART_COMMAND, null as unknown as DragEvent);
    });
    unregister();

    expect(spy).toHaveBeenCalled(); // plugin inert; propagation continued
  });
});
