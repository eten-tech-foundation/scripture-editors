# CursorHandler

The CursorHandler is a plugin for Lexical Editor that manages cursor behavior and selection within an editor. It provides utilities and functionality for handling cursor-related operations.

## Usage

To use the CursorHandler in your project, import the necessary functions and constants:

```ts
import { registerCursorHandlers } from "shared/plugins/CursorHandler";
```

## Configuration

The `registerCursorHandlers` function requires an editor instance as an argument.

```ts
const editor = createEditor(config);
registerCursorHandlers(editor);
```

## API

### registerCursorHandlers()

Registers the CursorHandler with the provided LexicalEditor instance.

#### Type

```ts
registerCursorHandlers(
  editor: LexicalEditor;
  canHavePlaceholder?: (node: LexicalNode) => boolean;
  updateTags?: string[],
) => CleanupFunction;
```

#### Parameters

- `editor`: The LexicalEditor instance to register the CursorHandler with.
- `canHavePlaceholder`: A function that returns boolean value indicating whether a node can contain a cursor placeholder. Defaults to `() => true`.
- `updateTags`: An array of update tags to be added to the editor update when a placeholder is inserted or removed.

## How It Works

The Lexical CursorHandler plugin addresses a common challenge in rich text editors: inaccurate cursor placement in certain scenarios. By strategically inserting and removing zero-width space characters (placeholders), it ensures that the cursor can be positioned precisely anywhere within your content.

### Placeholder Insertion

As the user navigates the document using the keyboard, the CursorHandler identifies locations where the browser might not allow a cursor (e.g., within empty elements or specific text nodes). At these points, it inserts a zero-width space character, which is invisible to the user but serves as a placeholder for the cursor.

### Dynamic Adjustment

As the user moves the cursor, the CursorHandler checks the current position. If the placeholder is no longer needed, it's removed. If the cursor moves to a location that requires a placeholder, one is inserted or repositioned accordingly.

### Customizable behavior

The CursorHandler is designed to be flexible and can be configured by passing a `canHavePlaceholder` filter callback function to determine if a node can have a placeholder and an `updateTags` parameter which declares tags that will be attached to the editor update when a placeholder is inserted or removed, allowing for external handling of the placeholder insertion/removal events.

## Benefits

- **Enhanced User Experience:** Provides a more intuitive and consistent cursor behavior, eliminating frustration caused by inaccurate placement.
- **Cross-Browser Compatibility:** Ensures reliable cursor positioning across different browsers, resolving longstanding issues.
- **Improved Editing Efficiency:** Allows users to easily navigate and modify content without unexpected cursor jumps or limitations.
