import { NodeOptions, typedMarkNodeName } from "shared";
import { OnClick, immutableNoteCallerNodeName } from "./ImmutableNoteCallerNode";

/**
 * A function type that adds missing comments to a USJ document.
 *
 * @param usjCommentIds - An array of comment IDs from the incoming USJ document.
 *
 * @public
 */
export type AddMissingComments = (usjCommentIds: string[]) => void;

/**
 * Configuration options for USJ (Unified Scripture JSON) nodes.
 *
 * @public
 */
export interface UsjNodeOptions extends NodeOptions {
  /** Configuration options for immutable note caller nodes. */
  [immutableNoteCallerNodeName]?: {
    /** Possible note callers to use when caller is '+'. Defaults to lowercase Latin characters. */
    noteCallers?: string[];
    /** Click handler method. */
    onClick?: OnClick;
  };
  /** Configuration options for typed mark nodes. */
  [typedMarkNodeName]?: {
    /** Method to add missing comments. */
    addMissingComments?: AddMissingComments;
  };
}
