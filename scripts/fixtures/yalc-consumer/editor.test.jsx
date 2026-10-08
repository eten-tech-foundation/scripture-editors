import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { Editorial } from "@eten-tech-foundation/platform-editor";
test("renders the installed editor", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<Editorial />));
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  await act(async () => root.unmount());
  container.remove();
});
