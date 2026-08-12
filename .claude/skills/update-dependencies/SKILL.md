---
name: update-dependencies
description: Run a dependency security sweep in this monorepo. USE WHEN the user wants to update dependencies, handle the open dependabot PRs, clear pnpm audit findings, or do a security pass before a release.
---

# Update Dependencies

Read [`docs/dependency-updates.md`](../../../docs/dependency-updates.md) now and follow its
**Procedure** section exactly, creating a todo per step. That doc is the single source of truth —
this file deliberately does not repeat it. Don't improvise a shortcut; the steps encode four
failures that have already happened in this repo.

## Before you start

Three things to get right, all explained in full in the doc:

- **Every dependabot PR here is a security fix**, not a routine bump. The titles don't say so.
- **A version bump does not necessarily close the advisory.** pnpm won't re-resolve a transitive dep
  whose locked version still satisfies its parent's range. Never report a bump as a fix without
  re-running `pnpm audit` and confirming that specific finding is gone.
- **An override can close an advisory and still break the package.** Cap it at the major its
  _consumer_ declares, not merely at some major. Getting this wrong has broken this repo twice, and
  both times every build, test, lint and typecheck stayed green.

## Reporting

Give the user:

- the **advisory-ID set diff** — which IDs closed and which appeared. Not counts: one audit run
  reports three numbers that disagree, and they drift on their own as advisories are published,
- the version taken per package versus what dependabot proposed,
- any advisory still open, and why.

Report the real output of the verify step — a lockfile change can break things no unit test covers.
And if an advisory could not be cleared, say so outright rather than letting a passing build imply
otherwise: CI does not run `pnpm audit`, so green checks are not evidence here. The same caution
applies in reverse to overrides that moved a package across a major: a clean `pnpm audit` is not
evidence the package still works.
