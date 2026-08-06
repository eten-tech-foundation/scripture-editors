import { registerPendedDisplayOwners, $isDisplayOwnerPended } from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createTextNode, $getRoot, $createParagraphNode } from "lexical";
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
