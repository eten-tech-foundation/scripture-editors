# `platform-yalc` branch

This branch is a long-lived branch that is the target of Platform.Bible's build workflows. It is rebased onto `main` when appropriate. It is intended only to reflect `main` at various points with one commit on top that adds this message; please do not do anything to this branch other than to rebase it onto `main` when changes need to be reflected in Platform.Bible's editor.

We build the editor into Platform.Bible from this branch instead of from specific npm releases to avoid the overhead of making releases for every little change we need to make to the editor.

The only reason this branch exists as opposed to building the editor from `main` is to make it easier to sync breaking changes here with changes in Platform.Bible that depend on these changes to avoid breaking the Platform.Bible build with breaking changes there that have not yet had changes reflected in Platform.Bible. When you want to make changes in the editor, do the following:

1. Locally develop the editor on a branch from `main`. Locally develop Platform.Bible on a branch as usual.
2. Submit a PR here. Submit a PR in Platform.Bible. Get these PRs reviewed. Note: if there are breaking changes in the editor, Platform.Bible likely won't successfully build yet.
3. Merge the PR here.
4. Rebase `platform-yalc` onto `main` and force push:

```bash
git fetch origin
git checkout platform-yalc
git rebase origin/main
git push --force-with-lease
```

5. Get the PR in Platform.Bible to rebuild (push something). The build should now succeed. Unfortunately, builds not on your branch may fail temporarily until you finish the next step.
6. Once the build has succeeded, merge the PR.

# Scripture Editors

This monorepo contains packages for various Scripture editors.

Each Scripture application's editor will have many behaviors in common with other Scripture applications. Each will need some features that are unique. We are developing all of these parts in a compatible way and in one place in order to maximize collaboration and sharing.

In this monorepo:

- Each application produces their own editor package - the application uses the package produced from this repo because the source is there.
- Common nodes, plugins, and formatters for the toolbar plugin.
- Specific sets of nodes, plugins, and formatters for each data type extending from the common items where applicable.

Sharing in this monorepo is a commitment to maintain and organize it. Each application package is free to move in its own direction but keeping in mind items that can be pushed up outside the specific editor package to be used in common.

## Developer Quick Start

1. Install [Volta](https://docs.volta.sh/guide/getting-started).
2. Clone the monorepo:
   ```bash
   git clone https://github.com/eten-tech-foundation/scripture-editors.git
   cd scripture-editors
   pnpm install
   ```
3. Install [Nx](https://nx.dev/) globally (note we intentionally use `npm` rather than `pnpm` for global installs, see [JavaScript Tool Manager](#javascript-tool-manager)):
   ```bash
   npm i -g nx
   ```
4. Run one of the top level developer environments (see the **Nx Graph** below), e.g.:
   ```bash
   nx dev perf-react
   ```

## JavaScript Tool Manager

You can use [Volta](https://volta.sh/) with this repo to use the right version of tools such as Node.js and PNPM.

If you don't use Volta just look at the `volta` property in [package.json](/package.json) to see the right tool versions to install in your preferred way.

NOTE: there is a [known limitation using PNPM with Volta](https://docs.volta.sh/advanced/pnpm). So set your environment variable `VOLTA_FEATURE_PNPM` to 1. Also to install packages globally, use NPM instead of PNPM (only for global installs). For an example, see step 2 of [Developer Quick Start](#developer-quick-start).

## Nx Monorepo Build System

| Source                              | Demo App               |
| ----------------------------------- | ---------------------- |
| [perf-vanilla](/demos/perf-vanilla) | `nx dev perf-vanilla`  |
| [perf-react](/demos/perf-react)     | `nx dev perf-react`    |
| [platform](/demos/platform)         | `nx dev platform`      |
| [scribe-editor](/packages/scribe)\* | `nx dev scribe-editor` |

\* This item appears in 2 lists as it has both the Demo App and Package in the same source folder.

| Source                                | Package                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| [platform-editor](/packages/platform) | [![Github Tag][npm-platform-version-image]][npm-platform-version-url]   |
| [scribe-editor](/packages/scribe)     | [![Github Tag][npm-scribe-version-image]][npm-scribe-version-url]\*     |
| [utilities](/packages/utilities)      | [![Github Tag][npm-utilities-version-image]][npm-utilities-version-url] |

\* This package has not yet been published to the new NPM organization. The previous version of `scribe-editor` is here [![Github Tag][npm-bnf-scribe-version-image]][npm-bnf-scribe-version-url].

| Source                             | Library                |
| ---------------------------------- | ---------------------- |
| [shared-react](/libs/shared-react) | internal non-published |
| [shared](/libs/shared)             | internal non-published |
| [test-data](/libs/test-data)       | internal non-published |

```mermaid
---
title: Nx Graph
---
graph TB
  V(perf-vanilla) --> T(test-data)
  V --> S(shared)
  S --> T
  S --> U(utilities)
  R(perf-react) --> T
  R --> S
  R --> SR(shared-react)
  SR --> S
  SR --> U
  SB(scribe-editor) --> SR
  SB --> S
  SB --> U
  P(platform) --> PE(platform-editor)
  P --> T
  P --> U
  PE --> SR
  PE --> S
  PE --> U
```

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ **This workspace has been generated by [Nx, a Smart, fast and extensible build system.](https://nx.dev)** ✨

### Nx Installed Globally?

If you haven't installed Nx globally (as recommended in step 2 of [Developer Quick Start](#developer-quick-start)), then just prefix each call to `nx` with `pnpm`, e.g. `pnpm nx build perf-react`.

### Running tasks

To execute tasks with Nx use the following syntax:

```bash
nx <target> <project> <...options>
# e.g.
nx build perf-react
```

You can also run multiple targets:

```bash
nx run-many -t <target1> <target2>
```

..or add `-p` to filter specific projects

```bash
nx run-many -t <target1> <target2> -p <proj1> <proj2>
```

Targets can be defined in the `package.json` or `projects.json`. Learn more [in the docs](https://nx.dev/core-features/run-tasks).

### Generate code

If you happen to use Nx plugins, you can leverage code generators that might come with it.

Run `nx list` to get a list of available plugins and whether they have generators. Then run `nx list <plugin-name>` to see what generators are available.

Learn more about [Nx generators on the docs](https://nx.dev/plugin-features/use-code-generators).

### Want better Editor Integration?

Have a look at the [Nx Console extensions](https://nx.dev/nx-console). It provides autocomplete support, a UI for exploring and running tasks & generators, and more! Available for VSCode, IntelliJ and comes with a LSP for Vim users.

### Ready to deploy?

Just run `nx build perf-react` to build that application. The build artifacts will be stored in the `dist/` directory, ready to be deployed.

### Set up CI!

Nx comes with local caching already built-in (check your `nx.json`). On CI you might want to go a step further.

- [Set up remote caching](https://nx.dev/core-features/share-your-cache)
- [Set up task distribution across multiple machines](https://nx.dev/core-features/distribute-task-execution)
- [Learn more how to setup CI](https://nx.dev/recipes/ci)

### Connect with us!

- [Join the community](https://nx.dev/community)
- [Subscribe to the Nx Youtube Channel](https://www.youtube.com/@nxdevtools)
- [Follow us on Twitter](https://twitter.com/nxdevtools)

## Testing

The unit tests run automatically on each GitHub PR (see [test.yml](/.github/workflows/test.yml)).

To run all TS unit tests:

```bash
nx run-many -t test
```

To run all TS unit tests for a single package (in this example the **shared** package):

```bash
nx test shared
```

To run all TS unit tests watching for file changes:

- On Windows:
  ```bash
  nx watch --all -- nx test %NX_PROJECT_NAME%
  ```
- On Linux or macOS:
  ```bash
  nx watch --all -- nx test \$NX_PROJECT_NAME
  ```

You can also use the [recommended VS Code extensions](/.vscode/extensions.json) to run tests there. This is particularly useful for running individual tests and debugging.

## Formatting, Linting and Typechecking

Formatting happens automatically when you commit. If you use VS Code with this repo's recommended extensions, files will be formatted when you save.

To check TypeScript for readability, maintainability, and functionality errors, and to check a few other files for proper formatting, run the following from the repo root (or just use VS Code with this repo's recommended extensions).

```bash
nx format:check # to check formatting
nx format:write # to fix formatting
nx run-many -t lint # to check linting
nx run-many -t typecheck # to check types
```

## Collaborative Web Development Environment

Thanks to [CodeSandbox](https://codesandbox.io/) for the instant dev environment: https://codesandbox.io/p/github/eten-tech-foundation/scripture-editors/main

## Plain Vanilla JS and React

Lexical works with plain-vanilla JS/TS as well as with React. To that end, the editor packages in this repo `perf-react` and `perf-vanilla` are 2 editor components that behave the same to edit the [PERF](https://github.com/Proskomma/proskomma-json-tools/blob/main/doc/schema/perf.html) data format.

If you are using a framework other than React and need to wrap a plain-vanilla JS editor for your framework, you could add your own vanilla TS editor package to this repo. By comparing `perf-vanilla` and `perf-react` you can see how to take any existing React plugins you might want and convert them to vanilla TS.

## License

[MIT][github-license] © [ETEN Tech Foundation](https://missionmutual.org)

<!-- define variables used above -->

[npm-platform-version-image]: https://img.shields.io/npm/v/@eten-tech-foundation/platform-editor
[npm-platform-version-url]: https://www.npmjs.com/package/@eten-tech-foundation/platform-editor
[npm-scribe-version-image]: https://img.shields.io/npm/v/@eten-tech-foundation/scribe-editor
[npm-scribe-version-url]: https://www.npmjs.com/package/@eten-tech-foundation/scribe-editor
[npm-bnf-scribe-version-image]: https://img.shields.io/npm/v/@biblionexus-foundation/scribe-editor
[npm-bnf-scribe-version-url]: https://www.npmjs.com/package/@biblionexus-foundation/scribe-editor
[npm-utilities-version-image]: https://img.shields.io/npm/v/@eten-tech-foundation/scripture-utilities
[npm-utilities-version-url]: https://www.npmjs.com/package/@eten-tech-foundation/scripture-utilities
[github-license]: https://github.com/eten-tech-foundation/scripture-editors/blob/main/LICENSE
