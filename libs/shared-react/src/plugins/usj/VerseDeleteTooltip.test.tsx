/* eslint-disable @typescript-eslint/no-non-null-assertion */
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableVerseNode } from "../../nodes/usj";
import { StructureKeyboardPlugin } from "./StructureKeyboardPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { $createTextNode, $getRoot, TextNode } from "lexical";
import { $createParaNode } from "shared";

async function unprotected($init: () => void) {
  return baseTestEnvironment($init, <StructureKeyboardPlugin isStructureProtected={false} />);
}

describe("VerseDeleteTooltip", () => {
  it("shows a destructive status tooltip naming the confirming key when a verse is armed", async () => {
    let t1: TextNode;
    const { editor } = await unprotected(() => {
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append($createImmutableVerseNode("1"), t1));
    });
    updateSelection(editor, t1!, 0);

    await pressKey(editor, "Backspace", 0); // arm the verse marker

    const tip = document.body.querySelector(".verse-delete-tooltip");
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute("role")).toBe("status");
    expect(tip?.textContent).toContain("again to remove verse marker");
    expect(tip?.querySelector("kbd")?.textContent).toBe("Backspace");
  });

  it("shows 'delete selection' copy anchored to the verse when a range selection with a verse is armed", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await unprotected(() => {
      t1 = $createTextNode("ab");
      t2 = $createTextNode("cd");
      $getRoot().append($createParaNode("p").append(t1, $createImmutableVerseNode("2"), t2));
    });
    updateSelection(editor, t1!, 1, t2!, 1);

    await pressKey(editor, "Delete", 0); // arm the range selection

    const tip = document.body.querySelector(".verse-delete-tooltip");
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute("role")).toBe("status");
    expect(tip?.textContent).toContain("again to delete selection");
    expect(tip?.querySelector("kbd")?.textContent).toBe("Delete");
  });

  it("shows no tooltip when nothing is armed", async () => {
    const { editor } = await unprotected(() => {
      $getRoot().append(
        $createParaNode("p").append($createImmutableVerseNode("1"), $createTextNode("text")),
      );
    });
    expect(document.body.querySelector(".verse-delete-tooltip")).toBeNull();
    expect(editor.getRootElement()).not.toBeNull();
  });
});
