import { describe, expect, it } from "vitest";
import { createEditor, $getRoot, $createTextNode, $getSelection } from "lexical";
import { $createParaNode, $createVerseNode, ParaNode, VerseNode } from "shared";
import { $createImmutableVerseNode, ImmutableVerseNode } from "shared-react";
import {
  $isParaBodyEmpty,
  $getVerseParaFromSelection,
  $getActiveVerseSiblings,
} from "./ActiveTextPlugin";

function makeEditor() {
  return createEditor({
    nodes: [ParaNode, VerseNode, ImmutableVerseNode],
    onError: (err) => {
      throw err;
    },
  });
}

describe("$isParaBodyEmpty", () => {
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
          result = $isParaBodyEmpty(para);
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
          result = $isParaBodyEmpty(para);
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
          result = $isParaBodyEmpty(para);
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result).toBe(true);
  });

  it("returns true when para has only an ImmutableVerseNode", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result = false;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          para.append($createImmutableVerseNode("1"));
          $getRoot().append(para);
          result = $isParaBodyEmpty(para);
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

  it("returns the paragraph when cursor is in a non-verse para (e.g. \\s heading)", async () => {
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

    expect(result).not.toBeNull();
  });
});

describe("$getActiveVerseSiblings", () => {
  it("returns (null, null) for a null selection", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: "sentinel",
      nextVerseKey: "sentinel",
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const para = $createParaNode("p");
          para.append($createVerseNode("1"), $createTextNode("text"));
          $getRoot().append(para);
          result = $getActiveVerseSiblings(para, null);
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBeNull();
    expect(result.nextVerseKey).toBeNull();
  });

  it("returns the verse key and null for a single-verse paragraph", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let verseKey = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const verse = $createVerseNode("1");
          const text = $createTextNode("In the beginning");
          const para = $createParaNode("p");
          para.append(verse, text);
          $getRoot().append(para);
          verseKey = verse.getKey();
          text.select();
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBe(verseKey);
    expect(result.nextVerseKey).toBeNull();
  });

  it("returns (verse1Key, verse2Key) when cursor is in the first verse section", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let verse1Key = "";
    let verse2Key = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const v1 = $createVerseNode("1");
          const t1 = $createTextNode("text one");
          const v2 = $createVerseNode("2");
          const t2 = $createTextNode("text two");
          const para = $createParaNode("p");
          para.append(v1, t1, v2, t2);
          $getRoot().append(para);
          verse1Key = v1.getKey();
          verse2Key = v2.getKey();
          t1.select(); // cursor in verse 1 section
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBe(verse1Key);
    expect(result.nextVerseKey).toBe(verse2Key);
  });

  it("returns (verse2Key, verse3Key) when cursor is in the middle verse section", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let verse2Key = "";
    let verse3Key = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const v1 = $createVerseNode("1");
          const t1 = $createTextNode("text one");
          const v2 = $createVerseNode("2");
          const t2 = $createTextNode("text two");
          const v3 = $createVerseNode("3");
          const t3 = $createTextNode("text three");
          const para = $createParaNode("p");
          para.append(v1, t1, v2, t2, v3, t3);
          $getRoot().append(para);
          verse2Key = v2.getKey();
          verse3Key = v3.getKey();
          t2.select(); // cursor in verse 2 section
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBe(verse2Key);
    expect(result.nextVerseKey).toBe(verse3Key);
  });

  it("returns (lastVerseKey, null) when cursor is in the last verse section", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let verse2Key = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const v1 = $createVerseNode("1");
          const t1 = $createTextNode("text one");
          const v2 = $createVerseNode("2");
          const t2 = $createTextNode("text two");
          const para = $createParaNode("p");
          para.append(v1, t1, v2, t2);
          $getRoot().append(para);
          verse2Key = v2.getKey();
          t2.select(); // cursor in last verse section
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBe(verse2Key);
    expect(result.nextVerseKey).toBeNull();
  });

  it("returns (null, verse1Key) when cursor is before the first verse", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let verse1Key = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const intro = $createTextNode("intro");
          const v1 = $createVerseNode("1");
          const t1 = $createTextNode("text one");
          const para = $createParaNode("p");
          para.append(intro, v1, t1);
          $getRoot().append(para);
          verse1Key = v1.getKey();
          intro.select(); // cursor before any verse
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBeNull();
    expect(result.nextVerseKey).toBe(verse1Key);
  });

  it("returns (null, null) for a paragraph with no verse nodes", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: "sentinel",
      nextVerseKey: "sentinel",
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const text = $createTextNode("continuation line");
          const para = $createParaNode("q2");
          para.append(text);
          $getRoot().append(para);
          text.select();
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBeNull();
    expect(result.nextVerseKey).toBeNull();
  });

  it("works with ImmutableVerseNode as well as VerseNode", async () => {
    const editor = makeEditor();
    editor.setRootElement(document.createElement("div"));

    let v1Key = "";
    let v2Key = "";
    let result: ReturnType<typeof $getActiveVerseSiblings> = {
      activeVerseKey: null,
      nextVerseKey: null,
    };
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const v1 = $createImmutableVerseNode("1");
          const t1 = $createTextNode("text one");
          const v2 = $createImmutableVerseNode("2");
          const t2 = $createTextNode("text two");
          const para = $createParaNode("p");
          para.append(v1, t1, v2, t2);
          $getRoot().append(para);
          v1Key = v1.getKey();
          v2Key = v2.getKey();
          t1.select();
          result = $getActiveVerseSiblings(para, $getSelection());
        },
        { onUpdate: resolve, discrete: true },
      );
    });

    expect(result.activeVerseKey).toBe(v1Key);
    expect(result.nextVerseKey).toBe(v2Key);
  });
});
