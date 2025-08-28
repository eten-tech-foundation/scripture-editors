import { deepEqual } from "fast-equals";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

type UseDeferredStateReturn<T> = [T, T, Dispatch<SetStateAction<T>>];

/**
 * `useDeferredState` is a custom hook that lets you defer updating part of the UI.
 * The `deferred` value is only updated if the changed `incoming` value is different than the
 * `modified` value.
 * @param incoming - Incoming value to watch for changes.
 * @returns Returns the `deferred` value, the `modified` value, and a function to update the
 *   modified value.
 */
export default function useDeferredState<T>(incoming: T): UseDeferredStateReturn<T> {
  const [deferred, setDeferred] = useState<T>(incoming);
  const [modified, setModified] = useState<T>(incoming);

  useEffect(() => {
    if (!deepEqual(incoming, modified)) setDeferred(incoming);
    // Intentionally ignoring changes to `modified`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  return [deferred, modified, setModified];
}
