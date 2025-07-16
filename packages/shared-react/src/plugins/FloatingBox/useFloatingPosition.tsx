import { useState, useCallback, useRef, useEffect } from "react";
import { autoUpdate, computePosition, shift, flip, Placement } from "@floating-ui/dom";

export function useFloatingPosition() {
  const [coords, setCoords] = useState<{ x: number; y: number } | undefined>(undefined);
  const [placement, setPlacement] = useState<Placement>();
  const cleanupRef = useRef<(() => void) | null>(null);

  const updatePosition = useCallback((domRange: Range, anchorElement: HTMLElement) => {
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    const referenceElement =
      domRange.commonAncestorContainer.nodeType === domRange.commonAncestorContainer.TEXT_NODE
        ? domRange
        : (domRange.commonAncestorContainer as HTMLElement);

    cleanupRef.current = autoUpdate(referenceElement, anchorElement, () => {
      computePosition(referenceElement, anchorElement, {
        placement: "bottom-start",
        middleware: [shift(), flip()],
      })
        .then((pos) => {
          setPlacement(pos.placement);
          setCoords((prevCoords) =>
            prevCoords?.x === pos.x && prevCoords?.y === pos.y
              ? prevCoords
              : { x: pos.x, y: pos.y },
          );
        })
        .catch(() => {
          setCoords(undefined);
        });
    });
  }, []);

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      setCoords(undefined);
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { coords, placement, updatePosition, cleanup };
}
