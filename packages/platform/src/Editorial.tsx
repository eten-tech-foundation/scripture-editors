import { PropsWithChildren, forwardRef, ReactElement } from "react";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import Editor, { EditorRef, EditorProps } from "./editor/Editor";

/**
 * Scripture Editor for USJ. Created for use in [Platform](https://platform.bible).
 * @see https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js
 *
 * @param props.ref - Forward reference for the editor.
 * @param props.defaultUsj - Initial Scripture data in USJ format.
 * @param props.scrRef - Scripture reference that links the general cursor location of the
 *   Scripture.
 * @param props.onScrRefChange - Callback function when the Scripture reference changes in the
 *   editor as the cursor moves.
 * @param props.onSelectionChange - Callback function when the cursor selection changes.
 * @param props.onUsjChange - Callback function when USJ Scripture data has changed.
 * @param props.options - Options to configure the editor.
 * @param props.logger - Logger instance.
 * @returns the editor element.
 */
const Editorial = forwardRef(function Editorial<TLogger extends LoggerBasic>(
  props: EditorProps<TLogger>,
  ref: React.ForwardedRef<EditorRef | null>,
): ReactElement {
  const { children, ...propsWithoutChildren } = props as PropsWithChildren<EditorProps<TLogger>>;
  return <Editor ref={ref} {...propsWithoutChildren} />;
});

export default Editorial;
