<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

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
