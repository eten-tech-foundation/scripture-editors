import { useCallback, useRef } from "react";

/**
 * Defers imperative work that has to address the loaded document until the load carrying it has
 * settled.
 *
 * `LoadStatePlugin` commits USJ from a microtask, and `editor.setEditorState()` replaces the whole
 * state, so an operation issued while a load is in flight either can't resolve its target or is
 * thrown away by the commit that follows. Callers shouldn't have to know that: they hold a ref and
 * may reasonably use it the moment they have one.
 *
 * When no load is pending the operation runs immediately, i.e. exactly as before.
 */
export function useLoadGate() {
  // A load always follows mount, and this hook runs before LoadStatePlugin's effect reports it.
  const isLoadRequestedRef = useRef(true);
  const activeLoadCountRef = useRef(0);
  const queuedOpsRef = useRef<(() => void)[]>([]);

  const drain = useCallback(() => {
    const ops = queuedOpsRef.current;
    queuedOpsRef.current = [];
    for (const op of ops) op();
  }, []);

  /** Report a load starting or settling. Calls must be balanced. */
  const handleLoadingChange = useCallback(
    (isLoading: boolean) => {
      if (isLoading) {
        isLoadRequestedRef.current = false;
        activeLoadCountRef.current += 1;
        return;
      }
      activeLoadCountRef.current = Math.max(0, activeLoadCountRef.current - 1);
      if (activeLoadCountRef.current > 0 || isLoadRequestedRef.current) return;
      // A microtask, not a direct call: this runs from inside the settle path, and deferring keeps
      // the queued work out of it (and off React's commit phase).
      queueMicrotask(drain);
    },
    [drain],
  );

  /**
   * Note that a load is certain but hasn't started yet — e.g. `setUsj` was just called, so React
   * hasn't re-rendered and `LoadStatePlugin` hasn't reported the load. Without this, work issued
   * in the same tick as `setUsj` would run against the outgoing document.
   */
  const noteLoadRequested = useCallback(() => {
    isLoadRequestedRef.current = true;
  }, []);

  /** Run now if the document is settled, otherwise once the in-flight load finishes. */
  const runWhenLoaded = useCallback((op: () => void) => {
    if (!isLoadRequestedRef.current && activeLoadCountRef.current === 0) {
      op();
      return;
    }
    queuedOpsRef.current.push(op);
  }, []);

  return { handleLoadingChange, noteLoadRequested, runWhenLoaded };
}
