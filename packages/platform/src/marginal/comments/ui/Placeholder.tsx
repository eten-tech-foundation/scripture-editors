/**
 * Adapted from https://github.com/facebook/lexical/blob/93cf85e12033b114ad347dcccf508c846a833731/packages/lexical-playground/src/ui/Placeholder.tsx
 */

import { ReactNode, ReactElement } from "react";
import "./Placeholder.css";

export default function Placeholder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <div className={className || "Placeholder__root"}>{children}</div>;
}
