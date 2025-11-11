# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Prerequisites

- Install [Volta](https://docs.volta.sh/guide/getting-started) for Node.js/PNPM version management
- Install Nx globally: `npm i -g nx`
- Install dependencies: `pnpm install`

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

- **Lexical**: Facebook's extensible text editor framework (v0.33.1)
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

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

# Code Style

- Prefer `undefined` over `null` for absent values unless working with an API that mandates `null`.

# CI Error Guidelines

If the user wants help with fixing an error in their CI pipeline, use the following flow:

- Retrieve the list of current CI Pipeline Executions (CIPEs) using the `nx_cloud_cipe_details` tool
- If there are any errors, use the `nx_cloud_fix_cipe_failure` tool to retrieve the logs for a specific task
- Use the task logs to see what's wrong and help the user fix their problem. Use the appropriate tools if necessary
- Make sure that the problem is fixed by running the task that you passed into the `nx_cloud_fix_cipe_failure` tool

<!-- nx configuration end-->
