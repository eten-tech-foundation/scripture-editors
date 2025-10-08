# Guides

This document contains tutorials and best practices for using the `@scriptural/react` package.

## Table of Contents

- [Guides](#guides)
  - [Table of Contents](#table-of-contents)
  - [Creating Settings Plugins](#creating-settings-plugins)
    - [Font Size Plugin Example](#font-size-plugin-example)
    - [Best Practices for Settings Plugins](#best-practices-for-settings-plugins)
  - [Tracking Unsaved Changes](#tracking-unsaved-changes)
    - [Basic Usage](#basic-usage)
    - [Advanced: Custom Change Tracking](#advanced-custom-change-tracking)
    - [Understanding the Problem](#understanding-the-problem)

## Creating Settings Plugins

This tutorial shows how to create a font size settings plugin and integrate it into the toolbar.

### Font Size Plugin Example

1. First, create the types and defaults for the font size settings:

```typescript
// plugins/FontSizePlugin/types.ts
export interface FontSizeSettings {
  fontSize: number;
}

export const FONT_SIZE_SETTINGS = {
  fontSize: "fontSize.size",
} as const;

export const DEFAULT_FONT_SIZE_SETTINGS: FontSizeSettings = {
  fontSize: 16,
};

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24] as const;
```

2. Create a hook to manage the font size settings:

```typescript
// plugins/FontSizePlugin/useFontSizeSettings.ts
import { useCallback } from "react";
import { useScripturalComposerContext } from "@scriptural/react";
import { FONT_SIZE_SETTINGS, DEFAULT_FONT_SIZE_SETTINGS } from "./types";

export function useFontSizeSettings() {
  const { getSettings, updateSettings } = useScripturalComposerContext();

  const fontSize = getSettings(FONT_SIZE_SETTINGS.fontSize) ?? DEFAULT_FONT_SIZE_SETTINGS.fontSize;

  const setFontSize = useCallback(
    (size: number) => {
      updateSettings(FONT_SIZE_SETTINGS.fontSize, size);
    },
    [updateSettings],
  );

  return {
    fontSize,
    setFontSize,
  };
}
```

3. Create a toolbar button component for font size:

```typescript
// plugins/FontSizePlugin/FontSizeButton.tsx
import { useEffect } from 'react';
import { useFontSizeSettings } from './useFontSizeSettings';
import { FONT_SIZE_OPTIONS } from './types';

export function FontSizeButton() {
  const { fontSize, setFontSize } = useFontSizeSettings();

  // Apply font size to editor
  useEffect(() => {
    const editor = document.querySelector('.contentEditable');
    if (editor) {
      editor.style.fontSize = `${fontSize}px`;
    }
  }, [fontSize]);

  return (
    <div className="toolbar-button-with-dropdown">
      <button className="toolbar-button">
        <i>format_size</i>
        <span>{fontSize}px</span>
      </button>
      <div className="toolbar-dropdown">
        {FONT_SIZE_OPTIONS.map((size) => (
          <button
            key={size}
            onClick={() => setFontSize(size)}
            className={fontSize === size ? 'active' : ''}
          >
            {size}px
          </button>
        ))}
      </div>
    </div>
  );
}
```

4. Add styles for the font size button:

```css
/* styles/scriptural-editor.css */
.toolbar-button-with-dropdown {
  position: relative;
  display: inline-block;
}

.toolbar-button-with-dropdown .toolbar-button {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-button-with-dropdown .toolbar-button span {
  font-size: 0.8rem;
}

.toolbar-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.toolbar-button-with-dropdown:hover .toolbar-dropdown {
  display: flex;
  flex-direction: column;
}

.toolbar-dropdown button {
  padding: 8px 16px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.toolbar-dropdown button:hover {
  background: #f5f5f5;
}

.toolbar-dropdown button.active {
  background: #e0e0e0;
}
```

5. Add the font size button to the toolbar:

```typescript
// plugins/ToolbarPlugin/index.tsx
import { FontSizeButton } from '../FontSizePlugin/FontSizeButton';

export function ToolbarDefault({ onSave }: { onSave?: ScripturalToolbarSettings["onSave"] }) {
  return (
    <ToolbarContainer>
      <ToolbarSection>
        <HistoryButtons />
        <hr />
        <SaveButton onSave={onSave} />
        <hr />
        <ViewButton />
        <FormatButton />
        <FontSizeButton /> {/* Add the font size button */}
        <EnhancedCursorToggleButton />
        <hr />
      </ToolbarSection>
      <ToolbarSection>
        <ContextMenuTriggerButton />
        <MarkerInfo />
        <ScriptureReferenceInfo />
        <hr />
      </ToolbarSection>
      <ToolbarMarkerSections />
    </ToolbarContainer>
  );
}
```

6. Initialize the settings in your editor:

```typescript
import { ScripturalEditorComposer } from '@scriptural/react';
import { DEFAULT_FONT_SIZE_SETTINGS } from './plugins/FontSizePlugin/types';

function Editor() {
  const initialConfig = {
    // ... other config options ...
    initialSettings: {
      ...DEFAULT_FONT_SIZE_SETTINGS,
      // Override default if needed
      "fontSize.size": 18,
    },
  };

  return (
    <ScripturalEditorComposer initialConfig={initialConfig}>
      <ToolbarDefault />
      {/* Other plugins */}
    </ScripturalEditorComposer>
  );
}
```

### Best Practices for Settings Plugins

1. **Namespacing**: Use descriptive, namespaced keys for settings to avoid conflicts:

   ```typescript
   const SETTINGS = {
     fontSize: "fontSize.size",
     fontFamily: "fontSize.family",
   };
   ```

2. **Type Safety**: Define interfaces for your settings:

   ```typescript
   interface Settings {
     fontSize: number;
     fontFamily: string;
   }
   ```

3. **Default Values**: Always provide sensible defaults:

   ```typescript
   const DEFAULT_SETTINGS = {
     fontSize: 16,
     fontFamily: "Arial",
   };
   ```

4. **UI Integration**: Follow the toolbar's design patterns:

   - Use Material Icons for consistency
   - Follow the existing button styles
   - Use dropdowns for multiple options
   - Add appropriate hover states and active indicators

5. **Performance**: Use `useCallback` for functions and `useEffect` for side effects:

   ```typescript
   const setFontSize = useCallback(
     (size: number) => {
       updateSettings(SETTINGS.fontSize, size);
     },
     [updateSettings],
   );

   useEffect(() => {
     // Apply settings changes
   }, [settingValue]);
   ```

## Tracking Unsaved Changes

The library provides built-in support for tracking unsaved changes using deterministic USJ comparison rather than non-deterministic Lexical state comparison.

### Basic Usage

The `SaveButton` component automatically tracks unsaved changes:

```tsx
import {
  ScripturalEditorComposer,
  SaveButton,
  HistoryPlugin,
  ToolbarContainer,
  ToolbarSection,
} from "@scriptural/react";

function MyEditor() {
  const handleSave = (usj) => {
    // Save your USJ document
    console.log("Saving:", usj);
    // e.g., send to API, save to localStorage, etc.
  };

  return (
    <ScripturalEditorComposer initialConfig={initialConfig}>
      <ToolbarContainer>
        <ToolbarSection>
          <SaveButton onSave={handleSave}>
            <SaveIcon />
          </SaveButton>
        </ToolbarSection>
      </ToolbarContainer>

      {/* Add HistoryPlugin for undo/redo and change tracking */}
      <HistoryPlugin />

      {/* Your other content */}
    </ScripturalEditorComposer>
  );
}
```

**What you get automatically:**

- ✅ Visual indicator (red dot) when there are unsaved changes
- ✅ Automatic comparison at USJ level (deterministic)
- ✅ Works with undo/redo operations
- ✅ Only tracks actual content changes, not cursor movements

### Advanced: Custom Change Tracking

If you need custom logic when changes occur, use the `useSaveStateTracking` hook with `HistoryPlugin`:

```tsx
import {
  ScripturalEditorComposer,
  SaveButton,
  HistoryPlugin,
  useSaveStateTracking,
  useSaveState,
} from "@scriptural/react";

function EditorWithCustomTracking() {
  // Custom handler that runs on every change
  const handleHistoryChange = useSaveStateTracking((args) => {
    const { editorChanged, tags } = args;

    if (editorChanged) {
      console.log("Editor content changed!");
      // Your custom logic here
    }
  });

  return (
    <ScripturalEditorComposer initialConfig={initialConfig}>
      <EditorContent />

      {/* Pass the enhanced onChange to HistoryPlugin */}
      <HistoryPlugin onChange={handleHistoryChange} />
    </ScripturalEditorComposer>
  );
}

function EditorContent() {
  // Access save state anywhere in your editor
  const { hasUnsavedChanges, checkForChanges, markAsSaved } = useSaveState();

  useEffect(() => {
    if (hasUnsavedChanges) {
      console.log("Warning: You have unsaved changes");
      // Show a warning, update UI, etc.
    }
  }, [hasUnsavedChanges]);

  const handleManualSave = () => {
    // Your save logic
    markAsSaved(); // Manually mark as saved
  };

  return (
    <div>
      {hasUnsavedChanges && <div className="warning">Unsaved changes!</div>}
      <button onClick={handleManualSave}>Save</button>
    </div>
  );
}
```

### Understanding the Problem

**Why USJ comparison instead of Lexical state?**

Lexical's internal editor state is **non-deterministic**. The same logical content can produce different JSON representations due to:

1. **Internal "dirty nodes" tracking** - Lexical maintains metadata about which nodes have been modified
2. **Selection state** - Cursor position affects the state structure
3. **Undo/redo stack** - History operations don't perfectly restore the exact same internal structure

This causes issues like those described in [this GitHub issue](https://github.com/pankosmia/core-client-workspace/issues/114) where:

- Adding and then removing a character doesn't return to the original checksum
- Clicking in the editor changes the state even without content changes
- Comparing raw Lexical JSON produces false positives for "changes"

**Our Solution:**

We compare at the **USJ (Unified Scripture JSON) level** instead:

```typescript
// ❌ Don't do this (non-deterministic):
const lexicalState1 = editor.getEditorState().toJSON();
const lexicalState2 = editor.getEditorState().toJSON();
// These might be different even with same content!

// ✅ Do this instead (deterministic):
const usj1 = serializedLexicalToUsjNode(lexicalState1.root);
const usj2 = serializedLexicalToUsjNode(lexicalState2.root);
// These will only differ if actual content changed
```

**Benefits:**

- ✅ **Deterministic** - Same content always produces same USJ
- ✅ **Content-focused** - Only tracks actual content changes
- ✅ **Canonical** - USJ is your output format anyway
- ✅ **Reliable** - No false positives from internal editor metadata

This approach is automatically handled by the library when you use `SaveButton` or `useSaveState` hooks.
