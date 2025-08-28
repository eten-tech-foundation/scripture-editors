import { TextDirection, UsjNodeOptions, ViewOptions } from "shared-react";

/**
 * Options to configure the editor.
 *
 * @public
 */
export interface EditorOptions {
  /** Is the editor readonly or editable. */
  isReadonly?: boolean;
  /** Is the editor enabled for spell checking. */
  hasSpellCheck?: boolean;
  /** Text direction: "ltr" | "rtl" | "auto". */
  textDirection?: TextDirection;
  /** Key to trigger the marker menu. Defaults to '\'. */
  markerMenuTrigger?: string;
  /** Options for some editor nodes. */
  nodes?: UsjNodeOptions;
  /**
   * EXPERIMENTAL: View options. Defaults to the formatted view mode which is currently the only
   * functional option.
   */
  view?: ViewOptions;
  /** EXPERIMENTAL: Is the editor being debugged using the TreeView. */
  debug?: boolean;
}
