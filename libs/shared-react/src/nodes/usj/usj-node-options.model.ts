import { NodeOptions } from "shared";
import { NoteCallerOnClick } from "./ImmutableNoteCallerNode";

/**
 * A function type that adds missing comments to a USJ document.
 *
 * @param usjCommentIds - An array of comment IDs from the incoming USJ document.
 *
 * @deprecated Use of this method is deprecated. Consider managing missing comments through
 *   application state or other mechanisms instead.
 * @public
 */
export type AddMissingComments = (usjCommentIds: string[]) => void;

/**
 * Configuration options for USJ (Unified Scripture JSON) nodes.
 *
 * @public
 */
export interface UsjNodeOptions extends NodeOptions {
  /** Possible note callers to use when caller is '+'. Defaults to lowercase Latin characters. */
  noteCallers?: string[];
  /** Note caller click handler method. */
  noteCallerOnClick?: NoteCallerOnClick;
  /**
   * Method to add missing comments.
   * @deprecated Use of this method is deprecated. Consider managing missing comments through
   *   application state or other mechanisms instead.
   */
  addMissingComments?: AddMissingComments;
  /**
   * Additional marker names to treat as valid, beyond the built-in USFM lists. This prevents
   * "Unexpected <kind> marker" warnings when loading documents that use them. Applied to char,
   * para, note, and milestone markers alike. Markers that are neither built-in, z-prefixed
   * (custom), nor listed here still warn. Additive — never replaces the built-in lists.
   */
  extraValidMarkers?: readonly string[];
}
