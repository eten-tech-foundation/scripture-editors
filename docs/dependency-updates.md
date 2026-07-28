# Dependency Updates

## Every dependabot PR here is a security fix

`.github/dependabot.yml` sets `open-pull-requests-limit: 0`, which disables version-update PRs while
leaving security updates enabled. So this repo never receives a routine bump from dependabot — if a
dependabot PR is open, an advisory is behind it.

This matters because the titles don't say so. A PR reading `build(deps-dev): bump @babel/core from
7.29.0 to 7.29.6` looks like housekeeping and is easy to leave sitting — two such PRs, opened in June
2026, were still unmerged five weeks later.

## When to run a sweep

Before a release, or periodically. There is deliberately no scheduled audit job and CI does not run
`pnpm audit` (see [CI does not audit](#ci-does-not-audit) below), so this is a manual, intentional
activity rather than something that nags.

## Why we don't just merge the dependabot PRs

1. **Dependabot resolves pnpm monorepo trees poorly.** This is the original reason for handling them
   by hand.
2. **Its proposed version goes stale.** In the July 2026 sweep, three of four PRs were behind the
   latest patch in their own major by the time anyone looked.
3. **Its green checks go stale too.** An older PR ran CI against a much older `main`.
4. **A dependabot bump often doesn't actually close the advisory.** This is the important one.

## The trap: bumping a parent doesn't lift its locked transitive deps

Worked example from the July 2026 sweep. Dependabot proposed axios `1.16.1` → `1.18.0` in
`tools/usfm-markers`; we took `1.18.1`, the latest in that major. Either version fixes the axios
advisories. But a _separate_, higher-severity finding —
[GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx), CRLF injection in
form-data, CVSS 8.7 — is reached through `tools__usfm-markers>axios>form-data`, and bumping axios
left it wide open.

The reason: axios 1.18.1 still declares `form-data: ^4.0.5`, and the already-locked 4.0.5 continues
to satisfy that range. **pnpm only re-resolves a transitive dep when the locked version stops
satisfying its parent's range.** A newer parent with an unchanged range changes nothing downstream.

Clearing it took an explicit override:

```yaml
form-data@>=4.0.0 <4.0.6: ">=4.0.6 <5"
```

This is why the `overrides:` list in `pnpm-workspace.yaml` is long: most entries pin a transitive
dependency that no parent bump would have reached. A few are different — `axios@<1.15.2` guards a
_direct_ dependency, acting as a version floor rather than reaching past a parent. PR #477 added four
entries in one pass, of both kinds.

**The practical rule: never infer that a security bump worked. Re-run `pnpm audit` and confirm the
specific advisory is gone.**

## The same trap applies to overrides themselves

The mechanism above is not special to parent ranges. It applies just as much to an override you
already wrote, and this is the part that most often wastes a cycle.

**An override key is matched against the range a parent _declares_, not against the version that is
installed.** `pnpm audit` reports resolved versions, so the version it prints is usually the wrong
thing to key on.

Worked example, live in this repo. `@svgr/plugin-svgo@8.1.0` declares `svgo: ^3.0.2`, but the
installed svgo is **4.0.1**. What did that? The override:

```yaml
svgo@>=3.0.0 <3.3.3: ">=3.3.3"
```

The key `>=3.0.0 <3.3.3` does not contain 4.0.1. It does overlap the declared `^3.0.2`, which is what
it actually matched. Then the uncapped value `">=3.3.3"` resolved to the newest svgo in existence and
walked the package across a major boundary, under a plugin that asked for `^3.0.2`. Nobody reviewed
that; it just happened.

Two consequences worth remembering:

- **Adding a second override keyed on the version `pnpm audit` printed usually does nothing.** If the
  package already has an entry, that entry is the one in play. Raise its value; don't add a sibling.
- **An uncapped value silently absorbs every future advisory in that package.** The locked vulnerable
  version keeps satisfying `">=3.3.3"` forever, so nothing re-resolves — the override looks like
  protection while the vulnerable copy sits underneath it. This is why capping is not tidiness.

## Two modes

**Full sweep** — clear everything you reasonably can. Baseline and target are whole-repo counts.

**Scoped run** — close the advisories behind one or more named PRs and _nothing else_. The
deliverable is not a lower audit total; it is a specific set of GHSA IDs disappearing with no other
change to the advisory set.

Everything below applies to both. Steps marked _(scoped)_ differ.

## Procedure

1. **Baseline.** `pnpm audit --json > tmp/audit-before.json` (`tmp/` is gitignored), and note the
   counts from plain `pnpm audit`. Keep the JSON — the GHSA ID list is what you diff at step 7.

   One audit run yields three different numbers and they all disagree: the banner total (30), the
   number of records in the JSON `advisories` map (28), and the count of unique GHSA IDs (26,
   because two js-yaml advisories each span two disjoint majors). **Quote the unique-ID count and
   diff the ID set.** Counts alone are a poor instrument anyway: 30 → 28 is equally consistent with
   "fixed the two targets", "fixed two unrelated things", and "fixed three and introduced one".

2. **List the work.** `gh pr list --author app/dependabot --json number,title`
3. **Identify the advisory behind each PR.** The title won't tell you — it names a version, not a
   CVE. Use:

   ```bash
   gh api repos/{owner}/{repo}/dependabot/alerts --paginate \
     -q '.[] | select(.state=="open") | [.security_advisory.ghsa_id, .security_advisory.severity,
         .dependency.package.name, .security_vulnerability.vulnerable_version_range,
         .security_vulnerability.first_patched_version.identifier] | @tsv'
   ```

   This query is for attributing a PR to an advisory. **It is not the work list for a full sweep** —
   it returned 23 alerts while `pnpm audit` found 28 records, missing five entirely. For a full
   sweep, `pnpm audit` is authoritative.

   The dependabot branch name encodes the version that _originally_ patched the advisory
   (`dependabot/npm_and_yarn/babel/core-7.29.6`), which is often not what a rebased PR now proposes.
   **A rebased PR can drift across a major.** #487's branch says 7.29.6; the PR today proposes
   8.0.0. When that happens the security fix lives in the previous major and you want an override,
   not the PR.

   Then find where the vulnerable copy actually lives — `pnpm audit` prints the path. **It is
   frequently not the manifest the PR edits.** #487 proposed bumping the root `@babel/core`, which
   was already patched; the vulnerable copy was `demos__perf-react>epitelete-html>@babel/core@7.28.3`
   and the PR would not have touched it.

4. **Find the real target version.** For each package, `npm view <pkg> versions --json` and take the
   latest within the _current_ major. Don't cross a major boundary as part of a security sweep —
   that's separate work with a separate risk profile. For `0.x` packages, treat the **minor** as the
   major: `adm-zip 0.5 → 0.6` is materially a breaking bump.
5. **Check the PR's own lockfile diff before trusting it.** `gh pr diff <N>` and confirm it actually
   removes the vulnerable version. A bump that leaves the vulnerable resolution in the lockfile does
   not close the advisory, however green its checks are.
6. **Edit the manifests by hand**, then `pnpm install`.
7. **Re-audit and compare.** Diff the advisory-ID set against your baseline. For every advisory **in
   scope** that didn't clear, add an override (see below), `pnpm install`, and repeat.

   If the package already has an override entry, **raise that entry's value** rather than adding a
   second one keyed on the version `pnpm audit` printed — see
   [the trap applies to overrides too](#the-same-trap-applies-to-overrides-themselves). Getting this
   wrong costs a full install cycle and looks like the override simply didn't work.

   A single advisory can need **both** a manifest bump and an override. GHSA-g7r4-m6w7-qqqr needed
   the override to move the shared `esbuild` node, _and_ a `tsx` bump, because tsx declared
   `esbuild: ~0.27.0` and the override would otherwise have forced a version outside its declared
   range. Check whether an override you're about to write contradicts a manifest you control.

   _(scoped)_ Exit condition: your target IDs are gone and every other ID is unchanged — a non-zero
   total is not a failure.

8. **Verify.** `pnpm nx run-many -t build test lint typecheck --skip-nx-cache`, then
   `pnpm nx format:check` — CI runs formatting too, and the pre-commit hook rewrites the files you
   just hand-edited.

   **Expect 10–15 minutes, and expect total silence.** `--skip-nx-cache` defeats the cache by design
   and nx buffers all output until the run finishes, so an empty log is normal, not a hang. Two
   separate agents have abandoned this step believing it had crashed. If you want an early signal,
   run `lint` and `typecheck` first — they're fast and fail loudly.

9. **Commit as one batch**, and record in the commit message which advisories were closed and which
   overrides were needed.
10. **Let dependabot close its own PRs.** Closing one by hand only asserts you handled it; letting
    dependabot close it confirms the fix really is in the base branch. Most self-close within a
    couple of minutes of `main` reaching or exceeding the version they propose.

    Two cases where that never happens on its own:
    - **You fixed it with an override.** The manifest version never moves, so dependabot's condition
      is never met and the PR sits open forever. Since overrides are the usual fix here, this is the
      common case, not the exception.
    - **The PR is older than 30 days.** Dependabot disables automatic rebases at that point — the
      body will say _"Automatic rebases have been disabled on this pull request as it has been open
      for over 30 days"_ — and stops re-evaluating it.

    For both, comment `@dependabot rebase`. It re-resolves against the base branch, sees the fixed
    version, and closes the PR itself.

    **Do this only after your commit is on `main`.** Dependabot re-resolves against the base branch,
    not against your branch, so commenting earlier accomplishes nothing. This is also the only step
    that needs GitHub write access — a read-only reviewer, or an agent told not to touch PRs, should
    stop at step 9.

## Writing overrides

Overrides live in the `overrides:` block of `pnpm-workspace.yaml` — **not** in a `pnpm.overrides`
field in `package.json`.

There are three things you can do to this list, and repeat sweeps mostly do the third:

- **Add** an entry for a package that has none.
- **Remove** one that's no longer doing anything — see
  [Removing stale overrides](#removing-stale-overrides).
- **Move an existing floor.** The package already has an entry, aimed at an older boundary, and a
  new advisory needs a higher one. Edit that entry in place; do not add a second. Half of a typical
  sweep is this, and getting it wrong is the failure described in
  [the trap applies to overrides too](#the-same-trap-applies-to-overrides-themselves).

Rules for the values themselves:

- **Prefer the range form** — it's what most of the file uses:
  `form-data@>=4.0.0 <4.0.6: ">=4.0.6 <5"`.
- **Cap the value at the next major.** `undici@>=7.0.0 <7.24.0: ">=7.24.0"` once resolved to undici
  8.1.0 and broke the entire test suite, because jsdom 28 uses undici 7 internals that v8 removed.
  The fix was `">=7.24.0 <8"`.

  Cap at the major, **not** the minor. These overrides are security _floors_, and a minor cap turns
  one into a ceiling that blocks the next fix — if form-data 4.1.2 patches a fresh CVE, `<4.1` locks
  you out of it and you have to hand-edit the override to get it. Majors are where API breakage is
  supposed to live, which is the only thing the cap needs to defend against. Tighten an individual
  entry below that only when a specific package has actually burned you on a minor.

  An uncapped value has already done damage here, not just risked it: `svgo@>=3.0.0 <3.3.3:
">=3.3.3"` walked svgo from 3.x to 4.0.1 under a plugin declaring `^3.0.2`. It went unnoticed
  because nothing in this repo executes svgo.

- **Use the parent→child form as a fallback** (`cosmiconfig>yaml: "2.8.3"`) when a range override
  doesn't clear the lockfile. Find the parent from the audit path — it's the entry immediately above
  the vulnerable package. Check the forced version is API-compatible with _every_ version of that
  parent in the tree before doing this.
- **Don't use exact-version overrides** (`brace-expansion@5.0.4: "5.0.5"`). They create a redirect
  while leaving the vulnerable package definition in the lockfile, where `pnpm audit` still finds it.
- **`pnpm audit --fix` writes uncapped values**, which is why most existing entries have no upper
  bound. Treat its output as a first draft and add the cap by hand. It also appends one entry per
  advisory, so it can leave two overlapping ranges for the same package where one already subsumes
  the other — rationalize those at the same time.

## Removing stale overrides

Check which versions of the package are actually installed in `pnpm-lock.yaml`. If none fall in the
vulnerable range, the override is dead weight and can go.

One exception: if the installed version sits exactly at the safe boundary, the override may be the
thing holding it there. Remove it, reinstall, and confirm before assuming it was redundant.

The lockfile isn't proof on its own — it records what you have now, not what a fresh resolve would
pick. After removing any override, run `pnpm install` and then `pnpm audit`, and check the advisory
hasn't come back. Removing an override is the same class of change as adding one, and gets the same
gate.

## CI does not audit

`.github/workflows/test-publish.yml` runs formatting, lint, typecheck, test and build. It does not
run `pnpm audit`, and neither does the pre-commit hook or any npm script. **A green CI run says
nothing about vulnerabilities.** In the July 2026 sweep, all four dependabot PRs were green while a
CVSS 8.7 finding was open.

The re-audit at step 7 is therefore the only gate that exists. Don't skip it.
