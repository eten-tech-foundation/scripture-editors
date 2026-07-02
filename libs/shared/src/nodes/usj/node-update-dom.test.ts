import { $createTextNode, $getRoot } from "lexical";
import { describe, expect, it } from "vitest";
import { $createCharNode, CharNode } from "./CharNode.js";
import { $createChapterNode, ChapterNode } from "./ChapterNode.js";
import { $createNoteNode, NoteNode } from "./NoteNode.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createVerseNode, VerseNode } from "./VerseNode.js";

describe("updateDOM reconciliation for marker/number changes", () => {
  it("swaps the usfm_ class and data-marker on CharNode.setMarker", () => {
    let char: CharNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      char = $createCharNode("nd");
      $getRoot().append($createParaNode("p").append(char.append($createTextNode("Lord"))));
    });
    if (!char) throw new Error("Expected char node to exist");

    editor.update(() => char.setMarker("wj"), { discrete: true });

    const dom = editor.getElementByKey(char.getKey());
    if (!dom) throw new Error("Expected DOM element for char node");
    expect(dom.classList.contains("usfm_wj")).toBe(true);
    expect(dom.classList.contains("usfm_nd")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("wj");
  });

  it("swaps the usfm_ class and data-marker on NoteNode.setMarker", () => {
    let note: NoteNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      note = $createNoteNode("f", "+");
      $getRoot().append($createParaNode("p").append(note.append($createTextNode("content"))));
    });
    if (!note) throw new Error("Expected note node to exist");

    editor.update(() => note.setMarker("x"), { discrete: true });

    const dom = editor.getElementByKey(note.getKey());
    if (!dom) throw new Error("Expected DOM element for note node");
    expect(dom.classList.contains("usfm_x")).toBe(true);
    expect(dom.classList.contains("usfm_f")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("x");
  });

  it("refreshes data-number on ChapterNode.setNumber", () => {
    let chapter: ChapterNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      chapter = $createChapterNode("1");
      $getRoot().append(chapter.append($createTextNode("\\c 1 ")));
    });
    if (!chapter) throw new Error("Expected chapter node to exist");

    editor.update(() => chapter.setNumber("2"), { discrete: true });

    const dom = editor.getElementByKey(chapter.getKey());
    if (!dom) throw new Error("Expected DOM element for chapter node");
    expect(dom.getAttribute("data-number")).toBe("2");
  });

  it("refreshes data-number on VerseNode.setNumber", () => {
    let verse: VerseNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      verse = $createVerseNode("1", "\\v 1 ");
      $getRoot().append($createParaNode("p").append(verse));
    });
    if (!verse) throw new Error("Expected verse node to exist");

    editor.update(() => verse.setNumber("2"), { discrete: true });

    const dom = editor.getElementByKey(verse.getKey());
    if (!dom) throw new Error("Expected DOM element for verse node");
    expect(dom.getAttribute("data-number")).toBe("2");
  });
});
