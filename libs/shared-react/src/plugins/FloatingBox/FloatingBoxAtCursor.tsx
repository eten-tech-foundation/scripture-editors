import { memo, ReactNode, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FloatingBox } from "./FloatingBox";
import useCursorCoords from "./useCursorCoords";
import { Placement } from "@floating-ui/dom";

const DOM_ELEMENT = document.body;

const MemoizedFloatingBox = memo(FloatingBox);

export type FloatingMenuCoords = { x: number; y: number } | undefined;

interface CursorFloatingBox {
  isOpen?: boolean;
  children:
    | ReactNode
    | ((props: { isOpen: boolean | undefined; placement?: Placement }) => ReactNode);
}

/**
 * FloatingBoxAtCursor component is responsible for rendering a floating menu
 * at the cursor position when the isOpen prop is true
 */
export default function FloatingBoxAtCursor({ isOpen = false, children }: CursorFloatingBox) {
  const floatingBoxRef = useRef<HTMLDivElement>(null);
  const { coords, placement } = useCursorCoords({ isOpen, floatingBoxRef });

  const renderChildren = useMemo(
    () => (coords ? (typeof children === "function" ? children : () => children) : () => null),
    [children, coords],
  );

  return createPortal(
    <MemoizedFloatingBox
      ref={floatingBoxRef}
      coords={coords}
      style={coords ? undefined : { display: "none" }}
    >
      {renderChildren({ isOpen, placement })}
    </MemoizedFloatingBox>,
    DOM_ELEMENT,
  );
}
