import { RefObject, useEffect } from "react";
import { useFloatingPosition } from "./useFloatingPosition";

export default function useCursorCoords({
  isOpen,
  floatingBoxRef,
}: {
  isOpen: boolean;
  floatingBoxRef: RefObject<HTMLDivElement | null>;
}) {
  const { coords, updatePosition, cleanup, placement } = useFloatingPosition();

  useEffect(() => {
    if (!isOpen || !floatingBoxRef.current) {
      cleanup();
      return undefined;
    }

    const domRange = window.getSelection()?.getRangeAt(0);
    if (domRange) {
      updatePosition(domRange, floatingBoxRef.current);
      return cleanup;
    }
    return undefined;
  }, [cleanup, isOpen, floatingBoxRef, updatePosition]);

  return { coords, placement };
}
