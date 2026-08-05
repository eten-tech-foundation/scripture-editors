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

Worked example from this repo, since fixed in #522. `@svgr/plugin-svgo@8.1.0` declares
`svgo: ^3.0.2`, yet the installed svgo was **4.0.1**. What did that? The override:

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
- **An uncapped value stops protecting you the moment the next advisory lands.** `pnpm audit` will
  still report it — the override doesn't hide anything, since audit reads resolved versions from the
  lockfile and never consults override ranges. What's missing is the automatic fix: the locked
  version keeps satisfying `">=3.3.3"`, so `pnpm install` has no reason to re-resolve, and the
  advisory sits there until someone runs a manual sweep. Given nothing in CI runs `pnpm audit`, "sits
  there until someone looks" can be a long time. That's why capping isn't tidiness.

## Two modes

**Full sweep** — clear everything you reasonably can. Baseline and target are whole-repo counts.

**Scoped run** — close the advisories behind one or more named PRs and _nothing else_. The
deliverable is not a lower audit total; it is a specific set of GHSA IDs disappearing with no other
change to the advisory set.

Everything below applies to both. Steps marked _(scoped)_ differ.

## Procedure

1. **Baseline.** Capture the advisory-ID set, not a count:

   ```bash
   pnpm audit --json > tmp/audit-before.json   # tmp/ is gitignored
   node -e "var a=require('./tmp/audit-before.json').advisories; for (var k in a) console.log(a[k].github_advisory_id)" | sort -u > tmp/ids-before.txt
   ```

   `.advisories` is keyed by pnpm's own numeric IDs, so the command reads each entry's
   `github_advisory_id` field rather than the keys.

   **Don't rely on counts.** One audit run yields three numbers that all disagree — at the time of
   writing, a banner total of 38, 36 records in the JSON `advisories` map, and 34 unique GHSA IDs
   (some advisories span two disjoint majors and appear twice). Worse, the totals drift on their own
   as advisories are published: the same unchanged lockfile measured 30 one day and 39 a few days
   later. A falling number is not evidence you fixed anything, and a steady one is not evidence you
   didn't break something.

2. **List the work.** `gh pr list --author app/dependabot --json number,title`
3. **Identify the advisory behind each PR.** The title won't tell you — it names a version, not a
   CVE. Use:

   ```bash
   gh api repos/eten-tech-foundation/scripture-editors/dependabot/alerts --paginate \
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

   Diff the ID set rather than eyeballing the banner:

   ```bash
   pnpm audit --json > tmp/audit-after.json
   node -e "var a=require('./tmp/audit-after.json').advisories; for (var k in a) console.log(a[k].github_advisory_id)" | sort -u > tmp/ids-after.txt
   diff tmp/ids-before.txt tmp/ids-after.txt
   ```

   Lines prefixed `<` are advisories you closed; `>` are advisories that appeared. Anything in the
   second group you didn't intend is a regression, or an advisory published while you worked.

   _(scoped)_ Exit condition: your target IDs are gone and every other ID is unchanged — a non-zero
   total is not a failure.

8. **Verify.** `pnpm nx run-many -t build test lint typecheck --skip-nx-cache`

   Don't hand-format and don't add a formatting step — the pre-commit hook runs prettier over your
   staged files and that is the gate. It will reformat `pnpm-workspace.yaml`; `pnpm-lock.yaml` is in
   `.prettierignore`, so it's left exactly as pnpm wrote it.

   **Expect 10–15 minutes, and expect total silence.** `--skip-nx-cache` defeats the cache by design
   and nx buffers all output until the run finishes, so an empty log is normal, not a hang. Two
   separate agents have abandoned this step believing it had crashed. If you want an early signal,
   run `lint` and `typecheck` first — they're fast and fail loudly.

9. **Commit as one batch**, and record in the commit message which advisories were closed and which
   overrides were needed.
10. **Once your commit is on `main`, comment `@dependabot rebase` on each PR** you addressed.
    Dependabot re-resolves against the base branch, sees the fix already in place, and closes the PR
    itself. Don't close them by hand: closing one only asserts you handled it, whereas letting
    dependabot close it confirms the fix really is in the base branch.

    Auto-close does sometimes happen without prompting — #507 and #504 closed about two minutes after
    their fix merged — but treat that as the lucky case rather than the expectation. Dependabot polls
    on a schedule rather than reacting to events, and there are two situations where it will never
    close a PR on its own:
    - **You fixed it with an override.** The manifest version never moves, so dependabot's condition
      is never met and the PR sits open indefinitely. Since overrides are the usual fix here, this is
      the common case, not the exception.
    - **The PR is older than 30 days.** Dependabot disables automatic rebases at that point — the
      body will say _"Automatic rebases have been disabled on this pull request as it has been open
      for over 30 days"_ — and stops re-evaluating it.

    Timing matters: commenting before your commit is on `main` accomplishes nothing, because
    dependabot resolves against the base branch and not against yours. This is also the only step
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

  Uncapped values had already done damage here, not merely risked it. #522 found four overrides that
  had silently walked their package across a major — `svgo` 3.x → 4.0.1, `path-to-regexp` 0.1.x →
  8.4.2, `picomatch` 2.x → 4.0.4, `brace-expansion` 1.x/2.x → 5.0.5 — and capped every entry in the
  file. Keep it that way.

- **Use the parent→child form as a fallback** (`cosmiconfig>yaml: "2.8.3"`) when a range override
  doesn't clear the lockfile. Find the parent from the audit path — it's the entry immediately above
  the vulnerable package. Check the forced version is API-compatible with _every_ version of that
  parent in the tree before doing this.
- **Don't use exact-version overrides** (`brace-expansion@5.0.4: "5.0.5"`). They create a redirect
  while leaving the vulnerable package definition in the lockfile, where `pnpm audit` still finds it.
- **`pnpm audit --fix` writes uncapped values — always cap what it generates.** Verified on pnpm
  10.31.0: every entry it wrote was a bare `>=X.Y.Z` (`adm-zip@<0.6.0: '>=0.6.0'`,
  `undici@>=7.0.0 <7.29.0: '>=7.29.0'`, …), with no upper bound anywhere. It also appends one entry
  per advisory rather than editing the existing one, so a single run left four overlapping
  `brace-expansion` entries, three `fast-uri` and four `js-yaml` — rationalize those at the same
  time. Handily, it quotes its own additions with single quotes and leaves hand-written entries in
  double quotes, so you can see what it touched.

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
