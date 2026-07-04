/**
 * §5.5 marker-menu context — selection-derived snapshot feeding the `\`/Enter marker
 * menus. Port of PT9's `MarkerDropdownEditHandler.HandleBackslash` selection-shape rule
 * (`MarkerDropdownEditHandler.cs:96-139`), adapted to the Lexical tree (Task 2).
 */
import { $getMarkerMenuContext } from "./markerMenuContext.utils";
import {
  $noteContentText,
  findOnlyNote,
  renderStandardEditorWithUnclosedNote,
  testEnvironment,
} from "../markerEdit/markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $setState, TextNode } from "lexical";
import {
  $createBookNode,
  $createChapterNode,
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  textTypeState,
} from "shared";

describe("$getMarkerMenuContext", () => {
  it("returns undefined when there is no range selection", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode("text")),
      );
    });

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context).toBeUndefined();
  });

  it("reports paragraph source and previousParaMarkers for a caret at a paragraph's content start in a [id, c, p, q1] doc", async () => {
    let qContent: TextNode;
    const { editor } = await testEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      const chapterText = $createTextNode(getVisibleOpenMarkerText("c", "1"));
      const pPara = $createParaNode("p");
      const pPrefix = $createMarkerNode("p");
      const pTrailing = $createTextNode(NBSP);
      $setState(pTrailing, textTypeState, "marker-trailing-space");
      const qPara = $createParaNode("q1");
      const qPrefix = $createMarkerNode("q1");
      const qTrailing = $createTextNode(NBSP);
      $setState(qTrailing, textTypeState, "marker-trailing-space");
      qContent = $createTextNode("Blessed");
      $getRoot().append(
        book,
        chapter.append(chapterText),
        pPara.append(pPrefix, pTrailing, $createTextNode("Text of p")),
        qPara.append(qPrefix, qTrailing, qContent),
      );
    });

    await act(async () => editor.update(() => qContent.select(0, 0)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.source).toBe("paragraph");
    expect(context?.paraMarker).toBe("q1");
    expect(context?.previousParaMarkers).toEqual(["id", "c", "p"]);
    // jsdom's Range has no getBoundingClientRect - the documented headless fallback.
    expect(context?.anchorRect).toBeUndefined();
  });

  it("reports character source for a mid-text caret", async () => {
    let qContent: TextNode;
    const { editor } = await testEnvironment(() => {
      const qPara = $createParaNode("q1");
      const qPrefix = $createMarkerNode("q1");
      const qTrailing = $createTextNode(NBSP);
      $setState(qTrailing, textTypeState, "marker-trailing-space");
      qContent = $createTextNode("Blessed");
      $getRoot().append(qPara.append(qPrefix, qTrailing, qContent));
    });

    await act(async () => editor.update(() => qContent.select(3, 3)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.source).toBe("character");
    expect(context?.paraMarker).toBe("q1");
  });

  it("reports openCharMarkers: [wj] for a caret inside a \\wj span inside \\p", async () => {
    let wjContent: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const prefix = $createMarkerNode("p");
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      const wj = $createCharNode("wj");
      const wjOpen = $createMarkerNode("wj");
      wjContent = $createTextNode("holy words");
      const wjClose = $createMarkerNode("wj", "closing");
      $getRoot().append(para.append(prefix, trailing, wj.append(wjOpen, wjContent, wjClose)));
    });

    await act(async () => editor.update(() => wjContent.select(2, 2)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.openCharMarkers).toEqual(["wj"]);
    expect(context?.paraMarker).toBe("p");
    expect(context?.source).toBe("character");
  });

  it("reports paragraph source for a caret at the visible start of a leading \\wj span (red-letter shape)", async () => {
    let wjOpen: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const prefix = $createMarkerNode("p");
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      const wj = $createCharNode("wj");
      wjOpen = $createMarkerNode("wj");
      $getRoot().append(
        para.append(
          prefix,
          trailing,
          wj.append(wjOpen, $createTextNode("Then Jesus said"), $createMarkerNode("wj", "closing")),
        ),
      );
    });

    // The paragraph's visible content starts inside the char span: its first leaf is the
    // opener MarkerNode glyph, and a caret at its offset 0 is the content start.
    await act(async () => editor.update(() => wjOpen.select(0, 0)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.source).toBe("paragraph");
  });

  it("reports character source for a caret past the opener glyph of a leading \\wj span", async () => {
    let wjContent: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const prefix = $createMarkerNode("p");
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      const wj = $createCharNode("wj");
      wjContent = $createTextNode("Then Jesus said");
      $getRoot().append(
        para.append(
          prefix,
          trailing,
          wj.append($createMarkerNode("wj"), wjContent, $createMarkerNode("wj", "closing")),
        ),
      );
    });

    // Offset 0 of the span's content TEXT is already past the visible content start (the
    // opener glyph leaf) - mid-span, so character source.
    await act(async () => editor.update(() => wjContent.select(0, 0)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.source).toBe("character");
  });

  it("reports noteMarker: f for a caret in an expanded note's \\ft content", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();
    let ftContent: TextNode;
    editor.getEditorState().read(() => {
      ftContent = $noteContentText(findOnlyNote($getRoot()));
    });

    await act(async () => editor.update(() => ftContent.select(1, 1)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.noteMarker).toBe("f");
  });

  it("reports hasTextSelection: true and character source for a non-collapsed selection", async () => {
    let content: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const prefix = $createMarkerNode("p");
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      content = $createTextNode("selected text");
      $getRoot().append(para.append(prefix, trailing, content));
    });

    await act(async () => editor.update(() => content.select(0, 8)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.hasTextSelection).toBe(true);
    expect(context?.source).toBe("character");
  });

  it("reports inMarkerText: true for a caret inside a MarkerNode glyph", async () => {
    let prefix: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("q1");
      prefix = $createMarkerNode("q1");
      const trailing = $createTextNode(NBSP);
      $setState(trailing, textTypeState, "marker-trailing-space");
      $getRoot().append(para.append(prefix, trailing, $createTextNode("content")));
    });

    await act(async () => editor.update(() => prefix.select(1, 1)));

    const context = editor.getEditorState().read(() => $getMarkerMenuContext());
    expect(context?.inMarkerText).toBe(true);
  });
});
