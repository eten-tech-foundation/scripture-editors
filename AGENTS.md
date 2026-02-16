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
- Prefer chaining Lexical `append` calls inside the final `$getRoot().append(...)` when setting up document structure in tests so the hierarchy is readable at a glance.

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
