import { act } from "@testing-library/react";

/**
 * Flush queued macrotasks + microtasks inside act(). jsdom fires native `selectionchange` via
 * setTimeout(0), and the editor defers work (cursor placement, the verse-mutation
 * SELECTION_CHANGE_COMMAND dispatch) by a microtask, so tests that assert quiescence - or that
 * need a deferred effect to have run before asserting - must flush both first.
 */
export async function flushQueuedEvents(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}
