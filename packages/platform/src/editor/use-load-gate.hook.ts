import { useCallback, useEffect, useRef } from "react";
import { LoggerBasic } from "shared";

/**
 * Defers imperative work that has to address the loaded document until the load carrying it has
 * settled.
 *
 * `LoadStatePlugin` commits USJ from a microtask, and `editor.setEditorState()` replaces the whole
 * state, so an operation issued while a load is in flight either can't resolve its target or is
 * thrown away by the commit that follows. Callers shouldn't have to know that: they hold a ref and
 * may reasonably use it the moment they have one.
 *
 * When no load is pending the operation runs immediately, i.e. exactly as before. When one is, the
 * operation runs at the first settle with nothing else loading or requested - so it addresses a
 * live document, and an operation that can never succeed still fails there rather than waiting.
 *
 * @param logger - Reports work that no longer has a caller to fail to: a deferred operation that
 *   throws, and operations still queued when the editor unmounts.
 */
export function useLoadGate(logger?: LoggerBasic) {
  // A load always follows mount, and this hook runs before LoadStatePlugin's effect reports it.
  const isLoadRequestedRef = useRef(true);
  const activeLoadCountRef = useRef(0);
  const queuedOpsRef = useRef<(() => void)[]>([]);
  const isTornDownRef = useRef(false);
  // Read at call time so the gate's callbacks stay referentially stable while a logger swap is
  // still picked up (and so teardown can report against the logger the editor last had).
  const loggerRef = useRef(logger);
  useEffect(() => {
    loggerRef.current = logger;
  }, [logger]);

  /** The document is stable: nothing is loading, and no load is known to be coming. */
  const isDocumentSettled = useCallback(
    () => !isLoadRequestedRef.current && activeLoadCountRef.current === 0,
    [],
  );

  const drain = useCallback(() => {
    // Re-check the gate: a load can be requested between the settle that scheduled this drain and
    // the drain itself. Leaving the ops queued lets the next settle run them against a document
    // that is actually live, rather than one about to be replaced.
    if (!isDocumentSettled()) return;

    const ops = queuedOpsRef.current;
    queuedOpsRef.current = [];
    for (const op of ops) {
      try {
        op();
      } catch (error) {
        // These run from a microtask, so there is no caller left to throw to: an escaping error
        // would be an unhandled global one and would drop the rest of the queue with it.
        loggerRef.current?.error(`Editor: a deferred operation failed after the load. ${error}`);
      }
    }
  }, [isDocumentSettled]);

  /** Report a load starting or settling. Calls must be balanced. */
  const handleLoadingChange = useCallback(
    (isLoading: boolean) => {
      if (isLoading) {
        isLoadRequestedRef.current = false;
        activeLoadCountRef.current += 1;
        return;
      }
      activeLoadCountRef.current = Math.max(0, activeLoadCountRef.current - 1);
      if (!isDocumentSettled()) return;
      // A microtask, not a direct call: this runs from inside the settle path, and deferring keeps
      // the queued work out of it (and off React's commit phase).
      queueMicrotask(drain);
    },
    [drain, isDocumentSettled],
  );

  /**
   * Note that a load is certain but hasn't been reported yet - `LoadStatePlugin` only reports one
   * from its own passive effect, which is later than both `setUsj` returning and a consumer's
   * layout effect. Cleared by the next `handleLoadingChange(true)`, which the load that is coming
   * always makes.
   */
  const noteLoadRequested = useCallback(() => {
    isLoadRequestedRef.current = true;
  }, []);

  /** Run now if the document is settled, otherwise once the load in flight finishes. */
  const runWhenLoaded = useCallback(
    (op: () => void) => {
      // Deliberately not wrapped: with the gate open this is still the caller's own call stack, so
      // a throw must reach them exactly as it did before the gate existed.
      if (isDocumentSettled()) {
        op();
        return;
      }
      queuedOpsRef.current.push(op);
    },
    [isDocumentSettled],
  );

  useEffect(() => {
    isTornDownRef.current = false;
    return () => {
      // Whatever is queued belongs to the instance going away, so a remount starts clean.
      const droppedCount = queuedOpsRef.current.length;
      queuedOpsRef.current = [];
      if (droppedCount === 0) return;

      isTornDownRef.current = true;
      // Deferred, and re-checked: React's dev-only double-invoke unmounts and immediately remounts
      // this instance, and the consumer's effect re-queues its work in that second pass - which is
      // not the loss worth reporting. A real teardown has nothing to re-set the flag.
      queueMicrotask(() => {
        if (!isTornDownRef.current) return;
        loggerRef.current?.error(
          `Editor: ${droppedCount} operation(s) waiting on a load were dropped when the editor` +
            " unmounted.",
        );
      });
    };
  }, []);

  return { handleLoadingChange, noteLoadRequested, runWhenLoaded };
}
