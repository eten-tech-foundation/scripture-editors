# Changelog

All notable changes to the `@scriptural/react` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.18] - 2025-01-08

### Added

- **SaveStateContext**: New context provider for tracking save state using deterministic USJ comparison

  - Provides `useSaveState()` hook with `hasUnsavedChanges`, `checkForChanges`, `markAsSaved`, `getCurrentUsj`, and `getSavedUsj`
  - Automatically integrated into `ScripturalEditorComposer`
  - Solves the checksum inconsistency problem by comparing canonical USJ output instead of non-deterministic Lexical state

- **SaveStatePlugin**: New plugin for integrating save state tracking with history changes

  - Provides `useSaveStateTracking()` hook to wrap `HistoryPlugin` onChange callbacks
  - Automatically triggers USJ comparison on content changes
  - Ignores non-content changes (cursor movements, selection changes)

- **Enhanced SaveButton**:

  - Now includes automatic unsaved changes detection
  - Shows visual indicator (red dot) when there are unsaved changes
  - Automatically marks content as saved after successful `onSave` callback
  - New optional prop: `showUnsavedIndicator` (default: true)
  - Handles async save operations

- **Visual Feedback**: Added CSS styling for unsaved changes indicator

  - `.has-unsaved-changes` class with red dot indicator
  - Positioned in top-right corner of save button with subtle shadow

- **Documentation**:
  - Added comprehensive "Tracking Unsaved Changes" section to GUIDES.md
  - Updated API.md with detailed SaveButton documentation
  - Includes examples for both basic and advanced usage patterns
  - Explains the technical solution to the checksum inconsistency problem

### Changed

- **ScripturalEditorComposer**: Now wraps content with `SaveStateProvider` for automatic save state tracking
- **SaveButton**: Enhanced to use `SaveStateContext` internally for change detection
- Exported `SaveStateContext` and related hooks from package index

### Fixed

- **Checksum Inconsistency**: Resolved the issue where Lexical's internal state produced different checksums for the same logical content
  - Previously, adding and removing a character would not return to the original checksum
  - Clicking in the editor would change state even without content changes
  - Raw Lexical JSON comparison produced false positives for "changes"
  - Now uses deterministic USJ comparison which only detects actual content changes

### Technical Details

**Problem Solved**: Lexical's internal editor state is non-deterministic due to:

- Internal "dirty nodes" tracking metadata
- Selection state affecting structure
- Undo/redo stack not perfectly restoring exact internal structure

**Solution**: Compare at the USJ (Unified Scripture JSON) level instead of Lexical state level:

- USJ is deterministic - same content always produces same structure
- USJ is canonical - it's the output format
- USJ comparison only tracks actual content changes, not internal editor metadata

**Architecture**:

```
User edits → HistoryPlugin → useSaveStateTracking → SaveStateContext
  → USJ comparison → hasUnsavedChanges state → SaveButton visual indicator
```

### Migration Guide

**For Library Consumers:**

If you previously implemented custom change tracking:

```tsx
// Before (custom implementation)
const { hasUnsavedChanges, handleSave } = useUnsavedChanges(editor, onSave);

// After (use library's built-in support)
import { SaveButton } from "@scriptural/react";

<SaveButton onSave={(usj) => handleSave(usj)}>
  <SaveIcon />
</SaveButton>;

// Or access state anywhere
const { hasUnsavedChanges } = useSaveState();
```

No breaking changes - the enhancement is backward compatible. Existing `SaveButton` usage continues to work, with added change detection functionality.

### References

- Addresses issue: https://github.com/pankosmia/core-client-workspace/issues/114
- Related: Lexical editor state non-determinism in history operations
