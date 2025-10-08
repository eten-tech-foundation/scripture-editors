# API Documentation

## Components

### ScripturalEditorComposer

The main component that sets up the editor environment.

```tsx
import { ScripturalEditorComposer } from "@scriptural/react";

<ScripturalEditorComposer initialConfig={config}>{children}</ScripturalEditorComposer>;
```

#### Props

- `initialConfig: ScripturalInitialConfigType`

  ```typescript
  type ScripturalInitialConfigType = {
    bookCode: string;
    usj?: UsjDocument;
    initialLexicalState?: null | string | EditorState | ((editor: LexicalEditor) => void);
    onError: (error: Error, editor: LexicalEditor) => void;
    editable?: boolean;
    theme?: EditorThemeClasses;
    nodes?: LexicalNode[];
    initialSettings?: EditorSettings;
  };
  ```

  > [!NOTE]
  > You cannot provide both `usj` and `initialLexicalState` at the same time.

- `children: React.ReactNode`

### Toolbar Components

#### ToolbarDefault

A pre-configured toolbar with common editing actions.

```tsx
import { ToolbarDefault } from "@scriptural/react";

<ToolbarDefault onSave={(usj) => handleSave(usj)} />;
```

Props:

- `onSave?: (usj: UsjDocument | UsjNode | string) => void`

#### ToolbarContainer

Container component for toolbar items.

```tsx
import { ToolbarContainer } from "@scriptural/react";

<ToolbarContainer>{children}</ToolbarContainer>;
```

Props:

- Extends `React.HTMLAttributes<HTMLDivElement>`

#### ToolbarSection

Section component for grouping toolbar items.

```tsx
import { ToolbarSection } from "@scriptural/react";

<ToolbarSection>{children}</ToolbarSection>;
```

Props:

- Extends `React.HTMLAttributes<HTMLDivElement>`

#### Toolbar Buttons

- `HistoryButtons`: Undo/Redo buttons
- `SaveButton`: Save functionality with automatic change detection
- `ViewButton`: Toggle verse blocks view
- `FormatButton`: Toggle format markers
- `EnhancedCursorToggleButton`: Toggle enhanced cursor positioning
- `ContextMenuTriggerButton`: Configure context menu trigger key

#### SaveButton

The `SaveButton` provides built-in change detection and visual feedback for unsaved changes.

```tsx
import { SaveButton } from "@scriptural/react";

<SaveButton onSave={(usj) => handleSave(usj)} showUnsavedIndicator={true} title="Save">
  <SaveIcon />
</SaveButton>;
```

**Props:**

- `onSave?: (usj: UsjDocument | UsjNode | string) => void` - Callback when save is triggered
- `showUnsavedIndicator?: boolean` - Show visual indicator for unsaved changes (default: true)
- Extends all standard button HTML attributes

**Features:**

- **Automatic Change Detection**: Tracks changes at the USJ level (deterministic) rather than Lexical state (non-deterministic)
- **Visual Indicator**: Shows a red dot when there are unsaved changes
- **Smart Tracking**: Only detects actual content changes, not internal editor state changes
- **Integrated with History**: Works seamlessly with `HistoryPlugin` for undo/redo support

**How It Works:**

The library uses `SaveStateContext` internally to track the last saved USJ and compare it with the current editor state. This solves the [checksum inconsistency problem](https://github.com/pankosmia/core-client-workspace/issues/114) where Lexical's internal state is non-deterministic.

```typescript
// The SaveButton automatically:
// 1. Converts current editor state to USJ
// 2. Compares with last saved USJ
// 3. Shows indicator if different
// 4. Marks as saved after successful onSave callback
```

### Plugins

#### ContentEditablePlugin

Makes the editor content editable.

```tsx
import { ContentEditablePlugin } from "@scriptural/react";

<ContentEditablePlugin ref={editorRef} />;
```

Props:

- `ref: React.RefObject<HTMLDivElement>`

#### ScripturalNodesMenuPlugin

Provides context menu for inserting scripture-specific nodes.

```tsx
import { ScripturalNodesMenuPlugin } from "@scriptural/react";

<ScripturalNodesMenuPlugin trigger="\\" />;
```

Props:

- `trigger: string` - Character that triggers the context menu

#### CursorHandlerPlugin

Handles enhanced cursor positioning.

```tsx
import { CursorHandlerPlugin } from "@scriptural/react";

<CursorHandlerPlugin
  updateTags={["history-merge"]}
  canContainPlaceHolder={(node) => node.getType() !== "graft"}
/>;
```

Props:

- `updateTags: string[]`
- `canContainPlaceHolder: (node: LexicalNode) => boolean`

## Hooks

### useScripturalComposerContext

Access the editor's context.

```tsx
import { useScripturalComposerContext } from "@scriptural/react";

const {
  initialLexicalState,
  scripturalInitialConfig,
  selectedMarker,
  setSelectedMarker,
  scriptureReference,
  setScriptureReference,
  editorRef,
  getSettings,
  updateSettings,
} = useScripturalComposerContext();
```

Returns:

```typescript
interface ScripturalEditorContextType {
  initialLexicalState: null | string | EditorState | ((editor: LexicalEditor) => void);
  scripturalInitialConfig: ScripturalInitialConfigType;
  selectedMarker: string | undefined;
  setSelectedMarker: (marker: string | undefined) => void;
  scriptureReference: ScriptureReference | null;
  setScriptureReference: (ref: ScriptureReference | null) => void;
  editorRef: React.RefObject<HTMLDivElement>;
  getSettings: <T>(key: string) => T | undefined;
  updateSettings: (key: string, value: unknown) => void;
}
```

### useToolbarSettings

Manage toolbar-specific settings.

```tsx
import { useToolbarSettings } from "@scriptural/react";

const {
  enhancedCursorPosition,
  contextMenuTriggerKey,
  toggleEnhancedCursorPosition,
  updateContextMenuTriggerKey,
  toggleClass,
} = useToolbarSettings();
```

Returns:

```typescript
interface ScripturalToolbarSettings {
  enhancedCursorPosition: boolean;
  contextMenuTriggerKey: string;
  toggleEnhancedCursorPosition: () => void;
  updateContextMenuTriggerKey: (key: string) => void;
  toggleClass: (element: HTMLElement | null, className: string) => void;
}
```

### useScripturalMarkersForMenu

Hook for managing scriptural markers in the context menu.

```tsx
import { useScripturalMarkersForMenu } from "@scriptural/react";

const { markersMenuItems } = useScripturalMarkersForMenu({
  editor,
  scriptureReference,
  contextMarker,
  getMarkerAction,
});
```

Props:

```typescript
{
  editor: LexicalEditor;
  scriptureReference: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: typeof getScripturalMarkerAction;
}
```

## Styling

The package includes default styles that can be imported:

```tsx
import "@scriptural/react/styles/scriptural-editor.css";
```

### CSS Variables

Customize the editor appearance by overriding these CSS variables:

```css
:root {
  --editor-background-color: #fff;
  --editor-text-color: rgba(40, 40, 40, 0.87);
  --verse-marker-color: black;
  --chapter-marker-color: black;
  --title-color: orange;
  --pilcrow-color: rgb(0 0 0 / 25%);
}
```

### CSS Classes

Key CSS classes for styling:

- `.scriptural-editor`: Main editor container
- `.contentEditable`: Editable content area
- `.toolbar`: Toolbar container
- `.toolbar-section`: Toolbar section
- `.with-markers`: Shows USFM markers
- `.verse-blocks`: Displays verses in block format

## Additional Resources

For tutorials and guides on how to extend the editor (like creating custom settings plugins), please see [GUIDES.md](./GUIDES.md).
