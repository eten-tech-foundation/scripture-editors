import React, { useEffect } from "react";
import { useFloatingPosition } from "./useFloatingPosition";

export default function useCursorCoords({
  isOpen,
  floatingBoxRef,
}: {
  isOpen: boolean;
  floatingBoxRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { coords, updatePosition, cleanup, placement } = useFloatingPosition();

  useEffect(() => {
    if (!isOpen || !floatingBoxRef.current) {
      cleanup();
      return;
    }

    const domRange = window.getSelection()?.getRangeAt(0);
    if (domRange) {
      updatePosition(domRange, floatingBoxRef.current);
      return cleanup;
    }
  }, [cleanup, isOpen, floatingBoxRef, updatePosition]);

  return { coords, placement };
}
