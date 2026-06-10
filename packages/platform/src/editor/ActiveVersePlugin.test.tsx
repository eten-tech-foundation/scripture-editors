import { describe, expect, it } from "vitest";
import { createEditor, $getRoot, $createTextNode, $getSelection } from "lexical";
import { $createParaNode, $createVerseNode, ParaNode, VerseNode } from "shared";
import { $isVerseParaEmpty, $getVerseParaFromSelection } from "./ActiveVersePlugin";

function makeEditor() {
  return createEditor({
    nodes: [ParaNode, VerseNode],
    onError: (err) => {
      throw err;
    },
  });
}

describe("$isVerseParaEmpty", () => {
  it("returns true when para has only a verse node", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result = false;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          para.append($createVerseNode("1"));
          $getRoot().append(para);
          result = $isVerseParaEmpty(para);
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).toBe(true);
  });

  it("returns false when para has a verse node and text", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result = false;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          para.append($createVerseNode("1"), $createTextNode("In the beginning"));
          $getRoot().append(para);
          result = $isVerseParaEmpty(para);
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).toBe(false);
  });

  it("returns true when para has a verse node followed by whitespace only", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result = false;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          para.append($createVerseNode("1"), $createTextNode("   "));
          $getRoot().append(para);
          result = $isVerseParaEmpty(para);
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).toBe(true);
  });
});

describe("$getVerseParaFromSelection", () => {
  it("returns null for a null selection", () => {
    expect($getVerseParaFromSelection(null)).toBeNull();
  });

  it("returns the para when cursor is inside a verse para", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result: ReturnType<typeof $getVerseParaFromSelection> = null;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          const textNode = $createTextNode("Hello world");
          para.append($createVerseNode("1"), textNode);
          $getRoot().append(para);
          textNode.select();
          result = $getVerseParaFromSelection($getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).not.toBeNull();
  });

  it("returns null when cursor is in a non-verse para", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result: ReturnType<typeof $getVerseParaFromSelection> = undefined as unknown as ReturnType<
      typeof $getVerseParaFromSelection
    >;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("s");
          const textNode = $createTextNode("Heading");
          para.append(textNode);
          $getRoot().append(para);
          textNode.select();
          result = $getVerseParaFromSelection($getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).toBeNull();
  });
});
