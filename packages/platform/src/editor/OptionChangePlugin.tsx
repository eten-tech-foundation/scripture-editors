import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { deepEqual } from "fast-equals";
import { useEffect } from "react";
import { EditorOptions } from "./editor.model";

/** This plugin preserves USJ edits when the editor options change. */
export default function OptionChangePlugin({
  options,
  editedUsjRef,
  usj,
  setUsj,
}: {
  options: EditorOptions | undefined;
  editedUsjRef: React.MutableRefObject<Usj | undefined>;
  usj: Usj | undefined;
  setUsj: (usj: Usj) => void;
}): null {
  const { view: viewOptions, nodes: nodeOptions } = options || {};
  const { hasSpacing, isFormattedFont, markerMode } = viewOptions || {};

  useEffect(() => {
    if (editedUsjRef.current && !deepEqual(editedUsjRef.current, usj)) {
      setUsj(editedUsjRef.current);
    }
  }, [editedUsjRef, hasSpacing, isFormattedFont, markerMode, nodeOptions, setUsj, usj]);

  return null;
}
