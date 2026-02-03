# Scripture Editor for [Platform](https://platform.bible) using USJ

<div align="center">

[![Build Status][github-actions-status]][github-actions-url]
[![CodeQL][gitghub-codeql-status]][gitghub-codeql-url]
[![Github Tag][npm-version-image]][npm-version-url]

</div>

A Scripture editor React component that works on USJ Scripture data. A utility that converts USX to USJ is also included. It is expected that data conforms to [USJ v3.1](https://docs.usfm.bible/usfm/3.1/).

```mermaid
---
title: Scripture Data — Editor flow
---
graph TB
  DB[(DB)] <-- USX --> C
  C[USX-USJ converter] <-- USJ --> A
  A[USJ-Editor adapter] <-- Editor State --> Editor
```

## Install

```sh
npm install @eten-tech-foundation/platform-editor
```

## Usage

> [!NOTE]
> This is an [uncontrolled React component](https://react.dev/learn/sharing-state-between-components#controlled-and-uncontrolled-components).

> [!NOTE]
>
> - Use the `<Editorial />` component for an editor without commenting features.
> - Use the `<Marginal />` component (DEPRECATED) for an editor with comments (comments appear in the margin).

> [!IMPORTANT]
> `<Marginal />` is deprecated and will be removed in a future release.

```ts
import { EditorOptions, Editorial, EditorRef, usxStringToUsj, UsjNodeOptions } from "@eten-tech-foundation/platform-editor";
import { BookChapterControl } from "platform-bible-react";

const emptyUsx = '<usx version="3.1" />';
const usx = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.1">
  <book code="PSA" style="id">World English Bible (WEB)</book>
  <para style="mt1">The Psalms</para>
  <chapter number="1" style="c" sid="PSA 1" />
  <para style="q1">
    <verse number="1" style="v" sid="PSA 1:1" />Blessed is the man who doesn’t walk in the counsel of the wicked,</para>
  <para style="q2" vid="PSA 1:1">nor stand on the path of sinners,</para>
  <para style="q2" vid="PSA 1:1">nor sit in the seat of scoffers;<verse eid="PSA 1:1" /></para>
</usx>
`;
const defaultUsj = usxStringToUsj(emptyUsx);
const defaultScrRef = { book: "PSA", chapterNum: 1, verseNum: 1 };
const nodeOptions: UsjNodeOptions = { noteCallerOnClick: () => console.log("Note was clicked!") };
const options: EditorOptions = { isReadonly: false, textDirection: "ltr", nodes: nodeOptions };
// Word "man" inside first q1 of PSA 1:1.
const annotationRange1 = {
  start: { jsonPath: "$.content[3].content[1]", offset: 15 },
  end: { jsonPath: "$.content[3].content[1]", offset: 18 },
};
// Phrase "man who" inside first q1 of PSA 1:1.
const annotationRange2 = {
  start: { jsonPath: "$.content[3].content[1]", offset: 15 },
  end: { jsonPath: "$.content[3].content[1]", offset: 22 },
};
const cursorLocation = { start: { jsonPath: "$.content[3].content[1]", offset: 15 } };

export default function App() {
  const editorialRef = useRef<EditorRef | null>(null);
  const [scrRef, setScrRef] = useState(defaultScrRef);

  const handleUsjChange = useCallback((usj: Usj, comments: Comments | undefined) => console.log({ usj, comments }), []);

  // Simulate USJ updating after the editor is loaded.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      editorialRef.current?.setUsj(usxStringToUsj(usx));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, []);

  // Add and remove annotations after USJ is loaded, and set cursor location.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      editorialRef.current?.setAnnotation(annotationRange1, "spelling", "annotationId");
      editorialRef.current?.setAnnotation(annotationRange2, "grammar", "abc123");
      editorialRef.current?.removeAnnotation("spelling", "annotationId");
      editorialRef.current?.setSelection(cursorLocation);
    }, 3000);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <>
      <div className="controls">
        <BookChapterControl scrRef={scrRef} handleSubmit={setScrRef} />
      </div>
      <Editorial
        ref={editorialRef}
        defaultUsj={defaultUsj}
        scrRef={scrRef}
        onScrRefChange={setScrRef}
        onUsjChange={handleUsjChange}
        options={options}
        logger={console}
      />
    </>
  );
}
```

## Features

- USJ editor with USX support
- Read-only and edit mode
- History - undo & redo
- Cut, copy, paste, paste as plain text - context menu and keyboard shortcuts
- Format block type - change `<para>` markers. The current implementation is a proof-of-concept and doesn't have all the markers available yet.
- Insert markers - type '\\' (backslash - configurable to another key) for a marker menu. If text is selected first the marker will apply to the selection if possible, e.g. use '\\wj' to "red-letter" selected text.
- Add comments to selected text, reply in comment threads, delete comments and threads (deprecated).
  - To enable comments use the `<Marginal />` editor component (comments appear in the margin).
  - To use the editor without comments use the `<Editorial />` component.
- Add and remove different types of annotations. Style the different annotations types with CSS, e.g. style a spelling annotation with a red squiggly underline.
- Get and set the cursor location or selection range.
- Specify `textDirection` as `"ltr"`, `"rtl"`, or `"auto"` (`"auto"` is unlikely to be useful for minority languages).
- Insert note at selection, e.g. footnote, cross-reference. If text is selected it will be used as the quote in a footnote.
- BCV linkage - change the book/chapter/verse externally and the cursor moves; move the cursor and it updates the external book/chapter/verse
- Nodes supported `<book>`, `<chapter>`, `<verse>`, `<para>`, `<char>`, `<note>`, `<ms>`
- Nodes not yet supported `<table>`, `<row>`, `<cell>`, `<sidebar>`, `<periph>`, `<figure>`, `<optbreak>`, `<ref>`
- Node options:
  - callback for when a `<note>` link is clicked
  - customize possible note callers list
- Apply [Delta Operation](https://github.com/slab/delta) changes to the editor and see Delta Operations when changes are made in the editor. For use with realtime collaborative editing.

## Styling

This npm package does not include styling so you need to style the editor component to suit your application. A good place to start is to copy the **CSS** from this repo:

- Scripture Nodes [/packages/platform/src/usj-nodes.css](/packages/platform/src/usj-nodes.css)
- Editor [/packages/platform/src/editor/editor.css](/packages/platform/src/editor/editor.css)
- Marker Menu [/libs/shared/styles/nodes-menu.css](/libs/shared/styles/nodes-menu.css)

For **icon assets** for the editor referenced in `editor.css` (the license file is included):

- [/packages/platform/assets](/packages/platform/assets)

If using the **commenting features** in the `<Marginal />` component:

- [/packages/platform/src/marginal/comments/ui/Button.css](/packages/platform/src/marginal/comments/ui/Button.css)
- [/packages/platform/src/marginal/comments/ui/ContentEditable.css](/packages/platform/src/marginal/comments/ui/ContentEditable.css)
- [/packages/platform/src/marginal/comments/ui/Modal.css](/packages/platform/src/marginal/comments/ui/Modal.css)
- [/packages/platform/src/marginal/comments/ui/Placeholder.css](/packages/platform/src/marginal/comments/ui/Placeholder.css)
- [/packages/platform/src/marginal/comments/comment-editor.theme.css](/packages/platform/src/marginal/comments/comment-editor.theme.css)
- [/packages/platform/src/marginal/comments/CommentPlugin.css](/packages/platform/src/marginal/comments/CommentPlugin.css)

### Annotation Styles

Annotations are added with a specific `type` via the editor's reference API (see [Editorial Ref](#editorial-ref)). This `type` can then be used to apply custom CSS styles (e.g., a green squiggly underline for a _"grammar"_ type annotation). The CSS classname for an annotation takes the form of `.${annotationPrefix}-external-${type}`, where `type` is the string you pass to the `setAnnotation()` method and `annotationPrefix` is set by `config.theme.typedMark` (defaults to _"editor-typed-mark"_). If annotations overlap with each other an additional CSS classname is added where `annotationPrefix` is set by `config.theme.typedMarkOverlap` (defaults to _"editor-typed-markOverlap"_).

For example, if an annotation of type _"grammar"_ is overlapping it will have both CSS classnames `editor-typed-mark-external-grammar` and `editor-typed-markOverlap-external-grammar`. If it's not overlapping it still has the first classname. Annotations and comments are the same when considering if it's overlapping.

### Comment Styles

These follow a similar patter to [Annotation Styles](#annotation-styles). If a comment is overlapping it will have both CSS classnames `editor-typed-mark-internal-comment` and `editor-typed-markOverlap-internal-comment`. If it's not overlapping it still has the first classname. Annotations and comments are the same when considering if it's overlapping.

## `<Editorial />` API

### Editorial Properties

```ts
/** Props for the Editor component that provides Scripture editing functionality. */
export interface EditorProps<TLogger extends LoggerBasic> {
  /** Initial Scripture data in USJ format. */
  defaultUsj?: Usj;
  /** Scripture reference that controls the general cursor location of the Scripture. */
  scrRef?: SerializedVerseRef;
  /** Callback function when the Scripture reference has changed. */
  onScrRefChange?: (scrRef: SerializedVerseRef) => void;
  /** Callback function when the cursor selection changes. */
  onSelectionChange?: (selection: SelectionRange | undefined) => void;
  /** Callback function when USJ Scripture data has changed. */
  onUsjChange?: (usj: Usj, ops?: DeltaOp[], source?: DeltaSource, insertedNodeKey?: string) => void;
  /** Callback function when state changes. */
  onStateChange?: ({ canUndo, canRedo, blockMarker, contextMarker }: StateChangeSnapshot) => void;
  /** Options to configure the editor. */
  options?: EditorOptions;
  /** Logger instance. */
  logger?: TLogger;
}
```

### Editorial Ref

```ts
/** Forward reference for the editor. */
export interface EditorRef {
  /** Focus the editor. */
  focus(): void;
  /** Undo the last action. */
  undo(): void;
  /** Redo the last undone action. */
  redo(): void;
  /** Cut the selected text. */
  cut(): void;
  /** Copy the selected text. */
  copy(): void;
  /** Paste text at the current cursor position. */
  paste(): void;
  /** Paste text as plain text at the current cursor position. */
  pastePlainText(): void;
  /** Get USJ Scripture data. */
  getUsj(): Usj | undefined;
  /** Set the USJ Scripture data. */
  setUsj(usj: Usj): void;
  /** EXPERIMENTAL: Apply Operational Transform delta update. */
  applyUpdate(ops: DeltaOp[], source?: DeltaSource): void;
  /**
   * EXPERIMENTAL: Replace an embed Operational Transform delta.
   *
   * @remarks Embed nodes are treated as atomic units. These include chapter nodes, verse nodes,
   *   milestone nodes, note nodes, and unmatched nodes.
   *
   * @param embedNodeKey - The editor key of the embed node to replace.
   * @param insertEmbedOps - The delta operations that insert the new embed node.
   */
  replaceEmbedUpdate(embedNodeKey: string, insertEmbedOps: DeltaOp[]): void;
  /**
   * Get the selection location or range.
   * @returns the selection location or range, or `undefined` if there is no selection. The
   *   json-path in the selection assumes no comment Milestone nodes are present in the USJ.
   */
  getSelection(): SelectionRange | undefined;
  /**
   * Set the selection location or range.
   * @param selection - A selection location or range. The json-path in the selection assumes no
   *   comment Milestone nodes are present in the USJ.
   */
  setSelection(selection: SelectionRange): void;
  /**
   * Set an ephemeral annotation.
   * @param selection - An annotation range containing the start and end location. The json-path in
   *   an annotation location assumes no comment Milestone nodes are present in the USJ.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   * @param onClick - Optional onClick handler.
   * @param onRemove - Optional onRemove handler.
   */
  setAnnotation(
    selection: AnnotationRange,
    type: string,
    id: string,
    onClick?: TypedMarkOnClick,
    onRemove?: TypedMarkOnRemove,
  ): void;
  /**
   * Remove an ephemeral annotation.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   */
  removeAnnotation(type: string, id: string): void;
  /** Format the paragraph at the current cursor position with the given block marker. */
  formatPara(blockMarker: string): void;
  /** Get the editor element for the given node key, if any. */
  getElementByKey(nodeKey: string): HTMLElement | undefined;
  /**
   * Insert a note at the specified selection, e.g. footnote, cross-reference, endnote.
   * @param marker - The marker type for the note.
   * @param caller - Optional note caller to override the default for the given marker.
   * @param selection - Optional selection range where the note should be inserted. By default it
   *   will use the current selection in the editor.
   * @throws Will throw an error if the marker is not a valid note marker.
   */
  insertNote(marker: string, caller?: string, selection?: SelectionRange): void;
  /**
   * EXPERIMENTAL: Select the note by editor key or at the given index in the editor, if any.
   * @param noteKeyOrIndex - The note key or index, e.g. index=1 would select the second note in the
   *   editor.
   */
  selectNote(noteKeyOrIndex: string | number): void;
  /**
   * EXPERIMENTAL: Get the note operations by editor key or at the given index in the editor, if any.
   * @param noteKeyOrIndex - The note key or index, e.g. index=1 would get the second note in the
   *   editor.
   */
  getNoteOps(noteKeyOrIndex: string | number): DeltaOp[] | undefined;
  /** Ref to the end of the toolbar - INTERNAL USE ONLY to dynamically add controls in the toolbar. */
  toolbarEndRef: RefObject<HTMLElement | null> | null;
}
```

### Editorial Options

```ts
/** Options to configure the editor. */
export interface EditorOptions {
  /** Is the editor readonly or editable. */
  isReadonly?: boolean;
  /** Does the editor have external UI controls so disable the built-in toolbar and context menu. */
  hasExternalUI?: boolean;
  /** Is the editor enabled for spell checking. */
  hasSpellCheck?: boolean;
  /** Text direction: "ltr" | "rtl" | "auto". */
  textDirection?: TextDirection;
  /** Key to trigger the marker menu. Defaults to '\'. */
  markerMenuTrigger?: string;
  /** Options for some editor nodes. */
  nodes?: UsjNodeOptions;
  /** EXPERIMENTAL: View options. Defaults to the formatted view mode which is currently the only functional option. */
  view?: ViewOptions;
  /** EXPERIMENTAL: Is the editor being debugged using the TreeView. */
  debug?: boolean;
}
```

### Node Options

In `EditorOptions.nodes`, you can set the list of possible note callers to what ever you need for the vernacular language being edited. The note callers option defaults to:

```ts
import { EditorOptions, UsjNodeOptions } from "@eten-tech-foundation/platform-editor";

const nodes: UsjNodeOptions = { noteCallers: ["a", "b", "c", ... , "x", "y", "z"] };
const options: EditorOptions = { nodes };
```

You can also set an onClick handler:

```ts
import { EditorOptions, GENERATOR_NOTE_CALLER, HIDDEN_NOTE_CALLER, UsjNodeOptions } from "@eten-tech-foundation/platform-editor";

const nodes: UsjNodeOptions = {
  {
    noteCallerOnClick: (event, noteNodeKey, isCollapsed, getCaller, setCaller, getNoteOps) => {
      if (isCollapsed) return;

      console.log("expanded note node clicked - toggle caller");
      const caller = getCaller();
      if (caller === GENERATOR_NOTE_CALLER) setCaller(HIDDEN_NOTE_CALLER);
      else setCaller(GENERATOR_NOTE_CALLER);
    }
  };
const options: EditorOptions = { nodes };
```

## `<Marginal />` API (DEPRECATED)

These are the same as Editorial except where noted below. See [Editorial API](#editorial--api).

## Marginal deprecation and migration

`<Marginal />` is in maintenance mode. The component continues to ship for backwards compatibility, but it will be removed in a future release. Prefer `<Editorial />` or an alternative commenting
workflow if you can.

If you must continue using `<Marginal />`, watch release notes for the removal timeline and plan a migration away from the margin-based commenting experience.

### Marginal Properties

Inherits from the [Editorial Properties](#editorial-properties).

```ts
export interface MarginalProps<TLogger extends LoggerBasic>
  extends Omit<EditorProps<TLogger>, "onUsjChange"> {
  /** Callback function when comments have changed. */
  onCommentChange?: (comments: Comments | undefined) => void;
  /** Callback function when USJ Scripture data has changed. */
  onUsjChange?: (
    usj: Usj,
    comments: Comments | undefined,
    ops?: DeltaOp[],
    source?: DeltaSource,
    insertedNodeKey?: string,
  ) => void;
  /** Container ref for the show comments button - overrides internal toolbarEndRef if provided. */
  showCommentsContainerRef?: RefObject<HTMLElement | null> | null;
}
```

### Marginal Ref

Inherits from the [Editorial Ref](#editorial-ref).

```ts
/** Forward reference for the editor. */
export interface MarginalRef extends EditorRef {
  /** Set the comments to accompany USJ Scripture. */
  setComments?(comments: Comments): void;
}
```

## Demo and Collaborative Web Development Environment

Thanks to [CodeSandbox](https://codesandbox.io/) for the instant dev environment: https://codesandbox.io/p/github/eten-tech-foundation/scripture-editors/main

This package is the third tab (`dev:platform:5175`).

OR

To run the demo app locally, first follow the [Developer Quick Start](/README.md#developer-quick-start), but instead of running the last step, instead run:

```sh
nx dev platform
```

## Develop in App

To develop an editor in a target application you can use [yalc](https://www.npmjs.com/package/yalc) to link the editor in without having to publish to NPM every time something changes.

1. In this monorepo, publish the editor to `yalc`, e.g.:
   ```bash
   nx devpub platform
   ```
2. In the target application repo, link from `yalc`:
   ```bash
   yalc link @eten-tech-foundation/platform-editor
   ```
3. In this monorepo, make changes and re-publish the editor (see step 1).
4. When you have finished developing in the target application repo, unlink from `yalc`:
   ```bash
   yalc remove @eten-tech-foundation/platform-editor && npm i
   ```

## License

[MIT][github-license] © [ETEN Tech Foundation](https://missionmutual.org)

<!-- define variables used above -->

[github-actions-status]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/test-publish.yml/badge.svg
[github-actions-url]: https://github.com/eten-tech-foundation/scripture-editors/actions
[gitghub-codeql-status]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/codeql.yml/badge.svg
[gitghub-codeql-url]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/codeql.yml
[npm-version-image]: https://img.shields.io/npm/v/@eten-tech-foundation/platform-editor
[npm-version-url]: https://github.com/eten-tech-foundation/scripture-editors/releases
[github-license]: https://github.com/eten-tech-foundation/scripture-editors/blob/main/packages/platform/LICENSE
