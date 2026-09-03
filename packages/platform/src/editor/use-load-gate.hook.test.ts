/**
 * The load gate's own rules, driven directly rather than through the editor: the races below
 * (a second load starting while an operation is still queued behind the first) cannot be
 * scheduled deterministically from a mounted `Editor`, because both loads and their settles are
 * microtasks React owns. `annotation-before-load.test.tsx` covers the same gate as an app uses it.
 */
import { useLoadGate } from "./use-load-gate.hook";
import { act, renderHook } from "@testing-library/react";
import { LoggerBasic } from "shared";
import { vi } from "vitest";

/** Let queued microtasks (the gate's drain, and its teardown report) run. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createLogger() {
  return {
    error: vi.fn<(...params: unknown[]) => void>(),
    warn: vi.fn<(...params: unknown[]) => void>(),
    info: vi.fn<(...params: unknown[]) => void>(),
    debug: vi.fn<(...params: unknown[]) => void>(),
  } satisfies LoggerBasic;
}

/** The gate starts closed (a load always follows mount), so open it the way a load does. */
function renderOpenGate(logger: LoggerBasic = createLogger()) {
  const rendered = renderHook(() => useLoadGate(logger));
  act(() => {
    rendered.result.current.handleLoadingChange(true);
    rendered.result.current.handleLoadingChange(false);
  });
  return rendered;
}

describe("useLoadGate", () => {
  it("runs an operation immediately when no load is in flight", () => {
    const { result } = renderOpenGate();
    const op = vi.fn();

    act(() => {
      result.current.runWhenLoaded(op);
    });

    expect(op).toHaveBeenCalledTimes(1);
  });

  it("lets an immediate operation throw to its caller, as it did before the gate existed", () => {
    const { result } = renderOpenGate();

    expect(() =>
      result.current.runWhenLoaded(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });

  it("defers an operation issued while a load is in flight until that load settles", async () => {
    const { result } = renderOpenGate();
    const op = vi.fn();

    act(() => {
      result.current.handleLoadingChange(true);
      result.current.runWhenLoaded(op);
    });
    expect(op).not.toHaveBeenCalled();

    act(() => {
      result.current.handleLoadingChange(false);
    });
    await flushMicrotasks();

    expect(op).toHaveBeenCalledTimes(1);
  });

  it("re-checks the gate when draining: an operation waits for the load that is next to commit", async () => {
    // Load A is settling, but a load B has already been requested (a `setUsj`, or a view-option
    // change React has not re-rendered yet). Draining at A's settle would apply the operation to
    // a document B is about to replace — the very loss #515 is about.
    const { result } = renderOpenGate();
    const op = vi.fn();

    act(() => {
      result.current.handleLoadingChange(true); // load A starts
      result.current.runWhenLoaded(op);
      result.current.noteLoadRequested(); // load B is certain
      result.current.handleLoadingChange(false); // load A settles
    });
    await flushMicrotasks();
    expect(op).not.toHaveBeenCalled();

    act(() => {
      result.current.handleLoadingChange(true); // load B starts
      result.current.handleLoadingChange(false); // load B settles
    });
    await flushMicrotasks();

    // Once, against B's document — not twice, and not against A's.
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("drains overlapping loads only once they have all settled", async () => {
    const { result } = renderOpenGate();
    const op = vi.fn();

    act(() => {
      result.current.handleLoadingChange(true);
      result.current.handleLoadingChange(true);
      result.current.runWhenLoaded(op);
      result.current.handleLoadingChange(false);
    });
    await flushMicrotasks();
    expect(op).not.toHaveBeenCalled();

    act(() => {
      result.current.handleLoadingChange(false);
    });
    await flushMicrotasks();

    expect(op).toHaveBeenCalledTimes(1);
  });

  it("drains in the order the operations were issued", async () => {
    const { result } = renderOpenGate();
    const calls: string[] = [];

    act(() => {
      result.current.handleLoadingChange(true);
      result.current.runWhenLoaded(() => calls.push("set"));
      result.current.runWhenLoaded(() => calls.push("remove"));
      result.current.handleLoadingChange(false);
    });
    await flushMicrotasks();

    expect(calls).toEqual(["set", "remove"]);
  });

  it("isolates a failing deferred operation: the rest still run, and the failure is logged", async () => {
    const logger = createLogger();
    const { result } = renderOpenGate(logger);
    const after = vi.fn();

    act(() => {
      result.current.handleLoadingChange(true);
      result.current.runWhenLoaded(() => {
        throw new Error("boom");
      });
      result.current.runWhenLoaded(after);
      result.current.handleLoadingChange(false);
    });
    await flushMicrotasks();

    expect(after).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("reports operations still waiting on a load when the editor unmounts", async () => {
    const logger = createLogger();
    const { result, unmount } = renderOpenGate(logger);

    act(() => {
      result.current.handleLoadingChange(true);
      result.current.runWhenLoaded(vi.fn());
    });
    unmount();
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("1 operation(s)"));
  });

  it("says nothing at unmount when the queue is empty", async () => {
    const logger = createLogger();
    const { unmount } = renderOpenGate(logger);

    unmount();
    await flushMicrotasks();

    expect(logger.error).not.toHaveBeenCalled();
  });
});
