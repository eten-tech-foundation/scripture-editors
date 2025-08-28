import { forwardRef, HTMLAttributes, ReactNode } from "react";

export type FloatingBoxCoords = { x: number; y: number } | undefined;

type FloatingBoxProps = {
  coords: FloatingBoxCoords;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export const FloatingBox = forwardRef<HTMLDivElement, FloatingBoxProps>((props, ref) => {
  const { coords, children, style, ...extraProps } = props;
  const shouldShow = coords !== undefined;

  return (
    <div
      ref={ref}
      className="floating-box"
      aria-hidden={!shouldShow}
      style={{
        ...style,
        position: "absolute",
        zIndex: 1000,
        top: coords?.y,
        left: coords?.x,
        visibility: shouldShow ? "visible" : "hidden",
        opacity: shouldShow ? 1 : 0,
      }}
      {...extraProps}
    >
      {children}
    </div>
  );
});
