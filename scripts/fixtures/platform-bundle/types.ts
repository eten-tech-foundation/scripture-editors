import {
  Editorial as RootEditorial,
  type EditorRef as RootEditorRef,
  type ViewOptions as RootViewOptions,
} from "@eten-tech-foundation/platform-editor";
import {
  Editorial,
  type EditorRef,
  type ViewOptions as EditorialViewOptions,
} from "@eten-tech-foundation/platform-editor/editorial";
import {
  getDefaultViewOptions,
  type ViewOptions,
} from "@eten-tech-foundation/platform-editor/view-options";

declare const rootRef: RootEditorRef;
declare const editorialRef: EditorRef;

// Mixing entry points must not create incompatible copies of public types.
const acceptsRootRef: RootEditorRef = editorialRef;
const acceptsEditorialRef: EditorRef = rootRef;
const acceptsRootComponent: typeof RootEditorial = Editorial;
const acceptsEditorialComponent: typeof Editorial = RootEditorial;
const view: ViewOptions = getDefaultViewOptions();
const rootView: RootViewOptions = view;
const editorialView: EditorialViewOptions = rootView;
void [
  acceptsRootRef,
  acceptsEditorialRef,
  acceptsRootComponent,
  acceptsEditorialComponent,
  editorialView,
];
