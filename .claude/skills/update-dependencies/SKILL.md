---
name: update-dependencies
description: Run a dependency security sweep in this monorepo. USE WHEN the user wants to update dependencies, handle the open dependabot PRs, clear pnpm audit findings, or do a security pass before a release.
---

# Update Dependencies

Read [`docs/dependency-updates.md`](../../../docs/dependency-updates.md) now and follow its
**Procedure** section exactly, creating a todo per step. That doc is the single source of truth —
this file deliberately does not repeat it. Don't improvise a shortcut; the steps encode two failures
that have already happened in this repo.

## Before you start

Two things to get right, both explained in full in the doc:

- **Every dependabot PR here is a security fix**, not a routine bump. The titles don't say so.
- **A version bump does not necessarily close the advisory.** pnpm won't re-resolve a transitive dep
  whose locked version still satisfies its parent's range. Never report a bump as a fix without
  re-running `pnpm audit` and confirming that specific finding is gone.

## Reporting

Give the user:

- before/after `pnpm audit` counts,
- the version taken per package versus what dependabot proposed,
- any advisory still open, and why.

Report the real output of the verify step — a lockfile change can break things no unit test covers.
And if an advisory could not be cleared, say so outright rather than letting a passing build imply
otherwise: CI does not run `pnpm audit`, so green checks are not evidence here.
