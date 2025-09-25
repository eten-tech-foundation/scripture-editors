import { ForwardedRef, forwardRef, PropsWithChildren, ReactElement } from "react";
import { LoggerBasic } from "shared";
import Editor from "./editor/Editor";
import { EditorProps, EditorRef } from "./editor/editor.model";

/**
 * Scripture Editor for USJ. Created for use in [Platform](https://platform.bible).
 * @see https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js
 *
 * @param ref - Forward reference for the editor.
 * @param defaultUsj - Initial Scripture data in USJ format.
 * @param scrRef - Scripture reference that links the general cursor location of the
 *   Scripture.
 * @param onScrRefChange - Callback function when the Scripture reference changes in the
 *   editor as the cursor moves.
 * @param onSelectionChange - Callback function when the cursor selection changes.
 * @param onUsjChange - Callback function when USJ Scripture data has changed.
 * @param options - Options to configure the editor.
 * @param logger - Logger instance.
 * @returns the editor element.
 *
 * @public
 */
const Editorial = forwardRef(function Editorial<TLogger extends LoggerBasic>(
  props: EditorProps<TLogger>,
  ref: ForwardedRef<EditorRef | null>,
): ReactElement {
  const { children, ...propsWithoutChildren } = props as PropsWithChildren<EditorProps<TLogger>>;
  return <Editor ref={ref} {...propsWithoutChildren} />;
});

export default Editorial;
