import { NodeOptions } from "shared/adaptors/editor-adaptor.model";
import { typedMarkNodeName } from "shared/nodes/features/TypedMarkNode";
import { OnClick, immutableNoteCallerNodeName } from "./ImmutableNoteCallerNode";

export type AddMissingComments = (usjCommentIds: string[]) => void;

/** Options for each editor node. */
export interface UsjNodeOptions extends NodeOptions {
  [immutableNoteCallerNodeName]?: {
    /** Possible note callers to use when caller is '+'. */
    noteCallers?: string[];
    /** Click handler method. */
    onClick?: OnClick;
  };
  [typedMarkNodeName]?: {
    /** Method to add missing comments. */
    addMissingComments?: AddMissingComments;
  };
}
