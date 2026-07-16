# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Prerequisites

- Install [Volta](https://docs.volta.sh/guide/getting-started) for Node.js/PNPM version management
- Install Nx globally: `npm i -g nx`
- Install dependencies: `pnpm install`

### Volta Compatibility (Claude Code)

VS Code resolves Volta's shims to direct binary paths and prepends them to `PATH`, bypassing project-level version pinning. Claude Code compounds this by capturing the broken `PATH` in a shell snapshot that replays before every Bash command.

A `PreToolUse` hook in `.claude/settings.json` runs `scripts/volta-fix-snapshot.sh` before each Bash command. The script reads the project's `volta` pins from `package.json` and patches the snapshot so the correct Volta image paths are used. No per-machine setup is required — the hook and script are committed to the repo.

**Not needed on Windows** — Volta's native `.cmd` shims work correctly there.

**Fallback:** If the hook is not active, prefix commands with `volta run`:

```bash
volta run node --version           # Uses project-pinned Node
volta run pnpm nx test shared      # nx via project-pinned pnpm/node
```

### Core Development Commands

```bash
# Start development server for specific package
nx dev <package-name>               # e.g., nx dev perf-react, nx dev platform, nx dev scribe

# Build packages
nx build <package-name>             # Build specific package
nx run-many -t build               # Build all packages

# Testing
nx test <package-name>              # Run tests for specific package
nx run-many -t test                # Run all tests
nx test <package-name> --watch     # Run tests in watch mode

# Linting and Type Checking
nx run-many -t lint                # Lint all packages
nx run-many -t typecheck           # Type check all packages
nx format:check                    # Check formatting
nx format:write                    # Fix formatting

# API extraction (run after changing a package's public API)
nx extract-api <package-name>      # Update API report for specific package
nx run-many -t extract-api         # Update API reports for all packages

# Development environments
nx dev perf-react                  # React-based PERF editor
nx dev perf-vanilla                # Vanilla JS PERF editor
nx dev platform                    # Platform.Bible scripture editor
nx dev scribe                      # Scribe scripture editor
```

### Package-specific Commands

```bash
# Platform package
nx dev platform                    # Development server
nx dev:test platform               # Development with testing environment

# Scribe package
nx dev scribe                      # Development server

# PERF packages
nx dev perf-react                  # React PERF editor
nx dev perf-vanilla                # Vanilla JS PERF editor
```

## Architecture Overview

### Monorepo Structure

This is an Nx monorepo containing multiple scripture editor packages that share common functionality:

- **`libs/shared`**: Core framework-agnostic editor functionality (nodes, plugins, converters)
- **`libs/shared-react`**: React-specific components and plugins extending shared functionality
- **`packages/platform`**: Scripture editor for Platform.Bible with commenting and collaboration features
- **`packages/scribe`**: Lightweight scripture editor for Scribe application
- **`demos/perf-react`**: React-based editor for PERF format with performance optimizations
- **`demos/perf-vanilla`**: Vanilla JS editor for PERF format
- **`packages/utilities`**: Data format conversion utilities (USJ/USX/USFM)

### Core Technologies

- **Lexical**: Facebook's extensible text editor framework (v0.43.0)
- **React**: UI framework for React-based packages (v19.1.0)
- **TypeScript**: Primary development language
- **Nx**: Monorepo build system and task runner
- **Vite**: Build tool and development server
- **Vitest**: Testing framework

### Data Formats

The editors work with multiple scripture data formats:

- **USJ (Universal Scripture JSON)**: Primary internal format - JSON representation of USFM/USX
- **USFM**: Unified Standard Format Markers - plain text markup for scripture
- **USX**: XML version of USFM
- **PERF**: Performance format for efficient operations on large documents

### Key Architectural Patterns

#### Node System

Custom Lexical nodes for scripture content:

- **USJ Nodes**: `BookNode`, `ChapterNode`, `VerseNode`, `CharNode`, `ParaNode`, `NoteNode`
- **Feature Nodes**: `MarkerNode`, `UnknownNode`, `TypedMarkNode`
- **Immutable Nodes**: For read-only content like chapter/verse references

#### Plugin Architecture

Modular plugin system for editor functionality:

- **Core Plugins** (`libs/shared/plugins/`): `CursorHandler`, `History`, `PerfHandlers`, `Typeahead`
- **React Plugins** (`libs/shared-react/plugins/`): React-specific implementations and UI components
- **Package-specific Plugins**: Extended functionality for each editor application

#### Data Transformation Pipeline

```
USFM ↔ USJ ↔ Lexical Editor State ↔ PERF ↔ USX
```

Adaptors handle conversion between formats:

- **USJ Adaptors**: Convert between USJ and Lexical editor state
- **PERF Adaptors**: Handle PERF format operations
- **Format Converters**: USFM/USX/USJ conversion utilities

### Package Dependencies

The packages follow a layered dependency structure:

```
utilities (base conversion utilities)
    ↓
shared (core editor functionality)
    ↓
shared-react (React-specific extensions)
    ↓
[platform, scribe, perf-react] (application-specific implementations)
```

### Development Workflow

1. **Starting Development**: Use `nx dev <package-name>` to start development server
2. **Making Changes**: Edit files in the appropriate package directory
3. **Testing**: Run `nx test <package-name>` for specific package tests
4. **Linting**: Run `nx run-many -t lint` before committing
5. **Building**: Use `nx build <package-name>` to build specific packages
6. **API Changes**: Run `nx extract-api <package-name>` after changing a package's public API to update its API report

### Key Files and Directories

- **`libs/shared/nodes/`**: Core node implementations
- **`libs/shared/plugins/`**: Core plugin implementations
- **`libs/shared-react/nodes/`**: React-specific node extensions
- **`libs/shared-react/plugins/`**: React-specific plugin implementations
- **`packages/*/adaptors/`**: Data format conversion logic
- **`packages/*/editor/`**: Editor component implementations
- **`nx.json`**: Nx configuration with build targets and dependencies
- **`package.json`**: Root package configuration with workspace setup

### Scripture Format Handling

When working with scripture data:

- **USJ** is the primary internal format for editor state
- **USFM** is the common input/output format for scripture text
- **PERF** is used for performance-optimized operations
- Use the appropriate adaptors in each package's `adaptors/` directory for format conversion
- The `utilities` package provides core conversion functions between USJ/USX formats

### Testing Notes

- Tests use Vitest with React Testing Library for React components
- Test files are co-located with source files using `.test.ts` or `.test.tsx` extensions
- Run tests in watch mode during development: `nx test <package-name> --watch`
- Use `nx run-many -t test` to run all tests across packages

### Common Development Tasks

- **Adding new scripture node types**: Extend base nodes in `libs/shared/nodes/`
- **Creating React components**: Add to `libs/shared-react/` for reusable components
- **Package-specific features**: Implement in the appropriate package directory
- **Format conversion**: Use or extend adaptors in `packages/*/adaptors/`
- **Plugin development**: Follow the plugin pattern in `libs/shared/plugins/`

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Code Style

- Prefer `undefined` over `null` when representing missing values unless an API explicitly requires `null`.
- When building Lexical structures in tests, chain `.append(...)` calls inside `$getRoot().append(...)` so the code shape mirrors the resulting tree. Even when you need a local reference to a node, hoist only the bare `$createXNode(...)` to the variable and put the children inside the root chain — `para = $createParaNode("p"); $getRoot().append(para.append(...children));` — rather than the half-flat `para = $createParaNode("p").append(...); $getRoot().append(para);` shape.
- Construct Lexical nodes via `$create<X>Node` / `$create<X>Nodes` helpers (singular for one node, plural for an array), matching Lexical's own naming convention. Test helpers follow the same pattern.
- When a named type alias exists for a union (e.g., `SomeVerseNode` for `VerseNode | ImmutableVerseNode`), use the alias rather than re-spelling the union inline. Aliases live alongside their `$is*` guards.
- Don't call `editor.update(...)` from inside a listener (event handler, update listener, etc.) — nested updates risk infinite cascade loops. Lexical's command system (`editor.registerCommand`) is the canonical entry point for mutating state in response to user interactions.
- Order `<*Plugin />` children in `packages/platform/src/editor/Editor.tsx` alphabetically by component name. The alphabetical block starts partway through — initial plugins in the setup section (`OnSelectionChangePlugin`, `DeltaOnChangePlugin`, `ActiveTextPlugin`, …) intentionally precede it.
- To find text or marker nodes in a Lexical tree, use `$getRoot().getAllTextNodes()` (`MarkerNode` extends `TextNode`, so markers are included) — the pattern the marker tests already use. For a whole-tree walk that must include element nodes (e.g. `NoteNode`, which extends `ElementNode`), use `$dfs()` from `@lexical/utils`, or `$isElementNode(node)` to type-narrow before `node.getChildren()`. Never duck-type with `typeof node.getChildren === "function"` / `as unknown as { getChildren?: ... }`. To find "the node the caret is in", read the selection's `focus` point (the live cursor end — correct even for a backward range selection), not its `anchor`.
- Type Lexical values by their real exported types (`LexicalEditor`, `TextNode`, …) instead of reinventing ad-hoc structural types (e.g. `{ getEditorState: () => { read: ... } }`) that capture only the shape you happen to touch.
- In tests that render the black-box `platform` `<Editor>`, get its `LexicalEditor` by passing Lexical's `<EditorRefPlugin editorRef={ref} />` as a child (`<Editor>` renders `children` inside its composer) and reading `ref.current` after the render flushes — do NOT reach for `.__lexicalEditor` off the `.editor-input` DOM node. Where the child-plugin handle isn't available — tests that deliberately go end-to-end through the public `<Editorial>` wrapper (it strips `children`), or scribe's `<Editor>` (no children slot) — fall back to a `.__lexicalEditor` reach-in confined to a single `getEmbeddedLexicalEditor` helper that documents why the child-plugin route wasn't used. Tests that own their composer should instead use `baseTestEnvironment`, which captures the editor via composer context.
- Keep issue-tracker references out of code and comments: no Jira IDs (e.g. `PT-4187`), internal task/QA labels (`Task 8`), or spec section numbers (`§5.5`). Code must stand on its own — those belong in PR descriptions and commit messages. When a comment needs a term of art (e.g. "yank" for a programmatic caret move), define it inline at first use.

# Context 7 Library Documentation

The Context 7 MCP server is available for looking up library documentation and code examples. **No API key is required.**

## Using Context 7 to look up library documentation

When you need documentation for a library or package:

1. Use `mcp_context7_resolve-library-id` to find the library ID:

   ```
   mcp_context7_resolve-library-id with libraryName="Library Name"
   ```

   This will return matching libraries with their Context7-compatible IDs (format: `/org/project`), descriptions, code snippet counts, and trust scores.

2. Once you have the library ID, use `mcp_context7_get-library-docs` to fetch documentation:
   ```
   mcp_context7_get-library-docs with context7CompatibleLibraryID="/org/project"
   ```
   You can also specify a `topic` parameter to focus on specific aspects (e.g., "hooks", "routing", "components").

## Example: Looking up Lexical documentation

- Resolve: Find Lexical → returns `/facebook/lexical` (official, trust score 9.2)
- Fetch: Get docs for `/facebook/lexical` → Returns 661 lines of documentation with code examples for editor creation, React setup, state management, etc.
