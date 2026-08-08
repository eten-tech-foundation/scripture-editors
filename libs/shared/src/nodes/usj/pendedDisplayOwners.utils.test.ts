import {
  getPendedDisplayOwners,
  registerPendedDisplayOwners,
  $isDisplayOwnerPended,
} from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createTextNode, $getRoot, $createParagraphNode } from "lexical";
import { createEditor, LexicalEditor } from "lexical";
import { describe, expect, it } from "vitest";

describe("pendedDisplayOwners side-channel", () => {
  it("reports pended-ness for the registered editor's live set and stops after unregister", () => {
    const { editor } = createBasicTestEnvironment();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(() => {
      const node = $createTextNode("x");
      $getRoot().append($createParagraphNode().append(node));
      expect($isDisplayOwnerPended(node)).toBe(false);
      pended.add(node.getKey());
      expect($isDisplayOwnerPended(node)).toBe(true);
    });
    unregister();
    editor.update(() => {
      expect($isDisplayOwnerPended($getRoot())).toBe(false);
    });
  });
});

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
