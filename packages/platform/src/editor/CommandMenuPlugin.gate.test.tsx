import Editor from "./Editor";
import { act, render } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
// `vi.mock` below is hoisted above these imports by Vitest, so `shared-react` (pulled in
// transitively by `Editor`) resolves to the mocked module even though the import is written here.
import { FORMATTED_VIEW_MODE, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";
import { describe, expect, it, vi } from "vitest";

// Pin the Editor-level gate added for Standard view: `CommandMenuPlugin` (which
// preventDefaults typed/pasted `\` and `/`) MUST NOT be mounted in editable marker modes,
// where literal backslash input is required by the marker-edit engine (§5.2) and the
// `\`-menu (§5.4). It MUST stay mounted in non-editable views, where a literal `\` is garbage.
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

async function renderEditorWithViewMode(viewMode: string): Promise<void> {
  await act(async () => {
    render(<Editor defaultUsj={sampleUsj} options={{ view: getViewOptions(viewMode) }} />);
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
