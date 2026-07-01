import { armedDeleteMessage } from "./armedDeleteMessage";
import { ArmedDelete } from "./structureKeyboard.utils";
import { FloatingBox, FloatingBoxCoords } from "../FloatingBox";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { LexicalEditor } from "lexical";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Destructive tooltip shown while a verse marker (or a selection containing verse markers) is
 * armed for the two-step delete. Anchored to the armed marker's DOM element and positioned with
 * floating-ui's `computePosition` — deliberately NOT `autoUpdate`, which needs a `ResizeObserver`
 * that the jsdom test environment lacks; we re-position on window scroll/resize instead.
 */
export function VerseDeleteTooltip({
  editor,
  armed,
}: {
  editor: LexicalEditor;
  armed: ArmedDelete;
}) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<FloatingBoxCoords>(undefined);
  // For a selection, anchor to the first verse marker inside it; otherwise the target node.
  const anchorKey = armed.kind === "selection" ? armed.verseKeys?.[0] : armed.key;

  useEffect(() => {
    const floating = floatingRef.current;
    const anchor = anchorKey ? editor.getElementByKey(anchorKey) : null;
    if (!floating || !anchor) return;
    let active = true;
    const update = () => {
      computePosition(anchor, floating, {
        placement: "bottom-start",
        middleware: [flip(), shift()],
      })
        .then((pos) => {
          if (active) setCoords({ x: pos.x, y: pos.y });
        })
        .catch(() => {
          if (active) setCoords(undefined);
        });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      active = false;
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor, anchorKey]);

  const { key, text } = armedDeleteMessage(armed.kind, armed.intent);
  return createPortal(
    <FloatingBox
      ref={floatingRef}
      coords={coords}
      className="floating-box verse-delete-tooltip"
      role="status"
      aria-live="polite"
    >
      <kbd>{key}</kbd> {text}
    </FloatingBox>,
    document.body,
  );
}
