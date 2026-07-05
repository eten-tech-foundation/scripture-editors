import Editor from "./Editor";
import { act, render } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { ScriptureReference } from "shared";
// `vi.mock` below is hoisted above these imports by Vitest, so `shared-react` (pulled in
// transitively by `Editor`) resolves to the mocked module even though the import is written here.
import { FORMATTED_VIEW_MODE, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

// Pin the Editor-level gate added for Standard view (mirrors
// packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx): `CommandMenuPlugin` (which
// preventDefaults typed/pasted `\` and `/`) MUST NOT be mounted in editable marker modes, where
// literal backslash input is required by the marker-edit engine (§5.2) and the `\`-menu (§5.4).
// It MUST stay mounted in non-editable views, where a literal `\` is garbage.
// We replace only `CommandMenuPlugin` with a render spy (all other shared-react exports are
// preserved via the spread) so we can assert its presence/absence purely from viewOptions.
// `vi.hoisted` so the spy exists before the hoisted `vi.mock` factory references it.
const commandMenuSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("shared-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("shared-react")>();
  return { ...actual, CommandMenuPlugin: commandMenuSpy };
});

const sampleUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "1" }, "first verse text"],
    },
  ],
};
const scrRef: ScriptureReference = { book: "GEN", chapterNum: 1, verseNum: 1 };

// jsdom implements `getBoundingClientRect` on Element but not on Range. Scribe's Editor mounts
// `AutoFocusPlugin`, which focuses the editor root as soon as it renders; once focused, Lexical's
// post-commit scroll-into-view step reads a native `Range`'s bounding rect to decide whether to
// scroll, and jsdom's missing method throws (as an unhandled async rejection, after the render
// has already committed). Stub it the same way jsdom already stubs Element's version and the
// platform marker-edit tests already do (a zero rect nothing here asserts on) - see
// packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.tsx.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

async function renderEditorWithViewMode(viewMode: string): Promise<void> {
  await act(async () => {
    render(
      <Editor
        usjInput={sampleUsj}
        viewOptions={getViewOptions(viewMode)}
        scrRef={scrRef}
        onScrRefChange={() => undefined}
      />,
    );
  });
}

describe("CommandMenuPlugin editable-mode gate", () => {
  it("does NOT mount CommandMenuPlugin in editable marker mode (Standard view)", async () => {
    commandMenuSpy.mockClear();
    await renderEditorWithViewMode(STANDARD_VIEW_MODE);
    expect(commandMenuSpy).not.toHaveBeenCalled();
  });

  it("mounts CommandMenuPlugin in a non-editable marker mode (Formatted view)", async () => {
    commandMenuSpy.mockClear();
    await renderEditorWithViewMode(FORMATTED_VIEW_MODE);
    expect(commandMenuSpy).toHaveBeenCalled();
  });
});
