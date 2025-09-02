import { SerializedEditorState } from "lexical";
import { LoggerBasic } from "./logger-basic.model.js";

/**
 * Option properties to use with each node.
 *
 * @public
 */
export interface NodeOptions {
  /** Configuration options for any node. */
  [prop: string]: unknown;
}

export interface EditorAdaptor {
  /**
   * Load the Scripture into a serialized editor state.
   * @param scripture - Scripture to adapt to the editor, if any.
   * @param viewOptions - View options of the editor, if any.
   * @returns the serialized editor state.
   */
  serializeEditorState(
    scripture: unknown | undefined,
    viewOptions?: unknown,
  ): SerializedEditorState;

  /**
   * Initialize the adaptor.
   * @param nodeOptions - Node options, if any.
   * @param logger - Logger, if any.
   */
  initialize?(nodeOptions?: NodeOptions, logger?: LoggerBasic): void;

  /**
   * Reset the adaptor to use with new/changed Scripture.
   * @param resetValues - Values to reset to, if any.
   */
  reset?(...resetValues: unknown[]): void;
}
