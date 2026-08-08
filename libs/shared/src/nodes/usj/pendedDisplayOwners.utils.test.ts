import { getPendedDisplayOwners, registerPendedDisplayOwners } from "./pendedDisplayOwners.utils";
import { createEditor, LexicalEditor } from "lexical";

describe("getPendedDisplayOwners", () => {
  it("returns the live set the engine registered for that editor", () => {
    const editor: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    const pendedKeys = new Set<string>(["1"]);
    registerPendedDisplayOwners(editor, pendedKeys);

    const read = getPendedDisplayOwners(editor);
    expect(read?.has("1")).toBe(true);

    // LIVE, not a copy: a key the engine pends after registration is visible to the reader.
    pendedKeys.add("2");
    expect(getPendedDisplayOwners(editor)?.has("2")).toBe(true);
  });

  it("returns undefined for an editor with no engine registered, and after unregistering", () => {
    const editor: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    expect(getPendedDisplayOwners(editor)).toBeUndefined();

    const unregister = registerPendedDisplayOwners(editor, new Set<string>());
    expect(getPendedDisplayOwners(editor)).toBeDefined();
    unregister();
    expect(getPendedDisplayOwners(editor)).toBeUndefined();
  });

  it("keeps two editors' sets separate", () => {
    const main: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    const popover: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    registerPendedDisplayOwners(main, new Set<string>(["main"]));
    registerPendedDisplayOwners(popover, new Set<string>(["popover"]));

    expect(getPendedDisplayOwners(main)?.has("popover")).toBe(false);
    expect(getPendedDisplayOwners(popover)?.has("main")).toBe(false);
  });
});

function throwIt(error: Error): never {
  throw error;
}
