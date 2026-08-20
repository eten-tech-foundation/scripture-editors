import { $createTextNode, $getRoot, createEditor, EditorThemeClasses } from "lexical";
import { describe, expect, it } from "vitest";
import { $createCharNode, CharNode } from "./CharNode.js";
import { $createChapterNode, ChapterNode } from "./ChapterNode.js";
import { usjBaseNodes } from "./index.js";
import { $createNoteNode, NoteNode } from "./NoteNode.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createVerseNode, VerseNode } from "./VerseNode.js";

/** Like `createBasicTestEnvironment` but with an editor theme, which node DOM methods read. */
function createThemedTestEnvironment(theme: EditorThemeClasses, $initialEditorState: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const editor = createEditor({
    namespace: "TestEditor",
    theme,
    onError(error) {
      throw error;
    },
    nodes: usjBaseNodes,
  });
  editor.setRootElement(container);
  editor.update($initialEditorState, { discrete: true });
  return { editor };
}

describe("updateDOM reconciliation for marker/number changes", () => {
  it("swaps the usfm_ class and data-marker on CharNode.setMarker", () => {
    let char: CharNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      char = $createCharNode("nd");
      $getRoot().append($createParaNode("p").append(char.append($createTextNode("Lord"))));
    });
    if (!char) throw new Error("Expected char node to exist");
    const charNode = char;

    editor.update(() => charNode.setMarker("wj"), { discrete: true });

    const dom = editor.getElementByKey(charNode.getKey());
    if (!dom) throw new Error("Expected DOM element for char node");
    expect(dom.classList.contains("usfm_wj")).toBe(true);
    expect(dom.classList.contains("usfm_nd")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("wj");
  });

  it("syncs the title attribute to the new marker on CharNode.setMarker by default", () => {
    let char: CharNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      char = $createCharNode("nd");
      $getRoot().append($createParaNode("p").append(char.append($createTextNode("Lord"))));
    });
    if (!char) throw new Error("Expected char node to exist");
    const charNode = char;
    const dom = editor.getElementByKey(charNode.getKey());
    if (!dom) throw new Error("Expected DOM element for char node");
    expect(dom.getAttribute("title")).toBe("nd");

    editor.update(() => charNode.setMarker("wj"), { discrete: true });

    expect(dom.getAttribute("title")).toBe("wj");
  });

  it("removes the title attribute on CharNode.setMarker when showCharMarkerTitles is false", () => {
    let char: CharNode | undefined;
    const { editor } = createThemedTestEnvironment({ showCharMarkerTitles: false }, () => {
      char = $createCharNode("nd");
      $getRoot().append($createParaNode("p").append(char.append($createTextNode("Lord"))));
    });
    if (!char) throw new Error("Expected char node to exist");
    const charNode = char;
    const dom = editor.getElementByKey(charNode.getKey());
    if (!dom) throw new Error("Expected DOM element for char node");
    expect(dom.hasAttribute("title")).toBe(false);
    // A stale title can sit on the reused element (e.g. markup produced while titles were
    // enabled); the marker-change reconciliation must clear it rather than update it.
    dom.setAttribute("title", "nd");

    editor.update(() => charNode.setMarker("wj"), { discrete: true });

    expect(dom.hasAttribute("title")).toBe(false);
    // Control: the marker-change reconciliation itself ran on this element.
    expect(dom.getAttribute("data-marker")).toBe("wj");
  });

  it("swaps the usfm_ class and data-marker on NoteNode.setMarker", () => {
    let note: NoteNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      note = $createNoteNode("f", "+");
      $getRoot().append($createParaNode("p").append(note.append($createTextNode("content"))));
    });
    if (!note) throw new Error("Expected note node to exist");
    const noteNode = note;

    editor.update(() => noteNode.setMarker("x"), { discrete: true });

    const dom = editor.getElementByKey(noteNode.getKey());
    if (!dom) throw new Error("Expected DOM element for note node");
    expect(dom.classList.contains("usfm_x")).toBe(true);
    expect(dom.classList.contains("usfm_f")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("x");
  });

  it("refreshes data-caller on NoteNode.setCaller without replacing the element", () => {
    let note: NoteNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      note = $createNoteNode("f", "+");
      $getRoot().append($createParaNode("p").append(note.append($createTextNode("content"))));
    });
    if (!note) throw new Error("Expected note node to exist");
    const noteNode = note;
    const domBefore = editor.getElementByKey(noteNode.getKey());
    if (!domBefore) throw new Error("Expected DOM element for note node");
    expect(domBefore.getAttribute("data-caller")).toBe("+");

    editor.update(() => noteNode.setCaller("a"), { discrete: true });

    const domAfter = editor.getElementByKey(noteNode.getKey());
    if (!domAfter) throw new Error("Expected DOM element for note node");
    // A caller-only change reconciles the attribute in place; only a collapse toggle rebuilds
    // the element from createDOM.
    expect(domAfter).toBe(domBefore);
    expect(domAfter.getAttribute("data-caller")).toBe("a");
  });

  it("refreshes data-number on ChapterNode.setNumber", () => {
    let chapter: ChapterNode | undefined;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      chapter = $createChapterNode("1");
      $getRoot().append(chapter.append($createTextNode("\\c 1 ")));
    });
    if (!chapter) throw new Error("Expected chapter node to exist");
    const chapterNode = chapter;

    editor.update(() => chapterNode.setNumber("2"), { discrete: true });

    const dom = editor.getElementByKey(chapterNode.getKey());
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
    const verseNode = verse;

    editor.update(() => verseNode.setNumber("2"), { discrete: true });

    const dom = editor.getElementByKey(verseNode.getKey());
    if (!dom) throw new Error("Expected DOM element for verse node");
    expect(dom.getAttribute("data-number")).toBe("2");
  });
});
