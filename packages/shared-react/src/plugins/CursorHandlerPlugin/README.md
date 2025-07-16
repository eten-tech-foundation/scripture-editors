# CursorHandlerPlugin

The CursorHandlerPlugin is a React component that integrates the CursorHandler functionality from the shared package into a Lexical Editor within a React application.

## Overview

The plugin manages cursor behavior enabling users to accurately position their cursor anywhere within a document, regardless of browser compatibility. This resolves longstanding issues such as the inability to place the cursor inside empty elements.

## Usage

To use the CursorHandlerPlugin in your React application, import it and add it to your LexicalComposer:

```jsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { CursorHandlerPlugin } from 'path/to/CursorHandlerPlugin';

function Editor() {
  return (
    <LexicalComposer initialConfig={...}>
      {/* Other plugins */}
      <CursorHandlerPlugin />
      {/* Editor content */}
    </LexicalComposer>
  );
}
```

## Props

The CursorHandlerPlugin accepts the following optional props:

- `canContainPlaceHolder`: A function that returns boolean value indicating whether a node can contain a cursor placeholder.
  - Type: `(node: LexicalNode) => boolean`
  - Default: `undefined`

- `updateTags`: An array of update tags to be added to the editor update when a placeholder is inserted or removed.
  - Type: `string[]`
  - Default: `undefined`

## Example

Here's an example of how to use the CursorHandlerPlugin with custom props:

```jsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { CursorHandlerPlugin } from 'path/to/CursorHandlerPlugin';
import { $isTextNode } from 'lexical';

function Editor() {
  const canContainPlaceHolder = (node) => $isTextNode(node);
  const updateTags = ['cursor-update', 'history-merge'];

  return (
    <LexicalComposer initialConfig={...}>
      {/* Other plugins */}
      <CursorHandlerPlugin
        canContainPlaceHolder={canContainPlaceHolder}
        updateTags={updateTags}
      />
      {/* Editor content */}
    </LexicalComposer>
  );
}
```

## How It Works

For more detailed information about the underlying CursorHandler functionality, please refer to the README in the `packages/shared/plugins/CursorHandler/` directory.
