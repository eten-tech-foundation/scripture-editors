/**
 * @packageDocumentation
 *
 * Scripture editor used in Platform. See https://platform.bible
 *
 * This package provides a Scripture editor React component that works on USJ Scripture data.
 * Please note:
 * - This is an [uncontrolled React component](https://react.dev/learn/sharing-state-between-components#controlled-and-uncontrolled-components).
 * - Use the `<Editorial />` component for an editor without commenting features.
 * - Use the `<Marginal />` component for an editor with comments (comments appear in the margin).
 *
 * The editor component is for editing Scripture text with these features:
 * - USJ editor with USX support
 * - Read-only and edit mode
 * - History - undo & redo
 * - Cut, copy, paste, paste as plain text - context menu and keyboard shortcuts
 * - Format block type - change `<para>` markers. The current implementation is a proof-of-concept and doesn't have all the markers available yet.
 * - Insert markers - type '\\' (backslash - configurable to another key) for a marker menu. If text is selected first the marker will apply to the selection if possible, e.g. use '\\wj' to "red-letter" selected text.
 * - Add comments to selected text, reply in comment threads, delete comments and threads.
 *   - To enable comments use the `<Marginal />` editor component (comments appear in the margin).
 *   - To use the editor without comments use the `<Editorial />` component.
 * - Add and remove different types of annotations. Style the different annotations types with CSS, e.g. style a spelling annotation with a red squiggly underline.
 * - Get and set the cursor location or selection range.
 * - Specify `textDirection` as `"ltr"`, `"rtl"`, or `"auto"` (`"auto"` is unlikely to be useful for minority languages).
 * - BCV linkage - change the book/chapter/verse externally and the cursor moves; move the cursor and it updates the external book/chapter/verse
 * - Nodes supported `<book>`, `<chapter>`, `<verse>`, `<para>`, `<char>`, `<note>`, `<ms>`
 * - Nodes not yet supported `<table>`, `<row>`, `<cell>`, `<sidebar>`, `<periph>`, `<figure>`, `<optbreak>`, `<ref>`
 * - Node options - callback for when a `<note>` link is clicked
 * - Apply [Delta Operation](https://github.com/slab/delta) changes to the editor and see Delta Operations when changes are made in the editor. For use with realtime collaborative editing.
 */

export { default as Editorial } from "./Editorial";
export { default as Marginal } from "./marginal/Marginal";
export {
  directionToNames,
  getDefaultViewMode,
  getDefaultViewOptions,
  getViewMode,
  getViewOptions,
  viewModeToViewNames,
} from "shared-react";

export type { EditorProps, EditorRef } from "./editor/Editor";
export type { EditorOptions } from "./editor/editor.model";
export type { CommentBase, Comments, Thread } from "./marginal/comments/commenting";
export type { MarginalRef, MarginalProps } from "./marginal/Marginal";
export type { LoggerBasic, NodeOptions } from "shared";
export type {
  AddMissingComments,
  AnnotationRange,
  DeltaOp,
  DeltaSource,
  OnClick,
  SelectionRange,
  TextDirection,
  UsjLocation,
  UsjNodeOptions,
  ViewMode,
  ViewOptions,
} from "shared-react";
